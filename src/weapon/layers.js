import * as THREE from '../../vendor/three.module.js';
import { ease, VIEWMODEL } from '../config/weapon-data.js';

const AD_S_PADRAO = {
  inTime: 0.22, outTime: 0.18, inCurve: 'easeOutQuint', outCurve: 'easeInOutCubic',
  sensScale: 0.65, swayScale: 0.25,
};

export class AimDownSightsComponent {
  constructor() {
    this.profile = AD_S_PADRAO;
    this.blend = 0;
    this.k = 0;
    this.state = false;
  }

  setProfile(p) {
    this.profile = p || AD_S_PADRAO;
  }

  request(on) {
    this.state = !!on;
  }

  update(dt) {
    const p = this.profile;
    const dur = Math.max(0.04, this.state ? p.inTime : p.outTime);
    const passo = dt / dur;
    this.blend = Math.min(1, Math.max(0, this.blend + (this.state ? passo : -passo)));
    this.k = ease(this.state ? p.inCurve : p.outCurve, this.blend);
    return this.k;
  }

  get sensScale() {
    return 1 - (1 - this.profile.sensScale) * this.k;
  }

  get swayScale() {
    return 1 - (1 - this.profile.swayScale) * this.k;
  }
}

export class SwayComponent {
  constructor() {
    this.sway = new THREE.Vector2();
    this.swayVel = new THREE.Vector2();
    this.inertia = new THREE.Vector2();
    this.bobT = 0;
    this.breathT = 0;
    this.profile = { bob: 1, swayScale: 1, inertia: 1, breath: 1, runInstability: 1.3 };
    this.roll = 0;
    this.pitchLag = 0;
    this.velPrev = new THREE.Vector3();
    this.semVel = true;
  }

  setProfile(p) {
    if (p) this.profile = { ...this.profile, ...p };
  }

  respawn() {
    this.sway.set(0, 0);
    this.swayVel.set(0, 0);
    this.inertia.set(0, 0);
    this.roll = 0;
    this.pitchLag = 0;
    this.semVel = true;
  }

  update(dt, ctx) {
    const s = ctx.config;
    const p = this.profile;
    const ads = ctx.adsK;
    const escalaSway = ctx.adsSwayScale !== undefined ? ctx.adsSwayScale : 1 - ads * 0.78;
    const escalaBob = ctx.adsBobScale !== undefined ? ctx.adsBobScale : 1 - ads * 0.82;
    const escalaInercia = ctx.adsInertiaScale !== undefined ? ctx.adsInertiaScale : 1 - ads * 0.6;
    const escalaRespiracao = ctx.adsBreathScale !== undefined ? ctx.adsBreathScale : 1;
    const swayScale = escalaSway * p.swayScale * s.weaponSway;

    const alvoX = clampN(ctx.lookX * 0.16, -1, 1);
    const alvoY = clampN(ctx.lookY * 0.16, -1, 1);
    const lambda = VIEWMODEL.curves.swayDamp;
    this.sway.x = damp(this.sway.x, alvoX, lambda, dt);
    this.sway.y = damp(this.sway.y, alvoY, lambda, dt);

    const vel = ctx.velocity;
    const cos = Math.cos(ctx.camYaw), sin = Math.sin(ctx.camYaw);
    const direita = vel.x * cos - vel.z * sin;
    const frente = -vel.x * sin - vel.z * cos;

    let acelDir = 0, acelFrente = 0;
    if (dt > 1e-5 && !this.semVel) {
      const dvx = (vel.x - this.velPrev.x) / dt;
      const dvz = (vel.z - this.velPrev.z) / dt;
      acelDir = dvx * cos - dvz * sin;
      acelFrente = -dvx * sin - dvz * cos;
    }
    this.velPrev.copy(vel);
    this.semVel = false;

    const ganhoInercia = (0.008 + 0.008 * p.inertia) * escalaInercia * s.weaponSway;
    this.inertia.x = damp(this.inertia.x, clampN(-acelDir * ganhoInercia, -VIEWMODEL.limits.inertia, VIEWMODEL.limits.inertia), VIEWMODEL.curves.inertiaDamp, dt);
    this.inertia.y = damp(this.inertia.y, clampN(acelFrente * ganhoInercia * 0.7, -VIEWMODEL.limits.inertia, VIEWMODEL.limits.inertia), VIEWMODEL.curves.inertiaDamp, dt);

    const speed = Math.hypot(vel.x, vel.z);
    const andando = speed > 0.35 && ctx.grounded;
    const corrida = ctx.running && andando;
    const passo = ctx.dtScale || 1;
    if (andando) this.bobT += dt * VIEWMODEL.curves.bob * passo * (corrida ? 1.5 : 1) * (0.75 + speed / 6);
    else this.bobT += dt * 1.1;

    this.breathT += dt * VIEWMODEL.curves.breath * (1 + (1 - ads) * 0.4);

    const ampBob = ampp(p.bob, s.bobScale, escalaBob * (ctx.locomotionBobScale !== undefined ? ctx.locomotionBobScale : 1), andando, corrida);
    const bobX = Math.sin(this.bobT) * ampBob.x;
    const bobY = Math.sin(this.bobT * 2) * ampBob.y * 0.5;
    const folga = corrida ? p.runInstability : 1;

    const ampSway = VIEWMODEL.limits.sway;
    const localScale = ctx.locomotionSwayScale !== undefined ? ctx.locomotionSwayScale : 1;
    const respira = VIEWMODEL.limits.breath * 0.6 * p.breath * s.weaponSway * escalaRespiracao;
    const deslocamento = ctx.velocity ? Math.hypot(vel.x, vel.z) : 0;

    this.roll = damp(this.roll, clampN(-direita * 0.018 * folga, -VIEWMODEL.limits.roll, VIEWMODEL.limits.roll), 6, dt);
    this.pitchLag = damp(this.pitchLag, clampN(-frente * 0.01 * folga, -0.05, 0.05), 6, dt);

    return {
      x: this.sway.x * ampSway * swayScale * localScale + this.inertia.x + bobX,
      y: this.sway.y * ampSway * swayScale * localScale + this.inertia.y + bobY,
      z: -Math.abs(this.sway.x) * 0.012 * escalaSway,
      rx: (this.sway.y * ampSway * 0.7 * swayScale * localScale + this.pitchLag),
      ry: this.sway.x * ampSway * 0.9 * swayScale * localScale,
      rz: this.roll + Math.sin(this.bobT * 0.5) * 0.006 * escalaBob,
      breath: Math.sin(this.breathT) * respira,
      breathY: Math.cos(this.breathT * 0.73) * respira * 0.7,
      breathRoll: Math.sin(this.breathT * 0.61) * respira * 0.5,
      andando,
      corrida,
      velocidade: deslocamento,
    };
  }
}

function ampp(bob, escala, adsScale, andando, corrida) {
  const base = (andando ? (corrida ? 1.5 : 1) : 0.42) * bob * escala * adsScale;
  return { x: base * 0.011, y: base * 0.008 };
}

export class SprintPoseComponent {
  constructor() {
    this.k = 0;
    this.pose = {
      x: 0.012, y: -0.05, z: 0.024, rx: 0.18, ry: -0.24, rz: -0.14,
      swiftness: 1, swayMultiplier: 0.75, bobMultiplier: 0.5,
      transitionIn: 7, transitionOut: 6, maxTranslation: 0.12, maxRotation: 0.45,
    };
  }

  setPose(p) {
    if (p) this.pose = { ...this.pose, ...p };
  }

  reset() {
    this.k = 0;
  }

  update(dt, ctx) {
    const p = this.pose;
    const desejado = ctx.sprinting && ctx.grounded !== false ? 1 : 0;
    const resposta = desejado ? p.transitionIn : p.transitionOut;
    const alvo = desejado * (1 - ctx.adsK);
    this.k = damp(this.k, alvo, resposta, dt);
    const maxT = p.maxTranslation;
    const maxR = p.maxRotation;
    return {
      x: clampN((p.x || 0) * this.k, -maxT, maxT),
      y: clampN((p.y || 0) * this.k, -maxT, maxT),
      z: clampN((p.z || 0) * this.k, -maxT, maxT),
      rx: clampN((p.rx || 0) * this.k, -maxR, maxR),
      ry: clampN((p.ry || 0) * this.k, -maxR, maxR),
      rz: clampN((p.rz || 0) * this.k, -maxR, maxR),
      k: this.k,
      swayMultiplier: 1 - (1 - p.swayMultiplier) * this.k,
      bobMultiplier: 1 - (1 - p.bobMultiplier) * this.k,
    };
  }
}

export class RecoilComponent {
  constructor() {
    this.kick = 0;
    this.kickVel = 0;
    this.yaw = 0;
    this.yawVel = 0;
    this.camPitch = 0;
    this.camYaw = 0;
    this.handJitter = 0;
    this.patternIndex = 0;
    this.streak = 0;
    this.profile = { kick: 0.03, kickYaw: 0.01, recovery: 12, kickRecovery: 10, pattern: [[0, 1]], camKick: 0.34, camYaw: 0.22, handJitter: 0.4 };
    this.reactions = [];
  }

  setProfile(p) {
    if (p) this.profile = p;
  }

  shot(power = 1) {
    const p = this.profile;
    const passo = p.pattern[this.patternIndex % p.pattern.length];
    const variacao = 1 + (Math.random() - 0.5) * 0.18;
    this.streak = Math.min(8, this.streak + 1);
    this.patternIndex++;
    this.kick -= p.kick * passo[1] * power * variacao;
    this.yaw += p.kickYaw * passo[0] * power * (1 + (Math.random() - 0.5) * 0.4);
    this.camPitch -= p.kick * p.camKick * power * variacao;
    this.camYaw += p.kickYaw * p.camYaw * passo[0] * power;
    this.handJitter = Math.min(1, this.handJitter + p.handJitter * 0.35);
    return this.kick;
  }

  impact(strength = 1) {
    this.reactions.push({ t: 0, life: 0.32, amp: strength * 0.02 });
    if (this.reactions.length > 4) this.reactions.shift();
  }

  consumeCamera() {
    const p = this.profile;
    const out = { pitch: this.camPitch * p.recovery * 0.04, yaw: this.camYaw * p.recovery * 0.03 };
    this.camPitch = 0;
    this.camYaw = 0;
    return out;
  }

  update(dt, config) {
    const p = this.profile;
    const escala = (config && config.shakeScale !== undefined) ? config.shakeScale : 1;
    this.kick = damp(this.kick, 0, p.kickRecovery, dt);
    this.yaw = damp(this.yaw, 0, p.recovery, dt);
    this.handJitter = damp(this.handJitter, 0, 9, dt);
    this.streak = damp(this.streak, 0, p.recovery * 0.25, dt);

    let reactX = 0, reactY = 0, reactZ = 0;
    for (let i = this.reactions.length - 1; i >= 0; i--) {
      const r = this.reactions[i];
      r.t += dt;
      if (r.t >= r.life) {
        this.reactions.splice(i, 1);
        continue;
      }
      const k = 1 - r.t / r.life;
      const onda = Math.sin(r.t * 42) * k;
      reactX += onda * r.amp * escala;
      reactY += Math.sin(r.t * 31 + 1.2) * k * r.amp * 0.7 * escala;
      reactZ += Math.sin(r.t * 26 + 2.4) * k * r.amp * 0.6 * escala;
    }

    const jitter = Math.sin(performance.now() * 0.045) * this.handJitter * 0.004 * escala;

    return {
      x: reactX + jitter * 0.5,
      y: reactY - this.kick * 0.5,
      z: Math.min(0.06, Math.abs(this.kick) * 0.35),
      rx: this.kick * 1.4 + reactX * 0.6,
      ry: this.yaw * 1.2 + reactY,
      rz: reactZ,
      camKick: this.kick,
    };
  }
}

export class WeaponCollisionComponent {
  constructor() {
    this.retract = 0;
    this.rise = 0;
    this.roll = 0;
    this.side = 0;
    this.distance = 1;
    this.blocked = false;
    this._probe = null;
    this.profile = { probeLength: 1.05, retract: 0.34, rise: 0.09, roll: 0.28, minDistance: 0.34 };
    this._dir = new THREE.Vector3();
    this._from = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this._timer = 0;
  }

  setProbe(fn) {
    this._probe = fn;
  }

  setProfile(p) {
    if (p) this.profile = { ...this.profile, ...p };
  }

  update(dt, ctx) {
    const p = this.profile;
    const comprimento = p.probeLength;
    this._timer -= dt;
    if (this._probe && this._timer <= 0) {
      this._timer = 0.033;
      const dir = ctx.forward;
      this._dir.copy(dir);
      this._from.copy(ctx.origin).addScaledVector(dir, 0.18);
      this._to.copy(this._from).addScaledVector(dir, comprimento);
      const hit = this._probe(this._from, this._to);
      let alvoRetract = 0, alvoRise = 0, alvoRoll = 0, alvoSide = 0;
      if (hit && hit.t > 0.02) {
        const d = Math.min(comprimento, Math.max(p.minDistance, hit.t * comprimento));
        this.distance = d;
        const perto = 1 - clampN((d - p.minDistance) / (comprimento - p.minDistance), 0, 1);
        const curva = perto * perto;
        alvoRetract = curva * p.retract;
        alvoRise = curva * p.rise;
        alvoSide = (hit.normal.x * ctx.right.x + hit.normal.z * ctx.right.z);
        alvoRoll = curva * p.roll * (0.6 + 0.4 * Math.abs(alvoSide));
        this.blocked = perto > 0.15;
      } else {
        this.distance = comprimento;
        this.blocked = false;
      }
      const suave = ctx.adsK > 0.5 ? 16 : 11;
      this.retract = damp(this.retract, alvoRetract, suave, dt);
      this.rise = damp(this.rise, alvoRise, suave, dt);
      this.roll = damp(this.roll, alvoRoll, suave * 0.8, dt);
      this.side = damp(this.side, alvoSide * alvoRetract * 0.6, suave * 0.8, dt);
    } else if (!this._probe) {
      this.retract = damp(this.retract, 0, 12, dt);
      this.rise = damp(this.rise, 0, 12, dt);
      this.roll = damp(this.roll, 0, 12, dt);
      this.side = damp(this.side, 0, 12, dt);
      this.blocked = false;
    }

    return {
      x: this.retract * 0.6,
      y: this.rise - this.retract * 0.16,
      z: this.retract * 0.5,
      rx: -this.rise * 2.2,
      ry: this.side,
      rz: this.roll,
      blocked: this.blocked,
      retract: this.retract,
    };
  }
}

export function clampN(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function damp(atual, alvo, lambda, dt) {
  return alvo + (atual - alvo) * Math.exp(-lambda * dt);
}
