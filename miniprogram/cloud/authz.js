/* ============================================================
   罗森塔尔 Rosenthal · cloud/authz.js
   云数据库安全规则 —— 纯 JS 参考实现。

   为什么要有这个文件：
   云开发的安全规则写在控制台 / `database.rules.json` 里，**本机没有云环境就测不了**。
   但规则的正确性恰恰是本项目最不能出错的地方（家长不能删记录、流水禁止改、
   私密记录不能外泄）。所以把同一套判断写成纯函数：可以在 Node 里穷举角色 × 动作 ×
   记录归属的组合来验证，将来在控制台把规则配好后，再用真机做一次对拍即可。

   约定：本文件里的 GUARDS 是**唯一事实来源**，`cloud/database.rules.json` 是它在
   云开发安全规则语法下的等价写法。两者不一致就是 bug，有断言逐条对拍（见 _smoke_s1.js）。

   动作：read / create / update / delete
   主体：{ uid, role: 'child'|'parent'|'member', family_id }
   文档：{ _id?, user_id?, family_id?, ...字段 }
   ============================================================ */
'use strict';

const { COLLECTIONS } = require('./schema.js');

const ok = () => ({ allow: true });
const no = reason => ({ allow: false, reason: reason });

const isSelf = (actor, doc) => !!doc && doc.user_id === actor.uid;
const sameFamily = (actor, doc) => !!doc && !!doc.family_id && doc.family_id === actor.family_id;
/** 家长端只读「她的正向记录」：私密条目一律不返回 */
const hidePrivate = (actor, doc) => actor.role === 'parent' && doc && doc.is_private === true;

/**
 * 各集合声明的 guard 落地成判断。
 * 每个 guard 返回 null 表示「不适用」，返回 {allow:false} 表示拒绝。
 */
const GUARDS = {
  /* 只有家庭成员能读（家庭字段缺失的集合如 stage_template 不走这条） */
  readOwnFamily: (actor, doc, action) => {
    if (action !== 'read') return null;
    /* 跨家庭必须挡住：两边都带 family_id 时要求相等；
       没带的（stage_template 等全局集合）放行，由 writeNone 之类兜住写权限。 */
    if (doc && doc.family_id && doc.family_id !== actor.family_id) {
      return no('只能读本家庭的记录');
    }
    if (hidePrivate(actor, doc)) return no('家长读不到标为「仅自己可见」的记录');
    return null;
  },

  readAll: (actor, doc, action) => (action === 'read' ? null : null),   // 全局只读靠 writeNone 兜住

  /* 任何写操作都不允许（模板、家庭本身） */
  writeNone: (actor, doc, action) => (action === 'read' ? null : no('该集合不接受客户端写入')),

  /* 只允许孩子本人写（家长改动需走双签，即由孩子再次提交） */
  writeChildOnly: (actor, doc, action) => {
    if (action === 'read') return null;
    if (actor.role === 'child') return null;
    return no('只有孩子本人能改自己的规则，家长需双签');
  },

  /* 只有本人能写 */
  writeSelfOnly: (actor, doc, action) => {
    if (action === 'read') return null;
    return isSelf(actor, doc) ? null : no('只有本人能写自己的记录');
  },

  createSelfOnly: (actor, doc, action) => {
    if (action !== 'create') return null;
    return isSelf(actor, doc) ? null : no('只能为自己创建');
  },

  /* 只有本人能改自己的资料（user），且不能改家庭归属与角色 */
  updateSelf: (actor, doc, action, ctx) => {
    if (action === 'read') return null;
    if (!isSelf(actor, doc)) return no('只能改自己的资料');
    const changed = (ctx && ctx.changedFields) || [];
    const forbidden = changed.filter(f => f === 'family_id' || f === 'role' || f === '_id');
    if (forbidden.length) return no('家庭归属与角色不能自己改：' + forbidden.join('、'));
    return null;
  },

  /* 只有本人能删自己的记录 */
  deleteSelfOnly: (actor, doc, action) => {
    if (action !== 'delete') return null;
    return isSelf(actor, doc) ? null : no('只有本人能删自己的记录');
  },

  /* 谁都不能删（券、流水、规则版本） */
  deleteNone: (actor, doc, action) => (action === 'delete' ? no('该集合禁止删除') : null),

  /* 流水只增不改：update / delete 一律拒绝 */
  appendOnly: (actor, doc, action) => {
    if (action === 'update') return no('流水只增不改（禁止 update）');
    if (action === 'delete') return no('流水只增不改（禁止 delete）');
    return null;
  },

  /* 只加分：所有带分值的写入都要求为正 */
  pointsPositive: (actor, doc, action) => {
    if (action === 'read' || action === 'delete') return null;
    if (doc && doc.points !== undefined && !(doc.points > 0)) return no('分值必须为正（系统里没有扣分）');
    return null;
  },
  deltaPositive: (actor, doc, action) => {
    if (action === 'read' || action === 'delete') return null;
    if (doc && doc.delta !== undefined && !(doc.delta > 0)) return no('流水 delta 必须为正（只加分）');
    return null;
  },
  costPositive: (actor, doc, action) => {
    if (action === 'read' || action === 'delete') return null;
    if (doc && doc.cost !== undefined && !(doc.cost > 0)) return no('奖励分值必须为正');
    return null;
  },
  pointsNonNegative: (actor, doc, action) => {
    if (action === 'read' || action === 'delete') return null;
    if (doc && doc.points_awarded !== undefined && doc.points_awarded < 0) return no('修复行动不产生负分');
    return null;
  },

  /* 家长对兑换只能改 status（不能改分、不能删、不能撤回） */
  parentUpdateStatusOnly: (actor, doc, action, ctx) => {
    if (action !== 'update' || actor.role !== 'parent') return null;
    const changed = (ctx && ctx.changedFields) || [];
    const illegal = changed.filter(f => f !== 'status' && f !== 'provided_at');
    if (illegal.length) return no('家长对兑换只能改 status，不能动：' + illegal.join('、'));
    return null;
  },

  /* 双签：签名时间戳只能由对应角色写一次，且不可被对方代签 */
  signOnce: (actor, doc, action, ctx) => {
    if (action !== 'update') return null;
    const changed = (ctx && ctx.changedFields) || [];
    const childSign = changed.indexOf('signed_by_child_at') >= 0;
    const parentSign = changed.indexOf('signed_by_parent_at') >= 0;
    if (childSign && actor.role !== 'child') return no('只有孩子能签孩子那一栏');
    if (parentSign && actor.role !== 'parent') return no('只有家长能签家长那一栏');
    if (childSign && doc && doc.signed_by_child_at) return no('孩子已经签过这一版了');
    if (parentSign && doc && doc.signed_by_parent_at) return no('家长已经签过这一版了');
    return null;
  },

  /* 规则版本必须有双签时间戳才算生效 */
  effectiveNeedsBothSigns: (actor, doc, action, ctx) => {
    if (action === 'read') return null;
    const merged = Object.assign({}, doc || {}, (ctx && ctx.patch) || {});
    if (merged.effective_at && (!merged.signed_by_child_at || !merged.signed_by_parent_at)) {
      return no('单方修改不能生效：必须孩子与家长都签过');
    }
    return null;
  },
};

/**
 * 判定一次操作是否允许。
 * @param {{uid:string, role:string, family_id:string}} actor
 * @param {string} collection
 * @param {'read'|'create'|'update'|'delete'} action
 * @param {object} doc 目标文档（update/delete 时为现有文档，create 时为待写内容）
 * @param {{changedFields?:string[], patch?:object}} [ctx]
 * @returns {{allow:boolean, reason?:string}}
 */
function can(actor, collection, action, doc, ctx) {
  const def = COLLECTIONS[collection];
  if (!def) return no('未知集合：' + collection);
  if (!actor || !actor.uid) return no('缺少身份');
  if (['read', 'create', 'update', 'delete'].indexOf(action) < 0) return no('未知动作：' + action);

  /* 先跑集合声明里列的 guard，顺序即优先级 */
  for (let i = 0; i < def.guard.length; i++) {
    const g = GUARDS[def.guard[i]];
    if (!g) continue;
    const r = g(actor, doc, action, ctx);
    if (r && r.allow === false) return r;
  }
  return ok();
}

/** 读取时的行过滤：家长端拿不到私密记录（与 store.visibleToParent 同口径） */
function projectForRead(actor, collection, rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  return list.filter(d => can(actor, collection, 'read', d).allow);
}

/** 角色固定的测试主体 */
const asChild = familyId => ({ uid: 'u_child', role: 'child', family_id: familyId || 'fam_1' });
const asParent = familyId => ({ uid: 'u_parent', role: 'parent', family_id: familyId || 'fam_1' });

module.exports = { can, projectForRead, GUARDS, asChild, asParent };
