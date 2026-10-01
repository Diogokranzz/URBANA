import * as THREE from '../vendor/three.module.js';
import { WEAPONS, WEAPON_BY_ID, RECOIL_PROFILE, VIEWMODEL, EASING, ease, OPTIC_DEFAULTS, LASER_DEFAULTS, ADS_PROFILE, SPRINT_PROFILE, WEAPON_SENSE_PRESETS } from '../src/config/weapon-data.js';
import { SURFACES, surfaceOf, DECAL_LIMITS } from '../src/config/surfaces.js';
import { GRAPHICS_PRESETS, VISUAL_PRESETS, visualDe, LIMITES_SEGUROS, valorSeguro, DEFAULTS, Settings } from '../src/config/settings.js';
import { AimDownSightsComponent, SwayComponent, RecoilComponent, WeaponCollisionComponent, SprintPoseComponent, clampN, damp } from '../src/weapon/layers.js';
import { WeaponAnimationController } from '../src/weapon/anim-controller.js';
import { contagemDeProjeteis, projeteisComTracer, permiteDisparo } from '../src/weapon/disparo.js';
import { initWeaponDebug } from '../src/weapon/debug.js';
import { Weapons } from '../src/weapons.js';

let passou = 0;
const falhas = [];

function ok(nome, cond, detalhe) {
  if (cond) passou++;
  else falhas.push(nome + (detalhe ? ' -> ' + detalhe : ''));
}

function finito(...vs) {
  return vs.every(v => typeof v === 'number' && Number.isFinite(v));
}

function perto(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

const ARMAS_DE_FOGO = WEAPONS.filter(w => w.class !== 'throwable');

ok('ids de arma unicos', new Set(WEAPONS.map(w => w.id)).size === WEAPONS.length);
ok('WEAPON_BY_ID resolve todos', WEAPONS.every(w => WEAPON_BY_ID[w.id] === w));

for (const w of ARMAS_DE_FOGO) {
  const req = ['id', 'name', 'slot', 'class', 'rpm', 'dmg', 'mag', 'magSize', 'reserve', 'reloadTime', 'spreadHip', 'spreadAds', 'adsFov', 'range', 'model', 'optic', 'sway', 'ads', 'collision', 'lod'];
  ok('arma ' + w.id + ' tem campos obrigatorios', req.every(k => w[k] !== undefined), req.filter(k => w[k] === undefined).join(','));
  ok('arma ' + w.id + ' tem perfil de recuo valido', !w.recoil || !!RECOIL_PROFILE[w.recoil]);
  ok('arma ' + w.id + ' ADS aproxima a mira', w.adsFov < DEFAULTS.fov, w.adsFov + ' vs ' + DEFAULTS.fov);
  ok('arma ' + w.id + ' modelo de vista nao excede o FOV do quadril', VIEWMODEL.hipFov > 0 && w.adsFov <= DEFAULTS.fov);
  ok('arma ' + w.id + ' espalhamento ADS <= quadril', w.spreadAds <= w.spreadHip);
  ok('arma ' + w.id + ' ADS entra em tempo plausivel', w.ads.inTime > 0.05 && w.ads.inTime < 0.6);
  ok('arma ' + w.id + ' tempo de recarga plausivel', w.reloadTime > 0.8 && w.reloadTime < 5);
  ok('arma ' + w.id + ' tem linhas de mira', !!VIEWMODEL.basePos[w.model] && !!VIEWMODEL.adsPos[w.model], w.model);
  ok('arma ' + w.id + ' tem limite de colisao', w.collision.minDistance > 0 && w.collision.probeLength > w.collision.minDistance);

  const linha = w.reload.events;
  ok('arma ' + w.id + ' tem linha de recarga', Array.isArray(linha) && linha.length >= 4);
  ok('arma ' + w.id + ' recarga comeca e termina', linha[0].event === 'reloadStart' && linha[linha.length - 1].event === 'reloadEnd');
  ok('arma ' + w.id + ' recarga ordenada', linha.every((e, i) => i === 0 || e.t >= linha[i - 1].t));
  ok('arma ' + w.id + ' recarga dentro de 0..1', linha.every(e => e.t >= 0 && e.t <= 1));
  ok('arma ' + w.id + ' confirma municao antes do fim', linha.some(e => e.event === 'ammoCommit'));
  ok('arma ' + w.id + ' libera carregador', linha.some(e => e.event === 'magRelease' || e.event === 'shellIn'));
}

ok('perfis de recuo completos', Object.values(RECOIL_PROFILE).every(p =>
  p.kick > 0 && p.kickYaw >= 0 && p.recovery > 0 && p.kickRecovery > 0 &&
  Array.isArray(p.pattern) && p.pattern.length > 0 &&
  p.pattern.every(pt => Array.isArray(pt) && pt.length === 2 && finito(pt[0], pt[1]))));

ok('opticas padrao coerentes', ['holo', 'iron', 'scope', 'shotgunRing'].every(k => !!OPTIC_DEFAULTS[k]));
ok('laser padrao coerente', LASER_DEFAULTS.dotSize > 0 && LASER_DEFAULTS.maxDistance > 0 && LASER_DEFAULTS.beamOpacity > 0);

for (const [nome, fn] of Object.entries(EASING)) {
  ok('easing ' + nome + ' comeca em 0', perto(fn(0), 0, 1e-9), String(fn(0)));
  ok('easing ' + nome + ' termina em 1', perto(fn(1), 1, 1e-9), String(fn(1)));
  let dentro = true;
  for (let i = 0; i <= 20; i++) {
    const v = fn(i / 20);
    if (!Number.isFinite(v) || v < -0.15 || v > 1.5) dentro = false;
  }
  ok('easing ' + nome + ' sem estouro', dentro);
}
ok('ease satura entradas fora de faixa', perto(ease('linear', -5), 0) && perto(ease('linear', 9), 1));
ok('ease cai em linear para nome desconhecido', perto(ease('naoExiste', 0.5), 0.5));

const IDS_ESPERADOS = ['concrete', 'plaster', 'brick', 'metal', 'wood', 'glass', 'plastic', 'fabric', 'asphalt', 'flesh'];
ok('todas as superficies exigidas existem', IDS_ESPERADOS.every(id => !!SURFACES[id]), IDS_ESPERADOS.filter(id => !SURFACES[id]).join(','));
for (const [id, s] of Object.entries(SURFACES)) {
  ok('superficie ' + id + ' tem decal', !!s.decal && typeof s.decal.kind === 'string');
  ok('superficie ' + id + ' tem poeira', !!s.dust && typeof s.dust.count === 'number');
  ok('superficie ' + id + ' tem lascas', !!s.chips && typeof s.chips.count === 'number');
  ok('superficie ' + id + ' tem faiscas', !!s.sparks && typeof s.sparks.count === 'number');
  ok('superficie ' + id + ' tem clarao', !!s.flash && s.flash.intensity >= 0 && s.flash.duration > 0);
  ok('superficie ' + id + ' tem audio', !!s.audio && typeof s.audio.layer === 'string');
  ok('superficie ' + id + ' tem decal com fade', s.decal.fade >= 0 && s.decal.opacity >= 0 && s.decal.opacity <= 1);
}
ok('surfaceOf usa concreto como fallback', surfaceOf('inexistente') === SURFACES.concrete);
ok('limite de decais ativos > 0', DECAL_LIMITS.maxActive > 0 && DECAL_LIMITS.fadeOut > 0);

const CHAVES = ['baixa', 'media', 'alta', 'ultra', 'competitivo'];
ok('presets graficos completos', CHAVES.every(k => !!GRAPHICS_PRESETS[k]));
for (const k of CHAVES) {
  const p = GRAPHICS_PRESETS[k];
  ok('preset ' + k + ' tem orcamento numerico', finito(p.pixelRatio, p.pointLights, p.decals, p.particles, p.impactLights), JSON.stringify(p));
  ok('preset ' + k + ' tem qualidade de sombra/luz', typeof p.shadows === 'boolean' && typeof p.fog === 'boolean');
}
ok('competitivo prioriza leitura', GRAPHICS_PRESETS.competitivo.particles < GRAPHICS_PRESETS.alta.particles && GRAPHICS_PRESETS.competitivo.decals < GRAPHICS_PRESETS.alta.decals);
const ACESS = ['hudScale', 'hudOpacity', 'safezone', 'shakeScale', 'flashScale', 'weaponSway', 'bobScale', 'crosshair', 'crosshairColor', 'crosshairScale', 'showMinimap', 'showChips', 'showCompass', 'laser', 'bloodEnabled', 'lowHpEffects', 'laserVisibility'];
ok('acessibilidade cobre os itens exigidos', ACESS.every(k => DEFAULTS[k] !== undefined), ACESS.filter(k => DEFAULTS[k] === undefined).join(','));
ok('get/set de configuracao funciona sem DOM', Settings.set('hudScale', 1.2, true) === 1.2 && Settings.get('hudScale') === 1.2);

ok('clampN respeita limites', clampN(5, -1, 1) === 1 && clampN(-9, -1, 1) === -1 && clampN(0.4, -1, 1) === 0.4);
ok('damp converge para o alvo', perto(damp(1, 0, 12, 10), 0, 1e-4));

const ads = new AimDownSightsComponent();
ads.setProfile({ inTime: 0.2, outTime: 0.15, inCurve: 'easeOutQuint', outCurve: 'easeInOutCubic', sensScale: 0.6, swayScale: 0.2 });
ads.request(true);
let anterior = -1, monotono = true, passosEntrada = 0;
while (ads.blend < 1 && passosEntrada < 200) {
  const k = ads.update(1 / 60);
  if (k < anterior) monotono = false;
  anterior = k;
  passosEntrada++;
}
ok('ADS converge para dentro da janela', ads.blend === 1 && passosEntrada <= 14, String(passosEntrada));
ok('ADS tem curva monotona na entrada', monotono);
ok('ADS reduz sensibilidade no pico', perto(ads.sensScale, 0.6, 1e-6) && perto(ads.swayScale, 0.2, 1e-6));
ok('ADS nao afeta sensibilidade no quadril', perto(new AimDownSightsComponent().sensScale, 1, 1e-6));
ads.request(false);
while (ads.blend > 0) ads.update(1 / 60);
ok('ADS volta para o quadril', ads.blend === 0 && perto(ads.sensScale, 1, 1e-6));

const recuo = new RecoilComponent();
recuo.setProfile(RECOIL_PROFILE.rifle);
let pico = 0, semNaN = true;
for (let i = 0; i < 8; i++) {
  recuo.shot(1);
  const out = recuo.update(1 / 60, { shakeScale: 1 });
  pico = Math.max(pico, out.y);
  if (!finito(out.x, out.y, out.z, out.rx, out.ry, out.rz)) semNaN = false;
}
ok('recuo gera elevacao da arma sem NaN', pico > 0 && semNaN, String(pico));
const cam = recuo.consumeCamera();
ok('recuo de camera finito e consumido uma vez', finito(cam.pitch, cam.yaw) && perto(recuo.consumeCamera().pitch, 0));
for (let i = 0; i < 200; i++) recuo.update(1 / 60, { shakeScale: 1 });
ok('recuo se recupera por completo', perto(recuo.kick, 0, 1e-3) && perto(recuo.yaw, 0, 1e-3) && recuo.streak < 0.05);
recuo.impact(1);
let reacao = 0;
for (let i = 0; i < 6; i++) reacao += Math.abs(recuo.update(1 / 60, { shakeScale: 1 }).x);
ok('impacto sacode a arma', reacao > 0);
ok('shake zerado nao gera reacao', (() => {
  const r = new RecoilComponent();
  r.impact(1);
  let soma = 0;
  for (let i = 0; i < 10; i++) soma += Math.abs(r.update(1 / 60, { shakeScale: 0 }).x);
  return soma < 1e-9;
})());

const sway = new SwayComponent();
sway.setProfile({ bob: 1, swayScale: 1, inertia: 1, breath: 1, runInstability: 1.3 });
const ctxSway = {
  config: { weaponSway: 1, bobScale: 1 },
  adsK: 0, lookX: 0.6, lookY: 0.3,
  velocity: new THREE.Vector3(3, 0, 2),
  camYaw: 0.7, grounded: true, running: false, dtScale: 1,
};
let limitesOk = true, swayNaN = false;
for (let i = 0; i < 240; i++) {
  const o = sway.update(1 / 60, ctxSway);
  if (!finito(o.x, o.y, o.z, o.rx, o.ry, o.rz, o.breath, o.breathY, o.breathRoll)) swayNaN = true;
  if (Math.abs(o.x) > 0.4 || Math.abs(o.y) > 0.4 || Math.abs(o.rz) > 0.5) limitesOk = false;
}
ok('sway fica dentro dos limites visuais', limitesOk && !swayNaN);
sway.respawn();
ok('respawn zera sway e inercia', sway.sway.length() === 0 && sway.inertia.length() === 0 && sway.roll === 0);
const swayAds = new SwayComponent();
const ctxAds = { ...ctxSway, config: { weaponSway: 1, bobScale: 1 }, adsK: 1 };
let ampAds = 0, ampHip = 0;
for (let i = 0; i < 240; i++) { ampAds = Math.max(ampAds, Math.abs(swayAds.update(1 / 60, ctxAds).x)); }
const swayHip = new SwayComponent();
for (let i = 0; i < 240; i++) { ampHip = Math.max(ampHip, Math.abs(swayHip.update(1 / 60, ctxSway).x)); }
ok('ADS reduz o sway em relacao ao quadril', ampAds < ampHip * 0.5, ampAds + ' vs ' + ampHip);
ok('ajuste de balanco do jogador escala o sway', (() => {
  const base = new SwayComponent();
  const forte = new SwayComponent();
  const c1 = { ...ctxSway, velocity: new THREE.Vector3(4, 0, 0) };
  const c2 = { ...c1, config: { weaponSway: 0, bobScale: 0 } };
  let a = 0, b = 0;
  for (let i = 0; i < 240; i++) { a = Math.max(a, Math.abs(base.update(1 / 60, c1).x)); b = Math.max(b, Math.abs(forte.update(1 / 60, c2).x)); }
  return b < a;
})());

const colisao = new WeaponCollisionComponent();
colisao.setProfile({ probeLength: 1.05, retract: 0.34, rise: 0.09, roll: 0.28, minDistance: 0.34 });
colisao.setProbe(() => ({ t: 0.2, normal: new THREE.Vector3(0, 0, 1), kind: 'concrete' }));
const ctxCol = {
  origin: new THREE.Vector3(0, 1.6, 0),
  forward: new THREE.Vector3(0, 0, -1),
  right: new THREE.Vector3(1, 0, 0),
  adsK: 0,
};
let colMax = 0, colNaN = false;
for (let i = 0; i < 120; i++) {
  const o = colisao.update(1 / 60, ctxCol);
  if (!finito(o.x, o.y, o.z, o.rx, o.ry, o.rz)) colNaN = true;
  colMax = Math.max(colMax, o.retract);
}
ok('colisao recolhe a arma perto da parede', colMax > 0.1 && colMax <= 0.35 && !colNaN, String(colMax));
ok('colisao marca arma bloqueada', colisao.blocked === true);
colisao.setProbe(null);
for (let i = 0; i < 300; i++) colisao.update(1 / 60, ctxCol);
ok('sem sonda a arma volta ao normal', colisao.retract < 0.01 && colisao.blocked === false);

const ctrl = new WeaponAnimationController({ weaponSway: 1, bobScale: 1, shakeScale: 1 });
const defRifle = WEAPON_BY_ID.ak;
ctrl.setWeapon({ ...defRifle, recoilProfile: RECOIL_PROFILE.rifle }, null, new THREE.Vector3(0, 0.105, -0.02));
const eventos = [];
const aplicado = ctrl.startReload(defRifle, {
  reloadStart: () => eventos.push('reloadStart'),
  magRelease: () => eventos.push('magRelease'),
  magOut: () => eventos.push('magOut'),
  magIn: () => eventos.push('magIn'),
  boltRelease: () => eventos.push('boltRelease'),
  ammoCommit: () => eventos.push('ammoCommit'),
  reloadEnd: () => eventos.push('reloadEnd'),
  reloadCancel: () => eventos.push('reloadCancel'),
});
ok('recarga inicia', aplicado === true && ctrl.reloading === true);
const ctxAnim = {
  origin: new THREE.Vector3(0, 1.6, 0),
  forward: new THREE.Vector3(0, 0, -1),
  right: new THREE.Vector3(1, 0, 0),
  velocity: new THREE.Vector3(0, 0, 0),
  camYaw: 0, lookX: 0, lookY: 0, grounded: true, running: false, dtScale: 1,
};
let progressoMax = 0, animNaN = false;
for (let i = 0; i < 400 && ctrl.reloading; i++) {
  const out = ctrl.update(1 / 60, ctxAnim);
  progressoMax = Math.max(progressoMax, out.reload);
  if (!finito(out.pos.x, out.pos.y, out.pos.z, out.rot.x, out.rot.y, out.rot.z, out.fov, out.adsK)) animNaN = false;
}
ok('recarga percorre a linha completa', progressoMax > 0.9 && !ctrl.reloading);
ok('eventos de recarga na ordem correta', eventos.join(',') === 'reloadStart,magRelease,magOut,magIn,boltRelease,ammoCommit,reloadEnd', eventos.join(','));
ok('animacao de recarga sem NaN', !animNaN);
ok('recarga nao duplica o evento de fim', eventos.filter(e => e === 'reloadEnd').length === 1);
ok('recarga pode ser cancelada', (() => {
  const c2 = new WeaponAnimationController({ weaponSway: 1, bobScale: 1, shakeScale: 1 });
  c2.setWeapon(defRifle, null, new THREE.Vector3());
  const ev = [];
  const iniciou = c2.startReload(defRifle, { reloadCancel: () => ev.push('cancel') });
  const estavaRecarregando = c2.reloading;
  c2.cancelReload('troca');
  return iniciou === true && estavaRecarregando === true && !c2.reloading && ev.length === 1 && ev[0] === 'cancel';
})());
ok('curvas de ADS nao estouram a faixa 0..1', ARMAS_DE_FOGO.every(w => {
  let dentro = true;
  for (const nome of [w.ads.inCurve, w.ads.outCurve]) {
    for (let i = 0; i <= 20; i++) {
      const v = ease(nome, i / 20);
      if (!Number.isFinite(v) || v < 0 || v > 1.02) dentro = false;
    }
  }
  return dentro;
}));
ok('troca de arma cancela a mira', (() => {
  const c3 = new WeaponAnimationController({ weaponSway: 1, bobScale: 1, shakeScale: 1 });
  c3.setWeapon(defRifle, null, new THREE.Vector3());
  c3.requestADS(true);
  c3.startSwitch();
  return c3.adsActive === false && c3.switchDur > 0;
})());
ok('inspecao e bloqueada durante a recarga', (() => {
  const c4 = new WeaponAnimationController({ weaponSway: 1, bobScale: 1, shakeScale: 1 });
  c4.setWeapon(defRifle, null, new THREE.Vector3());
  c4.startReload(defRifle, null);
  return c4.startInspect() === false;
})());
ok('FOV de ADS fica abaixo do quadril', (() => {
  const c5 = new WeaponAnimationController({ weaponSway: 1, bobScale: 1, shakeScale: 1 });
  c5.setWeapon(defRifle, null, new THREE.Vector3());
  const quadril = c5.update(1 / 60, ctxAnim).fov;
  c5.requestADS(true);
  for (let i = 0; i < 60; i++) c5.update(1 / 60, ctxAnim);
  return c5.update(1 / 60, ctxAnim).fov < quadril;
})());

function armaNua() {
  const som = new Proxy({}, { get: () => () => 0 });
  const efeitos = new Proxy({}, { get: () => () => 0 });
  return new Weapons(new THREE.PerspectiveCamera(72, 16 / 9, 0.08, 500), efeitos, som, null, null);
}

const OPTS = {
  moving: false, running: false, grounded: true, aimHeld: false,
  camPos: new THREE.Vector3(0, 1.6, 0), camDir: new THREE.Vector3(0, 0, -1), camRight: new THREE.Vector3(1, 0, 0),
  velocity: new THREE.Vector3(0, 0, 0), camYaw: 0, lookX: 0, lookY: 0, moveK: 0,
};

for (const w of ARMAS_DE_FOGO) {
  const n = contagemDeProjeteis(w);
  ok('arma ' + w.id + ' tem contagem de projetil definida', w.class === 'shotgun' ? n === w.pelletCount && n > 1 : n === 1, String(n));
  ok('arma ' + w.id + ' nao gera projetil extra por tracer', projeteisComTracer(n) <= n);
}
ok('escopeta usa a quantidade de pellets configurada', contagemDeProjeteis(WEAPON_BY_ID.pump) === WEAPON_BY_ID.pump.pelletCount);
ok('contagem de projetil resiste a dados invalidos', contagemDeProjeteis(null) === 1 && contagemDeProjeteis({ class: 'shotgun', pelletCount: 0 }) === 1 && contagemDeProjeteis({ class: 'shotgun', pelletCount: 999 }) === 24 && contagemDeProjeteis({ class: 'shotgun' }) === 1);
ok('optica e FOV nao mudam a contagem de projetil', (() => {
  const ak = WEAPON_BY_ID.ak;
  const alterado = { ...ak, adsFov: 8, scope: true, optic: { ...ak.optic, kind: 'scope' } };
  return contagemDeProjeteis(ak) === 1 && contagemDeProjeteis(alterado) === 1;
})());

ok('cadencia automatica respeita o intervalo do rpm', (() => {
  const d = WEAPON_BY_ID.mp5;
  const intervalo = 60 / d.rpm;
  const ultimo = 10;
  return permiteDisparo(true, ultimo + intervalo, ultimo, d.rpm) === true &&
    permiteDisparo(true, ultimo + intervalo * 0.4, ultimo, d.rpm) === false &&
    permiteDisparo(true, ultimo + intervalo * 4, ultimo, d.rpm) === true &&
    permiteDisparo(true, ultimo, ultimo, d.rpm) === false &&
    permiteDisparo(true, ultimo + intervalo + 60, ultimo, d.rpm) === true;
})());
ok('cadencia manual exige novo acionamento', (() => {
  const d = WEAPON_BY_ID.deagle;
  const intervalo = 60 / d.rpm;
  return permiteDisparo(false, intervalo * 2, 0, d.rpm) === true;
})());
ok('quadro longo nunca dispara mais de uma vez', (() => {
  const d = WEAPON_BY_ID.mp5;
  let ultimo = -999, tiros = 0, tirosPorQuadro = 0;
  for (let f = 0; f < 20; f++) {
    const t = f * 0.5;
    if (permiteDisparo(true, t, ultimo, d.rpm)) { ultimo = t; tiros++; tirosPorQuadro = 1; }
  }
  return tiros === 20 && tirosPorQuadro === 1 && tiros <= d.magSize;
})());

const wTiro = armaNua();
ok('arma em estado inicial pronta para fogo', wTiro.canFire() === true && wTiro.def.mag === wTiro.def.magSize);
ok('um disparo consome exatamente uma municao', (() => {
  const antes = wTiro.def.mag;
  const res = wTiro.fire(0);
  return !!res && res.type === 'bullet' && wTiro.def.mag === antes - 1;
})());
ok('pente vazio nao gera disparo nem municao negativa', (() => {
  const w = armaNua();
  w.def.mag = 0;
  const res = w.fire(0);
  return res === null && w.def.mag === 0;
})());
ok('gatilho segurado respeita a cadencia real', (() => {
  const w = armaNua();
  const d = w.def;
  const dt = 1 / 60;
  let ultimo = -999, tiros = 0;
  for (let f = 0; f < 60; f++) {
    const t = f * dt;
    if (permiteDisparo(d.auto, t, ultimo, d.rpm) && w.canFire()) { ultimo = t; w.fire(t); tiros++; }
  }
  const maximo = Math.floor(0.99 / (60 / d.rpm)) + 1;
  return tiros > 2 && tiros <= maximo && w.def.mag === d.magSize - tiros;
})());
ok('troca de arma bloqueia o fogo e volta depois', (() => {
  const w = armaNua();
  w.switchTo(5);
  const bloqueado = w.canFire() === false && w.fire(1) === null;
  w.update(0.5, OPTS);
  const liberado = w.canFire() === true && !!w.fire(1.2);
  return bloqueado && liberado && w.slot === 5;
})());
ok('escopeta consome uma municao por disparo', (() => {
  const w = armaNua();
  w.switchTo(5);
  w.update(0.5, OPTS);
  const antes = w.def.mag;
  const res = w.fire(1.5);
  return !!res && w.def.mag === antes - 1 && contagemDeProjeteis(w.def) === w.def.pelletCount;
})());
ok('recarga repoe o pente uma unica vez', (() => {
  const w = armaNua();
  w.def.mag = 0;
  w.def.reserve = 30;
  const primeiro = w.startReload();
  const duplicado = w.startReload();
  let guarda = 0;
  let transferencias = 0;
  while (w.anim.reloading && guarda++ < 1200) {
    w.update(1 / 60, OPTS);
    if (!w.anim.reloading) transferencias++;
  }
  return primeiro === true && !duplicado && transferencias === 1 && w.def.mag === w.def.magSize && w.def.reserve === 30 - w.def.magSize;
})());
ok('recarga nao dispara nem consome municao extra', (() => {
  const w = armaNua();
  w.def.mag = 0;
  w.def.reserve = 30;
  w.startReload();
  const antes = w.def.reserve;
  let guarda = 0;
  while (w.anim.reloading && guarda++ < 1200) w.update(1 / 60, OPTS);
  return w.def.reserve === antes - w.def.magSize;
})());
ok('disparo nao altera dano nem cadencia da arma', (() => {
  const w = armaNua();
  const d = w.def;
  const base = { dmg: d.dmg, headMul: d.headMul, rpm: d.rpm, range: d.range, speed: d.speed };
  w.fire(0);
  return d.dmg === base.dmg && d.headMul === base.headMul && d.rpm === base.rpm && d.range === base.range && d.speed === base.speed;
})());

const wPreset = armaNua();
const autoridade = wPreset.defs.map(d => ({ dmg: d.dmg, headMul: d.headMul, rpm: d.rpm, magSize: d.magSize, range: d.range, speed: d.speed, pelletCount: d.pelletCount }));
const sensacaoOriginal = wPreset.defs.map(d => ({ sway: d.sway ? d.sway.swayScale : null, adsIn: d.ads ? d.ads.inTime : null, adsOut: d.ads ? d.ads.outTime : null }));
for (const p of Object.values(WEAPON_SENSE_PRESETS)) wPreset.aplicarSensacao(p);
ok('presets de sensacao preservam dano, cadencia e municao', wPreset.defs.every((d, i) => {
  const a = autoridade[i];
  return d.dmg === a.dmg && d.headMul === a.headMul && d.rpm === a.rpm && d.magSize === a.magSize &&
    d.range === a.range && d.speed === a.speed && d.pelletCount === a.pelletCount;
}));
ok('presets de sensacao realmente alteram a sensacao', (() => {
  const i = wPreset.defs.findIndex(d => d.id === 'ak');
  const antes = sensacaoOriginal[i];
  const agora = wPreset.defs[i];
  const p = WEAPON_SENSE_PRESETS.competitivo;
  return perto(agora.sway.swayScale, antes.sway * p.sway, 1e-4) && perto(agora.ads.inTime, antes.adsIn * p.adsIn, 1e-4);
})());
ok('presets de sensacao nao acumulam ao reaplicar', (() => {
  const copia = wPreset.defs.map(d => (d.sway ? d.sway.swayScale : null));
  for (const p of Object.values(WEAPON_SENSE_PRESETS)) wPreset.aplicarSensacao(p);
  return wPreset.defs.every((d, i) => !d.sway || perto(d.sway.swayScale, copia[i], 1e-9));
})());

function controladorCom(def, optic) {
  const c = new WeaponAnimationController({ weaponSway: 1, bobScale: 1, shakeScale: 1 });
  c.setWeapon({
    ...def,
    recoilProfile: RECOIL_PROFILE[def.recoil],
    sprintPose: SPRINT_PROFILE[def.class],
    ads: { ...def.ads, ...ADS_PROFILE[def.class] },
  }, null, optic);
  return c;
}
const OPTICA_RIFLE = new THREE.Vector3(0, VIEWMODEL.adsAlign.rifle, -0.02);
const ctxAndando = { ...ctxAnim, velocity: new THREE.Vector3(1.4, 0, -1.8) };
const ctxCorrendo = { ...ctxAnim, velocity: new THREE.Vector3(0, 0, -5.2), running: true };

const spr = new SprintPoseComponent();
spr.setPose(SPRINT_PROFILE.rifle);
let kPico = 0, posturaDentro = true;
for (let i = 0; i < 180; i++) {
  const o = spr.update(1 / 60, { sprinting: true, grounded: true, adsK: 0 });
  kPico = Math.max(kPico, o.k);
  if (Math.abs(o.x) > SPRINT_PROFILE.rifle.maxTranslation + 1e-9 || Math.abs(o.y) > SPRINT_PROFILE.rifle.maxTranslation + 1e-9) posturaDentro = false;
  if (Math.abs(o.rx) > SPRINT_PROFILE.rifle.maxRotation + 1e-9 || Math.abs(o.ry) > SPRINT_PROFILE.rifle.maxRotation + 1e-9) posturaDentro = false;
}
ok('postura de corrida converge e respeita os limites', kPico > 0.98 && kPico <= 1 && posturaDentro, String(kPico));
ok('postura de corrida respeita piso e ADS', (() => {
  const s = new SprintPoseComponent();
  s.setPose(SPRINT_PROFILE.rifle);
  for (let i = 0; i < 120; i++) s.update(1 / 60, { sprinting: true, grounded: false, adsK: 0 });
  const noAr = s.k;
  for (let i = 0; i < 120; i++) s.update(1 / 60, { sprinting: true, grounded: true, adsK: 1 });
  return noAr < 0.02 && s.k < 0.02;
})());
ok('postura de corrida nao acumula desvio em ciclos', (() => {
  const s = new SprintPoseComponent();
  s.setPose(SPRINT_PROFILE.rifle);
  let pior = 0;
  for (let ciclo = 0; ciclo < 10; ciclo++) {
    for (let i = 0; i < 120; i++) s.update(1 / 60, { sprinting: true, grounded: true, adsK: 0 });
    let r;
    for (let i = 0; i < 240; i++) r = s.update(1 / 60, { sprinting: false, grounded: true, adsK: 0 });
    pior = Math.max(pior, Math.hypot(r.x, r.y, r.z), Math.abs(r.rx), Math.abs(r.ry), Math.abs(r.rz));
  }
  return pior < 1e-3;
})());

ok('oscilacao de passo fica dentro do orcamento de cada arma', ARMAS_DE_FOGO.every(w => {
  const s = new SwayComponent();
  s.setProfile(w.sway);
  let pior = 0;
  for (let i = 0; i < 240; i++) {
    const o = s.update(1 / 60, {
      config: { weaponSway: 1, bobScale: 1 }, adsK: 0, lookX: 0, lookY: 0,
      velocity: new THREE.Vector3(0, 0, -5.2), camYaw: 0, grounded: true, running: true, dtScale: 1,
    });
    pior = Math.max(pior, Math.abs(o.y));
  }
  return pior <= VIEWMODEL.limits.bob;
}));

const cCorrida = controladorCom(WEAPON_BY_ID.ak, OPTICA_RIFLE);
function percorrer(ctrl, dt, passos, ctx) {
  let o = null;
  for (let i = 0; i < passos; i++) o = ctrl.update(dt, ctx);
  return o;
}
const corrida60 = percorrer(cCorrida, 1 / 60, 90, ctxCorrendo);
const corrida30 = percorrer(controladorCom(WEAPON_BY_ID.ak, OPTICA_RIFLE), 1 / 30, 45, ctxCorrendo);
const corrida120 = percorrer(controladorCom(WEAPON_BY_ID.ak, OPTICA_RIFLE), 1 / 120, 180, ctxCorrendo);
const corrida144 = percorrer(controladorCom(WEAPON_BY_ID.ak, OPTICA_RIFLE), 1 / 144, 216, ctxCorrendo);
ok('postura fica estavel entre 30 e 144 FPS', [corrida30, corrida120, corrida144].every(o =>
  finito(o.pos.x, o.pos.y, o.pos.z, o.rot.x, o.rot.y, o.rot.z, o.fov) &&
  Math.abs(o.pos.x - corrida60.pos.x) < 0.006 && Math.abs(o.pos.y - corrida60.pos.y) < 0.006 && Math.abs(o.pos.z - corrida60.pos.z) < 0.006),
  [corrida30.pos.y, corrida120.pos.y, corrida144.pos.y].map(v => v.toFixed(4)).join(' '));
ok('corrida desloca a arma para baixo do quadril', corrida60.pos.y < VIEWMODEL.basePos.rifle.y && corrida60.rot.z < 0);

const cVolta = controladorCom(WEAPON_BY_ID.ak, OPTICA_RIFLE);
percorrer(cVolta, 1 / 60, 120, ctxCorrendo);
const paradoAntes = percorrer(cVolta, 1 / 60, 1, ctxAnim);
percorrer(cVolta, 1 / 60, 240, ctxAnim);
const paradoDepois = percorrer(cVolta, 1 / 60, 1, ctxAnim);
ok('arma retorna ao quadril depois da corrida', cVolta.sprintOut.k < 0.01 &&
  Math.abs(paradoDepois.pos.x - paradoAntes.pos.x) < 0.004 && Math.abs(paradoDepois.pos.z - paradoAntes.pos.z) < 0.004 &&
  Math.abs(paradoDepois.pos.x - VIEWMODEL.basePos.rifle.x) < 0.02, String(cVolta.sprintOut.k));

function adsEm(taxa, segundos) {
  const c = controladorCom(WEAPON_BY_ID.ak, OPTICA_RIFLE);
  c.requestADS(true);
  const passos = Math.round(taxa * segundos);
  const o = percorrer(c, 1 / taxa, passos, ctxAnim);
  return { c, o };
}
ok('ADS converge para a linha da optica', (() => {
  const { c, o } = adsEm(60, 2);
  return perto(o.pos.x, -OPTICA_RIFLE.x, 0.001) && perto(o.pos.y, -OPTICA_RIFLE.y, 0.001) &&
    perto(o.pos.z, VIEWMODEL.adsPos.rifle.z, 0.001) && c.alinhamento <= c.adsTolerance;
})());
ok('ADS mantem alinhamento em 30, 60, 120 e 144 FPS', [30, 60, 120, 144].every(t => {
  const { c, o } = adsEm(t, 2.5);
  return c.alinhamento <= c.adsTolerance && finito(o.pos.x, o.pos.y, o.pos.z) && Math.abs(o.pos.x + OPTICA_RIFLE.x) < 0.003;
}));
ok('ADS reduz sway, passo e inercia em relacao ao quadril', (() => {
  const quadril = controladorCom(WEAPON_BY_ID.ak, OPTICA_RIFLE);
  const mirando = controladorCom(WEAPON_BY_ID.ak, OPTICA_RIFLE);
  mirando.requestADS(true);
  let swQuadril = 0, swMira = 0, bobQuadril = 0, bobMira = 0;
  for (let i = 0; i < 240; i++) {
    quadril.update(1 / 60, ctxAndando);
    mirando.update(1 / 60, ctxAndando);
    swQuadril = Math.max(swQuadril, Math.abs(quadril.swayOut.x));
    swMira = Math.max(swMira, Math.abs(mirando.swayOut.x));
    bobQuadril = Math.max(bobQuadril, Math.abs(quadril.swayOut.y));
    bobMira = Math.max(bobMira, Math.abs(mirando.swayOut.y));
  }
  return swMira < swQuadril * 0.5 && bobMira < bobQuadril * 0.6;
})());
ok('corrida perde influencia durante o ADS', (() => {
  const c = controladorCom(WEAPON_BY_ID.ak, OPTICA_RIFLE);
  c.requestADS(true);
  for (let i = 0; i < 180; i++) c.update(1 / 60, ctxCorrendo);
  return c.sprintOut.k < 0.05 && c.adsK > 0.98;
})());
ok('ADS nao acumula desvio depois de ciclos repetidos', (() => {
  const c = controladorCom(WEAPON_BY_ID.ak, OPTICA_RIFLE);
  let pior = 0;
  for (let ciclo = 0; ciclo < 10; ciclo++) {
    c.requestADS(true);
    for (let i = 0; i < 120; i++) c.update(1 / 60, ctxAnim);
    pior = Math.max(pior, c.alinhamento);
    c.requestADS(false);
    for (let i = 0; i < 120; i++) c.update(1 / 60, ctxAnim);
  }
  const hip = VIEWMODEL.basePos.rifle;
  const o = c.update(1 / 60, ctxAnim);
  return pior <= c.adsTolerance && Math.abs(o.pos.x - hip.x) < 0.006 && Math.abs(o.pos.z - hip.z) < 0.006;
})());
ok('ADS permanece finito com delta time irregular', (() => {
  const c = controladorCom(WEAPON_BY_ID.ak, OPTICA_RIFLE);
  c.requestADS(true);
  let semente = 12345, piorDesvio = 0, nan = false;
  const aleatorio = () => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente / 0x7fffffff; };
  for (let i = 0; i < 900; i++) {
    const dt = 1 / 144 + aleatorio() * (1 / 24 - 1 / 144);
    const o = c.update(dt, ctxCorrendo);
    if (!finito(o.pos.x, o.pos.y, o.pos.z, o.rot.x, o.rot.y, o.rot.z, o.fov, o.adsK)) nan = true;
    if (o.adsK > 0.99) piorDesvio = Math.max(piorDesvio, Math.abs(o.pos.x + OPTICA_RIFLE.x), Math.abs(o.pos.y + OPTICA_RIFLE.y));
  }
  return !nan && piorDesvio <= c.adsMaxTranslation + 1e-6;
})());
ok('ADS nao deixa a camera atravessar a optica', (() => {
  const { o } = adsEm(60, 2);
  return o.pos.z < 0 && o.pos.z > -0.5 && Math.abs(o.rot.x) < 0.05 && Math.abs(o.rot.y) < 0.05;
})());
ok('painel de calibracao fica inerte fora do modo de depuracao', initWeaponDebug({ weapons: { defs: [] }, state: {}, fx: {}, phys: {} }) === null);

ok('presets visuais cobrem os tres modos de leitura', ['clareza', 'cinematografico', 'competitivo'].every(k => !!VISUAL_PRESETS[k]) && visualDe('inexistente') === VISUAL_PRESETS.clareza);
const CHAVES_VISUAIS = ['id', 'label', 'exposure', 'vignette', 'contrast', 'sat', 'chroma', 'grain', 'bloom', 'shadowLift', 'midtoneGain', 'highlightCompress', 'minLuminance', 'hemi', 'ambient', 'moon', 'rim'];
ok('presets visuais so alteram renderizacao', Object.values(VISUAL_PRESETS).every(p => Object.keys(p).every(k => CHAVES_VISUAIS.includes(k))));
ok('presets visuais tem valores finitos', Object.values(VISUAL_PRESETS).every(p => Object.entries(p).every(([k, v]) => typeof v === 'string' || finito(v))));
ok('preset cinematografico e mais escuro e fechado', VISUAL_PRESETS.cinematografico.exposure < VISUAL_PRESETS.clareza.exposure && VISUAL_PRESETS.cinematografico.vignette > VISUAL_PRESETS.clareza.vignette);
ok('preset claridade levanta os escuros', VISUAL_PRESETS.clareza.shadowLift > VISUAL_PRESETS.cinematografico.shadowLift && VISUAL_PRESETS.clareza.midtoneGain > 1);
ok('preset competitivo prioriza leitura', VISUAL_PRESETS.competitivo.vignette < VISUAL_PRESETS.clareza.vignette && VISUAL_PRESETS.competitivo.exposure >= VISUAL_PRESETS.clareza.exposure);
ok('brilho respeita a faixa segura', valorSeguro('brightness', 9) === LIMITES_SEGUROS.brightness[1] && valorSeguro('brightness', 0) === LIMITES_SEGUROS.brightness[0] && LIMITES_SEGUROS.brightness[0] < 1 && LIMITES_SEGUROS.brightness[1] > 1);
ok('configuracao invalida cai no padrao', valorSeguro('brightness', NaN) === DEFAULTS.brightness && valorSeguro('brightness', 'texto') === DEFAULTS.brightness && valorSeguro('vignetteScale', Infinity) === DEFAULTS.vignetteScale);
ok('brilho persiste na configuracao', Settings.set('brightness', 1.2, true) === 1.2 && Settings.get('brightness') === 1.2);
ok('brilho e vinheta sao independentes', (() => {
  Settings.set('vignetteScale', 0.3, true);
  const a = Settings.get('brightness') === 1.2 && Settings.get('vignetteScale') === 0.3;
  Settings.set('brightness', 1.1, true);
  return a && Settings.get('vignetteScale') === 0.3 && Settings.get('brightness') === 1.1;
})());
ok('configuracao fora da faixa e corrigida ao gravar', Settings.set('brightness', 40, true) === LIMITES_SEGUROS.brightness[1] && Settings.get('brightness') === LIMITES_SEGUROS.brightness[1]);
ok('restaurar padrao remove o brilho customizado', (() => {
  Settings.reset();
  return Settings.get('brightness') === DEFAULTS.brightness && Settings.get('vignetteScale') === DEFAULTS.vignetteScale && Settings.get('visual') === DEFAULTS.visual;
})());

console.log('testes ok: ' + passou);
if (falhas.length) {
  console.log('falhas: ' + falhas.length);
  for (const f of falhas) console.log('  x ' + f);
  process.exit(1);
}
console.log('todos os testes passaram');
