import { heroes, openingTeam, starterTeam, selector, stages, slots, grades, stars } from './content.mjs';

export const SAVE_KEY = 'aizeran-covenant-v1';
const minuteMs = 60_000;
const maxMinutes = 720;

export function randomFrom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function newGame(now = Date.now(), seed = now) {
  const state = {
    version: 1, revision: 0, seed: seed >>> 0, cleared: 0, roster: {}, team: [...starterTeam], resonant: [],
    wallet: { gold: 750, xp: 170, stone: 0, ticket: 0, dust: 0, crystal: 0, iron: 0 },
    inventory: slots.map(() => [0, 0, 0, 0]), draws: 0, firstTen: false, pickPending: false,
    bossShards: 0, purified: false, lastSaveTimestamp: now, idle: { at: now, spans: [], quickDay: '' },
    settings: { auto: false, speed: 1 },
  };
  starterTeam.filter(Boolean).forEach(id => recruit(state, id));
  return state;
}

export function loadGame(raw, now = Date.now()) {
  if (!raw) return newGame(now);
  try {
    const state = JSON.parse(raw);
    if (state.version === 1 && Array.isArray(state.team) && state.team.length === 7 && state.roster &&
      state.wallet && state.idle && Array.isArray(state.idle.spans) && state.settings) return state;
  } catch {
    // A corrupt browser save cannot be loaded.
  }
  return newGame(now);
}

export function recruit(state, id, duplicate = 20) {
  if (state.roster[id]) {
    state.roster[id].shard += duplicate;
    return { id, shard: duplicate };
  }
  state.roster[id] = { level: 1, star: 1, shard: 0, gear: [0, 0, 0, 0], forge: [0, 0, 0, 0] };
  const preferred = openingTeam.indexOf(id);
  if (!state.team.includes(id) && state.team.includes(null)) {
    const slot = state.team[preferred] === null ? preferred : state.team.indexOf(null);
    state.team[slot] = id;
  }
  return { id, shard: 0 };
}

export function leaders(state) {
  return openingTeam.filter(id => state.roster[id])
    .sort((a, b) => state.roster[b].level - state.roster[a].level).slice(0, 5);
}

export function resonanceSlots(state) {
  if (state.cleared < 4) return [];
  const top = leaders(state);
  return state.resonant.filter(id => state.roster[id] && !top.includes(id)).slice(0, 2);
}

export function switchResonance(state, id) {
  if (state.cleared < 4 || !state.roster[id] || leaders(state).includes(id)) return false;
  const active = resonanceSlots(state);
  state.resonant = active.includes(id) ? active.filter(hero => hero !== id) : [...active, id].slice(-2);
  return true;
}

export function effectiveLevel(state, id) {
  const own = state.roster[id].level;
  if (!resonanceSlots(state).includes(id)) return own;
  const fifth = leaders(state)[4];
  return fifth ? Math.max(own, state.roster[fifth].level) : own;
}

export function heroStats(state, id) {
  const own = state.roster[id];
  const spec = heroes[id];
  const level = effectiveLevel(state, id);
  const power = stars[own.star].power;
  const resonance = Math.min(...own.forge) >= 30 ? 1.40 : Math.min(...own.forge) >= 20 ? 1.25 :
    Math.min(...own.forge) >= 10 ? 1.15 : 1;
  let hp = (820 + 54 * (level - 1)) * spec.hp * power;
  let atk = (100 + 8 * (level - 1)) * spec.atk * power;
  slots.forEach((slot, i) => {
    const gear = grades[own.gear[i]];
    const boost = gear.power * (1 + own.forge[i] * .10);
    hp += slot.hp * boost;
    atk += slot.atk * boost;
  });
  const energy = own.gear.reduce((sum, grade, index) => sum + (grade >= 2 && index % 2 === 0 ? 10 : 0), 0);
  const crit = own.gear.reduce((sum, grade, index) => sum + (grade >= 2 && index % 2 === 1 ? .03 : 0), 0);
  return { hp: Math.round(hp * resonance), atk: Math.round(atk * resonance), level, energy, crit };
}

export function levelCost(own) {
  return { gold: 145 + own.level * 30, xp: 40 + own.level * 12 };
}

export function levelUp(state, id, max = 1) {
  const own = state.roster[id];
  if (!own || resonanceSlots(state).includes(id)) return 0;
  let raised = 0;
  while (raised < max && own.level < stars[own.star].cap) {
    const cost = levelCost(own);
    if (state.wallet.gold < cost.gold || state.wallet.xp < cost.xp) break;
    state.wallet.gold -= cost.gold;
    state.wallet.xp -= cost.xp;
    own.level++;
    raised++;
  }
  return raised;
}

export function ascend(state, id) {
  const own = state.roster[id];
  if (!own || own.star >= 3) return false;
  const { shard, stone } = stars[own.star];
  if (own.shard < shard || state.wallet.stone < stone) return false;
  own.shard -= shard;
  state.wallet.stone -= stone;
  own.star++;
  return true;
}

export function forgeCost(own, part) {
  return { gold: 120 + own.forge[part] * 48, iron: 5 + own.forge[part] * 2 };
}

export function forge(state, id, part) {
  const own = state.roster[id];
  if (!own || !slots[part] || own.forge[part] >= grades[own.gear[part]].max) return false;
  const { gold, iron } = forgeCost(own, part);
  if (state.wallet.gold < gold || state.wallet.iron < iron) return false;
  state.wallet.gold -= gold;
  state.wallet.iron -= iron;
  own.forge[part]++;
  return true;
}

export function autoEquip(state) {
  let count = 0;
  for (const id of state.team.filter(Boolean)) {
    const own = state.roster[id];
    for (const part of slots.keys()) {
      for (let grade = 3; grade > own.gear[part]; grade--) {
        if (!state.inventory[part][grade]) continue;
        state.inventory[part][grade]--;
        if (own.gear[part]) {
          state.wallet.iron += own.gear[part] * 10;
          state.wallet.gold += own.gear[part] * 500;
        }
        own.gear[part] = grade;
        count++;
        break;
      }
    }
  }
  return count;
}

export function swapSlots(state, a, b) {
  if (![a, b].every(index => Number.isInteger(index) && index >= 0 && index < 7) || a === b) return false;
  [state.team[a], state.team[b]] = [state.team[b], state.team[a]];
  return true;
}

export function recordVictory(state, id, now = Date.now()) {
  const stage = stages[id - 1];
  if (!stage || state.cleared + 1 !== id) return null;
  bankIdle(state, now);
  state.cleared = id;
  const loot = { gold: stage.gold, xp: stage.xp, stone: stage.stone, ticket: stage.tickets };
  for (const [key, amount] of Object.entries(loot)) state.wallet[key] += amount;
  if (stage.grantHero) recruit(state, stage.grantHero);
  if (id === 4) {
    state.resonant = openingTeam.filter(hero => state.roster[hero] && !leaders(state).includes(hero)).slice(0, 2);
    slots.forEach((_, part) => { state.inventory[part][2] += 7; });
    state.wallet.iron += 180;
  }
  if (id === 9) state.roster.jeanne && (state.roster.jeanne.shard += 40);
  if (id === 10) {
    state.bossShards += 30;
    state.inventory[0][3]++;
  }
  return loot;
}

export function drawCost(state, amount) {
  return amount === 10 && !state.firstTen && state.draws === 0 ? 8 : amount;
}

export function draw(state, amount, random = randomFrom(state.seed + state.draws * 4507)) {
  if (state.cleared < 3 || ![1, 10].includes(amount) || state.pickPending || state.draws + amount > 30) return null;
  const cost = drawCost(state, amount);
  if (state.wallet.ticket < cost) return null;
  state.wallet.ticket -= cost;
  if (amount === 10 && state.draws === 0) state.firstTen = true;
  const cards = [];
  for (let i = 0; i < amount; i++) {
    state.draws++;
    state.wallet.dust += 10;
    state.wallet.crystal++;
    if (state.draws === 30) {
      state.pickPending = true;
      cards.push({ quality: 'pick' });
      continue;
    }
    if (state.draws === 10 && !state.roster.jeanne) {
      cards.push({ quality: 'SSR', ...recruit(state, 'jeanne') });
      continue;
    }
    const roll = random();
    if (roll < .045) {
      const pool = state.draws <= 10 && !state.roster.jeanne ? openingTeam : selector;
      cards.push({ quality: 'SSR', ...recruit(state, pool[Math.floor(random() * pool.length)]) });
    } else {
      const quality = roll < .50 ? 'SR' : 'R';
      const id = openingTeam[Math.floor(random() * openingTeam.length)];
      const shard = quality === 'SR' ? 10 : 4;
      if (state.roster[id]) state.roster[id].shard += shard;
      else state.wallet.stone += shard * 2;
      cards.push({ quality, id, shard: state.roster[id] ? shard : 0, stone: state.roster[id] ? 0 : shard * 2 });
    }
  }
  return cards;
}

export function chooseHero(state, id) {
  if (!state.pickPending || !selector.includes(id)) return null;
  state.pickPending = false;
  return recruit(state, id, 60);
}

export function idleRates(cleared) {
  const multiplier = 1 + cleared * .25;
  return { gold: 150 * multiplier, xp: 20 * multiplier, stone: 2 * multiplier };
}

export function idleSpans(state, now) {
  const spans = state.idle.spans.map(span => ({ ...span }));
  const elapsed = Math.max(0, (now - state.idle.at) / minuteMs);
  const available = Math.max(0, maxMinutes - spans.reduce((n, span) => n + span.minutes, 0));
  const minutes = Math.min(available, elapsed);
  if (minutes > 0) {
    const previous = spans.at(-1);
    if (previous?.stage === state.cleared) previous.minutes += minutes;
    else spans.push({ stage: state.cleared, minutes });
  }
  return spans;
}

function bankIdle(state, now) {
  state.idle.spans = idleSpans(state, now);
  state.idle.at = Math.max(state.idle.at, now);
}

function rewards(spans, seed, quick = false) {
  const out = { minutes: 0, gold: 0, xp: 0, stone: 0, iron: 0, equipment: [] };
  const random = randomFrom(seed);
  for (const span of spans) {
    out.minutes += span.minutes;
    const rates = idleRates(span.stage);
    for (const key of Object.keys(rates)) out[key] += rates[key] * span.minutes;
    out.iron += span.minutes / 4;
    const chanceCount = Math.floor(span.minutes / 28);
    for (let i = 0; i < chanceCount; i++) {
      const roll = random();
      const grade = span.stage >= 10 && roll < .075 ? 3 : span.stage >= 4 && roll < .325 ? 2 : roll < .90 ? 1 : 0;
      if (grade) out.equipment.push({ part: Math.floor(random() * slots.length), grade });
    }
  }
  if (quick) out.equipment.push({ part: Math.floor(random() * slots.length), grade: spans[0].stage >= 4 ? 2 : 1 });
  for (const key of ['gold', 'xp', 'stone', 'iron']) out[key] = Math.floor(out[key]);
  return out;
}

export function estimateIdle(state, now) {
  return rewards(idleSpans(state, now), state.seed + state.idle.at);
}

export function dayKey(now) {
  const date = new Date(now);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-');
}

export function claimIdle(state, now, quick = false) {
  if (quick && state.idle.quickDay === dayKey(now)) return null;
  const out = quick ? rewards([{ stage: state.cleared, minutes: 120 }], state.seed + now, true) : estimateIdle(state, now);
  if (out.minutes < 1) return null;
  for (const key of ['gold', 'xp', 'stone', 'iron']) state.wallet[key] += out[key];
  for (const { part, grade } of out.equipment) state.inventory[part][grade]++;
  if (quick) state.idle.quickDay = dayKey(now);
  else {
    state.idle.at = Math.max(state.idle.at, now);
    state.idle.spans = [];
  }
  return out;
}
