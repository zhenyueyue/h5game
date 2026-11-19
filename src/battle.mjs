import { elements, heroes, openingTeam, stages } from './content.mjs';
import { heroStats, randomFrom } from './progress.mjs';

export const tickMs = 50;
const living = units => units.filter(unit => unit.hp > 0);
const weakest = units => [...units].sort((a, b) => a.hp - b.hp)[0];
const strongest = units => [...units].sort((a, b) => b.atk - a.atk)[0];
const front = units => units.filter(unit => unit.slot < 3);
const back = units => units.filter(unit => unit.slot >= 3);
const firstGroup = (preferred, all) => preferred.length ? preferred : all;

export function createBattle(state, stageId, seed = state.seed + stageId * 2027) {
  const stage = stages[stageId - 1];
  const tutorial = stageId === 1 && state.cleared === 0;
  const team = tutorial ? openingTeam : state.team;
  const allies = team.flatMap((id, slot) => {
    if (!id) return [];
    const profile = heroes[id];
    const stats = tutorial ? { hp: 1250 * profile.hp, atk: 168 * profile.atk, energy: 0, crit: 0 } : heroStats(state, id);
    const maxHp = Math.round(stats.hp);
    return [{
      id, name: profile.name, art: id, element: profile.element, slot, side: 'ally',
      hp: maxHp, maxHp, atk: Math.round(stats.atk), crit: stats.crit,
      speed: profile.speed, energy: tutorial ? (id === 'fiona' || id === 'freya' ? 100 : 65) :
        Math.min(100, stats.energy + (stageId === 10 && id === 'jeanne' ? 73 : 0)),
      nextAttack: 500 + slot * 125, star: tutorial ? 1 : state.roster[id].star,
    }];
  });
  const enemies = stage.enemies.map((enemy, i) => ({
    ...enemy, id: 'enemy-' + i, hp: enemy.hp, maxHp: enemy.hp, side: 'enemy',
    nextAttack: 825 + 170 * i, speed: enemy.boss ? 78 : 100, energy: 0, crit: 0,
  }));
  return {
    stageId, tutorial, allies, enemies, auto: state.settings.auto, time: 0, result: null, events: [],
    random: randomFrom(seed), nextUlt: 0, windup: null, nextBossCast: 2800, damageTaken: 0, shieldHits: 0
  };
}

function addEnergy(unit, amount) {
  if (unit.hp > 0) unit.energy = Math.min(100, unit.energy + amount);
}

function strike(battle, source, target, factor, forcedCrit = false, special = false, ignoreCrit = false) {
  if (!target || target.hp <= 0) return 0;
  const advantaged = elements[source.element].beats === target.element;
  const crit = !ignoreCrit && (forcedCrit || battle.random() < .05 + source.crit + (advantaged ? .15 : 0));
  const sunder = target.sunder > battle.time ? 1.25 : 1;
  const shielded = target.side === 'ally' && battle.protection > battle.time;
  let amount = Math.round(source.atk * factor * (advantaged ? 1.2 : 1) * (crit ? 1.55 : 1) * sunder);
  if (shielded) {
    amount = Math.round(amount * .65);
    if (special) battle.shieldHits++;
  }
  const absorbed = Math.min(amount, target.barrier || 0);
  target.barrier = (target.barrier || 0) - absorbed;
  const damage = Math.min(target.hp, amount - absorbed);
  target.hp -= damage;
  addEnergy(target, 15);
  if (target.hp === 0) addEnergy(source, 30);
  if (target.side === 'ally') battle.damageTaken += damage;
  battle.events.push({ type: 'hit', source: source.id, target: target.id, damage, crit, shielded, advantaged });
  return damage;
}

function heal(battle, unit, amount) {
  const gain = Math.min(unit.maxHp - unit.hp, Math.round(amount));
  if (gain <= 0) return;
  unit.hp += gain;
  battle.events.push({ type: 'heal', target: unit.id, damage: gain });
}

function basicAttack(battle, unit) {
  const foes = living(unit.side === 'ally' ? battle.enemies : battle.allies);
  const vanguard = firstGroup(front(foes), foes);
  if (!foes.length) return;
  const taunted = unit.side === 'enemy' && battle.taunt > battle.time && foes.find(foe => foe.id === 'jeanne');
  const target = taunted || (unit.id === 'vera' ? strongest(firstGroup(back(foes), foes)) :
    unit.id === 'sylvie' ? weakest(foes) : vanguard[unit.slot % vanguard.length]);
  addEnergy(unit, 35);
  if (unit.id === 'jeanne') unit.barrier = Math.max(unit.barrier || 0, Math.round(unit.maxHp * .15));
  const damage = strike(battle, unit, target, unit.boss ? .86 : 1);
  if (unit.id === 'camilla' || unit.id === 'freya') heal(battle, unit, damage * .2);
  if (unit.id === 'iris') heal(battle, weakest(living(battle.allies)), unit.atk * .55);
}

export function isReady(battle, unit) {
  return !battle.result && unit?.hp > 0 && unit.energy >= 100;
}

export function castUltimate(battle, id) {
  const unit = battle.allies.find(hero => hero.id === id);
  if (!isReady(battle, unit) || battle.nextUlt > battle.time) return false;
  const targets = living(battle.enemies);
  const allies = living(battle.allies);
  if (!targets.length) return false;
  const boost = unit.star >= 3 ? 1.25 : 1;
  unit.energy = 0;
  unit.autoAt = undefined;
  battle.nextUlt = battle.time + 200;
  battle.events.push({ type: 'ult', source: id, name: heroes[id].skill });
  switch (id) {
    case 'jeanne':
      battle.protection = Math.max(battle.time + (unit.star >= 3 ? 2050 : 1550), (battle.windup?.ends || -1) + 50);
      battle.taunt = battle.protection;
      break;
    case 'freya':
      for (const target of firstGroup(front(targets), targets)) {
        strike(battle, unit, target, 2.45 * boost);
        target.sunder = battle.time + 2400;
      }
      break;
    case 'camilla':
      for (const target of firstGroup(front(targets), targets)) {
        const damage = strike(battle, unit, target, 2.30 * boost);
        unit.barrier = Math.min(unit.maxHp, (unit.barrier || 0) + Math.round(damage * .40));
      }
      break;
    case 'fiona':
      for (const target of targets) {
        strike(battle, unit, target, 1.70 * boost);
        if (!target.boss && battle.random() < .35) target.nextAttack += 1050;
      }
      break;
    case 'iris':
      for (const ally of allies) {
        heal(battle, ally, unit.atk * 1.85 * boost);
        if (ally !== unit) addEnergy(ally, 20);
      }
      break;
    case 'sylvie': {
      const target = weakest(targets);
      strike(battle, unit, target, 3.40 * boost, true);
      if (!target.hp) addEnergy(unit, 50);
      break;
    }
    case 'vera': {
      const target = strongest(firstGroup(back(targets), targets));
      strike(battle, unit, target, 3.25 * boost);
      target.energy = 0;
      break;
    }
  }
  checkResult(battle);
  return true;
}

function checkResult(battle) {
  if (!living(battle.enemies).length) battle.result = 'win';
  else if (!living(battle.allies).length || battle.time >= 65_000) battle.result = 'lose';
}

export function changeAuto(battle, enabled) {
  battle.auto = enabled;
  for (const ally of battle.allies) ally.autoAt = undefined;
}

export function tick(battle) {
  if (battle.result) return;
  battle.time += tickMs;
  if (battle.auto) {
    for (const unit of battle.allies) {
      if (!isReady(battle, unit)) continue;
      unit.autoAt ??= battle.time + 150;
      if (battle.time >= unit.autoAt) castUltimate(battle, unit.id);
    }
  }
  if (battle.result) return;
  const boss = battle.enemies.find(enemy => enemy.boss && enemy.hp > 0);
  if (boss && !battle.windup && battle.time >= battle.nextBossCast) {
    battle.windup = { starts: battle.time, ends: battle.time + 2400 };
    battle.events.push({ type: 'windup' });
  }
  if (battle.windup && (!boss || battle.time >= battle.windup.ends)) {
    battle.windup = null;
    battle.nextBossCast = battle.time + 5550;
    if (boss) {
      battle.events.push({ type: 'boss', shielded: battle.protection > battle.time });
      for (const ally of living(battle.allies)) strike(battle, boss, ally, 4.25, false, true, true);
    }
  }
  for (const unit of [...battle.allies, ...battle.enemies]) {
    if (unit.hp <= 0 || unit.nextAttack > battle.time || (unit.boss && battle.windup)) continue;
    unit.nextAttack = battle.time + 1450 * (100 / unit.speed);
    basicAttack(battle, unit);
  }
  checkResult(battle);
}
