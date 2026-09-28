import * as THREE from '../vendor/three.module.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.muzzleLight = new THREE.PointLight(0xffc773, 0, 22, 2);
    scene.add(this.muzzleLight);
    this.muzzleT = 0;

    this.decals = [];
    this.decalIdx = 0;
    const holeC = cvHole();
    this.holeTex = holeC;
    this.holeMat = new THREE.MeshBasicMaterial({
      map: holeC, transparent: true, depthWrite: false, opacity: 0.95,
      polygonOffset: true, polygonOffsetFactor: -4,
    });
    const planeGeo = new THREE.PlaneGeometry(0.28, 0.28);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(planeGeo, this.holeMat);
      m.visible = false;
      scene.add(m);
      this.decals.push(m);
    }

    this.sparks = [];
    this.bloods = [];
    this.casings = [];
    this.smokes = [];
    this.explosions = [];
    this.CAPS = { sparks: 220, bloods: 200, casings: 50, smokes: 140 };

    this.sparkGeo = new THREE.SphereGeometry(0.03, 4, 3);
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
    this.debrisGeo = new THREE.SphereGeometry(0.045, 4, 3);
    this.debrisMat = new THREE.MeshBasicMaterial({ color: 0x8a8378 });
    this.bloodGeo = new THREE.SphereGeometry(0.028, 5, 4);
    this.bloodMats = [
      new THREE.MeshBasicMaterial({ color: 0x4a0507, transparent: true, opacity: 0.96 }),
      new THREE.MeshBasicMaterial({ color: 0x6e0a0c, transparent: true, opacity: 0.94 }),
      new THREE.MeshBasicMaterial({ color: 0x2e0304, transparent: true, opacity: 0.97 }),
    ];
    this.bloodMat = this.bloodMats[1];
    this.casingGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6);
    this.casingMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3 });

    this.smokeTex = makeSmokeTex();
    this.bloodMistTex = makeSmokeTex();
  }

  tracer(from, to, speed = 320) {
    const geo = new THREE.CylinderGeometry(0.018, 0.018, 1, 4, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0.9, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(geo, mat);
    const len = from.distanceTo(to);
    m.scale.y = Math.min(6, len * 0.35);
    m.position.copy(from);
    m.lookAt(to);
    m.rotateX(Math.PI / 2);
    scene_add(this.scene, m, true);
    this.tracers.push({ mesh: m, from: from.clone(), to: to.clone(), t: 0, speed });
  }

  muzzleFlash(pos, dir) {
    this.muzzleLight.position.copy(pos).addScaledVector(dir, 0.35);
    this.muzzleLight.intensity = 55;
    this.muzzleT = 1;
  }

  impact(point, normal, kind) {
    if (kind !== 'flesh') {
      const d = this.decals[this.decalIdx % this.decals.length];
      this.decalIdx++;
      d.visible = true;
      d.position.copy(point).addScaledVector(normal, 0.012);
      _q.setFromUnitVectors(_v1.set(0, 0, 1), normal);
      d.quaternion.copy(_q);
      d.rotation.z = Math.random() * Math.PI * 2;
      d.scale.setScalar(0.7 + Math.random() * 0.7);
    }

    if (kind === 'metal') {
      for (let i = 0; i < 9; i++) {
        const p = new THREE.Mesh(this.sparkGeo, this.sparkMat);
        p.position.copy(point);
        const v = normal.clone().multiplyScalar(2 + Math.random() * 4)
          .add(randVec(3.5));
        scene_add(this.scene, p);
        this.sparks.push({ mesh: p, vel: v, life: 0.3 + Math.random() * 0.3, kind: 'spark' });
        if (this.sparks.length > this.CAPS.sparks) { const o = this.sparks.shift(); scene_remove(this.scene, o.mesh); }
      }
    } else if (kind === 'concrete') {
      for (let i = 0; i < 6; i++) {
        const p = new THREE.Mesh(this.debrisGeo, this.debrisMat);
        p.position.copy(point);
        const v = normal.clone().multiplyScalar(1.5 + Math.random() * 3).add(randVec(2));
        scene_add(this.scene, p);
        this.sparks.push({ mesh: p, vel: v, life: 0.5, kind: 'debris', grav: 12 });
        this.spawnDust(point, 0.6);
      }
      this.spawnDust(point, 1.0);
    } else if (kind === 'flesh') {
      this.bloodSpray(point, normal, 1.0);
    } else if (kind === 'wood') {
      for (let i = 0; i < 5; i++) {
        const p = new THREE.Mesh(this.debrisGeo, this.debrisMat);
        p.position.copy(point);
        const v = normal.clone().multiplyScalar(1.5 + Math.random() * 3).add(randVec(2));
        scene_add(this.scene, p);
        this.sparks.push({ mesh: p, vel: v, life: 0.5, kind: 'debris', grav: 12 });
      }
    }
  }

  bloodSpray(point, dir, force = 1) {
    for (let i = 0; i < 5; i++) {
      const s = makeSprite(this.bloodMistTex, 0.35 + Math.random() * 0.4, 0x5a0608, 0.4);
      s.position.copy(point);
      scene_add(this.scene, s, true);
      this.smokes.push({
        sprite: s,
        vel: dir.clone().multiplyScalar(1.2 * force).add(randVec(1.1)),
        life: 0.4, grow: 2.4,
      });
    }
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Mesh(this.bloodGeo, this.bloodMats[i % 3]);
      p.position.copy(point);
      p.scale.setScalar(0.4 + Math.random() * 1.2);
      const v = dir.clone()
        .multiplyScalar((2.5 + Math.random() * 4.5) * force)
        .add(randVec(2.2 * force));      scene_add(this.scene, p);
        this.bloods.push({ mesh: p, vel: v, life: 0.9, grav: 22 });
      if (this.bloods.length > this.CAPS.bloods) { const o = this.bloods.shift(); scene_remove(this.scene, o.mesh); }
    }
    this.bloodPool(point, force);
  }

  spawnDust(point, size) {
    const s = makeSprite(this.smokeTex, 0.9 * size, 0xcfc8bc, 0.35);
    s.position.copy(point);
    scene_add(this.scene, s, true);
    this.smokes.push({ sprite: s, vel: new THREE.Vector3(rand(-0.3, 0.3), rand(0.2, 0.6), rand(-0.3, 0.3)), life: 1.2, grow: 1.5 });
  }

  bloodPool(point, force = 1) {
    if (this.bloodPools === undefined) {
      this.bloodPools = [];
      this.poolIdx = 0;
      const geo = new THREE.CircleGeometry(0.5, 14);
      const mats = [0x3a0405, 0x520709, 0x2b0303].map(c =>
        new THREE.MeshBasicMaterial({
          color: c, transparent: true, opacity: 0.88, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -2,
        }));
      for (let i = 0; i < 36; i++) {
        const m = new THREE.Mesh(geo, mats[i % 3]);
        m.rotation.x = -Math.PI / 2; m.visible = false;
        scene_add(this.scene, m);
        this.bloodPools.push(m);
      }
    }
    const n = 3;
    for (let j = 0; j < n; j++) {
      const p = this.bloodPools[(this.poolIdx++) % this.bloodPools.length];
      p.visible = true;
      p.position.set(
        point.x + (Math.random() - 0.5) * 0.5,
        0.021 + j * 0.001,
        point.z + (Math.random() - 0.5) * 0.5);
      p.rotation.z = Math.random() * Math.PI * 2;
      const s = (0.4 + Math.random() * 0.7) * force;
      p.scale.setScalar(s);
      p.userData.grow = 0.35 * force;
    }
  }

  casing(pos, rightDir, forwardDir) {
    const c = new THREE.Mesh(this.casingGeo, this.casingMat);
    c.position.copy(pos);
    scene_add(this.scene, c);
    this.casings.push({
      mesh: c,
      vel: rightDir.clone().multiplyScalar(2 + Math.random())
        .add(_v2.set(rand(-0.5, 0.5), rand(1.5, 2.5), rand(-0.5, 0.5))),
      angVel: randVec(14),
      life: 4,
    });
    if (this.casings.length > this.CAPS.casings) { const o = this.casings.shift(); scene_remove(this.scene, o.mesh); }
  }

  explosion(pos) {
    const fire = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa63d, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    fire.position.copy(pos);
    scene_add(this.scene, fire);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.55, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe8b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI / 2;
    scene_add(this.scene, ring);
    for (let i = 0; i < 22; i++) {
      const s = makeSprite(this.smokeTex, 1.6, 0x2a2a2a, 0.7);
      s.position.copy(pos).add(randVec(1.2));
      scene_add(this.scene, s, true);
      this.smokes.push({ sprite: s, vel: randVec(3).setY(rand(1, 4)), life: 2.4, grow: 2.2 });
    }
    this.explosions.push({ fire, ring, t: 0 });
  }

  update(dt, camPos) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t += tr.speed * dt;
      const d = tr.from.distanceTo(tr.to);
      if (tr.t > d) {
        scene_remove(this.scene, tr.mesh);
        this.tracers.splice(i, 1);
        continue;
      }
      _v1.copy(tr.to).sub(tr.from).normalize();
      tr.mesh.position.copy(tr.from).addScaledVector(_v1, tr.t);
    }

    if (this.muzzleT > 0) {
      this.muzzleT -= dt * 14;
      this.muzzleLight.intensity = 55 * Math.max(0, this.muzzleT) ** 2;
    }

    const stepParts = (arr, grav, fade) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.life -= dt;
        if (p.life <= 0) { scene_remove(this.scene, p.mesh); arr.splice(i, 1); continue; }
        p.vel.y -= (p.grav !== undefined ? p.grav : grav) * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        if (p.mesh.position.y < 0.03) { p.mesh.position.y = 0.03; p.vel.y *= -0.35; p.vel.x *= 0.7; p.vel.z *= 0.7; }
      }
    };
    stepParts(this.sparks, 10, true);
    stepParts(this.bloods, 22, true);

    if (this.bloodPools) {
      for (const p of this.bloodPools) {
        if (p.visible && p.userData.grow > 0) {
          p.scale.addScalar(p.userData.grow * dt);
          p.userData.grow = Math.max(0, p.userData.grow - dt * 0.4);
        }
      }
    }

    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      if (c.life <= 0) { scene_remove(this.scene, c.mesh); this.casings.splice(i, 1); continue; }
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
      if (s.life <= 0) { scene_remove(this.scene, s.sprite); this.smokes.splice(i, 1); continue; }
      s.sprite.position.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(1 - dt * 0.5);
      s.sprite.material.opacity = Math.min(0.35, s.life * 0.3);
      s.sprite.scale.addScalar(s.grow * dt);
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.t += dt;
      const k = e.t / 0.45;
      e.fire.scale.setScalar(0.5 + k * 3.4);
      e.fire.material.opacity = Math.max(0, 1 - k);
      const rk = e.t / 0.55;
      e.ring.scale.setScalar(1 + rk * 22);
      e.ring.material.opacity = Math.max(0, 0.9 - rk);
      if (e.t > 0.6) {
        scene_remove(this.scene, e.fire);
        scene_remove(this.scene, e.ring);
        this.explosions.splice(i, 1);
      }
    }
  }
}

function scene_add(scene, obj, own = false) { obj.userData.own = own; scene.add(obj); }
function scene_remove(scene, obj) {
  scene.remove(obj);
  if (!obj.userData?.own) return;
  if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
  if (obj.material && obj.material.dispose) obj.material.dispose();
}

function rand(a, b) { return a + Math.random() * (b - a); }
function randVec(s) {
  return new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.2, 1) * s);
}

function cvHole() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(8,8,8,0.95)');
  grad.addColorStop(0.35, 'rgba(25,22,20,0.85)');
  grad.addColorStop(0.7, 'rgba(60,55,50,0.4)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeSmokeTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeSprite(tex, scale, color, opacity) {
  const mat = new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity,
    depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(scale);
  return s;
}
