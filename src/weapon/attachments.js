import * as THREE from '../../vendor/three.module.js';
import { OPTIC_DEFAULTS, LASER_DEFAULTS } from '../config/weapon-data.js';
import { Settings } from '../config/settings.js';
import { lonaGrao } from '../lona.js';

function clampN(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function reticleTexture(color, weak) {
  const c = lonaGrao(128);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  const hex = '#' + new THREE.Color(color).getHexString();
  g.strokeStyle = hex;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(64, 64, 46, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30);
    g.lineTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44);
    g.stroke();
  }
  g.fillStyle = hex;
  g.beginPath();
  g.arc(64, 64, weak ? 4 : 6, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glassSmudgeTexture() {
  const c = lonaGrao(128);
  const g = c.getContext('2d');
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 128, y = Math.random() * 128, r = 4 + Math.random() * 26;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class HoloSight {
  constructor(optic) {
    const cfg = optic || OPTIC_DEFAULTS.holo;
    this.cfg = cfg;
    this.group = new THREE.Group();
    this.radius = cfg.kind === 'scope' ? 0.024 : 0.024;
    this.ambient = 0;
    this.parallax = new THREE.Vector2();
    this.occlusion = 1;
    this.recoilFlash = 0;

    const housM = new THREE.MeshStandardMaterial({
      color: cfg.housingColor || 0x1b1e22,
      roughness: cfg.housingRoughness || 0.42,
      metalness: cfg.housingMetalness || 0.62,
      envMapIntensity: 0.3,
    });
    const bolt = new THREE.MeshStandardMaterial({ color: 0x0d0f11, roughness: 0.35, metalness: 0.8, envMapIntensity: 0.35 });

    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.05), housM);
    mount.position.set(0, -0.026, 0.012);
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.016, 0.02), housM);
    riser.position.set(0, -0.014, 0.012);
    const ringF = new THREE.Mesh(new THREE.TorusGeometry(this.radius, 0.0032, 8, 22), housM);
    ringF.position.set(0, 0, -0.026);
    const ringR = new THREE.Mesh(new THREE.TorusGeometry(this.radius, 0.0032, 8, 22), housM);
    ringR.position.set(0, 0, 0.026);
    const hoodT = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.052), housM);
    hoodT.position.set(0, this.radius + 0.002, 0);
    const hoodB = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.052), housM);
    hoodB.position.set(0, -this.radius - 0.002, 0);
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 0.05), housM);
    sideL.position.set(-this.radius - 0.002, 0.004, 0);
    const sideR = sideL.clone();
    sideR.position.x = this.radius + 0.002;
    const bossL = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.006, 8), bolt);
    bossL.rotation.z = Math.PI / 2;
    bossL.position.set(-this.radius - 0.006, -0.008, 0.012);
    const bossR = bossL.clone();
    bossR.position.x = this.radius + 0.006;
    const emitter = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.008), housM);
    emitter.position.set(0, -0.004, 0.03);

    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: cfg.lensColor || 0x0d2634,
      transparent: true,
      opacity: cfg.lensOpacity !== undefined ? cfg.lensOpacity : 0.34,
      roughness: cfg.lensRoughness || 0.06,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMapIntensity: 1.4,
    });
    this.glass = new THREE.Mesh(new THREE.CircleGeometry(this.radius * 0.94, 20), this.glassMat);
    this.glass.position.set(0, 0, 0.018);

    if (cfg.kind !== 'scope') {
      this.smudgeMat = new THREE.MeshBasicMaterial({
        map: glassSmudgeTexture(), transparent: true, opacity: (cfg.lensDirt || 0.35) * 0.5,
        depthWrite: false, blending: THREE.AdditiveBlending, color: 0x223033,
      });
      this.smudge = new THREE.Mesh(new THREE.CircleGeometry(this.radius * 0.9, 18), this.smudgeMat);
      this.smudge.position.set(0, 0, 0.0165);
      this.group.add(this.smudge);
    }

    const ret = cfg.reticle || OPTIC_DEFAULTS.holo.reticle;
    this.reticleCfg = ret;
    this.reticleMat = new THREE.MeshBasicMaterial({
      map: reticleTexture(ret.color, cfg.kind === 'scope'),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: cfg.kind === 'scope' ? THREE.NormalBlending : THREE.AdditiveBlending,
      color: new THREE.Color(ret.color),
      toneMapped: false,
    });
    this.reticle = new THREE.Mesh(new THREE.PlaneGeometry(this.radius * 1.5, this.radius * 1.5), this.reticleMat);
    this.reticle.position.set(0, 0, -0.004);
    this.reticle.renderOrder = 6;

    this.group.add(mount, riser, ringF, ringR, hoodT, hoodB, sideL, sideR, bossL, bossR, emitter, this.glass, this.reticle);
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  }

  pulse(strength) {
    this.recoilFlash = Math.min(1.4, this.recoilFlash + (strength || 0.8));
  }

  update(dt, ctx) {
    const ret = this.reticleCfg;
    const ambiente = Math.min(1, Math.max(0, ctx.ambient || 0));
    const alvo = ret.maxIntensity + (ret.minIntensity - ret.maxIntensity) * ambiente;
    this.ambient += (alvo - this.ambient) * Math.min(1, dt * 6);

    this.recoilFlash = Math.max(0, this.recoilFlash - dt * 3.4);
    const intensidade = this.ambient * (1 + this.recoilFlash * 0.5);
    this.reticleMat.color.setRGB(
      Math.min(1.6, (ret.color >> 16 & 255) / 255 * intensidade),
      Math.min(1.6, (ret.color >> 8 & 255) / 255 * intensidade),
      Math.min(1.6, (ret.color & 255) / 255 * intensidade),
    );

    const adsK = ctx.adsK || 0;
    const alvoOclusao = Math.min(1, Math.max(0, (adsK - 0.18) / 0.45));
    this.occlusion += (alvoOclusao - this.occlusion) * Math.min(1, dt * 8);
    const fade = this.cfg.occlusionFade !== undefined ? this.cfg.occlusionFade : 0.35;
    const alvoOpacidade = (this.cfg.lensOpacity || 0.34) * (1 - fade + fade * this.occlusion);
    this.glassMat.opacity += (alvoOpacidade - this.glassMat.opacity) * Math.min(1, dt * 8);
    this.reticle.visible = this.occlusion > 0.05;

    const par = this.cfg.parallax || 0;
    const a = ctx.axisDir;
    const cam = ctx.cameraAxis;
    const limite = this.radius * 0.3;
    let tx = 0, ty = 0;
    if (par > 0 && a && cam) {
      tx = clampN((a.x - cam.x) * par * 26, -limite, limite);
      ty = clampN((a.y - cam.y) * par * 26, -limite, limite);
    }
    this.parallax.set(tx, ty);
    const k = Math.min(1, dt * (8 + adsK * 14));
    this.reticle.position.x += (tx - this.reticle.position.x) * k;
    this.reticle.position.y += (ty - this.reticle.position.y) * k;

    if (this.smudgeMat) {
      const cfg = Settings.preset();
      this.smudge.visible = cfg.lensDirt !== false && adsK > 0.2;
      this.smudgeMat.opacity = (this.cfg.lensDirt || 0.35) * 0.5 * this.occlusion;
    }
  }
}

export class LaserModule {
  constructor(cfg, worldScene) {
    this.cfg = { ...LASER_DEFAULTS, ...(cfg || {}) };
    this.scene = worldScene;
    this.enabled = this.cfg.enabled !== false;
    this.on = false;
    this.timer = 0;
    this.distance = 0;

    this.beamMat = new THREE.MeshBasicMaterial({
      color: this.cfg.color, transparent: true, opacity: this.cfg.beamOpacity,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6, 1, true), this.beamMat);
    this.beam.visible = false;
    this.beam.renderOrder = 4;

    this.dotMat = new THREE.MeshBasicMaterial({
      color: this.cfg.color, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    });
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(1, 14), this.dotMat);
    this.dot.visible = false;
    this.dot.renderOrder = 5;

    this.emitterMat = new THREE.MeshBasicMaterial({ color: this.cfg.color, toneMapped: false });
    this.emitter = new THREE.Mesh(new THREE.CircleGeometry(0.004, 10), this.emitterMat);
    this.emitter.visible = false;

    this.spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.006, 6, 5),
      new THREE.MeshBasicMaterial({ color: this.cfg.color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.spark.visible = false;

    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);

    if (worldScene) worldScene.add(this.beam, this.dot, this.emitter, this.spark);
  }

  setEnabled(on) {
    this.on = !!on && this.enabled;
    if (this.emitterGroup) this.emitterGroup.visible = this.on;
    if (!this.on) this.hide();
  }

  setIntensity(v) {
    this.cfg.beamOpacity = v;
  }

  pulse() {
    this.timer = 0;
    this.spark.visible = this.on;
  }

  hide() {
    this.beam.visible = false;
    this.dot.visible = false;
    this.emitter.visible = false;
    this.spark.visible = false;
  }

  syncEmitter(parent, localPos) {
    if (!this.emitterGroup) {
      this.emitterGroup = new THREE.Group();
      this.emitterGroup.add(this.emitter);
      this.emitterGroup.position.copy(localPos);
      if (parent) parent.add(this.emitterGroup);
    }
    this.emitter.visible = this.on;
  }

  update(dt, ctx) {
    if (!this.enabled) { this.hide(); return; }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.033;

    if (!this.on) { this.hide(); return; }
    const origem = ctx.origin;
    const direcao = ctx.direction;
    if (!origem || !direcao) { this.hide(); return; }

    this._a.copy(origem).addScaledVector(direcao, 0.5);
    this._b.copy(origem).addScaledVector(direcao, this.cfg.maxDistance);
    const hit = ctx.probe ? ctx.probe(this._a, this._b) : null;
    const alcance = hit ? Math.max(0.6, hit.t * this.cfg.maxDistance) : this.cfg.maxDistance;

    this._a.copy(origem).addScaledVector(direcao, 0.35);
    this._b.copy(origem).addScaledVector(direcao, alcance);
    this.distance = alcance;

    if (ctx.beamVisible && Settings.preset().beam) {
      const comprimento = this._a.distanceTo(this._b);
      this.beam.visible = true;
      this.beam.position.copy(this._a).add(this._b).multiplyScalar(0.5);
      this.beam.scale.set(1, comprimento, 1);
      this._dir.copy(this._b).sub(this._a).normalize();
      this.beam.quaternion.setFromUnitVectors(this._up, this._dir);
      const nevoa = 1 + (ctx.smoke || 0) * this.cfg.visibleInSmoke;
      this.beamMat.opacity = this.cfg.beamOpacity * Settings.get('laserVisibility') * nevoa;
    } else {
      this.beam.visible = false;
    }

    const ponto = this._b;
    this.dot.visible = true;
    this.dot.position.copy(ponto);
    this.dot.scale.setScalar(this.cfg.dotSize * (1 + alcance * 0.006));
    if (hit && hit.normal) {
      this.dot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal.clone().normalize());
    } else {
      this.dot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._dir);
    }
    let brilho = 0.95;
    if (this.cfg.surfaceDimming && hit && hit.kind) {
      if (hit.kind === 'metal' || hit.kind === 'glass') brilho = 0.45;
      else if (hit.kind === 'fabric' || hit.kind === 'wood') brilho = 0.75;
    }
    this.dotMat.opacity = brilho * Settings.get('laserVisibility');
    this.emitter.visible = this.on;

    if (this.spark.visible) {
      this.spark.position.copy(ponto);
      this.spark.material.opacity = Math.max(0, (this.timer + dt) * 2);
      if (this.timer <= -0.08) this.spark.visible = false;
    }
  }
}

export class AttachmentHost {
  constructor(vmScene, worldScene) {
    this.vmScene = vmScene;
    this.worldScene = worldScene;
    this.sights = [];
    this.lasers = [];
  }

  addSight(modelKey, group, optic, position) {
    const sight = new HoloSight(optic);
    sight.group.position.copy(position);
    group.add(sight.group);
    sight.modelKey = modelKey;
    this.sights.push(sight);
    return sight;
  }

  addLaser(modelKey, group, cfg, position) {
    const laser = new LaserModule(cfg, this.worldScene);
    laser.syncEmitter(group, position);
    laser.modelKey = modelKey;
    laser.localPos = position.clone();
    this.lasers.push(laser);
    return laser;
  }

  active(modelKey) {
    return {
      sight: this.sights.find(s => s.modelKey === modelKey) || null,
      laser: this.lasers.find(l => l.modelKey === modelKey) || null,
    };
  }
}
