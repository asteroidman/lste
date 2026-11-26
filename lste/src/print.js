/* ============================================================
   罗森塔尔 · 单文件家庭版 · 打印版面（纯字符串，零 DOM 依赖）
   - todayHtml(data)：今日卡
   - weekHtml(page)：一周一页（数据来自引擎 buildWeekPage()）
   返回 HTML 字符串，由 app.js 塞进 #print-root 再 window.print()。
   文案延续产品红线：只写做到的事，不做横向对照、位次提示，
   也不出现「你没做到什么」。
   ============================================================ */
'use strict';

function printHeader(title, nick, sub) {
  return '<div class="pt-head"><div class="pt-title">' + title + '</div>' +
    '<div class="pt-sub">' + nick + (sub ? ' · ' + sub : '') + '</div></div>';
}
function printQuote() {
  return '<div class="pt-quote">“你不是被积分管住的人，你是在练习管理自己。' +
    '每一次小做到，都在证明：我可以。”</div>';
}
function printSign(versionLine) {
  return '<div class="pt-sign">' +
    '<div>' + versionLine + '</div>' +
    '<div class="pt-signrow">她签名：____________　　家长签名：____________　　日期：____________</div>' +
    '</div>';
}

/** 今日卡。data = { nick, stageName, date, score, cap, rows:[{name,points,count,limit}], entries:[{time,name,points,praise}], flash } */
function todayHtml(data) {
  const d = data || {};
  const rows = (d.rows || []).map(r =>
    '<tr><td>' + r.name + '</td><td class="pt-num">+' + r.points + '</td>' +
    '<td class="pt-num">' + r.count + '/' + r.limit + '</td></tr>').join('');
  const entries = (d.entries || []).map(e =>
    '<li><span class="pt-time">' + e.time + '</span> ' + e.name +
    ' <b>+' + e.points + '</b>' +
    (e.praise ? '<div class="pt-pr">' + e.praise + '</div>' : '') +
    '</li>').join('');
  return '<div class="pt-page">' +
    printHeader('罗森塔尔 · 今日卡', d.nick || '我', (d.stageName || '') + ' · ' + (d.date || '')) +
    '<div class="pt-stats">今日 <b>' + (d.score || 0) + '</b> / ' + (d.cap || 0) + ' 分</div>' +
    (rows ? '<table class="pt-table"><tr><th>行为</th><th>分值</th><th>今天已记</th></tr>' + rows + '</table>' : '') +
    (entries ? '<div class="pt-sec">今天做到的</div><ul class="pt-list">' + entries + '</ul>' : '<div class="pt-sec">今天做到的</div><div class="pt-muted">（还没有记录，从一件小事开始就好）</div>') +
    (d.flash ? '<div class="pt-sec">我写下的闪光点</div><div>' + d.flash + '</div>' : '') +
    '<div class="pt-sec">妈妈的一句</div><div class="pt-blank">（这里留给家长手写）</div>' +
    printSign('规则版本：v1.' + (d.ruleVersion || 1)) +
    printQuote() +
    '</div>';
}

/** 一周一页。page = 引擎 buildWeekPage() 的返回值 */
function weekHtml(page) {
  const p = page || {};
  const w = (p.pdfPayload && p.pdfPayload.week) || null;
  const sig = p.signature || {};
  const dims = (p.dims || []).map(x => '<span class="pt-chip">' + x.n + ' ' + x.v + ' 分</span>').join('');
  const flashes = (p.flashes || []).map((f, i) =>
    '<li><span class="pt-time">' + f.date + '</span> ' + f.name + ' <b>+' + f.points + '</b>' +
    (f.isPrivate ? '（仅自己可见）' : '') +
    (f.praise ? '<div class="pt-pr">' + f.praise + '</div>' : '') + '</li>').join('');
  const notes = (p.notes || []).map(n => '<li><span class="pt-time">' + n.date + '</span> ' + n.text + '</li>').join('');
  let plan = '';
  if (w) {
    const hl = (w.highlights && w.highlights.length ? w.highlights : ['（这一周没写）'])
      .map((x, i) => '<li>' + (i + 1) + '. ' + x + '</li>').join('');
    const keep = w.keepDisplay !== undefined
      ? w.keepDisplay
      : (w.keep === '我自己想的：______________________'
        ? (w.keepCustom || '（待补）') : (w.keep || '（这一周没选）'));
    plan =
      '<div class="pt-sec">印象最深的三件事</div><ul class="pt-list">' + hl + '</ul>' +
      '<div class="pt-sec">我想保留的习惯</div><div>' + keep + '</div>' +
      '<div class="pt-sec">下周只改一件小事</div><div>' + (w.next || '（这一周没写）') + '</div>' +
      (w.challenge ? '<div class="pt-sec">我想挑战的新任务</div><div>' + w.challenge + '　+5</div>' : '');
  }
  const bonus = p.bonus > 0 ? '<div class="pt-stats">周结算奖励 +' + p.bonus + ' 分</div>' : '';
  return '<div class="pt-page">' +
    printHeader('罗森塔尔 · 一周一页', p.nick || '我', p.range || '') +
    '<div class="pt-stats">本周 <b>' + p.score + '</b> 分（每天上限 ' + p.cap + '）　有记录 ' + p.days +
    ' 天　连续 ' + p.streak + ' 天<br>累计 ' + (p.lifetime != null ? p.lifetime : '') +
    (p.balance != null ? ' 分　可用 ' + p.balance + ' 分' : ' 分') + '</div>' + bonus +
    (dims ? '<div class="pt-sec">这周的力气花在了哪</div><div class="pt-chips">' + dims + '</div>' : '') +
    '<div class="pt-sec">这一周做到的事</div>' +
    (flashes ? '<ul class="pt-list">' + flashes + '</ul>' : '<div class="pt-muted">（这一周还没有记录，下周从一件小事开始就好）</div>') +
    (notes ? '<div class="pt-sec">我写下的闪光点</div><ul class="pt-list">' + notes + '</ul>' : '') +
    plan +
    '<div class="pt-sec">妈妈的一句</div><div class="pt-blank">（这里留给家长手写）</div>' +
    printSign('规则版本：v1.' + (sig.ruleVersion || 1) +
      (sig.active ? '（' + sig.agreedDate + ' 生效）' : '（待家长确认）')) +
    printQuote() +
    '</div>';
}

const RosPrint = { todayHtml, weekHtml };

if (typeof module !== 'undefined' && module.exports) module.exports = RosPrint;
else (typeof window !== 'undefined' ? window : globalThis).RosPrint = RosPrint;
