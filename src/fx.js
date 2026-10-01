import * as THREE from '../vendor/three.module.js';
import { surfaceOf, DECAL_LIMITS, IMPACT_LIMITS } from './config/surfaces.js';
import { Settings } from './config/settings.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _eixo = new THREE.Vector3(0, 0, 1);

function rand(a, b) { return a + Math.random() * (b - a); }

function randVec(s) {
  return new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.2, 1) * s);
}

function texto(draw, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function texPock() {
  return texto((g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s * 0.46);
    grad.addColorStop(0, 'rgba(30,27,24,0.95)');
    grad.addColorStop(0.3, 'rgba(52,47,42,0.8)');
    grad.addColorStop(0.62, 'rgba(120,113,102,0.42)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = s * 0.12 + Math.random() * s * 0.3;
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '18,16,14' : '170,164,152'},${(0.1 + Math.random() * 0.3).toFixed(2)})`;
      g.fillRect(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, 1 + Math.random() * 2.4, 1 + Math.random() * 2.4);
    }
  }, 64);
}

function texIrregular() {
  return texto((g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s * 0.45);
    grad.addColorStop(0, 'rgba(38,34,30,0.92)');
    grad.addColorStop(0.35, 'rgba(96,90,80,0.6)');
    grad.addColorStop(0.7, 'rgba(214,208,196,0.32)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 22; i++) {
      g.fillStyle = `rgba(226,220,208,${(0.12 + Math.random() * 0.3).toFixed(2)})`;
      g.beginPath();
      const a = Math.random() * Math.PI * 2, r = Math.random() * s * 0.38;
      g.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, 1 + Math.random() * 3, 0, 7);
      g.fill();
    }
  }, 64);
}

function texScuff() {
  return texto((g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s * 0.42);
    grad.addColorStop(0, 'rgba(22,23,26,0.8)');
    grad.addColorStop(0.45, 'rgba(58,62,68,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      g.strokeStyle = `rgba(198,206,216,${(0.05 + Math.random() * 0.18).toFixed(2)})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(s / 2, s / 2);
      g.lineTo(s / 2 + Math.cos(a) * s * 0.4, s / 2 + Math.sin(a) * s * 0.4);
      g.stroke();
    }
  }, 64);
}

function texSplinter() {
  return texto((g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s * 0.4);
    grad.addColorStop(0, 'rgba(26,18,10,0.9)');
    grad.addColorStop(0.5, 'rgba(92,70,44,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      g.fillStyle = `rgba(150,120,74,${(0.15 + Math.random() * 0.35).toFixed(2)})`;
      g.save();
      g.translate(s / 2 + Math.cos(a) * s * 0.2, s / 2 + Math.sin(a) * s * 0.2);
      g.rotate(a);
      g.fillRect(0, 0, 2 + Math.random() * 8, 1 + Math.random() * 2);
      g.restore();
    }
  }, 64);
}

function texCrack() {
  return texto((g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 3, s / 2, s / 2, s * 0.35);
    grad.addColorStop(0, 'rgba(12,18,22,0.85)');
    grad.addColorStop(0.5, 'rgba(150,180,196,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
      g.strokeStyle = `rgba(226,240,248,${(0.2 + Math.random() * 0.45).toFixed(2)})`;
      g.lineWidth = Math.random() < 0.7 ? 1 : 1.6;
      g.beginPath();
      g.moveTo(s / 2, s / 2);
      let x = s / 2, y = s / 2, ang = a;
      for (let k = 0; k < 4; k++) {
        ang += (Math.random() - 0.5) * 0.6;
        x += Math.cos(ang) * (3 + Math.random() * 7);
        y += Math.sin(ang) * (3 + Math.random() * 7);
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }, 64);
}

function makeSmokeTex() {
  return texto((g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s * 0.47);
    grad.addColorStop(0, 'rgba(255,255,255,0.92)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.42)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }, 64);
}

function makeFlashTex() {
  return texto((g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s * 0.48);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(255,236,190,0.9)');
    grad.addColorStop(0.5, 'rgba(255,176,86,0.34)');
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    g.save();
    g.translate(s / 2, s / 2);
    for (let i = 0; i < 7; i++) {
      g.rotate(Math.PI / 7);
      g.fillStyle = 'rgba(255,224,168,0.24)';
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(s * 0.5, -1.4);
      g.lineTo(s * 0.5, 1.4);
      g.closePath();
      g.fill();
    }
    g.restore();
  }, 64);
}

function pool(scene, cap, make) {
  const p = { arr: [], livre: [], ativo: 0 };
  for (let i = 0; i < cap; i++) {
    const o = make(i);
    o.visible = false;
    scene.add(o);
    p.arr.push(o);
    p.livre.push(o);
  }
  p.pega = () => (p.livre.length ? p.livre.pop() : null);
  p.devolve = (o) => { o.visible = false; p.livre.push(o); };
  return p;
}

export class FX {
  constructor(scene) {
    this.scene = scene;

    this.texHole = { pock: texPock(), irregular: texIrregular(), scuff: texScuff(), splinter: texSplinter(), crack: texCrack() };
    this.texSmoke = makeSmokeTex();
    this.texFlash = makeFlashTex();

    this._cacheCor = new Map();
    this._cacheDecal = new Map();

    this.sparkGeo = new THREE.SphereGeometry(0.03, 4, 3);
    this.debrisGeo = new THREE.SphereGeometry(0.045, 4, 3);
    this.bloodGeo = new THREE.SphereGeometry(0.028, 5, 4);
    this.casingGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6);
    this.decalGeo = new THREE.PlaneGeometry(0.28, 0.28);

    this.sparkPool = pool(scene, 260, () => new THREE.Mesh(this.sparkGeo));
    this.debrisPool = pool(scene, 180, () => new THREE.Mesh(this.debrisGeo));
    this.smokePool = pool(scene, 110, () => new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.texSmoke, transparent: true, opacity: 0.3, depthWrite: false,
    })));
    this.flashPool = pool(scene, 8, () => new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.texFlash, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    })));
    this.lightPool = pool(scene, Math.max(2, IMPACT_LIMITS.maxLights + 1), () => {
      const l = new THREE.PointLight(0xffc773, 0, 14, 2);
      return l;
    });

    this.decalPool = pool(scene, DECAL_LIMITS.maxActive, (i) => {
      const m = new THREE.Mesh(this.decalGeo, new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, opacity: 0,
        polygonOffset: true, polygonOffsetFactor: -4,
      }));
      m.userData.dono = i;
      return m;
    });

    this.tracerGeo = new THREE.CylinderGeometry(0.016, 0.016, 1, 4, 1, true);
    this.tracerPool = pool(scene, 24, () => new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0.85, depthWrite: false,
      blending: THREE.AdditiveBlending,
    })));
    this.casingPool = pool(scene, 48, () => new THREE.Mesh(this.casingGeo, new THREE.MeshStandardMaterial({
      color: 0xc9a24a, metalness: 0.9, roughness: 0.3,
    })));
    this.bloodPool = pool(scene, 160, () => new THREE.Mesh(this.bloodGeo, new THREE.MeshBasicMaterial({
      color: 0x5a0608, transparent: true, opacity: 0.95,
    })));

    this.tracers = [];
    this.particulas = [];
    this.smokes = [];
    this.casings = [];
    this.bloods = [];
    this.decaisAtivos = [];
    this.bloodPools = [];
    this.explosoes = [];
    this.flashes = [];
    this.luzes = [];

    this.poolIdx = 0;
    this.muzzleT = 0;

    const geo = new THREE.CircleGeometry(0.5, 14);
    const mats = [0x3a0405, 0x520709, 0x2b0303].map(c => new THREE.MeshBasicMaterial({
      color: c, transparent: true, opacity: 0.88, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2,
    }));
    for (let i = 0; i < 36; i++) {
      const m = new THREE.Mesh(geo, mats[i % 3]);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.bloodPools.push(m);
    }
  }

  _matCor(hex) {
    let m = this._cacheCor.get(hex);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: hex });
      this._cacheCor.set(hex, m);
    }
    return m;
  }

  _matDecal(kind, color) {
    let m = this._cacheDecal.get(kind);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        map: this.texHole[kind] || this.texHole.pock,
        color, transparent: true, depthWrite: false, opacity: 0.9,
        polygonOffset: true, polygonOffsetFactor: -4,
      });
      this._cacheDecal.set(kind, m);
    }
    return m;
  }

  _budget() {
    const pre = Settings.preset();
    return pre && pre.particles !== undefined ? pre.particles : 1;
  }

  setPresetFlash(k) {
    this.presetFlash = Number.isFinite(k) ? Math.max(0, k) : 1;
  }

  _flashScale() {
    const v = Settings.get('flashScale');
    const base = v === undefined ? 1 : v;
    return base * (this.presetFlash === undefined ? 1 : this.presetFlash);
  }

  _acendeLuz(pos, cor, intensidade, dur, dist) {
    for (const l of this.luzes) {
      if (l.vida <= 0) {
        l.light.position.copy(pos);
        l.light.color.setHex(cor);
        l.light.distance = dist || 14;
        l.light.intensity = intensidade;
        l.vida = dur;
        l.total = dur;
        return l.light;
      }
    }
    const light = this.lightPool.pega();
    if (!light) return null;
    light.visible = true;
    light.position.copy(pos);
    light.color.setHex(cor);
    light.distance = dist || 14;
    light.intensity = intensidade;
    this.luzes.push({ light, vida: dur, total: dur });
    return light;
  }

  _addParticula(obj, vel, life, grav, kind) {
    this.particulas.push({ obj, vel, life, lifeMax: life, grav, kind });
  }

  _fumaca(pos, size, color, opacity, vel, life, grow) {
    const s = this.smokePool.pega();
    if (!s) return null;
    s.visible = true;
    s.position.copy(pos);
    s.scale.setScalar(size);
    s.material.color.setHex(color);
    s.material.opacity = opacity;
    this.smokes.push({ sprite: s, vel: vel || new THREE.Vector3(0, 0.25, 0), life, lifeMax: life, grow: grow || 1.4 });
    return s;
  }

  tracer(from, to, speed = 320) {
    const m = this.tracerPool.pega();
    if (!m) return;
    const len = from.distanceTo(to);
    m.visible = true;
    m.material.opacity = 0.85;
    m.scale.set(1, Math.min(6, len * 0.35), 1);
    m.position.copy(from);
    m.lookAt(to);
    m.rotateX(Math.PI / 2);
    m.userData.len = len;
    this.tracers.push({ mesh: m, from: from.clone(), to: to.clone(), t: 0, speed, dir: to.clone().sub(from).normalize() });
  }

  muzzleFlash(pos, dir) {
    this.muzzleT = 1;
    const fs = this._flashScale();
    const pre = Settings.preset();
    const flashCfg = pre && pre.muzzleFlash ? pre.muzzleFlash : null;
    const escala = (flashCfg && flashCfg.scale) || 1;
    const escalaTotal = escala * (0.6 + fs * 0.4);

    const giro = Math.random() < 0.5 ? 1 : -1;
    const tamanho = 0.9 + Math.random() * 0.22;
    const principal = this.flashPool.pega();
    if (principal) {
      principal.visible = true;
      principal.position.copy(pos).addScaledVector(dir, 0.06);
      principal.scale.setScalar(0.26 * escalaTotal * tamanho);
      principal.material.rotation = giro * (0.2 + Math.random() * 0.5);
      principal.material.opacity = 0.95;
      this.flashes.push({ sprite: principal, life: 0.05, lifeMax: 0.05, grow: 0.7 });
    }
    const secundario = this.flashPool.pega();
    if (secundario) {
      secundario.visible = true;
      secundario.position.copy(pos).addScaledVector(dir, 0.09).add(randVec(0.03));
      secundario.scale.setScalar(0.11 * escalaTotal * tamanho);
      secundario.material.rotation = -giro * (0.1 + Math.random() * 0.4);
      secundario.material.opacity = 0.32;
      this.flashes.push({ sprite: secundario, life: 0.07, lifeMax: 0.07, grow: 0.5 });
    }

    const nFumaca = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < nFumaca; i++) {
      this._fumaca(
        pos.clone().addScaledVector(dir, 0.2 + i * 0.12).add(randVec(0.05)),
        0.22 + i * 0.08, 0x6b6459, 0.22,
        dir.clone().multiplyScalar(1.1).add(randVec(0.4)).setY(rand(0.2, 0.6)),
        0.55, 1.6,
      );
    }

    const nFagulhas = 3 + Math.round(3 * this._budget());
    for (let i = 0; i < nFagulhas; i++) {
      const p = this.sparkPool.pega();
      if (!p) break;
      p.visible = true;
      p.material = this._matCor(0xffdc9a);
      p.position.copy(pos).addScaledVector(dir, 0.12);
      const v = dir.clone().multiplyScalar(rand(3, 9)).add(randVec(2.4));
      this._addParticula(p, v, rand(0.16, 0.34), 12, 'spark');
    }

    const luz = this._acendeLuz(pos.clone().addScaledVector(dir, 0.25), 0xffc078, 46 * fs, 0.075, 20);
    if (luz) luz.distance = 20;
  }

  impact(point, normal, id) {
    const s = surfaceOf(id === 'flesh' ? 'flesh' : id);
    const normalV = normal && normal.lengthSq() > 0.0001 ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
    const pos = point.clone();
    const budget = this._budget();
    if (budget <= 0) return;

    if (s.id === 'flesh') {
      if (Settings.get('bloodEnabled') !== false) this.bloodSpray(pos, normalV, 1);
      return;
    }

    if (s.decal && s.decal.kind !== 'none') {
      const d = this.decalPool.pega();
      if (d) {
        d.visible = true;
        d.position.copy(pos).addScaledVector(normalV, 0.012);
        _q.setFromUnitVectors(_eixo, normalV);
        d.quaternion.copy(_q);
        d.rotateZ(Math.random() * Math.PI * 2);
        d.scale.setScalar(s.decal.scale * (0.75 + Math.random() * 0.6));
        d.material = this._matDecal(s.decal.kind, s.decal.color);
        d.material.opacity = s.decal.opacity;
        this.decaisAtivos.push({ mesh: d, vida: s.decal.fade, vidaMax: s.decal.fade });
      }
    }

    const poeira = Math.round((s.dust ? s.dust.count : 0) * budget);
    for (let i = 0; i < poeira; i++) {
      this._fumaca(
        pos.clone().addScaledVector(normalV, 0.05).add(randVec(0.12)),
        (s.dust.size || 0.4) * rand(0.7, 1.3),
        s.dust.color, s.dust.opacity * rand(0.7, 1.2),
        normalV.clone().multiplyScalar(rand(0.3, 1.2)).add(randVec(0.5)).setY(rand(0.1, 0.5)),
        (s.dust.life || 1) * rand(0.8, 1.2), 1.5,
      );
    }

    const lascas = Math.round((s.chips ? s.chips.count : 0) * budget);
    for (let i = 0; i < lascas; i++) {
      const p = this.debrisPool.pega();
      if (!p) break;
      p.visible = true;
      p.material = this._matCor(s.chips.color);
      p.position.copy(pos);
      p.scale.setScalar(rand(0.5, 1.2));
      const v = normalV.clone().multiplyScalar(rand(1.4, 3.2)).add(randVec(2.2));
      this._addParticula(p, v, rand(0.4, 0.9) * (s.chips.life || 0.7), s.chips.gravity || 13, 'debris');
    }

    const faiscas = Math.round((s.sparks ? s.sparks.count : 0) * budget);
    for (let i = 0; i < faiscas; i++) {
      const p = this.sparkPool.pega();
      if (!p) break;
      p.visible = true;
      p.material = this._matCor(s.id === 'metal' ? 0xffe0a0 : 0xffc98a);
      p.position.copy(pos);
      const v = normalV.clone().multiplyScalar(rand(2.4, 4.8)).add(randVec(3.4));
      this._addParticula(p, v, rand(0.12, 0.3) * (s.sparks.life || 0.2) * 4, 14, 'spark');
    }

    if (s.flash && s.flash.intensity > 0 && this._budget() > 0.5) {
      const luz = this._acendeLuz(pos.clone().addScaledVector(normalV, 0.2), s.flash.color, s.flash.intensity * 8 * this._flashScale(), s.flash.duration, 6);
      if (luz) luz.distance = 6;
    }
  }

  bloodSpray(point, dir, force = 1) {
    if (Settings.get('bloodEnabled') === false) return;
    const budget = this._budget();
    const bandeiras = Math.round(5 * budget);
    for (let i = 0; i < bandeiras; i++) {
      this._fumaca(
        point.clone().add(randVec(0.1)), 0.35 + Math.random() * 0.4, 0x5a0608, 0.4,
        dir.clone().multiplyScalar(1.2 * force).add(randVec(1.1)), 0.4, 2.4,
      );
    }
    const gotas = Math.round(14 * budget);
    for (let i = 0; i < gotas; i++) {
      const p = this.bloodPool.pega();
      if (!p) break;
      p.visible = true;
      p.position.copy(point);
      p.scale.setScalar(0.4 + Math.random() * 1.2);
      const v = dir.clone().multiplyScalar((2.5 + Math.random() * 4.5) * force).add(randVec(2.2 * force));
      this._addParticula(p, v, 0.9, 22, 'blood');
    }
    this.bloodPoolDecal(point, force);
  }

  spawnDust(point, size) {
    this._fumaca(
      point.clone(), 0.9 * size, 0xcfc8bc, 0.3,
      new THREE.Vector3(rand(-0.3, 0.3), rand(0.2, 0.6), rand(-0.3, 0.3)), 1.2, 1.5,
    );
  }

  bloodPoolDecal(point, force = 1) {
    const n = 3;
    for (let j = 0; j < n; j++) {
      const p = this.bloodPools[(this.poolIdx++) % this.bloodPools.length];
      p.visible = true;
      p.position.set(
        point.x + (Math.random() - 0.5) * 0.5,
        0.021 + j * 0.001,
        point.z + (Math.random() - 0.5) * 0.5);
      p.rotation.z = Math.random() * Math.PI * 2;
      p.scale.setScalar((0.4 + Math.random() * 0.7) * force);
      p.userData.grow = 0.35 * force;
    }
  }

  casing(pos, rightDir, forwardDir) {
    const c = this.casingPool.pega();
    if (!c) return;
    c.visible = true;
    c.position.copy(pos);
    c.rotation.set(0, 0, 0);
    this.casings.push({
      mesh: c,
      vel: rightDir.clone().multiplyScalar(2 + Math.random())
        .add(_v2.set(rand(-0.5, 0.5), rand(1.5, 2.5), rand(-0.5, 0.5))),
      angVel: randVec(14),
      life: 4,
    });
  }

  explosion(pos) {
    const fire = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa63d, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    fire.position.copy(pos);
    this.scene.add(fire);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.55, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe8b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    const budget = this._budget();
    for (let i = 0; i < Math.round(22 * budget); i++) {
      this._fumaca(pos.clone().add(randVec(1.2)), 1.6, 0x2a2a2a, 0.7, randVec(3).setY(rand(1, 4)), 2.4, 2.2);
    }
    this._acendeLuz(pos.clone(), 0xffa04a, 90 * this._flashScale(), 0.35, 26);
    this.explosoes.push({ fire, ring, t: 0 });
  }

  update(dt, camPos) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t += tr.speed * dt;
      if (tr.t > tr.mesh.userData.len) {
        this.tracerPool.devolve(tr.mesh);
        this.tracers.splice(i, 1);
        continue;
      }
      tr.mesh.position.copy(tr.from).addScaledVector(tr.dir, tr.t);
      tr.mesh.material.opacity = 0.85 * Math.min(1, (tr.mesh.userData.len - tr.t) / 4);
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.flashPool.devolve(f.sprite);
        this.flashes.splice(i, 1);
        continue;
      }
      const k = f.life / f.lifeMax;
      f.sprite.material.opacity = k * 0.95;
      f.sprite.scale.multiplyScalar(1 + f.grow * dt * 6);
    }

    for (let i = this.luzes.length - 1; i >= 0; i--) {
      const l = this.luzes[i];
      l.vida -= dt;
      if (l.vida <= 0) {
        l.light.intensity = 0;
        l.light.visible = false;
        this.lightPool.devolve(l.light);
        this.luzes.splice(i, 1);
        continue;
      }
      const k = l.vida / l.total;
      l.light.intensity *= Math.max(0, k);
    }

    if (this.muzzleT > 0) this.muzzleT = Math.max(0, this.muzzleT - dt * 12);

    for (let i = this.particulas.length - 1; i >= 0; i--) {
      const p = this.particulas[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.kind === 'spark') this.sparkPool.devolve(p.obj);
        else if (p.kind === 'debris') this.debrisPool.devolve(p.obj);
        else if (p.kind === 'blood') this.bloodPool.devolve(p.obj);
        this.particulas.splice(i, 1);
        continue;
      }
      p.vel.y -= (p.grav || 10) * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.obj.position.y < 0.03) {
        p.obj.position.y = 0.03;
        p.vel.y *= -0.35;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
      }
    }

    for (const p of this.bloodPools) {
      if (p.visible && p.userData.grow > 0) {
        p.scale.addScalar(p.userData.grow * dt);
        p.userData.grow = Math.max(0, p.userData.grow - dt * 0.4);
      }
    }

    for (let i = this.decaisAtivos.length - 1; i >= 0; i--) {
      const d = this.decaisAtivos[i];
      d.vida -= dt;
      if (d.vida <= 0) {
        this.decalPool.devolve(d.mesh);
        this.decaisAtivos.splice(i, 1);
        continue;
      }
      if (d.vida < DECAL_LIMITS.fadeOut) d.mesh.material.opacity = Math.max(0, d.vida / DECAL_LIMITS.fadeOut) * 0.9;
    }

    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.casingPool.devolve(c.mesh);
        this.casings.splice(i, 1);
        continue;
      }
      c.vel.y -= 12 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.angVel.x * dt;
      c.mesh.rotation.y += c.angVel.y * dt;
      c.mesh.rotation.z += c.angVel.z * dt;
      if (c.mesh.position.y < 0.02) {
        c.mesh.position.y = 0.02;
        c.vel.y *= -0.4; c.vel.x *= 0.8; c.vel.z *= 0.8;
        c.angVel.multiplyScalar(0.6);
      }
    }

    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.smokePool.devolve(s.sprite);
        this.smokes.splice(i, 1);
        continue;
      }
      s.sprite.position.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(1 - dt * 0.5);
      const k = s.life / s.lifeMax;
      s.sprite.material.opacity = Math.min(0.4, k * 0.8);
      s.sprite.scale.addScalar(s.grow * dt);
    }

    for (let i = this.explosoes.length - 1; i >= 0; i--) {
      const e = this.explosoes[i];
      e.t += dt;
      const k = e.t / 0.45;
      e.fire.scale.setScalar(0.5 + k * 3.4);
      e.fire.material.opacity = Math.max(0, 1 - k);
      const rk = e.t / 0.55;
      e.ring.scale.setScalar(1 + rk * 22);
      e.ring.material.opacity = Math.max(0, 0.9 - rk);
      if (e.t > 0.6) {
        e.fire.geometry.dispose();
        e.fire.material.dispose();
        e.ring.geometry.dispose();
        e.ring.material.dispose();
        this.scene.remove(e.fire);
        this.scene.remove(e.ring);
        this.explosoes.splice(i, 1);
      }
    }
  }
}
