import * as THREE from '../vendor/three.module.js';
import { WEAPONS, WEAPON_BY_ID, RECOIL_PROFILE, VIEWMODEL, EASING, ease, OPTIC_DEFAULTS, LASER_DEFAULTS } from '../src/config/weapon-data.js';
import { SURFACES, surfaceOf, DECAL_LIMITS } from '../src/config/surfaces.js';
import { GRAPHICS_PRESETS, DEFAULTS, Settings } from '../src/config/settings.js';
import { AimDownSightsComponent, SwayComponent, RecoilComponent, WeaponCollisionComponent, clampN, damp } from '../src/weapon/layers.js';
import { WeaponAnimationController } from '../src/weapon/anim-controller.js';

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

console.log('testes ok: ' + passou);
if (falhas.length) {
  console.log('falhas: ' + falhas.length);
  for (const f of falhas) console.log('  x ' + f);
  process.exit(1);
}
console.log('todos os testes passaram');
