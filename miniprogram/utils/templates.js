/* ============================================================
   罗森塔尔 Rosenthal · utils/templates.js
   规则库与学段模板 —— 从 prototype/app.js 1:1 移植，不改任何分值。

   移植原则（对应 README-小程序移植指南 §5.1）：
   · 本文件是**纯数据 + 纯函数**，零 DOM、零 wx API，可在 Node 里直接 require 做回归；
   · 小程序里建议把这四套模板上云（stage_template 集合），本文件作为离线兜底；
   · 「只加分」的红线不在数据里，而在 utils/store.js 的 addPoints —— 唯一写入口。
   ============================================================ */
'use strict';

/* 五个维度：与 app.wxss 的 --dim-* 令牌一一对应 */
const DIMS = [
  { k: 'study',  n: '学习力', c: 'var(--dim-study)'  },
  { k: 'life',   n: '生活力', c: 'var(--dim-life)'   },
  { k: 'body',   n: '身心力', c: 'var(--dim-body)'   },
  { k: 'social', n: '社交力', c: 'var(--dim-social)' },
  { k: 'self',   n: '自主力', c: 'var(--dim-self)'   },
];

/* 初中 26 条：题目最细、最贴近学科节奏（首发落地用户所在学段） */
const ITEMS = [
  { id:'s1', dim:'study', name:'放学后 30 分钟内主动开始作业', points:2, limit:1, p:'放学回家后半小时内就坐到了书桌前', t:'你越来越会给自己按下启动键' },
  { id:'s2', dim:'study', name:'专注学习 25 分钟，不玩手机',   points:2, limit:4, p:'这 25 分钟里没有碰手机', t:'你管住了最容易分心的那一下' },
  { id:'s3', dim:'study', name:'作业独立完成并自查',           points:3, limit:1, p:'作业是自己做完的，最后还检查了一遍', t:'你在为自己的结果负责' },
  { id:'s4', dim:'study', name:'整理 / 重做 1 道错题',          points:3, limit:3, p:'把这周的错题重新做了一遍', t:'你在把不会的地方，变成会的地方' },
  { id:'s5', dim:'study', name:'主动问老师或同学问题',         points:3, limit:2, p:'遇到不会的题，你开口问了', t:'你知道求助也是一种能力' },
  { id:'s6', dim:'study', name:'阅读 30 分钟',                 points:2, limit:2, p:'连续读了 30 分钟的书', t:'你在给自己的世界添东西' },
  { id:'s7', dim:'study', name:'完成周复盘或下周计划',         points:5, limit:1, p:'坐下来把这周复盘完、把下周写出来了', t:'你在用计划安排自己的节奏' },
  { id:'s8', dim:'study', name:'小测 / 默写达成本周小目标',     points:5, limit:1, p:'这周的默写目标你达成了', t:'你把一个大目标拆成了做得到的小步' },
  { id:'l1', dim:'life',  name:'按时起床',                     points:1, limit:1, p:'闹钟响了就起来了', t:'你在练习自己叫醒自己' },
  { id:'l2', dim:'life',  name:'整理床铺 / 书桌',              points:1, limit:2, p:'床铺和书桌都收拾干净了', t:'你让身边的地方变得清爽' },
  { id:'l3', dim:'life',  name:'提前整理书包',                 points:1, limit:1, p:'睡前就把书包收好了', t:'你在给明天的自己省事' },
  { id:'l4', dim:'life',  name:'帮忙家务',                     points:2, limit:2, p:'主动搭手做了家务', t:'你是这个家里能靠得住的人' },
  { id:'l5', dim:'life',  name:'手机按约定使用',               points:2, limit:1, p:'今天手机用完就放下了，没有超时', t:'你守住了自己定的那条线' },
  { id:'l6', dim:'life',  name:'22:30 前睡觉',                 points:2, limit:1, p:'22:30 前躺下了', t:'你把睡觉当成一件正事' },
  { id:'b1', dim:'body',  name:'运动 30 分钟',                 points:2, limit:1, p:'运动了 30 分钟', t:'你在照顾自己的身体' },
  { id:'b2', dim:'body',  name:'户外活动 / 护眼',              points:1, limit:3, p:'出去走了走，让眼睛离开了屏幕', t:'你知道要给眼睛留点余地' },
  { id:'b3', dim:'body',  name:'写情绪日记或主动倾诉',         points:2, limit:1, p:'把心里的情绪写下来、说出去了', t:'你没有把它一个人扛着' },
  { id:'b4', dim:'body',  name:'遇到冲突先冷静再表达',         points:3, limit:2, p:'生气的时候先停了一下才开口', t:'你在学着不被情绪推着走' },
  { id:'o1', dim:'social',name:'主动感谢 / 问候家人',          points:1, limit:3, p:'主动跟家人说了谢谢、问了声好', t:'你把在意说出口了' },
  { id:'o2', dim:'social',name:'与同学合作或化解矛盾',         points:2, limit:2, p:'和同学一起把事情做完了 / 说开了', t:'你会和人一起把事办成' },
  { id:'o3', dim:'social',name:'守诺，答应的事做到',           points:3, limit:2, p:'答应过的事，你做到了', t:'你说的话有分量' },
  { id:'o4', dim:'social',name:'主动关心家人',                 points:2, limit:2, p:'你注意到家人的状态，还问了一句', t:'你心里装着别人' },
  { id:'a1', dim:'self',  name:'自己定计划并完成',             points:3, limit:1, p:'计划是你自己定的，也自己完成了', t:'你是自己节奏的主人' },
  { id:'a2', dim:'self',  name:'先做难的任务',                 points:2, limit:1, p:'最不想做的那件事，你先做了', t:'你懂得先啃硬骨头' },
  { id:'a3', dim:'self',  name:'自己解决一个小问题',           points:3, limit:2, p:'这件事你自己想办法解决了', t:'你能靠自己找到出口' },
  { id:'a4', dim:'self',  name:'零花钱记账',                   points:2, limit:1, p:'今天花的钱记下来了', t:'你对钱有数' },
];

/* 学段模型：同一套内核，随年龄变的是自主权梯度、抽象层级、计分尺度 */
const STAGES = [
  { k:'p12',  n:'小学低段', g:'1–3 年级 · 6–9 岁',   cap:8,  nick:'宝贝',
    perm:'家长陪记 · 可代打卡 · 每晚一起看',
    sub:'今天做到一件就很棒，妈妈陪你一起记。',
    tone:'短句 + 具体 + 立刻兑现' },
  { k:'p36',  n:'小学高段', g:'4–6 年级 · 9–12 岁',  cap:10, nick:'小满',
    perm:'她自己打卡 · 家长确认 · 可补记',
    sub:'今天不用全做完，挑你最重要的那几件。',
    tone:'具体肯定 + 开始给自主空间' },
  { k:'mid',  n:'初中',     g:'7–9 年级 · 12–15 岁', cap:12, nick:'月亮',
    perm:'她自己打卡 · 家长不可删除 · 可设仅自己可见',
    sub:'今天不用做完全部，挑你最重要的那几件就好。',
    tone:'尊重 + 自主 + 不比较' },
  { k:'high', n:'高中',     g:'10–12 年级 · 15–18 岁', cap:12, nick:'月亮',
    perm:'默认只看周报 · 流水由她自己管 · 兑换仍必须兑现',
    sub:'今天只要有一件事是往前走的，就够了。',
    tone:'像对话，不像考核；允许休息' },
];

const TEMPLATES = {
  mid: ITEMS,

  /* 小学低段：全部是可看见的动作，家长陪记 */
  p12: [
    { id:'p1', dim:'study', name:'回家先洗手喝水，然后开始写作业', points:1, limit:1, p:'回家收拾好自己就坐到桌前写作业了', t:'你会给自己做准备了' },
    { id:'p2', dim:'study', name:'专心写作业 15 分钟（不玩橡皮）',   points:1, limit:2, p:'这 15 分钟一直坐在座位上写', t:'你的专注在变长' },
    { id:'p3', dim:'study', name:'大声读 10 分钟',                 points:1, limit:1, p:'大声读了 10 分钟', t:'你把声音放出来了' },
    { id:'p4', dim:'study', name:'读绘本 / 亲子共读 15 分钟',       points:2, limit:1, p:'和大人一起读了 15 分钟书', t:'你在往脑子里装新故事' },
    { id:'p5', dim:'life',  name:'按时起床，自己穿衣服',           points:1, limit:1, p:'自己起来、自己穿好了衣服', t:'你在练习照顾自己' },
    { id:'p6', dim:'life',  name:'自己刷牙洗脸',                   points:1, limit:2, p:'自己把牙刷了、脸洗了', t:'这些事你不用人催了' },
    { id:'p7', dim:'life',  name:'自己整理书包 / 收拾玩具',        points:1, limit:2, p:'把书包和玩具都收好了', t:'你让东西回到了自己的位置' },
    { id:'p8', dim:'life',  name:'帮家里做一件小事',               points:1, limit:2, p:'帮家里摆了碗筷 / 浇了花', t:'你是家里的小帮手' },
    { id:'p9', dim:'body',  name:'户外玩 / 运动 30 分钟',          points:2, limit:1, p:'出去跑了 30 分钟', t:'你在让身体变有力气' },
    { id:'p10',dim:'body',  name:'把不开心说出来',                 points:2, limit:1, p:'把不开心的事说出来了', t:'你没有把它憋在心里' },
    { id:'p11',dim:'body',  name:'9 点前上床睡觉',                 points:2, limit:1, p:'9 点前就躺下了', t:'你在长身体' },
    { id:'p12',dim:'social',name:'说了谢谢 / 对不起',              points:1, limit:2, p:'主动说了谢谢 / 对不起', t:'你把礼貌变成了习惯' },
    { id:'p13',dim:'self',  name:'自己选一件事做完',               points:2, limit:1, p:'这件事是你自己选的，也做完了', t:'你能自己做决定了' },
  ],

  /* 小学高段：从“动作”过渡到“自己安排” */
  p36: [
    { id:'q1', dim:'study', name:'放学 30 分钟内开始写作业',       points:2, limit:1, p:'放学回家半小时内就开始写了', t:'你越来越会给自己按下启动键' },
    { id:'q2', dim:'study', name:'专注 20 分钟不分心',             points:2, limit:2, p:'这 20 分钟没有分心', t:'你的专注又长了一点' },
    { id:'q3', dim:'study', name:'作业自己检查一遍',               points:2, limit:1, p:'写完还自己检查了一遍', t:'你在为自己的结果负责' },
    { id:'q4', dim:'study', name:'整理 1 道错题',                  points:2, limit:2, p:'把错题重新做了一遍', t:'你在把不会的变成会的' },
    { id:'q5', dim:'study', name:'不会的先自己想办法，再问人',     points:2, limit:2, p:'先自己想了办法，才去问人', t:'你学会了先自己试一次' },
    { id:'q6', dim:'study', name:'阅读 20 分钟',                   points:2, limit:1, p:'读了 20 分钟书', t:'你在给自己的世界添东西' },
    { id:'q7', dim:'life',  name:'按时起床',                       points:1, limit:1, p:'闹钟响了就起来了', t:'你在练习自己叫醒自己' },
    { id:'q8', dim:'life',  name:'整理书桌 / 床铺',                points:1, limit:1, p:'书桌和床铺都收拾好了', t:'你让身边的地方变清爽了' },
    { id:'q9', dim:'life',  name:'提前收好书包',                   points:1, limit:1, p:'睡前把书包收好了', t:'你在给明天的自己省事' },
    { id:'q10',dim:'life',  name:'帮忙家务',                       points:1, limit:2, p:'主动帮家里做了家务', t:'你是能靠得住的人' },
    { id:'q11',dim:'life',  name:'手机 / 平板按约定时间用',        points:2, limit:1, p:'时间到了就放下了', t:'你守住了自己定的线' },
    { id:'q12',dim:'life',  name:'21:30 前睡觉',                   points:2, limit:1, p:'21:30 前躺下了', t:'你把睡觉当成了正事' },
    { id:'q13',dim:'body',  name:'运动 30 分钟',                   points:2, limit:1, p:'运动了 30 分钟', t:'你在照顾自己的身体' },
    { id:'q14',dim:'social',name:'和同学好好商量 / 化解一次别扭',  points:2, limit:2, p:'和同学把事情说开了', t:'你会和人一起把事办好' },
    { id:'q15',dim:'social',name:'答应的事做到',                   points:3, limit:2, p:'答应过的事你做到了', t:'你说的话有分量' },
    { id:'q16',dim:'self',  name:'自己列今天要做的事',             points:2, limit:1, p:'今天的清单是你自己列的', t:'你开始自己安排自己了' },
  ],

  /* 高中：从“行为”转向“目标、压力与自我认同” */
  high: [
    { id:'h1', dim:'study', name:'按今天的计划完成主要任务',        points:3, limit:1, p:'今天的计划你自己完成了', t:'你在按自己的节奏推进' },
    { id:'h2', dim:'study', name:'深度专注 45 分钟（不碰手机）',    points:3, limit:3, p:'这 45 分钟完全没有分心', t:'你守住了自己的注意力' },
    { id:'h3', dim:'study', name:'针对弱项补 30 分钟',              points:3, limit:2, p:'专门补了最薄的那一块', t:'你在对着问题下手，而不是对着时间' },
    { id:'h4', dim:'study', name:'主动问老师 / 找同学讨论',         points:3, limit:2, p:'不会的地方你去问了、去讨论了', t:'你知道求助是效率，不是软弱' },
    { id:'h5', dim:'study', name:'今日复盘 5 分钟（写下明天第一件事）', points:2, limit:1, p:'花 5 分钟复盘，还写下了明天的第一件事', t:'你在给明天的自己铺路' },
    { id:'h6', dim:'life',  name:'睡前 30 分钟不碰手机',            points:2, limit:1, p:'睡前半小时把手机放下了', t:'你在保护自己的睡眠' },
    { id:'h7', dim:'life',  name:'23:00 前睡觉',                    points:2, limit:1, p:'23:00 前睡了', t:'你知道身体是长期战的本钱' },
    { id:'h8', dim:'life',  name:'为自己做一顿饭 / 照顾好自己',      points:2, limit:1, p:'给自己弄了吃的 / 照顾好了自己', t:'你能把自己照顾好' },
    { id:'h9', dim:'life',  name:'零花钱 / 时间记账',               points:2, limit:1, p:'今天的花销或时间你记下来了', t:'你对消耗有数' },
    { id:'h10',dim:'body',  name:'运动 30 分钟',                    points:2, limit:1, p:'运动了 30 分钟', t:'你在给大脑换气' },
    { id:'h11',dim:'body',  name:'情绪低落时用有效的方式调节',       points:3, limit:2, p:'心情不好的时候，你用了对自己有用的办法', t:'你有自己的恢复方式' },
    { id:'h12',dim:'body',  name:'压力大时主动说出来 / 求助',        points:3, limit:1, p:'压力大的时候你说出来了', t:'你不打算一个人扛着' },
    { id:'h13',dim:'body',  name:'允许自己休息一次',                points:2, limit:1, p:'你给自己留了休息的时间', t:'你懂得持续比冲刺更重要' },
    { id:'h14',dim:'social',name:'守住自己的边界 / 拒绝不合理的要求', points:3, limit:1, p:'你拒绝了一次不合理的要求', t:'你知道自己的边界在哪' },
    { id:'h15',dim:'social',name:'主动关心家人',                    points:2, limit:2, p:'你注意到了家人的状态', t:'你心里装着别人' },
    { id:'h16',dim:'social',name:'答应的事做到',                    points:3, limit:1, p:'答应过的事你做到了', t:'你说的话有分量' },
    { id:'h17',dim:'self',  name:'为升学 / 选科做一件具体的事',      points:3, limit:1, p:'为将来查了资料 / 问了人 / 写了清单', t:'你在为自己的选择做准备' },
    { id:'h18',dim:'self',  name:'写下自己想成为的样子',            points:2, limit:1, p:'把想成为的样子写下来了', t:'你心里有个方向' },
  ],
};

/* 奖励随学段调整：档位金额与内容都变（小学便宜、高中更自主） */
const REWARD_BY_STAGE = {
  p12: [
    { cost:10,  tier:'小确幸', title:'一颗星星贴纸 / 一张贴纸',        desc:'当天就能拿到' },
    { cost:20,  tier:'特权',   title:'今晚吃什么，你说了算',            desc:'一次点餐权' },
    { cost:30,  tier:'亲子',   title:'和爸爸妈妈专属 30 分钟（不看手机）', desc:'时间要真的空出来' },
    { cost:40,  tier:'物质',   title:'小玩具 / 绘本一本',              desc:'≤ 50 元，你自己挑' },
    { cost:60,  tier:'娱乐',   title:'去公园 / 游乐场玩一次',          desc:'周末兑现' },
    { cost:80,  tier:'社交',   title:'约小伙伴来家里玩一次',           desc:'你自己邀约' },
    { cost:120, tier:'大奖励', title:'心愿礼物 ≤ 100 元',              desc:'月度兑换' },
    { cost:160, tier:'特别',   title:'一次短途出游 / 动物园',          desc:'提前一起计划' },
  ],
  p36: [
    { cost:20,  tier:'小确幸', title:'小文具 / 贴纸 / 奶茶小料',        desc:'随时兑现' },
    { cost:40,  tier:'特权',   title:'免家务券 1 次 / 周末晚睡 30 分钟', desc:'二选一' },
    { cost:60,  tier:'娱乐',   title:'自选电影或综艺 1 次 + 零食',       desc:'约一个时间' },
    { cost:80,  tier:'自主',   title:'周末半天自由安排 / 约同学',        desc:'内容由你定' },
    { cost:120, tier:'亲子',   title:'和爸爸或妈妈单独出去一次',         desc:'项目你挑' },
    { cost:160, tier:'物质',   title:'心愿小礼物 ≤ 80 元',              desc:'你选品' },
    { cost:220, tier:'大奖励', title:'大心愿 ≤ 200 元 / 短途游',         desc:'月度兑换' },
    { cost:300, tier:'特别',   title:'家庭旅行目的地投票权',            desc:'一起规划' },
  ],
  high: [
    { cost:20,  tier:'小确幸', title:'一杯奶茶 / 一次外带',             desc:'放学路上就兑' },
    { cost:40,  tier:'特权',   title:'免家务 1 次 / 一晚自由安排',       desc:'不解释去向' },
    { cost:60,  tier:'娱乐',   title:'一部电影 / 和朋友出门一次',        desc:'自己约' },
    { cost:80,  tier:'自主',   title:'半天完全自由（不报备细节）',       desc:'家长不追问' },
    { cost:120, tier:'亲子',   title:'和父母单独吃一顿饭（约定不谈成绩）', desc:'由你发起' },
    { cost:160, tier:'物质',   title:'心愿好物 ≤ 150 元（耳机 / 球鞋 / 书）', desc:'你选型号' },
    { cost:220, tier:'大奖励', title:'大件 ≤ 500 元 / 演唱会或展览',     desc:'月度兑换' },
    { cost:300, tier:'特别',   title:'一次只属于你的旅行 / 毕业心愿',    desc:'提前两个月计划' },
  ],
};

/* 初中默认 8 档（首发学段） */
const REWARDS = [
  { cost:20,  tier:'小确幸', title:'小文具 / 贴纸 / 奶茶小料',        desc:'随时兑现，48 小时内' },
  { cost:40,  tier:'特权',   title:'免家务券 1 次 / 周末晚睡 30 分钟', desc:'二选一，生成券后 30 天有效' },
  { cost:60,  tier:'娱乐',   title:'自选电影或综艺 1 次 + 零食',       desc:'需要提前约一个时间' },
  { cost:80,  tier:'自主',   title:'周末半天自由安排 / 约闺蜜',        desc:'内容由你定，家长不干涉' },
  { cost:120, tier:'亲子',   title:'和爸爸或妈妈单独约会（美甲/烘焙/书店/散步）', desc:'人由你指定，项目由你挑' },
  { cost:160, tier:'物质',   title:'心愿小礼物 ≤ 80 元',              desc:'你选品，家长不评价' },
  { cost:220, tier:'大奖励', title:'大心愿 ≤ 200 元 / 短途游 / 主题乐园', desc:'月度兑换日兑现' },
  { cost:300, tier:'特别',   title:'家庭旅行目的地投票权 / 一次特别体验', desc:'需提前 2 周一起规划' },
];

/* 修复行动：四类模板，全部不产生负分 */
const REPAIRS = [
  { k:'phone', t:'手机超时', d:'第二天减少相应时间，并写一句“我下次怎么提醒自己”', act:'写一句自我提醒 + 次日自动减少时长' },
  { k:'angry', t:'发脾气',   d:'冷静后道歉，一起想下次的暂停信号',               act:'和妈妈约定一个“暂停信号”' },
  { k:'delay', t:'作业拖延', d:'不贴“懒”的标签，只调整方法：先做 10 分钟',        act:'开一个 10 分钟启动计时器' },
  { k:'broke', t:'没做到约定', d:'不扣分，重新约定更小的一步',                    act:'把目标改小，写进下周计划' },
];

/* 惊喜卡池：连续 7 天达成后**自选**一张，零随机、零概率（合规红线，见移植指南 §八） */
const CARDS = [
  { t:'妈妈无条件陪逛 1 小时', d:'不看手机，路线你定', e:14 },
  { t:'今晚点餐权',           d:'今晚吃什么你说了算', e:7  },
  { t:'免唠叨券 1 次',        d:'一次“快去写作业”免疫', e:30 },
  { t:'和闺蜜视频 30 分钟',   d:'不计入手机时长', e:14 },
];

/* 文案引擎的肯定语备选：按维度给第二句，避免千篇一律 */
const PRAISE_ALT = {
  study:  ['你越来越会给自己安排学习','你把主动权拿回了自己手里','你在用方法，而不是靠硬撑'],
  life:   ['你在把自己照顾得有条理','你让日子变得更顺了一点','你在练习为自己负责'],
  body:   ['你在认真对待自己的身体','你越来越知道怎么让自己稳下来','你在照顾那个要陪你很久的身体'],
  social: ['你在把关系放在心里','你越来越会和人相处','你的在意，别人收到了'],
  self:   ['你越来越能靠自己往前走','你在成为自己生活的主人','你找到适合自己的节奏了'],
  bonus:  ['你把这周坚持下来了','你已经在自动运转了','这种持续，比一时的努力更难得'],
};

/* 禁用词库：命中即拦截（对应 PRD §6.3 与德韦克成长型思维要求） */
const BANNED = ['你真聪明','真聪明','真乖','真棒','就是懒','粗心','不自律','你怎么又这样','别人都能做到','你为什么不行','退步','失败','笨'];

const stageOf = k => STAGES.find(s => s.k === k) || STAGES[2];
const templateOf = k => TEMPLATES[k] || ITEMS;
const dimOf = k => DIMS.find(d => d.k === k) || DIMS[0];

module.exports = {
  DIMS, ITEMS, STAGES, TEMPLATES, REWARD_BY_STAGE, REWARDS,
  REPAIRS, CARDS, PRAISE_ALT, BANNED,
  stageOf, templateOf, dimOf,
};
