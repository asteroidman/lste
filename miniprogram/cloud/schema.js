/* ============================================================
   罗森塔尔 Rosenthal · cloud/schema.js
   云数据库集合定义 —— 字段取自 PRD §8「数据模型（核心表草案）」，
   安全要点取自《小程序移植指南》§5.2。

   这是**声明式**定义，不依赖 wx-server-sdk，因此可以在 Node 里直接测。
   真正建集合 / 写安全规则时需要真实 AppID 与云环境（见 cloud/README.md）。

   每个集合声明四件事：
   · fields   —— 字段名与类型（b 表示布尔、n 数字、s 字符串、a 数组、o 对象）
   · rule     —— 该集合在安全规则里的总原则
   · guard    —— 会被 authz.js 当成硬约束执行的规则（key 见 authz.js 的 GUARDS）
   · note     —— 为什么这么定（对着 PRD / 指南的原文）
   ============================================================ */
'use strict';

/** 五个行为维度（与 utils/templates.js 的 DIMS 对齐） */
const DIMS = ['study', 'life', 'body', 'social', 'self'];

const COLLECTIONS = {
  /* 全局只读，运营侧维护，不发版即可调整模板 */
  stage_template: {
    fields: { _id: 's', stage: 's', cap: 'n', items: 'a', rewards: 'a' },
    rule: '全局只读',
    guard: ['readAll', 'writeNone'],
    note: '指南 §5.2：全局只读，由运营侧维护，不发版即可调整',
  },

  family: {
    fields: { _id: 's', name: 's', invite_code: 's', members: 'a', created_at: 'n' },
    rule: '仅家庭成员可读',
    guard: ['readOwnFamily', 'writeNone'],
    note: 'PRD §8：id, name, invite_code, created_at；指南 §5.2：仅家庭成员可读',
  },

  user: {
    fields: { _id: 's', family_id: 's', role: 's', nickname: 's', avatar: 's', birth_year: 'n', stage: 's' },
    rule: '家庭成员可读；本人可改自己的昵称与学段',
    guard: ['readOwnFamily', 'updateSelf', 'deleteNone'],
    note: 'role 只能是 child / parent / member；角色与学段决定客户端分支',
  },

  behavior_item: {
    fields: { _id: 's', family_id: 's', dimension: 's', name: 's', points: 'n', daily_limit: 'n', time_window: 'o', created_by: 's', active: 'b' },
    rule: '家庭成员可读；孩子可改自己的，家长改动需双签',
    guard: ['readOwnFamily', 'writeChildOnly', 'pointsPositive'],
    note: '指南 §5.2：孩子可改自己的，家长改动需双签；分值必须为正（只加分）',
  },

  check_in: {
    fields: { _id: 's', user_id: 's', item_id: 's', date: 's', points: 'n', note: 's', evidence: 's', is_backfill: 'b', is_private: 'b', created_at: 'n' },
    rule: '仅本人可写；家长只读且 is_private 的记录不返回',
    /* 私密的过滤就在 readOwnFamily 里（家长 + is_private → 拒），不另设空 guard */
    guard: ['readOwnFamily', 'writeSelfOnly', 'pointsPositive'],
    note: '指南 §5.2：仅本人可写；家长只读且 is_private 不返回（对应 store.visibleToParent）',
  },

  point_ledger: {
    fields: { _id: 's', user_id: 's', delta: 'n', reason: 's', ref_type: 's', ref_id: 's', created_at: 'n', reversed_by: 's' },
    rule: '仅允许新增，禁止 update / delete',
    guard: ['readOwnFamily', 'appendOnly', 'deltaPositive', 'deleteNone'],
    note: '指南 §5.2 明确要求「仅允许新增，禁止 update/delete」（在安全规则里写死）；delta > 0 即只加分',
  },

  weekly_review: {
    fields: { _id: 's', user_id: 's', week_start: 's', highlights: 'a', keep_habit: 's', next_small_step: 's', new_challenge: 's', message: 's', bonus_points: 'n' },
    rule: '本人可写；家庭成员可读',
    guard: ['readOwnFamily', 'writeSelfOnly', 'deleteSelfOnly'],
    note: 'PRD §8；highlights 最多 3 条（对应周复盘第 1 步的上限）',
  },

  reward: {
    fields: { _id: 's', family_id: 's', tier: 's', title: 's', description: 's', cost: 'n', type: 's', custom_by: 's' },
    rule: '家庭成员可读；孩子可改内容，家长改动需双签',
    guard: ['readOwnFamily', 'writeChildOnly', 'costPositive'],
    note: '指南 §5.2：孩子可改自己的，家长改动需双签',
  },

  redemption: {
    fields: { _id: 's', user_id: 's', reward_id: 's', cost: 'n', status: 's', coupon_code: 's', expires_at: 's', provided_at: 'n' },
    rule: '孩子可创建；家长只可改 status；**不可 delete**',
    guard: ['readOwnFamily', 'createSelfOnly', 'parentUpdateStatusOnly', 'deleteNone'],
    note: '指南 §5.2：孩子可创建，家长只可改 status，不可 delete（对应家长端无撤回能力）',
  },

  repair_action: {
    fields: { _id: 's', user_id: 's', trigger_type: 's', template: 's', self_reminder: 's', due_date: 's', status: 's', points_awarded: 'n' },
    rule: '本人可写；不产生负分，完成时写入一次正向 ledger',
    guard: ['readOwnFamily', 'writeSelfOnly', 'pointsNonNegative'],
    note: '指南 §5.2：不产生负分，完成时写入一次正向 ledger（负分在引擎层就不存在）',
  },

  surprise_card: {
    fields: { _id: 's', family_id: 's', title: 's', desc: 's', expires_days: 'n', created_by: 's' },
    rule: '家庭成员可读；卡池由运营侧维护',
    guard: ['readOwnFamily', 'writeChildOnly'],
    note: 'PRD §8 + §4 M6 修订：惊喜卡是**自选**，卡池固定、零随机',
  },

  card_draw: {
    fields: { _id: 's', user_id: 's', card_id: 's', drawn_at: 'n', used_at: 'n' },
    rule: '本人可写；家庭成员可读',
    guard: ['readOwnFamily', 'writeSelfOnly'],
    note: 'drawn_at 记录领取时间；「每周最多 1 次」由引擎判定（store.surpriseState）',
  },

  rule_version: {
    fields: { _id: 's', family_id: 's', version: 'n', snapshot_json: 'o', changes: 'a', signed_by_child_at: 'n', signed_by_parent_at: 'n', effective_at: 'n' },
    rule: '家庭成员可读；签名时间戳只能由对应角色写一次',
    guard: ['readOwnFamily', 'signOnce', 'effectiveNeedsBothSigns', 'deleteNone'],
    note: 'PRD §8 + §4 M4：双签生成 rule_version v1 并显示生效日期；单方修改进入待生效',
  },

  milestone: {
    fields: { _id: 's', user_id: 's', type: 's', title: 's', achieved_at: 'n' },
    rule: '本人可写；家庭成员可读；不可兑换',
    guard: ['readOwnFamily', 'writeSelfOnly', 'appendOnly'],
    note: 'PRD §4 M6：生成「成长勋章」（不可兑换、纯叙事）；对应 store.milestones()',
  },
};

/** 操作类型（与 authz.js 的动作名一致） */
const ACTIONS = ['read', 'create', 'update', 'delete'];

/** 集合清单，便于遍历与断言 */
const COLLECTION_NAMES = Object.keys(COLLECTIONS);

module.exports = { COLLECTIONS, COLLECTION_NAMES, ACTIONS, DIMS };
