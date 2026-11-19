import test from 'node:test';
import assert from 'node:assert/strict';
import { elements, heroes, openingTeam, selector } from '../src/content.mjs';
import {
  newGame, loadGame, recordVictory, draw, chooseHero, autoEquip, forge, levelUp, ascend,
  effectiveLevel, leaders, resonanceSlots, estimateIdle, claimIdle, switchResonance, swapSlots
} from '../src/progress.mjs';
import { tick, createBattle, castUltimate, changeAuto, isReady } from '../src/battle.mjs';

function play(battle, moves) {
  while (!battle.result) {
    moves?.(battle);
    tick(battle);
    battle.events.length = 0;
  }
  return battle.result;
}

function readyForFirstDraw(seed = 4101) {
  const state = newGame(0, seed);
  [1, 2, 3].forEach(id => recordVictory(state, id, id * 1000));
  return state;
}

test('opening roster, fixed rewards, discounted first ten and saved 30th-draw selection', () => {
  const state = newGame(0, 80);
  assert.equal(state.team.filter(Boolean).length, 3);
  assert.equal(new Set(state.team.filter(Boolean)).size, 3);
  assert.equal(createBattle(state, 1).allies.length, 7);
  assert.equal(draw(state, 10), null);
  const progressed = readyForFirstDraw(80);
  const initial = draw(progressed, 10, () => .97);
  assert.equal(initial.length, 10);
  assert.equal(initial.at(-1).id, 'jeanne');
  assert.equal(progressed.wallet.ticket, 0);
  assert.deepEqual(progressed.team, openingTeam);
  const before = progressed.wallet.gold;
  assert.equal(recordVictory(progressed, 3), null);
  assert.equal(progressed.wallet.gold, before);
  for (let i = 4; i <= 10; i++) recordVictory(progressed, i, i * 1000);
  assert.equal(draw(progressed, 10).length, 10);
  assert.equal(draw(progressed, 10).at(-1).quality, 'pick');
  const restored = loadGame(JSON.stringify(progressed));
  const id = selector[0];
  const oldShards = restored.roster[id].shard;
  assert.equal(chooseHero(restored, id).shard, 60);
  assert.equal(restored.roster[id].shard, oldShards + 60);
  assert.equal(chooseHero(restored, id), null);
  assert.equal(draw(restored, 1), null);
  assert.equal(restored.bossShards, 30);
});

test('resonance follows the fifth leader and equipment upgrades retain part levels', () => {
  const state = readyForFirstDraw();
  draw(state, 10);
  recordVictory(state, 4, 4000);
  const [target] = resonanceSlots(state);
  assert.ok(target);
  assert.equal(levelUp(state, target), 0);
  for (const id of leaders(state)) assert.equal(levelUp(state, id, 2), 2);
  assert.equal(effectiveLevel(state, target), 3);
  assert.equal(switchResonance(state, target), true);
  assert.equal(effectiveLevel(state, target), 1);
  assert.equal(swapSlots(state, 0, 1), true);
  assert.equal(state.team[1], 'jeanne');
  assert.equal(autoEquip(state), 28);
  assert.equal(forge(state, 'jeanne', 0), true);
  state.inventory[0][3]++;
  swapSlots(state, 0, 1);
  assert.equal(autoEquip(state), 1);
  assert.equal(state.roster.jeanne.gear[0], 3);
  assert.equal(state.roster.jeanne.forge[0], 1);
});

test('idle income uses the rate at the time it was earned, caps at 12h and persists claims', () => {
  const state = newGame(0, 330);
  recordVictory(state, 1, 60_000);
  const estimate = estimateIdle(state, 60_000 * 800);
  assert.equal(estimate.minutes, 720);
  assert.equal(estimate.gold, Math.floor(150 + 719 * 187.5));
  const before = state.wallet.gold;
  const now = 60_000 * 800;
  assert.deepEqual(claimIdle(state, now), estimate);
  const restored = loadGame(JSON.stringify(state));
  assert.equal(restored.wallet.gold, before + estimate.gold);
  assert.equal(claimIdle(restored, now), null);
  assert.equal(claimIdle(restored, now, true).minutes, 120);
  assert.equal(claimIdle(loadGame(JSON.stringify(restored)), now + 1000, true), null);
  assert.equal(claimIdle(restored, now + 86400000, true).minutes, 120);
  assert.equal(estimateIdle(restored, now - 3000).minutes, 0);
});

test('the standard chapter route reaches and survives 1-10 with a timed shield', () => {
  const state = newGame(0, 4101);
  for (let stage = 1; stage <= 10; stage++) {
    if (stage === 4) draw(state, 10);
    if (stage === 5) autoEquip(state);
    if (stage >= 5) for (const id of leaders(state)) levelUp(state, id, stage === 5 || stage === 10 ? 5 : 1);
    if (stage === 10) {
      claimIdle(state, 10_000, true);
      ascend(state, 'jeanne');
    }
    const battle = createBattle(state, stage);
    changeAuto(battle, stage > 1 && stage < 10);
    const result = play(battle, stage === 1 ? b => {
      if (b.time >= 900) for (const unit of b.allies) castUltimate(b, unit.id);
    } : stage === 10 ? b => {
      if (b.windup && b.windup.ends - b.time <= 1300) castUltimate(b, 'jeanne');
      if (!b.windup || b.windup.ends - b.time > 1500) {
        for (const unit of b.allies) if (unit.id !== 'jeanne') castUltimate(b, unit.id);
      }
    } : undefined);
    assert.equal(result, 'win', 'stage ' + stage);
    if (stage === 10) assert.equal(battle.shieldHits >= 7, true);
    assert.ok(recordVictory(state, stage, 5000 + stage * 1000));
  }
  assert.equal(state.cleared, 10);
});

test('shield changes boss damage itself and frame batch size cannot change the same moves', () => {
  const state = readyForFirstDraw();
  draw(state, 10);
  autoEquip(state);
  function snapshot(batch, shield) {
    const battle = createBattle(state, 10, 801);
    while (battle.time < 5400 && !battle.result) {
      for (let step = 0; step < batch && battle.time < 5400 && !battle.result; step++) {
        if (shield && battle.time === 4150) {
          assert.ok(isReady(battle, battle.allies[0]));
          assert.ok(castUltimate(battle, 'jeanne'));
        }
        tick(battle);
      }
    }
    const enemyHit = battle.events.findIndex(event => event.type === 'boss');
    assert.notEqual(enemyHit, -1);
    const damage = battle.events.slice(enemyHit + 1, enemyHit + 8).reduce((total, event) => total + event.damage, 0);
    return { damage, shieldHits: battle.shieldHits, hp: battle.allies.map(unit => unit.hp) };
  }
  const shielded = snapshot(1, true);
  assert.equal(shielded.shieldHits, 7);
  assert.deepEqual(shielded, snapshot(3, true));
  assert.ok(shielded.damage < snapshot(2, false).damage);
});

test('elements apply to basic attacks and ultimates without a team faction bonus', () => {
  assert.equal(new Set(openingTeam.map(id => heroes[id].element)).size, Object.keys(elements).length);
  const hit = (targetElement, useUltimate) => {
    const battle = createBattle(newGame(0, 3), 1);
    const freya = battle.allies.find(unit => unit.id === 'freya');
    battle.random = () => .99;
    battle.enemies[0].element = targetElement;
    if (useUltimate) {
      assert.ok(castUltimate(battle, freya.id));
    } else {
      for (const unit of [...battle.allies, ...battle.enemies]) unit.nextAttack = unit === freya ? 50 : 1000;
      battle.enemies.splice(1);
      tick(battle);
    }
    return battle.events.find(event => event.type === 'hit' && event.target === battle.enemies[0].id);
  };
  for (const useUltimate of [false, true]) {
    const neutral = hit('dark', useUltimate);
    const advantaged = hit(elements.fire.beats, useUltimate);
    assert.equal(neutral.advantaged, false);
    assert.equal(advantaged.advantaged, true);
    assert.ok(Math.abs(advantaged.damage - neutral.damage * 1.2) <= 1);
  }
});
