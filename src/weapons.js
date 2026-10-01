import * as THREE from '../vendor/three.module.js';
import { clamp, dampF } from './physics.js';
import { WEAPONS, RECOIL_PROFILE, VIEWMODEL } from './config/weapon-data.js';
import { Settings } from './config/settings.js';
import { WeaponAnimationController } from './weapon/anim-controller.js';
import { AttachmentHost } from './weapon/attachments.js';

const _camPos = new THREE.Vector3();
const _camDir = new THREE.Vector3(0, 0, -1);
const _camRight = new THREE.Vector3(1, 0, 0);
const _vel = new THREE.Vector3();
const _laserOrigem = new THREE.Vector3();
const _laserDir = new THREE.Vector3();
const _lente = new THREE.Vector3();
const _lenteEixo = new THREE.Vector3();
const _olhoLente = new THREE.Vector3();

function escurecer(hex, k) {
  const v = parseInt(hex.slice(1), 16);
  const r = ((v >> 16) & 255) * k | 0;
  const g = ((v >> 8) & 255) * k | 0;
  const b = (v & 255) * k | 0;
  return `rgb(${r},${g},${b})`;
}

function grainCanvas(base, grain, scratches, wear, grooves) {
  if (base.charAt(0) === '#') base = escurecer(base, 0.5);
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const light = Math.random() < 0.5;
    g.fillStyle = `rgba(${light ? '255,255,255' : '0,0,0'},${(Math.random() * grain).toFixed(3)})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  for (let i = 0; i < scratches; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const len = 8 + Math.random() * 70, a = Math.random() * Math.PI;
    g.strokeStyle = `rgba(${Math.random() < 0.6 ? '205,212,224' : '12,12,16'},${(wear * (0.3 + Math.random() * 0.7)).toFixed(3)})`;
    g.lineWidth = Math.random() < 0.8 ? 1 : 2;
    g.beginPath(); g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 20 + Math.random() * 70;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, 'rgba(0,0,0,0.15)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (grooves) {
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 3;
    for (let y = 64; y < 512; y += 96) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    for (let x = 64; x < 512; x += 96) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
  }
  return c;
}
function texPair(canvas) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(canvas);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

export class Weapons {
  constructor(camera, fx, audio, worldScene, phys) {
    this.camera = camera;
    this.fx = fx;
    this.audio = audio;
    this.worldScene = worldScene || null;
    this.phys = phys || null;
    this.attachments = null;
    this.laser = null;
    this.sight = null;
    this.ambient = 0.3;
    this.smokeNear = 0;
    this.laserOn = Settings.get('laser') !== false;
    this._slotSetup = -1;

    this.slot = 0;
    this.switching = 0;
    this.ads = false;
    this.adsK = 0;
    this.recoilK = 0;
    this.recoilYaw = 0;
    this.recoilV = 0;
    this.recoilYawV = 0;
    this.bobT = 0;
    this.shakeT = 0;
    this.reloadT = 0;
    this.reloadStage = 0;
    this.grenades = 4;
    this.grenadeCd = 0;
    this.suppOn = true;
    this.suppT = 0;
    this.suppDir = 0;
    this.suppStage = 0;

    this.defs = WEAPONS.map(w => ({
      ...w,
      recoilProfile: w.recoil ? RECOIL_PROFILE[w.recoil] : null,
    }));
    this.SLOT_RIFLE = 0; this.SLOT_DEAGLE = 1; this.SLOT_SNIPER = 2; this.SLOT_GRENADE = 3;
    this.SLOT_MP5 = 4; this.SLOT_PUMP = 5;

    this.anim = new WeaponAnimationController(Settings.data);
    this.throwK = 0;
    this.moveK = 0;
    this.blocked = false;

    this.buildViewModel();
    this.setupAttachments();
    if (phys) {
      this.setProbe((a, b) => {
        const h = phys.segmentHit(a, b);
        return h ? { t: h.t, normal: h.normal, point: h.point, kind: h.surface || h.kind } : null;
      });
    }
    this.syncWeapon();
  }

  setupAttachments() {
    if (!this.worldScene) return;
    this.attachments = new AttachmentHost(this.vmScene, this.worldScene);
    const entradas = [
      ['rifle', this.rifle, 0, this.rifleParts.optic],
      ['smg', this.smg, 4, this.smgParts.optic],
      ['sniper', this.sniper, 2, this.sniperParts.optic],
      ['shotgun', this.shotgun, 5, this.shotgunParts ? this.shotgunParts.optic : null],
    ];
    for (const [chave, grupo, slot, noLegado] of entradas) {
      const def = this.defs[slot];
      if (!def || !grupo) continue;
      const pos = (this.OPTICS[chave] || this.OPTICS.rifle).clone();
      const optic = def.optic;
      if (optic && optic.kind !== 'iron') {
        const sight = this.attachments.addSight(chave, grupo, optic, pos);
        if (noLegado) noLegado.visible = false;
        sight.group.visible = false;
      }
      if (def.laser && def.laser.enabled) {
        const laser = this.attachments.addLaser(chave, grupo, def.laser, pos);
        laser.localPos = pos;
        laser.setEnabled(this.laserOn);
      }
    }
  }

  syncWeapon() {
    const d = this.def;
    this.anim.setWeapon(d, this.currentParts(), this.opticLocalFor(d));
    this._slotSetup = this.slot;
    const ativo = this.attachments ? this.attachments.active(d.model) : null;
    this.sight = ativo ? ativo.sight : null;
    this.laser = ativo ? ativo.laser : null;
    if (this.sight) this.sight.group.visible = true;
    if (this.laser) this.laser.setEnabled(this.laserOn && d.laser && d.laser.enabled);
  }

  setProbe(fn) {
    this.probe = fn;
    this.anim.setProbe(fn);
  }

  setAmbient(v) {
    this.ambient = clamp(v, 0, 1);
  }

  toggleLaser() {
    const d = this.def;
    if (!d.laser || !d.laser.enabled) return false;
    this.laserOn = !this.laserOn;
    Settings.set('laser', this.laserOn);
    if (this.laser) this.laser.setEnabled(this.laserOn);
    this.audio.reload(0);
    return this.laserOn;
  }

  buildViewModel() {
    const g = new THREE.Group();

    const steel = texPair(grainCanvas('#3d434c', 0.10, 30, 0.24, false));
    const steel2 = texPair(grainCanvas('#4f5762', 0.08, 20, 0.18, false));
    const poly = texPair(grainCanvas('#22252a', 0.12, 8, 0.10, false));
    const olive = texPair(grainCanvas('#46533a', 0.12, 6, 0.14, true));

    const woodC = document.createElement('canvas'); woodC.width = woodC.height = 512;
    {
      const g = woodC.getContext('2d');
      g.fillStyle = '#7a4a26'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 70; i++) {
        g.strokeStyle = `rgba(${40 + Math.random() * 30},${18 + Math.random() * 16},6,${0.25 + Math.random() * 0.4})`;
        g.lineWidth = 1 + Math.random() * 3;
        g.beginPath();
        let y = Math.random() * 512;
        g.moveTo(0, y);
        for (let x = 0; x <= 512; x += 16) { y += (Math.random() - 0.5) * 9; g.lineTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const x = Math.random() * 512, y = Math.random() * 512;
        const rad = g.createRadialGradient(x, y, 0, x, y, 12 + Math.random() * 10);
        rad.addColorStop(0, 'rgba(30,12,4,0.85)'); rad.addColorStop(1, 'rgba(30,12,4,0)');
        g.fillStyle = rad; g.beginPath(); g.arc(x, y, 22, 0, 7); g.fill();
      }
      for (let i = 0; i < 12; i++) {
        g.fillStyle = 'rgba(255,220,170,0.06)';
        g.fillRect(0, Math.random() * 512, 512, 3 + Math.random() * 5);
      }
    }
    const woodPair = texPair(woodC);
    const wood = new THREE.MeshStandardMaterial({
      map: woodPair.map, bumpMap: woodPair.bump, bumpScale: 0.09,
      roughness: 0.55, metalness: 0.05, envMapIntensity: 0.22,
    });
    const blueC = grainCanvas('#2e3238', 0.09, 26, 0.3, false);
    {
      const g = blueC.getContext('2d');
      for (let i = 0; i < 7; i++) {
        const x = Math.random() * 256, y = Math.random() * 256, r = 8 + Math.random() * 26;
        const rad = g.createRadialGradient(x, y, 0, x, y, r);
        rad.addColorStop(0, 'rgba(10,12,16,0.4)'); rad.addColorStop(1, 'rgba(10,12,16,0)');
        g.fillStyle = rad; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    const blued = texPair(blueC);
    const bluedMetal = new THREE.MeshStandardMaterial({
      map: blued.map, bumpMap: blued.bump, bumpScale: 0.14,
      roughness: 0.38, metalness: 0.88, envMapIntensity: 0.32,
    });
    const goldM = new THREE.MeshStandardMaterial({ color: 0xb8933f, roughness: 0.3, metalness: 0.95, envMapIntensity: 0.5 });

    const glove = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.88, envMapIntensity: 0.2 });
    const gunmetal = new THREE.MeshStandardMaterial({
      map: steel.map, bumpMap: steel.bump, bumpScale: 0.15,
      roughness: 0.42, metalness: 0.82, envMapIntensity: 0.3,
    });
    const gunmetal2 = new THREE.MeshStandardMaterial({
      map: steel2.map, bumpMap: steel2.bump, bumpScale: 0.12,
      roughness: 0.5, metalness: 0.75, envMapIntensity: 0.26,
    });
    const polymer = new THREE.MeshStandardMaterial({
      map: poly.map, bumpMap: poly.bump, bumpScale: 0.1,
      roughness: 0.78, metalness: 0.12, envMapIntensity: 0.2,
    });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.45, metalness: 0.7, envMapIntensity: 0.22 });
    const grenadeMat = new THREE.MeshStandardMaterial({
      map: olive.map, bumpMap: olive.bump, bumpScale: 0.12,
      roughness: 0.55, metalness: 0.35, envMapIntensity: 0.5,
    });

    const rifle = new THREE.Group();
    const akRec = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.085, 0.3), bluedMetal);
    akRec.position.set(0, 0.01, -0.02);
    const akDust = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.02, 0.14), gunmetal2);
    akDust.position.set(0, 0.052, 0.0);
    const akSide = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.03, 0.1), darkMetal);
    akSide.position.set(0.037, 0.03, 0.04);
    const akHandU = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.032, 0.2), wood);
    akHandU.position.set(0, 0.028, -0.33);
    const akHandL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.2), wood);
    akHandL.position.set(0, -0.028, -0.33);
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.008, 0.012), darkMetal);
      rib.position.set(0, -0.05, -0.4 + i * 0.05);
      rifle.add(rib);
    }
    const akBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 10), bluedMetal);
    akBarrel.rotation.x = Math.PI / 2; akBarrel.position.set(0, 0.012, -0.56);
    const akGasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.04), bluedMetal);
    akGasBlock.position.set(0, 0.04, -0.44);
    const akGasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), gunmetal2);
    akGasTube.rotation.x = Math.PI / 2; akGasTube.position.set(0, 0.055, -0.38);
    const akFrontTower = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.05, 0.012), bluedMetal);
    akFrontTower.position.set(0, 0.062, -0.66);
    const akFrontPost = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.018, 0.006), darkMetal);
    akFrontPost.position.set(0, 0.092, -0.66);
    const akSlant = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.055, 10), bluedMetal);
    akSlant.rotation.x = Math.PI / 2; akSlant.rotation.z = 0.5; akSlant.position.set(0, 0.012, -0.72);
    const akStock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.1, 0.24), wood);
    akStock.position.set(0, -0.02, 0.26); akStock.rotation.x = 0.1;
    const akStockNeck = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.12), wood);
    akStockNeck.position.set(0, 0.005, 0.12);
    const akGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.05), wood);
    akGrip.position.set(0, -0.1, 0.075); akGrip.rotation.x = -0.35;
    const akMag1 = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.09, 0.068), gunmetal2);
    akMag1.position.set(0, -0.09, -0.04);
    const akMag2 = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.09, 0.062), gunmetal2);
    akMag2.position.set(0, -0.155, -0.015); akMag2.rotation.x = 0.32;
    const akMag3 = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.07, 0.055), gunmetal2);
    akMag3.position.set(0, -0.21, 0.03); akMag3.rotation.x = 0.62;
    const akSelector = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.016, 0.09), darkMetal);
    akSelector.position.set(0.037, 0.0, 0.05);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.028, 0.006), darkMetal);
    trigger.position.set(0, -0.035, 0.03);
    const akGuard = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 14), gunmetal2);
    akGuard.rotation.y = Math.PI / 2; akGuard.position.set(0, -0.045, 0.03);
    const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.04), gunmetal);
    sightBase.position.set(0, 0.068, -0.02);
    const sightPost = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.009, 0.012), gunmetal);
    sightPost.position.set(0, 0.077, -0.02);
    const holoRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.026, 0.0032, 12, 32),
      new THREE.MeshStandardMaterial({ color: 0x0e1013, roughness: 0.42, metalness: 0.55, envMapIntensity: 0.2 })
    );
    holoRing.position.set(0, 0.105, -0.02);
    const holoDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.0022, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3b30 })
    );
    holoDot.position.set(0, 0.105, -0.012);

    rifle.add(
      akRec, akDust, akSide, akHandU, akHandL, akBarrel, akGasBlock, akGasTube,
      akFrontTower, akFrontPost, akSlant, akStock, akStockNeck, akGrip,
      akMag1, akMag2, akMag3, akSelector, trigger, akGuard,
      sightBase, sightPost, holoRing, holoDot
    );
    this.rifle = rifle;
    this.rifleParts = { rMag: akMag3, holoDot, optic: holoRing };

    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.13), glove);
    handL.position.set(0.005, -0.05, -0.33);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), glove);
    armL.position.set(0.03, -0.09, -0.18); armL.rotation.y = 0.35;
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.11), glove);
    handR.position.set(0.005, -0.1, 0.12);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.28), glove);
    armR.position.set(0.05, -0.13, 0.22); armR.rotation.y = -0.3;
    rifle.add(handL, armL, handR, armR);
    rifle.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

    const pistol = new THREE.Group();
    const pSlide = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.075, 0.30), bluedMetal);
    pSlide.position.set(0, 0.018, -0.12);
    const pSlideTop = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.30), gunmetal);
    pSlideTop.position.set(0, 0.062, -0.12);
    const serrations = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.06, 0.045), darkMetal);
    serrations.position.set(0, 0.018, 0.03);
    const pHex = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.06, 6), gunmetal);
    pHex.rotation.x = Math.PI / 2; pHex.position.set(0, 0.012, -0.29);
    const supp = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.14, 12), darkMetal);
    supp.rotation.x = Math.PI / 2; supp.position.set(0, 0.012, -0.38);
    const suppRing1 = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.003, 6, 16), gunmetal2);
    suppRing1.rotation.y = 0; suppRing1.position.set(0, 0.012, -0.33);
    const suppRing2 = suppRing1.clone(); suppRing2.position.z = -0.42;
    const suppGroup = new THREE.Group();
    suppGroup.add(supp, suppRing1, suppRing2);
    const pFrame = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.05, 0.2), gunmetal);
    pFrame.position.set(0, -0.042, -0.06);
    const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.07), polymer);
    pGrip.position.set(0, -0.11, 0.03); pGrip.rotation.x = -0.16;
    const gripL = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.11, 0.055), darkMetal);
    gripL.position.set(0, -0.105, 0.03); gripL.rotation.x = -0.16;
    const pMag = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.1, 0.052), gunmetal2);
    pMag.position.set(0, -0.1, 0.03); pMag.rotation.x = -0.16;
    const baseplate = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.014, 0.072), darkMetal);
    baseplate.position.set(0, -0.155, 0.04); baseplate.rotation.x = -0.16;
    const pGuard = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 14), gunmetal);
    pGuard.rotation.y = Math.PI / 2; pGuard.position.set(0, -0.055, -0.085);
    const pTrigger = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.03, 0.006), darkMetal);
    pTrigger.position.set(0, -0.03, -0.06);
    const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.016, 0.008), darkMetal);
    frontPost.position.set(0, 0.078, -0.24);
    const rearL = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.014, 0.012), darkMetal);
    rearL.position.set(-0.014, 0.077, 0.03);
    const rearR = rearL.clone();
    rearR.position.x = 0.014;
    pistol.add(
      pSlide, pSlideTop, serrations, pHex, suppGroup,
      pFrame, pGrip, gripL, pMag, baseplate, pGuard, pTrigger, frontPost, rearL, rearR
    );
    const phL = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.085, 0.1), glove);
    phL.position.set(-0.005, -0.12, 0.05);
    pistol.add(phL);
    pistol.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    this.pistol = pistol;
    this.pistolParts = { pSlide, pMag, suppGroup, phL };

    const sniper = new THREE.Group();
    const sRec = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.075, 0.3), bluedMetal);
    sRec.position.set(0, 0.005, -0.02);
    const sBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.09, 8), gunmetal);
    sBolt.rotation.x = Math.PI / 2; sBolt.position.set(0.012, 0.02, 0.17);
    const sBoltArm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.045, 8), gunmetal);
    sBoltArm.rotation.z = Math.PI / 2; sBoltArm.position.set(0.032, 0.02, 0.15);
    const sBoltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), gunmetal);
    sBoltKnob.position.set(0.055, 0.02, 0.15);
    const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.34), polymer);
    sBody.position.set(0, -0.01, -0.28);
    const sBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.42, 10), bluedMetal);
    sBarrel.rotation.x = Math.PI / 2; sBarrel.position.set(0, 0.008, -0.62);
    const sMuzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.07, 10), darkMetal);
    sMuzzleBrake.rotation.x = Math.PI / 2; sMuzzleBrake.position.set(0, 0.008, -0.84);
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.26, 14), darkMetal);
    scopeTube.rotation.x = Math.PI / 2; scopeTube.position.set(0, 0.105, -0.12);
    const scopeObj = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.021, 0.07, 14), darkMetal);
    scopeObj.rotation.x = Math.PI / 2; scopeObj.position.set(0, 0.105, -0.26);
    const scopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 14),
      new THREE.MeshBasicMaterial({ color: 0x1a3a4a }));
    scopeLens.position.set(0, 0.105, -0.296);
    const scopeEye = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.017, 0.05, 14), darkMetal);
    scopeEye.rotation.x = Math.PI / 2; scopeEye.position.set(0, 0.105, 0.02);
    const mountRear = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.05, 0.026), darkMetal);
    mountRear.position.set(0, 0.065, -0.02);
    const mountFront = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.022), darkMetal);
    mountFront.position.set(0, 0.055, -0.2);
    const scopeRingF = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 8, 16), gunmetal);
    scopeRingF.position.set(0, 0.105, -0.2);
    const scopeRingR = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 8, 16), gunmetal);
    scopeRingR.position.set(0, 0.105, -0.04);
    const sTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.03, 10), gunmetal);
    sTurret.rotation.z = Math.PI / 2; sTurret.position.set(0.021, 0.105, -0.12);
    const bipMount = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.012, 0.04), darkMetal);
    bipMount.position.set(0, -0.055, -0.42);
    const bipL = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.18, 6), darkMetal);
    bipL.rotation.x = Math.PI / 2 + 0.22; bipL.rotation.z = 0.1;
    bipL.position.set(-0.02, -0.058, -0.4);
    const bipR = bipL.clone(); bipR.position.x = 0.02; bipR.rotation.z = -0.1;
    const sStock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.26), polymer);
    sStock.position.set(0, -0.015, 0.2);
    const sCheek = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.12), polymer);
    sCheek.position.set(0, 0.055, 0.16);
    const sButt = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.03), darkMetal);
    sButt.position.set(0, -0.01, 0.335);
    const sMag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.07), gunmetal2);
    sMag.position.set(0, -0.055, -0.05); sMag.rotation.x = 0.1;
    const sGrip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.1, 0.05), polymer);
    sGrip.position.set(0, -0.09, 0.08); sGrip.rotation.x = -0.3;
    const sTrigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.026, 0.006), darkMetal);
    sTrigger.position.set(0, -0.03, 0.04);
    sniper.add(
      sRec, sBolt, sBoltArm, sBoltKnob, sBody, sBarrel, sMuzzleBrake,
      scopeTube, scopeObj, scopeLens, scopeEye, mountRear, mountFront, scopeRingF, scopeRingR, sTurret,
      bipMount, bipL, bipR, sStock, sCheek, sButt, sMag, sGrip, sTrigger
    );
    const shL = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.085, 0.11), glove);
    shL.position.set(-0.005, -0.07, -0.28);
    const shR = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.085, 0.1), glove);
    shR.position.set(-0.005, -0.09, 0.13);
    sniper.add(shL, shR);
    sniper.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    this.sniper = sniper;
    this.sniperParts = { rMag: sMag, optic: scopeObj, bolt: sBolt };

    const smg = new THREE.Group();
    const m5Rec = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.07, 0.3), polymer);
    m5Rec.position.set(0, 0, -0.02);
    const m5Supp = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.15, 12), darkMetal);
    m5Supp.rotation.x = Math.PI / 2; m5Supp.position.set(0, 0.008, -0.28);
    const m5Bar = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.06, 8), gunmetal);
    m5Bar.rotation.x = Math.PI / 2; m5Bar.position.set(0, 0.008, -0.19);
    const m5Mag = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.15, 0.055), gunmetal2);
    m5Mag.position.set(0, -0.1, -0.02); m5Mag.rotation.x = -0.07;
    const m5Grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.1, 0.048), polymer);
    m5Grip.position.set(0, -0.09, 0.075); m5Grip.rotation.x = -0.3;
    const m5Guard = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 12), gunmetal2);
    m5Guard.rotation.y = Math.PI / 2; m5Guard.position.set(0, -0.05, -0.02);
    const m5SightGroup = new THREE.Group();
    const m5Ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.026, 0.0045, 10, 32),
      new THREE.MeshStandardMaterial({ color: 0x0d1610, roughness: 0.4, metalness: 0.6 })
    );
    m5Ring.position.set(0, 0.092, -0.02);
    const m5Dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.0022, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x39ff8a })
    );
    m5Dot.position.set(0, 0.092, -0.012);
    m5SightGroup.add(m5Ring, m5Dot);
    const m5Sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.03), darkMetal);
    m5Sight.position.set(0, 0.05, -0.08);
    const m5Stock = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.055, 0.12), polymer);
    m5Stock.position.set(0, 0.01, 0.2);
    smg.add(m5Rec, m5Supp, m5Bar, m5Mag, m5Grip, m5Guard, m5SightGroup, m5Sight, m5Stock);
    const smgL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.09), glove);
    smgL.position.set(-0.005, -0.06, -0.12);
    const smgR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.085, 0.09), glove);
    smgR.position.set(-0.005, -0.085, 0.1);
    smg.add(smgL, smgR);
    smg.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    this.smg = smg;
    this.smgParts = { rMag: m5Mag, optic: m5Ring };

    const shotgun = new THREE.Group();
    // Metais e polimero LISOS (cor solida, sem textura de riscos/granulado).
    const steelSmooth = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.42, metalness: 0.8 });
    const gunSmooth = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.5, metalness: 0.75 });
    const polySmooth = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.78, metalness: 0.12 });
    const p12Rec = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.22), darkMetal);
    p12Rec.position.set(0, 0, -0.02);
    const p12Bar = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.34, 12), steelSmooth);
    p12Bar.rotation.x = Math.PI / 2; p12Bar.position.set(0, 0.012, -0.3);
    const p12Muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.003, 8, 16), darkMetal);
    p12Muzzle.position.set(0, 0.012, -0.47);
    const p12Tube = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.28, 10), gunSmooth);
    p12Tube.rotation.x = Math.PI / 2; p12Tube.position.set(0, -0.026, -0.265);
    const p12Pump = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 12), polySmooth);
    p12Pump.rotation.x = Math.PI / 2; p12Pump.position.set(0, -0.026, -0.245);
    const p12PumpRing = new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.0035, 8, 16), gunSmooth);
    p12PumpRing.position.set(0, -0.026, -0.245);
    // Mira no estilo real de shotgun: anel no meio do cano e poste fino na ponta,
    // ambos com torres de 4mm (quase invisiveis) — nada bloqueia o centro da tela.
    const p12RingTower = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03, 0.006), darkMetal);
    p12RingTower.position.set(0, 0.042, -0.24);
    const p12Ring = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0022, 8, 28), darkMetal);
    p12Ring.position.set(0, 0.075, -0.24);
    const p12FrontTower = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.044, 0.004), darkMetal);
    p12FrontTower.position.set(0, 0.049, -0.42);
    const p12Bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.004, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff8c1a })
    );
    p12Bead.position.set(0, 0.077, -0.42);
    const p12Stock = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.09, 0.2), polySmooth);
    p12Stock.position.set(0, -0.02, 0.2); p12Stock.rotation.x = 0.12;
    // Pescoço rebaixado: antes o topo encostava EXATAMENTE no topo do ferrolho
    // (z-fighting = faixas listradas que mudam ao andar). Agora fica 4mm abaixo.
    const p12Neck = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.056, 0.1), polySmooth);
    p12Neck.position.set(0, 0.003, 0.09);
    const p12Grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.085, 0.05), polySmooth);
    p12Grip.position.set(0, -0.062, 0.075); p12Grip.rotation.x = -0.3;
    const p12TriggerG = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 12), gunSmooth);
    p12TriggerG.rotation.y = Math.PI / 2; p12TriggerG.position.set(0, -0.05, 0.02);
    shotgun.add(p12Rec, p12Bar, p12Muzzle, p12Tube, p12Pump, p12PumpRing,
      p12RingTower, p12Ring, p12FrontTower, p12Bead, p12Stock, p12Neck, p12Grip, p12TriggerG);
    const sgL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.09), glove);
    sgL.position.set(-0.005, -0.055, -0.22);
    const sgR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.085, 0.09), glove);
    sgR.position.set(-0.005, -0.085, 0.08);
    shotgun.add(sgL, sgR);
    shotgun.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    this.shotgun = shotgun;
    this.shotgunParts = { optic: p12Ring, pump: p12Pump };

    const grenade = new THREE.Group();
    const gBody = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 12), grenadeMat);
    gBody.scale.set(1, 1.12, 1);
    const gNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.022, 10), gunmetal2);
    gNeck.position.y = 0.066;
    const gCap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.014, 10), darkMetal);
    gCap.position.y = 0.082;
    const gSpoon = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.07, 0.005), gunmetal2);
    gSpoon.position.set(0.022, 0.04, 0.008); gSpoon.rotation.z = -0.15;
    const gPin = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.003, 6, 14), gunmetal2);
    gPin.rotation.y = Math.PI / 2; gPin.position.set(0.042, 0.062, 0);
    const gHand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.12), glove);
    gHand.position.set(0, -0.08, 0);
    grenade.add(gBody, gNeck, gCap, gSpoon, gPin, gHand);
    this.grenadeVM = grenade;

    g.add(rifle, pistol, sniper, grenade, smg, shotgun);
    pistol.visible = false; grenade.visible = false; sniper.visible = false;
    smg.visible = false; shotgun.visible = false;

    this.vmScene = new THREE.Scene();
    this.vmScene.add(g);
    this.vmGroup = g;
    this.vmCamera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.01, 5);
    const vmLight = new THREE.DirectionalLight(0xffcf9c, 0.95);
    vmLight.position.set(1.1, 0.9, 0.55);
    const vmFill = new THREE.DirectionalLight(0x9fb8e8, 0.3);
    vmFill.position.set(-1.2, 0.2, 0.6);
    const vmRim = new THREE.DirectionalLight(0xcfe0ff, 0.62);
    vmRim.position.set(0.2, 0.6, -1);
    this.vmScene.add(vmLight, vmFill, vmRim, new THREE.AmbientLight(0x8ba0be, 0.18));

    this.basePos = {
      rifle: new THREE.Vector3(0.17, -0.175, -0.38),
      pistol: new THREE.Vector3(0.15, -0.17, -0.34),
      sniper: new THREE.Vector3(0.17, -0.19, -0.42),
      grenade: new THREE.Vector3(0.18, -0.18, -0.3),
    };
    this.adsPos = {
      rifle: new THREE.Vector3(0, -0.105, -0.26),
      pistol: new THREE.Vector3(0, -0.084, -0.22),
      sniper: new THREE.Vector3(0, -0.105, -0.3),
      smg: new THREE.Vector3(0, -0.092, -0.24),
      shotgun: new THREE.Vector3(0, -0.075, -0.26),
    };

    this.OPTICS = {
      rifle: new THREE.Vector3(0, 0.105, -0.02),
      smg: new THREE.Vector3(0, 0.092, -0.02),
      pistol: new THREE.Vector3(0, 0.078, -0.02),
      sniper: new THREE.Vector3(0, 0.105, -0.12),
      shotgun: new THREE.Vector3(0, 0.075, -0.24),
      grenade: new THREE.Vector3(0, 0, 0),
    };
  }

  get def() { return this.defs[this.slot]; }

  opticLocalFor(def) {
    const chave = (def && def.model) || 'rifle';
    return this.OPTICS[chave] || this.OPTICS.rifle;
  }

  currentParts() {
    const chave = (this.def && this.def.model) || 'rifle';
    if (chave === 'pistol') return { rMag: this.pistolParts.pMag, slide: this.pistolParts.pSlide };
    if (chave === 'smg') return { rMag: this.smgParts.rMag };
    if (chave === 'sniper') return { rMag: this.sniperParts.rMag, slide: this.sniperParts.bolt };
    if (chave === 'shotgun') return { slide: this.shotgunParts.pump };
    if (chave === 'grenade') return {};
    return { rMag: this.rifleParts.rMag };
  }

  opticNode() {
    const chave = (this.def && this.def.model) || 'rifle';
    if (chave === 'pistol') return null;
    if (chave === 'smg') return this.smgParts.optic;
    if (chave === 'sniper') return this.sniperParts.optic;
    if (chave === 'shotgun') return this.shotgunParts.optic;
    if (chave === 'grenade') return null;
    return this.rifleParts.optic;
  }

  switchTo(slot) {
    if (slot === this.slot || this.switching > 0 || this.suppT > 0) return;
    if (slot === 3 && this.grenades <= 0) return;
    if (this.anim.reloading) this.anim.cancelReload('troca');
    if (this.laser) this.laser.setEnabled(false);
    if (this.sight) this.sight.group.visible = false;
    this.slot = slot;
    this.switching = this.anim.switchDur;
    this.anim.startSwitch();
    this.syncWeapon();
    this.audio.reload(2);
  }

  canFire() {
    const d = this.def;
    if (this.switching > 0 || this.reloadT > 0 || this.suppT > 0) return false;
    if (this.slot === 3) return this.grenadeCd <= 0 && this.grenades > 0;
    return d.mag > 0;
  }

  fire(now) {
    const d = this.def;
    if (!this.canFire()) {
      if (this.slot !== 3 && d.mag <= 0) this.audio.dryFire();
      return null;
    }
    if (this.slot === 3) {
      return { type: 'grenade' };
    }
    d.mag--;
    this.lastShot = now;

    const km = this.kickMul || 1;
    this.anim.shot((this.ads ? 0.62 : 1) * km);
    this.anim.pulseSlide(1);
    this.shakeT = 0.12;
    if (this.sight) this.sight.pulse(0.7);
    if (this.laser) this.laser.pulse();
    return { type: 'bullet' };
  }

  startReload() {
    const d = this.def;
    if (this.slot === 3 || this.anim.reloading || this.suppT > 0) return;
    if (d.mag >= d.magSize || d.reserve <= 0) return;
    const aplicado = this.anim.startReload(d, {
      magRelease: () => this.audio.reload(0),
      magOut: () => this.audio.reload(1),
      magIn: () => this.audio.reload(1),
      boltRelease: () => this.audio.reload(2),
      ammoCommit: () => {
        const need = d.magSize - d.mag;
        const take = Math.min(need, d.reserve);
        d.mag += take;
        d.reserve -= take;
      },
      reloadEnd: () => { this.audio.reload(2); },
      reloadCancel: () => {},
    });
    if (aplicado) this.reloadStage = 0;
    return aplicado;
  }

  inspect() {
    return this.anim.startInspect();
  }

  spread() {
    const d = this.def;
    if (this.slot === 3) return 0;
    const base = this.ads ? d.spreadAds : d.spreadHip;
    const instabilidade = 1 + this.moveK * (this.ads ? 0.85 : 1.35) + this.anim.recoil.streak * 0.06;
    return base * instabilidade;
  }

  get aiming() {
    return this.anim.adsActive;
  }

  sensitivityScale() {
    return this.anim.sensitivityScale;
  }

  addImpactReaction(strength) {
    this.anim.receiveImpact(strength);
  }

  toggleSuppressor() {
    if (this.slot !== 1 || this.switching > 0 || this.reloadT > 0 || this.suppT > 0) return;
    this.suppDir = this.suppOn ? 1 : -1;
    this.suppOn = !this.suppOn;
    this.suppT = this.suppDir > 0 ? 1.8 : 1.4;
    this.suppStage = 0;
    this.audio.reload(0);
  }

  _suppAnim() {
    const D = this.suppDir > 0 ? 1.8 : 1.4;
    const f = clamp(1 - this.suppT / D, 0, 1);
    const supp = this.pistolParts.suppGroup, hand = this.pistolParts.phL;

    const w = Math.sin(clamp(f / 0.88, 0, 1) * Math.PI);
    this.pistol.rotation.set(-0.42 * w, 0.16 * w, 0.5 * w);
    this.pistol.position.set(0.05 * w, -0.07 * w, 0);

    const a = 0.1, b = 0.88;
    const g = (f <= a || f >= b) ? 0 : Math.sin((f - a) / (b - a) * Math.PI);

    if (this.suppDir > 0) {
      const out = clamp((f - 0.18) / 0.52, 0, 1);
      supp.position.z = -0.38 + out * 0.055;
      supp.rotation.z = out * 7;
      supp.visible = f <= 0.86;
      if (f > 0.72) {
        const drop = (f - 0.72) / 0.16;
        supp.position.y = -drop * 0.045;
        supp.position.z -= drop * 0.06;
      }
      hand.position.set(-0.005 + g * 0.005, -0.12 + g * 0.132, 0.05 - g * 0.35);
      hand.rotation.z = g * out * 7;
      if (this.suppStage === 0 && f > 0.22) { this.audio.screwTick(); this.suppStage = 1; }
      if (this.suppStage === 1 && f > 0.4)  { this.audio.screwTick(); this.suppStage = 2; }
      if (this.suppStage === 2 && f > 0.58) { this.audio.screwTick(); this.suppStage = 3; }
      if (this.suppStage === 3 && f > 0.74) { this.audio.reload(2);   this.suppStage = 4; }
    } else {
      const inK = clamp((f - 0.3) / 0.42, 0, 1);
      supp.visible = f > 0.3;
      supp.position.z = -0.325 - inK * 0.055;
      supp.position.y = 0;
      supp.rotation.z = (1 - inK) * 7;
      hand.position.set(-0.005 + g * 0.005, -0.12 + g * 0.132, 0.05 - g * 0.35);
      hand.rotation.z = g * (1 - inK) * 7;
      if (this.suppStage === 0 && f > 0.36) { this.audio.screwTick(); this.suppStage = 1; }
      if (this.suppStage === 1 && f > 0.54) { this.audio.screwTick(); this.suppStage = 2; }
      if (this.suppStage === 2 && f > 0.72) { this.audio.screwTick(); this.suppStage = 3; }
      if (this.suppStage === 3 && f > 0.9)  { this.audio.reload(2);   this.suppStage = 4; }
    }
  }

  _suppAnimEnd() {
    const supp = this.pistolParts.suppGroup, hand = this.pistolParts.phL;
    this.pistol.rotation.set(0, 0, 0);
    this.pistol.position.set(0, 0, 0);
    supp.visible = this.suppOn;
    supp.position.set(0, 0, 0);
    supp.rotation.z = 0;
    hand.position.set(-0.005, -0.12, 0.05);
    hand.rotation.set(0, 0, 0);
  }

  update(dt, opts) {
    const { moving, running, grounded, aimHeld } = opts;
    const d = this.def;

    this.moveK = opts.moveK !== undefined ? opts.moveK : (moving ? (running ? 1 : 0.55) : 0);
    this.anim.config = Settings.data;
    if (this._slotSetup !== this.slot) this.syncWeapon();

    const podeMirar = !!aimHeld && this.slot !== 3 && !this.anim.reloading && this.suppT <= 0;
    this.anim.requestADS(podeMirar);
    this.ads = podeMirar;

    const out = this.anim.update(dt, {
      origin: opts.camPos || _camPos.set(0, 0, 0),
      forward: opts.camDir || _camDir,
      right: opts.camRight || _camRight,
      velocity: opts.velocity || _vel.set(0, 0, 0),
      camYaw: opts.camYaw || 0,
      lookX: opts.lookX || 0,
      lookY: opts.lookY || 0,
      grounded: grounded !== false,
      running: !!running,
    });

    this.adsK = out.adsK;
    this.reloadT = this.anim.reloadT;
    this.reloadStage = out.reloadStage;
    this.blocked = out.blocked;
    this.throwK = opts.throwAnim || 0;
    this.anim.throwK = this.throwK;

    if (this.switching > 0) this.switching -= dt;
    if (this.grenadeCd > 0) this.grenadeCd -= dt;
    if (this.shakeT > 0) this.shakeT -= dt;

    if (this.suppT > 0) {
      this.suppT -= dt;
      this._suppAnim();
      if (this.suppT <= 0) this._suppAnimEnd();
    }

    const slot = this.slot;
    this.rifle.visible = slot === 0;
    this.pistol.visible = slot === 1;
    this.sniper.visible = slot === 2;
    this.grenadeVM.visible = slot === 3;
    this.smg.visible = slot === 4;
    this.shotgun.visible = slot === 5;

    this.vmGroup.position.copy(out.pos);
    this.vmGroup.rotation.set(out.rot.x, out.rot.y, out.rot.z);

    this.vmCamera.fov = out.fov;
    this.vmCamera.updateProjectionMatrix();

    this.updateAcessorios(dt, out, opts, d);
  }

  updateAcessorios(dt, out, opts, d) {
    if (!this.attachments) return;
    const pos = opts.camPos || _camPos.set(0, 0, 0);
    const dir = opts.camDir || _camDir;
    const quatCam = this.camera.quaternion;

    if (this.sight && this.sight.group.visible) {
      this.sight.group.getWorldPosition(_lente);
      _olhoLente.copy(_lente).normalize();
      _lenteEixo.set(0, 0, -1).applyQuaternion(this.vmGroup.quaternion).normalize();
      this.sight.update(dt, {
        ambient: this.ambient,
        adsK: out.adsK,
        eyeToLens: _olhoLente,
        axisDir: _lenteEixo,
      });
    }

    if (this.laser) {
      const lp = this.laser.localPos || this.OPTICS[this.def.model] || this.OPTICS.rifle;
      _laserOrigem.copy(lp).applyQuaternion(quatCam).add(pos);
      _laserDir.set(0, 0, -1).applyQuaternion(this.vmGroup.quaternion).applyQuaternion(quatCam).normalize();
      if (dir) _laserDir.lerp(dir, 1 - out.adsK * 0.75).normalize();
      this.laser.update(dt, {
        origin: _laserOrigem,
        direction: _laserDir,
        probe: this.probe,
        beamVisible: true,
        smoke: this.smokeNear,
      });
    }
  }

  consumeRecoil() {
    return this.anim.consumeCameraRecoil();
  }

  ammoHud() {
    if (this.slot === 3) return { name: 'GRANADA', mag: this.grenades, reserve: '∞' };
    const d = this.def;
    return {
      name: d.name,
      mag: d.mag,
      reserve: d.reserve,
      supp: this.slot === 1 ? this.suppOn : undefined,
      optic: d.optic ? d.optic.kind : 'iron',
      laser: !!(d.laser && d.laser.enabled && this.laserOn),
      reloading: this.anim.reloading,
      reloadProgress: this.anim.reloadProgress,
      blocked: this.blocked,
    };
  }
}
