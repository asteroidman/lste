/* ============================================================
   冒烟测试（移植前回归用）
   用法：node _smoke.js
   作用：用最小 DOM 桩在 Node 里跑 app.js 的启动路径 + 规则引擎，
        验证「只加分 / 每日 12 分上限 / 必改 3 项」三条硬约束。
   注意：本文件只在开发期使用，不进小程序。
   ============================================================ */
const fs = require('fs'), path = require('path'), vm = require('vm');

const store = {};
function El(id) {
  return {
    id, innerHTML:'', textContent:'', value:'', hidden:false, disabled:false, onclick:null,
    dataset:{}, tagName:'DIV', style:{ setProperty(){} },
    classList:{ _s:new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
                toggle(c,f){ f ? this._s.add(c) : this._s.delete(c); }, contains(c){ return this._s.has(c); } },
    setAttribute(){}, getAttribute(){ return null; }, addEventListener(){}, removeEventListener(){},
    querySelector(){ return El('_q'); }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { left:10, top:20, width:100, height:40 }; },
    appendChild(c){ return c; }, insertAdjacentHTML(){}, remove(){}, closest(){ return null; }, focus(){},
  };
}
const reg = {};
const document = {
  querySelector(sel){ const k = sel.replace(/^#/, ''); return reg[k] || (reg[k] = El(k)); },
  querySelectorAll(){ return []; },
  createElement(tag){ const e = El('_' + tag); e.tagName = tag.toUpperCase(); return e; },
  addEventListener(){}, body:{ appendChild(){} },
};
const localStorage = { getItem:k => (k in store ? store[k] : null), setItem:(k,v) => { store[k] = String(v); }, removeItem:k => { delete store[k]; } };

const ctx = vm.createContext({ document, localStorage, console, setTimeout, clearTimeout, Date, Math, JSON, String, Number, Array, Object, RegExp, Error });
vm.runInContext(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'), ctx, { filename:'app.js' });

const el = id => document.querySelector('#' + id);
const html = id => (reg[id] ? reg[id].innerHTML : '');
const z = n => String(n).padStart(2, '0');
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
const load = () => JSON.parse(store['rosenthal.prototype.v1']);

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? (pass++, console.log('  PASS  ' + name)) : (fail++, console.log('  FAIL  ' + name + (extra ? '  → ' + extra : ''))); };

console.log('\n[1] 启动路径');
ok('今日维度渲染出学习力', html('dims').includes('学习力') && html('dims').includes('放学后 30 分钟内主动开始作业'));
ok('五个维度都在', ['学习力','生活力','身心力','社交力','自主力'].every(d => html('dims').includes(d)));
ok('得分环有数字', /^\d+$/.test(el('ringNum').textContent), el('ringNum').textContent);
ok('连续天数已计算', Number(el('statStreak').textContent) > 0, el('statStreak').textContent);
ok('累计获得分已计算', Number(el('statLife').textContent) > 0, el('statLife').textContent);
ok('热力图渲染', html('heat').includes('heat__c'));
ok('时间轴渲染 + 可撤销', html('timeline').includes('撤销这条'));
ok('里程碑渲染', html('miles').includes('连续 7 天'));
ok('奖励档位渲染', html('rewards').includes('还差') || html('rewards').includes('兑换'));
ok('券渲染', html('coupons').includes('RS-'));
ok('我的页昵称', el('meNick').textContent === '月亮');
ok('共建进度 3/3', el('amendChip').textContent.includes('3'), el('amendChip').textContent);
ok('家长端渲染', html('parentBody').includes('你只能看到'));
ok('规则页带改动归属', html('rulesBody').includes('月亮改的'));
ok('修复页渲染', html('repairBody').includes('手机超时'));
ok('周复盘向导是第 1 步', html('weekBody').includes('三件事'));
ok('演示态不该弹初始化遮罩', !el('build').classList.contains('is-on'));
ok('家长端没有可执行的删除/撤回控件', !/data-(del|remove|revoke)|>删除|>撤回/.test(html('parentBody')));

console.log('\n[2] 规则引擎：只加分 · 每日 12 分上限');
const before = Number(el('walLife').textContent);
const neg = ctx.addPoints({ itemId:null, name:'试图扣分', dim:'self', points:-5 });
ok('负数被拒绝', neg.ok === false, JSON.stringify(neg));
ok('余额未被扣减', Number(el('walLife').textContent) === before);
ctx.handleFlow('limit'); ctx.renderAll();
ok('日上限触达 12', Number(el('ringNum').textContent) === 12, el('ringNum').textContent);
const over = ctx.addPoints({ itemId:'s1', name:'超出', dim:'study', points:2 });
ok('满 12 分后再加分被拒绝', over.ok === false, JSON.stringify(over));
ok('超额提示文案正确', over.reason === '今天已经很棒了，剩下的留给明天', over.reason);
ok('超额时卡片提示可见', html('carry').includes('留给明天'));
ok('当日流水里没有任何负分', load().log.filter(l => l.date === todayKey()).every(l => l.points > 0));
ok('全部流水里没有任何负分', load().log.every(l => l.points > 0));

console.log('\n[3] 兑换与券：家长端无撤回能力');
ok('兑换走 spent 记账，不删历史流水', typeof load().spent === 'number');
ok('券码唯一且带有效期', load().coupons.every((c, i, a) => c.code && c.exp && a.findIndex(x => x.code === c.code) === i));
ok('奖励档位覆盖 20→300 八档', [20,40,60,80,120,160,220,300].every(c => html('rewards').includes('>' + c + '<')));

console.log('\n[4] 必改 3 项（重置 → 从 0 开始）');
ctx.handleFlow('reset');
ok('重置后先弹「关于罗森塔尔」介绍页（第一次打开的样子）', el('intro').classList.contains('is-on'));
ctx.introEnter();   // 看过介绍 → 未共建 → 进共建
ok('看过介绍后共建遮罩打开', el('build').classList.contains('is-on'));
ok('重置后计数归零', el('amendChip').textContent.includes('0'), el('amendChip').textContent);
ok('未改满时按钮禁用', el('buildDone').disabled === true);
ok('按钮提示还差什么', /还差/.test(el('buildDone').textContent), el('buildDone').textContent);
ok('重置后奖励回到模板（含 300 档）', html('buildBody').includes('20 分') && html('buildBody').includes('300 分'));
ok('重置后行为项回到 26 条模板', load().items.filter(i => i.active !== false).length === 26, String(load().items.filter(i => i.active !== false).length));

console.log('\n[5] 学段适配：小学 → 高中');
const cur = () => load().stage;
const maxTxt = () => String(el('ringMax').textContent);
const nItems = () => load().items.filter(i => i.active !== false).length;

/* 小学低段 */
ctx.applyStage('p12'); ctx.renderAll();
ok('切到小学低段', cur() === 'p12', cur());
ok('低段日上限降到 8', maxTxt() === '8', maxTxt());
ok('低段行为项 13 条', nItems() === 13, String(nItems()));
ok('低段奖励从 10 分起步', html('rewards').includes('>10<') && !html('rewards').includes('>300<'));
ok('低段规则含「自己穿衣服」这类可见动作', html('dims').includes('自己穿衣服'), '');
ok('换学段会重置必改计数', el('amendChip').textContent.includes('0'), el('amendChip').textContent);
ctx.handleFlow('limit'); ctx.renderAll();
const logBeforeSwitch = load().log.length;
ok('低段填满后为 8 分（不是 12）', String(el('ringNum').textContent) === '8', String(el('ringNum').textContent));
const overLow = ctx.addPoints({ itemId:'p1', name:'超出', dim:'study', points:1 });
ok('低段 8 分后拒绝加分', overLow.ok === false, JSON.stringify(overLow));
ok('低段超额卡片文案带 8 分', /8 分已经满了/.test(el('carry').innerHTML), el('carry').innerHTML);

/* 高中 */
ctx.applyStage('high'); ctx.renderAll();
ok('切到高中', cur() === 'high', cur());
ok('高中行为项 18 条', nItems() === 18, String(nItems()));
ok('高中保留「只加分」红线', ctx.addPoints({ itemId:'h1', name:'扣分试试', dim:'study', points:-3 }).ok === false);
ok('高中出现「允许自己休息一次」', html('dims').includes('允许自己休息一次'));
ok('高中出现压力与边界类条目', html('dims').includes('压力大时主动说出来') && html('dims').includes('守住自己的边界'));
ok('高中奖励档位到 500 元大件', html('rewards').includes('500'));
ok('高中不再出现幼稚小奖励', !html('rewards').includes('贴纸'));
ok('高中日上限回到 12', maxTxt() === '12', maxTxt());
ok('学段信息在「我的」页可见', el('meGrade').textContent.includes('高中') && el('stageChip').textContent.includes('12'), el('meGrade').textContent);
ok('切换学段不删历史记录', load().log.length === logBeforeSwitch && load().log.length > 0, `${logBeforeSwitch} → ${load().log.length}`);

/* 小学高段与初中 */
ctx.applyStage('p36'); ctx.renderAll();
ok('小学高段 16 条 / 上限 10', nItems() === 16 && maxTxt() === '10', `${nItems()} / ${maxTxt()}`);
ctx.applyStage('mid'); ctx.renderAll();
ok('切回初中 = 26 条 / 上限 12', nItems() === 26 && maxTxt() === '12', `${nItems()} / ${maxTxt()}`);

console.log('\n[6] 打印 / 下载：规则表与一周一页（四学段）');
ok('规则表包含行为清单与奖励档位',
   /行为清单/.test(ctx.ruleTableInner()) && /奖励档位/.test(ctx.ruleTableInner()));
ok('规则表带分值列与双签栏',
   /分值/.test(ctx.ruleTableInner()) && /她签名/.test(ctx.ruleTableInner()));
ok('一周一页带每日记录与双签栏',
   /每日记录/.test(ctx.weekPageInner()) && /她签名/.test(ctx.weekPageInner()));
ok('打印外壳是完整 HTML 文档（带打印样式）',
   /^<!doctype html>/.test(ctx.printShell('t', '')) && /@media print/.test(ctx.printShell('t', '')));
/* 四学段都按当前学段生成，上限随学段变 */
const printCaps = [];
let printOk = true;
['p12', 'p36', 'mid', 'high'].forEach(k => {
  ctx.applyStage(k); ctx.renderAll();
  const t = ctx.ruleTableInner();
  const n = load().items.filter(i => i.active !== false).length;
  printCaps.push(el('ringMax').textContent);
  if (!t.includes('每日上限 ' + el('ringMax').textContent + ' 分') || !t.includes('共 ' + n + ' 条')) printOk = false;
});
ok('四学段都能生成规则表，且随学段变', printOk, printCaps.join('/'));
ok('规则表日上限随学段（8/10/12/12）', printCaps.join(',') === '8,10,12,12', printCaps.join(','));
ctx.applyStage('mid'); ctx.renderAll();
ok('切回初中后上限回到 12', String(el('ringMax').textContent) === '12', String(el('ringMax').textContent));

console.log('\n[7] 首次介绍页（罗森塔尔效应）+ 低龄代记');
ctx.handleFlow('reset');
ctx.renderAll();
ok('首次/重置后会先弹「关于罗森塔尔」介绍页', el('intro').classList.contains('is-on'));
ok('介绍页与共建遮罩是两件事', !el('build').classList.contains('is-on'));
ok('介绍页正文讲的是罗森塔尔效应', /罗森塔尔效应/.test(html('introBody')) && /期望/.test(html('introBody')));
ctx.introEnter();
ok('点「开始」后介绍页关闭，未共建时进入共建',
   !el('intro').classList.contains('is-on') && el('build').classList.contains('is-on'));
ok('看过之后 introSeen 置位（不再每次打断）', load().introSeen === true);

/* 低龄代记：低段允许，初中拒绝 */
ctx.applyStage('p36'); ctx.renderAll();
const nBefore = load().log.length;
const pr = ctx.parentRecord('q1');
ok('小学高段允许家长「帮 TA 记一笔」，并盖 byParent 戳',
   pr.ok === true && pr.entry.byParent === true && load().log.length === nBefore + 1,
   JSON.stringify(pr.ok ? pr.entry : pr));
ok('家长代记守「单条每天一次」', ctx.parentRecord('q1').ok === false);
ok('家长代记只加分：负数仍被拒', ctx.addPoints({ points: -1 }).ok === false);
ok('低段今天页出现「让妈妈来记」入口', html('dims').includes('让妈妈来记'));
ctx.renderParent();
ok('家长端「待确认」出现「帮 TA 记一笔」', html('parentBody').includes('帮 TA 记一笔'));

ctx.applyStage('mid'); ctx.renderAll();
ok('初中今天页不出现代记入口（尊重自主权）', !html('dims').includes('让妈妈来记'));
const mr = ctx.parentRecord('s1');
ok('初中不允许代记并给出理由', mr.ok === false && /不代记/.test(mr.reason), JSON.stringify(mr));

console.log('\n[8] 免费试运行：导出免费 3 次 + 内测中');
ctx.handleFlow('reset');           // 回到初始，清零导出计数
ctx.openPrintSheet();
ok('打印面板显示剩余免费次数', /还剩/.test(html('sheetBody')) && /3/.test(html('sheetBody')));
ctx.consumeExport(); ctx.consumeExport(); ctx.consumeExport();
ctx.openPrintSheet();
ok('用满 3 次后面板提示「内测中」', /内测中/.test(html('sheetBody')));
ctx.doPrint('rule');
ok('用满后点导出只提示内测中（不出图 / 不下载）', /内测中/.test(el('toast').textContent));

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
