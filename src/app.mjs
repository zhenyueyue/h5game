import { elements, heroes, openingTeam, selector, chapter, stages, slots, grades, stars, currencies, hints } from './content.mjs';
import { SAVE_KEY, loadGame, leaders, resonanceSlots, switchResonance, heroStats, levelCost, levelUp, ascend, forgeCost, forge, autoEquip, swapSlots, recordVictory, drawCost, draw, chooseHero, idleRates, estimateIdle, dayKey, claimIdle } from './progress.mjs';
import { tickMs, createBattle, isReady, castUltimate, changeAuto, tick } from './battle.mjs';

const view = document.querySelector('#view');
const shell = document.querySelector('.app-shell');
const nav = document.querySelector('#navigation');
const resourceBar = document.querySelector('#resources');
const playerBadge = document.querySelector('#player-badge');
const dialog = document.querySelector('#dialog');
const modal = document.querySelector('#dialog-content');
const toast = document.querySelector('#toast');
const number = new Intl.NumberFormat('zh-CN');
const fmt = value => number.format(Math.floor(value));
const media = matchMedia('(prefers-reduced-motion: reduce)');
const portraitLayout = matchMedia('(max-width: 800px)');
const pages = {
  sanctum: ['圣堂', 'sanctum'],
  adventure: ['战役', 'sword'],
  chapter: ['关卡', 'compass'],
  formation: ['布阵', 'grid'],
  heroes: ['英雄', 'hero'],
  tavern: ['召唤', 'summon'],
  vault: ['圣匣', 'chest']
};

function icon(name) {
  if (name !== 'reset') return interfaceIcon(name, 'icon');
  return '<svg class="icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M27 16a11 11 0 1 1-3-8l3 3m0-7v7h-7"/></svg>';
}

function interfaceIcon(name, classes) {
  return `<img class="${classes}" src="${art['emblem-' + name]}" alt="" draggable="false">`;
}

let storageOkay = true;
function readSave() {
  try { return localStorage.getItem(SAVE_KEY); }
  catch { storageOkay = false; return null; }
}

function storeSave(next) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); }
  catch {
    storageOkay = false;
    notice('浏览器无法保存进度，本局暂存在当前标签页');
  }
}

const raw = readSave();
let game = loadGame(raw);
if (!raw && storageOkay) storeSave(game);
let page = route();
let chosen = null;
let stageSelected = Math.min(game.cleared + 1, 10);
let fight = null;
let pendingMoves = [];
let frame = 0;
let previousFrame = 0;
let backlog = 0;
let cutinTimer;
let toastTimer;
let busy = false;
let mandatoryModal = false;
let formationSelection = -1;
let formationReturn = 'adventure';
let sideReturn = 'sanctum';

function notice(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2700);
}

async function update(apply) {
  const write = () => {
    const saved = storageOkay ? readSave() : null;
    const latest = saved ? loadGame(saved) : game;
    const next = JSON.parse(JSON.stringify(latest.revision >= game.revision ? latest : game));
    const result = apply(next);
    if (!result) return result;
    next.revision++;
    next.lastSaveTimestamp = Date.now();
    game = next;
    storeSave(game);
    renderWallet();
    return result;
  };
  return navigator.locks ? navigator.locks.request(SAVE_KEY, write) : write();
}

window.addEventListener('storage', event => {
  if (event.key !== SAVE_KEY || !event.newValue) return;
  const next = loadGame(event.newValue);
  if (next.revision <= game.revision) return;
  game = next;
  renderWallet();
  if (!fight && !dialog.open && !busy) render();
});

function route() {
  const id = location.hash.slice(1);
  return Object.hasOwn(pages, id) ? id : portraitLayout.matches ? 'sanctum' : 'adventure';
}

function changePage() {
  const next = route();
  if (fight && !fight.result && next !== 'adventure') {
    location.hash = 'adventure';
    notice('请结束战斗或撤退后再离开');
    return;
  }
  if (next !== page) {
    if (next === 'formation' && page !== 'heroes') formationReturn = 'adventure';
    if (next === 'tavern' || next === 'vault') sideReturn = ['sanctum', 'adventure', 'heroes'].includes(page) ? page : 'sanctum';
    page = next;
    chosen = null;
    if (page !== 'formation') formationSelection = -1;
    window.scrollTo(0, 0);
  }
  render();
}
window.addEventListener('hashchange', changePage);
portraitLayout.addEventListener('change', () => {
  if (fight || dialog.open) render();
  else changePage();
});
window.addEventListener('resize', fitRestoredBattle);

function walletChips(keys = ['gold', 'xp', 'stone', 'ticket']) {
  return keys.map(key => {
    const name = currencies[key];
    return `<span class="wallet-chip" title="${name}">${interfaceIcon(key, 'currency')}<b aria-label="${name} ${fmt(game.wallet[key])}">${fmt(game.wallet[key])}</b></span>`;
  }).join('');
}

function renderWallet() {
  playerBadge.innerHTML = `<img src="${heroFace('freya')}" alt=""><div class="player-progress">
    <b>契约者</b><small>第一章 · ${game.cleared}/${stages.length}</small>
    <div class="player-track" aria-hidden="true"><i style="width:${game.cleared / stages.length * 100}%"></i></div></div>`;
  resourceBar.innerHTML = walletChips();
  const vaultWallet = view.querySelector('.vault-wallet');
  if (vaultWallet) vaultWallet.innerHTML = walletChips(['gold', 'xp', 'ticket']);
  const restoredWallet = view.querySelector('.restored-wallet');
  if (restoredWallet) restoredWallet.innerHTML = walletChips();
}

function render() {
  renderWallet();
  view.dataset.page = page;
  shell.dataset.scene = page;
  if (page !== 'adventure') shell.classList.remove('boss-restoration', 'portrait-boss-restoration');
  document.querySelector('.wordmark').href = portraitLayout.matches ? '#sanctum' : '#adventure';
  const activeTab = page === 'chapter' || page === 'formation' ? 'adventure' : page;
  nav.innerHTML = Object.entries(pages).map(([key, [label, mark]]) =>
    '<a href="#' + key + '"' + (key === page ? ' aria-current="page"' : '') + (key === activeTab && key !== page ? ' data-parent-current' : '') + '>' +
    '<span class="nav-icon">' + interfaceIcon(mark, 'nav-emblem') + '</span><span>' + label + '</span>' + (key === 'tavern' && game.cleared < 3 ? '<small>未解锁</small>' : '') + '</a>'
  ).join('');
  document.querySelector('.monogram').innerHTML = interfaceIcon('crest', 'nav-emblem');
  if (page === 'sanctum') renderSanctum();
  if (page === 'adventure') renderAdventure();
  if (page === 'chapter') renderChapter();
  if (page === 'formation') renderFormation();
  if (page === 'heroes') renderHeroes();
  if (page === 'tavern') renderTavern();
  if (page === 'vault') renderVault();
}

function heroFace(id) {
  return art['gothic-face-' + id];
}

function portrait(id, classes = '') {
  const large = art['gothic-portrait-' + id];
  const medium = art['gothic-medium-' + id];
  return '<img class="' + classes + '" src="' + large + '" alt="" draggable="false"' +
    ' srcset="' + medium + ' 400w, ' + large + ' 800w" sizes="(max-width: 800px) 96vw, 40vw">';
}

function illustrationLabel(id) {
  return heroes[id].name + ' · ' + heroes[id].title + '插画';
}

function illustration(id, classes = '') {
  return `<div class="illustration ${classes}" data-character="${id}">
    <img class="illustration-scene" src="${art['gallery-scene-' + id]}" alt="" draggable="false">
    <img class="illustration-figure" src="${art['gallery-figure-' + id]}" alt="${illustrationLabel(id)}" draggable="false">
  </div>`;
}

const sceneArtwork = { cathedral: 'gothic-arena', cloister: 'cloister', altar: 'gothic-altar' };

function sceneImage(scene, mobile = false) {
  if (scene === 'altar' && mobile) return art['gothic-portrait-altar'];
  return art[sceneArtwork[scene]];
}

function headingBack(title, target = 'adventure') {
  return `<header class="scene-heading">
    <a href="#${target}" class="control scene-back" aria-label="返回${pages[target][0]}">‹</a>
    <h1>${title}</h1>
    ${portraitLayout.matches && target !== 'sanctum' ? `<a href="#sanctum" class="control scene-home" aria-label="返回圣堂">${icon('sanctum')}</a>` : ''}
  </header>`;
}

function artStyle(id) {
  return 'background-image:url(' + heroFace(id) + ');--element:' + elements[heroes[id].element].color;
}

function elementMark(key) {
  const entry = elements[key];
  return `<span class="element-mark" style="--element:${entry.color}" title="${entry.name}克${elements[entry.beats].name}">${entry.name}</span>`;
}

function elementGuide() {
  return `<details class="element-guide"><summary>元素克制</summary><div>${Object.entries(elements).map(([key, entry]) =>
    `<span>${elementMark(key)} › ${elementMark(entry.beats)}</span>`).join('')}</div>
    <p>克制时伤害提高 20%，并提高 15 个百分点的暴击率。</p></details>`;
}

function pageHeading(kicker, title, description) {
  return '<header class="page-heading"><div><p class="eyebrow">' + kicker + '</p><h1>' + title +
    '</h1>' + (description ? '<p class="description">' + description + '</p>' : '') + '</div></header>';
}

function renderSanctum() {
  const stage = stages[Math.min(game.cleared, 9)];
  view.innerHTML = `
    <section class="sanctum" aria-labelledby="sanctum-title" style="--scene:url(${art['gothic-sanctuary']});--portrait-scene:url(${art['gothic-sanctuary']})">
      ${portrait('freya', 'sanctum-art')}
      <h1 class="scene-title" id="sanctum-title">${icon('sanctum')}圣堂</h1>
      <div class="sanctum-content">
        <p>${game.cleared === 10 ? '第一章已净化' : '第一章 · 1-' + stage.id + ' ' + stage.name}</p>
        <a class="button primary" href="#adventure">继续冒险</a>
      </div>
    </section>`;
}

function renderAdventure() {
  const available = Math.min(game.cleared + 1, 10);
  stageSelected = Math.min(stageSelected, available);
  const stage = stages[stageSelected - 1];
  const tutorial = stage.id === 1 && game.cleared === 0;
  const team = fight ? game.team.map((_, slot) => fight.allies.find(unit => unit.slot === slot)?.id || null)
    : tutorial ? openingTeam : game.team;
  const units = fight || createBattle(game, stage.id);
  const boss = units.enemies.find(unit => unit.boss);
  const restored = stage.id === 10;
  shell.classList.toggle('boss-restoration', restored && !portraitLayout.matches);
  shell.classList.toggle('portrait-boss-restoration', restored && portraitLayout.matches);
  if (restored) {
    if (portraitLayout.matches) renderRestoredPortraitBattle(stage, units, team);
    else renderRestoredBattle(stage, units, team);
    if (fight) drawFrame();
    return;
  }
  const scene = sceneImage(stage.scene, portraitLayout.matches);
  view.style.setProperty('--field-image', 'url(' + scene + ')');
  const actions = battleActions(stage);
  view.innerHTML = `
    <div class="adventure${boss ? ' boss-encounter' : ''}">
      <div class="adventure-grid">
        <section class="battle-panel ${fight ? 'in-fight' : ''}" aria-label="战场">
          <header class="battle-header">
            ${fight ? '' : '<a href="#chapter" class="control chapter-control">' + icon('compass') + '<span>关卡</span></a>'}
            ${portraitLayout.matches ? '<span class="battle-plate" aria-hidden="true">' + icon('sword') + '战役</span>' : ''}
            <div class="stage-title"><span>第一章 · 1-${stage.id}</span><h1>${stage.name}</h1></div>
          </header>
          <div class="arena scene-${stage.scene}" id="arena">
            <div class="arena-vignette"></div>
            ${boss ? `<div class="boss-hud">${elementMark(boss.element)}<div><div class="boss-label"><b>${boss.name}</b><span id="boss-percent">100%</span></div><div class="boss-meter" role="progressbar" aria-label="赫尔薇尔生命" aria-valuenow="100"><i></i></div></div></div>` : ''}
            <div id="windup" class="windup" hidden aria-live="polite"></div>
            <div id="units">${[...units.allies.map(unit => unitHTML(unit, Boolean(boss))), ...units.enemies.map(unit => unitHTML(unit, Boolean(boss)))].join('')}</div>
            <div id="battle-fx"></div>
            <div id="cutin" class="cutin" hidden></div>
            <div class="arena-caption" id="arena-caption">${fight ? '交战中' : '备战阶段'}</div>
          </div>
          <div class="battle-options" aria-label="战斗设置">
            <button class="control ${game.settings.auto ? 'enabled' : ''}" data-action="auto" aria-pressed="${game.settings.auto}" aria-label="自动释放必杀">${icon('reset')} AUTO</button>
            <div class="speed-options" role="group" aria-label="战斗速度">
              ${[1, 2, 3].map(speed => `<button class="control" data-action="speed" data-id="${speed}" aria-label="${speed} 倍速" aria-pressed="${game.settings.speed === speed}">${speed}×</button>`).join('')}
            </div>
          </div>
          <div class="battle-dock">
            <div class="dock-slots">${team.map((id, index) => dockSlot(id, index, tutorial)).join('')}</div>
          </div>
          <footer class="battle-footer">
            <div class="battle-hint"><span>✦</span><p>${hints[stage.id - 1]}</p></div>
            ${portraitLayout.matches ? actions : ''}
          </footer>
        </section>
        ${portraitLayout.matches ? '' : stagePanel(stage, units.enemies, actions)}
      </div>
    </div>`;
  if (fight) drawFrame();
}

function battleArt(part, className = '', alt = '', skin = 'ui') {
  return `<img class="${className}" src="${art['boss-' + skin + '-' + part]}" alt="${alt}" draggable="false">`;
}

function fitRestoredBattle() {
  const stage = view.querySelector('.restored-stage-window');
  if (!stage) return;
  stage.style.setProperty('--stage-scale', Math.min(innerWidth / 1280, innerHeight / 720));
}

function renderRestoredBattle(stage, units, team) {
  const cleared = stage.id <= game.cleared;
  const backdrop = `--restored-field:url(${sceneImage(stage.scene)});
    --restored-control-rule:url(${art['boss-ui-control-line']})`;
  view.innerHTML = `
    <section class="restored-stage-window" aria-label="1-10 战役">
      <div class="restored-stage${fight ? ' in-fight' : ''}" style="${backdrop}">
        <header class="restored-header">
          <a class="restored-wordmark" href="#sanctum" aria-label="艾泽兰契约，返回圣堂">${battleArt('wordmark')}</a>
          <div class="restored-profile">
            <img src="${heroFace('freya')}" alt="" draggable="false">
            <div><b>契约者</b><small>第一章 · ${game.cleared}/${stages.length}</small>
              <div class="player-track" aria-hidden="true"><i style="width:${game.cleared / stages.length * 100}%"></i></div></div>
          </div>
          <div class="restored-wallet" aria-label="当前资源">${walletChips()}</div>
        </header>
        <nav class="restored-navigation" aria-label="游戏导航">
          ${Object.entries(pages).map(([key, [label]]) =>
            `<a class="restored-nav-${key}" href="#${key}" aria-label="${label}" ${key === 'adventure' ? 'aria-current="page"' : ''}>${battleArt('nav-' + key)}</a>`).join('')}
        </nav>
        <h1 class="restored-heading">${battleArt('heading', '', '第一章 1-10 堕落女武神')}</h1>
        ${restoredBossHp(units, 'ui')}
        ${restoredArena(units, restoredBossLayout.desktop)}
        ${restoredDock(team, units, 'ui')}
        ${restoredBattleControls('ui')}
        <aside class="restored-plaque" aria-label="暮钟圣堂 · 关卡情报">
          ${battleArt('plaque', 'restored-plaque-face')}
          <img class="restored-boss-avatar" src="${heroFace('hel')}" alt="" draggable="false">
          <div class="restored-sr">敌方首领赫尔薇尔。战斗目标为击败赫尔薇尔，限时 65 秒。</div>
          <div class="restored-rewards" aria-label="${cleared ? '首通收益已领取' : '首通收益'}">
            ${['gold', 'xp', 'stone'].map(key =>
              `<span aria-label="${currencies[key]} ${fmt(stage[key])}" title="${currencies[key]} ${fmt(stage[key])}">${fmt(stage[key])}</span>`).join('')}
            <small>${cleared ? '首通已领取' : '契约券 ×' + stage.tickets}</small>
          </div>
          ${fight
            ? '<button class="button outline restored-retreat" data-action="retreat">撤退</button>'
            : `<button class="restored-challenge" data-action="fight" aria-label="${cleared ? '重温战斗' : '挑战 1-10'}" title="${hints[9]}">${battleArt('challenge')}</button>`}
        </aside>
        <div class="restored-element-guide">${elementGuide()}</div>
      </div>
    </section>`;
  fitRestoredBattle();
}

function renderRestoredPortraitBattle(stage, units, team) {
  const lowerArt = ['speed-idle', 'speed-idle-metal', 'speed-gold', 'speed-gold-metal', 'action', 'action-silver',
    'tray-edge', 'tray-top', 'tray-bottom']
    .map(part => `--portrait-${part}:url(${art['boss-mobile-' + part]})`).join(';');
  view.innerHTML = `
    <section class="portrait-boss${fight ? ' in-fight' : ''}" aria-label="1-10 战役" style="--restored-field:url(${sceneImage(stage.scene, true)});${lowerArt}">
      <header class="portrait-boss-header">
        ${fight ? '' : '<a href="#chapter" class="control scene-back portrait-boss-map" aria-label="返回关卡">‹</a>'}
        ${battleArt('heading', 'portrait-boss-plate', '', 'mobile')}
        <h1>${battleArt('title', '', '第一章 1-10 堕落女武神', 'mobile')}</h1>
      </header>
      ${restoredBossHp(units, 'mobile')}
      ${restoredArena(units, restoredBossLayout.portrait)}
      ${restoredBattleControls('mobile')}
      ${restoredDock(team, units, 'mobile')}
      ${battleActions(stage, true)}
      ${battleArt('corner-left', 'portrait-boss-roses left', '', 'mobile')}
      ${battleArt('corner-right', 'portrait-boss-roses right', '', 'mobile')}
    </section>`;
}

function restoredBossHp(units, skin) {
  const boss = units.enemies.find(unit => unit.boss);
  const percent = Math.ceil(boss.hp / boss.maxHp * 100);
  const texture = `--hp-well:url(${art['boss-ui-hp-track']});--hp-ink:url(${art['boss-ui-hp-fill']});
    --hp-type-well:url(${art['boss-' + skin + '-hp-number']})`;
  return `<div class="restored-hp" style="${texture}">
    ${battleArt('hp-frame', 'restored-hp-frame', '', skin)}${battleArt('hp-gem', 'restored-hp-gem', '', skin)}
    <div class="boss-meter" role="progressbar" aria-label="赫尔薇尔生命" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div>
    <span id="boss-percent">${percent}%</span>
  </div>`;
}

function restoredArena(units, layout) {
  return `<div class="arena restored-arena" id="arena" aria-label="暮钟圣堂战场">
    <div id="windup" class="windup" hidden aria-live="polite"></div>
    <div id="units">${[...units.allies, ...units.enemies].map(unit => unitHTML(unit, true, layout)).join('')}</div>
    <div id="battle-fx"></div>
    <div id="cutin" class="cutin" hidden></div>
    <span class="restored-impact" role="status" hidden></span>
    <div class="arena-caption" id="arena-caption" ${fight ? '' : 'hidden'}></div>
  </div>`;
}

function restoredDock(team, units, skin) {
  const layoutClass = skin === 'mobile' ? 'portrait-boss-dock' : 'restored-dock';
  return `<div class="${layoutClass}" aria-label="必杀卡牌">
    ${team.map((id, index) => dockSlot(id, index, false, units.allies.find(unit => unit.slot === index))).join('')}
  </div>`;
}

function restoredBattleControls(skin) {
  const layoutClass = skin === 'mobile' ? 'portrait-boss-controls' : 'restored-controls';
  return `<div class="${layoutClass}" role="group" aria-label="战斗设置">
    ${skin === 'mobile' ? '<span class="portrait-boss-tray" aria-hidden="true"></span>' : ''}
    <button class="restored-auto" data-action="auto" aria-pressed="${game.settings.auto}" aria-label="自动释放必杀">${battleArt('auto', '', '', skin)}</button>
    ${[1, 2, 3].map(speed =>
      `<button class="restored-speed" data-action="speed" data-id="${speed}" aria-label="${speed} 倍速" aria-pressed="${game.settings.speed === speed}">${skin === 'mobile'
        ? `<span class="portrait-speed-plate" aria-hidden="true"></span><span class="portrait-speed-text" aria-hidden="true">${speed}×</span>`
        : battleArt('speed-' + speed)}</button>`).join('')}
  </div>`;
}

function portraitBattleCommand(action, label) {
  return `<button class="portrait-boss-command" data-action="${action}">
    <span class="portrait-command-plate" aria-hidden="true"></span><span class="portrait-command-text">${label}</span>
  </button>`;
}

function battleActions(stage, restoredPortrait = false) {
  if (restoredPortrait) {
    const action = fight ? portraitBattleCommand('retreat', '撤退')
      : portraitBattleCommand('formation', '布阵') + `<button class="portrait-boss-challenge" data-action="fight"
        aria-label="${stage.id <= game.cleared ? '重温战斗' : '挑战'}">${battleArt('challenge')}</button>`;
    return `<div class="battle-actions">${action}</div>`;
  }
  const label = stage.id <= game.cleared ? '重温战斗' : '挑战';
  const formationAction = portraitLayout.matches ? `<button class="button outline" data-action="formation">${icon('grid')}布阵</button>` : '';
  return `<div class="battle-actions">${fight
    ? '<button class="button outline" data-action="retreat">撤退</button>'
    : `${formationAction}<button class="button primary" data-action="fight">${label}</button>`
  }</div>`;
}

function stagePanel(stage, enemies, actions) {
  const enemy = enemies.find(unit => unit.boss) || enemies[0];
  return `<aside class="chapter-panel paper" aria-label="关卡情报">
    <header class="chapter-heading"><h2>${chapter}</h2></header>
    <section class="intel enemy-intel">
      <div class="enemy-card"><img src="${art['gothic-card-' + enemy.art]}" alt=""><div><small>${enemy.boss ? '敌方首领' : '敌方先锋'}</small><b>${enemy.name}</b><small>${elementMark(enemy.element)} ${enemy.boss ? heroes.hel.skill : '元素'}</small></div></div>
    </section>
    <section class="intel"><h3>战斗目标</h3><p>◆ ${enemy.boss ? '击败赫尔薇尔' : '击败敌方小队'}</p><p>⌛ 限时 65 秒</p></section>
    <section class="intel"><h3>首通奖励 ${stage.id <= game.cleared ? '<small>已领取</small>' : ''}</h3>
      ${rewardList({ gold: stage.gold, xp: stage.xp, stone: stage.stone, ticket: stage.tickets })}
    </section>
    ${actions}
    ${elementGuide()}
    ${game.bossShards ? '<p class="boss-trophy">赫尔薇尔碎片 ×' + game.bossShards + '</p>' : ''}
  </aside>`;
}

const mapPoints = [[24, 89], [43, 82], [30, 74], [56, 66], [71, 58], [46, 50], [27, 42], [44, 34], [61, 26], [77, 17]];

function renderChapter() {
  const stage = stages[stageSelected - 1];
  const next = Math.min(stages.length, game.cleared + 1);
  const line = mapPoints.map(([x, y], index) => {
    if (!index) return `M ${x} ${y}`;
    const [previousX, previousY] = mapPoints[index - 1];
    const midY = (y + previousY) / 2;
    return `C ${previousX} ${midY}, ${x} ${midY}, ${x} ${y}`;
  }).join(' ');
  view.innerHTML = `
    <section class="chapter-screen scene-screen" style="--scene:url(${art['night-map']})">
      ${headingBack(portraitLayout.matches ? '关卡' : chapter)}
      <div class="map-board">
        <svg class="map-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${line}"/></svg>
        <ol class="map-stages">${stages.map((entry, index) => {
            const [x, y] = mapPoints[index];
            const state = entry.id <= game.cleared ? '已通关' : entry.id === game.cleared + 1 ? '可挑战' : '未解锁';
            return `<li style="--x:${x}%;--y:${y}%"><button data-action="stage" data-id="${entry.id}" aria-label="1-${entry.id} ${entry.name}，${state}" ${entry.id > game.cleared + 1 ? 'disabled' : ''} ${entry.id === stageSelected ? 'aria-current="step"' : ''}><span>1-${entry.id}</span></button></li>`;
          }).join('')}</ol>
      </div>
      <footer class="scene-actions ${portraitLayout.matches ? 'map-actions' : ''}">
        ${portraitLayout.matches ? `
          <button class="control round-control" data-action="stage" data-id="${stage.id - 1}" aria-label="上一关" ${stage.id === 1 ? 'disabled' : ''}>‹</button>
          <a class="button outline" href="#adventure" aria-label="前往 1-${stage.id} ${stage.name}">1-${stage.id}</a>
          <button class="control round-control" data-action="stage" data-id="${stage.id + 1}" aria-label="下一关" ${stage.id >= next ? 'disabled' : ''}>›</button>
        ` : `<span>1-${stage.id} · ${stage.name}</span><a class="button primary" href="#adventure">前往战役</a>`}
      </footer>
    </section>`;
}

function dockSlot(id, index, tutorial, unit = fight?.allies.find(entry => entry.slot === index)) {
  const star = id ? (tutorial ? 1 : game.roster[id]?.star || 1) : 0;
  const label = id ? heroes[id].name : '空位';
  return '<button class="dock-card' + (id ? '' : ' empty') + '" data-action="dock" data-id="' + index + '" id="dock-' + index + '"' +
    (id ? ' style="--card-art:url(' + art['gothic-card-' + id] + ');--element:' + elements[heroes[id].element].color +
      '"' : '') + ' aria-label="' + label + (id ? '，' + elements[heroes[id].element].name + '元素，快捷键 ' + (index + 1) : '') + '"' +
    (fight && !id ? ' disabled' : '') + '>' +
    '<kbd>' + (index + 1) + '</kbd>' + (id ? '<span class="card-sigil">' + elementMark(heroes[id].element) + '</span>' : '') + '<span class="ready-icon" aria-hidden="true">ϟ</span><span class="dock-name">' + label + '</span>' +
    (id ? '<small class="dock-stars" aria-hidden="true">' + '✦'.repeat(star) + '</small>' : '') +
    '<span class="meter life"><i style="width:' + (id ? unit ? unit.hp / unit.maxHp * 100 : 100 : 0) + '%"></i></span>' +
    '<span class="meter energy"><i style="width:' + (unit?.energy || 0) + '%"></i></span></button>';
}

const allyPositions = [[19, 88], [34, 92], [49, 88], [12, 67], [25, 68], [40, 67], [54, 65]];
const desktopBossTeam = [[20, 98], [34, 99], [51, 98], [11, 76], [24, 74], [41, 73], [56, 74]];
const restoredBossLayout = {
  desktop: {
    allies: [[17, 96], [32, 97], [47, 96], [9, 68], [23, 66], [37, 67], [51, 67]],
    guards: { 2: [63, 94], 4: [94, 69] }, boss: [81, 94]
  },
  portrait: {
    allies: [[14, 96], [31, 97], [48, 96], [10, 83], [24, 81], [38, 81], [52, 83]],
    guards: { 2: [64, 94], 4: [94, 77] }, boss: [77, 93]
  }
};
const enemyPositions = [[70, 75], [77, 91], [88, 82], [69, 56], [84, 57], [91, 68]];
const bossGuards = { 2: [68, 91], 4: [93, 78] };

function unitHTML(unit, bossEncounter, layout) {
  const guardPosition = bossEncounter && unit.side === 'enemy' && (layout?.guards || bossGuards)[unit.slot];
  const desktopBoss = bossEncounter && !portraitLayout.matches;
  const allies = layout?.allies || (desktopBoss ? desktopBossTeam : allyPositions);
  const [x, y] = unit.boss ? (layout?.boss || (desktopBoss ? [85.5, 97] : [81, 83]))
    : guardPosition || (unit.side === 'ally' ? allies : enemyPositions)[unit.slot];
  const image = art['gothic-unit-' + unit.art];
  return '<div class="unit ' + unit.side + (unit.boss ? ' boss' : guardPosition ? ' boss-guard' : '') + '" id="unit-' + unit.id + '" data-slot="' + unit.slot + '" style="--x:' + x +
    '%;--y:' + y + '%;--depth:' + y + ';--idle-offset:-' + (unit.slot % 4) * .6 + 's" aria-hidden="true"><div class="unit-body">' +
    '<span class="unit-ground" style="--ground-image:url(' + image + ')"></span>' +
    '<img src="' + image + '" alt="" draggable="false"><span class="unit-hp">' + elementMark(unit.element) + '<span><i></i></span></span></div></div>';
}

function renderHeroes() {
  const ids = openingTeam.filter(id => game.roster[id]);
  if (!ids.includes(chosen)) chosen = ids[0];
  const own = game.roster[chosen];
  const spec = heroes[chosen];
  const stats = heroStats(game, chosen);
  const element = elements[spec.element];
  const leading = leaders(game);
  const resonating = resonanceSlots(game);
  const isResonant = resonating.includes(chosen);
  const cost = levelCost(own);
  const tier = stars[own.star];
  const upgradeLocked = isResonant || own.level >= tier.cap || game.wallet.xp < cost.xp || game.wallet.gold < cost.gold;
  const upgrade = `<button class="button primary" data-action="level" ${upgradeLocked ? 'disabled' : ''}>${isResonant ? '共鸣同步中' : '升级'}</button>`;
  const resonance = `<details class="resonance" id="hero-resonance"${portraitLayout.matches ? '' : ' open'}><summary>圣堂共鸣</summary>${game.cleared < 4 ? '<p>通关 1-4 解锁。</p>' :
    '<p>第 5 名领唱 Lv.' + (leading.length === 5 ? game.roster[leading[4]].level : '—') + ' · 共鸣槽 ' + resonating.length + '/2</p><p>' +
    leading.map(id => heroes[id].name).join(' · ') + '</p>' + (resonating.length ? '<p>共鸣中 · ' + resonating.map(id => heroes[id].name).join(' · ') + '</p>' : '')}</details>`;
  view.innerHTML = `
    <div class="secondary hero-screen" style="--hero-scene:url(${art['gothic-sanctuary']})">
      ${portraitLayout.matches ? headingBack('英雄', 'sanctum') : pageHeading('契约名册', '英雄', '培养五名领唱，借由圣堂共鸣带动满编七人。')}
      <div class="hero-layout">
        <section class="hero-picker paper" aria-label="英雄列表">
          <h2>已契约 <small>${ids.length} / 7</small></h2>
          <div class="hero-grid">${openingTeam.map(id => game.roster[id]
            ? '<button class="hero-thumb" data-action="hero" data-id="' + id + '" aria-pressed="' + (id === chosen) + '" style="' + artStyle(id) + '"><span>' + heroes[id].name + '</span><small>Lv.' + heroStats(game, id).level + '</small></button>'
            : '<div class="hero-thumb unavailable"><span>' + heroes[id].name + '</span><small>未契约</small></div>').join('')}</div>
          <button class="button outline dark" data-action="formation">${icon('grid')}调整布阵</button>
          ${portraitLayout.matches ? '' : resonance}
          ${portraitLayout.matches ? '<div class="hero-quick">' + upgrade + '</div>' : ''}
        </section>
        <section class="hero-showcase" style="--element:${element.color}">
          ${illustration(chosen, 'showcase-art')}
          <button class="control portrait-zoom" data-action="gallery" aria-haspopup="dialog">插画鉴赏</button>
          ${portraitLayout.matches ? `<div class="hero-tools" aria-label="英雄操作">
            <button class="control" data-action="hero-detail" data-id="hero-details" aria-label="查看属性">${icon('sword')}</button>
            <button class="control" data-action="hero-detail" data-id="hero-gear" aria-label="查看装备">${interfaceIcon('equipment', 'icon')}</button>
            <button class="control" data-action="hero-detail" data-id="hero-resonance" aria-label="查看共鸣">${icon('summon')}</button>
            <button class="control" data-action="formation" aria-label="调整布阵">${icon('grid')}</button>
          </div>` : ''}
          <div class="showcase-caption"><p>${elementMark(spec.element)} · ${spec.role}</p><small>${spec.title}</small><h2>${spec.name}</h2>
            <b>${'✦'.repeat(own.star)}</b></div>
        </section>
        <section class="hero-details paper" id="hero-details" tabindex="-1">
          <div class="stat-row"><div><small>等级</small><b>${stats.level}<em> / ${Math.max(tier.cap, stats.level)}</em></b></div><div><small>生命</small><b>${fmt(stats.hp)}</b></div><div><small>攻击</small><b>${fmt(stats.atk)}</b></div></div>
          <div class="skill-details"><h2>${spec.skill}</h2><p>${spec.desc}</p></div>
          ${elementGuide()}
          <div class="training">
            ${portraitLayout.matches ? '' : upgrade}
            <button class="button outline dark" data-action="level-batch" ${upgradeLocked ? 'disabled' : ''}>升 5 级</button>
            <button class="button outline dark" data-action="ascend" ${own.star >= 3 || own.shard < tier.shard || game.wallet.stone < tier.stone ? 'disabled' : ''}>升星</button>
            ${game.cleared >= 4 && !leading.includes(chosen) ? '<button class="button outline dark" data-action="resonance">' + (isResonant ? '移出共鸣' : '加入共鸣') + '</button>' : ''}
          </div>
          <p class="cost-line">${isResonant ? '等级随第 5 名领唱同步' : '升级需 ' + fmt(cost.gold) + ' 金币 / ' + fmt(cost.xp) + ' 经验'}<br>${own.star === 3 ? '已达首版最高星级' : '升星需碎片 ' + own.shard + ' / ' + tier.shard + ' · 突破石 ' + fmt(game.wallet.stone) + ' / ' + tier.stone}</p>
          <div class="section-bar" id="hero-gear" tabindex="-1"><h2>装备</h2><button class="text-button" data-action="equip">全队一键换装 ›</button></div>
          <div class="equipment-grid">${slots.map((slot, i) => {
            const grade = grades[own.gear[i]];
            const fee = forgeCost(own, i);
            return '<div class="gear"><span style="--grade:' + grade.color + '">' + slot.symbol + '</span><div><b>' + slot.name + ' +' + own.forge[i] +
              '</b><small>' + grade.name + '</small></div><button data-action="forge" data-id="' + i + '" title="' + fee.gold + ' 金币 / ' + fee.iron + ' 星砂" aria-label="强化' + slot.name + '，' + fee.gold + '金币及' + fee.iron + '星砂"' +
              (own.forge[i] >= grade.max || game.wallet.gold < fee.gold || game.wallet.iron < fee.iron ? ' disabled' : '') + '>+</button></div>';
          }).join('')}</div>
          <p class="cost-line">锻造星砂 ${fmt(game.wallet.iron)} · 更换装备保留强化</p>
          ${portraitLayout.matches ? resonance : ''}
        </section>
      </div>
    </div>`;
}

function renderTavern() {
  const locked = game.cleared < 3;
  view.innerHTML = `
    <div class="secondary summon-screen">
      ${portraitLayout.matches ? headingBack('召唤', sideReturn) : pageHeading('初心者契约', '召唤', '为第一支小队召集七曜英雄。')}
      <section class="tavern-banner" style="--scene:url(${art['gothic-sanctuary']});--portrait-scene:url(${art['gothic-sanctuary']})">
        ${portrait('jeanne', 'tavern-art')}
        <div class="tavern-text">
          <p class="eyebrow">圣盾女武神</p><h2>贞德</h2><p>前 10 抽必得贞德。第 30 抽可在菲奥娜、伊莉丝、希尔薇中自选一位。</p>
          <div class="draw-count"><span>初心者契约</span><b>${game.draws} / 30</b>${portraitLayout.matches ? '<span class="summon-balance">' + interfaceIcon('ticket', 'currency') + fmt(game.wallet.ticket) + '</span>' : ''}</div>
          <div class="chapter-track"><i style="width:${game.draws / 30 * 100}%"></i></div>
          <div class="summon-cards" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
          <div class="training">
            ${game.pickPending ? '<button class="button primary" data-action="choose-list">自选英雄</button>' :
              [1, 10].map(amount => '<button class="button ' + (amount === 10 ? 'primary' : 'outline') +
                '" data-action="draw" data-id="' + amount + '"' +
                (locked || game.draws + amount > 30 || game.wallet.ticket < drawCost(game, amount) ? ' disabled' : '') +
                '>' + (amount === 10 ? '十连招募' : '单次招募') + ' <small>♢ ' + drawCost(game, amount) + '</small></button>').join('')}
          </div>
          <p class="tavern-note">${locked ? '通关 1-3 解锁，并领取 8 张契约券。' : game.draws === 30 && !game.pickPending ? '初心者契约已完成。' : '每抽获得 10 星尘与 1 心愿结晶。'}</p>
        </div>
      </section>
      <details class="pool-rules paper"><summary>查看卡池概率与规则</summary>
        <p>普通抽取 SSR 4.5% · SR 45.5% · R 50%。重复英雄转为同名碎片。SR 和 R 产出碎片，未契约英雄的材料转为突破石。</p>
        <p>首次直接十连消耗 8 张契约券。第 10 抽补齐贞德保底，第 30 抽获得自选机会，已拥有的自选英雄转为 60 枚碎片。</p>
      </details>
    </div>`;
}

function rewardList(loot, showEmpty = false) {
  const rewards = Object.entries(currencies).filter(([key]) => loot[key] > 0 || (showEmpty && Object.hasOwn(loot, key))).map(([key, label]) =>
    `<div>${interfaceIcon(key, 'currency')}<small>${label}</small><b>${fmt(loot[key])}</b></div>`);
  if (loot.equipment?.length) {
    rewards.push(`<div>${interfaceIcon('equipment', 'currency')}<small>装备</small><b>× ${loot.equipment.length}</b></div>`);
  }
  return '<div class="reward-list">' + rewards.join('') + '</div>';
}

function renderVault() {
  const now = Date.now();
  const loot = estimateIdle(game, now);
  const minutes = Math.floor(loot.minutes);
  const quick = game.idle.quickDay !== dayKey(now);
  view.innerHTML = `
    <div class="secondary vault-screen">
      ${portraitLayout.matches ? headingBack('圣匣', sideReturn) : pageHeading('挂机收益', '圣匣', '')}
      <section class="vault-banner paper" style="--vault-scene:url(${art[portraitLayout.matches ? 'reference-vault' : 'night-vault']})">
        ${portraitLayout.matches ? `<div class="vault-wallet resources" aria-label="当前资源">${walletChips(['gold', 'xp', 'ticket'])}</div>` : ''}
        <div class="vault-emblem" aria-hidden="true"></div>
        <div class="vault-content"><h2>圣匣产出</h2>
          <p>已累积 <strong id="idle-time">${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟</strong> / 最多 12 小时</p>
          <div class="chapter-track"><i id="idle-progress" style="width:${loot.minutes / 720 * 100}%"></i></div>
          <div id="idle-rewards">${rewardList({ gold: loot.gold, xp: loot.xp, stone: loot.stone, equipment: loot.equipment }, portraitLayout.matches)}</div>
          <div class="training">
            <button class="button primary" data-action="claim" ${minutes < 1 ? 'disabled' : ''}>领取圣匣</button>
            <button class="button outline dark" data-action="quick" ${!quick ? 'disabled' : ''}>${quick ? '快速挂机 · 免费' : '今日免费次数已用'}</button>
          </div>
          <p class="cost-line">快速挂机一次结算 2 小时收益。当前每分钟 +${fmt(idleRates(game.cleared).gold)} 金币。</p>
        </div>
      </section>
    </div>`;
}

function modalHead(title, text) {
  return '<header class="modal-heading"><h2 id="dialog-title">' + title + '</h2>' + (text ? '<p>' + text + '</p>' : '') + '</header>';
}

function showModal(inner, mandatory = false, kind = '') {
  mandatoryModal = mandatory;
  dialog.dataset.kind = kind;
  modal.innerHTML = '<div class="modal-surface">' +
    (mandatory ? '' : '<button class="modal-close control" data-action="close" aria-label="关闭">×</button>') + inner + '</div>';
  if (!dialog.open) dialog.showModal();
}
dialog.addEventListener('cancel', event => { if (mandatoryModal) event.preventDefault(); });
dialog.addEventListener('close', () => { mandatoryModal = false; });

function openGallery(id) {
  const choices = Object.entries(heroes).map(([key, { name }]) => `
    <button class="gallery-choice" data-action="gallery-select" data-id="${key}" aria-pressed="${key === id}"
      aria-label="${name}" title="${name}"><img src="${heroFace(key)}" alt="" draggable="false"></button>`).join('');
  showModal(modalHead(heroes[id].name, heroes[id].title) +
    '<div class="gallery-art">' + illustration(id) + '</div>' +
    '<div class="gallery-choices" role="group" aria-label="选择角色插画">' + choices + '</div>', false, 'gallery');
}

function selectIllustration(choice) {
  if (choice.getAttribute('aria-pressed') === 'true') return;
  const id = choice.dataset.id;
  modal.querySelector('.gallery-art').innerHTML = illustration(id);
  modal.querySelector('#dialog-title').textContent = heroes[id].name;
  modal.querySelector('.modal-heading p').textContent = heroes[id].title;
  modal.querySelector('.gallery-choice[aria-pressed=true]').setAttribute('aria-pressed', 'false');
  choice.setAttribute('aria-pressed', 'true');
}

dialog.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (dialog.dataset.kind !== 'gallery' || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const choices = [...modal.querySelectorAll('.gallery-choice')];
  const current = choices.findIndex(choice => choice.getAttribute('aria-pressed') === 'true');
  const step = event.key === 'ArrowRight' ? 1 : -1;
  const next = choices[(current + step + choices.length) % choices.length];
  selectIllustration(next);
  next.focus();
});

function openFormation(selected = -1) {
  formationSelection = selected;
  formationReturn = page === 'heroes' ? 'heroes' : 'adventure';
  location.hash = 'formation';
}

function renderFormation(focusSlot = -1) {
  const tutorial = game.cleared === 0;
  const team = tutorial ? openingTeam : game.team;
  const scene = sceneImage(stages[stageSelected - 1].scene, portraitLayout.matches);
  view.innerHTML = `
    <section class="formation-screen scene-screen" style="--scene:url(${scene})">
      ${headingBack('布阵', formationReturn)}
      <div class="formation">${[[3, 4, 5, 6], [0, 1, 2]].map((row, i) => `
        <section class="formation-rank"><h2>${i ? '前排' : '后排'}</h2>
        <div class="formation-row">${row.map(index => {
          const id = team[index];
          const name = id ? heroes[id].name : '空位';
          return `<button class="formation-slot" data-action="swap" data-id="${index}" aria-label="${i ? '前排' : '后排'} ${index + 1}，${name}" aria-pressed="${formationSelection === index}" ${tutorial ? 'disabled' : ''}>
            ${id ? `<img class="formation-sprite" src="${art['gothic-unit-' + id]}" alt="" draggable="false">` : '<span class="formation-empty">+</span>'}
            <span class="formation-name">${name}</span></button>`;
        }).join('')}</div></section>`).join('')}</div>
      <footer class="scene-actions"><span>${tutorial ? '首战使用临时小队，通关后解锁换位。' : formationSelection === -1 ? '点选两个站位即可交换。' : '再点一个站位交换。'}</span>
        <a class="button primary" href="#${formationReturn}">确认</a>
      </footer>
    </section>`;
  if (focusSlot !== -1) view.querySelector('[data-id="' + focusSlot + '"]')?.focus({ preventScroll: true });
}

function pickDialog() {
  showModal(modalHead('选择契约英雄', '从三名后排英雄中选择一位。') + '<div class="select-cards">' +
    selector.map(id => '<button class="hero-thumb" data-action="choose" data-id="' + id + '" style="' + artStyle(id) + '"><span>' + heroes[id].name +
      '</span><small>' + (game.roster[id] ? '60 枚碎片' : heroes[id].role) + '</small></button>').join('') + '</div>');
}

function drawDialog(cards) {
  const grid = cards.map(card => card.quality === 'pick'
    ? '<div class="pull-card pick"><b>✦</b><p>SSR 自选</p></div>'
    : '<div class="pull-card ' + card.quality.toLowerCase() + '"><img src="' + heroFace(card.id) + '" alt=""><b>' + card.quality + '</b><p>' +
      heroes[card.id].name + '<small>' + (card.shard ? '碎片 ×' + card.shard : card.stone ? '突破石 ×' + card.stone : '新契约') + '</small></p></div>').join('');
  showModal(modalHead('招募结果', '') + '<div class="draw-results">' + grid + '</div><div class="modal-actions">' +
    (game.pickPending ? '<button class="button primary" data-action="choose-list">现在自选</button>' :
      '<button class="button primary" data-action="close">收下</button>') + '</div>');
}

async function finishBattle(result) {
  const ended = fight;
  if (!ended) return;
  cancelAnimationFrame(frame);
  const stageId = ended.stageId;
  fight = null;
  const reward = result === 'win' ? await update(next => recordVictory(next, stageId)) : null;
  if (reward && stageId < 10) stageSelected = stageId + 1;
  render();
  if (result === 'retreat') {
    notice('已撤回小队');
    return;
  }
  if (result === 'lose') {
    showModal(modalHead('小队已撤回', stageId === 10 ? hints[9] : '调整站位、提升英雄或为小队换装后再挑战。') +
      '<div class="modal-actions"><a class="button outline dark" href="#heroes" data-action="close">培养英雄</a><button class="button primary" data-action="retry">立即重试</button></div>');
    return;
  }
  if (reward && stageId === 10) {
    showModal(modalHead('永夜已净化', '月蚀之剑坠落，赫尔薇尔在钟声中睁开双眼。') +
      '<div class="purification">' + illustration('hel') + '<p>“我记得这座圣堂。也记得……我们曾为谁而战。”</p></div>' +
      rewardList(reward) + '<p class="chapter-reward">赫尔薇尔碎片 ×30 · 星辉魔女武器 ×1</p>' +
      '<div class="modal-actions"><button class="button primary" data-action="purify">完成第一章</button></div>', true);
    return;
  }
  const stage = stages[stageId - 1];
  const extra = stageId === 3 && reward ? '星辉酒馆已开启，可进行首次十连。' :
    stageId === 4 && reward ? '圣堂共鸣已开启。秘银套装已入库，为全队换上新装备。' :
    reward && stage.grantHero ? heroes[stage.grantHero].name + '加入了小队。' : '';
  showModal(modalHead('战斗胜利', reward ? '已通关 1-' + stageId + ' · ' + stage.name : '已通关的关卡可以重复挑战。') +
    (reward ? rewardList(reward) : '') + (extra ? '<p class="chapter-reward">' + extra + '</p>' : '') +
    '<div class="modal-actions">' +
    (reward && stageId === 3 ? '<a href="#tavern" data-action="close" class="button primary">前往酒馆</a>' :
      reward && stageId === 4 ? '<a href="#heroes" data-action="close" class="button primary">前往换装</a>' :
      '<button class="button primary" data-action="close">返回冒险</button>') + '</div>');
}

function beginBattle() {
  if (fight || stageSelected > game.cleared + 1) return;
  dialog.close();
  fight = createBattle(game, stageSelected);
  pendingMoves = [];
  previousFrame = performance.now();
  backlog = 0;
  renderAdventure();
  frame = requestAnimationFrame(animate);
}

function queueUltimate(index) {
  const unit = fight?.allies.find(entry => entry.slot === index);
  if (!fight || !isReady(fight, unit) || pendingMoves.includes(unit.id)) return;
  pendingMoves.push(unit.id);
}

function animate(now) {
  if (!fight) return;
  backlog += Math.min(now - previousFrame, 100) * game.settings.speed;
  previousFrame = now;
  while (backlog >= tickMs && !fight.result) {
    while (pendingMoves.length && !isReady(fight, fight.allies.find(unit => unit.id === pendingMoves[0]))) pendingMoves.shift();
    if (pendingMoves.length && castUltimate(fight, pendingMoves[0])) pendingMoves.shift();
    tick(fight);
    backlog -= tickMs;
  }
  drawFrame();
  if (fight.result) {
    finishBattle(fight.result);
    return;
  }
  frame = requestAnimationFrame(animate);
}

function drawFrame() {
  for (const unit of [...fight.allies, ...fight.enemies]) {
    const element = document.getElementById('unit-' + unit.id);
    if (!element) continue;
    element.classList.toggle('down', unit.hp === 0);
    element.classList.toggle('guarded', unit.side === 'ally' && fight.protection > fight.time);
    element.classList.toggle('charging', Boolean(unit.boss && fight.windup));
    element.querySelector('.unit-hp i').style.width = (unit.hp / unit.maxHp * 100) + '%';
    if (unit.boss) {
      const percent = Math.ceil(unit.hp / unit.maxHp * 100);
      const meter = view.querySelector('.boss-meter');
      meter.setAttribute('aria-valuenow', percent);
      meter.firstElementChild.style.width = percent + '%';
      view.querySelector('#boss-percent').textContent = percent + '%';
    }
    if (unit.side !== 'ally') continue;
    const card = document.getElementById('dock-' + unit.slot);
    const ready = isReady(fight, unit);
    if (card.classList.contains('ready') !== ready) {
      card.classList.toggle('ready', ready);
      card.setAttribute('aria-label', unit.name + '，' + elements[unit.element].name + '元素，快捷键 ' + (unit.slot + 1) + (ready ? '，奥义已就绪' : ''));
    }
    card.classList.toggle('down', unit.hp === 0);
    card.querySelector('.life i').style.width = (unit.hp / unit.maxHp * 100) + '%';
    card.querySelector('.energy i').style.width = unit.energy + '%';
  }
  const clock = document.querySelector('#arena-caption');
  clock.textContent = '交战中 · ' + Math.floor(fight.time / 1000) + ' 秒';
  const indicator = document.querySelector('#windup');
  if (fight.windup && indicator.hidden) {
    indicator.innerHTML = '<b>永夜裁决蓄力</b><span>在落击前施放贞德的护盾</span><i aria-hidden="true"></i>';
    indicator.hidden = false;
  } else if (!fight.windup) indicator.hidden = true;
  if (fight.windup) indicator.querySelector('i').style.width = Math.max(0, (fight.windup.ends - fight.time) / (fight.windup.ends - fight.windup.starts) * 100) + '%';
  const events = fight.events.splice(0);
  for (const event of events) effect(event);
}

function effect(event) {
  const arena = document.querySelector('#arena');
  if (event.type === 'ult') {
    const cutin = document.querySelector('#cutin');
    if (media.matches) return;
    clearTimeout(cutinTimer);
    cutin.innerHTML = '<div style="background-image:url(' + heroFace(event.source) + ')"></div><b>' + elementMark(heroes[event.source].element) + ' ' + event.name + '</b>';
    cutin.hidden = false;
    cutinTimer = setTimeout(() => { cutin.hidden = true; }, 475);
    return;
  }
  if (event.type === 'boss') {
    const impact = arena.querySelector('.restored-impact');
    if (impact) {
      impact.textContent = event.shielded ? '贞德护盾 · 重击伤害降低' : '永夜裁决 · 重击落下';
      impact.dataset.shielded = event.shielded;
      impact.hidden = false;
      setTimeout(() => { impact.hidden = true; }, 1300);
    }
    if (!media.matches) {
      arena.classList.remove('boss-strike');
      requestAnimationFrame(() => {
        arena.classList.add('boss-strike');
        setTimeout(() => arena.classList.remove('boss-strike'), 450);
      });
    }
    return;
  }
  if (event.type !== 'hit' && event.type !== 'heal') return;
  const target = document.getElementById('unit-' + event.target);
  if (!target || media.matches) return;
  const source = document.getElementById('unit-' + event.source);
  if (source && event.type === 'hit') {
    const direction = source.classList.contains('ally') ? 1 : -1;
    source.querySelector('.unit-body').animate([
      { transform: 'translateX(0)' },
      { transform: 'translateX(' + direction * 13 + 'px) rotate(' + direction * 4 + 'deg)', offset: .38 },
      { transform: 'translateX(0)' }
    ], { duration: 220, easing: 'ease-out' });
  }
  if (!event.damage && !event.shielded) return;
  if (event.type === 'hit') {
    const light = arena.classList.contains('restored-arena') ? 1.32 : 1.8;
    target.querySelector('img').animate([{ filter: 'brightness(' + light + ')' }, { filter: 'brightness(1)' }], 160);
  }
  const damage = document.createElement('span');
  damage.className = 'floating-number' + (event.crit ? ' critical' : '') + (event.type === 'heal' || event.shielded ? ' positive' : '');
  damage.textContent = (event.type === 'heal' ? '+' : event.shielded ? '⛨ ' : '−') + event.damage + (event.advantaged ? ' 克制' : '');
  damage.style.left = target.style.getPropertyValue('--x');
  damage.style.top = target.style.getPropertyValue('--y');
  arena.querySelector('#battle-fx').append(damage);
  damage.addEventListener('animationend', () => damage.remove(), { once: true });
  setTimeout(() => damage.remove(), 700);
}

document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || dialog.open || !fight || !/^[1-7]$/.test(event.key)) return;
  event.preventDefault();
  queueUltimate(Number(event.key) - 1);
});

async function gameAction(action, id, button) {
  switch (action) {
    case 'close': dialog.close(); return;
    case 'fight':
    case 'retry': beginBattle(); return;
    case 'retreat': await finishBattle('retreat'); return;
    case 'stage':
      stageSelected = Number(id);
      renderChapter();
      view.querySelector('[aria-current="step"]')?.focus({ preventScroll: true });
      return;
    case 'dock':
      if (fight) queueUltimate(Number(id));
      else openFormation(game.cleared === 0 ? -1 : Number(id));
      return;
    case 'formation': openFormation(); return;
    case 'swap': {
      const slot = Number(id);
      const previous = formationSelection;
      formationSelection = previous === -1 ? slot : -1;
      if (previous !== -1 && previous !== slot) await update(next => swapSlots(next, previous, slot));
      renderFormation(slot);
      return;
    }
    case 'auto':
    case 'speed': {
      await update(next => {
        if (action === 'auto') next.settings.auto = !next.settings.auto;
        else next.settings.speed = Number(id);
        return true;
      });
      if (action === 'auto' && fight) changeAuto(fight, game.settings.auto);
      if (action === 'auto') {
        button.classList.toggle('enabled', game.settings.auto);
        button.setAttribute('aria-pressed', game.settings.auto);
      } else {
        view.querySelectorAll('[data-action="speed"]').forEach(control =>
          control.setAttribute('aria-pressed', Number(control.dataset.id) === game.settings.speed));
      }
      return;
    }
    case 'hero': chosen = id; renderHeroes(); return;
    case 'hero-detail': {
      const detail = view.querySelector('#' + id);
      if (detail) {
        if (detail.tagName === 'DETAILS') detail.open = true;
        (detail.querySelector('summary') || detail).focus({ preventScroll: true });
        detail.scrollIntoView({ block: 'start' });
      }
      return;
    }
    case 'gallery': openGallery(chosen); return;
    case 'gallery-select': selectIllustration(button); return;
    case 'level':
    case 'level-batch':
      if (await update(next => levelUp(next, chosen, action === 'level' ? 1 : 5))) notice('英雄已升级');
      renderHeroes();
      return;
    case 'ascend':
      if (await update(next => ascend(next, chosen))) notice('英雄已升星');
      renderHeroes();
      return;
    case 'resonance':
      await update(next => switchResonance(next, chosen));
      renderHeroes();
      return;
    case 'forge':
      if (await update(next => forge(next, chosen, Number(id)))) notice('装备部位已强化');
      renderHeroes();
      return;
    case 'equip': {
      const changed = await update(autoEquip);
      notice(changed ? '已换上 ' + changed + ' 件装备' : '暂无可替换的更高品质装备');
      renderHeroes();
      return;
    }
    case 'draw': {
      const cards = await update(next => draw(next, Number(id)));
      renderTavern();
      if (cards) drawDialog(cards);
      return;
    }
    case 'choose-list': pickDialog(); return;
    case 'choose': {
      const picked = await update(next => chooseHero(next, id));
      if (picked) {
        dialog.close();
        renderTavern();
        notice(heroes[id].name + (picked.shard ? ' · 碎片 ×' + picked.shard : '加入了小队'));
      }
      return;
    }
    case 'claim':
    case 'quick': {
      const loot = await update(next => claimIdle(next, Date.now(), action === 'quick'));
      renderVault();
      if (loot) showModal(modalHead(action === 'quick' ? '快速挂机完成' : '已领取圣匣', '') + rewardList(loot) +
        '<div class="modal-actions"><button class="button primary" data-action="close">收下</button></div>');
      return;
    }
    case 'purify':
      await update(next => { next.purified = true; return true; });
      dialog.close();
      return;
  }
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  if (button.tagName !== 'A') event.preventDefault();
  if (busy) return;
  busy = true;
  try { await gameAction(button.dataset.action, button.dataset.id, button); }
  finally { busy = false; }
});

setInterval(() => {
  if (page !== 'vault' || dialog.open || busy) return;
  const loot = estimateIdle(game, Date.now());
  const minutes = Math.floor(loot.minutes);
  const value = Math.floor(minutes / 60) + ' 小时 ' + minutes % 60 + ' 分钟';
  if (document.querySelector('#idle-time').textContent !== value) renderVault();
}, 1000);

render();
if (!storageOkay) notice('浏览器无法保存进度，本局暂存在当前标签页');
if (game.cleared === 10 && !game.purified) {
  showModal(modalHead('永夜已净化', '赫尔薇尔沉睡在月蚀祭坛。30 枚首领碎片已入库。') +
    '<div class="purification">' + illustration('hel') + '</div><div class="modal-actions"><button class="button primary" data-action="purify">完成第一章</button></div>', true);
}
