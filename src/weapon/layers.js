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
  }

  update(dt, ctx) {
    const s = ctx.config;
    const p = this.profile;
    const ads = ctx.adsK;
    const swayScale = (1 - ads * 0.78) * p.swayScale * s.weaponSway;

    const alvoX = clampN(ctx.lookX * 0.16, -1, 1);
    const alvoY = clampN(ctx.lookY * 0.16, -1, 1);
    const lambda = VIEWMODEL.curves.swayDamp;
    this.sway.x = damp(this.sway.x, alvoX, lambda, dt);
    this.sway.y = damp(this.sway.y, alvoY, lambda, dt);

    const vel = ctx.velocity;
    const cos = Math.cos(ctx.camYaw), sin = Math.sin(ctx.camYaw);
    const direita = vel.x * cos - vel.z * sin;
    const frente = -vel.x * sin - vel.z * cos;
    const inercia = (0.05 + 0.05 * p.inertia) * (1 - ads * 0.6) * s.weaponSway;
    this.inertia.x = damp(this.inertia.x, clampN(-direita * inercia, -0.14, 0.14), VIEWMODEL.curves.inertiaDamp, dt);
    this.inertia.y = damp(this.inertia.y, clampN(frente * inercia * 0.6, -0.1, 0.1), VIEWMODEL.curves.inertiaDamp, dt);

    const speed = Math.hypot(vel.x, vel.z);
    const andando = speed > 0.35 && ctx.grounded;
    const corrida = ctx.running && andando;
    const passo = ctx.dtScale || 1;
    if (andando) this.bobT += dt * VIEWMODEL.curves.bob * passo * (corrida ? 1.55 : 1) * (0.75 + speed / 6);
    else this.bobT += dt * 1.1;

    this.breathT += dt * VIEWMODEL.curves.breath * (1 + (1 - ads) * 0.4);

    const ampBob = ampp(p.bob, s.bobScale, ads, andando, corrida);
    const bobX = Math.sin(this.bobT) * ampBob.x;
    const bobY = Math.abs(Math.cos(this.bobT)) * ampBob.y;
    const folga = corrida ? p.runInstability : 1;

    this.roll = damp(this.roll, clampN(-direita * 0.02 * folga, -VIEWMODEL.limits.roll, VIEWMODEL.limits.roll), 6, dt);
    this.pitchLag = damp(this.pitchLag, clampN(-frente * 0.012 * folga, -0.05, 0.05), 6, dt);

    const ampSway = VIEWMODEL.limits.sway * (1 - ads * 0.72);
    const respira = VIEWMODEL.limits.breath * (0.6 + ads * 0.9) * p.breath * s.weaponSway;

    return {
      x: this.sway.x * ampSway + this.inertia.x + bobX,
      y: this.sway.y * ampSway + this.inertia.y + bobY,
      z: -Math.abs(this.sway.x) * 0.012,
      rx: this.sway.y * ampSway * 0.7 + this.pitchLag,
      ry: this.sway.x * ampSway * 0.9,
      rz: this.roll + Math.sin(this.bobT * 0.5) * 0.006 * (1 - ads),
      breath: Math.sin(this.breathT) * respira,
      breathY: Math.cos(this.breathT * 0.73) * respira * 0.7,
      breathRoll: Math.sin(this.breathT * 0.61) * respira * 0.5,
    };
  }
}

function ampp(bob, escala, ads, andando, corrida) {
  const base = (andando ? (corrida ? 1.5 : 1) : 0.42) * bob * escala * (1 - ads * 0.82);
  return { x: base * 0.011, y: base * 0.008 };
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
