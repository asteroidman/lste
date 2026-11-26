/* ============================================================
   罗森塔尔 · 单文件家庭版 · 界面层
   - 数据全部来自引擎 RosStore（与小程序同一份 store.js），只存本机；
   - 修改类操作（改规则 / 改奖励 / 周结算 / 代记 / 导出备份 / 换学段）
     走家长密码 PIN；打卡、兑换、用券、打印不需要；
   - 单文件版刻意跳过「共建双签」流程（更简单），其余红线不变：
     只加分、日上限、流水不可改、奖励档位由引擎管。
   ============================================================ */
(function () {
  'use strict';

  const St = (typeof RosStore !== 'undefined') ? RosStore : null;
  const Pin = (typeof window !== 'undefined' && window.RosPin) || null;
  const Pr = (typeof window !== 'undefined' && window.RosPrint) || null;
  if (!St || !Pin || !Pr) { document.body.textContent = '文件不完整，请重新导出整份 HTML。'; return; }

  const $ = s => document.querySelector(s);
  const esc = St.esc;
  const pad2 = n => String(n).padStart(2, '0');
  const timeHM = ts => { const d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  const today = () => St.todayKey();

  let tab = 'today';
  let chosenStage = '';
  let pendingPin = null;      // { purpose, fn }
  let pending = {};           // 模态框指向的目标：{ item, rewardCost, redeem }
  let pinMode = 'verify';     // verify | create | reset | recover
  let weekBigShown = false;   // 周目标「说得太大」提示已经给过

  /* ---------------- 提示条 ---------------- */
  let toastTimer = null;
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /* ---------------- 模态框 ----------------
     注意：不要在 .modal 上 stopPropagation —— 事件统一在 document 上分发，
     拦掉冒泡会让模态框里的所有按钮失灵；遮罩关闭改为在分发器里判断。 */
  function openModal(html) {
    const root = $('#modal-root');
    root.innerHTML = '<div class="mask"><div class="modal">' + html + '</div></div>';
    const first = root.querySelector('input');
    if (first) setTimeout(() => first.focus(), 30);
    return root;
  }
  function closeModal() { $('#modal-root').innerHTML = ''; }

  /* ---------------- 家长密码 ---------------- */
  function requirePin(purpose, fn) {
    Pin.pinStatus().then(st => {
      pendingPin = { purpose: purpose, fn: fn };
      if (!st.has) {
        pinMode = 'create';
        openModal(
          '<h3>设置家长密码</h3>' +
          '<p class="muted">' + esc(purpose) + '<br>这是第一次，请设置一个只有家长知道的 4–8 位数字密码。孩子日常打卡不需要它。</p>' +
          '<input id="pin-in" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="输入密码（4–8 位数字）">' +
          '<input id="pin-in2" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="再输一遍">' +
          '<div class="err" id="pin-err"></div>' +
          '<div class="btnrow"><button class="btn primary" data-act="pin-go">保存并继续</button>' +
          '<button class="btn" data-act="modal-close">取消</button></div>');
        return;
      }
      pinMode = 'verify';
      openModal(
        '<h3>家长密码</h3>' +
        '<p class="muted">' + esc(purpose) + '</p>' +
        '<input id="pin-in" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="4–8 位数字">' +
        '<div class="err" id="pin-err"></div>' +
        '<div class="btnrow"><button class="btn primary" data-act="pin-go">确认</button>' +
        '<button class="btn" data-act="modal-close">取消</button></div>' +
        '<p class="tiny"><a href="javascript:void(0)" data-act="pin-forgot">忘了密码？用恢复码重设</a></p>');
    });
  }

  async function pinGo() {
    const err = $('#pin-err');
    const showErr = m => { if (err) err.textContent = m; };
    const v1 = (($('#pin-in') || {}).value || '');
    if (pinMode === 'verify') {
      if (await Pin.verifyPin(v1)) {
        const fn = pendingPin && pendingPin.fn;
        closeModal();
        if (fn) await fn();
      } else showErr('密码不对，再试一次');
      return;
    }
    if (pinMode === 'create' || pinMode === 'reset') {
      const v2 = (($('#pin-in2') || {}).value || '');
      if (!/^\d{4,8}$/.test(v1)) return showErr('密码是 4–8 位数字');
      if (v1 !== v2) return showErr('两次输入的不一样');
      const r = await Pin.setPin(v1);
      if (!r.ok) return showErr(r.reason || '没能保存');
      showRecoveryModal(r.recoveryCode);
      return;
    }
  }

  function showRecoveryModal(code) {
    openModal(
      '<h3>把恢复码抄在纸上</h3>' +
      '<p class="muted">忘了家长密码时，凭它重设。它只显示这一次，关掉页面就再也看不到了。</p>' +
      '<div class="reccode">' + esc(code) + '</div>' +
      '<div class="btnrow"><button class="btn primary" data-act="rec-ack">我已抄下来了</button></div>');
  }
  function recAck() {
    const fn = pendingPin && pendingPin.fn;
    closeModal();
    toast('家长密码已保存');
    if (fn) fn();
  }

  function pinForgot() {
    pinMode = 'recover';
    openModal(
      '<h3>用恢复码重设</h3>' +
      '<p class="muted">输入首次设置时抄下来的恢复码（形如 LST-XXXX-XXXX）。数据不会受影响。</p>' +
      '<input id="rec-in" type="text" autocomplete="off" placeholder="LST-XXXX-XXXX">' +
      '<div class="err" id="pin-err"></div>' +
      '<div class="btnrow"><button class="btn primary" data-act="rec-verify">下一步</button>' +
      '<button class="btn" data-act="modal-close">取消</button></div>');
  }
  async function recVerify() {
    const code = (($('#rec-in') || {}).value || '');
    if (!(await Pin.verifyRecovery(code))) { const e2 = $('#pin-err'); if (e2) e2.textContent = '恢复码不对'; return; }
    pinMode = 'reset';
    openModal(
      '<h3>设置新的家长密码</h3>' +
      '<p class="muted">会同时生成一组新的恢复码，抄好它。</p>' +
      '<input id="pin-in" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="新密码（4–8 位数字）">' +
      '<input id="pin-in2" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="再输一遍">' +
      '<div class="err" id="pin-err"></div>' +
      '<div class="btnrow"><button class="btn primary" data-act="pin-go">保存并继续</button>' +
      '<button class="btn" data-act="modal-close">取消</button></div>');
  }

  /** 需要家长密码的修改类操作：引擎返回 {ok, reason}；成功后顺带让家长版本生效 */
  function guarded(purpose, fn) {
    requirePin(purpose, async () => {
      try {
        const r = await fn();
        if (r && r.ok) {
          const a = St.parentAgree();
          render();
          if (!r.silent) toast(r.msg || (a.ok ? '已更新' : '已保存'));
        } else {
          toast((r && r.reason) || '没能完成');
        }
      } catch (e2) { toast('出了点问题：' + e2.message); }
    });
  }

  /* ---------------- 首次使用 ---------------- */
  function needsOnboarding(s) { return !s.introSeen; }

  function onboardingHtml() {
    const cards = St.STAGES.map(st =>
      '<button class="stagecard' + (st.k === chosenStage ? ' on' : '') + '" data-act="stage-pick" data-k="' + esc(st.k) + '">' +
      '<div class="sc-n">' + esc(st.n) + '</div><div class="sc-g">' + esc(st.g) + '</div>' +
      '<div class="sc-sub">' + esc(st.sub) + '</div><div class="sc-perm">' + esc(st.perm) + '</div>' +
      '</button>').join('');
    return '<div class="onboard">' +
      '<h1>罗森塔尔</h1>' +
      '<p class="lead">「每天看到做到的小事，人就会朝被肯定的方向长。」<br>' +
      '在这张纸上记下她做到的每一件小事，给一句具体的话。</p>' +
      '<h3>她在哪个学段？</h3>' +
      '<div class="stagegrid">' + cards + '</div>' +
      '<p class="tiny">所有数据只保存在这台设备的浏览器里，不会上传到任何服务器。记得在「家长」页导出备份。</p>' +
      '</div>';
  }
  function stagePick(k) {
    chosenStage = k;
    const st = St.stageOf(k);
    openModal(
      '<h3>怎么称呼她？</h3>' +
      '<input id="nick-in" type="text" maxlength="12" value="' + esc(st.nick) + '" placeholder="昵称">' +
      '<div class="btnrow"><button class="btn primary" data-act="family-start">开始使用</button>' +
      '<button class="btn" data-act="modal-close">先不改</button></div>');
  }
  function familyStart() {
    const nick = ((($('#nick-in') || {}).value) || '').trim();
    St.load(chosenStage || 'mid');
    const s = St.state();
    s.nick = nick || St.stageOf(s.stage).nick;
    s.onboarded = true;
    s.ruleVersion = (s.ruleVersion || 0) + 1;
    s.parent = { agreedAt: Date.now(), version: s.ruleVersion };
    s.introSeen = true;
    St.save();
    closeModal();
    tab = 'today';
    render();
    toast('好了！先从一件小事开始');
  }
  /** 单文件版：换学段/改规则后直接让家长版本生效（跳过双签，保持简单） */
  function autoAgree() {
    const s = St.state();
    s.onboarded = true;
    s.ruleVersion = (s.ruleVersion || 0) + 1;
    s.parent = { agreedAt: Date.now(), version: s.ruleVersion };
    St.save();
  }

  /* ---------------- 页头 / 标签栏 ---------------- */
  function headerHtml(s) {
    const st = St.stageOf(s.stage);
    return '<header class="top"><div class="top-row"><div class="who">' + esc(s.nick || '我') +
      '<span class="chip">' + esc(st.n) + '</span></div>' +
      '<div class="stats">今日 <b>' + St.dayScore(today()) + '</b>/' + St.capNow() +
      '　连续 <b>' + St.streak() + '</b> 天<br>累计 <b>' + St.lifetime() + '</b>　可用 <b>' + St.balance() + '</b></div></div></header>';
  }
  function tabbarHtml() {
    const tabs = [['today', '今日'], ['rules', '规则'], ['rewards', '奖励'], ['week', '周复盘'], ['parent', '家长']];
    return '<nav class="tabbar">' + tabs.map(t =>
      '<button class="tab' + (tab === t[0] ? ' on' : '') + '" data-act="tab" data-tab="' + t[0] + '">' + t[1] + '</button>'
    ).join('') + '</nav>';
  }

  /* ---------------- 今日 ---------------- */
  function todayView(s) {
    const t = today();
    const cap = St.capNow();
    const full = St.dayScore(t) >= cap;
    const canProxy = St.canParentRecord();
    const groups = St.DIMS.map(d => ({ n: d.n, items: St.itemsOf().filter(i => i.dim === d.k) }))
      .filter(g => g.items.length);
    const sec1 = groups.map(g => '<section class="card"><h3>' + esc(g.n) + '</h3>' +
      g.items.map(it => {
        const c = St.countOn(it.id, t);
        const dis = full || c >= it.limit;
        return '<div class="row"><div class="rowmain"><div class="rname">' + esc(it.name) + '</div>' +
          '<div class="rmeta">+' + it.points + ' 分 · 今天已记 ' + c + '/' + it.limit + '</div></div>' +
          '<div class="rowops">' +
          '<button class="btn small primary" data-act="checkin" data-id="' + esc(it.id) + '"' + (dis ? ' disabled' : '') + '>记一笔</button>' +
          (canProxy ? '<button class="btn small" data-act="proxy" data-id="' + esc(it.id) + '"' + (dis ? ' disabled' : '') + '>代记</button>' : '') +
          '</div></div>';
      }).join('') + '</section>').join('');

    const entries = s.log.filter(l => l.date === t).sort((a, b) => b.ts - a.ts);
    const sec2 = '<section class="card"><h3>今天做到的</h3>' + (entries.length ?
      entries.map(e => '<div class="row"><div class="rowmain">' +
        '<div class="rname">' + esc(e.name) + ' <b>+' + e.points + '</b>' + (e.reversed ? '<span class="chip gray">已撤销</span>' : '') + '</div>' +
        '<div class="rmeta">' + timeHM(e.ts) + (e.byParent ? ' · 家长代记' : '') +
        (e.overflow ? ' · 超出今天的 ' + e.overflow + ' 分算明天的' : '') + '</div>' +
        (e.praise ? '<div class="rpraise">' + esc(e.praise) + '</div>' : '') + '</div>' +
        (!e.reversed ? '<button class="btn small" data-act="undo" data-uid="' + esc(e.uid) + '">撤销</button>' : '') +
        '</div>').join('')
      : '<p class="muted">今天还没有记录，挑一件小事开始就好。</p>') + '</section>';

    const sec3 = '<section class="card"><h3>今天的闪光点</h3>' +
      '<div class="inrow"><input id="flash-in" value="' + esc((s.flash && s.flash[t]) || '') + '" placeholder="今天有什么想说的一句？">' +
      '<button class="btn small primary" data-act="flash-save">记下</button></div></section>';

    const coupons = s.coupons.filter(c => !c.used);
    const sec4 = '<section class="card"><h3>券包</h3>' + (coupons.length ?
      coupons.map(c => '<div class="row"><div class="rowmain">' +
        '<div class="rname">' + esc(c.title || '奖励') + '</div>' +
        '<div class="rmeta">' + esc(c.code) + ' · 花了 ' + c.cost + ' 分 · ' +
        (c.exp >= t ? '有效期到 ' + c.exp : '已过有效期，和家长说一声还能用吗') + '</div></div>' +
        '<button class="btn small primary" data-act="usecoupon" data-code="' + esc(c.code) + '">用掉</button></div>').join('')
      : '<p class="muted">还没有券，攒一攒就来换。</p>') + '</section>';

    return sec1 + sec2 + sec3 + sec4 +
      '<div class="printrow"><button class="btn" data-act="print-today">打印今日卡</button>' +
      '<button class="btn" data-act="tab" data-tab="rewards">去兑换 →</button></div>';
  }

  function doCheckin(id) {
    const it = St.itemById(id);
    if (!it) return;
    const r = St.addPoints({ itemId: it.id, name: it.name, dim: it.dim, points: it.points, praise: St.praiseOf(it) });
    if (r.ok) {
      render();
      toast(r.partial ? '+' + r.entry.points + ' 分（今天满了，多的算明天）' : '+' + r.entry.points + ' 分');
    } else toast(r.reason);
  }

  /* ---------------- 规则 ---------------- */
  function rulesView(s) {
    const sig = St.ruleSignature();
    const banner = '<div class="banner ' + (sig.active ? 'ok' : 'warn') + '">' +
      (sig.active ? '规则 v1.' + sig.ruleVersion + ' · ' + sig.agreedDate + ' 生效'
        : '规则改过了，家长确认后生效（不影响打卡）') + '</div>';
    const groups = St.DIMS.map(d => ({ n: d.n, items: St.itemsOf().filter(i => i.dim === d.k) }))
      .filter(g => g.items.length);
    const body = groups.map(g => '<section class="card"><h3>' + esc(g.n) + '</h3>' +
      g.items.map(it => '<div class="row"><div class="rowmain">' +
        '<div class="rname">' + esc(it.name) + (it.customBy === 'child' ? '<span class="chip">自己改的</span>' : '') + '</div>' +
        '<div class="rmeta">+' + it.points + ' 分 · 每天 ' + it.limit + ' 次</div></div>' +
        '<div class="rowops"><button class="btn small" data-act="item-cost" data-id="' + esc(it.id) + '">改分值</button>' +
        '<button class="btn small" data-act="item-remove" data-id="' + esc(it.id) + '">移除</button></div></div>').join('') +
      '</section>').join('');
    return banner + body +
      '<div class="printrow"><button class="btn primary" data-act="item-add">新增一项</button>' +
      '<button class="btn" data-act="print-rules">打印规则表</button></div>' +
      '<p class="tiny">规则是全家一起定的：改这里的每一处都会记下是谁改的。行为项移除后随时可以再加回来，已记录的分数不受影响。</p>';
  }

  function itemCostModal(id) {
    const it = St.itemById(id);
    if (!it) return;
    pending.item = id;
    openModal(
      '<h3>改分值</h3><p class="muted">' + esc(it.name) + '（现在是 +' + it.points + ' 分）</p>' +
      '<input id="pts-in" type="number" min="1" step="1" value="' + it.points + '">' +
      '<div class="btnrow"><button class="btn primary" data-act="item-cost-go">保存</button>' +
      '<button class="btn" data-act="modal-close">取消</button></div>');
  }
  function itemAddGo() {
    const name = (($('#na-name') || {}).value || '').trim();
    const dim = (($('#na-dim') || {}).value) || 'self';
    const pts = Number(($('#na-pts') || {}).value || 0);
    const limit = Number(($('#na-limit') || {}).value || 1);
    if (!name) { toast('先写清这件事'); return false; }
    return St.addItem({ name: name, dim: dim, points: pts, limit: limit });
  }
  function itemCostGo() {
    const pts = Number(($('#pts-in') || {}).value || 0);
    closeModal();
    guarded('改分值需要家长密码', async () => {
      const r = St.setItemPoints(pending.item, pts);
      return r.ok ? { ok: true, msg: '已更新，新分值 +' + pts } : r;
    });
  }
  function itemRemoveGo() {
    closeModal();
    guarded('移除行为项需要家长密码', async () => {
      const r = St.removeItem(pending.item);
      return r.ok ? { ok: true, msg: '已移除，随时可以再加回来' } : r;
    });
  }
  function itemRemoveModal(id) {
    const it = St.itemById(id);
    if (!it) return;
    pending.item = id;
    openModal(
      '<h3>移除这一项？</h3><p class="muted">' + esc(it.name) + '<br>移除后随时可以再加回来，已记录的分数不受影响。</p>' +
      '<div class="btnrow"><button class="btn primary" data-act="item-remove-go">移除</button>' +
      '<button class="btn" data-act="modal-close">先留着</button></div>');
  }
  function itemAddModal() {
    const opts = St.DIMS.map(d => '<option value="' + esc(d.k) + '">' + esc(d.n) + '</option>').join('');
    openModal(
      '<h3>新增一项</h3>' +
      '<input id="na-name" type="text" maxlength="30" placeholder="写清这件事，越具体越好">' +
      '<div class="inrow"><select id="na-dim">' + opts + '</select>' +
      '<input id="na-pts" type="number" min="1" step="1" value="1" title="分值">' +
      '<input id="na-limit" type="number" min="1" step="1" value="1" title="每天次数"></div>' +
      '<p class="tiny">分值是每天最多能记的分，每天次数是这一项一天最多记几回。</p>' +
      '<div class="btnrow"><button class="btn primary" data-act="item-add-go">保存</button>' +
      '<button class="btn" data-act="modal-close">取消</button></div>');
  }
  function itemAddGo() {
    const name = (($('#na-name') || {}).value || '').trim();
    const dim = (($('#na-dim') || {}).value) || 'self';
    const pts = Number(($('#na-pts') || {}).value || 0);
    const limit = Number(($('#na-limit') || {}).value || 1);
    if (!name) { toast('先写清这件事'); return false; }
    return St.addItem({ name: name, dim: dim, points: pts, limit: limit });
  }

  /* ---------------- 奖励 ---------------- */
  function rewardsView(s) {
    const bal = St.balance();
    const rows = s.rewards.map(r => {
      const can = bal >= r.cost;
      return '<div class="row"><div class="rowmain">' +
        '<div class="rname">' + esc(r.title) + (r.customBy === 'child' ? '<span class="chip">自己改的</span>' : '') + '</div>' +
        '<div class="rmeta">' + esc(r.tier || '') + ' · ' + r.cost + ' 分</div></div>' +
        '<div class="rowops"><button class="btn small primary" data-act="redeem" data-cost="' + r.cost + '" data-title="' + esc(r.title) + '"' + (can ? '' : ' disabled') + '>兑换</button>' +
        '<button class="btn small" data-act="reward-title" data-cost="' + r.cost + '">改内容</button>' +
        '<button class="btn small" data-act="reward-cost" data-cost="' + r.cost + '">改分值</button>' +
        '<button class="btn small" data-act="reward-remove" data-cost="' + r.cost + '">移除</button></div></div>';
    }).join('');
    return '<div class="balancecard"><div class="bal-n">' + bal + '</div><div class="bal-t">可用积分</div></div>' +
      '<section class="card"><h3>奖励档位</h3>' + rows + '</section>' +
      '<div class="printrow"><button class="btn primary" data-act="reward-add">加一档奖励</button></div>' +
      '<p class="tiny">兑换会用掉积分、发一张券；券 30 天内有效，用掉或过期都不退分——这正是「说话算数」的练习。</p>';
  }
  function redeemGo(cost, title) {
    pending.redeem = { cost: cost, title: title };
    openModal(
      '<h3>兑换</h3><p class="muted">花 ' + cost + ' 分换「' + esc(title) + '」？会发一张券，30 天内有效。</p>' +
      '<div class="btnrow"><button class="btn primary" data-act="redeem-go">换！</button>' +
      '<button class="btn" data-act="modal-close">再想想</button></div>');
  }
  function rewardTitleModal(cost) {
    const r = St.state().rewards.find(x => x.cost === Number(cost));
    if (!r) return;
    pending.rewardCost = cost;
    openModal(
      '<h3>改奖励内容</h3>' +
      '<input id="rw-title" type="text" maxlength="30" value="' + esc(r.title) + '">' +
      '<div class="btnrow"><button class="btn primary" data-act="reward-title-go">保存</button>' +
      '<button class="btn" data-act="modal-close">取消</button></div>');
  }
  function rewardCostModal(cost) {
    const r = St.state().rewards.find(x => x.cost === Number(cost));
    if (!r) return;
    pending.rewardCost = cost;
    openModal(
      '<h3>改奖励分值</h3><p class="muted">' + esc(r.title) + '（现在是 ' + r.cost + ' 分）</p>' +
      '<input id="rw-cost" type="number" min="1" step="1" value="' + r.cost + '">' +
      '<div class="btnrow"><button class="btn primary" data-act="reward-cost-go">保存</button>' +
      '<button class="btn" data-act="modal-close">取消</button></div>');
  }
  function rewardRemoveModal(cost) {
    const r = St.state().rewards.find(x => x.cost === Number(cost));
    if (!r) return;
    pending.rewardCost = cost;
    openModal(
      '<h3>移除这一档？</h3><p class="muted">' + esc(r.title) + '（' + r.cost + ' 分）<br>至少要留一档；已经发出的券不受影响。</p>' +
      '<div class="btnrow"><button class="btn primary" data-act="reward-remove-go">移除</button>' +
      '<button class="btn" data-act="modal-close">先留着</button></div>');
  }
  function rewardAddModal() {
    openModal(
      '<h3>加一档奖励</h3>' +
      '<input id="rw-title" type="text" maxlength="30" placeholder="奖励内容，越具体越好">' +
      '<div class="inrow"><input id="rw-cost" type="number" min="1" step="1" placeholder="分值">' +
      '<input id="rw-tier" type="text" maxlength="10" placeholder="档位名（可选）"></div>' +
      '<div class="btnrow"><button class="btn primary" data-act="reward-add-go">保存</button>' +
      '<button class="btn" data-act="modal-close">取消</button></div>');
  }
  function rewardAddGo() {
    const title = (($('#rw-title') || {}).value || '').trim();
    const cost = Number(($('#rw-cost') || {}).value || 0);
    const tier = (($('#rw-tier') || {}).value || '').trim();
    if (!title) { toast('先写清奖励是什么'); return { ok: false }; }
    return St.addReward({ cost: cost, title: title, tier: tier || '自定义' });
  }

  /* ---------------- 周复盘 ---------------- */
  function weekView(s) {
    const st = St.weekStats();
    const settled = s.week && s.week.rangeStart === st.rangeStart;
    const head = '<section class="card"><h3>这一周（' + esc(st.range) + '）</h3>' +
      '<div class="stats big">本周 <b>' + st.score + '</b> 分　有记录 <b>' + st.days + '</b> 天　连续 <b>' + st.streak + '</b> 天</div></section>';

    if (settled) {
      const w = s.week;
      const bd = w.bonusDetail || {};
      return head +
        '<section class="card"><h3>已结算</h3>' +
        '<div class="rmeta">周奖励 +' + w.bonus + ' 分' +
        (bd.week50 ? '（周达标 +10' : '') + (bd.streak7 ? (bd.week50 ? '、' : '（') + '连续 7 天 +10' : '') +
        (bd.challenge ? (bd.week50 || bd.streak7 ? '、' : '（') + '主动挑战 +5' : '') +
        ((bd.week50 || bd.streak7 || bd.challenge) ? '）' : '') + '</div>' +
        '<div class="printrow"><button class="btn primary" data-act="print-week">打印一周一页</button>' +
        '<button class="btn" data-act="week-continue">下周继续 →</button></div></section>';
    }

    const w = St.weekDraft();
    const cands = St.weekCandidates(6);
    const sel = (w.highlights || []).map(h =>
      '<button class="chip on" data-act="week-unpick" data-v="' + esc(h) + '">' + esc(h) + ' ✕</button>').join('');
    const cand = cands.filter(c => w.highlights.indexOf(c.praise) < 0).map(c =>
      '<button class="chip" data-act="week-pick" data-k="' + esc(c.praise) + '">+ ' + esc(c.name) + '</button>').join('');
    const keeps = St.KEEP_OPTIONS.map(k =>
      '<button class="chip' + (w.keep === k ? ' on' : '') + '" data-act="week-keep" data-v="' + esc(k) + '">' + esc(k) + '</button>').join('') +
      '<div class="inrow"><input id="keep-custom" value="' + esc(w.keep === St.KEEP_CUSTOM ? (w.keepCustom || '') : '') + '" placeholder="我自己想的：…">' +
      '<button class="btn small" data-act="week-keep-custom">就这个</button></div>';
    const bonus = St.weekBonus(w.challenge);
    const bonusTxt = '预计周奖励 +' + bonus.total + ' 分（' +
      ['周达标 +10（本周 ≥50 分）', '连续 7 天 +10', '主动挑战 +5']
        .filter((_, i) => [bonus.week50, bonus.streak7, bonus.challenge][i]).join('、') + '）';

    return head +
      '<section class="card"><h3>印象最深的三件事</h3>' +
      '<div class="chips">' + (sel || '') + (cand || '') + '</div>' +
      (w.highlights.length ? '' : '<p class="tiny">从这周记过的事里挑，最多三条。</p>') + '</section>' +
      '<section class="card"><h3>想保留的习惯</h3><div class="chips">' + keeps + '</div></section>' +
      '<section class="card"><h3>下周只改一件小事</h3>' +
      '<div class="inrow"><input id="week-next" value="' + esc(w.next || '') + '" placeholder="越小越做得到，比如：睡前把书包收好">' +
      '<button class="btn small primary" data-act="week-next-save">保存</button></div>' +
      (weekBigShown ? '<p class="tiny">试试更小的：' + St.SHRINK_SUGGESTIONS.map(esc).join('；') + '</p>' : '') + '</section>' +
      '<section class="card"><h3>我想挑战的新任务</h3>' +
      '<div class="inrow"><input id="week-chal" value="' + esc(w.challenge || '') + '" placeholder="这周没做过的、想试的事（+5）">' +
      '<button class="btn small primary" data-act="week-chal-save">保存</button></div>' +
      '<p class="tiny">' + esc(bonusTxt) + '</p></section>' +
      '<div class="printrow"><button class="btn primary" data-act="week-finish">就这么定（结算）</button>' +
      '<button class="btn" data-act="print-week">打印一周一页</button></div>';
  }
  function weekFinish() {
    const w = St.weekDraft();
    if (!String(w.next || '').trim()) { toast('先写下想改的那一件小事'); return; }
    if (St.tooBigTarget(w.next) && !weekBigShown) { weekBigShown = true; render(); toast('目标有点大，换个小一点的？'); return; }
    guarded('周结算会发周奖励，需要家长密码', async () => {
      const r = St.finishWeek();
      if (r.ok) return { ok: true, msg: '结算好了，这一周辛苦啦' };
      if (r.already) { render(); return { ok: true, silent: true }; }
      return r;
    });
  }

  /* ---------------- 家长 ---------------- */
  async function parentView(s) {
    const st = await Pin.pinStatus();
    const last = Pin.metaBackupAt();
    const days = last ? Math.floor((Date.now() - last) / 86400000) : -1;
    const backupWarn = (!last || days > 7)
      ? '<div class="banner warn">' + (last ? '距离上次备份已经 ' + days + ' 天了。' : '还没有备份过。') +
        '数据只存在这台设备里，清缓存或换设备就没了——建议现在导出一份备份。</div>'
      : '<div class="banner ok">上次备份：' + new Date(last).toLocaleDateString() + '，很安心。</div>';
    const stages = St.STAGES.map(x =>
      '<button class="btn small' + (x.k === s.stage ? ' primary' : '') + '" data-act="stage-switch" data-k="' + esc(x.k) + '">' +
      esc(x.n) + '</button>').join('');
    return backupWarn +
      '<section class="card"><h3>家长密码</h3>' +
      '<p class="muted">改规则、改奖励、周结算、代记、导出备份都要它。孩子日常打卡不需要。</p>' +
      '<div class="printrow">' +
      (st.has
        ? '<button class="btn" data-act="pin-change">修改密码</button><button class="btn" data-act="pin-forgot-page">用恢复码重设</button>'
        : '<button class="btn primary" data-act="pin-setup">设置家长密码</button>') +
      '</div></section>' +
      '<section class="card"><h3>导出（需要密码）</h3><div class="printrow">' +
      '<button class="btn" data-act="export-rules">规则表 CSV</button>' +
      '<button class="btn" data-act="export-ledger">打卡记录 CSV</button>' +
      '<button class="btn primary" data-act="export-backup">全量备份 JSON</button></div></section>' +
      '<section class="card"><h3>恢复备份（需要密码）</h3>' +
      '<p class="muted">用之前导出的备份文件覆盖当前数据。操作前请先再导出一份当前备份。</p>' +
      '<div class="printrow"><button class="btn" data-act="import-backup">选择备份文件</button>' +
      '<input id="imp-file" type="file" accept="application/json,.json" hidden></div></section>' +
      '<section class="card"><h3>学段</h3><p class="muted">换学段会换一套模板规则，已有记录保留。</p>' +
      '<div class="chips">' + stages + '</div></section>' +
      '<section class="card"><h3>数据说明</h3>' +
      '<p class="tiny">这个文件不联网：所有数据只存在这台设备的浏览器里（localStorage），任何人都拿不到，' +
      '包括我们。也因此：清浏览器缓存、换设备或换浏览器都会「看不到」数据——请定期用「全量备份 JSON」导出，' +
      '在新设备上「恢复备份」即可继续。想彻底从头来过，用下面的清空。</p>' +
      '<div class="printrow"><button class="btn danger" data-act="wipe">清空所有数据</button></div></section>';
  }
  function pinChangeModal() {
    openModal(
      '<h3>修改家长密码</h3>' +
      '<input id="pin-old" type="password" inputmode="numeric" maxlength="8" placeholder="现在的密码">' +
      '<input id="pin-new" type="password" inputmode="numeric" maxlength="8" placeholder="新密码（4–8 位数字）">' +
      '<input id="pin-new2" type="password" inputmode="numeric" maxlength="8" placeholder="再输一遍">' +
      '<div class="err" id="pin-err"></div>' +
      '<div class="btnrow"><button class="btn primary" data-act="pin-change-go">保存</button>' +
      '<button class="btn" data-act="modal-close">取消</button></div>');
  }
  async function pinChangeGo() {
    const err = $('#pin-err');
    const old = (($('#pin-old') || {}).value || '');
    const n1 = (($('#pin-new') || {}).value || '');
    const n2 = (($('#pin-new2') || {}).value || '');
    const showErr = m => { if (err) err.textContent = m; };
    if (!/^\d{4,8}$/.test(n1)) return showErr('新密码是 4–8 位数字');
    if (n1 !== n2) return showErr('两次输入的不一样');
    const r = await Pin.changePin(old, n1);
    if (!r.ok) return showErr(r.reason || '没能修改');
    showRecoveryModal(r.recoveryCode);
  }

  /* ---------------- 导出 / 恢复 ---------------- */
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 600);
  }
  function exportRulesCsv() {
    guarded('导出规则表需要家长密码', async () => {
      const r = St.buildRuleTableCsv({});
      download(r.filename, r.text, 'text/csv;charset=utf-8');
      return { ok: true, msg: '已下载 ' + r.filename };
    });
  }
  function exportLedgerCsv() {
    guarded('导出打卡记录需要家长密码', async () => {
      const r = St.buildLedgerCsv({ includeReversed: true });
      download(r.filename, r.text, 'text/csv;charset=utf-8');
      return { ok: true, msg: '已下载 ' + r.filename };
    });
  }
  function exportBackup() {
    guarded('导出备份需要家长密码', async () => {
      const payload = {
        app: 'rosenthal-single',
        schema: 1,
        exportedAt: Date.now(),
        exportedDate: today(),
        state: JSON.parse(JSON.stringify(St.state())),
        metrics: St.metrics(),
      };
      const filename = 'rosenthal-backup-' + today() + '.json';
      download(filename, JSON.stringify(payload, null, 2), 'application/json');
      Pin.setBackupAt();
      render();
      return { ok: true, silent: true, msg: '已下载 ' + filename };
    });
  }
  function importBackup() {
    guarded('恢复会覆盖当前数据', async () => {
      const f = $('#imp-file');
      if (f) f.click();
      return { ok: true, silent: true };
    });
  }
  async function onImportFile(e2) {
    const f = e2.target.files && e2.target.files[0];
    e2.target.value = '';
    if (!f) return;
    let payload = null;
    try { payload = JSON.parse(await f.text()); } catch (err) { toast('这个文件读不了：不是有效的备份'); return; }
    if (!payload || !payload.state || (payload.app !== 'rosenthal-single' && payload.app !== 'rosenthal-miniprogram')) {
      toast('这不是本家庭的备份文件'); return;
    }
    const r = St.replaceState(payload.state);
    if (r.ok) { Pin.setBackupAt(); tab = 'today'; render(); toast('已恢复' + (payload.exportedDate ? ' ' + payload.exportedDate : '') + '的备份'); }
    else toast(r.reason || '没能恢复');
  }
  function wipeAsk() {
    openModal(
      '<h3>清空所有数据？</h3><p class="muted">这会抹掉这台设备上的全部记录，且无法找回。' +
      '如果想保留，请先去导出一份全量备份。</p>' +
      '<div class="btnrow"><button class="btn danger" data-act="wipe-go">确定清空</button>' +
      '<button class="btn" data-act="modal-close">先不清</button></div>');
  }
  function wipeGo() {
    closeModal();
    guarded('清空数据需要家长密码', async () => {
      St.wipeAll();
      tab = 'today';
      render();
      return { ok: true, silent: true };
    });
  }

  /* ---------------- 打印 ---------------- */
  function printToday() {
    const s = St.state();
    const t = today();
    const rows = St.itemsOf().map(it => ({
      name: it.name, points: it.points, count: St.countOn(it.id, t), limit: it.limit,
    }));
    const entries = s.log.filter(l => l.date === t).sort((a, b) => a.ts - b.ts)
      .map(l => ({ time: timeHM(l.ts), name: l.name, points: l.points, praise: l.praise }));
    const data = {
      nick: s.nick, stageName: St.stageOf(s.stage).n, date: t,
      score: St.dayScore(t), cap: St.capNow(), rows: rows, entries: entries,
      flash: (s.flash && s.flash[t]) || '', ruleVersion: St.ruleSignature().ruleVersion,
    };
    $('#print-root').innerHTML = Pr.todayHtml(data);
    window.print();
  }
  function printRules() {
    const page = St.buildRuleTable({});
    const dims = (page.dims || []).map(d =>
      '<div class="pt-sec">' + esc(d.n) + '</div><table class="pt-table">' +
      '<tr><th>行为</th><th>分值</th><th>每天</th></tr>' +
      d.items.map(i => '<tr><td>' + esc(i.name) + (i.mine ? ' ★' : '') + '</td><td class="pt-num">+' + i.points +
        '</td><td class="pt-num">' + i.limit + '</td></tr>').join('') + '</table>').join('');
    const rws = (page.rewards || []).map(r =>
      '<tr><td>' + esc(r.title) + (r.mine ? ' ★' : '') + '</td><td class="pt-num">' + r.cost + ' 分</td><td class="pt-num">' + esc(r.tier || '') + '</td></tr>').join('');
    $('#print-root').innerHTML = '<div class="pt-page">' +
      '<div class="pt-head"><div class="pt-title">罗森塔尔 · 规则表</div>' +
      '<div class="pt-sub">' + esc(page.nick || '') + ' · ' + esc(page.stageName || '') + '</div></div>' +
      dims +
      '<div class="pt-sec">奖励档位</div><table class="pt-table"><tr><th>奖励</th><th>分值</th><th>档位</th></tr>' + rws + '</table>' +
      '<div class="pt-stats">每天上限 ' + page.cap + ' 分</div>' +
      '<div class="pt-sign"><div class="pt-signrow">她签名：____________　　家长签名：____________　　日期：____________</div></div>' +
      '<div class="pt-quote">规则是全家一起定的；改过的地方标 ★。只记做到的事。</div>' +
      '</div>';
    window.print();
  }
  function printWeek() {
    const page = St.buildWeekPage({});
    page.lifetime = St.lifetime();
    page.balance = St.balance();
    const wk = page.pdfPayload && page.pdfPayload.week;
    if (wk) wk.keepDisplay = (wk.keep === St.KEEP_CUSTOM)
      ? (wk.keepCustom || '（待补）') : (wk.keep || '（这一周没选）');
    $('#print-root').innerHTML = Pr.weekHtml(page);
    window.print();
  }

  /* ---------------- 主渲染 ---------------- */
  function render() {
    const s = St.state();
    const rootEl = $('#root');
    if (needsOnboarding(s)) { rootEl.innerHTML = onboardingHtml(); return; }
    let body = '';
    if (tab === 'today') body = todayView(s);
    else if (tab === 'rules') body = rulesView(s);
    else if (tab === 'rewards') body = rewardsView(s);
    else if (tab === 'week') body = weekView(s);
    else if (tab === 'parent') { parentView(s).then(html => { rootEl.innerHTML = headerHtml(s) + '<main class="tabs-body">' + html + '</main>' + tabbarHtml(); }); return; }
    rootEl.innerHTML = headerHtml(s) + '<main class="tabs-body">' + body + '</main>' + tabbarHtml();
  }

  /* ---------------- 事件分发 ---------------- */
  document.addEventListener('click', e2 => {
    /* 点在遮罩上（模态框外）才关闭；点模态框内部继续走 data-act 分发 */
    if (e2.target && e2.target.classList && e2.target.classList.contains('mask')) { closeModal(); return; }
    const el = e2.target.closest ? e2.target.closest('[data-act]') : null;
    if (!el) return;
    const act = el.getAttribute('data-act');
    const id = el.getAttribute('data-id');
    const k = el.getAttribute('data-k');
    const v = el.getAttribute('data-v');
    const cost = Number(el.getAttribute('data-cost'));
    switch (act) {
      case 'tab': tab = el.getAttribute('data-tab'); closeModal(); render(); break;

      /* 首次 */
      case 'stage-pick': stagePick(k); break;
      case 'family-start': familyStart(); break;

      /* 今日 */
      case 'checkin': doCheckin(id); break;
      case 'proxy': guarded('家长代记需要密码', async () => St.parentRecord(id)); break;
      case 'undo': {
        const r = St.undo(el.getAttribute('data-uid'));
        if (r.ok) { render(); toast('已撤销'); } else toast(r.reason);
        break;
      }
      case 'flash-save': {
        const inp = $('#flash-in');
        const r = St.setFlash(inp ? inp.value : '');
        if (r.ok) { render(); toast('记下了'); }
        break;
      }
      case 'usecoupon': {
        const r = St.useCoupon(el.getAttribute('data-code'));
        if (r.ok) { render(); toast('用掉啦，好好享受'); } else toast(r.reason);
        break;
      }
      case 'print-today': printToday(); break;

      /* 规则 */
      case 'item-cost': itemCostModal(id); break;
      case 'item-cost-go': itemCostGo(); break;
      case 'item-remove': itemRemoveModal(id); break;
      case 'item-remove-go': itemRemoveGo(); break;
      case 'item-add': itemAddModal(); break;
      case 'item-add-go': {
        const r = itemAddGo();
        if (r === false) break;
        closeModal();
        guarded('新增行为项需要家长密码', async () => r);
        break;
      }
      case 'print-rules': printRules(); break;

      /* 奖励 */
      case 'redeem': redeemGo(cost, el.getAttribute('data-title')); break;
      case 'redeem-go': {
        closeModal();
        const rd = pending.redeem || { cost: cost, title: '' };
        const r = St.redeem(rd.cost, rd.title);
        if (r.ok) { render(); toast('兑好了！券码 ' + r.coupon.code); } else toast(r.reason);
        break;
      }
      case 'reward-title': rewardTitleModal(cost); break;
      case 'reward-title-go': {
        const title = (($('#rw-title') || {}).value || '').trim();
        closeModal();
        guarded('改奖励需要家长密码', async () => St.setRewardTitle(pending.rewardCost, title));
        break;
      }
      case 'reward-cost': rewardCostModal(cost); break;
      case 'reward-cost-go': {
        const nc = Number(($('#rw-cost') || {}).value || 0);
        closeModal();
        guarded('改奖励需要家长密码', async () => {
          const r = St.setRewardCost(pending.rewardCost, nc);
          return r.ok ? { ok: true, msg: '已更新为 ' + nc + ' 分' } : r;
        });
        break;
      }
      case 'reward-remove': rewardRemoveModal(cost); break;
      case 'reward-remove-go':
        closeModal();
        guarded('移除奖励档位需要家长密码', async () => {
          const r = St.removeReward(pending.rewardCost);
          return r.ok ? { ok: true, msg: '已移除这一档' } : r;
        });
        break;
      case 'reward-add': rewardAddModal(); break;
      case 'reward-add-go': {
        const r = rewardAddGo();
        if (!r || r.ok === false) break;
        closeModal();
        guarded('新增奖励需要家长密码', async () => r);
        break;
      }

      /* 周复盘 */
      case 'week-pick': {
        const r = St.pickHighlight(k || '');
        if (r.ok) render(); else toast(r.reason);
        break;
      }
      case 'week-unpick': { const r = St.unpickHighlight(v); if (r.ok) render(); else toast(r.reason); break; }
      case 'week-keep': { St.setWeekPatch({ keep: v }); render(); break; }
      case 'week-keep-custom': {
        St.setWeekPatch({ keep: St.KEEP_CUSTOM, keepCustom: (($('#keep-custom') || {}).value || '').trim() });
        render(); break;
      }
      case 'week-next-save': { St.setWeekPatch({ next: (($('#week-next') || {}).value || '').trim() }); render(); toast('记下了'); break; }
      case 'week-chal-save': { St.setWeekPatch({ challenge: (($('#week-chal') || {}).value || '').trim() }); render(); toast('记下了'); break; }
      case 'week-finish': weekFinish(); break;
      case 'week-continue': { St.resetWeek(); weekBigShown = false; render(); toast('新的一周，从一件小事开始'); break; }
      case 'print-week': printWeek(); break;

      /* 家长 */
      case 'pin-setup':
        Pin.pinStatus().then(st2 => {
          if (st2.has) toast('已经设置过了，用「修改密码」');
          else requirePin('设置家长密码', () => {});
        });
        break;
      case 'pin-change': pinChangeModal(); break;
      case 'pin-change-go': pinChangeGo(); break;
      case 'pin-forgot': pinForgot(); break;
      case 'pin-forgot-page': pinForgot(); break;
      case 'rec-verify': recVerify(); break;
      case 'rec-ack': recAck(); break;
      case 'pin-go': pinGo(); break;
      case 'export-rules': exportRulesCsv(); break;
      case 'export-ledger': exportLedgerCsv(); break;
      case 'export-backup': exportBackup(); break;
      case 'import-backup': importBackup(); break;
      case 'wipe': wipeAsk(); break;
      case 'wipe-go': wipeGo(); break;
      case 'stage-switch':
        closeModal();
        guarded('切换学段需要家长密码', async () => {
          St.applyStage(k);
          autoAgree();
          return { ok: true, msg: '已切换到' + St.stageOf(k).n };
        });
        break;
      case 'modal-close': closeModal(); break;
      default: break;
    }
  });
  document.addEventListener('keydown', e2 => {
    if (e2.key === 'Enter') {
      const ae = document.activeElement;
      if (ae && (ae.id === 'pin-in' || ae.id === 'pin-in2')) { e2.preventDefault(); pinGo(); }
      else if (ae && ae.id === 'rec-in') { e2.preventDefault(); recVerify(); }
    }
  });
  document.addEventListener('change', e2 => {
    if (e2.target && e2.target.id === 'imp-file') onImportFile(e2);
  });

  /* ---------------- 启动 ---------------- */
  /* 尽力申请持久化存储：Android WebView 在低存储压力下更不容易回收本地数据。
     浏览器不支持时是 no-op，失败也不影响使用（数据主权仍靠导出备份兜底）。 */
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e3) { /* no-op */ }

  /* Capacitor（Android 壳）里：返回键先关模态框，避免在弹窗中直接退出应用。
     浏览器里 window.Capacitor 不存在，整段是 no-op。 */
  const CapApp = (typeof window !== 'undefined' && window.Capacitor &&
    window.Capacitor.Plugins && window.Capacitor.Plugins.App) || null;
  if (CapApp && typeof CapApp.addListener === 'function') {
    CapApp.addListener('backButton', () => {
      if ($('#modal-root').innerHTML) { closeModal(); return; }
      if (typeof CapApp.exitApp === 'function') CapApp.exitApp();
    });
  }

  St.load('mid');
  render();
})();
