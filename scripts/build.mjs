import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = name => readFile(join(root, name), 'utf8');
const target = join(root, 'dist', 'index.html');
const assetDir = join(root, 'assets');
async function imageData(name) {
  const bytes = await readFile(join(assetDir, name + '.webp'));
  return 'data:image/webp;base64,' + bytes.toString('base64');
}

const characters = ['jeanne', 'freya', 'camilla', 'fiona', 'iris', 'sylvie', 'vera', 'hel'];
const emblems = ['sanctum', 'sword', 'compass', 'grid', 'hero', 'summon', 'chest', 'crest',
  'gold', 'xp', 'stone', 'ticket', 'dust', 'crystal', 'iron', 'equipment'];
const restoredBattleParts = ['wordmark', 'heading', 'plaque', 'challenge',
  'hp-gem', 'hp-frame', 'hp-track', 'hp-fill', 'hp-number', 'auto', 'speed-1', 'speed-2', 'speed-3', 'control-line',
  ...['sanctum', 'adventure', 'chapter', 'formation', 'heroes', 'tavern', 'vault'].map(page => 'nav-' + page)];
const portraitBattleParts = ['heading', 'title', 'hp-gem', 'hp-frame', 'hp-number', 'auto', 'corner-left', 'corner-right',
  'speed-idle', 'speed-idle-metal', 'speed-gold', 'speed-gold-metal', 'action', 'action-silver',
  'tray-edge', 'tray-top', 'tray-bottom'];
const artwork = ['cloister', 'gothic-arena', 'gothic-altar', 'gothic-portrait-altar',
  'night-map', 'gothic-sanctuary', 'night-vault', 'reference-vault',
  ...restoredBattleParts.map(part => 'boss-ui-' + part),
  ...portraitBattleParts.map(part => 'boss-mobile-' + part),
  ...emblems.map(name => 'emblem-' + name),
  ...['jeanne', 'freya'].flatMap(id => ['portrait', 'medium'].map(kind => 'gothic-' + kind + '-' + id)),
  ...characters.flatMap(id => ['face', 'unit', 'card'].map(kind => 'gothic-' + kind + '-' + id)),
  ...characters.flatMap(id => ['scene', 'figure'].map(layer => 'gallery-' + layer + '-' + id))];
const assets = {};
for (const name of artwork) {
  assets[name] = await imageData(name);
}

const interfaceParts = ['card', 'plaque', 'heading', 'button', 'rule', 'control', 'square', 'short', 'short-gold',
  'border', 'mobile-title', 'tool-rail', 'round', 'cardback'];
const interfaceImages = await Promise.all(interfaceParts.map(async part =>
  '--ui-' + part + ':url("' + await imageData('contract-' + part) + '");'));
const bossFont = (await readFile(join(assetDir, 'boss-ui-serif.woff2'))).toString('base64');
const css = [':root {' + interfaceImages.join('') + '}',
  '@font-face{font-family:"Boss Serif";font-weight:200 900;font-display:swap;src:url(data:font/woff2;base64,' + bossFont + ') format("woff2")}',
  ...await Promise.all(['src/styles.css', 'src/interface.css', 'src/portrait.css', 'src/boss.css', 'src/boss-portrait.css'].map(read))].join('\n');
const code = await Promise.all(['content', 'progress', 'battle', 'app'].map(name => read('src/' + name + '.mjs')));
const script = code.map(part => part.replace(/^import [^\n]+\n/gm, '').replace(/^export /gm, '')).join('\n');
const template = await read('src/index.html');
const html = template.replace('/* GAME_STYLES */', () => css)
  .replace('/* GAME_SCRIPT */', () => 'const art = ' + JSON.stringify(assets) + ';\n' + script);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, html);
console.log('dist/index.html · ' + Math.round(Buffer.byteLength(html) / 1024) + ' KiB');
