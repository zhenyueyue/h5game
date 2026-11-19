export const elements = {
  light:   { name: '光', color: '#f5d48c', beats: 'dark' },
  dark:    { name: '暗', color: '#e2a7f1', beats: 'light' },
  water:   { name: '水', color: '#8bd8f4', beats: 'fire' },
  fire:    { name: '火', color: '#f89992', beats: 'wind' },
  wind:    { name: '风', color: '#a6e2bd', beats: 'earth' },
  earth:   { name: '地', color: '#e5b580', beats: 'thunder' },
  thunder: { name: '雷', color: '#bab3ff', beats: 'water' }
};

export const heroes = {
  jeanne: { name: '贞德', title: '圣盾女武神', element: 'light', role: '群体守护', hp: 1.50, atk: .75, speed: 96, skill: '神圣不灭壁垒', desc: '保护全队并降低 35% 所受伤害，嘲讽敌人。蓄力阶段施放可挡下赫尔薇尔的重击。' },
  freya: { name: '芙蕾雅', title: '断罪龙枪姬', element: 'fire', role: '前排破甲', hp: 1.22, atk: 1.18, speed: 108, skill: '红莲破城枪', desc: '横扫敌方前排并施加破甲。' },
  camilla: { name: '卡蜜拉', title: '血月蔷薇姬', element: 'thunder', role: '攻转护盾', hp: 1.18, atk: 1.24, speed: 114, skill: '绯雷夜宴', desc: '以雷刃穿过敌方前排，并将部分伤害转化为自身护盾。' },
  fiona: { name: '菲奥娜', title: '星辰大魔女', element: 'water', role: '群体冻结', hp: .80, atk: 1.42, speed: 104, skill: '寒星陨落之夜', desc: '造成群体伤害，35% 概率冻结普通敌人并延后其行动。' },
  iris: { name: '伊莉丝', title: '晨曦圣女', element: 'earth', role: '回复充能', hp: .95, atk: 1.05, speed: 112, skill: '丰壤赞美诗', desc: '治疗全队，并为其他存活队友恢复 20 能量。' },
  sylvie: { name: '希尔薇', title: '疾风精灵姬', element: 'wind', role: '残血收割', hp: .84, atk: 1.38, speed: 124, skill: '森罗万象贯日箭', desc: '必定暴击，优先攻击最低血量的敌人。击杀后返还 50 能量。' },
  vera: { name: '薇拉', title: '夜魇双刀娘', element: 'dark', role: '后排断招', hp: .82, atk: 1.40, speed: 130, skill: '永夜幻影连斩', desc: '切入后排，攻击其攻击力最高的目标并清空目标能量。' },
  hel: { name: '赫尔薇尔', title: '堕落女武神', element: 'dark', role: '首领', skill: '永夜裁决', desc: '高举月蚀之剑，蓄力后重创全体敌人。' }
};

export const openingTeam = ['jeanne', 'freya', 'camilla', 'fiona', 'iris', 'sylvie', 'vera'];
export const starterTeam = [null, 'freya', 'camilla', 'fiona', null, null, null];
export const selector = ['fiona', 'iris', 'sylvie'];
export const chapter = '暮钟圣堂';

const foes = {
  sentinel: { name: '蚀羽守卫', art: 'jeanne', slot: 0 },
  briar: { name: '棘月哨兵', art: 'sylvie', slot: 1 },
  shade: { name: '无灯行者', art: 'vera', slot: 2 },
  seer: { name: '失语占星师', art: 'fiona', slot: 3 },
  choir: { name: '寂光侍女', art: 'iris', slot: 4 },
  flame: { name: '灰烬执枪者', art: 'freya', slot: 5 },
  storm: { name: '裂雷剑手', art: 'camilla', slot: 2 }
};

const stageRows = [
  ['月下圣堂', 'cathedral', ['sentinel', 'briar', 'seer'], 1, 'sylvie', 0],
  ['碎誓阶梯', 'cathedral', ['shade', 'sentinel', 'seer'], .58, 'vera', 0],
  ['无声祷室', 'cathedral', ['sentinel', 'briar', 'seer', 'choir'], .73, 'iris', 8],
  ['黑荆走廊', 'cloister', ['briar', 'shade', 'seer', 'choir'], .95, null, 4],
  ['诵月侍女', 'cloister', ['sentinel', 'briar', 'shade', 'choir'], 1.12, null, 3],
  ['银火长廊', 'cloister', ['flame', 'storm', 'seer', 'choir'], 1.26, null, 3],
  ['归影之门', 'cloister', ['sentinel', 'shade', 'flame', 'seer', 'choir'], 1.36, null, 3],
  ['坠星钟楼', 'cloister', ['sentinel', 'briar', 'shade', 'seer', 'choir'], 1.52, null, 3],
  ['烬火祭阶', 'altar', ['flame', 'briar', 'shade', 'seer', 'choir'], 1.67, null, 3],
  ['堕落女武神', 'altar', ['boss', 'shade', 'choir'], 1, null, 3]
];

export const stages = stageRows.map(([name, scene, lineup, strength, grantHero, tickets], index) => {
  const id = index + 1;
  return {
    id, name, scene, grantHero, tickets,
    gold: 1500 + id * 540, xp: 320 + id * 100, stone: id === 1 ? 30 : 85 + id * 15,
    enemies: lineup.map(key => key === 'boss'
      ? { name: heroes.hel.name, art: 'hel', element: heroes.hel.element, slot: 1, hp: 20900, atk: 245, boss: true }
      : { ...foes[key], element: heroes[foes[key].art].element, hp: Math.round(1050 * strength * (key === 'choir' && id === 5 ? 1.60 : 1)),
          atk: Math.round(78 * strength), boss: false })
  };
});

export const slots = [
  { name: '武器', symbol: '⚔', atk: 16, hp: 0 },
  { name: '头饰', symbol: '♛', atk: 5, hp: 32 },
  { name: '胸甲', symbol: '⛨', atk: 0, hp: 87 },
  { name: '鞋履', symbol: '♢', atk: 3, hp: 43 }
];
export const grades = [
  { name: '未装备', color: '#a59aad', power: 0, max: 0 },
  { name: '新月礼装', color: '#a4cb94', power: 1, max: 20 },
  { name: '秘银誓约', color: '#a4bdf4', power: 1.8, max: 40 },
  { name: '星辉魔女', color: '#d5a2f3', power: 3.2, max: 60 }
];
export const stars = [
  null,
  { cap: 20, power: 1, shard: 20, stone: 100 },
  { cap: 40, power: 1.25, shard: 40, stone: 300 },
  { cap: 60, power: 1.60 }
];

export const currencies = {
  gold: '金币', xp: '经验', stone: '突破石', ticket: '契约券',
  dust: '星尘', crystal: '心愿结晶', iron: '锻造星砂'
};

export const hints = [
  '点击发光的立绘，释放第一记奥义。',
  '希尔薇优先瞄准血量最低的敌人。',
  '通关解锁星辉酒馆，领取首十连所需的契约券。',
  '将贞德放在前排。通关后解锁圣堂共鸣。',
  '已领取秘银补给。在英雄界面一键换装，强化后再挑战。',
  '遇到火系敌人，可用菲奥娜的水系攻击克制。',
  '强化绑定装备部位，换上更高品质装备会继承强化等级。',
  '战况不利时，可以使用圣匣的免费快速挂机补充资源。',
  '净化祭坛前，准备好贞德和你的前排。',
  '关闭 AUTO，保留贞德的能量。看到「永夜裁决蓄力」时按下她的立绘卡。'
];
