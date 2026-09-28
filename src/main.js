import * as THREE from '../vendor/three.module.js';
import { buildWorld } from './world.js';
import { Physics, clamp, dampF } from './physics.js';
import { FX } from './fx.js';
import { AudioSys } from './audio.js';
import { Weapons } from './weapons.js';
import { Enemy, Player, makeOperatorMesh } from './entities.js';
import { Net } from './net.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 500);

const world = buildWorld(scene);
if (scene.fog) world.baseFog = scene.fog;
const phys = new Physics(world.colliders);
const fx = new FX(scene);
const audio = new AudioSys();
const player = new Player(world.spawns[0].clone().add(new THREE.Vector3(3, 0, 3)));
const weapons = new Weapons(camera, fx, audio);
const net = new Net(scene);

audio.alertCry = (pos, camPos, camDir, camRight) => {
  if (!audio.ctx) return;
  const ctx = audio.ctx;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(300, ctx.currentTime);
  o.frequency.linearRampToValueAtTime(180, ctx.currentTime + 0.25);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.08, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
  o.connect(g); g.connect(audio.master);
  o.start(); o.stop(ctx.currentTime + 0.35);
};

const state = {
  running: false,
  over: false,
  paused: false,
  time: 0,
  wave: 0,
  kills: 0,
  score: 0,
  enemies: [],
  spawnQueue: 0,
  spawnTimer: 0,
  waveBreak: 5,
  betweenWaves: true,
  hitmarkerT: 0,
  damageFlashT: 0,
  heartbeatT: 0,
  grenadeThrowT: 0,
  adsBaseFov: 72,
  mouseSens: 1.0,
  playerClass: 0,
  shield: 0,
  shieldMax: 0,
  loadoutOpen: false,
};

const OPERATORS = [
  {  name: 'BOPE', desc: 'TROCA DE FOGO URBANA · COLETE PESADO', kind: 'police',
    shield: 50, hpBonus: 15, kickMul: 1.0, speedMul: 0.97, card: 'Colete pesado · +50 de escudo · linha de frente' },
  { name: 'FACÇÃO', desc: 'MOVIMENTAÇÃO SILENCIOSA · PASSO LEVE', kind: 'thug',
    shield: 25, hpBonus: 0, kickMul: 0.85, speedMul: 1.1, card: 'Ágil e silencioso · hostis demoram a notar você' },
  { name: 'FORÇA DELTA', desc: 'OPERAÇÃO NOTURNA · PRECISÃO', kind: 'delta',
    shield: 35, hpBonus: 0, kickMul: 0.72, speedMul: 1.0, card: 'Recuo reduzido · mira firme · noturna' },
];

const keys = {};
let mouseDown = false, mouse2Down = false;
let pointerLocked = false;

const DEG2RAD = Math.PI / 180;
const MOUSE_YAW_PER_COUNT = 0.022 * DEG2RAD;
const MOUSE_PITCH_PER_COUNT = 0.022 * DEG2RAD;
const ZOOM_SENS_RATIO = 0.818933;
const SENS_MIN = 0.05, SENS_MAX = 10;

function zoomSensFactor() {
  const d = weapons.def;
  if (!d.adsFov || weapons.adsK <= 0.001) return 1;
  const target = ZOOM_SENS_RATIO * (d.adsFov / state.adsBaseFov);
  return 1 + (target - 1) * weapons.adsK;
}

function applyLookDelta(dx, dy) {
  const f = state.mouseSens * zoomSensFactor();
  player.yaw -= dx * MOUSE_YAW_PER_COUNT * f;
  player.pitch -= dy * MOUSE_PITCH_PER_COUNT * f;
  player.pitch = clamp(player.pitch, -1.45, 1.45);
}

function adjustSens(delta) {
  state.mouseSens = clamp(Math.round((state.mouseSens + delta) * 100) / 100, SENS_MIN, SENS_MAX);
}

let chatOpen = false;
let touchMode = false;
let touchFiring = false;
function armTouchActivation() {
  const tapTargets = Array.from(document.querySelectorAll('#overlay .btn, #quality button, .op-card'));
  tapTargets.forEach(el => {
    if (el.__tapArmed) return;
    el.__tapArmed = true;
    el.addEventListener('touchstart', e => { e.preventDefault(); el.__tapOk = true; }, { passive: false });
    el.addEventListener('touchmove', e => {
      if (!el.__tapOk) return;
      const t = e.changedTouches[0];
      const r = el.getBoundingClientRect();
      const pad = 14;
      if (t.clientX < r.left - pad || t.clientX > r.right + pad || t.clientY < r.top - pad || t.clientY > r.bottom + pad) el.__tapOk = false;
    }, { passive: true });
    el.addEventListener('touchend', e => {
      if (!el.__tapOk) return;
      el.__tapOk = false;
      e.preventDefault();
      el.click();
    }, { passive: false });
  });
}
function openChat() {
  chatOpen = true;
  const inp = document.getElementById('chat-input');
  if (!inp) return;
  inp.classList.remove('hidden');
  inp.value = '';
  setTimeout(() => inp.focus(), 0);
}
function closeChat(send) {
  const inp = document.getElementById('chat-input');
  const msg = send && inp ? inp.value.trim() : '';
  chatOpen = false;
  if (inp) { inp.classList.add('hidden'); inp.blur(); }
  if (msg) net.sendChat(msg);
}

addEventListener('keydown', e => {
  if (chatOpen) {
    e.preventDefault();
    if (e.code === 'Enter') closeChat(true);
    else if (e.code === 'Escape') closeChat(false);
    return;
  }
  if (['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','KeyR','KeyG','KeyC'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (window.__uiSetKeyVisual) window.__uiSetKeyVisual(e.code, true);
  if (e.code === 'KeyR') weapons.startReload();
  if (e.code === 'Digit1') weapons.switchTo(0);
  if (e.code === 'Digit2') weapons.switchTo(1);
  if (e.code === 'Digit3') weapons.switchTo(2);
  if (e.code === 'Digit4') weapons.switchTo(4);
  if (e.code === 'Digit5') weapons.switchTo(5);
  if (e.code === 'Digit6' || e.code === 'KeyG') tryThrowGrenade();
  if (e.code === 'KeyQ' && state.running && !state.over) toggleLoadout();
  if (e.code === 'KeyT' && state.running && !state.over && !chatOpen) openChat();
  if (e.code === 'KeyE' && state.running && !state.over && !chatOpen) { vehicle ? exitVehicle() : enterVehicle(); }
  if (e.code === 'KeyV') toggleThirdPerson();
  if (e.code === 'KeyX') trySuppressorToggle();
  if (e.code === 'BracketLeft' && !e.repeat) adjustSens(-0.05);
  if (e.code === 'BracketRight' && !e.repeat) adjustSens(0.05);
  if (e.code === 'Tab') { e.preventDefault(); if (state.running && !state.over) toggleScoreboard(true); }
  if (e.code === 'Escape') {   }
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (window.__uiSetKeyVisual) window.__uiSetKeyVisual(e.code, false);
  if (e.code === 'Tab') toggleScoreboard(false);
});

const canvas = renderer.domElement;
canvas.addEventListener('mousedown', e => {
  if (touchMode) return;
  if (!pointerLocked) { canvas.requestPointerLock(); audio.init(); audio.resume(); return; }
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) mouse2Down = true;
  if (window.__uiSetKeyVisual) window.__uiSetKeyVisual('Mouse' + e.button, true);
});
addEventListener('mouseup', e => {
  if (e.button === 0) { mouseDown = false; firedThisPress = false; }
  if (e.button === 2) mouse2Down = false;
  if (window.__uiSetKeyVisual) window.__uiSetKeyVisual('Mouse' + e.button, false);
});
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (!pointerLocked || state.paused) return;
  applyLookDelta(e.movementX, e.movementY);
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (touchMode) return;
  if (!pointerLocked && state.running && !state.over && !chatOpen) {
    state.paused = true;
    showOverlay('pause');
  }
});

function lockPointer(tries = 4) {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch {}
  if (tries > 0) setTimeout(() => { if (document.pointerLockElement !== canvas) lockPointer(tries - 1); }, 350);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  weapons.vmCamera.aspect = innerWidth / innerHeight;
  weapons.vmCamera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const $ = id => document.getElementById(id);
const hud = {
  health: $('health'), healthBar: $('health-bar'),
  ammo: $('ammo'), weapon: $('weapon'),
  wave: $('wave'), enemies: $('enemies'), score: $('score'),
  killfeed: $('killfeed'), minimap: $('minimap'),
  crosshair: $('crosshair'), hitmarker: $('hitmarker'),
  grenadeCd: $('grenade-cd'), reloadHint: $('reload-hint'),
  lowhp: $('lowhp'), dmgflash: $('dmgflash'),
};
const mmCtx = hud.minimap.getContext('2d');

function showOverlay(kind) {
  $('overlay').classList.remove('hidden');
  $('screen-start').classList.toggle('hidden', kind !== 'start');
  $('screen-select').classList.toggle('hidden', kind !== 'select');
  $('screen-pause').classList.toggle('hidden', kind !== 'pause');
  $('screen-over').classList.toggle('hidden', kind !== 'over');
  const tui = document.getElementById('touch-ui');
  if (tui) tui.style.display = 'none';
  if (kind === 'over') showDeathScreen();
}

function showDeathScreen() {
  $('overlay').classList.remove('hidden');
  $('screen-start').classList.add('hidden');
  $('screen-select').classList.add('hidden');
  $('screen-pause').classList.add('hidden');
  $('screen-over').classList.remove('hidden');
  $('final-score').textContent = state.score;
  $('final-wave').textContent = state.wave;
  $('final-kills').textContent = state.kills;
  $('dc-cause').textContent = state.deathCause || 'FOGO HOSTIL';
  initDeathcardTilt();
}

let deathTiltBound = false;
function initDeathcardTilt() {
  if (deathTiltBound) return;
  deathTiltBound = true;
  const frame = document.querySelector('.dc-frame');
  addEventListener('mousemove', e => {
    if (document.getElementById('screen-over').classList.contains('hidden')) return;
    const nx = e.clientX / innerWidth - 0.5;
    const ny = e.clientY / innerHeight - 0.5;
    frame.style.transform = `rotateY(${nx * 10}deg) rotateX(${-ny * 7}deg)`;
  });
  addEventListener('keydown', e => {
    if (e.code === 'Enter' && !document.getElementById('screen-over').classList.contains('hidden')) {
      document.getElementById('btn-restart').click();
    }
  });
}
function hideOverlay() {
  $('overlay').classList.add('hidden');
  const tui = document.getElementById('touch-ui');
  if (tui && touchMode) tui.style.display = '';
}

function killFeed(text, color) {
  const div = document.createElement('div');
  div.className = 'feed-item';
  div.innerHTML = text;
  if (color) div.style.color = color;
  hud.killfeed.prepend(div);
  setTimeout(() => div.remove(), 4500);
  while (hud.killfeed.children.length > 5) hud.killfeed.lastChild.remove();
}

function setChip(el, val) {
  const v = String(val);
  if (el.textContent === v) return;
  el.textContent = v;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function applyQuality(q) {
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const small = Math.min(innerWidth, innerHeight) < 820;
  let auto = 'alta';
  if (isTouch || small) auto = 'baixa';
  const level = (q || localStorage.getItem('urbana-quality') || auto);
  try { localStorage.setItem('urbana-quality', level); } catch {}
  if (level === 'baixa') {
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
    scene.fog = null;
  } else if (level === 'media') {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    if (world.baseFog) { scene.fog = world.baseFog; }
  } else {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (world.baseFog) { scene.fog = world.baseFog; }
  }
  if (world.sun) {
    world.sun.castShadow = renderer.shadowMap.enabled;
    if (world.sun.shadow.map && !renderer.shadowMap.enabled) {
      world.sun.shadow.map.dispose();
      world.sun.shadow.map = null;
    }
  }
  renderer.setSize(innerWidth, innerHeight);
  document.querySelectorAll('#quality button').forEach(b => b.classList.toggle('on', b.dataset.q === level));
}

function initQualityUi() {
  document.querySelectorAll('#quality button').forEach(b => {
    b.addEventListener('click', () => {
      audio.uiPress();
      applyQuality(b.dataset.q);
    });
  });
}

function loadRecord() {
  try { return JSON.parse(localStorage.getItem('urbana-record') || 'null'); } catch { return null; }
}

function saveRecordIfNeeded() {
  try {
    const r = loadRecord() || { score: 0, wave: 0, kills: 0 };
    if (state.score > (r.score || 0)) {
      r.score = state.score; r.wave = state.wave; r.kills = state.kills;
      localStorage.setItem('urbana-record', JSON.stringify(r));
    }
  } catch {}
}

function updHud() {
  const hp = Math.round(player.health);
  hud.health.textContent = hp;
  hud.healthBar.style.width = hp + '%';
  hud.healthBar.style.background = hp > 60 ? '#6fbf73' : hp > 30 ? '#d8b13c' : '#c0392b';
  const sb = document.getElementById('shield-bar');
  if (sb) {
    const pct = state.shieldMax > 0 ? (state.shield / state.shieldMax) * 100 : 0;
    sb.style.width = pct + '%';
    sb.classList.toggle('empty', state.shield <= 0);
  }
  const a = weapons.ammoHud();
  hud.ammo.textContent = a.mag + ' / ' + a.reserve;
  hud.weapon.textContent = a.name + (a.supp !== undefined ? (a.supp ? ' · SUPRESSOR' : ' · ABERTO') : '');
  const hostiles = state.enemies.filter(e => e.alive).length;
  setChip(hud.wave, state.wave);
  setChip(hud.enemies, hostiles);
  const hostChip = document.getElementById('chip-hostiles');
  if (hostChip) hostChip.classList.toggle('hot', hostiles > 0);
  if (state._scoreShown === undefined) state._scoreShown = state.score;
  if (state._scoreShown !== state.score) {
    const diff = state.score - state._scoreShown;
    state._scoreShown += Math.abs(diff) < 8 ? diff : diff * 0.16;
    if (Math.abs(state.score - state._scoreShown) < 1) state._scoreShown = state.score;
    hud.score.textContent = Math.round(state._scoreShown);
  }
  const lowAmmo = weapons.slot !== 3 && weapons.def.magSize > 0 && weapons.def.mag <= 5;
  hud.reloadHint.style.opacity = (lowAmmo || weapons.reloadT > 0) ? 1 : 0;
  hud.grenadeCd.textContent = weapons.grenadeCd > 0 ? weapons.grenadeCd.toFixed(1) : '';
}

function startWave() {
  state.wave++;
  state.betweenWaves = false;
  state.shield = state.shieldMax;
  state.spawnQueue = 3 + state.wave * 2;
  state.spawnTimer = 0;
  audio.waveStart(state.wave);
}
function spawnEnemy() {
  let cands = world.spawns.filter(s => s.distanceTo(player.pos) > 25);
  if (!cands.length) cands = world.spawns;
  const sp = cands[Math.floor(Math.random() * cands.length)];
  let pos = null;
  for (let i = 0; i < 12; i++) {
    const p = sp.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
    if (phys.posClear(p.x, p.z, 0.55)) { pos = p; break; }
  }
  if (!pos) pos = sp.clone();
  const e = new Enemy(scene, world, phys, pos);
  e.health = 100 + state.wave * 6;
  state.enemies.push(e);
}

function fireBullet() {
  const now = state.time;
  const res = weapons.fire(now);
  if (!res) return;

  if (res.type === 'grenade') {
    throwGrenade();
    return;
  }
  net.sendShot(camera.getWorldPosition(new THREE.Vector3()), getDir(), weapons.def.sfx);

  const d = weapons.def;
  if (d.sfx === 'pistol') {
    if (weapons.suppOn) audio.shotSuppressed(null, null, null, null);
    else audio.shotPistol(null, null, null, null);
  }
  else if (d.sfx === 'sniper') audio.shotSniper(null, null, null, null);
  else if (d.sfx === 'smg') audio.shotSmg(null, null, null, null);
  else if (d.sfx === 'shotgun') audio.shotShotgun(null, null, null, null);
  else audio.shotRifle(null, null, null, null);
  fx.muzzleFlash(camera.getWorldPosition(new THREE.Vector3()).add(getDir().multiplyScalar(0.4)), getDir());

  const origin = camera.getWorldPosition(new THREE.Vector3());
  const dir = getDir();
  const sp = weapons.spread();
  const pellets = d.pellets || 1;
  const shots = [];
  for (let p = 0; p < pellets; p++) {
    const sdir = dir.clone();
    if (sp > 0) {
      const rx = (Math.random() - 0.5) * 2 * sp;
      const ry = (Math.random() - 0.5) * 2 * sp;
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      sdir.addScaledVector(right, rx).addScaledVector(up, ry).normalize();
    }
    shots.push(sdir);
  }

  if (d.casing) {
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const fw = dir.clone();
    fx.casing(origin.clone().addScaledVector(dir, 0.5).addScaledVector(right, 0.12), right, fw);
  }

  for (const sdir of shots) fireBulletDir(origin, sdir, d);
}

function fireBulletDir(origin, dir, d) {
  const range = d.range;
  const hitWorld = phys.segmentHit(origin, origin.clone().addScaledVector(dir, range));

  let bestEnemy = null, bestT = hitWorld ? hitWorld.t * range : Infinity;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const ec = e.pos.clone(); ec.y += 0.9;
    const t = raySphere(origin, dir, ec, 0.42);
    const th = raySphere(origin, dir, e.pos.clone().setY(e.pos.y + 1.62), 0.24);
    let tt = t, isHead = false;
    if (th >= 0 && (t < 0 || th <= t)) { tt = th; isHead = true; }
    if (tt >= 0 && tt < bestT) {
      bestT = tt; bestEnemy = e; bestEnemy.isHead = isHead;
    }
  }

  const end = origin.clone().addScaledVector(dir, Math.min(bestT, range));
  if ((d.pellets || 1) <= 2) fx.tracer(origin.clone().addScaledVector(dir, 1.2).add(new THREE.Vector3(0, -0.05, 0)), end);

  if (bestEnemy) {
    const dmg = Math.round(d.dmg * (bestEnemy.isHead ? d.headMul : 1) * (bestT > 60 ? 0.7 : 1));
    const wasAlive = bestEnemy.alive;
    bestEnemy.takeDamage(dmg, dir, bestEnemy.isHead);
    if (wasAlive) net.sendKill(Math.min(45, dmg));
    fx.impact(end, dir.clone().negate(), 'flesh');
    state.hitmarkerT = 0.25;
    audio.hitmarker();
    if (bestEnemy.isHead) audio.headshot();
    if (wasAlive && !bestEnemy.alive) onKill(bestEnemy, bestEnemy.isHead);
  } else if (hitWorld) {
    fx.impact(hitWorld.point, hitWorld.normal, hitWorld.kind);
    if (Math.random() < 0.35) audio.ricochet(hitWorld.point, origin, dir, rightOf(dir));
  }
}

function rightOf(dir) {
  return new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
}
function getDir() {
  return new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
}

function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t;
}

function onKill(e, head) {
  state.kills++;
  const pts = head ? 150 : 100;
  state.score += pts;
  killBanner(head, pts);
  audio.kill();
}

let killBannerTimer = 0;
function killBanner(head, pts) {
  const b = document.getElementById('killbanner');
  if (!b) return;
  b.classList.remove('show', 'head');
  void b.offsetWidth;
  b.querySelector('.kb-title').textContent = head ? 'TIRO NA CABEÇA' : 'HOSTIL ELIMINADO';
  b.querySelector('.kb-sub').textContent = `+${pts} PONTOS${head ? ' · BÔNUS CRÍTICO' : ''}`;
  if (head) b.classList.add('head');
  b.classList.add('show');
  clearTimeout(killBannerTimer);
  killBannerTimer = setTimeout(() => b.classList.remove('show'), 1750);
}

let vehicle = null;
const vehState = { speed: 0, steer: 0, shake: 0, turbo: false, turboK: 0, turboPrev: false };

function nearestCar() {
  let best = null, bd = 3.4;
  for (const c of world.driveCars) {
    const d = c.position.distanceTo(player.pos);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function enterVehicle() {
  const c = nearestCar();
  if (!c || weapons.suppT > 0) return;
  vehicle = c;
  vehState.speed = 0; vehState.steer = 0;
  player.vel.set(0, 0, 0);
  driverSeat(c);
  audio.engineStart();
  updateSpeedo();
}

function exitVehicle() {
  if (!vehicle) return;
  audio.engineStop();
  audio.turboSet(false);
  if (vehicle.userData.flames) vehicle.userData.flames.visible = false;
  const carBox = phys.colliders.find(b => b.carGroup === vehicle) || null;
  const tryFree = (x, z) => {
    for (const b of phys.colliders) {
      if (b === carBox) continue;
      if (b.max.y <= 0.56) continue;
      if (x + 0.42 > b.min.x && x - 0.42 < b.max.x && z + 0.42 > b.min.z && z - 0.42 < b.max.z) return false;
    }
    return true;
  };
  const fx = -Math.sin(vehicle.rotation.y), fz = -Math.cos(vehicle.rotation.y);
  const side = new THREE.Vector3(fz, 0, -fx);
  const spots = [
    vehicle.position.clone().addScaledVector(side, 1.8),
    vehicle.position.clone().addScaledVector(side, 2.6),
    vehicle.position.clone().addScaledVector(side, -1.8),
    vehicle.position.clone().addScaledVector(side, -2.6),
    vehicle.position.clone().addScaledVector(new THREE.Vector3(fx, 0, fz), 3.2),
  ];
  const out = spots.find(p => tryFree(p.x, p.z));
  const drop = out || spots[4];
  player.pos.set(drop.x, 0, drop.z);
  player.vel.set(0, 0, 0);
  vehicle = null;
  vehState.speed = 0; vehState.steer = 0;
  if (playerAvatar) {
    playerAvatar.visible = thirdPerson;
    playerAvatar.position.copy(player.pos);
    const kids = playerAvatar.children;
    const armR = kids[kids.length - 3];
    const gunRoot = armR.children[armR.children.length - 1];
    if (gunRoot) gunRoot.visible = true;
    kids[kids.length - 2].rotation.x = 0; kids[kids.length - 1].rotation.x = 0;
  }
  updateSpeedo();
}

function driverSeat(c) {
  if (!playerAvatar) playerAvatar = makeOperatorMesh(playerAvatarKind);
  if (!playerAvatar.parent) scene.add(playerAvatar);
  playerAvatar.visible = true;
  const s = new THREE.Vector3();
  const seat = c.getObjectByName('driver-seat');
  if (seat) {
    const p = seat.position;
    s.set(c.position.x + p.z, p.y, c.position.z - p.x);
  } else {
    s.copy(c.position).setY(0.12);
  }
  playerAvatar.position.copy(s);
  playerAvatar.rotation.set(0, c.rotation.y, 0);
  const kids = playerAvatar.children;
  const legL = kids[kids.length - 2], legR = kids[kids.length - 1];
  legL.rotation.x = 1.25; legR.rotation.x = 1.25;
  const armL = kids[kids.length - 4], armR = kids[kids.length - 3];
  armL.rotation.x = 0.9; armR.rotation.x = 0.9;
  const gunRoot = armR.children[armR.children.length - 1];
  if (gunRoot) gunRoot.visible = false;
}

function syncDriverPose(dt) {
  if (!vehicle || !playerAvatar) return;
  const s = new THREE.Vector3();
  const seat = vehicle.getObjectByName('driver-seat');
  if (seat) {
    const p = seat.position;
    s.set(vehicle.position.x + p.z, p.y, vehicle.position.z - p.x);
  } else {
    s.copy(vehicle.position).setY(0.12);
  }
  playerAvatar.position.copy(s);
  playerAvatar.rotation.y = vehicle.rotation.y;
  playerAvatar.position.y += Math.sin(state.time * 18) * Math.min(0.012, Math.abs(vehState.speed) * 0.0012);
  const kids = playerAvatar.children;
  const armL = kids[kids.length - 4], armR = kids[kids.length - 3];
  armL.rotation.x = 0.9 - vehState.steer * 0.25;
  armR.rotation.x = 0.9 + vehState.steer * 0.25;
}

function updateVehicle(dt) {
  const c = vehicle;
  const fx = -Math.sin(c.rotation.y), fz = -Math.cos(c.rotation.y);
  const gas = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const turboOn = gas > 0 && (keys['ShiftLeft'] || keys['ShiftRight']);
  vehState.turbo = turboOn;
  vehState.turboK = dampF(vehState.turboK, turboOn ? 1 : 0, 7, dt);
  if (turboOn && !vehState.turboPrev) audio.turboIgnite();
  vehState.turboPrev = turboOn;
  vehState.speed += gas * (turboOn ? 26 : 14) * dt;
  vehState.speed *= 1 - (gas === 0 ? 1.1 : 0.35) * dt;
  const top = turboOn ? 30 : 21;
  if (vehState.speed > top) vehState.speed = Math.max(top, vehState.speed - 20 * dt);
  if (vehState.speed < -7) vehState.speed = -7;
  const steerIn = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
  vehState.steer = dampF(vehState.steer, steerIn * 0.55, 8, dt);
  if (Math.abs(vehState.speed) > 0.4) {
    c.rotation.y += vehState.steer * Math.abs(vehState.speed) * dt * 0.16 * (vehState.speed >= 0 ? 1 : -1);
  }
  const flames = c.userData.flames;
  if (flames) {
    flames.visible = turboOn;
    if (turboOn) {
      const k = 0.7 + Math.random() * 0.6;
      for (const ch of flames.children) ch.scale.set(1, k, 1);
    }
  }
  audio.turboSet(turboOn);
  const moveVec = new THREE.Vector3(fx, 0, fz).multiplyScalar(vehState.speed * dt);
  const carHalfX = 2.2, carHalfZ = 2.6;
  const hitsAt = (px, pz) => {
    for (const b of phys.colliders) {
      if (b.carGroup === c) continue;
      if (b.max.y <= 0.35) continue;
      if (px + carHalfX > b.min.x && px - carHalfX < b.max.x &&
          pz + carHalfZ > b.min.z && pz - carHalfZ < b.max.z) return true;
    }
    return false;
  };
  const estavaLivre = !hitsAt(c.position.x, c.position.z);
  const nx = c.position.x + moveVec.x, nz = c.position.z + moveVec.z;
  let moveu = false;
  if (!hitsAt(nx, nz)) { c.position.x = nx; c.position.z = nz; moveu = true; }
  else if (!hitsAt(nx, c.position.z)) { c.position.x = nx; moveu = true; }
  else if (!hitsAt(c.position.x, nz)) { c.position.z = nz; moveu = true; }
  if (!moveu && estavaLivre) { vehState.speed *= -0.25; audio.engineHit(); vehState.shake = Math.max(vehState.shake, 0.3); }
  for (const b of phys.colliders) {
    if (b.carGroup === c) {
      b.min.set(c.position.x - carHalfX, 0, c.position.z - carHalfZ);
      b.max.set(c.position.x + carHalfX, 2.0, c.position.z + carHalfZ);
    }
  }
  player.pos.copy(c.position);
  const st = c.getObjectByName('steering');
  if (st) st.rotation.z = vehState.steer * 3.2;
  player.yaw += (c.rotation.y - player.yaw) * Math.min(1, dt * 4);
  audio.engine(vehState.speed);
}

const spSpeedo = document.getElementById('speedo');
const spKmh = document.getElementById('sp-kmh');
const spFill = document.getElementById('sp-fill');
const spGear = document.getElementById('sp-gear');
function updateSpeedo() {
  const driving = !!vehicle;
  if (!spSpeedo) return;
  spSpeedo.classList.toggle('hidden', !driving);
  const br = document.getElementById('bottom-right');
  if (br) br.classList.toggle('driving', driving);
  if (!driving) return;
  const kmh = Math.round(Math.abs(vehState.speed) * 3.6);
  spKmh.textContent = kmh;
  spFill.style.width = Math.min(100, kmh / 80 * 100) + '%';
  const g = vehState.speed > 0.5 ? 'D' : vehState.speed < -0.5 ? 'R' : 'N';
  spGear.textContent = g;
  spSpeedo.classList.toggle('reversing', vehState.speed < -0.5);
  spSpeedo.classList.toggle('turbo', !!vehState.turbo);
}

function vehicleHitCheck() {
  if (!vehicle) return;
  const kmh = Math.abs(vehState.speed) * 3.6;
  if (kmh < 10) return;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    let box = null;
    for (const b of phys.colliders) { if (b.carGroup === vehicle) { box = b; break; } }
    if (!box) continue;
    const r = 0.45;
    const overlapX = e.pos.x + r > box.min.x && e.pos.x - r < box.max.x;
    const overlapZ = e.pos.z + r > box.min.z && e.pos.z - r < box.max.z;
    const overlapY = e.pos.y < box.max.y && e.pos.y + 1.8 > box.min.y;
    if (overlapX && overlapZ && overlapY) {
      const wasAlive = e.alive;
      const dmg = 120 + Math.round(kmh * 2);
      const fromCar = e.pos.clone().sub(vehicle.position).setY(0).normalize();
      e.takeDamage(dmg, fromCar, false);
      if (wasAlive && !e.alive) {
        state.kills++;
        state.score += 150;
        killBanner(false, 150);
        audio.kill();
        const speed = Math.abs(vehState.speed);
        const fly = fromCar.clone().multiplyScalar(2.5 + speed * 0.45);
        fly.y = 2.5 + speed * 0.28;
        const tumble = new THREE.Vector3(
          -(6 + speed * 0.5) * (0.8 + Math.random() * 0.4),
          0,
          (Math.random() - 0.5) * 7
        );
        e.launchRagdoll(fly, tumble);
      } else {
        e.vel.addScaledVector(fromCar, 5);
      }
      fx.bloodSpray(e.pos.clone().setY(e.pos.y + 0.9), fromCar, 1.2);
      audio.runOver(e.pos, camera.getWorldPosition(_tmpV), getDir(), rightOf(getDir()), kmh);
      vehState.shake = Math.min(1, (vehState.shake || 0) + 0.25 + kmh / 160);
    }
  }
}

const grenades = [];
function tryThrowGrenade() {
  if (!state.running || state.paused || state.over) return;
  if (weapons.grenades <= 0 || weapons.grenadeCd > 0) return;
  if (weapons.slot === 3 && state.grenadeThrowT > 0) return;
  state.lastGunSlot = weapons.slot === 3 ? (state.lastGunSlot || 0) : weapons.slot;
  weapons.slot = 3;
  state.grenadeThrowT = 0.45;
}
function releaseGrenade() {
  if (weapons.slot !== 3) return;
  state.grenadeThrowT = 0;
  throwGrenade();
  weapons.switchTo(state.lastGunSlot || 0);
}
function throwGrenade() {
  const dir = getDir();
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const vel = dir.clone().multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0));
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a4a32, roughness: 0.6, metalness: 0.4 })
  );
  mesh.castShadow = true;
  mesh.position.copy(origin).addScaledVector(dir, 0.4);
  scene.add(mesh);
  grenades.push({ mesh, vel, fuse: 2.2 });
  weapons.grenades = Math.max(0, weapons.grenades - 1);
  weapons.grenadeCd = 0.8;
  audio.throwSfx();
}
function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 18 * dt;
    const np = g.mesh.position.clone().addScaledVector(g.vel, dt);
    const hit = phys.segmentHit(g.mesh.position, np);
    if (hit) {
      const n = hit.normal;
      const vn = g.vel.dot(n);
      g.vel.addScaledVector(n, -2 * vn).multiplyScalar(0.45);
      np.copy(hit.point).addScaledVector(n, 0.1);
      audio.impact && 0;
    }
    g.mesh.position.copy(np);
    if (g.fuse <= 0) {
      detonate(g.mesh.position.clone());
      scene.remove(g.mesh);
      grenades.splice(i, 1);
    }
  }
}
function detonate(pos) {
  fx.explosion(pos);
  audio.explosion(pos, camera.getWorldPosition(_tmpV), getDir(), rightOf(getDir()));
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const d = e.pos.distanceTo(pos);
    if (d < 9) {
      const dmg = Math.round(180 * (1 - d / 9));
      const wasAlive = e.alive;
      e.takeDamage(dmg, e.pos.clone().sub(pos).normalize(), false);
      if (wasAlive && !e.alive) onKill(e, false);
    }
  }
  const dp = player.pos.distanceTo(pos);
  if (dp < 8) {
    damagePlayerWithShield(Math.round(90 * (1 - dp / 8)), pos);
    if (!player.alive) state.deathCause = 'DETONAÇÃO PRÓPRIA';
  }
}
const _tmpV = new THREE.Vector3();

function damagePlayerWithShield(dmg, fromPos) {
  if (state.shield > 0) {
    const absorbed = Math.min(state.shield, dmg);
    state.shield -= absorbed;
    dmg -= absorbed;
  }
  if (dmg > 0) player.takeDamage(dmg, fromPos);
}

function toggleLoadout(force) {
  state.loadoutOpen = force !== undefined ? force : !state.loadoutOpen;
  const el = document.getElementById('loadout');
  if (!el) return;
  el.classList.toggle('hidden', !state.loadoutOpen);
  if (state.loadoutOpen) renderLoadout();
}

function renderLoadout() {
  const el = document.getElementById('loadout');
  if (!el) return;
  const op = OPERATORS[state.playerClass];
  const rows = weapons.defs.map((d, i) => {
    const active = weapons.slot === i;
    const ammo = i === 3 ? `${weapons.grenades} un` : `${d.mag}/${d.reserve}`;
    let extra = '';
    if (i === 1) extra = weapons.suppOn
      ? '<span class="lo-state on">· SUPRESSOR [X]</span>'
      : '<span class="lo-state off">· ABERTA [X]</span>';
    if (i === 0 || i === 4 || i === 5) extra = '<span class="lo-state">· ' + (d.pellets ? `${d.pellets} projéteis` : d.auto ? 'AUTO' : 'SEMI') + '</span>';
    if (i === 2) extra = '<span class="lo-state">· LUNETA</span>';
    return `<div class="lo-row ${active ? 'active' : ''}">
      <span class="lo-key">${['1','2','3','G','4','5'][i]}</span>
      <span class="lo-name">${d.name}</span>
      <span class="lo-ammo">${ammo}</span>${extra}
    </div>`;
  }).join('');
  el.innerHTML = `
    <h2>LOADOUT — OPERADOR ${op.name}</h2>
    <div class="lo-grid">${rows}</div>
    <div class="lo-foot">ESCUDO ${Math.ceil(state.shield)}/${state.shieldMax} · [Q] FECHAR</div>`;
}

function trySuppressorToggle() {
  if (!state.running || state.paused || state.over) return;
  if (weapons.slot !== 1) return;
  weapons.toggleSuppressor();
}

let thirdPerson = false;
let playerAvatar = null;
function toggleThirdPerson() {
  if (!state.running || state.over || vehicle) return;
  thirdPerson = !thirdPerson;
  if (thirdPerson) {
    if (!playerAvatar) playerAvatar = makeOperatorMesh(playerAvatarKind);
    playerAvatar.visible = true;
    scene.add(playerAvatar);
  } else if (playerAvatar) {
    scene.remove(playerAvatar);
  }
}

let scoreboardOpen = false;
function toggleScoreboard(open) {
  const el = document.getElementById('scoreboard');
  if (!el) return;
  scoreboardOpen = open;
  el.classList.toggle('hidden', !open);
  if (open) {
    const hostileKills = state.enemies.filter(e => !e.alive).length;
    document.getElementById('sb-player-kills').textContent = state.kills;
    document.getElementById('sb-player-deaths').textContent = state.deaths || 0;
    document.getElementById('sb-hostile-kills').textContent = hostileKills;
    document.getElementById('sb-wave').textContent = state.wave;
    document.getElementById('sb-score').textContent = state.score;
    const tb = document.getElementById('sb-online');
    if (tb) {
      const rows = (state.onlineBoard || [])
        .map(([id, name, kills, cls]) =>
          `<tr class="me" style="opacity:${id === net.id ? 1 : 0.75}"><td>${String(name).replace(/[<>&]/g, '')}${id === net.id ? ' (VOCÊ)' : ''}</td><td class="num">${kills}</td><td class="num">—</td><td class="num">—</td></tr>`)
        .join('');
      tb.innerHTML = rows;
    }
  }
}

let lastT = performance.now();
function frame(nowT) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (nowT - lastT) / 1000);
  lastT = nowT;
  if (!state.running) { menuCamera(nowT); renderOperatorSelect(Math.min(0.05, dt)); render(); return; }
  if (state.paused) {
    syncPauseFromTip();
    if (state.paused) { render(); return; }
  }
  if (state.over) { render(); return; }

  state.time += dt;
  update(dt);
  render();
}

let rotateTipVisible = false;
function syncPauseFromTip() {
  const tip = document.getElementById('touch-rotate-tip');
  const showing = !!(tip && tip.classList.contains('on'));
  if (showing && !rotateTipVisible) {
    rotateTipVisible = true;
    state.paused = true;
    showOverlay('pause');
  } else if (!showing && rotateTipVisible) {
    rotateTipVisible = false;
    state.paused = false;
    hideOverlay();
  }
}

function update(dt) {
  if (vehicle) { updateVehicle(dt); }
  const fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const strafe = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const wantCrouch = !!keys['ControlLeft'] || !!keys['KeyC'];
  const wantSprint = !!keys['ShiftLeft'] && fwd > 0 && !wantCrouch && !weapons.ads;

  player.wantCrouch = wantCrouch;
  player.sprintK = dampF(player.sprintK, wantSprint ? 1 : 0, 10, dt);
  player.crouchK = dampF(player.crouchK, wantCrouch ? 1 : 0, 12, dt);

  const dirX = Math.sin(player.yaw), dirZ = Math.cos(player.yaw);
  const fX = -Math.sin(player.yaw), fZ = -Math.cos(player.yaw);
  const rX = Math.cos(player.yaw), rZ = -Math.sin(player.yaw);
  let mx = fX * fwd + rX * strafe;
  let mz = fZ * fwd + rZ * strafe;
  const ml = Math.hypot(mx, mz);
  if (ml > 0) { mx /= ml; mz /= ml; }
  const moving = ml > 0;

  if (vehicle) {
    syncDriverPose(dt);
    const back = 7.5, up = 3.2;
    const sinY = Math.sin(player.yaw), cosY = Math.cos(player.yaw);
    camera.position.set(vehicle.position.x + sinY * back, vehicle.position.y + up, vehicle.position.z + cosY * back);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch * 0.55;
    camera.rotation.z = 0;
    camera.fov = dampF(camera.fov, 74 + Math.abs(vehState.speed) * 0.5 + vehState.turboK * 9, 8, dt);
    if (vehState.shake > 0.001) {
      const s = vehState.shake;
      camera.position.x += (Math.random() - 0.5) * 0.55 * s;
      camera.position.y += (Math.random() - 0.5) * 0.4 * s;
      camera.position.z += (Math.random() - 0.5) * 0.55 * s;
      vehState.shake = dampF(vehState.shake, 0, 6, dt);
    }
    camera.updateProjectionMatrix();
    hud.crosshair.style.opacity = '0';
  }

  if (!vehicle) {
  const crouchFactor = 1 - player.crouchK * 0.55;
  const sprintFactor = 1 + player.sprintK * 0.55;
  const baseSpeed = 5.2 * crouchFactor * sprintFactor * (weapons.ads ? 0.55 : 1) * (state.speedMul || 1);
  const targetVx = mx * baseSpeed, targetVz = mz * baseSpeed;
  const accel = player.onGround ? 14 : 4;
  player.vel.x = dampF(player.vel.x, targetVx, accel, dt);
  player.vel.z = dampF(player.vel.z, targetVz, accel, dt);

  if (keys['Space'] && player.onGround) {
    player.vel.y = 7.2;
    player.onGround = false;
  }
  player.vel.y -= 20 * dt;

  const res = phys.moveCapsule(player.pos, player.vel, dt, player.radius, player.height);
  player.onGround = res.onGround;
  if (player.onGround) player.vel.y = Math.max(player.vel.y, 0);

  if (player.health < player.maxHealth && player.alive) {
    player.regenT += dt;
    if (player.regenT > 5) player.health = Math.min(player.maxHealth, player.health + 9 * dt);
  }

  stepTimer -= dt * Math.hypot(player.vel.x, player.vel.z) * (1 + player.sprintK * 0.5);
  if (stepTimer <= 0 && player.onGround && Math.hypot(player.vel.x, player.vel.z) > 1.5) {
    audio.footstep(player.sprintK > 0.5);
    stepTimer = 2.4;
  }

  const eyeH = player.eye - player.crouchK * 0.55;
  const bobAmp = Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 5) * (1 - weapons.adsK * 0.6);
  const bobY = Math.abs(Math.sin(walkT)) * 0.035 * bobAmp;
  const bobX = Math.sin(walkT) * 0.02 * bobAmp;
  walkT += dt * (6 + Math.hypot(player.vel.x, player.vel.z) * 1.1);

  camera.rotation.order = 'YXZ';
  const rec = weapons.consumeRecoil();

  if (thirdPerson && playerAvatar) {
    const kids = playerAvatar.children;
    const armL = kids[kids.length - 4], armR = kids[kids.length - 3];
    const legL = kids[kids.length - 2], legR = kids[kids.length - 1];
    playerAvatar.userData.aimK = dampF(playerAvatar.userData.aimK || 0, weapons.ads ? 1 : 0, 12, dt);
    const aimK = playerAvatar.userData.aimK;
    const back = 2.6 - aimK * 0.8, up = 0.35 + aimK * 0.08, side = 0.55 + aimK * 0.38;
    const sinY = Math.sin(player.yaw), cosY = Math.cos(player.yaw);
    const cx = player.pos.x - (-sinY) * back + cosY * side;
    const cz = player.pos.z - (-cosY) * back + sinY * side;
    camera.position.set(cx, player.pos.y + eyeH + up + bobY, cz);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch * 0.9;
    camera.rotation.z = 0;
    {
      const head = new THREE.Vector3(player.pos.x, player.pos.y + eyeH + 0.15, player.pos.z);
      const dir = camera.position.clone().sub(head);
      const len = dir.length();
      const hit = phys.segmentHit(head, head.clone().addScaledVector(dir, 1.02));
      if (hit) camera.position.copy(head).addScaledVector(dir, Math.max(0.25, hit.t * 0.95));
      void len;
    }
    playerAvatar.position.set(player.pos.x, player.pos.y, player.pos.z);
    playerAvatar.rotation.y = player.yaw;
    const t = walkT, amp = bobAmp * 0.5;
    legL.rotation.x = Math.sin(t) * amp;
    legR.rotation.x = -Math.sin(t) * amp;
    const swing = Math.sin(t * 2);
    const armAim = 0.95 + player.pitch * 0.9;
    armR.rotation.x = swing * amp * 0.12 * (1 - aimK) + armAim * aimK;
    armL.rotation.x = swing * amp * 0.3 * (1 - aimK) + armAim * 0.85 * aimK;
    const gunRoot = armR.children[armR.children.length - 1];
    const wAk = gunRoot?.getObjectByName('w-ak');
    const wDe = gunRoot?.getObjectByName('w-deagle');
    const wSn = gunRoot?.getObjectByName('w-sniper');
    const wGr = gunRoot?.getObjectByName('w-grenade');
    if (wAk && wDe) {
      wAk.visible = weapons.slot === 0;
      wDe.visible = weapons.slot === 1;
      wSn.visible = weapons.slot === 2;
      wGr.visible = weapons.slot === 3;
      const wM5 = gunRoot.getObjectByName('w-mp5');
      const wP12 = gunRoot.getObjectByName('w-pump');
      if (wM5) wM5.visible = weapons.slot === 4;
      if (wP12) wP12.visible = weapons.slot === 5;
      const supp3 = gunRoot.getObjectByName('w-supp');
      if (supp3) supp3.visible = weapons.suppOn;
    }
    const gunAim = -0.95 * aimK;
    if (wAk) wAk.rotation.x = gunAim;
    if (wDe) wDe.rotation.x = gunAim;
    if (wSn) wSn.rotation.x = gunAim;
  } else {
    camera.position.set(player.pos.x + bobX * 0.4, player.pos.y + eyeH + bobY, player.pos.z);
    camera.rotation.y = player.yaw + rec.yaw;
    camera.rotation.x = player.pitch + rec.pitch;
    camera.rotation.z = Math.sin(walkT * 0.5) * 0.006 * bobAmp + (mouse2Down ? -0.012 : 0) * (1 - weapons.adsK);
  }

  const targetFov = state.adsBaseFov
    - weapons.adsK * (weapons.def.adsFov ? state.adsBaseFov - weapons.def.adsFov : 0)
    + player.sprintK * 6;
  camera.fov = dampF(camera.fov, targetFov, 12, dt);
  camera.updateProjectionMatrix();
  }

  weapons.update(dt, {
    moving: vehicle ? false : moving, running: !vehicle && player.sprintK > 0.5, grounded: player.onGround,
    aimHeld: mouse2Down && state.grenadeThrowT <= 0,
    throwAnim: state.grenadeThrowT,
  });

  if ((mouseDown || touchFiring) && !vehicle) {
    const d = weapons.def;
    const rpmInterval = 60 / d.rpm;
     if (weapons.slot === 3) {
      if (state.grenadeThrowT > 0.06) state.grenadeThrowT = 0.06;
    }
    else if (d.auto || !firedThisPress) {
      if (state.time - lastShotT >= rpmInterval) {
        if (weapons.canFire()) { fireBullet(); lastShotT = state.time; firedThisPress = true; }
        else if (!d.auto || d.mag <= 0) { if (state.time - lastShotT > 0.3) { audio.dryFire(); lastShotT = state.time; } }
      }
      if (!d.auto) firedThisPress = true;
    }
  }

  for (const e of state.enemies) {
    e.update(dt, player, state.time, fx, audio,
      camera.position, getDir(), rightOf(getDir()));
  }
  if (state.cheatGod) player.god = true; else player.god = false;
  state.enemies = state.enemies.filter(e => e.alive || e.deathT < 14);

  if (!state.betweenWaves) {
    if (state.spawnQueue > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) { spawnEnemy(); state.spawnQueue--; state.spawnTimer = 1.4; }
    } else if (state.enemies.filter(e => e.alive).length === 0) {
      state.betweenWaves = true;
      state.waveBreak = 6;
      audio.waveClear();
      state.score += 500;
    }
  } else {
    state.waveBreak -= dt;
    if (state.waveBreak <= 0) startWave();
  }

  if (state.grenadeThrowT > 0) {
    state.grenadeThrowT -= dt;
    if (state.grenadeThrowT <= 0) releaseGrenade();
  }
  updateGrenades(dt);
  unstuckEnemies(dt);
  fx.update(dt, camera.position);

  if (net.connected) net.sendState(player.pos, player.yaw, player.pitch, weapons.slot, Math.round(player.health), moving);
  net.update(dt);

  if (state.damageFlashT > 0) state.damageFlashT -= dt;
  const lastHp = state.lastHp === undefined ? 100 : state.lastHp;
  if (player.health < lastHp && !state.cheatGod) {
    state.damageFlashT = 0.5;
    state.hitFromDir = player.lastDamageDir.clone();
  }
  state.lastHp = player.health;

  if (player.health < 35 && !state.cheatGod) {
    state.heartbeatT -= dt;
    if (state.heartbeatT <= 0) { audio.heartbeat(); state.heartbeatT = 0.9; }
  }
  if (player.health <= 0 && !state.deathCause) {
    state.deathCause = 'FOGO HOSTIL · TIRO';
  }

  if (state.loadoutOpen) renderLoadout();

  if (!player.alive && !state.over) {
    state.over = true;
    state.deaths = (state.deaths || 0) + 1;
    saveRecordIfNeeded();
    state.deathT = 0;
    document.exitPointerLock();
    net.disconnect();
    setTimeout(() => showDeathScreen(), 2100);
  }
  vehicleHitCheck();

  if (state.deathT !== undefined && state.over) {
    state.deathT += dt;
    const t = Math.min(1, state.deathT / 1.6);
    const ease = 1 - Math.pow(1 - t, 3);
    const eyeH = 0.85 + (1 - player.crouchK) * 0.85;
    camera.position.set(player.pos.x, player.pos.y + eyeH * (1 - ease * 0.82), player.pos.z);
    camera.rotation.z = ease * 0.85;
    camera.rotation.x = player.pitch * (1 - ease) - ease * 0.25;
  }

  updHud();
  drawMinimap();
  updateSpeedo();
}

let stepTimer = 0, walkT = 0, lastShotT = 0, firedThisPress = false;

function render() {
  const scoped = weapons.def.scope && weapons.adsK > 0.85 && !thirdPerson;
  const scopeEl = document.getElementById('scope-overlay');
  if (scopeEl) scopeEl.classList.toggle('on', !!scoped);

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  const showVM = state.running && !state.over && !scoped && !thirdPerson && !vehicle
    && (weapons.slot !== 3 || state.grenadeThrowT > 0);
  if (showVM) {
    renderer.render(weapons.vmScene, weapons.vmCamera);
  }
}

function menuCamera(nowT) {
  const t = nowT * 0.001;
  const ang = t * 0.055;
  const r = 30;
  camera.position.set(Math.cos(ang) * r, 9.5 + Math.sin(t * 0.11) * 1.6, Math.sin(ang) * r);
  camera.lookAt(0, 2.2, 0);
}

function drawMinimap() {
  const c = mmCtx, S = 150, half = S / 2;
  c.clearRect(0, 0, S, S);
  c.fillStyle = 'rgba(10,14,10,0.75)';
  c.fillRect(0, 0, S, S);
  const range = 60;
  const px = player.pos.x, pz = player.pos.z;
  const toMap = (x, z) => [
    half + (x - px) * (half / range),
    half + (z - pz) * (half / range),
  ];
  c.fillStyle = 'rgba(140,150,140,0.5)';
  for (const b of phys.colliders) {
    if (b.max.y <= 0.35 && b.max.y - b.min.y <= 0.35) continue;
    const [x1, z1] = toMap(b.min.x, b.min.z);
    const [x2, z2] = toMap(b.max.x, b.max.z);
    if ((x1 < 0 && x2 < 0) || (x1 > S && x2 > S) || (z1 < 0 && z2 < 0) || (z1 > S && z2 > S)) continue;
    c.fillRect(Math.min(x1, x2), Math.min(z1, z2), Math.abs(x2 - x1), Math.abs(z2 - z1));
  }
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const [ex, ez] = toMap(e.pos.x, e.pos.z);
    if (ex < 0 || ex > S || ez < 0 || ez > S) continue;
    c.fillStyle = e.seesPlayer ? '#ff4136' : '#c0392b';
    c.beginPath();
    c.arc(ex, ez, 3.4, 0, Math.PI * 2);
    c.fill();
  }
  c.save();
  c.translate(half, half);
  c.rotate(-(-player.yaw) - Math.PI);
  c.fillStyle = '#7ec97e';
  c.beginPath();
  c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(-4.5, 5);
  c.closePath(); c.fill();
  c.restore();
}

function initMenuInteractivity() {
  const unlockAudio = () => { audio.init(); audio.resume(); };
  addEventListener('pointerdown', unlockAudio);
  addEventListener('keydown', unlockAudio);

  const rows = Array.from(document.querySelectorAll('#controls3d .row'));
  rows.forEach(row => {
    const caps = row.querySelectorAll('.cap');
    row.addEventListener('mousemove', e => {
      if (row.dataset.tilting !== '1') { row.dataset.tilting = '1'; row.classList.add('tilting'); }
      const r = row.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      row.style.transform = `perspective(700px) rotateY(${nx * 14}deg) rotateX(${-ny * 10}deg) translateZ(6px)`;
    });
    row.addEventListener('mouseenter', () => { audio.uiHover(); });
    row.addEventListener('mouseleave', () => {
      row.style.transform = '';
      delete row.dataset.tilting;
      row.classList.remove('tilting');
    });
    row._keys = (row.dataset.key || '').split(',');
  });

  const keyRows = rows;
  const findRowsForCode = code => keyRows.filter(r => r._keys.includes(code));

  window.__uiSetKeyVisual = (code, down) => {
    for (const row of findRowsForCode(code)) {
      row.querySelectorAll('.cap').forEach(cap => cap.classList.toggle('pressed', down));
    }
  };

  document.querySelectorAll('.btn').forEach(b => {
    b.addEventListener('mouseenter', () => audio.uiHover());
    b.addEventListener('click', () => audio.uiPress());
  });

  const logo = document.querySelector('#screen-start .logo');
  const overlayEl = document.getElementById('overlay');
  addEventListener('mousemove', e => {
    if (overlayEl.classList.contains('hidden') || !logo) return;
    const nx = e.clientX / innerWidth - 0.5;
    const ny = e.clientY / innerHeight - 0.5;
    logo.style.transform = `translate(${nx * 10}px, ${ny * 7}px)`;
  });

  addEventListener('keydown', e => {
    if (e.code === 'Enter' && !overlayEl.classList.contains('hidden')
        && !document.getElementById('screen-start').classList.contains('hidden')) {
      document.getElementById('btn-start').click();
    }
  });
}
const forceTouch = new URLSearchParams(location.search).has('touch');
initMenuInteractivity();
initQualityUi();
if (forceTouch || ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || (window.matchMedia && matchMedia('(pointer: coarse)').matches)) {
  document.body.classList.add('touch');
}
initTouchControls();

let opRenderer = null, opScene = null, opCam = null, opMesh = null, opSpin = 0, opKind = 'police';

function initOperatorSelect() {
  const cv = document.getElementById('op-canvas');
  opRenderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  opRenderer.setSize(600, 680, false);
  opRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  opRenderer.shadowMap.enabled = true;
  opRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  opRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  opRenderer.outputColorSpace = THREE.SRGBColorSpace;
  opScene = new THREE.Scene();
  opCam = new THREE.PerspectiveCamera(34, 600 / 680, 0.1, 20);
  opCam.position.set(0, 1.05, 3.1);
  opCam.lookAt(0, 1.02, 0);
  const key = new THREE.DirectionalLight(0xffe2bd, 2.6); key.position.set(1.6, 2.2, 1.8);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 1.0); fill.position.set(-2, 0.8, 1.2);
  const rim = new THREE.DirectionalLight(0xffffff, 1.7); rim.position.set(-0.4, 1.6, -2.2);
  opScene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.55));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 40),
    new THREE.MeshStandardMaterial({ color: 0x11161a, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01;
  floor.receiveShadow = true;
  opScene.add(floor);
  setOperatorModel('police');
}

function setOperatorModel(kind) {
  opKind = kind;
  if (opMesh) opScene.remove(opMesh);
  opMesh = makeOperatorMesh(kind);
  opMesh.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  opMesh.position.y = 0;
  opScene.add(opMesh);
}

function renderOperatorSelect(dt) {
  if (!opRenderer || document.getElementById('screen-select').classList.contains('hidden')) return;
  opSpin += dt * 0.55;
  if (opMesh) {
    opMesh.rotation.y = opSpin;
    const torso = opMesh.getObjectByName('torso');
    if (torso) torso.position.y = 1.2 + Math.sin(opSpin * 2.2) * 0.006;
  }
  opRenderer.render(opScene, opCam);
}

function selectOperator(i) {
  state.playerClass = i;
  const op = OPERATORS[i];
  document.querySelectorAll('.op-card').forEach((c, j) => c.classList.toggle('sel', j === i));
  document.getElementById('op-name').textContent = op.name;
  document.getElementById('op-desc').textContent = op.desc;
  setOperatorModel(op.kind);
  audio.uiHover();
}

function applyOperator() {
  const op = OPERATORS[state.playerClass];
  state.shieldMax = op.shield;
  state.shield = op.shield;
  player.maxHealth = 100 + op.hpBonus;
  player.health = player.maxHealth;
  state.kickMul = op.kickMul;
  state.speedMul = op.speedMul;
  weapons.kickMul = op.kickMul;
  if (playerAvatar) { scene.remove(playerAvatar); playerAvatar = null; }
  playerAvatarKind = op.kind;
  net.myCls = op.kind;
  net.connect(
    (txt, color) => killFeed(txt, color),
    b => {
      state.onlineBoard = b || null;
      const el = document.getElementById('online');
      if (el) el.textContent = net.players.size + 1;
    }
  );
  net.onRemoteShot = s => {
    const [id, ox, oy, oz, dx, dy, dz, sfx] = s;
    const o = new THREE.Vector3(ox, oy, oz), d = new THREE.Vector3(dx, dy, dz);
    fx.tracer(o.clone().addScaledVector(d, 0.6), o.clone().addScaledVector(d, 60));
    fx.muzzleFlash(o, d);
    if (sfx === 'sniper') audio.shotSniper(o, camera.position, getDir(), rightOf(getDir()));
    else if (sfx === 'smg') audio.shotSmg(o, camera.position, getDir(), rightOf(getDir()));
    else if (sfx === 'shotgun') audio.shotShotgun(o, camera.position, getDir(), rightOf(getDir()));
    else audio.shotRifle(o, camera.position, getDir(), rightOf(getDir()));
  };
}

$('btn-start').addEventListener('click', () => {
  audio.init(); audio.resume();
  audio.uiConfirm();
  $('screen-start').classList.add('hidden');
  $('screen-select').classList.remove('hidden');
  document.getElementById('overlay').scrollTop = 0;
  if (!opRenderer) initOperatorSelect();
});

$('btn-deploy').addEventListener('click', () => {
  audio.uiConfirm();
  applyOperator();
  $('screen-select').classList.add('hidden');
  hideOverlay();
  state.running = true;
  state.paused = false;
  if (!touchMode) lockPointer();
});
document.querySelectorAll('.op-card').forEach((c, i) => c.addEventListener('click', () => selectOperator(i)));
$('btn-resume').addEventListener('click', () => {
  state.paused = false;
  hideOverlay();
  if (!touchMode) lockPointer();
});
$('btn-restart').addEventListener('click', () => {
  audio.uiConfirm();
  if (vehicle) exitVehicle();
  vehicle = null;
  vehState.speed = 0; vehState.steer = 0;
  const sp = world.spawns[0].clone().add(new THREE.Vector3(3, 0, 3));
  player.pos.copy(sp); player.vel.set(0, 0, 0);
  player.maxHealth = 100 + OPERATORS[state.playerClass].hpBonus;
  player.health = player.maxHealth;
  player.alive = true;
  player.yaw = 0; player.pitch = 0;
  state.shieldMax = OPERATORS[state.playerClass].shield;
  state.shield = state.shieldMax;
  state.deathCause = undefined;
  state.over = false;
  state.deathT = undefined;
  for (const e of state.enemies) if (e.mesh.parent) e.scene.remove(e.mesh);
  state.enemies = [];
  state.spawnQueue = 0;
  state.betweenWaves = true;
  state.waveBreak = 5;
  state.wave = Math.max(0, state.wave - 1);
  const initReserve = [120, 35, 25, 0, 150, 32];
  weapons.defs.forEach((d, i) => {
    if (d.magSize > 0) { d.mag = d.magSize; d.reserve = initReserve[i]; }
  });
  weapons.grenades = 4;
  weapons.switchTo(0);
  $('screen-over').classList.add('hidden');
  $('screen-select').classList.add('hidden');
  hideOverlay();
  state.running = true;
  state.paused = false;
  if (!touchMode) lockPointer();
  net.connect(
    (txt, color) => killFeed(txt, color),
    b => {
      state.onlineBoard = b || null;
      const el = document.getElementById('online');
      if (el) el.textContent = net.players.size + 1;
    }
  );
});
let playerAvatarKind = 'police';
window.__shieldDamage = damagePlayerWithShield;
function unstuckEnemies(dt) {   void dt; }

window.__fpsDebug = {
  get state() { return state; },
  get player() { return player; },
  get weapons() { return weapons; },
  get enemies() { return state.enemies; },
  get phys() { return phys; },
  get world() { return world; },
  fireOnce: () => { if (state.running) { fireBullet(); } },
  aim: (v) => { mouse2Down = !!v; },
  get god() { return !!state.cheatGod; },
  set god(v) { state.cheatGod = v; player.god = v; if (v) player.health = 100; },
  spawnEnemyAt: (x, z) => {
    const e = new Enemy(scene, world, phys, new THREE.Vector3(x, 0, z));
    state.enemies.push(e);
    return e;
  },
  unstuckEnemies: () => unstuckEnemies(0.016),
  enterCar: () => { if (!vehicle) enterVehicle(); return !!vehicle; },
  exitCar: () => { if (vehicle) exitVehicle(); return !vehicle; },
  get vehicle() { return vehicle; },
  step: (seconds, stepDt = 0.016) => {
    const n = Math.round(seconds / stepDt);
    for (let i = 0; i < n; i++) update(stepDt);
    return { time: +state.time.toFixed(2), hp: Math.round(player.health) };
  },
  throwGrenadeNow: () => throwGrenade(),
  net,
  zoomSensFactor: () => zoomSensFactor(),
  applyMouseDelta: (dx, dy) => applyLookDelta(dx, dy),
  get thirdPerson() { return thirdPerson; },
  get avatar() { return playerAvatar; },
};

function initTouchWeaponBar() {
  const bar = document.getElementById('hud-weaponbar');
  if (!bar) return;
  bar.style.display = 'flex';
  const build = () => {
    const defs = weapons.defs.map((d, i) => ({ d, i })).filter(x => [0, 1, 2, 4, 5].includes(x.i));
    bar.innerHTML = defs.map(({ d, i }) =>
      `<div class="wchip" data-i="${i}"><b>${['1','2','3','4','5'][defs.findIndex(z => z.i === i)]}</b>${d.name.split(' ')[0].slice(0, 6)}</div>`
    ).join('') + `<div class="wchip wgn" data-i="3"><b>G</b>${weapons.grenades}</div>`;
    bar.querySelectorAll('.wchip').forEach(ch => {
      ch.addEventListener('click', () => { if (state.running && !state.over) weapons.switchTo(+ch.dataset.i); });
    });
    syncTouchWeaponBar();
  };
  build();
  window.__touchWeaponBarBuilt = build;
  setInterval(() => { if (document.getElementById('touch-ui')) syncTouchWeaponBar(); }, 400);
}
function syncTouchWeaponBar() {
  const bar = document.getElementById('hud-weaponbar');
  if (!bar) return;
  bar.querySelectorAll('.wchip').forEach(ch => {
    ch.classList.toggle('on', weapons.slot === +ch.dataset.i);
    if (ch.dataset.i === '3') ch.lastChild && (ch.lastChild.textContent = weapons.grenades);
  });
}

function initTouchControls() {
  const isTouch = forceTouch || ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const ui = document.getElementById('touch-ui');
  if (!isTouch || !ui) return;
  touchMode = true;
  ui.classList.add('on');
  const stick = document.getElementById('touch-stick');
  const knob = document.getElementById('touch-knob');
  const look = document.getElementById('touch-look');
  const fire = document.getElementById('touch-fire');
  const ads = document.getElementById('touch-ads');
  const rotateTip = document.getElementById('touch-rotate-tip');
  let stickId = null, lookId = null;
  let stickCx = 0, stickCy = 0, lookX = 0, lookY = 0;

  const syncCarCluster = () => {
    const cluster = document.getElementById('tc-drive');
    if (cluster) cluster.style.display = vehicle ? 'flex' : 'none';
    const foot = document.getElementById('tc-foot');
    if (foot) foot.style.display = vehicle ? 'none' : 'flex';
    const cbts = document.querySelectorAll('#touch-ui .cbt');
    cbts.forEach(b => b.style.display = vehicle ? 'none' : '');
  };
  syncCarCluster();
  setInterval(syncCarCluster, 400);

  const syncRotateTip = () => {
    if (!rotateTip) return;
    const portrait = innerHeight > innerWidth;
    rotateTip.classList.toggle('on', portrait && state.running && !state.over);
    if (portrait && state.running && !state.over && !state.paused) {
      state.paused = true;
      showOverlay('pause');
    }
  };
  syncRotateTip();
  addEventListener('resize', syncRotateTip);
  setInterval(syncRotateTip, 400);

  ui.querySelectorAll('.tbtn').forEach(btn => {
    const code = btn.dataset.k;
    const down = e => { e.preventDefault(); btn.__down = true; keys[code] = true; btn.classList.add('held'); if (window.__uiSetKeyVisual) window.__uiSetKeyVisual(code, true); if (code === 'KeyQ' && state.running && !state.over) toggleLoadout(); };
    const up = e => { if (!btn.__down) return; e.preventDefault(); btn.__down = false; keys[code] = false; btn.classList.remove('held'); if (window.__uiSetKeyVisual) window.__uiSetKeyVisual(code, false); };
    btn.addEventListener('touchcancel', () => { btn.__down = false; keys[code] = false; btn.classList.remove('held'); });
    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('touchend', up, { passive: false });
    btn.addEventListener('touchcancel', up, { passive: false });
  });

  stick.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    stickId = t.identifier;
    const r = stick.getBoundingClientRect();
    stickCx = r.left + r.width / 2; stickCy = r.top + r.height / 2;
    e.preventDefault();
  }, { passive: false });
  stick.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      let dx = t.clientX - stickCx, dy = t.clientY - stickCy;
      const len = Math.hypot(dx, dy), max = 56;
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      keys['KeyW'] = dy < -14;
      keys['KeyS'] = dy > 14;
      keys['KeyA'] = dx < -14;
      keys['KeyD'] = dx > 14;
    }
    e.preventDefault();
  }, { passive: false });
  const stickEnd = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      stickId = null;
      knob.style.transform = '';
      keys['KeyW'] = keys['KeyS'] = keys['KeyA'] = keys['KeyD'] = false;
    }
  };
  stick.addEventListener('touchend', stickEnd);
  stick.addEventListener('touchcancel', stickEnd);

  look.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    lookId = t.identifier; lookX = t.clientX; lookY = t.clientY;
    if (state.running && !state.over) { touchFiring = true; mouseDown = true; }
    e.preventDefault();
  }, { passive: false });
  look.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      applyLookDelta(t.clientX - lookX, t.clientY - lookY);
      lookX = t.clientX; lookY = t.clientY;
    }
    e.preventDefault();
  }, { passive: false });
  const lookEnd = e => { for (const t of e.changedTouches) if (t.identifier === lookId) { lookId = null; touchFiring = false; mouseDown = false; firedThisPress = false; } };
  look.addEventListener('touchend', lookEnd);
  look.addEventListener('touchcancel', lookEnd);

  if (fire) {
    const fireDown = e => { e.preventDefault(); fire.classList.add('held'); touchFiring = true; mouseDown = true; };
    const fireUp = e => { e.preventDefault(); fire.classList.remove('held'); touchFiring = false; mouseDown = false; firedThisPress = false; };
    fire.addEventListener('touchstart', fireDown, { passive: false });
    fire.addEventListener('touchend', fireUp, { passive: false });
    fire.addEventListener('touchcancel', fireUp, { passive: false });
  }
  if (ads) {
    const adsDown = e => { e.preventDefault(); ads.classList.add('held'); mouse2Down = true; };
    const adsUp = e => { e.preventDefault(); ads.classList.remove('held'); mouse2Down = false; };
    ads.addEventListener('touchstart', adsDown, { passive: false });
    ads.addEventListener('touchend', adsUp, { passive: false });
    ads.addEventListener('touchcancel', adsUp, { passive: false });
  }

  const lookFirstTouch = e => { if (e.cancelable) e.preventDefault(); };
  look.addEventListener('touchstart', lookFirstTouch, { passive: false });
  document.addEventListener('gesturestart', e => { if (e.cancelable) e.preventDefault(); });
  document.addEventListener('dblclick', e => { if (touchMode && e.cancelable) e.preventDefault(); });

  initTouchWeaponBar();

  document.addEventListener('pointerlockchange', () => {
    if (touchMode && document.pointerLockElement === canvas) document.exitPointerLock();
  });
  armTouchActivation();
}

showOverlay('start');
applyQuality();
requestAnimationFrame(frame);

setInterval(() => {
  if (!state.running) return;
  state.hitmarkerT = Math.max(0, state.hitmarkerT - 0.05);
  hud.hitmarker.style.opacity = state.hitmarkerT > 0 ? 1 : 0;
  hud.dmgflash.style.opacity = state.damageFlashT > 0 ? Math.min(0.55, state.damageFlashT) : 0;
  hud.lowhp.style.opacity = player.health < 35 ? (0.4 + Math.sin(state.time * 6) * 0.2) : 0;
  const sp = weapons.spread();
  const px = 8 + sp * 900 * (1 - weapons.adsK);
  hud.crosshair.style.setProperty('--gap', px + 'px');
  hud.crosshair.style.opacity = thirdPerson ? '0.9' : (1 - weapons.adsK).toFixed(2);
}, 50);
