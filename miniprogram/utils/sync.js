/* ============================================================
   罗森塔尔 Rosenthal · utils/sync.js
   本地优先 + 可选云同步的**合并策略**（PRD §9：冲突用「最后写入优先 + 双方可见变更日志」）。

   为什么这一层值得单独写、单独测：
   家庭共享意味着两台设备（她的手机 / 妈妈的手机）可能各自离线操作，然后才同步。
   天真做法（整份 state 取「最后写入」）会**丢数据**，而且丢的恰好是最不该丢的：
   她刚打的卡、她刚兑到的券。所以按数据性质分三种合并方式：

   ① 只增不改的事件流 —— 打卡流水 log、券 coupons、兑换明细 redemptions、
      修复行动 repairs、周复盘 week、流水导出用的 flash 备注：
      **取并集，按 id 去重**。两台设备各加一条，合并后就是两条，谁都不丢。
   ② 由事件派生的标量 —— 余额、累计、连续天数、当日得分：
      **不合并，重新算**。它们本来就是派生量，合并后再算一次就不会重复计数。
   ③ 真正的冲突（同一条被两边改过或删过）——
      按 `ts` **最后写入优先**，并且**写进双方可见的变更日志**（PRD §9 要求），
      不做静默覆盖。

   另外两处特殊处理：
   · `amend`（必改 3 项的计数）取**逐项较大值**：计数只增不减，取大不会丢她的改动；
   · `parent` / `onboarded` / `ruleVersion`：签名与生效状态取**较严**的一方
     （详见 mergeSignatures），避免「一边签了、另一边没签」被合并成已生效。

   `spent` 不在合并范围里 —— 它已经改成从 `redemptions` 派生（见 store.js），
   这正是为了让它可合并。合并后 `save()` 会把它重新算出来。
   ============================================================ */
'use strict';

/** 按 id 取并集：以 local 为底，把 remote 里 local 没有的补进来 */
function unionById(localArr, remoteArr, idOf) {
  const out = (localArr || []).slice();
  const seen = {};
  out.forEach(x => { seen[idOf(x)] = 1; });
  let added = 0;
  (remoteArr || []).forEach(x => {
    const k = idOf(x);
    if (!seen[k]) { seen[k] = 1; out.push(x); added++; }
  });
  return { list: out, added: added };
}

const logId = l => l.uid;
const couponId = c => c.code;
const redemptionId = r => r.id;
const repairId = r => r.id;

/** 合并两份 amend 计数：逐项取大（计数只增不减） */
function mergeAmend(a, b) {
  const A = a || {}, B = b || {};
  return {
    point: Math.max(A.point || 0, B.point || 0),
    item: Math.max(A.item || 0, B.item || 0),
    reward: Math.max(A.reward || 0, B.reward || 0),
  };
}

/**
 * 合并签名 / 生效状态：取**较严**的一方。
 * 规则是「双方都签过才生效」，所以合并后必须仍然满足这个条件，
 * 否则会出现「她这边签了、妈妈那边没签，同步完就生效了」的漏洞。
 */
function mergeSignatures(local, remote) {
  const bothChild = !!local.onboarded && !!remote.onboarded;
  const bothParent = !!(local.parent && local.parent.agreedAt) && !!(remote.parent && remote.parent.agreedAt);
  /* 只要有一边还没签，就按「未签」处理：宁可不生效，也不能偷偷生效 */
  const onboarded = bothChild;
  const parent = (bothParent)
    ? { agreedAt: Math.min(local.parent.agreedAt, remote.parent.agreedAt), version: Math.max(local.parent.version || 0, remote.parent.version || 0) }
    : { agreedAt: null, version: null };
  return { onboarded: onboarded, parent: parent };
}

/** 记录一次冲突（PRD §9：变更日志要双方可见） */
function conflictLog(collection, id, winner, detail) {
  return { at: Date.now(), collection: collection, id: id, winner: winner, detail: detail };
}

/**
 * 合并两份状态。
 * @param {object} local  本机状态（事实来源）
 * @param {object} remote 云上/对端状态
 * @returns {{state:object, log:Array, stats:object}}
 */
function merge(local, remote) {
  const L = local || {}, R = remote || {};
  const log = [];
  const stats = { addedLog: 0, addedCoupons: 0, addedRedemptions: 0, addedRepairs: 0, conflicts: 0 };

  /* ① 学段：取更高的学段（学段只能升），相同则用本机的 */
  const STAGE_ORDER = ['p12', 'p36', 'mid', 'high'];
  const li = STAGE_ORDER.indexOf(L.stage);
  const ri = STAGE_ORDER.indexOf(R.stage);
  const stage = ri > li ? R.stage : (L.stage || 'mid');
  if (ri > li) {
    log.push(conflictLog('state', 'stage', 'remote', '对端学段(' + R.stage + ')更高，按「学段只能升」取之'));
    stats.conflicts++;
  }

  /* ② 事件流：并集 */
  const logU = unionById(L.log, R.log, logId);
  const couponU = unionById(L.coupons, R.coupons, couponId);
  const redemptionU = unionById(L.redemptions, R.redemptions, redemptionId);
  const repairU = unionById(L.repairs, R.repairs, repairId);
  stats.addedLog = logU.added;
  stats.addedCoupons = couponU.added;
  stats.addedRedemptions = redemptionU.added;
  stats.addedRepairs = repairU.added;

  /* ③ 手写闪光点：按日期并集，同一天取较新的（两边都有就记冲突） */
  const flash = Object.assign({}, L.flash || {});
  Object.keys(R.flash || {}).forEach(d => {
    if (flash[d] === undefined) flash[d] = R.flash[d];
    else if (flash[d] !== R.flash[d]) {
      /* 同一天两边都写了：保留本机的，但记下来让双方看得见 */
      log.push(conflictLog('flash', d, 'local', '同一天两边都写了闪光点，保留了本机的：「' + flash[d] + '」'));
      stats.conflicts++;
    }
  });

  /* ④ 规则内容：条目 / 奖励按改动时间取较新的那一份（最后写入优先） */
  const localTouched = (L.items || []).some(i => i.customBy === 'child') || (L.rewards || []).some(r => r.customBy === 'child');
  const remoteTouched = (R.items || []).some(i => i.customBy === 'child') || (R.rewards || []).some(r => r.customBy === 'child');
  let items = L.items, rewards = L.rewards;
  if (remoteTouched && !localTouched) { items = R.items; rewards = R.rewards; }
  else if (remoteTouched && localTouched && JSON.stringify(L.items) !== JSON.stringify(R.items)) {
    /* 两边都改过规则：本机优先 + 记冲突（真正的规则冲突要靠双签流程解决，这里只保证可见） */
    log.push(conflictLog('rules', 'items', 'local', '两边都改过规则，保留了本机这一版，需要重新双签'));
    stats.conflicts++;
  }

  /* ⑤ 签名：取较严 */
  const sig = mergeSignatures(L, R);
  if (!!L.onboarded !== sig.onboarded || !!(L.parent && L.parent.agreedAt) !== !!(sig.parent && sig.parent.agreedAt)) {
    log.push(conflictLog('rule_version', 'signatures', 'stricter', '签名取较严的一方：只要有一边没签就不算生效'));
    stats.conflicts++;
  }

  /* ⑥ 周复盘：取较新的那份（带 at 时间戳） */
  const week = (function () {
    const lw = L.week, rw = R.week;
    if (!lw) return rw || null;
    if (!rw) return lw;
    if (rw.rangeStart > lw.rangeStart) return rw;
    if (rw.rangeStart < lw.rangeStart) return lw;
    if (rw.at > lw.at) {
      log.push(conflictLog('weekly_review', rw.rangeStart, 'remote', '这一周的复盘两边都有，取较新的那份'));
      stats.conflicts++;
      return rw;
    }
    return lw;
  })();

  const merged = Object.assign({}, L, {
    stage: stage,
    onboarded: sig.onboarded,
    parent: sig.parent,
    /* ruleVersion 取较大值：版本号只增，取大不会回退她的规则版本 */
    ruleVersion: Math.max(L.ruleVersion || 0, R.ruleVersion || 0),
    amend: mergeAmend(L.amend, R.amend),
    items: items,
    rewards: rewards,
    log: logU.list,
    coupons: couponU.list,
    redemptions: redemptionU.list,
    repairs: repairU.list,
    flash: flash,
    week: week,
    /* 草稿与惊喜卡领取时间：都取本机的（本地优先，未完成的操作不该被对端覆盖） */
    weekDraft: L.weekDraft || null,
    surpriseAt: L.surpriseAt || R.surpriseAt || null,
  });
  /* spent 不合并：它是 redemptions 的派生值，落盘时会重算 */
  delete merged.spent;

  return { state: merged, log: log, stats: stats };
}

/** 变更日志的可读文本（给她和妈妈看，符合「双方可见」的要求） */
function logText(entries) {
  if (!entries || !entries.length) return '这次同步没有冲突：两边的记录已经合在一起了。';
  const lines = ['这次同步有 ' + entries.length + ' 处需要你知道：', ''];
  entries.forEach((e, i) => {
    lines.push((i + 1) + '. [' + e.collection + '] ' + e.detail);
    lines.push('   处理方式：保留 ' + (e.winner === 'local' ? '本机' : (e.winner === 'remote' ? '对端' : e.winner)));
  });
  return lines.join('\n');
}

module.exports = { merge, logText, unionById, mergeAmend, mergeSignatures };
