import * as THREE from '../../vendor/three.module.js';
import { VIEWMODEL } from '../config/weapon-data.js';

const ESTILO = `
#wd-p { position:fixed; top:8px; right:8px; width:330px; max-height:96vh; overflow-y:auto; overscroll-behavior:contain;
  z-index:400; background:rgba(8,11,16,0.92); border:1px solid #2b3a4d; border-radius:6px; color:#c8d6e5;
  font:11px/1.45 ui-monospace,Consolas,monospace; padding:8px 10px 12px; box-shadow:0 8px 28px rgba(0,0,0,0.6); display:none; }
#wd-p.on { display:block; }
#wd-p h4 { margin:0; font-size:11px; letter-spacing:2px; color:#8fd0ff; font-weight:600; }
#wd-p .wd-sub { color:#5f7385; font-size:10px; letter-spacing:1px; margin:2px 0 8px; }
#wd-p .wd-l { display:grid; grid-template-columns:1fr auto; gap:1px 8px; padding:4px 0 8px; border-bottom:1px solid #1d2837; }
#wd-p .wd-l span { color:#7b8ea1; }
#wd-p .wd-l b { color:#e6eef7; font-weight:500; text-align:right; white-space:nowrap; }
#wd-p details { border-top:1px solid #1d2837; padding:3px 0; }
#wd-p summary { cursor:pointer; color:#8fd0ff; letter-spacing:1.4px; font-size:10px; padding:3px 0; outline:none; }
#wd-p label { display:grid; grid-template-columns:92px 1fr 46px; align-items:center; gap:6px; padding:1px 0; color:#9fb3c6; }
#wd-p input[type=range] { width:100%; height:14px; margin:0; }
#wd-p label i { color:#e6eef7; font-style:normal; text-align:right; }
#wd-p .wd-b { display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-top:8px; }
#wd-p button { background:#16202c; color:#c8d6e5; border:1px solid #2b3a4d; border-radius:3px; padding:4px 5px;
  font:10px ui-monospace,monospace; letter-spacing:0.6px; cursor:pointer; }
#wd-p button:hover { background:#1e2c3b; }
#wd-p button.on { background:#1d3a2c; border-color:#3f7a5c; color:#8bf0b4; }
#wd-p textarea { width:100%; height:78px; margin-top:6px; background:#0b1118; color:#9fb3c6;
  border:1px solid #2b3a4d; border-radius:3px; font:10px ui-monospace,monospace; resize:vertical; }
#wd-p .wd-nota { color:#8bf0b4; min-height:13px; font-size:10px; letter-spacing:0.5px; }
#wd-p .wd-perigo { color:#ff7b6a; }
`;

const MODELOS = ['rifle', 'pistol', 'sniper', 'smg', 'shotgun', 'grenade'];
const CORES = {
  eixo: 0x39e0ff, camera: 0x54ff6a, disparo: 0xff4a3d, sonda: 0xffb020,
  sondaBloqueada: 0xff2040, impacto: 0xff35d0,
};
const SEGMENTOS = 14;

const LEITURAS = [
  ['arma', 'ARMA'], ['classe', 'CLASSE'], ['estado', 'ESTADO'],
  ['fovArma', 'FOV ARMA ATUAL'], ['fovArmaAlvo', 'FOV ARMA ALVO'],
  ['fovCam', 'FOV CÂMERA ATUAL'], ['fovCamAlvo', 'FOV CÂMERA ALVO'],
  ['ads', 'PROGRESSO ADS'], ['alinhamento', 'ALINHAMENTO ÓPTICA'], ['tolerancia', 'TOLERÂNCIA DE ADS'],
  ['retract', 'RECOLHIMENTO (PAREDE)'], ['distancia', 'SONDA · DISTÂNCIA'], ['bloqueado', 'ESTADO DE BLOQUEIO'],
  ['inercia', 'INÉRCIA H / V'], ['sway', 'SWAY H / V'], ['respiracao', 'RESPIRAÇÃO (Y / INCLINAÇÃO)'],
  ['postura', 'POSTURA DE CORRIDA'], ['recuoArma', 'RECUO DA ARMA'], ['recuoCamera', 'RECUO DA CÂMERA'],
  ['disparo', 'TEMPO DESDE O DISPARO'], ['projeteis', 'PROJÉTEIS POR DISPARO'],
  ['dt', 'DELTA TIME ATUAL'], ['fps', 'FPS MÉDIO'], ['particulas', 'PARTÍCULAS ATIVAS'], ['decais', 'DECALS ATIVOS'],
];

function r4(v) {
  return Math.round(v * 10000) / 10000;
}

function clone(v) {
  return { ...v };
}

export function initWeaponDebug(ctx) {
  if (typeof location === 'undefined') return null;
  if (new URLSearchParams(location.search).get('weaponDebug') !== '1') return null;

  const { weapons, state, fx, phys, camera, scene, contagemDeProjeteis } = ctx;
  const anim = weapons.anim;

  if (!VIEWMODEL.baseRot) VIEWMODEL.baseRot = {};
  for (const m of MODELOS) if (!VIEWMODEL.baseRot[m]) VIEWMODEL.baseRot[m] = { x: 0, y: 0, z: 0 };

  const modelo = () => (weapons.def && weapons.def.model) || 'rifle';
  const hipDe = (m) => VIEWMODEL.basePos[m] || VIEWMODEL.basePos.rifle;
  const rotDe = (m) => VIEWMODEL.baseRot[m] || VIEWMODEL.baseRot.rifle;
  const adsDe = (m) => {
    if (!VIEWMODEL.adsPos[m]) VIEWMODEL.adsPos[m] = { x: 0, y: -0.1, z: -0.25 };
    return VIEWMODEL.adsPos[m];
  };
  const opticaDe = (m) => weapons.OPTICS[m] || weapons.OPTICS.rifle;

  const bkp = {
    hipFov: VIEWMODEL.hipFov,
    hip: {}, rot: {}, ads: {}, opt: {},
    defs: weapons.defs.map((d) => ({
      sway: d.sway ? clone(d.sway) : null,
      ads: d.ads ? clone(d.ads) : null,
      recolhimento: d.recoilProfile ? clone(d.recoilProfile) : null,
      postura: d.sprintPose ? clone(d.sprintPose) : null,
      colisao: d.collision ? clone(d.collision) : null,
      adsFov: d.adsFov,
    })),
  };
  for (const m of MODELOS) {
    if (VIEWMODEL.basePos[m]) bkp.hip[m] = clone(VIEWMODEL.basePos[m]);
    if (VIEWMODEL.baseRot[m]) bkp.rot[m] = clone(VIEWMODEL.baseRot[m]);
    if (VIEWMODEL.adsPos[m]) bkp.ads[m] = clone(VIEWMODEL.adsPos[m]);
    if (weapons.OPTICS[m]) bkp.opt[m] = { x: weapons.OPTICS[m].x, y: weapons.OPTICS[m].y, z: weapons.OPTICS[m].z };
  }

  const leitura = { fovAlvo: 0, recuo: { pitch: 0, yaw: 0 } };
  const forcar = { caminhada: false, corrida: false };
  const giz = { eixo: false, camera: false, disparo: false, sonda: false, impacto: false };
  const disparo = { origem: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), t: -99 };

  const estilo = document.createElement('style');
  estilo.textContent = ESTILO;
  document.head.appendChild(estilo);

  const painel = document.createElement('div');
  painel.id = 'wd-p';
  painel.addEventListener('keydown', (e) => e.stopPropagation());
  painel.addEventListener('keyup', (e) => e.stopPropagation());
  painel.addEventListener('keypress', (e) => e.stopPropagation());
  painel.innerHTML = `
    <h4>CALIBRAÇÃO DE ARMA</h4>
    <div class="wd-sub">?weaponDebug=1 · temporário · nada é gravado em arquivo · ESC libera o cursor</div>
    <div class="wd-l">${LEITURAS.map(([k, t]) => `<span>${t}</span><b id="wd-r-${k}">—</b>`).join('')}</div>
    <div id="wd-c"></div>
    <div class="wd-b" id="wd-b"></div>
    <textarea id="wd-j" spellcheck="false" placeholder="JSON da configuração atual aparece aqui"></textarea>
    <details><summary>CHECKLIST MANUAL (14 PASSOS)</summary>
      <div class="wd-l" style="grid-template-columns:1fr">
        <span>1 alinhamento · 2 hip fire · 3 entrada/saída de ADS · 4 sway e respiração · 5 inércia · 6 colisão com paredes · 7 recuo da arma · 8 recuo da câmera · 9 recuperação após o disparo · 10 flash e iluminação · 11 clareza da mira · 12 laser · 13 áudio · 14 diferenças entre classes</span>
        <span>No jogo: mirar em parede branca, parede escura, espelho d'água, canto, porta, coluna e objeto baixo. Anotar o que pareceu errado e trazer o JSON do painel.</span>
        <span>Somente o que a automação não consegue medir: peso percebido, conforto do flash, legibilidade do retículo contra superfícies claras e em interiores escuros.</span>
      </div>
    </details>
    <div class="wd-nota" id="wd-n">ativo</div>
  `;
  document.body.appendChild(painel);
  painel.classList.add('on');

  const campo = (k) => painel.querySelector('#wd-r-' + k);
  const campoJson = painel.querySelector('#wd-j');
  const campoNota = painel.querySelector('#wd-n');
  const nota = (txt, erro) => {
    campoNota.textContent = txt;
    campoNota.classList.toggle('wd-perigo', !!erro);
  };

  const COR = new THREE.Color();
  const geoGiz = new THREE.BufferGeometry();
  geoGiz.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEGMENTOS * 6), 3));
  geoGiz.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SEGMENTOS * 6), 3));
  const gizmo = new THREE.LineSegments(geoGiz, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false,
  }));
  gizmo.frustumCulled = false;
  gizmo.renderOrder = 999;
  gizmo.visible = false;
  scene.add(gizmo);

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Vector3();
  const _dir = new THREE.Vector3(), _fim = new THREE.Vector3();

  function desenhar() {
    const ativo = giz.eixo || giz.camera || giz.disparo || giz.sonda || giz.impacto;
    gizmo.visible = ativo;
    if (!ativo) return;
    const pos = geoGiz.attributes.position.array;
    const cor = geoGiz.attributes.color.array;
    let n = 0;
    const seg = (hex, a, b) => {
      if (n >= SEGMENTOS) return;
      COR.setHex(hex);
      pos[n * 6] = a.x; pos[n * 6 + 1] = a.y; pos[n * 6 + 2] = a.z;
      pos[n * 6 + 3] = b.x; pos[n * 6 + 4] = b.y; pos[n * 6 + 5] = b.z;
      for (let i = 0; i < 2; i++) {
        cor[n * 6 + i * 3] = COR.r; cor[n * 6 + i * 3 + 1] = COR.g; cor[n * 6 + i * 3 + 2] = COR.b;
      }
      n++;
    };

    camera.updateMatrixWorld();
    const camPos = camera.position;
    const dir = ctx.getDir();

    if (giz.eixo) {
      const opt = opticaDe(modelo());
      const g = weapons.vmGroup;
      g.updateWorldMatrix(false, false);
      _a.set(opt.x, opt.y, opt.z - 0.5).applyMatrix4(g.matrixWorld).applyMatrix4(camera.matrixWorld);
      _b.set(opt.x, opt.y, opt.z + 0.35).applyMatrix4(g.matrixWorld).applyMatrix4(camera.matrixWorld);
      seg(CORES.eixo, _a, _b);
    }
    if (giz.camera) {
      _a.copy(camPos);
      _b.copy(camPos).addScaledVector(dir, 4);
      seg(CORES.camera, _a, _b);
    }
    if (giz.disparo && disparo.t > -1) {
      _a.copy(disparo.origem).addScaledVector(disparo.dir, 0.4);
      _b.copy(_a).addScaledVector(disparo.dir, 8);
      seg(CORES.disparo, _a, _b);
    }
    if (giz.sonda) {
      const col = anim.collision;
      if (col._from && col._to) {
        seg(col.blocked ? CORES.sondaBloqueada : CORES.sonda, col._from, col._to);
      }
    }
    if (giz.impacto) {
      const alcance = (weapons.def && weapons.def.range) || 120;
      _fim.copy(camPos).addScaledVector(dir, alcance);
      const hit = phys.segmentHit(camPos, _fim);
      if (hit) {
        _m.copy(hit.point);
        const c = 0.12;
        seg(CORES.impacto, _a.set(_m.x - c, _m.y, _m.z), _b.set(_m.x + c, _m.y, _m.z));
        seg(CORES.impacto, _a.set(_m.x, _m.y - c, _m.z), _b.set(_m.x, _m.y + c, _m.z));
        seg(CORES.impacto, _a.set(_m.x, _m.y, _m.z - c), _b.set(_m.x, _m.y, _m.z + c));
      }
    }

    geoGiz.setDrawRange(0, n * 2);
    geoGiz.attributes.position.needsUpdate = true;
    geoGiz.attributes.color.needsUpdate = true;
  }

  function estadoAtual() {
    const o = anim._out;
    if (anim.reloading) return 'RELOADING';
    if (o.blocked) return 'BLOCKED';
    if (state.time - disparo.t < 0.12) return 'FIRING';
    if (o.adsK > 0.5) return 'ADS';
    if (o.running) return 'SPRINTING';
    if (o.walking) return 'WALKING';
    return 'IDLE';
  }

  function lerTudo() {
    const d = weapons.def;
    const m = modelo();
    const o = anim._out;
    const sw = anim.swayOut || { x: 0, y: 0, breath: 0, breathRoll: 0 };
    const rec = anim.recoilOut || { x: 0, y: 0, rx: 0, ry: 0 };
    const col = anim.collision;
    const sp = anim.sprintOut || { k: 0 };
    const r = anim.recoil;
    const fovAlvoArma = (VIEWMODEL.hipFov || 62) - o.adsK * (d.scope ? 22 : 6);

    campo('arma').textContent = d.name;
    campo('classe').textContent = d.class + ' · slot ' + weapons.slot;
    campo('estado').textContent = estadoAtual();
    campo('fovArma').textContent = o.fov.toFixed(2);
    campo('fovArmaAlvo').textContent = fovAlvoArma.toFixed(2);
    campo('fovCam').textContent = camera.fov.toFixed(2);
    campo('fovCamAlvo').textContent = leitura.fovAlvo.toFixed(2);
    campo('ads').textContent = o.adsK.toFixed(3) + (anim.ads.state ? ' · alvo ON' : ' · alvo OFF');
    campo('alinhamento').textContent = anim.alinhamento.toFixed(5)
      + (o.adsK < 0.5 ? ' · hip' : (anim.alinhamento <= anim.adsTolerance ? ' · ok' : ' · fora'));
    campo('tolerancia').textContent = anim.adsTolerance.toFixed(5);
    campo('retract').textContent = col.retract.toFixed(3);
    campo('distancia').textContent = col.distance.toFixed(3) + ' m';
    campo('bloqueado').textContent = col.blocked ? 'SIM' : 'não';
    campo('inercia').textContent = r4(anim.sway.inertia.x) + ' / ' + r4(anim.sway.inertia.y);
    campo('sway').textContent = r4(sw.x) + ' / ' + r4(sw.y);
    campo('respiracao').textContent = r4(sw.breath) + ' / ' + r4(sw.breathRoll);
    campo('postura').textContent = sp.k.toFixed(3);
    campo('recuoArma').textContent = 'kick ' + r4(r.kick) + ' · yaw ' + r4(r.yaw) + ' · pos ' + r4(rec.x) + ',' + r4(rec.y);
    campo('recuoCamera').textContent = 'pitch ' + r4(r.camPitch) + ' · yaw ' + r4(r.camYaw) + ' · último ' + r4(leitura.recuo.pitch);
    const desdeDisparo = ctx.tempoDesdeDisparo();
    campo('disparo').textContent = desdeDisparo > 5 ? '— sem disparo recente' : desdeDisparo.toFixed(3) + ' s';
    campo('projeteis').textContent = String(contagemDeProjeteis(d));
    campo('dt').textContent = (dtAtual * 1000).toFixed(1) + ' ms';
    campo('fps').textContent = dtMedio > 0 ? (1 / dtMedio).toFixed(1) : '—';
    campo('particulas').textContent = String(
      fx.particulas.length + fx.smokes.length + fx.casings.length + fx.tracers.length +
      fx.bloods.length + (fx.flashes ? fx.flashes.length : 0)
    );
    campo('decais').textContent = String(fx.decaisAtivos.length);
  }

  let dtAtual = 0.016, dtMedio = 0.016, ultimaLeitura = -1;

  const controles = [];

  function item(nome, ler, gravar, min, max, passo) {
    return { nome, ler, gravar, min, max, passo };
  }

  function montarControles() {
    const m = modelo();
    const d = weapons.def;
    const hip = hipDe(m), rot = rotDe(m), ads = adsDe(m), opt = opticaDe(m);
    const grupo = [];
    grupo.push({
      nome: 'HIP FIRE · POSIÇÃO E ROTAÇÃO',
      itens: [
        item('position.x', () => hip.x, (v) => { hip.x = v; }, -0.25, 0.55, 0.005),
        item('position.y', () => hip.y, (v) => { hip.y = v; }, -0.45, 0.15, 0.005),
        item('position.z', () => hip.z, (v) => { hip.z = v; }, -0.85, -0.12, 0.005),
        item('rotation.x', () => rot.x, (v) => { rot.x = v; }, -0.6, 0.6, 0.01),
        item('rotation.y', () => rot.y, (v) => { rot.y = v; }, -0.6, 0.6, 0.01),
        item('rotation.z', () => rot.z, (v) => { rot.z = v; }, -0.6, 0.6, 0.01),
        item('hipFov', () => VIEWMODEL.hipFov, (v) => { VIEWMODEL.hipFov = v; }, 40, 90, 1),
      ],
    });
    if (d.ads) grupo.push({
      nome: 'ADS · ALINHAMENTO E CURVA',
      itens: [
        item('adsPos.z', () => ads.z, (v) => { ads.z = v; }, -0.7, -0.1, 0.005),
        item('óptica x', () => opt.x, (v) => { opt.x = v; }, -0.06, 0.06, 0.002),
        item('óptica y', () => opt.y, (v) => { opt.y = v; }, -0.06, 0.2, 0.002),
        item('adsFov', () => d.adsFov, (v) => { d.adsFov = v; }, 10, 80, 1),
        item('inTime', () => d.ads.inTime, (v) => { d.ads.inTime = v; }, 0.05, 0.7, 0.01),
        item('outTime', () => d.ads.outTime, (v) => { d.ads.outTime = v; }, 0.05, 0.7, 0.01),
        item('sensScale', () => d.ads.sensScale, (v) => { d.ads.sensScale = v; }, 0.2, 1, 0.02),
        item('swayScale', () => d.ads.swayScale, (v) => { d.ads.swayScale = v; }, 0, 0.7, 0.02),
        item('recoilMult', () => d.ads.recoilMultiplier, (v) => { d.ads.recoilMultiplier = v; }, 0, 1, 0.02),
        item('maxTranslation', () => d.ads.maxTranslation, (v) => { d.ads.maxTranslation = v; }, 0, 0.03, 0.001),
        item('maxRotation', () => d.ads.maxRotation, (v) => { d.ads.maxRotation = v; }, 0, 0.25, 0.005),
        item('tolerância', () => d.ads.alignmentTolerance, (v) => { d.ads.alignmentTolerance = v; }, 0, 0.03, 0.001),
      ],
    });
    if (d.sway) grupo.push({
      nome: 'SWAY · RESPIRAÇÃO · INÉRCIA',
      itens: [
        item('swayScale', () => d.sway.swayScale, (v) => { d.sway.swayScale = v; }, 0, 2.2, 0.05),
        item('bob', () => d.sway.bob, (v) => { d.sway.bob = v; }, 0, 2.2, 0.05),
        item('inércia', () => d.sway.inertia, (v) => { d.sway.inertia = v; }, 0, 2.5, 0.05),
        item('respiração', () => d.sway.breath, (v) => { d.sway.breath = v; }, 0, 2.5, 0.05),
        item('runInstab.', () => d.sway.runInstability, (v) => { d.sway.runInstability = v; }, 1, 2.6, 0.05),
      ],
    });
    if (d.sprintPose) grupo.push({
      nome: 'CORRIDA (SPRINT POSE)',
      itens: [
        item('pos.x', () => d.sprintPose.x, (v) => { d.sprintPose.x = v; }, -0.15, 0.15, 0.004),
        item('pos.y', () => d.sprintPose.y, (v) => { d.sprintPose.y = v; }, -0.2, 0.1, 0.004),
        item('pos.z', () => d.sprintPose.z, (v) => { d.sprintPose.z = v; }, -0.12, 0.12, 0.004),
        item('rot.x', () => d.sprintPose.rx, (v) => { d.sprintPose.rx = v; }, -0.6, 0.6, 0.01),
        item('rot.y', () => d.sprintPose.ry, (v) => { d.sprintPose.ry = v; }, -0.6, 0.6, 0.01),
        item('rot.z', () => d.sprintPose.rz, (v) => { d.sprintPose.rz = v; }, -0.6, 0.6, 0.01),
        item('entrada', () => d.sprintPose.transitionIn, (v) => { d.sprintPose.transitionIn = v; }, 1, 16, 0.5),
        item('saída', () => d.sprintPose.transitionOut, (v) => { d.sprintPose.transitionOut = v; }, 1, 16, 0.5),
        item('limite pos', () => d.sprintPose.maxTranslation, (v) => { d.sprintPose.maxTranslation = v; }, 0, 0.3, 0.01),
        item('limite rot', () => d.sprintPose.maxRotation, (v) => { d.sprintPose.maxRotation = v; }, 0, 0.9, 0.01),
      ],
    });
    if (d.recoilProfile) grupo.push({
      nome: 'RECUO (ARMA E CÂMERA)',
      itens: [
        item('kick', () => d.recoilProfile.kick, (v) => { d.recoilProfile.kick = v; }, 0, 0.2, 0.002),
        item('kickYaw', () => d.recoilProfile.kickYaw, (v) => { d.recoilProfile.kickYaw = v; }, 0, 0.05, 0.001),
        item('camKick', () => d.recoilProfile.camKick, (v) => { d.recoilProfile.camKick = v; }, 0, 1.2, 0.02),
        item('camYaw', () => d.recoilProfile.camYaw, (v) => { d.recoilProfile.camYaw = v; }, 0, 1.2, 0.02),
        item('recuperação', () => d.recoilProfile.recovery, (v) => { d.recoilProfile.recovery = v; }, 2, 26, 0.5),
        item('recup. kick', () => d.recoilProfile.kickRecovery, (v) => { d.recoilProfile.kickRecovery = v; }, 2, 30, 0.5),
        item('handJitter', () => d.recoilProfile.handJitter, (v) => { d.recoilProfile.handJitter = v; }, 0, 1.5, 0.05),
      ],
    });
    if (d.collision) grupo.push({
      nome: 'COLISÃO COM PAREDES',
      itens: [
        item('sonda', () => d.collision.probeLength, (v) => { d.collision.probeLength = v; }, 0.2, 2, 0.05),
        item('recolhimento', () => d.collision.retract, (v) => { d.collision.retract = v; }, 0, 0.8, 0.01),
        item('elevação', () => d.collision.rise, (v) => { d.collision.rise = v; }, 0, 0.3, 0.005),
        item('rolagem', () => d.collision.roll, (v) => { d.collision.roll = v; }, 0, 0.8, 0.01),
        item('dist. mínima', () => d.collision.minDistance, (v) => { d.collision.minDistance = v; }, 0.05, 0.9, 0.01),
      ],
    });
    return grupo;
  }

  function restaurarArma() {
    const i = weapons.slot;
    const b = bkp.defs[i];
    if (b) {
      const d = weapons.defs[i];
      if (b.sway) Object.assign(d.sway, b.sway);
      if (b.ads) Object.assign(d.ads, b.ads);
      if (b.recolhimento) Object.assign(d.recoilProfile, b.recolhimento);
      if (b.postura) Object.assign(d.sprintPose, b.postura);
      if (b.colisao) Object.assign(d.collision, b.colisao);
      if (b.adsFov !== undefined) d.adsFov = b.adsFov;
    }
    const m = modelo();
    if (bkp.hip[m]) Object.assign(hipDe(m), bkp.hip[m]);
    if (bkp.rot[m]) Object.assign(rotDe(m), bkp.rot[m]);
    if (bkp.ads[m]) Object.assign(adsDe(m), bkp.ads[m]);
    if (bkp.opt[m]) Object.assign(opticaDe(m), bkp.opt[m]);
    VIEWMODEL.hipFov = bkp.hipFov;
    weapons.syncWeapon();
    sincronizarControles();
    nota('configuração da arma restaurada');
  }

  function jsonAtual() {
    const m = modelo();
    const d = weapons.def;
    const hip = hipDe(m), rot = rotDe(m), ads = adsDe(m), opt = opticaDe(m);
    const dados = {
      modelo: m,
      arma: d.name,
      classe: d.class,
      hip: { x: r4(hip.x), y: r4(hip.y), z: r4(hip.z) },
      hipRot: { x: r4(rot.x), y: r4(rot.y), z: r4(rot.z) },
      hipFov: VIEWMODEL.hipFov,
      optica: { x: r4(opt.x), y: r4(opt.y), z: r4(opt.z) },
    };
    if (d.ads) dados.ads = {
      z: r4(ads.z), adsFov: d.adsFov, inTime: r4(d.ads.inTime), outTime: r4(d.ads.outTime),
      inCurve: d.ads.inCurve, outCurve: d.ads.outCurve, sensScale: r4(d.ads.sensScale),
      swayScale: r4(d.ads.swayScale), recoilMultiplier: r4(d.ads.recoilMultiplier),
      maxTranslation: r4(d.ads.maxTranslation), maxRotation: r4(d.ads.maxRotation),
      alignmentTolerance: r4(d.ads.alignmentTolerance),
    };
    if (d.sway) dados.sway = {
      bob: r4(d.sway.bob), swayScale: r4(d.sway.swayScale), inertia: r4(d.sway.inertia),
      breath: r4(d.sway.breath), runInstability: r4(d.sway.runInstability),
    };
    if (d.sprintPose) dados.sprintPose = {
      x: r4(d.sprintPose.x), y: r4(d.sprintPose.y), z: r4(d.sprintPose.z),
      rx: r4(d.sprintPose.rx), ry: r4(d.sprintPose.ry), rz: r4(d.sprintPose.rz),
      transitionIn: r4(d.sprintPose.transitionIn), transitionOut: r4(d.sprintPose.transitionOut),
      maxTranslation: r4(d.sprintPose.maxTranslation), maxRotation: r4(d.sprintPose.maxRotation),
    };
    if (d.recoilProfile) dados.recoil = {
      kick: r4(d.recoilProfile.kick), kickYaw: r4(d.recoilProfile.kickYaw),
      cameraKick: r4(d.recoilProfile.camKick), cameraYaw: r4(d.recoilProfile.camYaw),
      recovery: r4(d.recoilProfile.recovery), kickRecovery: r4(d.recoilProfile.kickRecovery),
      handJitter: r4(d.recoilProfile.handJitter),
    };
    if (d.collision) dados.collision = {
      probeLength: r4(d.collision.probeLength), retract: r4(d.collision.retract),
      rise: r4(d.collision.rise), roll: r4(d.collision.roll), minDistance: r4(d.collision.minDistance),
    };
    return JSON.stringify(dados, null, 2);
  }

  function copiarJson() {
    const txt = jsonAtual();
    campoJson.value = txt;
    const pronto = () => nota('JSON pronto no campo abaixo (copiado para a área de transferência)');
    const manual = () => nota('copie manualmente o JSON do campo abaixo', true);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(pronto, manual);
    } else {
      manual();
    }
  }

  const botoes = [
    { id: 'json', txt: 'COPIAR JSON', fn: copiarJson },
    { id: 'rest', txt: 'RESTAURAR ARMA', fn: restaurarArma },
    {
      id: 'pausa', txt: 'PAUSAR ANIMAÇÃO',
      ativo: () => !!anim.congelar,
      fn: () => { anim.congelar = !anim.congelar; nota(anim.congelar ? 'animação procedural pausada' : 'animação procedural ativa'); },
    },
    {
      id: 'imp', txt: 'IMPULSO DE RECUO',
      fn: () => { anim.shot(1.35); anim.pulseSlide(1); nota('impulso aplicado sem consumir munição'); },
    },
    {
      id: 'cam', txt: 'SIMULAR CAMINHADA',
      ativo: () => forcar.caminhada,
      fn: () => { forcar.caminhada = !forcar.caminhada; forcar.corrida = false; nota('simulação de caminhada: ' + (forcar.caminhada ? 'ligada' : 'desligada')); },
    },
    {
      id: 'cor', txt: 'SIMULAR CORRIDA',
      ativo: () => forcar.corrida,
      fn: () => { forcar.corrida = !forcar.corrida; forcar.caminhada = false; nota('simulação de corrida: ' + (forcar.corrida ? 'ligada' : 'desligada')); },
    },
    {
      id: 'ads', txt: 'ALTERNAR ADS',
      ativo: () => !!anim.ads.state,
      fn: () => ctx.definirADS(!anim.ads.state),
    },
    {
      id: 'laser', txt: 'ALTERNAR LASER',
      ativo: () => !!weapons.laserOn,
      fn: () => { weapons.laserOn = !weapons.laserOn; if (weapons.laser) weapons.laser.setEnabled(weapons.laserOn && !!(weapons.def.laser && weapons.def.laser.enabled)); },
    },
    { id: 'geixo', txt: 'EIXO DA ARMA', ativo: () => giz.eixo, fn: () => { giz.eixo = !giz.eixo; } },
    { id: 'gcam', txt: 'DIREÇÃO DA CÂMERA', ativo: () => giz.camera, fn: () => { giz.camera = !giz.camera; } },
    { id: 'gdis', txt: 'DIREÇÃO DO DISPARO', ativo: () => giz.disparo, fn: () => { giz.disparo = !giz.disparo; } },
    { id: 'gson', txt: 'SONDA DE COLISÃO', ativo: () => giz.sonda, fn: () => { giz.sonda = !giz.sonda; } },
    { id: 'gimp', txt: 'PONTO DE IMPACTO', ativo: () => giz.impacto, fn: () => { giz.impacto = !giz.impacto; } },
  ];

  const caixaControles = painel.querySelector('#wd-c');
  const caixaBotoes = painel.querySelector('#wd-b');

  caixaBotoes.innerHTML = botoes.map((b) => `<button data-wd-b="${b.id}">${b.txt}</button>`).join('');
  const btns = {};
  caixaBotoes.querySelectorAll('button').forEach((el) => { btns[el.dataset.wdB] = el; });
  botoes.forEach((b) => {
    btns[b.id].addEventListener('click', () => {
      b.fn();
      sincronizarBotoes();
      lerTudo();
    });
  });

  function sincronizarBotoes() {
    for (const b of botoes) {
      if (!b.ativo) continue;
      btns[b.id].classList.toggle('on', !!b.ativo());
    }
  }

  function montarPainelControles() {
    const grupos = montarControles();
    controles.length = 0;
    caixaControles.innerHTML = grupos.map((g, i) => `
      <details${i < 2 ? ' open' : ''}><summary>${g.nome}</summary>
      ${g.itens.map((_, j) => `
        <label>${g.itens[j].nome}<input type="range" data-wd-g="${i}" data-wd-i="${j}" min="${g.itens[j].min}" max="${g.itens[j].max}" step="${g.itens[j].passo}"><i>—</i></label>
      `).join('')}
      </details>
    `).join('');
    caixaControles.querySelectorAll('input[type=range]').forEach((el) => {
      const it = grupos[+el.dataset.wdG].itens[+el.dataset.wdI];
      const saida = el.parentElement.querySelector('i');
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        it.gravar(v);
        saida.textContent = it.nome === 'hipFov' ? String(Math.round(v)) : v.toFixed(3);
        weapons.syncWeapon();
        lerTudo();
      });
      controles.push({ el, it, saida });
      const v = it.ler();
      el.value = String(v);
      saida.textContent = it.nome === 'hipFov' ? String(Math.round(v)) : v.toFixed(3);
    });
  }

  function sincronizarControles() {
    for (const c of controles) {
      const v = c.it.ler();
      c.el.value = String(v);
      c.saida.textContent = c.it.nome === 'hipFov' ? String(Math.round(v)) : v.toFixed(3);
    }
    sincronizarBotoes();
    lerTudo();
  }

  montarPainelControles();
  sincronizarBotoes();
  lerTudo();

  let ultimoSlot = weapons.slot;

  const api = {
    painel,
    get forcarMovimento() {
      if (forcar.caminhada) return { moving: true, running: false };
      if (forcar.corrida) return { moving: true, running: true };
      return null;
    },
    set fovAlvo(v) { leitura.fovAlvo = v; },
    set recuoCamera(v) { leitura.recuo.pitch = v.pitch; leitura.recuo.yaw = v.yaw; },
    registrarDisparo(dir) {
      disparo.origem.copy(camera.position);
      disparo.dir.copy(dir);
      disparo.t = state.time;
    },
    atualizar(dt) {
      dtAtual = dt;
      dtMedio = dtMedio <= 0 ? dt : dtMedio * 0.92 + dt * 0.08;
      if (weapons.slot !== ultimoSlot) {
        ultimoSlot = weapons.slot;
        montarPainelControles();
      }
      const agora = performance.now();
      if (ultimaLeitura < 0 || agora - ultimaLeitura > 85) {
        ultimaLeitura = agora;
        lerTudo();
        sincronizarBotoes();
      }
      desenhar();
    },
  };
  return api;
}
