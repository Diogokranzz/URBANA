import * as THREE from '../../vendor/three.module.js';
import { AimDownSightsComponent, SwayComponent, RecoilComponent, WeaponCollisionComponent, damp, clampN } from './layers.js';
import { VIEWMODEL, ease } from '../config/weapon-data.js';

export class WeaponAnimationController {
  constructor(config) {
    this.config = config;
    this.ads = new AimDownSightsComponent();
    this.sway = new SwayComponent();
    this.recoil = new RecoilComponent();
    this.collision = new WeaponCollisionComponent();

    this.weapon = null;
    this.model = 'rifle';
    this.opticLocal = new THREE.Vector3();
    this.parts = null;
    this.partBase = new Map();

    this.switchT = 0;
    this.switchDur = 0.35;
    this.reloadT = 0;
    this.reloadDur = 0;
    this.reloadFired = null;
    this.reloadEventIndex = 0;
    this.reloadHandlers = null;
    this.reloadStage = 0;
    this.inspectT = 0;
    this.inspectDur = 1.4;
    this.throwK = 0;
    this.jamK = 0;
    this.slideK = 0;
    this.slideMax = 0.045;

    this._pos = new THREE.Vector3();
    this._rot = new THREE.Euler();
    this._out = {
      pos: this._pos,
      rot: this._rot,
      fov: 62,
      adsK: 0,
      blocked: false,
      reload: 0,
      reloadStage: 0,
    };
  }

  setWeapon(data, parts, opticLocal) {
    this.weapon = data;
    this.model = (data && data.model) || 'rifle';
    this.parts = parts || null;
    if (opticLocal) this.opticLocal.copy(opticLocal);
    if (data) {
      this.ads.setProfile(data.ads);
      this.sway.setProfile(data.sway);
      this.recoil.setProfile(data.recoilProfile || null);
      this.collision.setProfile(data.collision);
    }
    this.captureParts();
  }

  captureParts() {
    this.partBase.clear();
    if (!this.parts) return;
    for (const chave of Object.keys(this.parts)) {
      const obj = this.parts[chave];
      if (obj && obj.isObject3D) {
        this.partBase.set(chave, {
          pos: obj.position.clone(),
          rot: obj.rotation.clone(),
        });
      }
    }
  }

  setRecoilProfile(profile) {
    this.recoil.setProfile(profile);
  }

  setProbe(fn) {
    this.collision.setProbe(fn);
  }

  requestADS(on) {
    this.ads.request(on);
  }

  get adsK() {
    return this.ads.k;
  }

  get adsActive() {
    return this.ads.state;
  }

  get sensitivityScale() {
    return this.ads.sensScale;
  }

  shot(power) {
    if (!this.weapon || !this.weapon.recoil) return 0;
    return this.recoil.shot(power);
  }

  receiveImpact(strength) {
    this.recoil.impact(typeof strength === 'number' ? strength : 1);
  }

  startSwitch() {
    this.switchT = this.switchDur;
    this.ads.request(false);
  }

  pulseSlide(v) {
    this.slideK = Math.min(1.4, Math.max(this.slideK, v === undefined ? 1 : v));
  }

  startInspect() {
    if (this.reloadT > 0) return false;
    this.inspectT = this.inspectDur;
    return true;
  }

  startReload(data, handlers) {
    const def = data || this.weapon;
    if (!def || !def.reload) return false;
    this.reloadT = def.reloadTime;
    this.reloadDur = def.reloadTime;
    this.reloadEventIndex = 0;
    this.reloadHandlers = handlers || null;
    this.reloadStage = 0;
    this.ads.request(false);
    this.captureParts();
    this.advanceReload(0);
    return true;
  }

  cancelReload(motivo) {
    if (this.reloadT <= 0) return;
    this.reloadT = 0;
    this.reloadEventIndex = 0;
    this.emitReload('reloadCancel', 0, motivo);
    this.reloadHandlers = null;
    this.restoreParts();
  }

  get reloading() {
    return this.reloadT > 0;
  }

  get reloadProgress() {
    return this.reloadDur > 0 ? 1 - this.reloadT / this.reloadDur : 1;
  }

  emitReload(event, t, extra) {
    if (!this.reloadHandlers) return;
    const fn = this.reloadHandlers[event];
    if (typeof fn === 'function') fn({ t, weapon: this.weapon, extra });
  }

  advanceReload(dt) {
    if (this.reloadT <= 0) return;
    const def = this.weapon;
    const anterior = this.reloadProgress;
    this.reloadT -= dt;
    const agora = this.reloadProgress;
    this.reloadStage = agora < 0.5 ? 0 : agora < 0.8 ? 1 : 2;
    const timeline = (def && def.reload && def.reload.events) || [];
    while (this.reloadEventIndex < timeline.length && timeline[this.reloadEventIndex].t <= agora) {
      const passo = timeline[this.reloadEventIndex++];
      this.emitReload(passo.event, agora, passo.sound);
    }
    if (anterior < 1 && agora >= 1) {
      this.reloadT = 0;
      this.reloadHandlers = null;
      this.restoreParts();
    }
    this.animateMagazine(agora);
  }

  animateMagazine(k) {
    if (!this.parts || !this.parts.rMag) return;
    const base = this.partBase.get('rMag');
    if (!base) return;
    const mag = this.parts.rMag;
    const janela = clampN((k - 0.16) / 0.34, 0, 1);
    const volta = clampN((k - 0.62) / 0.3, 0, 1);
    const fora = 1 - volta;
    const queda = janela * fora;
    mag.position.copy(base.pos);
    mag.rotation.copy(base.rot);
    mag.position.y = base.pos.y - queda * 0.3;
    mag.position.z = base.pos.z + queda * 0.06;
    mag.rotation.x = base.rot.x + queda * 1.1;
    mag.visible = queda < 0.98;
  }

  restoreParts() {
    if (!this.parts) return;
    for (const [chave, base] of this.partBase) {
      const obj = this.parts[chave];
      if (!obj) continue;
      obj.position.copy(base.pos);
      obj.rotation.copy(base.rot);
      if (chave === 'rMag') obj.visible = true;
    }
  }

  update(dt, ctx) {
    const cfg = this.config;
    const adsK = this.ads.update(dt);

    if (this.switchT > 0) this.switchT = Math.max(0, this.switchT - dt);
    if (this.inspectT > 0) this.inspectT = Math.max(0, this.inspectT - dt);
    this.advanceReload(dt);
    if (this.jamK > 0) this.jamK = Math.max(0, this.jamK - dt * 2);

    const swayOut = this.sway.update(dt, {
      config: cfg,
      adsK,
      lookX: ctx.lookX || 0,
      lookY: ctx.lookY || 0,
      velocity: ctx.velocity,
      camYaw: ctx.camYaw,
      grounded: ctx.grounded,
      running: ctx.running,
      dtScale: ctx.dtScale,
    });

    const recoilOut = this.recoil.update(dt, cfg);
    const colOut = this.collision.update(dt, {
      origin: ctx.origin,
      forward: ctx.forward,
      right: ctx.right,
      adsK,
    });

    const base = VIEWMODEL.basePos[this.model] || VIEWMODEL.basePos.rifle;
    const ads = VIEWMODEL.adsPos[this.model] || VIEWMODEL.adsPos.rifle;

    const alvoX = adsK > 0 ? -this.opticLocal.x : base.x;
    const alvoY = adsK > 0 ? -this.opticLocal.y : base.y;
    const hipZ = base.z, adsZ = ads.z;

    const suave = 1 - Math.pow(1 - clampN(adsK, 0, 1), 3);
    let px = base.x + (alvoX - base.x) * suave;
    let py = base.y + (alvoY - base.y) * suave;
    let pz = hipZ + (adsZ - hipZ) * suave;

    let rx = 0, ry = 0, rz = 0;

    const sw = this.switchT > 0 ? Math.sin(clampN(this.switchT / this.switchDur, 0, 1) * Math.PI) : 0;
    py -= sw * 0.25;
    rz += sw * 0.5;

    let reloadRot = 0, reloadDrop = 0, reloadRoll = 0, magHand = 0;
    if (this.reloadT > 0) {
      const f = this.reloadProgress;
      const arco = Math.sin(clampN(f * 1.15, 0, 1) * Math.PI);
      reloadRot = arco * 0.5;
      reloadDrop = arco * 0.1;
      reloadRoll = arco * 0.42;
      magHand = clampN((f - 0.2) / 0.3, 0, 1) * (1 - clampN((f - 0.62) / 0.3, 0, 1));
    }

    let inspectRot = 0, inspectRoll = 0, inspectLift = 0;
    if (this.inspectT > 0) {
      const f = 1 - this.inspectT / this.inspectDur;
      const arco = Math.sin(clampN(f, 0, 1) * Math.PI);
      inspectRot = arco * 0.95;
      inspectRoll = -arco * 0.55;
      inspectLift = arco * 0.05;
    }

    let throwRot = 0, throwZ = 0;
    if (this.throwK > 0) {
      const p = 1 - this.throwK / 0.45;
      throwZ = Math.sin(p * Math.PI) * 0.14;
      throwRot = p * p * 0.7;
    }

    px += swayOut.x + colOut.x + recoilOut.x;
    py += swayOut.y + colOut.y + recoilOut.y + swayOut.breathY - reloadDrop - inspectLift;
    pz += swayOut.z + colOut.z + recoilOut.z + throwZ;

    rx += recoilOut.rx + swayOut.rx + colOut.rx + reloadRot * 0.5 + throwRot + swayOut.breath * 0.5;
    ry += recoilOut.ry + swayOut.ry + colOut.ry + reloadRot * 0.4 + inspectRot;
    rz += recoilOut.rz + swayOut.rz + colOut.rz + reloadRoll + inspectRoll + swayOut.breathRoll;

    if (this.parts && this.parts.slide && this.partBase.has('slide')) {
      const base = this.partBase.get('slide');
      let ciclo = 0;
      if (this.reloadT > 0) {
        const f = this.reloadProgress;
        ciclo = Math.sin(clampN((f - 0.74) / 0.16, 0, 1) * Math.PI);
      }
      const desloc = Math.max(this.slideK, ciclo) * this.slideMax;
      this.parts.slide.position.z = base.pos.z + desloc;
    }
    this.slideK = damp(this.slideK, 0, 15, dt);

    const fovHip = VIEWMODEL.hipFov || 62;
    const deltaFov = this.weapon && this.weapon.scope ? 22 : 6;
    const fov = fovHip - adsK * deltaFov;

    this._pos.set(px, py, pz);
    this._rot.set(rx, ry, rz);
    this._out.fov = fov;
    this._out.adsK = adsK;
    this._out.blocked = colOut.blocked;
    this._out.reload = this.reloadT > 0 ? this.reloadProgress : 0;
    this._out.reloadStage = this.reloadStage;
    this._out.magHand = magHand;
    this._out.switching = sw;
    return this._out;
  }

  consumeCameraRecoil() {
    return this.recoil.consumeCamera();
  }

  aimOffset() {
    return ease('easeOutQuad', clampN(1 - this.collision.retract * 1.4, 0, 1));
  }
}
