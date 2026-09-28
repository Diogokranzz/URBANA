// ============================================================
//  ENTIDADES — IA inimiga humanoide + jogador
// ============================================================
import * as THREE from '../vendor/three.module.js';
import { clamp, dampF } from './physics.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

// ---------------- fábrica de bonecos humanos ----------------
// Constrói um operador humanoide articulado: policial tático ou bandido de capuz.
// Proporções humanas reais (~1,8m), ombros, quadril, mãos e botas.
// (também usado pelo avatar do jogador na 3ª pessoa — tecla V)
export function makeOperatorMesh(kind) {
  const g = new THREE.Group();
  const isCop = kind === 'police';
  const isDelta = kind === 'delta';          // FORÇA DELTA: operação noturna

  // materiais com desgaste (textura de sujeira sutil)
  const cloth = (c, rough = 0.88) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.02 });
  const skin = cloth(isCop ? 0xb08968 : 0x9c7350);          // tons de pele variados
  const skinDark = cloth(isCop ? 0x8f6b4f : 0x7d5a3e);      // sombra da pele
  const fatigues = cloth(isDelta ? 0x232a20 : isCop ? 0x2e3a46 : 0x3a3f35);      // camo noturno / azul-petróleo / camuflado rasgado
  const fatiguesD = cloth(isDelta ? 0x1a2018 : isCop ? 0x242e38 : 0x2c3029);     // sombra do tecido
  const vest = cloth(isCop ? 0x1f262e : 0x33302a, 0.92);    // colete balístico
  const dark = cloth(0x15171a, 0.7);                         // couro/plástico
  const boots = cloth(0x1a1613, 0.75);                       // botas de couro

  // silhueta humana: cápsulas compostas (ombros arredondados, peito, cintura)
  const cap = (r, h, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 4, 10), m);
  const torso = cap(0.16, 0.3, fatigues);            // tronco superior
  torso.name = 'torso';
  torso.scale.set(1.45, 1, 0.82);
  torso.position.y = 1.2;
  const chest = cap(0.15, 0.16, fatigues);           // peitoral
  chest.scale.set(1.5, 1, 0.86);
  chest.position.set(0, 1.38, -0.01);
  const waist = cap(0.13, 0.14, fatiguesD);          // cintura
  waist.scale.set(1.35, 1, 0.8);
  waist.position.y = 0.98;
  // ombros (deltoides esféricos)
  const shL = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), fatigues);
  shL.position.set(-0.24, 1.4, 0);
  const shR = shL.clone(); shR.position.x = 0.24;
  // quadril/pelvis
  const hips = cap(0.14, 0.1, fatiguesD);
  hips.scale.set(1.4, 1, 0.9);
  hips.position.y = 0.86;
  // colete balístico por cima do tronco (placas frontais + correias)
  const armor = cap(0.17, 0.3, vest);
  armor.scale.set(1.52, 0.98, 0.95);
  armor.position.y = 1.2;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.045), cloth(isCop ? 0x2a343d : 0x3b382f, 0.55));
  plate.position.set(0, 1.24, -0.14);
  plate.name = 'plate';
  const strapV = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.02), dark);
  strapV.position.set(-0.08, 1.2, -0.165); strapV.rotation.z = 0.06;
  const strapH = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.045, 0.02), dark);
  strapH.position.set(0, 1.3, -0.165);
  if (!isCop) { g.add(strapV, strapH); }

  // cabeça humana + pescoço
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.062, 0.1, 8), skinDark);
  neck.position.y = 1.5;
  const head = new THREE.Group();                     // crânio + face humana completa
  const skull = cap(0.095, 0.07, skin);
  skull.scale.set(1.15, 1.08, 1.12);
  skull.position.y = 1.68;
  head.add(skull);
  head.name = 'head';
  // FACE HUMANA: olhos com esclera+íris, sobrancelhas, nariz, boca, orelhas, maxilar
  const scleraM = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.3 });
  const irisM = new THREE.MeshStandardMaterial({ color: isDelta ? 0x3d2f1e : 0x2a1f14, roughness: 0.2 });
  for (const sx of [-0.038, 0.038]) {
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), scleraM);
    sclera.scale.set(1.25, 1, 0.55);
    sclera.position.set(sx, 1.7, -0.088);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), irisM);
    iris.position.set(sx, 1.7, -0.1);
    head.add(sclera, iris);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.008, 0.012),
      new THREE.MeshStandardMaterial({ color: isCop ? 0x241a10 : 0x1c1208, roughness: 0.9 }));
    brow.position.set(sx, 1.735, -0.09);
    head.add(brow);
  }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.05, 0.038), skinDark);
  nose.position.set(0, 1.665, -0.108);
  head.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.014),
    new THREE.MeshStandardMaterial({ color: 0x7d4438, roughness: 0.6 }));
  mouth.position.set(0, 1.615, -0.09);
  head.add(mouth);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.1), skinDark);
  jaw.position.set(0, 1.615, -0.045);
  head.add(jaw);
  // orelhas
  for (const sx of [-0.105, 0.105]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5), skinDark);
    ear.scale.set(0.6, 1, 0.8);
    ear.position.set(sx, 1.68, 0);
    head.add(ear);
  }
  g.add(head);

  let headCover;
  if (isDelta) {
    // FORÇA DELTA: boina verde-militar + pintura facial noturna + NVG na frente
    headCover = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.5), cloth(0x2c3a26, 0.7));
    headCover.scale.set(1.12, 0.72, 1.16);
    headCover.position.y = 1.755;
    headCover.rotation.x = -0.1;                       // boina caída para o lado
    const nvg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.05, 8),
      new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.3, metalness: 0.6 }));
    nvg.rotation.x = Math.PI / 2; nvg.position.set(0, 1.7, -0.115);
    g.add(nvg);
    const nightVest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.02), dark);
    nightVest.position.set(0, 1.34, -0.165);
    g.add(nightVest);                                  // porta-placas extra
  } else if (isCop) {
    // POLICIAL: capacete balístico redondo + óculos + rádio no ombro
    headCover = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.55), cloth(0x23282e, 0.55));
    headCover.scale.set(1.08, 0.95, 1.12);
    headCover.position.y = 1.72;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.055, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x0c1216, roughness: 0.15, metalness: 0.85 }));
    visor.position.set(0, 1.7, -0.115);
    g.add(visor);
    // crachá dourado no peito
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.005),
      new THREE.MeshStandardMaterial({ color: 0xc9a53e, roughness: 0.3, metalness: 0.9 }));
    badge.position.set(-0.16, 1.3, -0.152);
    g.add(badge);
    const radio = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.05), dark);
    radio.position.set(0.19, 1.32, 0.06);
    g.add(radio);
  } else {
    // BANDIDO: capuz de moletom sobre a cabeça
    headCover = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.6), cloth(0x28251f, 0.95));
    headCover.scale.set(1.05, 1, 1.08);
    headCover.position.y = 1.7;
    // máscara/balaclava no pescoço
    const mask = cap(0.075, 0.06, cloth(0x1d1a16));
    mask.scale.set(1.25, 1.15, 1.2);
    mask.position.y = 1.53;
    g.add(mask);
  }

  // braços articulados (ombro→cotovelo→mão), cápsulas arredondadas
  const mkArm = (sx) => {
    const arm = new THREE.Group();
    const upper = cap(0.062, 0.17, fatigues);
    upper.position.y = -0.14;
    const fore = cap(0.052, 0.15, fatiguesD);
    fore.position.y = -0.4;
    fore.rotation.x = -0.16;                      // leve dobra natural do cotovelo
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.1, 0.09),
      isCop ? new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 }) : skinDark);
    hand.position.y = -0.56;
    arm.add(upper, fore, hand);
    arm.position.set(sx * 0.27, 1.42, 0);
    return arm;
  };
  const mkLeg = (sx) => {
    const leg = new THREE.Group();
    const thigh = cap(0.078, 0.2, fatigues);
    thigh.position.y = -0.18;
    const shin = cap(0.065, 0.2, fatiguesD);
    shin.position.y = -0.53;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.26), boots);
    boot.position.set(0, -0.74, -0.035);
    leg.add(thigh, shin, boot);
    leg.position.set(sx * 0.13, 0.84, 0);
    return leg;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  const legL = mkLeg(-1), legR = mkLeg(1);

  // ---- armas do operador: as 4 versões ficam prontas no braço e o jogo ----
  // alterna a visível conforme o slot selecionado (materiais do viewmodel)
  const blued = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.4, metalness: 0.85 });
  const steelD = new THREE.MeshStandardMaterial({ color: 0x4a525c, roughness: 0.5, metalness: 0.75 });
  const woodM = new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.6 });
  const oliveM = new THREE.MeshStandardMaterial({ color: 0x46533a, roughness: 0.6 });
  const gun = new THREE.Group();

  // AK-47: receptor, coronha/handguard de madeira, banana curva, slant brake
  const ak = new THREE.Group();
  const gb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.42), blued);
  const gStock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.16), woodM);
  gStock.position.set(0, -0.015, 0.27); gStock.rotation.x = 0.08;
  const gHandU = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.13), woodM);
  gHandU.position.set(0, 0.02, -0.22);
  const gBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 8), steelD);
  gBarrel.rotation.x = Math.PI / 2; gBarrel.position.set(0, 0.02, -0.37);
  const gSlant = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.045, 10), blued);
  gSlant.rotation.x = Math.PI / 2; gSlant.rotation.z = 0.5; gSlant.position.set(0, 0.02, -0.47);
  const gMag1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.055), steelD);
  gMag1.position.set(0, -0.075, -0.03);
  const gMag2 = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.07, 0.05), steelD);
  gMag2.position.set(0, -0.13, -0.005); gMag2.rotation.x = 0.5;
  const gGrip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.04), woodM);
  gGrip.position.set(0, -0.08, 0.06); gGrip.rotation.x = -0.3;
  ak.add(gb, gStock, gHandU, gBarrel, gSlant, gMag1, gMag2, gGrip);
  ak.name = 'w-ak';

  // DESERT EAGLE: slide massivo + supressor removível (tecla X controla)
  const deagle = new THREE.Group();
  const dSlide = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.2), blued);
  dSlide.position.set(0, 0.01, -0.05);
  const dGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.045), dark);
  dGrip.position.set(0, -0.06, 0.04); dGrip.rotation.x = -0.2;
  const dSupp = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.1, 10), dark);
  dSupp.rotation.x = Math.PI / 2; dSupp.position.set(0, 0.012, -0.2);
  dSupp.name = 'w-supp';
  deagle.add(dSlide, dGrip, dSupp);
  deagle.name = 'w-deagle';

  // SNIPER: corpo longo, cano pesado, luneta e bipé recolhido
  const snp = new THREE.Group();
  const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.065, 0.3), blued);
  const sBar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.3, 8), steelD);
  sBar.rotation.x = Math.PI / 2; sBar.position.set(0, 0.008, -0.3);
  const sScope = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 10), dark);
  sScope.rotation.x = Math.PI / 2; sScope.position.set(0, 0.055, -0.05);
  const sMagS = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.055, 0.05), steelD);
  sMagS.position.set(0, -0.055, -0.02);
  const sStock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.075, 0.12), dark);
  sStock.position.set(0, -0.01, 0.2);
  snp.add(sBody, sBar, sScope, sMagS, sStock);
  snp.name = 'w-sniper';

  // GRANADA: corpo oliva com ranhuras + colher
  const gren = new THREE.Group();
  const grB = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), oliveM);
  grB.scale.set(1, 1.12, 1);
  const grS = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 0.005), steelD);
  grS.position.set(0.03, 0.035, 0.01); grS.rotation.z = -0.15;
  gren.add(grB, grS);
  gren.name = 'w-grenade';

  // MP5-SD: corpo curto, carregador reto longo, supressor integrado grosso
  const mp5 = new THREE.Group();
  const m5Body = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.06, 0.26), blued);
  const m5Supp = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.12, 10), dark);
  m5Supp.rotation.x = Math.PI / 2; m5Supp.position.set(0, 0.005, -0.19);
  const m5Mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.13, 0.045), steelD);
  m5Mag.position.set(0, -0.085, 0.0); m5Mag.rotation.x = -0.06;
  const m5Grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.08, 0.04), dark);
  m5Grip.position.set(0, -0.07, 0.07); m5Grip.rotation.x = -0.28;
  const m5Stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.1), dark);
  m5Stock.position.set(0, 0.005, 0.17);
  mp5.add(m5Body, m5Supp, m5Mag, m5Grip, m5Stock);
  mp5.name = 'w-mp5';

  // PUMP 12: cano longo, bomba deslizante de madeira, coronha
  const pump = new THREE.Group();
  const p12Rec = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.065, 0.2), blued);
  const p12Bar = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.34, 8), steelD);
  p12Bar.rotation.x = Math.PI / 2; p12Bar.position.set(0, 0.01, -0.26);
  const p12Tube = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 8), steelD);
  p12Tube.rotation.x = Math.PI / 2; p12Tube.position.set(0, -0.03, -0.24);
  const p12Pump = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.09, 10), woodM);
  p12Pump.rotation.x = Math.PI / 2; p12Pump.position.set(0, -0.03, -0.2);
  const p12Stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.16), woodM);
  p12Stock.position.set(0, -0.015, 0.16); p12Stock.rotation.x = 0.1;
  pump.add(p12Rec, p12Bar, p12Tube, p12Pump, p12Stock);
  pump.name = 'w-pump';

  // TODOS os operadores nascem armados até os dentes: a arma é filha do braço
  // direito, na altura da mão, apontando pra frente do personagem (-Z local)
  deagle.visible = snp.visible = gren.visible = mp5.visible = pump.visible = false;   // só a AK visível
  gun.add(ak, deagle, snp, gren, mp5, pump);
  gun.position.set(0, -0.52, 0.02);          // pistolete na mão (hand em y=-0.56)
  armR.add(gun);

  g.add(torso, chest, waist, shL, shR, hips, armor, plate, strapV, strapH, neck, headCover, armL, armR, legL, legR);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ------------------------- INIMIGO -------------------------
export class Enemy {
  constructor(scene, world, phys, pos) {
    this.scene = scene;
    this.world = world;
    this.phys = phys;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.radius = 0.4;
    this.height = 1.75;
    this.alive = true;
    this.health = 100;
    this.state = 'patrol';     // patrol | alert | attack | cover | dead
    this.stateT = 0;
    this.target = null;        // posição conhecida do jogador
    this.seesPlayer = false;
    this.lastSeen = 0;         // tempo desde que viu
    this.fireCd = 0;
    this.burst = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.coverPos = null;
    this.speedWalk = 2.2;
    this.speedCombat = 3.6;
    this.aggro = Math.random() * 0.3 + 0.7; // personalidade
    this.blockT = 0;              // tempo seguido batendo na mesma parede (anti-travamento)
    this.blockPos = new THREE.Vector3();
    this.buildMesh();
  }

  buildMesh() {
    // metade dos hostis são policiais corruptos, metade bandidos de capuz
    const kind = Math.random() < 0.5 ? 'police' : 'thug';
    const g = makeOperatorMesh(kind);
    this.mesh = g;
    this.scene.add(g);

    // marcador de dano
    this.hitFlash = 0;
  }

  // percepção: FOV 110°, alcance 55m, precisa de LOS
  canSee(playerPos, now) {
    _v1.set(playerPos.x - this.pos.x, playerPos.y - this.pos.y, playerPos.z - this.pos.z);
    const dist = _v1.length();
    if (dist > 55) return false;
    _v1.normalize();
    const facing = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const dot = facing.dot(_v1);
    if (dist > 3 && dot < 0.35) return false; // ~cos 69°
    _v2.copy(this.pos); _v2.y += 1.5;
    _v3.copy(playerPos); _v3.y += 0.9;
    return this.phys.lineOfSight(_v2, _v3);
  }

  update(dt, player, now, fx, audio, camPos, camDir, camRight) {
    if (!this.alive) { this.deathAnim(dt); return; }

    this.stateT += dt;
    const distToPlayer = this.pos.distanceTo(player.pos);

    // ---------- percepção ----------
    const seen = this.canSee(player.pos, now);
    if (seen) {
      this.seesPlayer = true;
      this.lastSeen = 0;
      this.target = player.pos.clone();
      if (this.state === 'patrol') {
        this.state = 'alert';
        this.stateT = 0;
        // grito de alerta (sintetizado)
        audio.alertCry && audio.alertCry(this.pos, camPos, camDir, camRight);
      }
    } else {
      this.seesPlayer = false;
      this.lastSeen += dt;
    }

    // ---------- transições ----------
    if (this.state === 'alert' && this.stateT > 0.7) { this.state = 'attack'; this.stateT = 0; }
    if (this.state === 'attack' && this.lastSeen > 4.5 && this.stateT > 2) {
      this.state = 'cover'; this.stateT = 0; this.pickCover();
    }
    if (this.state === 'cover' && this.lastSeen > 9) { this.state = 'patrol'; this.stateT = 0; }

    // ---------- movimento ----------
    let moveDir = _v1.set(0, 0, 0);
    const faceTarget = new THREE.Vector3();

    if (this.state === 'patrol') {
      if (!this.patrolPt || this.pos.distanceTo(this.patrolPt) < 1.2) {
        const sp = this.world.spawns[Math.floor(Math.random() * this.world.spawns.length)];
        this.patrolPt = sp.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
      }
      moveDir.copy(this.patrolPt).sub(this.pos); moveDir.y = 0;
      if (moveDir.lengthSq() > 0.1) moveDir.normalize();
      faceTarget.copy(moveDir);
    } else if (this.state === 'alert') {
      // para e encara a última posição vista
      faceTarget.copy(this.target || player.pos).sub(this.pos);
      moveDir.set(0, 0, 0);
    } else if (this.state === 'attack') {
      const ideal = 14;
      _v2.copy(player.pos).sub(this.pos); _v2.y = 0;
      const dist = _v2.length(); _v2.normalize();
      faceTarget.copy(_v2);
      if (dist > ideal + 4) moveDir.copy(_v2);
      else if (dist < ideal - 5) moveDir.copy(_v2).negate();
      // strafe
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 0.8 + Math.random() * 1.2; this.strafeDir *= -1; }
      _v3.set(_v2.z, 0, -_v2.x); // lateral
      moveDir.addScaledVector(_v3, this.strafeDir * 0.8);
      if (moveDir.lengthSq() > 0) moveDir.normalize();
    } else if (this.state === 'cover') {
      if (this.coverPos && this.pos.distanceTo(this.coverPos) > 1.0) {
        moveDir.copy(this.coverPos).sub(this.pos); moveDir.y = 0;
        if (moveDir.lengthSq() > 0.1) moveDir.normalize();
        faceTarget.copy(this.target || player.pos).sub(this.pos);
      } else {
        faceTarget.copy(this.target || player.pos).sub(this.pos);
      }
    }

    // aplica movimento com física
    const spd = this.state === 'patrol' ? this.speedWalk : this.speedCombat;
    this.vel.x = dampF(this.vel.x, moveDir.x * spd, 8, dt);
    this.vel.z = dampF(this.vel.z, moveDir.z * spd, 8, dt);
    this.vel.y -= 22 * dt;
    const res = this.phys.moveCapsule(this.pos, this.vel, dt, this.radius, this.height);
    if (res.onGround) this.vel.y = Math.max(0, this.vel.y);
    // desvio de obstáculo: se bateu, desliza lateral
    // (nada de teleportes: a IA desliza ao longo da parede até achar passagem)
    if (res.hitWall && moveDir.lengthSq() > 0) {
      const side = new THREE.Vector3(moveDir.z, 0, -moveDir.x).multiplyScalar(this.strafeDir);
      this.vel.x += side.x * 2; this.vel.z += side.z * 2;
      // anti-travamento: batendo no mesmo lugar por ~1s, troca o lado do desvio;
      // ~3s, desiste do destino e escolhe outro ponto de patrulha — SEM teleportar
      this.blockT += dt;
      if (this.blockT > 1 && this.pos.distanceTo(this.blockPos) < 0.5) {
        this.strafeDir *= -1;
        this.blockPos.copy(this.pos);
        this.blockT = 0;
        if (this.state === 'patrol') this.patrolPt = null;   // escolhe outro destino
        else if (this.state === 'cover') this.coverPos = null;
      }
    } else {
      this.blockT = Math.max(0, this.blockT - dt * 2);
      this.blockPos.copy(this.pos);
    }

    // ---------- rotação suave ----------
    if (faceTarget.lengthSq() > 0.001) {
      const want = Math.atan2(-faceTarget.x, -faceTarget.z);
      let d = want - this.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.yaw += clamp(d, -4 * dt, 4 * dt);
    }

    // ---------- combate ----------
    if (this.state === 'attack' && this.seesPlayer) {
      this.fireCd -= dt;
      if (this.fireCd <= 0) {
        if (this.burst <= 0) {
          this.burst = 2 + Math.floor(Math.random() * 3);
          this.fireCd = 0.9 + Math.random() * 1.1; // pausa entre rajadas
        } else {
          this.burst--;
          this.fireCd = 0.11;
          this.shootAt(player, fx, audio, camPos, camDir, camRight, now);
        }
      }
    }

    // ---------- animação ----------
    this.animate(dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;

    if (this.hitFlash > 0) {
      this.hitFlash -= dt * 3;
    }
  }

  // escolhe um ponto de cobertura perto de si, afastado do jogador
  pickCover() {
    const pts = this.world.coverPoints || [];
    let best = null, bestScore = -Infinity;
    for (const c of pts) {
      const dc = c.distanceTo(this.pos);
      if (dc > 30) continue;                       // muito longe
      const dp = c.distanceTo(this.target || this.pos);
      // prefere perto de si e longe do jogador
      const score = -dc * 0.6 + Math.min(dp, 30) * 0.8;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    this.coverPos = best ? best.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)) : null;
  }

  shootAt(player, fx, audio, camPos, camDir, camRight, now) {
    // boca da arma: ponta do grupo de arma do braço direito (armR.children[3] = gun)
    const muzzle = _v3.set(0, 0, 0);
    const armR = this.mesh.children[this.mesh.children.length - 3];
    armR.getWorldPosition(muzzle);
    muzzle.y -= 0.55; muzzle.z -= 0.25;   // deslocamento relativo da arma apontada
    const aim = _v2.set(player.pos.x, player.pos.y + 1.2, player.pos.z).sub(muzzle);
    const dist = aim.length();
    aim.normalize();
    // imprecisão cresce com distância e se o jogador se move
    // (agachado = alvo mais difícil; correr = alvo fácil)
    const pSpeed = player.vel ? Math.hypot(player.vel.x, player.vel.z) : 0;
    const crouchBonus = player.crouchK * 0.025;
    const miss = 0.045 + dist * 0.0018 + pSpeed * 0.012 - crouchBonus;
    aim.x += (Math.random() - 0.5) * miss;
    aim.y += (Math.random() - 0.5) * miss;
    aim.z += (Math.random() - 0.5) * miss;
    aim.normalize();

    const end = muzzle.clone().addScaledVector(aim, Math.min(dist + 4, 80));
    fx.tracer(muzzle.clone(), end, 300);
    fx.muzzleFlash(muzzle, aim);
    audio.shotRifle(this.pos, camPos, camDir, camRight);

    // hit check: segmento contra a cápsula do jogador
    const hit = rayCapsule(muzzle, aim, player.pos, 0.45, 1.75);
    if (hit) {
      const dmg = Math.max(4, Math.round(11 - dist * 0.09));
      // roteado pelo escudo do operador (main injeta o hook)
      if (window.__shieldDamage) window.__shieldDamage(dmg, this.pos);
      else player.takeDamage(dmg, this.pos);
    }
  }

  takeDamage(dmg, fromDir, isHead) {
    if (!this.alive) return;
    this.health -= dmg;
    this.hitFlash = 1;
    // levar dano acorda a IA
    if (this.state === 'patrol' || this.state === 'cover') {
      this.state = 'attack'; this.stateT = 0;
    }
    if (this.health <= 0) {
      this.alive = false;
      this.state = 'dead';
      this.deathT = 0;
      return true; // morreu
    }
    // reação ao dano: pequeno flinch
    this.vel.addScaledVector(fromDir, 0.8);
    return false;
  }

  deathAnim(dt) {
    this.deathT += dt;

    // ---- RAGDOLL DE ATROPELAMENTO: voa, capota e quica no chão ----
    if (this.ragdoll) {
      const r = this.ragdoll;
      // fase aérea: gravidade puxa; no chão, atrito do asfalto freia o corpo
      r.vel.y -= 22 * dt;
      this.pos.addScaledVector(r.vel, dt);
      if (this.pos.y < 0) {
        // quique no asfalto: mata a maior parte da energia vertical
        this.pos.y = 0;
        r.vel.y = Math.abs(r.vel.y) > 3.5 ? -r.vel.y * 0.38 : 0;
        r.vel.x *= 0.55; r.vel.z *= 0.55;
        r.spin.multiplyScalar(0.55);
      }
      if (this.pos.y <= 0.001) {
        const fr = Math.max(0, 1 - 3.5 * dt);        // raspando no chão
        r.vel.x *= fr; r.vel.z *= fr;
        r.spin.multiplyScalar(Math.max(0, 1 - 3 * dt));
      }
      // capotamento: gira em 2 eixos enquanto voa (frenagem solta o corpo)
      this.mesh.rotation.x += r.spin.x * dt;
      this.mesh.rotation.z += r.spin.z * dt;
      // corpo parado: trava numa pose final deitado
      if (this.pos.y <= 0.001 && r.vel.lengthSq() < 0.09) {
        r.spin.set(0, 0, 0);
        r.vel.set(0, 0, 0);
        this.mesh.rotation.x = -Math.PI / 2 * 0.92;
        this.mesh.rotation.z = 0;
        this.ragdoll = null;
      }
      this.mesh.position.copy(this.pos);
      return;
    }

    // ---- morte comum: tomba no lugar (comportamento original) ----
    const k = Math.min(1, this.deathT / 0.5);
    this.mesh.rotation.x = -k * Math.PI / 2 * 0.92;
    this.mesh.position.y = this.pos.y + (1 - k) * 0.1;
    if (this.deathT > 12) {
      // afunda e remove
      this.mesh.position.y -= dt * 0.4;
      if (this.deathT > 14) this.scene.remove(this.mesh);
    }
  }

  // arremessa o corpo na direção do impacto do carro (física do atropelamento)
  launchRagdoll(vel, spin) {
    this.ragdoll = {
      vel: vel.clone(),
      spin: spin.clone(),
    };
    this.deathT = 0;
  }

  animate(dt) {
    // novos bonecos: braços/pernas são Groups filhos diretos (ordem: ... armL, armR, legL, legR)
    const kids = this.mesh.children;
    this.armL = kids[kids.length - 4];
    this.armR = kids[kids.length - 3];
    this.legL = kids[kids.length - 2];
    this.legR = kids[kids.length - 1];
    this.torso = this.mesh.getObjectByName('torso') || kids[0];
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.animT = (this.animT || 0) + dt * (2.2 + sp * 2.4);
    const s = Math.sin(this.animT);
    const c = Math.cos(this.animT);
    const amp = Math.min(0.55, 0.16 + sp * 0.12);
    this.legL.rotation.x = s * amp;
    this.legR.rotation.x = -s * amp;
    this.armL.rotation.x = -s * amp * 0.7;
    this.armR.rotation.x = -0.9 + c * 0.05; // braço direito segura a arma
    // aponta o braço/arma para o jogador em combate (a arma é filha do braço)
    if (this.state === 'attack' && this.target) {
      const dy = (this.target.y + 1.2) - (this.pos.y + 1.12);
      const dist = Math.max(2, Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z));
      this.armR.rotation.x += Math.atan2(dy, dist) * 0.4;
    }
    // respiração/idle (tórax sobe/desce sutil)
    this.torso.position.y = 1.15 + Math.sin(this.animT * 0.5) * 0.008;
  }
}

// raio vs cápsula vertical (usado p/ acertar o jogador)
function rayCapsule(orig, dir, base, r, h) {
  // amostra segmento de alturas do corpo
  for (let t = 0.1; t < 80; t += 0.6) {
    const px = orig.x + dir.x * t, py = orig.y + dir.y * t, pz = orig.z + dir.z * t;
    if (py < base.y - 0.2 || py > base.y + h + 0.2) {
      if (t > 3) break; // já passou do corpo na vertical
      continue;
    }
    const dx = px - base.x, dz = pz - base.z;
    if (dx * dx + dz * dz < r * r) return { t };
  }
  return null;
}

// ------------------------- JOGADOR -------------------------
export class Player {
  constructor(spawn) {
    this.pos = spawn.clone();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.radius = 0.42;
    this.height = 1.75;
    this.eye = 1.62;
    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;
    this.regenT = 0;
    this.onGround = true;
    this.crouchK = 0;      // 0..1 agachado
    this.wantCrouch = false;
    this.sprintK = 0;
    this.wantSprint = false;
    this.moveInput = new THREE.Vector2(); // x = lateral, y = frente
    this.lastDamageDir = new THREE.Vector3();
  }

  takeDamage(dmg, fromPos) {
    if (!this.alive || this.god) return;
    this.health -= dmg;
    this.regenT = 0;
    this.lastDamageDir.copy(fromPos).sub(this.pos).normalize();
    if (this.health <= 0) { this.health = 0; this.alive = false; }
  }
}
