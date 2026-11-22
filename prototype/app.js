/* ============================================================
   罗森塔尔 Rosenthal · app.js
   —— 等价于小程序的 app.js(globalData) + utils/store.js（规则引擎）+ 各 pages/*.js
   移植要点：所有渲染函数只做「读 state → 生成视图」，不含 DOM 查询副作用（便于改 setData）
   ============================================================ */
'use strict';

/* ---------------- 1. 静态数据（对应小程序云数据库集合） ---------------- */

const DIMS = [
  { k:'study',  n:'学习力', c:'var(--dim-study)'  },
  { k:'life',   n:'生活力', c:'var(--dim-life)'   },
  { k:'body',   n:'身心力', c:'var(--dim-body)'   },
  { k:'social', n:'社交力', c:'var(--dim-social)' },
  { k:'self',   n:'自主力', c:'var(--dim-self)'   },
];

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

/* ============================================================
   学段模型：小学低段 → 小学高段 → 初中 → 高中
   同一套内核，随年龄变的是三件事：
   ① 自主权梯度（谁定规则 / 谁能改记录）
   ② 抽象层级（具体行为 → 计划与目标 → 自我认同）
   ③ 计分尺度（日上限、分值、奖励档位金额）
   ============================================================ */
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
const stageOf = k => STAGES.find(s => s.k === k) || STAGES[2];

const TEMPLATES = {
  /* ---- 初中：原有 26 条，题目最细、最贴近学科节奏 ---- */
  mid: ITEMS,

  /* ---- 小学低段：全部是可看见的动作，家长陪记 ---- */
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

  /* ---- 小学高段：从“动作”过渡到“自己安排” ---- */
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

  /* ---- 高中：从“行为”转向“目标、压力与自我认同” ---- */
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

const PRAISE_ALT = {
  study:  ['你越来越会给自己安排学习','你把主动权拿回了自己手里','你在用方法，而不是靠硬撑'],
  life:   ['你在把自己照顾得有条理','你让日子变得更顺了一点','你在练习为自己负责'],
  body:   ['你在认真对待自己的身体','你越来越知道怎么让自己稳下来','你在照顾那个要陪你很久的身体'],
  social: ['你在把关系放在心里','你越来越会和人相处','你的在意，别人收到了'],
  self:   ['你越来越能靠自己往前走','你在成为自己生活的主人','你找到适合自己的节奏了'],
  bonus:  ['你把这周坚持下来了','你已经在自动运转了','这种持续，比一时的努力更难得'],
};

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

const REPAIRS = [
  { k:'phone', t:'手机超时', d:'第二天减少相应时间，并写一句“我下次怎么提醒自己”', act:'写一句自我提醒 + 次日自动减少时长' },
  { k:'angry', t:'发脾气',   d:'冷静后道歉，一起想下次的暂停信号',               act:'和妈妈约定一个“暂停信号”' },
  { k:'delay', t:'作业拖延', d:'不贴“懒”的标签，只调整方法：先做 10 分钟',        act:'开一个 10 分钟启动计时器' },
  { k:'broke', t:'没做到约定', d:'不扣分，重新约定更小的一步',                    act:'把目标改小，写进下周计划' },
];

const CARDS = [
  { t:'妈妈无条件陪逛 1 小时', d:'不看手机，路线你定', e:14 },
  { t:'今晚点餐权',           d:'今晚吃什么你说了算', e:7  },
  { t:'免唠叨券 1 次',        d:'一次“快去写作业”免疫', e:30 },
  { t:'和闺蜜视频 30 分钟',   d:'不计入手机时长', e:14 },
];

/* 禁用词库：命中即拦截（对应 PRD §6.3） */
const BANNED = ['你真聪明','真聪明','真乖','真棒','就是懒','粗心','不自律','你怎么又这样','别人都能做到','你为什么不行','退步','失败','笨'];

/* ---------------- 2. 状态与持久化 ---------------- */

const KEY = 'rosenthal.prototype.v1';
const RING = 2 * Math.PI * 48;

const todayKey = (d = new Date()) => {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
const shiftDay = n => { const d = new Date(); d.setDate(d.getDate() + n); return todayKey(d); };
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

let S = null;
let weekDraft = null;
let ui = { tab:'today', stack:[], parentTab:'todo' };

function seed() {
  const st = 'mid';
  const tpl = TEMPLATES[st], cap0 = stageOf(st).cap;
  /* 生成 13 天演示历史，让热力图 / 时间轴 / 余额看起来是活的 */
  const log = [];
  let r = 20240501;
  const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let back = 13; back >= 1; back--) {
    const date = shiftDay(-back);
    const pool = tpl.slice();
    let sum = 0, n = 0;
    while (pool.length && n < 5 && sum < cap0 - 2) {
      const it = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      if (sum + it.points > cap0) continue;
      sum += it.points; n++;
      log.push({ uid:'x' + date + it.id + n, itemId:it.id, name:it.name, dim:it.dim,
                 points:it.points, date, ts:new Date(date + 'T19:30:00').getTime(),
                 praise:`我看到你${it.p}，这说明${it.t}。`, confirmed:back > 1 });
    }
  }
  /* 今天的演示记录：时间戳取「1 小时前」而不是固定钟点，
     否则撤销窗口（24 小时）跨过晚上 19:30 后，时间轴就不再出现撤销按钮，
     冒烟测试会随运行时刻而闪失败。 */
  const itNow = tpl[0];
  log.push({ uid:'x-today-' + itNow.id, itemId:itNow.id, name:itNow.name, dim:itNow.dim,
             points:itNow.points, date:shiftDay(0), ts:Date.now() - 3600e3,
             praise:`我看到你${itNow.p}，这说明${itNow.t}。`, confirmed:false });
  S = {
    stage:st, nick:'月亮', grade:'初一',
    onboarded:true,
    amend:{ point:1, item:1, reward:1 },   // 演示态：已改满（重置后从 0 开始）
    items:tpl.map(i => ({ ...i })),
    rewards:REWARDS.map(x => ({ ...x })),
    log,
    flash:{ [shiftDay(-1)]:'昨天睡前自己把书包收好了' },
    coupons:[
      { code:'RS-2F7K-08', title:'周末半天自由安排 / 约闺蜜', cost:80, ts:Date.now() - 864e5 * 3, exp:shiftDay(27), used:false },
      { code:'RS-9QD1-44', title:'自选电影或综艺 1 次 + 零食', cost:60, ts:Date.now() - 864e5 * 9, exp:shiftDay(21), used:true },
    ],
    repairs:[{ id:'r1', kind:'delay', note:'先做 10 分钟，不用一次做完', ts:Date.now() - 864e5 * 2, done:true }],
    week:null,
    surpriseAt:null,
    spent:140,
    introSeen:false,   // 首次进入先看「罗森塔尔效应」介绍页
    exportUsed:0,      // 免费导出已用次数（试运行）
  };
  /* 演示态：让「她改过的地方」和改动计数一致，规则页才讲得通 */
  const s4 = S.items.find(i => i.id === 's4');
  if (s4) { s4.points = 5; s4.changedBy = 'child'; }
  const l4 = S.items.find(i => i.id === 'l4');
  if (l4) { l4.active = false; l4.changedBy = 'child'; }   // 她删掉了「帮忙家务」
  S.items.push({ id:'c1', dim:'self', name:'练吉他 20 分钟', points:3, limit:1, changedBy:'child',
                 p:'练了 20 分钟吉他', t:'你在给自己喜欢的事留位置' });
  if (S.rewards[5]) { S.rewards[5].customBy = 'child'; S.rewards[5].title = '心愿小礼物 ≤ 80 元（自己挑的一套水彩）'; }
}
/* 切换学段：换模板、换上限、换奖励，历史记录全部保留 */
function applyStage(k) {
  const st = stageOf(k);
  S.stage = k;
  S.items = (TEMPLATES[k] || ITEMS).map(i => ({ ...i }));
  const ov = REWARD_BY_STAGE[k];
  S.rewards = ov ? ov.map(r => ({ ...r })) : REWARDS.map(r => ({ ...r }));
  S.amend = { point:0, item:0, reward:0 };   // 换学段 = 重新定一次规则
  S.nick = st.nick; S.grade = st.n;
  S.week = null; weekDraft = null; save();
}
function blank() {
  seed();
  S.onboarded = false; S.amend = { point:0, item:0, reward:0 };
  S.items = (TEMPLATES[S.stage] || ITEMS).map(i => ({ ...i }));
  const ov = REWARD_BY_STAGE[S.stage];
  S.rewards = ov ? ov.map(r => ({ ...r })) : REWARDS.map(r => ({ ...r }));
  S.log = []; S.coupons = []; S.repairs = []; S.flash = {}; S.week = null; S.spent = 0; S.surpriseAt = null; S.introSeen = false; S.exportUsed = 0;
}
function load() { try { const raw = localStorage.getItem(KEY); S = raw ? JSON.parse(raw) : null; } catch (e) { S = null; } if (!S) seed(); if (!S.stage) S.stage = 'mid'; if (!S.amend) S.amend = { point:0, item:0, reward:0 }; if (typeof S.introSeen !== 'boolean') S.introSeen = false; if (typeof S.exportUsed !== 'number') S.exportUsed = 0; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

/* ---------------- 3. 规则引擎（只加分 · 每日分值上限随学段变化） ---------------- */

const capNow = () => stageOf(S.stage).cap;
const itemsOf = () => S.items.filter(i => i.active !== false);
const itemById = id => S.items.find(i => i.id === id);
const countOn = (id, date) => S.log.filter(l => l.itemId === id && l.date === date && !l.reversed).length;
const pointsOn = date => S.log.filter(l => l.date === date && !l.reversed).reduce((a, l) => a + l.points, 0);
const dayScore = date => Math.min(capNow(), pointsOn(date));
const weekDates = () => Array.from({ length:7 }, (_, i) => shiftDay(-i));
const weekScore = () => weekDates().reduce((a, d) => a + pointsOn(d), 0);
const lifetime = () => S.log.filter(l => !l.reversed).reduce((a, l) => a + l.points, 0);
const balance = () => lifetime() - S.spent;
const streak = () => { let n = 0, i = 0; while (true) { const d = shiftDay(-i); if (pointsOn(d) > 0) { n++; i++; } else if (i === 0) { i++; } else break; } return n; };

/** 唯一写入入口：只接受正数，日上限在此强制生效 */
function addPoints({ itemId, name, dim, points, praise, date = todayKey(), ts = Date.now(), byParent = false }) {
  if (!(points > 0)) return { ok:false, reason:'系统里没有扣分' };
  const cap = capNow();
  const used = dayScore(date);
  if (used >= cap) return { ok:false, reason:'今天已经很棒了，剩下的留给明天' };
  const grant = Math.min(points, cap - used);
  const entry = { uid:'u' + ts + Math.random().toString(36).slice(2, 6), itemId, name, dim, points:grant,
                  date, ts, praise, confirmed:false, overflow:points - grant, byParent:!!byParent };
  S.log.push(entry); save();
  return { ok:true, entry, partial:grant < points };
}

/* 首次介绍页（罗森塔尔效应）：首次进一次 */
const needsIntro = () => !S.introSeen;
function markIntroSeen() { S.introSeen = true; save(); }

/* 低龄代记：低段（小学低段/高段）允许家长「帮 TA 记一笔」，初中/高中不代记 */
const canParentRecord = () => S.stage === 'p12' || S.stage === 'p36';
function parentRecord(id) {
  if (!canParentRecord()) return { ok:false, reason:'这个学段由她自己打卡，家长不代记' };
  const it = itemById(id);
  if (!it) return { ok:false, reason:'没找到这条行为' };
  if (countOn(id, todayKey()) >= it.limit) return { ok:false, reason:'今天这项已经记过了' };
  return addPoints({ itemId:it.id, name:it.name, dim:it.dim, points:it.points,
                     praise:`我看到你${it.p}，这说明${it.t}。`, byParent:true });
}

/* 免费试运行：导出免费 EXPORT_FREE_LIMIT 次，用满提示「内测中」，不接支付 */
const EXPORT_FREE_LIMIT = 3;
const exportQuota = () => { const used = S.exportUsed || 0; return { used, limit:EXPORT_FREE_LIMIT, remain:Math.max(0, EXPORT_FREE_LIMIT - used), canExport: used < EXPORT_FREE_LIMIT }; };
function consumeExport() { S.exportUsed = (S.exportUsed || 0) + 1; save(); }

/* ---------------- 4. 渲染 ---------------- */

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function renderAll() {
  renderNav(); renderToday(); renderGrowth(); renderWeek(); renderShop(); renderMe();
  renderParent(); renderRepair(); renderRules();
  $('#todoDot').textContent = S.log.filter(l => !l.confirmed).length;
}

function renderNav() {
  const titles = { 'p-today':'今天','p-growth':'成长','p-week':'周复盘','p-shop':'兑换','p-me':'我的',
                   'p-parent':'家长端','p-repair':'修复行动','p-rules':'我的规则' };
  const cur = ui.stack.length ? ui.stack[ui.stack.length - 1] : 'p-' + ui.tab;
  $('#navTitle').textContent = titles[cur] || '今天';
  $('#navBack').hidden = ui.stack.length === 0;
  const isParent = S.role === 'parent';
  $('#roleName').textContent = isParent ? '妈妈' : S.nick;
  $('#roleAvatar').textContent = isParent ? '妈' : S.nick.slice(0, 1);
}

function renderToday() {
  const cap = capNow(), st = stageOf(S.stage);
  const ds = dayScore(todayKey());
  $('#screen').setAttribute('data-stage', S.stage);
  $('#ringNum').textContent = ds;
  $('#ringMax').textContent = cap;
  $('#ringFg').setAttribute('stroke-dashoffset', String(RING * (1 - ds / cap)));
  const h = new Date().getHours();
  $('#heroHello').textContent = (h < 11 ? '早上好，' : h < 18 ? '下午好，' : '晚上好，') + S.nick;
  $('#heroSub').textContent = st.sub;
  $('#statStreak').textContent = streak();
  $('#statWeek').textContent = weekScore();
  $('#statLife').textContent = lifetime();
  const carry = $('#carry');
  if (ds >= cap) { carry.hidden = false; carry.innerHTML = `<span>✦</span><span>今天 ${cap} 分已经满了。多做的那些没被算分，但都被看见了——剩下的，留给明天。</span>`; }
  else carry.hidden = true;

  const tk = todayKey(), f = S.flash[tk];
  $('#flashInput').value = f || '';
  $('#flashState').textContent = f ? '已记录' : '未填写';
  $('#flashHint').textContent = f ? '这就是今天的你，被留下来了。' : '今天的你，最想被记住的是哪一件小事？';

  const full = ds >= cap;
  /* 低段：孩子还小、按不动手机 → 把「让妈妈来记」摆出来 */
  const lowAge = canParentRecord() ? `<div class="card card--flat"><div class="row row--between">
      <div><h3 class="card__t">还小，按不动手机？</h3><p class="card__d">让妈妈帮你记 —— 记完一样算进你的今天。</p></div>
      <button class="btn btn--sm btn--ghost" data-flow="parent">让妈妈来记</button></div></div>` : '';
  $('#dims').innerHTML = lowAge + DIMS.map(d => {
    const items = itemsOf().filter(i => i.dim === d.k);
    if (!items.length) return '';
    const sum = items.reduce((a, i) => a + i.points * Math.min(countOn(i.id, tk), i.limit), 0);
    return `<div class="dim dim--${d.k}">
      <div class="dim__h"><span class="dim__dot"></span><span class="dim__n">${d.n}</span>
        <span class="dim__sum">今日 +${sum}</span></div>
      <div class="items">${items.map(i => {
        const c = countOn(i.id, tk), done = c > 0, cap = c >= i.limit;
        const changed = i.changedBy ? `<span class="item__flag">你改过</span>` : '';
        const priv = i.private ? `<span class="item__flag" style="--dim:var(--indigo)">仅自己可见</span>` : '';
        return `<button class="item ${done ? 'is-done' : ''} ${cap ? 'is-full' : ''} ${full && !cap ? 'is-locked' : ''}"
                  data-item="${i.id}" ${cap ? 'data-cap="1"' : ''} ${full && !cap ? 'data-locked="1"' : ''}>
          <span class="item__p">+${i.points}</span>
          <span class="item__b"><span class="item__n">${esc(i.name)}</span>
            <span class="item__m">今日 ${c}/${i.limit} ${changed}${priv}</span></span>
          <span class="item__x"><svg width="13" height="13"><use href="#i-check"/></svg></span>
        </button>`;
      }).join('')}</div></div>`;
  }).join('');
}

function levelOf(score) { return score === 0 ? 0 : score <= 3 ? 1 : score <= 6 ? 2 : score <= 9 ? 3 : 4; }

function renderGrowth() {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;           // 周一为第一列
  let html = '';
  for (let i = 0; i < lead; i++) html += '<span></span>';
  let month = 0;
  for (let d = 1; d <= days; d++) {
    const key = todayKey(new Date(y, m, d)), sc = dayScore(key);
    month += sc;
    const isToday = key === todayKey();
    html += `<div class="heat__c l${levelOf(sc)} ${isToday ? 'is-today' : ''} ${key > todayKey() ? 'is-future' : ''}"
              title="${key} · ${sc} 分">${scoreMark(sc)}</div>`;
  }
  $('#heat').innerHTML = html;
  $('#monthSum').textContent = month + ' 分';

  $('#miles').innerHTML = [
    { i:'✦', t:'连续 7 天有记录', d: streak() >= 7 ? '已达成' : `还差 ${7 - streak()} 天` },
    { i:'◈', t:'累计 100 分', d: lifetime() >= 100 ? '已达成' : `还差 ${100 - lifetime()} 分` },
    { i:'❍', t:'第一次主动挑战', d:'已达成' },
    { i:'✧', t:'第一次化解矛盾', d:'已达成' },
  ].map(x => `<div class="mile"><div class="mile__i">${x.i}</div><div class="mile__t">${x.t}</div><div class="mile__d">${x.d}</div></div>`).join('');

  const list = S.log.filter(l => !l.reversed).sort((a, b) => b.ts - a.ts).slice(0, 14);
  $('#timeline').innerHTML = list.length ? list.map(l => {
    const d = DIMS.find(x => x.k === l.dim);
    const canUndo = Date.now() - l.ts < 864e5 && l.itemId;
    return `<div class="tl__i" style="--dim:${d ? d.c : 'var(--amber)'}">
      <div class="tl__t">${l.date} ${new Date(l.ts).toTimeString().slice(0, 5)} · ${d ? d.n : '周奖励'} ${l.itemId ? `<span class="chip" style="padding:1px 7px">+${l.points}</span>` : `<span class="chip chip--gold" style="padding:1px 7px">+${l.points}</span>`}</div>
      <div class="tl__n">${esc(l.name)}${l.byParent ? ' <span class="chip" style="padding:1px 6px">家长代记</span>' : ''}${l.private ? ' <span class="chip chip--indigo" style="padding:1px 6px">仅自己可见</span>' : ''}</div>
      ${l.praise ? `<div class="tl__q">${esc(l.praise)}</div>` : ''}
      ${canUndo ? `<div class="tl__a"><button class="linkbtn" data-undo="${l.uid}">撤销这条</button>
        <button class="linkbtn" data-priv="${l.uid}">${l.private ? '取消隐私标记' : '设为仅自己可见'}</button></div>` : ''}
    </div>`;
  }).join('') : '<div class="empty">还没有记录。<br>今天晚上记一条，这条时间轴就开始长了。</div>';
}
function scoreMark(s) { return s === 0 ? '' : s >= 10 ? '✦' : ''; }

function renderWeek() {
  const done = !!S.week;
  $('#steps').innerHTML = Array.from({ length:5 }, (_, i) =>
    `<i class="${done || i <= (weekDraft ? weekDraft.step : -1) ? 'on' : ''}"></i>`).join('');
  if (done) {
    const w = S.week;
    $('#steps').innerHTML = Array.from({ length:5 }, () => '<i class="on"></i>').join('');
    $('#weekBody').innerHTML = `
      <div class="report">
        <div class="report__k">WEEKLY · ${w.range}</div>
        <div class="report__t">${esc(S.nick)}的这一周</div>
        <div class="report__hl">
          <div><b>${w.score}</b><span>本周得分</span></div>
          <div><b>${w.days}</b><span>有记录天数</span></div>
          <div><b>+${w.bonus}</b><span>周额外奖励</span></div>
        </div>
        <div class="report__line"><b>我印象最深的三件事</b><br>${w.highlights.map((x, i) => `${i + 1}. ${esc(x)}`).join('<br>')}</div>
        <div class="report__line mt-3"><b>我想保留的习惯</b><br>${esc(w.keep)}</div>
        <div class="report__line mt-3"><b>下周只改一件小事</b><br>${esc(w.next)}</div>
        ${w.challenge ? `<div class="report__line mt-3"><b>我想挑战的新任务</b><br>${esc(w.challenge)}　<span class="chip chip--gold">+5</span></div>` : ''}
        <div class="quote">你不是被积分管住的人，你是在练习管理自己。<br>每一次小做到，都在证明：我可以。</div>
        <div class="row" style="gap:8px"><button class="btn btn--ghost btn--sm" data-flow="toast-print" style="flex:1">导出打印版</button>
        <button class="btn btn--primary btn--sm" data-flow="restart-week" style="flex:1">下周继续</button></div>
      </div>`;
    return;
  }
  if (!weekDraft) weekDraft = { step:0, highlights:[], keep:'', next:'', challenge:'' };
  const w = weekDraft;
  const cands = S.log.filter(l => !l.reversed && weekDates().includes(l.date) && l.praise).slice(0, 6);
  let body = '';
  if (w.step === 0) {
    body = `<div class="card"><div class="qn">这周，有哪三件事你想记住？</div>
      <p class="qh">我从你的记录里挑了几个，点一下就能选；也可以自己写。</p>
      <div class="pick">${cands.map(c => `<button data-hl="${esc(c.praise)}" class="${w.highlights.includes(c.praise) ? 'on' : ''}">${esc(c.name)}</button>`).join('')}</div>
      <textarea class="field mt-3" id="hlCustom" rows="2" placeholder="也可以自己写：例 我把数学最后一题想出来了"></textarea>
      <p class="qh mt-2">已选 ${w.highlights.length} / 3</p></div>`;
  } else if (w.step === 1) {
    body = `<div class="card"><div class="qn">哪一个习惯，你最想留下来？</div>
      <p class="qh">只选一个。留下来的那个，下周会出现在你的首页。</p>
      <div class="pick">${['先复习再写作业','专注 25 分钟不碰手机','睡前整理书包','22:30 前睡觉','先做最难的那科','运动 30 分钟']
        .map(x => `<button data-keep="${x}" class="${w.keep === x ? 'on' : ''}">${x}</button>`).join('')}</div></div>`;
  } else if (w.step === 2) {
    body = `<div class="card"><div class="qn">下周，你只想改一件什么小事？</div>
      <p class="qh">越具体越好，小到“明天就能做到”。</p>
      <textarea class="field" id="nextInput" rows="3" placeholder="例：写作业前先把手机放到客厅">${esc(w.next)}</textarea>
      <div id="shrinkHint"></div>
      <div class="row mt-3"><button class="btn btn--ghost btn--sm" id="wPrev">上一题</button>
        <button class="btn btn--primary btn--sm" style="flex:1" id="wNext2">下一步</button></div></div>`;
  } else if (w.step === 3) {
    body = `<div class="card"><div class="qn">想不想挑战一件新的事？</div>
      <p class="qh">做了就有 +5，做不到也不扣分——这条只记录尝试。</p>
      <textarea class="field" id="chInput" rows="2" placeholder="例：这次月考自己定一个复习清单（可留空）">${esc(w.challenge)}</textarea>
      <div class="row mt-3"><button class="btn btn--ghost btn--sm" id="wPrev">上一题</button>
        <button class="btn btn--primary btn--sm" style="flex:1" id="wNext3">生成我的周报</button></div></div>`;
  } else {
    const bonus = (weekScore() >= 50 ? 10 : 0) + (streak() >= 7 ? 10 : 0) + (w.challenge ? 5 : 0);
    body = `<div class="card"><div class="qn">结算一下这周</div>
      <p class="qh">下面是自动算出来的，不是谁能改的。</p>
      <div class="report__hl">
        <div><b>${weekScore()}</b><span>本周得分</span></div>
        <div><b>${weekDates().filter(d => pointsOn(d) > 0).length}</b><span>有记录天数</span></div>
        <div><b>+${bonus}</b><span>周额外奖励</span></div></div>
      <div class="report__line">${[
        { c: weekScore() >= 50, t:'一周积分 ≥ 50　+10' },
        { c: streak() >= 7, t:'连续 7 天有记录　+10' },
        { c: !!w.challenge, t:'主动挑战新任务　+5' }]
        .map(x => `<div>${x.c ? '✓' : '○'} ${x.t}</div>`).join('')}</div>
      <div class="row mt-3"><button class="btn btn--ghost btn--sm" id="wPrev">上一题</button>
        <button class="btn btn--primary btn--sm" style="flex:1" id="wFinish">就这么定</button></div></div>`;
  }
  $('#weekBody').innerHTML = body;
}

function renderShop() {
  $('#walBal').textContent = balance();
  $('#walLife').textContent = lifetime();
  const bal = balance();
  const next = S.rewards.find(r => r.cost > bal);
  $('#nextTxt').textContent = next ? `还差 ${next.cost - bal} 分 · ${next.tier}` : '全部档位都已解锁';
  const prev = [...S.rewards].reverse().find(r => r.cost <= bal);
  const from = prev ? prev.cost : 0;
  $('#nextBar').style.width = next ? Math.max(4, Math.round((bal - from) / (next.cost - from) * 100)) + '%' : '100%';

  $('#rewards').innerHTML = S.rewards.map(r => {
    const can = bal >= r.cost;
    return `<div class="rw ${can ? 'rw--hot' : 'rw--lock'}">
      <div class="rw__c"><b>${r.cost}</b><span>分</span></div>
      <div class="rw__b"><div class="rw__t">${esc(r.title)}</div><div class="rw__d">${r.tier} · ${esc(r.desc)}</div></div>
      <button class="btn btn--sm ${can ? 'btn--primary' : 'btn--line'}" ${can ? `data-redeem="${r.cost}"` : 'disabled'}>
        ${can ? '兑换' : '还差 ' + (r.cost - bal)}</button></div>`;
  }).join('');

  const cs = S.coupons.slice().sort((a, b) => a.used - b.used || b.ts - a.ts);
  $('#coupons').innerHTML = cs.length ? cs.map(c => `
    <div class="coupon ${c.used ? 'coupon--used' : ''}">
      <div class="coupon__t">${esc(c.title)}</div>
      <div class="coupon__m">${c.used ? '已使用 · 记录在你名下' : `有效期至 ${c.exp} · 家长不能撤回`}</div>
      <div class="coupon__code">${c.code}</div>
      ${c.used ? '' : `<button class="btn btn--sm btn--ghost mt-3" data-usecoupon="${c.code}">出示给家长使用</button>`}
    </div>`).join('') : '<div class="empty">还没有券。<br>攒够了就来换一张，换到手的就不用担心被收回。</div>';
}

function renderMe() {
  const st = stageOf(S.stage);
  $('#meNick').textContent = S.nick;
  $('#meAvatar').textContent = S.nick.slice(0, 1);
  $('#meGrade').textContent = `${st.n} · ${st.g}`;
  $('#stageName').textContent = `${st.n}版规则`;
  $('#stageChip').textContent = `每日上限 ${st.cap} 分 · ${itemsOf().length} 条`;
  $('#rulesHint').textContent = `${itemsOf().length} 条行为 · ${S.rewards.length} 档奖励 · 谁改的都有记录`;
  const n = ['point','item','reward'].filter(k => S.amend[k] > 0).length;
  $('#amendChip').textContent = `已改 ${n} / 3 处`;
  const can = streak() >= 7 && !S.surpriseAt;
  $('#surpriseState').textContent = can ? '可以领 1 张了，进来挑一张' : `连续 ${streak()} 天 · 满 7 天可挑 1 张`;
}

function renderParent() {
  const todo = S.log.filter(l => !l.confirmed && !l.reversed);
  $('#parentTabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.ptab === ui.parentTab));
  let body = '';
  if (ui.parentTab === 'todo') {
    /* 低龄孩子按不动手机：低段给一个「帮 TA 记一笔」入口（四学段通用路径里只在低段出现） */
    const recCard = canParentRecord() ? `<div class="card">
      <h3 class="card__t">帮 TA 记一笔</h3>
      <p class="card__d mt-2">${S.stage === 'p12' ? '她还小，按不动手机时，你可以替她记' : '小学高段可以补记'} —— 记完一样算进她的今天。</p>
      ${DIMS.map(d => {
        const items = itemsOf().filter(i => i.dim === d.k);
        if (!items.length) return '';
        return `<div class="dim dim--${d.k}"><div class="dim__h"><span class="dim__dot"></span><span class="dim__n">${d.n}</span></div>
          <div class="items">${items.map(i => `<button class="item" data-parentrec="${i.id}">
            <span class="item__p">+${i.points}</span>
            <span class="item__b"><span class="item__n">${esc(i.name)}</span></span>
            <span class="item__x"><svg width="13" height="13"><use href="#i-check"/></svg></span></button>`).join('')}</div></div>`;
      }).join('')}
      <p class="card__d mt-3">记完会算进她的今天，也出现在待确认里。你仍然不能删她的记录、不能改分。</p></div>` : '';
    body = `<div class="row row--between" style="margin-bottom:10px">
        <span class="card__d">家长端 · 只读正向记录，不可删除</span>
        <button class="btn btn--sm btn--ghost" data-role="child">回到孩子端</button></div>` +
      recCard +
      `<p class="page__hint">你只能看到“她做到了什么”。她没做的、被她标为私密的，这里不会出现，你也没有删除权限。</p>` +
      (todo.length ? todo.map(l => `<div class="confirm">
        <span class="chip chip--amber">+${l.points}</span>
        <div class="confirm__b"><div class="item__n">${esc(l.name)}</div>
          <div class="item__m">${l.date} ${new Date(l.ts).toTimeString().slice(0, 5)} 提交${l.date !== todayKey() ? '（此前漏确认）' : ''}${l.byParent ? ' · 家长代记' : ''}</div></div>
        <button class="btn btn--sm btn--ghost" data-confirm="${l.uid}">确认</button></div>`).join('')
        : '<div class="empty">记录都确认过了。<br>下面那句话，也可以今天就说给她听。</div>') +
      `<div class="card"><h3 class="card__t">可以这样开口</h3>
        <p class="card__d">“你打算先做哪一步？需要我当计时器，还是陪你开始？”</p>
        <p class="card__d mt-2">“这次没做到，我们调方法，不给你贴标签。”</p></div>`;
  } else if (ui.parentTab === 'praise') {
    const cands = S.log.filter(l => l.date === todayKey()).slice(0, 5);
    body = `<div class="card"><h3 class="card__t">她的今天，挑一件事来夸具体</h3>
      <p class="card__d">只夸具体的事 + 说明这意味着什么。不说“你真聪明”。</p>
      <div class="pick mt-3" id="praisePick">${cands.length ? cands.map(c => `<button data-fact="${esc(c.name)}">${esc(c.name)}</button>`).join('') : '<span class="card__d">今天还没有记录。</span>'}</div>
      <textarea class="field mt-3" id="praiseInput" rows="3" placeholder="我看到你……，这说明你……"></textarea>
      <div id="banWarn"></div>
      <button class="btn btn--primary btn--block mt-3" id="praiseSend">说给她听</button></div>
      <div class="card card--flat"><h3 class="card__t">这三句已经备好了</h3>
        <p class="card__d">我看到你今天先复习再写作业，这说明你越来越会安排学习。</p>
        <p class="card__d mt-2">我注意到你把手机放回了客厅，这说明你在守住自己定的线。</p>
        <p class="card__d mt-2">你今天问老师题了，这说明你知道求助也是一种能力。</p></div>`;
  } else {
    const dimSum = DIMS.map(d => ({ ...d, v: S.log.filter(l => l.dim === d.k && !l.reversed).reduce((a, l) => a + l.points, 0) }));
    const max = Math.max(1, ...dimSum.map(d => d.v));
    body = `<div class="card"><h3 class="card__t">本周</h3>
        <div class="report__hl"><div><b>${weekScore()}</b><span>本周得分</span></div>
        <div><b>${weekDates().filter(d => pointsOn(d) > 0).length}</b><span>有记录天数</span></div>
        <div><b>${streak()}</b><span>连续天数</span></div></div>
        <div class="card__d">她最稳定的部分：${esc(dimSum.slice().sort((a, b) => b.v - a.v)[0].n)}。这部分不用你操心。</div></div>
      <div class="card"><h3 class="card__t">五个维度的分布</h3>
        ${dimSum.map(d => `<div class="mt-3"><div class="row row--between"><span class="card__d">${d.n}</span><span class="card__d">${d.v}</span></div>
          <div class="bar"><i style="width:${Math.round(d.v / max * 100)}%;background:${d.c}"></i></div></div>`).join('')}
        <p class="card__d mt-3">自主力维度占比越高，说明这套规则越像她自己的，而不是你的。</p></div>
      <div class="card"><h3 class="card__t">履约看板</h3>
        <div class="report__hl"><div><b>100%</b><span>历史兑换履约率</span></div>
        <div><b>${S.coupons.length}</b><span>已发券</span></div><div><b>0</b><span>临时加码次数</span></div></div>
        <p class="card__d">已发出去的券，家长端没有撤回入口。这是这套系统里最值钱的东西。</p></div>`;
  }
  $('#parentBody').innerHTML = body;
}

function renderRepair() {
  const mine = S.repairs.slice().reverse();
  $('#repairBody').innerHTML = `
    <div class="card"><h3 class="card__t">现在是什么情况？</h3>
      <p class="card__d">选一个，我们只调方法，不记账、不扣分。</p>
      <div class="pick mt-3">${REPAIRS.map(r => `<button data-repair="${r.k}">${r.t}</button>`).join('')}</div>
      <div id="repairForm"></div></div>
    <div class="card"><h3 class="card__t">修复记录</h3>
      ${mine.length ? mine.map(r => {
        const R = REPAIRS.find(x => x.k === r.kind) || REPAIRS[0];
        return `<div class="confirm"><span class="chip chip--jade">${r.done ? '已完成 +2' : '进行中'}</span>
          <div class="confirm__b"><div class="item__n">${R.t}</div>
          <div class="item__m">${esc(r.note)}</div></div>
          ${r.done ? '' : `<button class="btn btn--sm btn--ghost" data-repairdone="${r.id}">我做到了</button>`}</div>`;
      }).join('') : '<div class="empty">还没有修复记录。<br>这不是欠账本，只是一次次把方法调对。</div>'}</div>
    <div class="card card--flat"><h3 class="card__t">家长尽量这样说</h3>
      <p class="card__d">“我看到你……，这说明你……”</p>
      <p class="card__d mt-2">“你是一个会为自己负责的人，我相信你能找到适合你的节奏。”</p>
      <div class="wordwarn">避免说：你就是懒 / 你怎么又这样 / 别人都能做到，你为什么不行。</div></div>`;
}

function renderRules() {
  const changed = itemsOf().filter(i => i.changedBy);
  const st = stageOf(S.stage);
  $('#rulesBody').innerHTML = `
    <div class="card"><h3 class="card__t">${st.n}版规则 · v1.1</h3>
      <p class="card__d">共 ${itemsOf().length} 条行为 · ${S.rewards.length} 档奖励 · 每日上限 ${st.cap} 分 · 你自己改过 ${changed.length} 处</p>
      <div class="chip chip--jade mt-3">双向确认后生效 · 家长不能单方改</div></div>
    <div class="card"><h3 class="card__t">这个学段，谁说了算</h3>
      <p class="card__d">${esc(st.perm)}</p>
      <p class="card__d mt-2">文案语气：${esc(st.tone)}</p>
      <button class="btn btn--sm btn--ghost mt-3" data-flow="stage">切换学段看差异</button></div>
    ${DIMS.map(d => {
      const items = itemsOf().filter(i => i.dim === d.k);
      if (!items.length) return '';
      return `<div class="dim dim--${d.k}"><div class="dim__h"><span class="dim__dot"></span><span class="dim__n">${d.n}</span>
        <span class="dim__sum">${items.length} 条</span></div><div class="items">
        ${items.map(i => `<div class="item" style="pointer-events:none">
          <span class="item__p">+${i.points}</span>
          <span class="item__b"><span class="item__n">${esc(i.name)}</span>
          <span class="item__m">每日最多 ${i.limit} 次${i.changedBy ? ` · <span style="color:var(--jade)">${i.changedBy === 'child' ? '月亮改的' : '妈妈改的'}</span>` : ' · 来自初始模板'}</span></span>
        </div>`).join('')}</div></div>`;
    }).join('')}
    <div class="card"><h3 class="card__t">奖励（由她选）</h3>
      ${S.rewards.map(r => `<div class="row row--between mt-3"><span class="card__d">${r.cost} 分 · ${esc(r.title)}</span>
        ${r.customBy ? '<span class="chip chip--gold">她改过</span>' : ''}</div>`).join('')}</div>`;
}

/* ---------------- 5. 流程：导航 / 弹层 / 动效 ---------------- */

function goTab(tab) {
  ui.tab = tab; ui.stack = [];
  $$('.page').forEach(p => p.classList.toggle('is-active', p.id === 'p-' + tab));
  $$('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.tab === tab));
  $('#viewport').scrollTop = 0; renderNav();
}
function goPage(id) {
  ui.stack = [id];
  $$('.page').forEach(p => p.classList.toggle('is-active', p.id === id));
  $('#viewport').scrollTop = 0; renderNav();
}
function backPage() { if (ui.stack.length) { ui.stack = []; goTab(ui.tab); } }

function openSheet(html) { $('#sheetBody').innerHTML = html; $('#mask').classList.add('is-on'); $('#sheet').classList.add('is-on'); }
function closeSheet() { $('#mask').classList.remove('is-on'); $('#sheet').classList.remove('is-on'); }
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('is-on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
}
function sparks(x, y) {
  for (let i = 0; i < 7; i++) {
    const s = document.createElement('div');
    s.className = 'spark';
    s.style.left = x + 'px'; s.style.top = y + 'px';
    s.style.setProperty('--dx', (Math.random() * 90 - 45).toFixed(0) + 'px');
    s.style.animationDelay = (i * 40) + 'ms';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1200);
  }
}

/* 具体肯定卡（文案引擎的出口） */
function praiseSheet(entry) {
  const d = DIMS.find(x => x.k === entry.dim);
  openSheet(`
    <div class="sheet__tag">今天这一条 · ${d ? d.n : '周奖励'}</div>
    <div class="praise">我看到你<em>${esc(entry.praise ? entry.praise.replace(/^我看到你/, '').split('，这说明')[0] : entry.name)}</em>，这说明<em id="traitTxt">${esc(entry.praise ? entry.praise.split('这说明')[1].replace(/。$/, '') : '你在往前走')}</em>。</div>
    <div class="row mt-3" style="gap:8px">
      <button class="btn btn--ghost btn--sm" id="pAnother">换一句</button>
      <button class="btn btn--ghost btn--sm" id="pSelf">我自己说一句</button>
      <button class="btn btn--primary btn--sm" id="pOk" style="flex:1">好，收下</button>
    </div>
    <p class="card__d mt-3">+${entry.points} 分已入账${entry.overflow ? `（今天到上限了，多做的 ${entry.overflow} 分不计入，但已经看见）` : ''}。</p>`);
  $('#pAnother').onclick = () => {
    const bank = PRAISE_ALT[entry.dim] || PRAISE_ALT.self;
    $('#traitTxt').textContent = bank[Math.floor(Math.random() * bank.length)];
  };
  $('#pSelf').onclick = () => {
    $('#sheetBody').insertAdjacentHTML('beforeend',
      `<textarea class="field mt-3" id="selfPraise" rows="2" placeholder="我自己说：我今天……"></textarea>
       <button class="btn btn--ghost btn--sm mt-2" id="selfSave">存到这条记录里</button>`);
    $('#selfSave').onclick = () => {
      const v = $('#selfPraise').value.trim();
      if (v) { entry.praise = v; save(); renderGrowth(); toast('存好了，这句话是你自己说的'); }
    };
  };
  $('#pOk').onclick = () => { closeSheet(); if (entry.overflow) toast('今天 ' + capNow() + ' 分满了，剩下的留给明天'); };
}

/* ---------------- 6. 事件绑定 ---------------- */

document.addEventListener('click', e => {
  const t = e.target;

  const tab = t.closest('.tab');
  if (tab) { goTab(tab.dataset.tab); return; }

  const nav = t.closest('[data-nav]');
  if (nav) { goPage(nav.dataset.nav); return; }

  const flow = t.closest('[data-flow]');
  if (flow) { handleFlow(flow.dataset.flow); return; }

  const pr = t.closest('[data-print]');
  if (pr) { doPrint(pr.dataset.print); return; }

  const role = t.closest('[data-role]');
  if (role) {
    S.role = role.dataset.role; save(); renderNav();
    /* 家长端是独立页；孩子端回到今天 tab —— 低段家长常来回切 */
    if (S.role === 'parent') goPage('p-parent'); else goTab('today');
    return;
  }

  /* 打卡 */
  const it = t.closest('[data-item]');
  if (it) {
    if (it.dataset.locked) { toast('今天已经很棒了，剩下的留给明天'); return; }
    if (it.dataset.cap) { toast('今天这项已经记过啦，明天再来'); return; }
    const src = itemById(it.dataset.item); if (!src) return;
    const res = addPoints({ itemId:src.id, name:src.name, dim:src.dim, points:src.points,
      praise:`我看到你${src.p}，这说明${src.t}。` });
    if (!res.ok) { toast(res.reason); return; }
    const r = it.getBoundingClientRect();
    sparks(r.left + r.width / 2, r.top + r.height / 2);
    renderAll();
    const el = document.querySelector(`[data-item="${src.id}"]`);
    if (el) el.classList.add('pop');
    praiseSheet(res.entry);
    return;
  }

  /* 撤销 / 隐私 */
  const un = t.closest('[data-undo]');
  if (un) {
    const l = S.log.find(x => x.uid === un.dataset.undo);
    if (l) { l.reversed = true; save(); renderAll(); toast('这条已经撤销，不算数了'); }
    return;
  }
  const pv = t.closest('[data-priv]');
  if (pv) {
    const l = S.log.find(x => x.uid === pv.dataset.priv);
    if (l) { l.private = !l.private; save(); renderAll(); toast(l.private ? '这条只有你自己能看到' : '已取消隐私标记'); }
    return;
  }

  /* 闪光点 */
  if (t.id === 'flashSave') {
    const v = $('#flashInput').value.trim();
    if (!v) { toast('写一句就好，短一点也没关系'); return; }
    S.flash[todayKey()] = v; save(); renderToday(); toast('今天的你，被留下来了');
    return;
  }

  /* 兑换 */
  const rd = t.closest('[data-redeem]');
  if (rd) {
    const cost = +rd.dataset.redeem;
    const rw = S.rewards.find(x => x.cost === cost);
    openSheet(`<div class="sheet__tag">兑换确认</div>
      <div class="qn mt-2">${esc(rw.title)}</div>
      <p class="qh">花掉 ${cost} 分。券一发出来，家长就不能反悔，也不能加条件。</p>
      <div class="row" style="gap:8px"><button class="btn btn--ghost" id="rdCancel" style="flex:1">再想想</button>
        <button class="btn btn--primary" id="rdOk" style="flex:1.4">确认兑换</button></div>`);
    $('#rdCancel').onclick = closeSheet;
    $('#rdOk').onclick = () => {
      if (balance() < cost) { toast('余额不够了'); return; }
      S.spent += cost;
      const code = 'RS-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + String(S.coupons.length + 1).padStart(2, '0');
      S.coupons.push({ code, title:rw.title, cost, ts:Date.now(), exp:shiftDay(30), used:false });
      save();
      openSheet(`<div class="sheet__tag">券已生成</div>
        <div class="coupon mt-3"><div class="coupon__t">${esc(rw.title)}</div>
          <div class="coupon__m">有效期至 ${shiftDay(30)} · 家长不能撤回</div>
          <div class="coupon__code">${code}</div></div>
        <p class="card__d">它已经记在你名下了。家长端没有删除按钮——这是规则，不是人情。</p>
        <button class="btn btn--primary btn--block mt-3" id="rdDone">好</button>`);
      $('#rdDone').onclick = () => { closeSheet(); renderAll(); };
      renderAll();
    };
    return;
  }
  const uc = t.closest('[data-usecoupon]');
  if (uc) {
    const c = S.coupons.find(x => x.code === uc.dataset.usecoupon);
    if (c) { c.used = true; save(); renderAll(); toast('已经用掉了，这条记录留在你名下'); }
    return;
  }

  /* 周复盘 */
  const hl = t.closest('[data-hl]');
  if (hl && weekDraft) {
    const v = hl.dataset.hl;
    const i = weekDraft.highlights.indexOf(v);
    if (i >= 0) weekDraft.highlights.splice(i, 1);
    else if (weekDraft.highlights.length < 3) weekDraft.highlights.push(v);
    else toast('三条就够了，挑最重要的');
    renderWeek(); return;
  }
  const kp = t.closest('[data-keep]');
  if (kp && weekDraft) { weekDraft.keep = kp.dataset.keep; renderWeek(); return; }
  if (t.id === 'wPrev' && weekDraft) { collectWeek(); weekDraft.step = Math.max(0, weekDraft.step - 1); renderWeek(); return; }
  if (t.id === 'wNext2' && weekDraft) {
    collectWeek();
    if (!weekDraft.next.trim()) { toast('写下你想改的那一件小事'); return; }
    if (/小时|每天.*[两三四五六七八九十]|\d{2,}/.test(weekDraft.next)) {
      $('#shrinkHint').innerHTML = `<div class="wordwarn">这个目标有点大，我们拆小一点？<br>
        <span class="linkbtn" data-small="写作业前先把手机放到客厅">写作业前先把手机放到客厅</span> ·
        <span class="linkbtn" data-small="先做 10 分钟，再决定要不要继续">先做 10 分钟，再决定要不要继续</span></div>`;
      if (!$('#shrinkHint').dataset.bound) { $('#shrinkHint').dataset.bound = '1'; }
      return;
    }
    weekDraft.step = 3; renderWeek(); return;
  }
  const sm = t.closest('[data-small]');
  if (sm) { weekDraft.next = sm.dataset.small; weekDraft.step = 3; renderWeek(); return; }
  if (t.id === 'wNext3' && weekDraft) { collectWeek(); weekDraft.step = 4; renderWeek(); return; }
  if (t.id === 'wFinish' && weekDraft) {
    collectWeek();
    const bonus = (weekScore() >= 50 ? 10 : 0) + (streak() >= 7 ? 10 : 0) + (weekDraft.challenge ? 5 : 0);
    if (bonus) addPoints({ itemId:null, name:'本周额外奖励（周达标 / 连续记录 / 主动挑战）', dim:'bonus', points:bonus, praise:'我看到你坚持了一整周，这说明你已经在自动运转了。', ts:Date.now() });
    S.week = { ...weekDraft, bonus, score:weekScore(), days:weekDates().filter(d => pointsOn(d) > 0).length,
               range:`${shiftDay(-6)} → ${todayKey()}` };
    weekDraft = null; save(); renderAll(); toast('周报生成好了，也存进了你的成长档案');
    return;
  }

  /* 修复行动 */
  const rp = t.closest('[data-repair]');
  if (rp) {
    const R = REPAIRS.find(x => x.k === rp.dataset.repair);
    $$('.pick [data-repair]').forEach(b => b.classList.toggle('on', b === rp));
    $('#repairForm').innerHTML = `<div class="wordwarn mt-3">${R.d}　→ 系统会：${R.act}<br>
      <span style="color:var(--ink-2)">这里不扣分。做到了反而 +2。</span></div>
      <textarea class="field mt-3" id="repairNote" rows="2" placeholder="我下次怎么提醒自己？（一句话就行）">${esc(R.t === '作业拖延' ? '先做 10 分钟，不用一次做完' : '')}</textarea>
      <button class="btn btn--primary btn--sm mt-3" id="repairSave">记下这次修复</button>`;
    $('#repairSave').onclick = () => {
      const note = $('#repairNote').value.trim();
      if (!note) { toast('写一句给自己的提醒就好'); return; }
      S.repairs.push({ id:'r' + Date.now(), kind:R.k, note, ts:Date.now(), done:false });
      save(); renderRepair(); toast('记下了。这不是欠账，是方法调了一次');
    };
    return;
  }
  const rd2 = t.closest('[data-repairdone]');
  if (rd2) {
    const r = S.repairs.find(x => x.id === rd2.dataset.repairdone);
    if (r) { r.done = true; addPoints({ itemId:null, name:'修复行动完成 · ' + (REPAIRS.find(x => x.k === r.kind) || {}).t, dim:'self', points:2, praise:'我看到你按自己说的方法做到了，这说明你在为自己的选择负责。' });
      save(); renderAll(); toast('修复完成 +2，这条记录是你的'); }
    return;
  }

  /* 家长代记（低龄）：低段家长「帮 TA 记一笔」 */
  const prec = t.closest('[data-parentrec]');
  if (prec) {
    const r = parentRecord(prec.dataset.parentrec);
    if (!r.ok) { toast(r.reason); return; }
    renderAll(); toast('记下了，已经算进她今天');
    return;
  }

  /* 家长端 */
  const pt = t.closest('[data-ptab]');
  if (pt) { ui.parentTab = pt.dataset.ptab; renderParent(); return; }
  const cf = t.closest('[data-confirm]');
  if (cf) {
    const l = S.log.find(x => x.uid === cf.dataset.confirm);
    if (l) { l.confirmed = true; save(); renderAll(); toast('确认了'); }
    return;
  }
  const pf = t.closest('[data-fact]');
  if (pf) {
    $$('[data-fact]').forEach(b => b.classList.toggle('on', b === pf));
    const it = S.items.find(i => i.name === pf.dataset.fact);
    $('#praiseInput').value = it ? `我看到你${it.p}，这说明${it.t}。` : `我看到你${pf.dataset.fact}，这说明你在认真对待自己的节奏。`;
    return;
  }
  if (t.id === 'praiseSend') {
    const v = $('#praiseInput').value.trim();
    const hit = BANNED.find(b => v.includes(b));
    if (!v) { toast('先选一件事，或者写一句'); return; }
    if (hit) {
      $('#banWarn').innerHTML = `<div class="wordwarn">“${hit}”是一句笼统的评价，她听完不知道自己做对了什么。<br>
        换成：我看到你（具体的事），这说明你（这代表什么）。</div>`;
      return;
    }
    $('#banWarn').innerHTML = '';
    toast('已经送到她那边了');
    return;
  }

  /* 惊喜卡 */
  if (t.closest('[data-drawcard]')) {
    const c = CARDS[+t.closest('[data-drawcard]').dataset.drawcard];
    S.surpriseAt = Date.now(); S.coupons.push({ code:'SC-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
      title:c.t, cost:0, ts:Date.now(), exp:shiftDay(c.e), used:false });
    save(); closeSheet(); renderAll(); toast('这张卡放进你的券里了');
    return;
  }

  /* 学段切换（弹层内 / 侧栏） */
  const ss = t.closest('[data-setstage]') || t.closest('[data-gostage]');
  if (ss) {
    const k = ss.dataset.setstage || ss.dataset.gostage;
    if (k === S.stage) { closeSheet(); toast('已经在' + stageOf(k).n + '了'); return; }
    const st = stageOf(k);
    applyStage(k);
    closeSheet(); renderAll(); goTab('today'); openBuild();
    toast(`已切到${st.n}：上限 ${st.cap} 分/天，规则要重新定一次`);
    return;
  }
});

function collectWeek() {
  if (!weekDraft) return;
  const c = $('#hlCustom'); if (c && c.value.trim() && weekDraft.highlights.length < 3) weekDraft.highlights.push(c.value.trim());
  const n = $('#nextInput'); if (n) weekDraft.next = n.value;
  const ch = $('#chInput'); if (ch) weekDraft.challenge = ch.value;
}

function handleFlow(f) {
  if (f === 'onboard') { openBuild(); return; }
  if (f === 'checkin') { goTab('today'); toast('点任意一张行为卡，看看它怎么说你'); return; }
  if (f === 'limit') {
    goTab('today');
    const tk = todayKey(), cap = capNow();
    let guard = 0;
    while (dayScore(tk) < cap && guard++ < 80) {
      const it = itemsOf().find(x => countOn(x.id, tk) < x.limit);
      if (!it) break;
      addPoints({ itemId:it.id, name:it.name, dim:it.dim, points:it.points,
                  praise:`我看到你${it.p}，这说明${it.t}。` });
    }
    renderAll(); toast(`今天已经 ${cap} 分满了。再点只会告诉你：留给明天`);
    return;
  }
  if (f === 'stage') {
    openSheet(`<div class="sheet__tag">学段适配 · 同一套内核，四种尺度</div>
      <p class="qh">换学段会换掉规则模板、每日上限和奖励档位，但历史记录全部保留。<br>换完要重新定一次规则（必改 3 项）。</p>
      ${STAGES.map(s => `<button class="item mt-3" data-setstage="${s.k}" style="width:100%">
        <span class="item__p" style="--dim:var(--amber)">${s.cap}</span>
        <span class="item__b"><span class="item__n">${s.n}　${s.g}${s.k === S.stage ? '（当前）' : ''}</span>
          <span class="item__m">上限 ${s.cap} 分/天 · ${s.perm}<br>${s.tone}</span></span></button>`).join('')}`);
    return;
  }
  if (f === 'redeem') { goTab('shop'); toast('余额够的档位可以兑换。券一发，家长不能撤回'); return; }
  if (f === 'week') { goTab('week'); return; }
  if (f === 'repair') { goPage('p-repair'); return; }
  if (f === 'parent') { S.role = 'parent'; save(); goPage('p-parent'); return; }
  if (f === 'surprise') {
    if (streak() < 7 && !S.surpriseAt) { toast(`连续记录满 7 天就能挑一张，现在 ${streak()} 天`); return; }
    if (S.surpriseAt) { toast('本周已经领过一张了，下周继续'); return; }
    openSheet(`<div class="sheet__tag">连续 7 天达成 · 任选一张</div>
      <p class="qh">不是抽奖，是自选——你坚持到了，就由你来挑。</p>
      ${CARDS.map((c, i) => `<button class="item mt-3" data-drawcard="${i}" style="width:100%">
        <span class="item__p" style="--dim:var(--gold)">✦</span>
        <span class="item__b"><span class="item__n">${c.t}</span><span class="item__m">${c.d} · 有效期 ${c.e} 天</span></span></button>`).join('')}`);
    return;
  }
  if (f === 'toast-print') { openPrintSheet(); return; }
  if (f === 'restart-week') {
    /* 演示用：清掉本次结算的周奖励流水，回到向导状态 */
    S.log = S.log.filter(l => !(l.dim === 'bonus' && l.date === todayKey()));
    S.week = null; weekDraft = null; save(); renderAll(); goTab('today');
    toast('新的一周，从今天这一条开始'); return;
  }
  if (f === 'reset') {
    blank(); save(); weekDraft = null; renderAll();
    closeIntro(); closeBuild();               // 重置成「第一次打开」：两个遮罩先都收起来
    if (needsIntro()) openIntro(); else openBuild();
    toast('演示数据已清空，回到第一次打开的样子'); return;
  }
  if (f === 'intro') { openIntro(); return; }
}

/* ---------------- 7. 规则共建（必改 3 项 · 灵魂机制） ---------------- */

let buildStep = 0;
function openBuild() { $('#build').classList.add('is-on'); renderBuild(); }
function closeBuild() { $('#build').classList.remove('is-on'); }
function renderBuild() {
  const n = ['point','item','reward'].filter(k => S.amend[k] > 0).length;
  const labels = { point:'改分值', item:'改行为项', reward:'改奖励' };
  const missing = ['point','item','reward'].filter(k => S.amend[k] === 0).map(k => labels[k]).join('、');
  const btn = $('#buildDone');
  btn.disabled = n < 3;
  btn.textContent = n < 3 ? `还差：${missing}` : '改满了，开始使用';
  $('#tA').classList.toggle('on', S.amend.point > 0);
  $('#tB').classList.toggle('on', S.amend.item > 0);
  $('#tC').classList.toggle('on', S.amend.reward > 0);

  $('#buildBody').innerHTML = `
    <p class="page__hint">这份表里有 26 条行为和 8 档奖励。它现在还是大人写的版本——<b>你至少要改 3 处</b>，它才算你的。<br>改分值、改行为项、改奖励，各改一处。</p>

    <div class="card"><h3 class="card__t">① 改分值 <span class="chip chip--amber">${S.amend.point > 0 ? '已改' : '待改'}</span></h3>
      <p class="card__d">哪条给少了、哪条给多了？直接点加减。</p>
      <div class="items mt-3">${itemsOf().slice(0, 8).map(i => `
        <div class="item" style="pointer-events:none">
          <span class="item__p">+${i.points}</span>
          <span class="item__b"><span class="item__n">${esc(i.name)}</span>
            <span class="item__m">${i.changedBy ? '你改过' : '模板值'}</span></span>
          <span style="display:flex;gap:6px;pointer-events:auto">
            <button class="btn btn--sm btn--ghost" data-pm="${i.id}|-1">−</button>
            <button class="btn btn--sm btn--ghost" data-pm="${i.id}|1">+</button>
          </span></div>`).join('')}</div>
    </div>

    <div class="card"><h3 class="card__t">② 改行为项 <span class="chip chip--jade">${S.amend.item > 0 ? '已改' : '待改'}</span></h3>
      <p class="card__d">看不顺眼的可以删掉；你正在做的事，可以自己加进来。</p>
      <div class="pick mt-3">${itemsOf().slice(0, 10).map(i => `<button data-del="${i.id}">删掉「${esc(i.name)}」</button>`).join('')}</div>
      <div class="row mt-3"><input class="field" id="newItem" placeholder="我自己想加的一条：例 练吉他 20 分钟" style="flex:1">
        <button class="btn btn--sm btn--primary" id="newItemAdd">加入</button></div>
    </div>

    <div class="card"><h3 class="card__t">③ 改奖励 <span class="chip chip--gold">${S.amend.reward > 0 ? '已改' : '待改'}</span></h3>
      <p class="card__d">把奖励换成你真正想要的。想要什么就写什么，家长只能确认能不能做到。</p>
      <div class="items mt-3">${S.rewards.map(r => `
        <div class="row" style="gap:8px"><span class="chip">${r.cost} 分</span>
          <input class="field" data-rw="${r.cost}" value="${esc(r.title)}" style="flex:1;font-size:12.5px">
        </div>`).join('')}</div>
    </div>

    <p class="page__hint">改完只是你的版本。妈妈那边还要点一次“我按你的版本来”，两边都确认了才生效——她也不能自己偷偷改。</p>`;
}
document.addEventListener('click', e => {
  const t = e.target;
  const pm = t.closest('[data-pm]');
  if (pm) {
    const [id, d] = pm.dataset.pm.split('|');
    const it = itemById(id); if (!it) return;
    it.points = Math.max(1, Math.min(5, it.points + (+d)));
    it.changedBy = 'child'; S.amend.point = Math.max(1, S.amend.point); save(); renderBuild(); renderAll(); return;
  }
  const del = t.closest('[data-del]');
  if (del) {
    const it = itemById(del.dataset.del); if (!it) return;
    it.active = false; it.changedBy = 'child'; S.amend.item = Math.max(1, S.amend.item); save(); renderBuild(); renderAll();
    toast('删掉了。这条以后不会出现在你的清单里'); return;
  }
  if (t.id === 'newItemAdd') {
    const v = $('#newItem').value.trim();
    if (!v) { toast('先写一句你想加的事'); return; }
    S.items.push({ id:'c' + Date.now(), dim:'self', name:v, points:2, limit:1, changedBy:'child',
                   p:v, t:'这是你自己加进来的一条' });
    S.amend.item = Math.max(1, S.amend.item); save(); renderBuild(); renderAll();
    toast('加好了，放在“自主力”里'); return;
  }
  if (t.id === 'buildDone' && !t.disabled) {
    S.onboarded = true;
    S.items.forEach(i => { if (i.changedBy === 'child' && !i.stamp) i.stamp = todayKey(); });
    save(); closeBuild(); renderAll(); goTab('today');
    toast('规则 v1.1 生效：这是你自己的版本了'); return;
  }
  if (t.id === 'buildSkip') { closeBuild(); toast('随时可以在“我的 → 规则共建”里继续改'); return; }
});
document.addEventListener('change', e => {
  const rw = e.target.closest('[data-rw]');
  if (rw) {
    const r = S.rewards.find(x => x.cost === +rw.dataset.rw);
    if (r && rw.value.trim()) { r.title = rw.value.trim(); r.customBy = 'child'; S.amend.reward = Math.max(1, S.amend.reward); save(); renderBuild(); renderAll(); toast('记下了：这条奖励换成你要的'); }
  }
});

/* ---------------- 7b. 首次介绍页（罗森塔尔效应） ---------------- */

function openIntro() { $('#intro').classList.add('is-on'); renderIntro(); }
function closeIntro() { $('#intro').classList.remove('is-on'); }
function renderIntro() {
  const n = esc(S.nick || '她');
  $('#introBody').innerHTML = `
    <p class="intro__k">ROSENTHAL · 期望的力量</p>
    <h2 class="intro__t">罗森塔尔效应</h2>
    <p class="intro__lead">你怎么看一个人，他就可能慢慢长成那个样子。</p>
    <div class="card"><h3 class="card__t">那次实验</h3>
      <p class="card__d">1968 年，心理学家罗森塔尔随机挑了几个学生，却告诉老师「这几个孩子很有潜力」。一学期后，这几个孩子真的进步得更多。</p>
      <p class="card__d mt-2">变化其实不在孩子身上，而在老师身上：老师更耐心了，给的机会更多了，也更相信他们了。这份期待，被孩子接住了。</p></div>
    <div class="card"><h3 class="card__t">所以这一版不做什么</h3>
      <p class="card__d">· 只加分，不扣分 —— 没做到时我们换方法，不写差评；</p>
      <p class="card__d">· 不拿你和谁比，只和你自己的昨天比；</p>
      <p class="card__d">· 看到的是「做到了什么」，不给人贴标签。</p></div>
    <div class="card"><h3 class="card__t">它想做的事</h3>
      <p class="card__d">把「我相信你能做到」变成每天一句看得见的具体的话，陪${n}慢慢长成她自己想成为的样子。</p></div>`;
}
/* 「开始」：记下已看过，再按闸门走（没共建先共建，否则进今天） */
function introEnter() { markIntroSeen(); closeIntro(); if (!S.onboarded) openBuild(); else goTab('today'); }

/* ---------------- 8. 打印 / 下载：规则表 + 一周一页（四学段通用） ---------------- */

/* 打印样式：内联进新窗口/下载文件的完整 HTML 里，不依赖页面自身的 @media print */
const PRINT_CSS = `
  *{box-sizing:border-box}
  body{font:13px/1.7 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#2b2622;margin:28px}
  h1{font-size:20px;margin:0 0 4px}
  .sub{color:#7a7168;margin:0 0 16px}
  table{width:100%;border-collapse:collapse;margin:0 0 16px}
  caption{text-align:left;font-weight:600;margin:6px 0}
  th,td{border:1px solid #d9d0c5;padding:5px 8px;font-size:12px;text-align:left;vertical-align:top}
  th{background:#f4ede3}
  td.p{text-align:center;white-space:nowrap;font-weight:700;color:#b8642f}
  td.l{white-space:nowrap;color:#7a7168}
  tr.h td{background:#faf6f0;font-weight:700}
  .mine{color:#3f8b6b}
  .sign{margin-top:22px;color:#4a443d}
  .quote{margin-top:18px;color:#7a7168;font-size:12px}
  @media print{body{margin:12mm}h1{font-size:18px}}
`;

/* 生成一份自包含的可打印 HTML 文档（新窗口打印 / 下载成文件都用它） */
function printShell(title, inner) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${inner}</body></html>`;
}

/* 「罗森塔尔表格」：当前学段的规则表（行为清单 + 分值 + 奖励档位 + 双签栏） */
function ruleTableInner() {
  const st = stageOf(S.stage);
  const items = itemsOf();
  const dimRows = DIMS.map(d => {
    const rows = items.filter(i => i.dim === d.k);
    if (!rows.length) return '';
    const head = `<tr class="h"><td colspan="3">${d.n}</td></tr>`;
    return head + rows.map(i =>
      `<tr><td class="p">+${i.points}</td><td>${esc(i.name)}</td>` +
      `<td class="l">每天 ${i.limit} 次${i.changedBy ? ' · <span class="mine">' +
        (i.changedBy === 'child' ? '她自己改过' : '家长改过') + '</span>' : ''}</td></tr>`).join('');
  }).join('');
  const rewards = S.rewards.map(r =>
    `<tr><td class="p">${r.cost}</td><td>${esc(r.title)}</td>` +
    `<td class="l">${esc(r.tier)}${r.customBy ? ' · <span class="mine">她改过</span>' : ''}</td></tr>`).join('');
  const n = ['point', 'item', 'reward'].filter(k => S.amend && S.amend[k] > 0).length;
  return `<h1>罗森塔尔 · 规则表</h1>
    <p class="sub">${esc(S.nick)}的这一份 · ${st.n}（${st.g}） · 每日上限 ${capNow()} 分</p>
    <table><caption>行为清单（共 ${items.length} 条）</caption>
      <tr><th style="width:52px">分值</th><th>行为</th><th style="width:196px">每天最多</th></tr>
      ${dimRows}</table>
    <table><caption>奖励档位（共 ${S.rewards.length} 档）</caption>
      <tr><th style="width:52px">积分</th><th>奖励</th><th style="width:196px">类型</th></tr>
      ${rewards}</table>
    <p class="sub">规则版本 v1.1 · 她已改动 ${n}/3 处 · 只加分，不扣分；家长不能单方改。</p>
    <p class="sign">她签名：____________　　家长签名：____________　　日期：____________</p>
    <p class="quote">“你不是被积分管住的人，你是在练习管理自己。”</p>`;
}

/* 「一周一页」：这一周的每日记录 + 闪光点 + 双签栏 */
function weekPageInner() {
  const dates = weekDates();
  const rows = dates.slice().reverse().map(d => {
    const names = S.log.filter(l => l.date === d && !l.reversed).map(l => esc(l.name)).join('、');
    return `<tr><td class="l">${d}</td><td class="p">${dayScore(d)}</td>` +
      `<td>${names || '—'}</td><td>${esc(S.flash[d] || '')}</td></tr>`;
  }).join('');
  const w = S.week;
  const extra = w ? `<p class="sub">印象最深：${(w.highlights || []).map(esc).join('、') || '—'}　|　` +
    `想保留：${esc(w.keep) || '—'}　|　下周一件小事：${esc(w.next) || '—'}` +
    `${w.challenge ? '　|　挑战：' + esc(w.challenge) + ' +5' : ''}</p>` : '';
  return `<h1>罗森塔尔 · 一周一页</h1>
    <p class="sub">${esc(S.nick)}的这一周 · ${dates[6]} → ${dates[0]} · 本周 ${weekScore()} 分 · 连续 ${streak()} 天</p>
    ${extra}
    <table><caption>每日记录</caption>
      <tr><th style="width:100px">日期</th><th style="width:52px">得分</th><th>做到的事</th><th style="width:180px">今日闪光点</th></tr>
      ${rows}</table>
    <p class="sign">她签名：____________　　家长签名：____________　　日期：____________</p>
    <p class="quote">“你已经做到过的，都被留下来了。”</p>`;
}

/* 新窗口打开并唤起打印 */
function printDoc(title, inner) {
  const w = window.open('', '_blank');
  if (!w) { toast('浏览器拦了新窗口，请允许弹窗后再试'); return; }
  w.document.open();
  w.document.write(printShell(title, inner));
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) { /* 用户取消打印不处理 */ } }, 350);
}

/* 下载成品 HTML 文件（存下来随时打开再打印） */
function downloadDoc(filename, title, inner) {
  const blob = new Blob([printShell(title, inner)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

function doPrint(kind) {
  const st = stageOf(S.stage);
  /* 免费试运行：用满 3 次后统一提示「内测中」，不接支付 */
  if (!exportQuota().canExport) { closeSheet(); toast('导出功能内测中，敬请期待'); return; }
  if (kind === 'rule') { printDoc('罗森塔尔 · 规则表', ruleTableInner()); }
  else if (kind === 'rule-html') {
    downloadDoc('罗森塔尔规则表-' + st.n + '.html', '罗森塔尔 · 规则表', ruleTableInner());
    toast('规则表已下载，打开后可打印');
  } else if (kind === 'week') { printDoc('罗森塔尔 · 一周一页', weekPageInner()); }
  else if (kind === 'week-html') {
    downloadDoc('罗森塔尔一周一页.html', '罗森塔尔 · 一周一页', weekPageInner());
    toast('一周一页已下载，打开后可打印');
  }
  consumeExport();
  closeSheet();
}

function openPrintSheet() {
  const st = stageOf(S.stage);
  const q = exportQuota();
  const note = q.canExport
    ? `免费导出还剩 ${q.remain} 次（试运行内测中）。规则表可以直接打印贴墙；一周一页是这周的记录。`
    : '免费次数已用完 —— 导出功能内测中，敬请期待。';
  openSheet(`<div class="sheet__tag">打印 / 下载 · ${st.n}（上限 ${capNow()} 分）</div>
    <p class="qh">${note}</p>
    <button class="item mt-3" data-print="rule" style="width:100%">
      <span class="item__p" style="--dim:var(--plum)"><svg width="16" height="16"><use href="#i-print"/></svg></span>
      <span class="item__b"><span class="item__n">打印规则表</span><span class="item__m">行为清单 + 分值 + 奖励档位 + 双签栏</span></span></button>
    <button class="item" data-print="rule-html" style="width:100%">
      <span class="item__p" style="--dim:var(--jade)"><svg width="16" height="16"><use href="#i-scroll"/></svg></span>
      <span class="item__b"><span class="item__n">下载规则表（HTML）</span><span class="item__m">存成文件，随时打开再打印</span></span></button>
    <button class="item" data-print="week" style="width:100%">
      <span class="item__p" style="--dim:var(--amber)"><svg width="16" height="16"><use href="#i-print"/></svg></span>
      <span class="item__b"><span class="item__n">打印一周一页</span><span class="item__m">每日得分 + 做到的事 + 闪光点 + 双签</span></span></button>
    <button class="item" data-print="week-html" style="width:100%">
      <span class="item__p" style="--dim:var(--indigo)"><svg width="16" height="16"><use href="#i-scroll"/></svg></span>
      <span class="item__b"><span class="item__n">下载一周一页（HTML）</span><span class="item__m">存成文件，随时打开再打印</span></span></button>`);
}

/* ---------------- 9. 启动 ---------------- */

$('#navBack').onclick = backPage;
$('#roleBtn').onclick = () => {
  S.role = S.role === 'parent' ? 'child' : 'parent'; save();
  if (S.role === 'parent') goPage('p-parent'); else goTab('today');
  renderNav();
};
$('#mask').onclick = closeSheet;
$('#introEnter').onclick = introEnter;

load();
renderAll();
/* 首次进入先看「罗森塔尔效应」介绍页；看过之后再按共建闸门走 */
if (needsIntro()) openIntro();
else if (!S.onboarded) openBuild();
goTab('today');
