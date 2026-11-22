/* ============================================================
   罗森塔尔 · 网页版（P1 前端，零构建 vanilla）
   登录后可用。视图：介绍 → 今天 / 成长 / 兑换 / 周复盘 / 规则 / 家长端。
   所有写操作都打到 /api，红线由服务端引擎强制。
   ============================================================ */
'use strict';

const $ = (s) => document.querySelector(s);

const state = {
  mode: 'loading',            // loading | auth | family | intro | app
  authMode: 'login',
  me: null,
  family: null,
  stage: null,
  tab: 'today',
};

let CACHE = {};               // 各页数据缓存

/* ---------------- 工具 ---------------- */
function esc(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2400);
}
function openSheet(html) { $('#sheet-body').innerHTML = html; $('#mask').hidden = false; $('#sheet').hidden = false; }
function closeSheet() { $('#mask').hidden = true; $('#sheet').hidden = true; }

async function api(path, method, body) {
  const res = await fetch('/api' + path, {
    method: method || 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch (e) { /* empty */ }
  if (!res.ok) { const err = new Error((data && data.error) || ('HTTP ' + res.status)); err.data = data || {}; throw err; }
  return data || {};
}

/* ---------------- 启动 ---------------- */
async function boot() {
  try {
    const me = await api('/me');
    state.me = me.user; state.family = me.family; state.stage = me.stage;
  } catch (e) { state.me = null; state.family = null; }
  if (!state.me) { state.mode = 'auth'; render(); return; }
  if (!state.family) { state.mode = 'family'; render(); return; }
  await enterApp();
}

async function enterApp() {
  const t = await api('/today');
  CACHE.today = t;
  if (!t.introSeen) { state.mode = 'intro'; render(); return; }
  state.mode = 'app';
  render();
  loadTab(state.tab);
}

/* ---------------- 渲染分发 ---------------- */
function render() {
  $('#who').innerHTML = state.me
    ? esc(state.me.nickname) + ' <button class="link" id="logout">退出</button>'
    : '';
  const v = $('#view');
  const tabs = $('#tabbar');
  if (state.mode === 'app') {
    tabs.hidden = false;
    [...tabs.querySelectorAll('button')].forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  } else { tabs.hidden = true; }

  if (state.mode === 'auth') v.innerHTML = authView();
  else if (state.mode === 'family') v.innerHTML = familyEmptyView();
  else if (state.mode === 'intro') v.innerHTML = introView();
  else if (state.mode === 'app') v.innerHTML = CACHE[state.tab + 'Html'] || '<div class="card"><p>加载中…</p></div>';
  else v.innerHTML = '<div class="card"><p>加载中…</p></div>';
  bind();
}

function setTabHtml(name, html) { CACHE[name + 'Html'] = html; }

/* ---------------- 登录 / 家庭 ---------------- */
function authView() {
  const isLogin = state.authMode === 'login';
  return `
    <div class="card">
      <h2>${isLogin ? '登录' : '注册'}</h2>
      <p>${isLogin ? '用你的账号继续。' : '先建一个账号，再创建或加入家庭。'}</p>
      <div class="tabs">
        <button class="${isLogin ? 'on' : ''}" data-authmode="login">登录</button>
        <button class="${!isLogin ? 'on' : ''}" data-authmode="register">注册</button>
      </div>
      <label>用户名</label>
      <input class="field" id="au-name" maxlength="20" autocomplete="username" placeholder="3–20 位字母/数字/下划线">
      <label>密码</label>
      <input class="field" id="au-pass" type="password" maxlength="64" autocomplete="${isLogin ? 'current-password' : 'new-password'}" placeholder="至少 6 位">
      ${isLogin ? '' : '<label>昵称</label><input class="field" id="au-nick" maxlength="20" placeholder="例：月亮 / 妈妈">'}
      <div class="err" id="au-err"></div>
      <button class="btn btn--primary btn--block" id="au-go" style="margin-top:6px">${isLogin ? '登录' : '注册并进入'}</button>
    </div>`;
}

function familyEmptyView() {
  return `
    <div class="card">
      <h2>创建一个家庭</h2>
      <p>你会成为这个家庭的管理者（家长）。学段决定规则模板与每日上限。</p>
      <label>家庭名称</label>
      <input class="field" id="fam-name" maxlength="20" placeholder="例：我们的家">
      <label>孩子学段</label>
      <select class="field" id="fam-stage">
        <option value="p12">小学低段 · 1–3 年级（上限 8 分）</option>
        <option value="p36">小学高段 · 4–6 年级（上限 10 分）</option>
        <option value="mid" selected>初中 · 7–9 年级（上限 12 分）</option>
        <option value="high">高中 · 10–12 年级（上限 12 分）</option>
      </select>
      <div class="err" id="fam-create-err"></div>
      <button class="btn btn--primary" id="fam-create" style="margin-top:10px">创建家庭</button>
    </div>
    <div class="card">
      <h2>用邀请码加入</h2>
      <p>已有家人创建过？输入他给你的 6 位邀请码。</p>
      <label>邀请码</label>
      <input class="field" id="fam-code" maxlength="12" placeholder="例：K7M2QP" style="text-transform:uppercase">
      <div class="err" id="fam-join-err"></div>
      <button class="btn btn--ghost" id="fam-join" style="margin-top:10px">加入家庭</button>
    </div>`;
}

/* ---------------- 介绍页 ---------------- */
function introView() {
  return `
    <div class="card">
      <div class="kicker">ROSENTHAL · 期望的力量</div>
      <h2 style="font-size:22px">罗森塔尔效应</h2>
      <p class="lead">你怎么看一个人，他就可能慢慢长成那个样子。</p>
      <p>1968 年，心理学家罗森塔尔随机挑了几个学生，却告诉老师「这几个孩子很有潜力」。一学期后，这几个孩子真的进步得更多。变化不在孩子身上，而在老师身上：更耐心、给更多机会、更相信他们。</p>
      <p>所以这一版：<b>只加分，不扣分</b>；不拿你和谁比，只和昨天比；看到的是「做到了什么」。</p>
      <button class="btn btn--primary btn--block" id="intro-go" style="margin-top:8px">开始</button>
    </div>`;
}

/* ---------------- 今天 ---------------- */
function todayHtml(t) {
  const items = t.dims.map(d => `
    <div class="card dim-${d.k}">
      <div class="card__t">${esc(d.n)}</div>
      <div class="list mt-2">
        ${d.items.map(i => `
          <button class="item ${i.maxed ? 'item--done' : ''}" data-check="${i.id}">
            <span class="item__p">+${i.points}</span>
            <span class="item__b"><span class="item__n">${esc(i.name)}</span><span class="item__m">今日 ${i.used}/${i.limit}${i.maxed ? ' · 够了' : ''}</span></span>
            <span class="item__x">${i.maxed ? '✓' : '＋'}</span>
          </button>`).join('')}
      </div>
    </div>`).join('');
  const banner = t.active ? '' :
    `<div class="card warn"><b>规则还没生效</b><p>去「规则」把这份表改成你自己的（改满 3 处），再让家长点一次「我按你的版本来」。</p></div>`;
  return `
    <div class="card hero">
      <div class="row row--between">
        <div><div class="big">${t.score}<small>/${t.cap}</small></div><div class="card__d">今天已得</div></div>
        <div class="stats">
          <div><b>${t.streak}</b><span>连续（天）</span></div>
          <div><b>${t.weekScore}</b><span>本周</span></div>
          <div><b>${t.lifetime}</b><span>累计</span></div>
        </div>
      </div>
    </div>
    ${banner}
    ${items}`;
}

/* ---------------- 成长 ---------------- */
function growthHtml(g) {
  return `
    <div class="card">
      <div class="row row--between">
        <div><div class="big">${g.lifetime}</div><div class="card__d">累计获得（不会因兑换变少）</div></div>
        <div class="stats"><div><b>${g.balance}</b><span>可用余额</span></div><div><b>${g.streak}</b><span>连续（天）</span></div></div>
      </div>
    </div>
    <div class="card">
      <div class="card__t">五个维度</div>
      ${g.dims.map(d => `<div class="bar-row"><span>${esc(d.n)}</span><i style="width:${g.lifetime ? Math.round(d.v / g.lifetime * 100) : 0}%"></i><b>${d.v}</b></div>`).join('')}
    </div>
    <div class="card">
      <div class="card__t">记录流水</div>
      <div class="list mt-2">
        ${g.timeline.length ? g.timeline.map(l => `
          <div class="tl">
            <div class="tl__b"><div class="tl__n">${esc(l.name)}${l.private ? ' <span class="chip">仅自己可见</span>' : ''}${l.byParent ? ' <span class="chip">家长代记</span>' : ''}</div>
            <div class="card__d">${esc(l.date)} · ${esc(l.dim)} +${l.points}</div></div>
            ${l.canUndo ? `<button class="link" data-undo="${l.uid}">撤销</button>` : ''}
          </div>`).join('') : '<div class="card__d">还没有记录。今天晚上记一条，这条时间轴就开始长了。</div>'}
      </div>
    </div>`;
}

/* ---------------- 兑换 ---------------- */
function shopHtml(s) {
  return `
    <div class="card">
      <div class="row row--between">
        <div><div class="big">${s.balance}</div><div class="card__d">可用余额</div></div>
        <div><div class="big">${s.lifetime}</div><div class="card__d">累计获得</div></div>
      </div>
    </div>
    ${s.rewards.map(r => `
      <div class="card row row--between">
        <div><span class="chip">${r.cost} 分</span> <b>${esc(r.title)}</b><div class="card__d">${esc(r.tier || '')}</div></div>
        <button class="btn ${s.balance >= r.cost ? 'btn--primary' : ''}" ${s.balance >= r.cost ? `data-redeem="${r.cost}"` : 'disabled'}>${s.balance >= r.cost ? '兑换' : '还差 ' + (r.cost - s.balance)}</button>
      </div>`).join('')}
    <div class="card">
      <div class="card__t">我的券</div>
      <div class="list mt-2">
        ${s.coupons.length ? s.coupons.map(c => `
          <div class="tl"><div class="tl__b"><div class="tl__n">${esc(c.title)}</div>
          <div class="card__d">${c.used ? '已使用' : '有效期至 ' + esc(c.exp) + ' · 家长不能撤回'}</div>
          <div class="code sm">${esc(c.code)}</div></div>
          ${c.used ? '' : `<button class="link" data-usecoupon="${esc(c.code)}">使用</button>`}</div>`).join('')
        : '<div class="card__d">还没有券。攒够了就来换一张。</div>'}
      </div>
    </div>`;
}

/* ---------------- 周复盘 ---------------- */
function weekHtml(w) {
  if (w.week) {
    const k = w.week;
    return `
      <div class="card">
        <div class="kicker">WEEKLY · ${esc(k.range)}</div>
        <h2>这一周做到了</h2>
        <div class="report__hl"><div><b>${k.score}</b><span>本周得分</span></div><div><b>${k.days}</b><span>有记录天数</span></div><div><b>+${k.bonus}</b><span>周奖励</span></div></div>
        <p class="card__d mt-2">${(k.highlights || []).length ? k.highlights.map(esc).join('；') : '这一周没写印象最深的事。'}</p>
        ${k.next ? '<p class="card__d">下周只改一件小事：' + esc(k.next) + '</p>' : ''}
        <button class="btn btn--ghost btn--block mt-3" id="export-week">导出 / 打印一周一页</button>
      </div>`;
  }
  return `
    <div class="card">
      <h2>周复盘</h2>
      <p>只改一件小事，写下来就行。做不到也不扣分。</p>
      <label>这周想记住的一件事（可留空）</label>
      <input class="field" id="wk-hl" maxlength="80" placeholder="例：数学最后一题我自己想出来了">
      <label>想保留的习惯</label>
      <input class="field" id="wk-keep" maxlength="40" placeholder="例：先复习再写作业">
      <label>下周只改一件小事</label>
      <input class="field" id="wk-next" maxlength="60" placeholder="例：写作业前先把手机放到客厅">
      <label>想挑战的新任务（做了 +5，做不到不扣分）</label>
      <input class="field" id="wk-ch" maxlength="60" placeholder="例：自己定一个复习清单">
      <button class="btn btn--primary btn--block" id="wk-go" style="margin-top:12px">就这么定</button>
    </div>`;
}

/* ---------------- 规则共建 ---------------- */
function rulesHtml(R) {
  const item = (i) => `
    <div class="tl"><div class="tl__b"><div class="tl__n">+${i.points} ${esc(i.name)}${i.customBy ? ' <span class="chip">你改过</span>' : ''}</div>
      <div class="card__d">每天最多 ${i.limit} 次</div></div>
      <span class="rule-acts">
        <button class="link" data-item-plus="${i.id}">+1</button>
        <button class="link" data-item-minus="${i.id}">-1</button>
        <button class="link" data-item-del="${i.id}">删</button>
      </span></div>`;
  return `
    <div class="card">
      <div class="row row--between"><h2 style="margin:0">规则共建 · 必改 3 项</h2><span class="chip ${R.amended >= 3 ? 'chip--jade' : ''}">已改 ${R.amended} / 3</span></div>
      <p>改分值、删或加行为项、改奖励内容——改满 3 处，再让家长签一次。</p>
      <button class="btn btn--primary btn--block" id="rules-finish" ${R.canFinish ? '' : 'disabled'}>${R.canFinish ? '提交提案，给家长确认' : '还差 ' + (3 - R.amended) + ' 处'}</button>
      <div class="card__d mt-2">${R.sig.active ? '双方已确认 · v1.' + R.sig.ruleVersion + ' · ' + esc(R.sig.agreedDate) : '待家长签署'}</div>
      <button class="btn btn--ghost btn--block mt-3" id="export-rule">导出 / 打印规则表</button>
    </div>
    <div class="card">
      <div class="card__t">加一条你自己的（+1 处）</div>
      <div class="row mt-2"><input class="field grow" id="new-item" maxlength="40" placeholder="例：练吉他 20 分钟"><button class="btn btn--ghost" id="new-item-go">加入</button></div>
    </div>
    <div class="card">
      <div class="card__t">行为项（点 +1/-1 改分值，删掉不要的）</div>
      <div class="list mt-2">${R.items.filter(i => i.active !== false).map(item).join('')}</div>
    </div>
    <div class="card">
      <div class="card__t">奖励（可改分值 / 改内容 / 新增 / 删除）</div>
      <div class="list mt-2">
        ${R.rewards.map(r => `
          <div class="tl"><div class="tl__b"><div class="tl__n">${r.cost} 分 · ${esc(r.title)}${r.customBy ? ' <span class="chip">你改过</span>' : ''}</div>
            <div class="row mt-1"><input class="field grow" data-rw-title="${r.cost}" value="${esc(r.title)}" maxlength="60">
              <input class="field rw-cost" data-rw-cost="${r.cost}" value="${r.cost}" inputmode="numeric" title="改分值">
              <button class="link" data-rw-del="${r.cost}">删</button></div></div></div>`).join('')}
      </div>
      <div class="card__d mt-2">改奖励标题/分值后自动保存。</div>
      <div class="row mt-2"><input class="field rw-cost" id="new-rw-cost" inputmode="numeric" placeholder="分值"><input class="field grow" id="new-rw-title" maxlength="60" placeholder="新的奖励内容"><button class="btn btn--ghost" id="new-rw-go">加一档</button></div>
    </div>`;
}

/* ---------------- 家长端 ---------------- */
function parentPinSetHtml() {
  return `
    <div class="card">
      <h2>设置家长密码</h2>
      <p>进入家长端需要先输一次这个密码（4–8 位数字）。它和登录密码分开，孩子不知道也进不来。</p>
      <label>家长密码</label>
      <input class="field" id="pa-pin1" type="password" inputmode="numeric" maxlength="8" placeholder="4–8 位数字">
      <button class="btn btn--primary btn--block" id="pa-setpin" style="margin-top:10px">设置并进入</button>
    </div>`;
}
function parentUnlockHtml() {
  return `
    <div class="card">
      <h2>进入家长端</h2>
      <p>请输入家长密码。</p>
      <input class="field" id="pa-pin" type="password" inputmode="numeric" maxlength="8" placeholder="家长密码">
      <button class="btn btn--primary btn--block" id="pa-unlock" style="margin-top:10px">解锁家长端</button>
      <div class="err" id="pa-err"></div>
    </div>`;
}

function parentHtml(p) {
  const sign = p.sig.active
    ? `<div class="card"><div class="card__t">规则已生效</div><p>v1.${p.sig.ruleVersion} · ${esc(p.sig.agreedDate)} 双方已确认。</p></div>`
    : (p.sig.amended >= 3
      ? `<div class="card warn"><b>待你签署</b><p>孩子已改满 3 处。你签的是「我按你的版本来」，签完仍然不能删她的记录、不能撤回券。</p>
         <button class="btn btn--primary" id="pa-agree">我按你的版本来</button></div>`
      : `<div class="card"><div class="card__t">等孩子改规则</div><p>她改满 3 处后，这里会出现签署按钮。</p></div>`);

  return `
    <div class="row row--between" style="margin-bottom:8px">
      <span class="card__d">家长端 · 只读正向记录</span>
      <button class="btn btn--ghost" id="pa-lock">锁定（下次要重新输密码）</button>
    </div>
    ${sign}
    <div class="card">
      <div class="card__t">待确认（${p.pending.length}）</div>
      <p class="card__d">你只能看到「她做到了什么」。她标了私密的，这里不会出现；你也没有删除权限。</p>
      <div class="list mt-2">
        ${p.pending.length ? p.pending.map(l => `
          <div class="tl"><div class="tl__b"><div class="tl__n">${esc(l.name)} <span class="chip">+${l.points}</span>${l.byParent ? ' <span class="chip">家长代记</span>' : ''}</div>
            <div class="card__d">${esc(l.date)} · ${esc(l.dim)}</div>${l.praise ? '<div class="card__d">照这句念给她听：' + esc(l.praise) + '</div>' : ''}</div>
            <button class="link" data-confirm="${l.uid}">确认</button></div>`).join('')
        : '<div class="card__d">都确认过了。</div>'}
      </div>
      ${p.pending.length ? '<button class="btn btn--ghost mt-2" id="pa-confirm-all">全部确认</button>' : ''}
      ${p.hidden > 0 ? `<div class="card__d mt-2">另有 ${p.hidden} 条她设成了「仅自己可见」—— 这一页不显示它们的内容。</div>` : ''}
    </div>`;
}

/* ---------------- 事件绑定 ---------------- */
function bind() {
  document.querySelectorAll('[data-authmode]').forEach(b => { b.onclick = () => { state.authMode = b.dataset.authmode; render(); }; });
  const go = $('#au-go'); if (go) go.onclick = onAuthGo;
  const c = $('#fam-create'); if (c) c.onclick = onCreateFamily;
  const j = $('#fam-join'); if (j) j.onclick = onJoinFamily;
  const logout = $('#logout'); if (logout) logout.onclick = onLogout;
  const intro = $('#intro-go'); if (intro) intro.onclick = onIntroSeen;

  document.querySelectorAll('#tabbar button').forEach(b => {
    b.onclick = () => { state.tab = b.dataset.tab; render(); loadTab(state.tab); };
  });

  document.querySelectorAll('[data-check]').forEach(b => { b.onclick = () => onCheckin(b.dataset.check); });
  document.querySelectorAll('[data-undo]').forEach(b => { b.onclick = () => onUndo(b.dataset.undo); });
  document.querySelectorAll('[data-redeem]').forEach(b => { b.onclick = () => onRedeem(Number(b.dataset.redeem)); });
  document.querySelectorAll('[data-usecoupon]').forEach(b => { b.onclick = () => onUseCoupon(b.dataset.usecoupon); });

  const wk = $('#wk-go'); if (wk) wk.onclick = onWeekFinish;
  document.querySelectorAll('[data-confirm]').forEach(b => { b.onclick = () => onConfirm(b.dataset.confirm); });
  const ca = $('#pa-confirm-all'); if (ca) ca.onclick = () => onConfirm(null);
  const ag = $('#pa-agree'); if (ag) ag.onclick = onAgree;
  const setpin = $('#pa-setpin'); if (setpin) setpin.onclick = onSetPin;
  const unlock = $('#pa-unlock'); if (unlock) unlock.onclick = onUnlock;
  const lock = $('#pa-lock'); if (lock) lock.onclick = onLockParent;
  const er = $('#export-rule'); if (er) er.onclick = () => onExport('rule');
  const ew = $('#export-week'); if (ew) ew.onclick = () => onExport('week');

  const fin = $('#rules-finish'); if (fin) fin.onclick = onRulesFinish;
  document.querySelectorAll('[data-item-plus]').forEach(b => { b.onclick = () => onItemPoints(b.dataset.itemPlus, +1); });
  document.querySelectorAll('[data-item-minus]').forEach(b => { b.onclick = () => onItemPoints(b.dataset.itemMinus, -1); });
  document.querySelectorAll('[data-item-del]').forEach(b => { b.onclick = () => onItemRemove(b.dataset.itemDel); });
  const ni = $('#new-item-go'); if (ni) ni.onclick = onItemAdd;
  document.querySelectorAll('[data-rw-del]').forEach(b => { b.onclick = () => onRewardRemove(Number(b.dataset.rwDel)); });
  const nr = $('#new-rw-go'); if (nr) nr.onclick = onRewardAdd;
  document.querySelectorAll('[data-rw-title]').forEach(inp => { inp.onchange = () => onRewardTitle(Number(inp.dataset.rwTitle), inp.value); });
  document.querySelectorAll('[data-rw-cost]').forEach(inp => { inp.onchange = () => onRewardCost(Number(inp.dataset.rwCost), Number(inp.value)); });

  const mask = $('#mask'); if (mask) mask.onclick = closeSheet;
}

/* ---------------- 行为 ---------------- */
async function onAuthGo() {
  const name = ($('#au-name').value || '').trim();
  const pass = $('#au-pass').value || '';
  const errEl = $('#au-err'); errEl.textContent = '';
  const btn = $('#au-go'); btn.disabled = true;
  try {
    const r = state.authMode === 'login'
      ? await api('/auth/login', 'POST', { username: name, password: pass })
      : await api('/auth/register', 'POST', { username: name, password: pass, nickname: ($('#au-nick').value || '').trim() });
    state.me = r.user;
    const f = await api('/family');
    if (f.family) { state.family = { id: f.family.id, role: f.role }; await enterApp(); }
    else { state.mode = 'family'; render(); }
    toast('欢迎回来，' + state.me.nickname);
  } catch (e) { errEl.textContent = e.message; btn.disabled = false; }
}
async function onCreateFamily() {
  const errEl = $('#fam-create-err'); errEl.textContent = '';
  const btn = $('#fam-create'); btn.disabled = true;
  try {
    const r = await api('/family', 'POST', { name: ($('#fam-name').value || '').trim(), stage: $('#fam-stage').value });
    state.family = { id: r.family.id, role: 'parent' }; state.stage = r.stage;
    await enterApp(); toast('家庭创建好了');
  } catch (e) { errEl.textContent = e.message; btn.disabled = false; }
}
async function onJoinFamily() {
  const errEl = $('#fam-join-err'); errEl.textContent = '';
  try {
    await api('/family/join', 'POST', { invite_code: ($('#fam-code').value || '').trim() });
    const me = await api('/me'); state.family = me.family; state.stage = me.stage;
    await enterApp(); toast('加入成功');
  } catch (e) { errEl.textContent = e.message; }
}
async function onLogout() {
  try { await api('/auth/logout', 'POST'); } catch (e) { /* ignore */ }
  state.me = null; state.family = null; state.mode = 'auth'; state.authMode = 'login'; CACHE = {}; render();
}
async function onIntroSeen() { await api('/intro/seen', 'POST'); CACHE = {}; await enterApp(); }

async function loadTab(tab) {
  try {
    if (tab === 'today') { CACHE.today = await api('/today'); setTabHtml('today', todayHtml(CACHE.today)); }
    else if (tab === 'growth') { setTabHtml('growth', growthHtml(await api('/growth'))); }
    else if (tab === 'shop') { setTabHtml('shop', shopHtml(await api('/rewards'))); }
    else if (tab === 'week') { setTabHtml('week', weekHtml(await api('/week'))); }
    else if (tab === 'rules') { setTabHtml('rules', rulesHtml(await api('/rules'))); }
    else if (tab === 'parent') { await loadParentTab(); }
  } catch (e) { setTabHtml(tab, '<div class="card warn">' + esc(e.message) + '</div>'); }
  if (state.mode === 'app' && state.tab === tab) render();
}

/* 家长端：先过「家长密码」这一关 */
async function loadParentTab() {
  let st;
  try { st = await api('/parent/status'); }
  catch (e) { setTabHtml('parent', '<div class="card warn">' + esc(e.message) + '</div>'); return; }
  if (!st.hasPin) { setTabHtml('parent', parentPinSetHtml()); return; }
  if (!st.unlocked) { setTabHtml('parent', parentUnlockHtml()); return; }
  setTabHtml('parent', parentHtml(await api('/parent/pending')));
}

async function onCheckin(itemId) {
  try {
    const r = await api('/checkin', 'POST', { itemId });
    openSheet(`<div class="kicker">今天这一条 · ${esc(r.dim)}</div>
      <p class="praise">我看到你<em>${esc(r.fact)}</em>，这说明<em>${esc(r.trait)}</em>。</p>
      <p class="card__d">+${r.entry.points} 分已入账。今天 ${r.score}/${r.cap}。</p>
      <button class="btn btn--primary btn--block mt-2" id="praise-ok">好，收下</button>`);
    $('#praise-ok').onclick = () => { closeSheet(); loadTab('today'); };
  } catch (e) { toast(e.message); loadTab('today'); }
}
async function onUndo(uid) { try { await api('/undo', 'POST', { uid }); toast('已撤销'); loadTab('growth'); } catch (e) { toast(e.message); } }
async function onRedeem(cost) {
  try {
    const r = await api('/redeem', 'POST', { cost });
    openSheet(`<div class="kicker">券已生成</div><div class="card"><b>${esc(r.coupon.title)}</b>
      <div class="card__d">有效期至 ${esc(r.coupon.exp)} · 家长不能撤回</div><div class="code">${esc(r.coupon.code)}</div></div>
      <button class="btn btn--primary btn--block" id="cp-ok">好</button>`);
    $('#cp-ok').onclick = () => { closeSheet(); loadTab('shop'); };
  } catch (e) { toast(e.message); }
}
async function onUseCoupon(code) { try { await api('/coupon/use', 'POST', { code }); toast('已使用'); loadTab('shop'); } catch (e) { toast(e.message); } }
async function onWeekFinish() {
  try {
    const hl = ($('#wk-hl').value || '').trim();
    await api('/week/finish', 'POST', {
      highlights: hl ? [hl] : [],
      keep: ($('#wk-keep').value || '').trim(),
      next: ($('#wk-next').value || '').trim(),
      challenge: ($('#wk-ch').value || '').trim(),
    });
    toast('周报生成好了'); loadTab('week');
  } catch (e) { toast(e.message); }
}
async function onConfirm(uid) {
  try {
    await api('/parent/confirm', 'POST', uid ? { uids: [uid] } : { all: true });
    toast('已确认'); loadTab('parent');
  } catch (e) { toast(e.message); }
}
async function onAgree() { try { await api('/parent/agree', 'POST'); toast('规则已生效'); loadTab('parent'); } catch (e) { toast(e.message); } }
async function onRulesFinish() {
  try { await api('/rules/finish', 'POST'); toast('提案提交好了，请家长签署'); loadTab('rules'); }
  catch (e) { toast(e.message); }
}
async function onItemPoints(id, d) {
  const R = await api('/rules');
  const it = R.items.find(x => x.id === id);
  if (!it) return;
  const next = Math.max(1, Math.min(5, it.points + d));
  try { await api('/rules/item/points', 'POST', { id, points: next }); loadTab('rules'); } catch (e) { toast(e.message); }
}
async function onItemRemove(id) { try { await api('/rules/item/remove', 'POST', { id }); toast('删掉了'); loadTab('rules'); } catch (e) { toast(e.message); } }
async function onItemAdd() {
  const name = ($('#new-item').value || '').trim();
  if (!name) { toast('先写一句'); return; }
  try { await api('/rules/item', 'POST', { name, points: 2 }); toast('加好了'); loadTab('rules'); } catch (e) { toast(e.message); }
}
async function onRewardTitle(cost, title) { try { await api('/rules/reward/title', 'POST', { cost, title }); toast('记下了'); loadTab('rules'); } catch (e) { toast(e.message); } }
async function onRewardCost(cost, newCost) {
  if (!newCost || newCost === cost) return;
  try { await api('/rules/reward/cost', 'POST', { cost, newCost }); toast('分值改好了'); loadTab('rules'); } catch (e) { toast(e.message); }
}
async function onRewardAdd() {
  const cost = Number($('#new-rw-cost').value);
  const title = ($('#new-rw-title').value || '').trim();
  try { await api('/rules/reward', 'POST', { cost, title }); toast('加了一档'); loadTab('rules'); } catch (e) { toast(e.message); }
}
async function onRewardRemove(cost) { try { await api('/rules/reward/remove', 'POST', { cost }); toast('删掉了'); loadTab('rules'); } catch (e) { toast(e.message); } }

/* ---------------- 家长密码 ---------------- */
async function onSetPin() {
  const pin = ($('#pa-pin1').value || '').trim();
  try { await api('/parent/pin', 'POST', { pin }); toast('家长密码已设置'); loadTab('parent'); }
  catch (e) { toast(e.message); }
}
async function onUnlock() {
  const pin = ($('#pa-pin').value || '').trim();
  try { await api('/parent/unlock', 'POST', { pin }); loadTab('parent'); }
  catch (e) { const el = $('#pa-err'); if (el) el.textContent = e.message; }
}
async function onLockParent() { try { await api('/parent/lock', 'POST'); toast('已锁定，下次要重新输密码'); loadTab('parent'); } catch (e) { toast(e.message); } }

/* ---------------- 导出 / 打印（免费 10 次 → 赞助） ---------------- */
async function onExport(kind) {
  try {
    const r = await api('/export/consume', 'POST', {});
    await doPrint(kind);
    toast(r.unlimited ? '已打开打印（赞助不限次）' : ('已打开打印（还剩 ' + r.quota.remain + ' 次）'));
  } catch (e) {
    if (e.data && e.data.needSponsor) openSponsorSheet();
    else toast(e.message);
  }
}
async function doPrint(kind) {
  let html = '';
  if (kind === 'rule') { html = rulePrintHtml(await api('/rules'), (CACHE.today && CACHE.today.cap) || ''); }
  else { html = weekPrintHtml(await api('/week')); }
  const w = window.open('', '_blank');
  if (!w) { toast('浏览器拦了新窗口，请允许弹窗后再试'); return; }
  w.document.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>罗森塔尔</title>' +
    '<style>body{font:13px/1.7 -apple-system,"PingFang SC",sans-serif;color:#2b2622;margin:24px}' +
    'h1{font-size:20px;margin:0 0 4px}.sub{color:#7a7168;margin-bottom:14px}table{width:100%;border-collapse:collapse;margin:0 0 14px}' +
    'th,td{border:1px solid #d9d0c5;padding:5px 8px;font-size:12px;text-align:left}th{background:#f4ede3}.sign{margin-top:20px}</style>' +
    '</head><body>' + html + '</body></html>');
  w.document.close(); w.focus();
  setTimeout(() => { try { w.print(); } catch (e) { /* 用户取消 */ } }, 300);
}
function rulePrintHtml(R, cap) {
  const items = R.items.filter(i => i.active !== false);
  const itemRows = items.map(i => `<tr><td>+${i.points}</td><td>${esc(i.name)}</td><td>每天 ${i.limit} 次</td></tr>`).join('');
  const rewardRows = R.rewards.map(r => `<tr><td>${r.cost}</td><td>${esc(r.title)}</td><td>${esc(r.tier || '')}</td></tr>`).join('');
  return `<h1>罗森塔尔 · 规则表</h1>
    <div class="sub">${cap ? '每日上限 ' + cap + ' 分 · ' : ''}${items.length} 条行为 · ${R.rewards.length} 档奖励${R.sig && R.sig.active ? (' · v1.' + R.sig.ruleVersion + ' 双签生效') : ' · 待家长签署'}</div>
    <table><tr><th>分值</th><th>行为</th><th>每天</th></tr>${itemRows}</table>
    <table><tr><th>积分</th><th>奖励</th><th>类型</th></tr>${rewardRows}</table>
    <p class="sign">她签名：____________　　家长签名：____________　　日期：____________</p>`;
}
function weekPrintHtml(wd) {
  const k = wd.week || {};
  return `<h1>罗森塔尔 · 一周一页</h1>
    <div class="sub">${esc(k.range || '本周')} · 本周 ${wd.weekScore} 分 · 连续 ${wd.streak} 天</div>
    ${(k.highlights && k.highlights.length) ? '<p>印象最深：' + k.highlights.map(esc).join('；') + '</p>' : ''}
    ${k.keep ? '<p>想保留：' + esc(k.keep) + '</p>' : ''}
    ${k.next ? '<p>下周只改一件小事：' + esc(k.next) + '</p>' : ''}
    <p class="sign">她签名：____________　　家长签名：____________　　日期：____________</p>`;
}
async function openSponsorSheet() {
  let info = { qr: '/assets/pay.svg', note: '' };
  try { info = await api('/sponsor/info'); } catch (e) { /* 用默认 */ }
  openSheet(`<div class="kicker">赞助解锁导出 / 打印</div>
    <p class="card__d">${esc(info.note || '')}</p>
    <img class="qr" src="${esc(info.qr)}" alt="收款码">
    <input class="field" id="sp-code" placeholder="输入兑换码" style="text-transform:uppercase">
    <button class="btn btn--primary btn--block" id="sp-go">解锁</button>`);
  $('#sp-go').onclick = async () => {
    try { await api('/sponsor/redeem', 'POST', { code: $('#sp-code').value }); toast('已解锁，导出不限次'); closeSheet(); }
    catch (e) { toast(e.message); }
  };
}

boot();
