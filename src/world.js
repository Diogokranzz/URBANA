import * as THREE from '../vendor/three.module.js';
import { buildTextures, cv, colorTex, normalFromCanvas } from './textures.js';

export const TEX = {};

function softAlpha(size, power) {
  const c = cv(size, size);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.45, '#b8b8b8');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = img.data[i] / 255;
    const a = Math.pow(v, power || 1) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = a;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = colorTex(c, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function blobMask(size, seeds) {
  const c = cv(size, size);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  let s = seeds || 3;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 3; i++) {
    const x = size * (0.2 + rnd() * 0.6), y = size * (0.2 + rnd() * 0.6);
    const r = size * (0.14 + rnd() * 0.2);
    g.beginPath();
    g.moveTo(x + r, y);
    for (let k = 1; k <= 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const rr = r * (0.6 + rnd() * 0.75);
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.7, '#9a9a9a');
    grad.addColorStop(1, '#000000');
    g.fillStyle = grad;
    g.fill();
  }
  g.filter = 'blur(4px)';
  g.drawImage(c, 0, 0);
  g.filter = 'none';
  const t = colorTex(c, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function buildWorld(scene, renderer) {
  const driveCars = [];
  const T = buildTextures();
  Object.assign(TEX, T);

  const colliders = [];
  const decor = new THREE.Group();
  scene.add(decor);

  const tex = (t, rx, ry) => {
    const c = t.clone();
    c.needsUpdate = true;
    c.repeat.set(rx, ry);
    return c;
  };

  const collider = (min, max, surface) => colliders.push({ min, max, surface: surface || 'concrete' });

  function box(x, y, z, w, h, d, material, ry = 0, surface) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    if (Math.abs(Math.sin(ry)) < 0.01) {
      collider(new THREE.Vector3(x - w / 2, y, z - d / 2), new THREE.Vector3(x + w / 2, y + h, z + d / 2), surface);
    } else {
      collider(new THREE.Vector3(x - d / 2, y, z - w / 2), new THREE.Vector3(x + d / 2, y + h, z + w / 2), surface);
    }
    return m;
  }

  function deco(mesh, shadow) {
    mesh.castShadow = !!shadow;
    mesh.receiveShadow = true;
    decor.add(mesh);
    return mesh;
  }

  function plate(w, h, material, x, y, z, ry, rx) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    if (rx) m.rotation.x = rx;
    decor.add(m);
    return m;
  }

  const concreteM = () => new THREE.MeshStandardMaterial({
    map: tex(T.concrete, 3, 1.5),
    normalMap: tex(T.concrete, 3, 1.5),
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.92, metalness: 0.0, envMapIntensity: 0.7,
  });
  const ledgeM = new THREE.MeshStandardMaterial({ color: 0xb9b3a6, roughness: 0.85, envMapIntensity: 0.7 });
  const darkMetalM = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.42, metalness: 0.85, envMapIntensity: 1.2 });
  const galvanizedM = new THREE.MeshStandardMaterial({ color: 0x7d848b, roughness: 0.45, metalness: 0.8, envMapIntensity: 1.1 });
  const rubberM = new THREE.MeshStandardMaterial({ color: 0x0e0f12, roughness: 0.95, envMapIntensity: 0.4 });

  const moonDir = new THREE.Vector3(-0.42, 0.68, 0.6).normalize();
  const glowDir = new THREE.Vector3(0.55, 0.03, -0.83).normalize();

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x0c1728) },
      uHorizon: { value: new THREE.Color(0x3c4450) },
      uGlow: { value: new THREE.Color(0x8a5f2e) },
      uGlowDir: { value: glowDir.clone() },
      uMoonDir: { value: moonDir.clone() },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vP;
      void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      varying vec3 vP;
      uniform vec3 uTop, uHorizon, uGlow, uGlowDir, uMoonDir;
      uniform float uTime;
      float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      void main() {
        vec3 dir = normalize(vP);
        float h = dir.y;
        vec3 c = mix(uHorizon, uTop, smoothstep(-0.04, 0.62, h));
        float g = max(dot(dir, normalize(uGlowDir)), 0.0);
        float band = 1.0 - smoothstep(0.0, 0.36, abs(h - 0.02));
        c += uGlow * pow(g, 8.0) * 0.55 * band;
        c += uGlow * pow(g, 30.0) * 0.28 * band;
        float m = max(dot(dir, normalize(uMoonDir)), 0.0);
        c += vec3(0.9, 0.93, 1.0) * pow(m, 1500.0) * 7.0;
        c += vec3(0.28, 0.34, 0.5) * pow(m, 40.0) * 0.12;
        vec3 sd = dir * 950.0;
        vec3 cell = floor(sd);
        float hs = hash31(cell);
        float star = step(0.9993, hs);
        float tw = 0.65 + 0.35 * sin(uTime * 2.2 + hs * 90.0);
        c += vec3(0.85, 0.9, 1.0) * star * tw * 1.05 * smoothstep(0.05, 0.34, h);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), skyMat);
  skyMesh.frustumCulled = false;
  scene.add(skyMesh);

  if (renderer) {
    try {
      const envScene = new THREE.Scene();
      envScene.add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), skyMat.clone()));
      const floor = new THREE.Mesh(new THREE.CircleGeometry(58, 24),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.025, 0.035) }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.5;
      envScene.add(floor);
      const lightColors = [
        [1.35, 0.9, 0.45], [1.1, 0.75, 0.38], [0.5, 0.95, 1.25], [1.3, 0.36, 0.75],
        [0.62, 0.78, 1.15], [1.2, 0.95, 0.6], [0.4, 1.15, 0.85], [1.4, 0.78, 0.32],
      ];
      for (let i = 0; i < 10; i++) {
        const cc = lightColors[i % lightColors.length];
        const q = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(cc[0], cc[1], cc[2]), side: THREE.DoubleSide }));
        const a = (i / 10) * Math.PI * 2 + 0.3;
        q.position.set(Math.cos(a) * 26, 2.5 + (i % 4) * 2.6, Math.sin(a) * 26);
        q.lookAt(0, 3, 0);
        envScene.add(q);
      }
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromScene(envScene, 0.035, 1, 200);
      scene.environment = env.texture;
      pmrem.dispose();
    } catch (e) {
      scene.environment = null;
    }
  }

  scene.fog = new THREE.FogExp2(0x1a2331, 0.0142);

  const hemi = new THREE.HemisphereLight(0x4a5c76, 0x1e222a, 3.05);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xb6cbe8, 2.35);
  moon.position.copy(moonDir).multiplyScalar(90);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -95; moon.shadow.camera.right = 95;
  moon.shadow.camera.top = 95; moon.shadow.camera.bottom = -95;
  moon.shadow.camera.near = 1; moon.shadow.camera.far = 320;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.035;
  scene.add(moon);
  scene.add(moon.target);
  const rim = new THREE.DirectionalLight(0xffa552, 0.5);
  rim.position.set(-60, 26, 70);
  scene.add(rim);
  const bounce = new THREE.DirectionalLight(0x7c93ba, 0.55);
  bounce.position.set(20, -40, -30);
  scene.add(bounce);

  const groundMat = new THREE.MeshStandardMaterial({
    map: tex(T.asphalt, 15, 15),
    normalMap: tex(T.asphaltNormal, 15, 15),
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughnessMap: tex(T.asphaltRough, 3, 3),
    roughness: 1.0, metalness: 0.08, envMapIntensity: 1.5,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(280, 280), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const roadPaintM = new THREE.MeshStandardMaterial({
    color: 0xcfc8a8, roughness: 0.62, metalness: 0.0,
    transparent: true, opacity: 0.22, envMapIntensity: 0.9,
  });
  const laneLine = (x, z, len, horizontal) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(horizontal ? len : 0.32, horizontal ? 0.32 : len), roadPaintM);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.014, z);
    decor.add(m);
  };
  for (let i = -72; i <= 72; i += 7) {
    if (Math.abs(i) < 20) continue;
    laneLine(i, 0, 3.4, true);
    laneLine(0, i, 3.4, false);
  }
  laneLine(42.5, -9.5, 59, true); laneLine(-42.5, -9.5, 59, true);
  laneLine(42.5, 9.5, 59, true); laneLine(-42.5, 9.5, 59, true);
  laneLine(-9.5, 42.5, 59, false); laneLine(-9.5, -42.5, 59, false);
  laneLine(9.5, 42.5, 59, false); laneLine(9.5, -42.5, 59, false);
  const crosswalk = (axis) => {
    for (let i = 12.5; i <= 17.61; i += 1.7) {
      for (const s of [1, -1]) {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(axis === 'x' ? 0.82 : 18.6, axis === 'x' ? 18.6 : 0.82), roadPaintM);
        m.rotation.x = -Math.PI / 2;
        if (axis === 'x') m.position.set(s * i, 0.014, 0);
        else m.position.set(0, 0.014, s * i);
        decor.add(m);
      }
    }
  };
  crosswalk('x');
  crosswalk('z');

  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x070a10, roughness: 0.14, metalness: 0.3,
    transparent: true, alphaMap: blobMask(128, 5), depthWrite: false,
    envMapIntensity: 1.15, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const puddleMat2 = puddleMat.clone();
  puddleMat2.alphaMap = blobMask(128, 17);
  let pseed = 41;
  const prnd = () => (pseed = (pseed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 34; i++) {
    const s = 2.6 + prnd() * 5.4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * (0.5 + prnd() * 0.4)), i % 2 ? puddleMat : puddleMat2);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = prnd() * Math.PI * 2;
    const onSide = prnd() < 0.45;
    const gx = (prnd() - 0.5) * 150;
    const gz = (prnd() - 0.5) * 150;
    m.position.set(onSide ? Math.round(gx / 20) * 20 + (prnd() - 0.5) * 10 : gx, 0.018, onSide ? gz : Math.round(gz / 20) * 20 + (prnd() - 0.5) * 10);
    decor.add(m);
  }

  const manholeM = new THREE.MeshStandardMaterial({
    color: 0x3a3c3f, roughness: 0.55, metalness: 0.65, envMapIntensity: 1.4,
    map: tex(T.corrugated, 1, 1),
  });
  const manholeGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.05, 20);
  for (const [mx, mz] of [[5, -6], [-18, 9], [24, 3], [-4, -22], [12, 22], [-30, -3], [33, 18]]) {
    const m = new THREE.Mesh(manholeGeo, manholeM);
    m.position.set(mx, 0.03, mz);
    m.receiveShadow = true;
    decor.add(m);
  }

  const sideM = new THREE.MeshStandardMaterial({
    map: tex(T.sidewalk, 14, 14),
    normalMap: tex(T.sidewalk, 14, 14),
    normalScale: new THREE.Vector2(0.16, 0.16),
    roughness: 0.95, metalness: 0.02, envMapIntensity: 0.85,
  });
  const curbM = new THREE.MeshStandardMaterial({
    map: tex(T.concrete, 24, 1),
    normalMap: tex(T.concrete, 24, 1),
    normalScale: new THREE.Vector2(0.6, 0.6),
    color: 0x8e8a82, roughness: 0.9, envMapIntensity: 0.8,
  });
  function sidewalk(cx, cz, w, d) {
    const sw = box(cx, 0, cz, w, 0.22, d, sideM);
    box(cx, 0, cz - d / 2, w, 0.3, 0.5, curbM);
    box(cx, 0, cz + d / 2, w, 0.3, 0.5, curbM);
    box(cx - w / 2, 0, cz, 0.5, 0.3, d, curbM);
    box(cx + w / 2, 0, cz, 0.5, 0.3, d, curbM);
    return sw;
  }
  sidewalk(43, 43, 62, 62);
  sidewalk(-43, 43, 62, 62);
  sidewalk(43, -43, 62, 62);
  sidewalk(-43, -43, 62, 62);

  const litterM = new THREE.MeshStandardMaterial({
    map: T.litter, transparent: true, alphaTest: 0.4, roughness: 0.85, envMapIntensity: 0.8,
  });
  const litterM2 = litterM.clone();
  litterM2.map = T.litter2;
  for (let i = 0; i < 26; i++) {
    const s = 0.5 + Math.random() * 0.9;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), i % 2 ? litterM : litterM2);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI * 2;
    const edge = Math.random() < 0.6;
    m.position.set((Math.random() - 0.5) * 140, 0.025, edge
      ? (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 3)
      : (Math.random() - 0.5) * 140);
    if (!edge) m.position.x = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 3);
    decor.add(m);
  }

  const graffitiMats = T.graffiti.map(g => new THREE.MeshStandardMaterial({
    map: g, transparent: true, alphaTest: 0.18, roughness: 0.8,
    depthWrite: false, envMapIntensity: 0.75,
  }));
  const graffiti = (x, y, z, ry, w, h, pick) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w || 7, h || 3.4), graffitiMats[pick % graffitiMats.length]);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.renderOrder = 1;
    decor.add(m);
  };

  const facadeMaterials = T.facade.map((f, i) => new THREE.MeshStandardMaterial({
    map: tex(f.map, 1, 1),
    normalMap: tex(f.normal, 1, 1),
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.88, metalness: 0.02, envMapIntensity: 0.85,
    emissive: 0xffffff, emissiveIntensity: 1.35,
  }));

  const signGlowLights = [];
  let signIndex = 0;
  function sign(x, y, z, ry, w, h, tint) {
    const texture = T.signs[signIndex++ % T.signs.length];
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: true });
    if (tint) mat.color = new THREE.Color(tint);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    decor.add(m);
    const light = new THREE.PointLight(new THREE.Color(tint || 0xffc98a), 14, 22, 2);
    light.position.set(x + Math.sin(ry) * 0.8, y - 0.6, z + Math.cos(ry) * 0.8);
    scene.add(light);
    signGlowLights.push({ light, mat, base: 14, phase: Math.random() * 10 });
    return m;
  }

  const acM = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.55, metalness: 0.45, envMapIntensity: 1.1 });
  const acGrillM = new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.8, metalness: 0.2 });
  const acGeo = new THREE.BoxGeometry(0.86, 0.62, 0.72);
  const acGrillGeo = new THREE.CircleGeometry(0.26, 14);
  function acUnit(x, y, z, ry) {
    const ac = deco(new THREE.Mesh(acGeo, acM), true);
    ac.position.set(x, y, z);
    ac.rotation.y = ry;
    const gr = deco(new THREE.Mesh(acGrillGeo, acGrillM));
    gr.position.set(x + Math.sin(ry) * 0.37, y, z + Math.cos(ry) * 0.37);
    gr.rotation.y = ry;
    const bracket = deco(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.1), darkMetalM));
    bracket.position.set(x, y - 0.34, z + Math.cos(ry) * 0.3);
    bracket.rotation.y = ry;
  }

  function fireEscape(x, z, ry, floors, baseY) {
    const grp = new THREE.Group();
    grp.position.set(x, baseY, z);
    grp.rotation.y = ry;
    for (let f = 0; f < floors; f++) {
      const y = f * 3.4;
      const plat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 1.1), darkMetalM);
      plat.position.set(0, y, 0.55);
      plat.castShadow = true;
      plat.receiveShadow = true;
      grp.add(plat);
      for (const sx of [-1.55, 1.55]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), darkMetalM);
        rail.position.set(sx, y + 0.5, 1.02);
        grp.add(rail);
      }
      const railTop = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.07, 0.07), darkMetalM);
      railTop.position.set(0, y + 1.0, 1.02);
      grp.add(railTop);
      for (let b = 0; b < 9; b++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, 0.04), darkMetalM);
        bar.position.set(-1.5 + b * 0.37, y + 0.5, 1.02);
        grp.add(bar);
      }
      const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.5, 0.06), darkMetalM);
      ladder.position.set(1.1, y + 1.7, 0.9);
      ladder.rotation.x = -0.22;
      grp.add(ladder);
      const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8), darkMetalM);
      drain.position.set(1.55, y + 1.7, 1.02);
      grp.add(drain);
    }
    decor.add(grp);
  }

  function roofProps(cx, cz, w, d, h) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.9, 16), new THREE.MeshStandardMaterial({
      map: tex(T.tank, 2, 1), roughness: 0.75, metalness: 0.35, envMapIntensity: 0.9,
    }));
    tank.position.set(cx + w * 0.22, h + 1.45, cz - d * 0.2);
    tank.castShadow = true;
    decor.add(tank);
    const lid = new THREE.Mesh(new THREE.ConeGeometry(1.62, 0.5, 16), darkMetalM);
    lid.position.set(tank.position.x, h + 3.15, tank.position.z);
    decor.add(lid);
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), darkMetalM);
      leg.position.set(tank.position.x + ox * 1.1, h + 0.35, tank.position.z + oz * 1.1);
      decor.add(leg);
    }
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 1.1, 10), galvanizedM);
    vent.position.set(cx - w * 0.28, h + 0.55, cz + d * 0.24);
    vent.castShadow = true;
    decor.add(vent);
    const bulk = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 2.8), concreteM());
    bulk.position.set(cx - w * 0.24, h + 1.1, cz - d * 0.26);
    bulk.castShadow = true;
    decor.add(bulk);
    for (let i = 0; i < 3; i++) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 3.4 + i, 6), darkMetalM);
      ant.position.set(cx + w * 0.4 - i * 0.7, h + 1.7, cz + d * 0.4);
      decor.add(ant);
    }
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 12, 5), darkMetalM);
    cable.rotation.z = Math.PI / 2;
    cable.position.set(cx, h + 1.1, cz + d * 0.36);
    decor.add(cable);
  }

  function building(cx, cz, w, d, floors, variant, shopSide) {
    const fh = 3.4;
    const h = floors * fh;
    const bays = Math.max(3, Math.round(w / 3.3));
    const mat = facadeMaterials[variant % facadeMaterials.length].clone();
    const glow = (variant % 2 ? T.facadeGlowA : T.facadeGlowB).clone();
    glow.needsUpdate = true;
    mat.map = tex(T.facade[variant % T.facade.length].map, bays, floors);
    mat.normalMap = tex(T.facade[variant % T.facade.length].normal, bays, floors);
    mat.emissiveMap = glow;
    glow.repeat.set(bays / 8, floors / 4);
    box(cx, 0, cz, w, h, d, mat, 0, 'concrete');
    collider(new THREE.Vector3(cx - w / 2, 0, cz - d / 2), new THREE.Vector3(cx + w / 2, h, cz + d / 2), 'concrete');

    box(cx, h, cz, w + 0.7, 0.4, d + 0.7, concreteM());
    for (const [ox, oz, pw, pd] of [
      [0, d / 2 + 0.05, w + 0.7, 0.28],
      [0, -d / 2 - 0.05, w + 0.7, 0.28],
      [w / 2 + 0.05, 0, 0.28, d + 0.7],
      [-w / 2 - 0.05, 0, 0.28, d + 0.7],
    ]) {
      deco(new THREE.Mesh(new THREE.BoxGeometry(pw, 1.0, pd), concreteM()), true).position.set(cx + ox, h + 0.9, cz + oz);
    }
    for (let f = 1; f < floors; f++) {
      const y = f * fh - 0.25;
      for (const [ox, oz, pw, pd] of [
        [0, d / 2 + 0.06, w + 0.4, 0.16],
        [w / 2 + 0.06, 0, 0.16, d + 0.4],
      ]) {
        deco(new THREE.Mesh(new THREE.BoxGeometry(pw, 0.2, pd), ledgeM), true).position.set(cx + ox, y, cz + oz);
      }
    }
    roofProps(cx, cz, w, d, h);

    const sRep = Math.max(1, Math.round(w / 9));
    const shopMat = new THREE.MeshStandardMaterial({
      map: tex(T.shop.map, sRep, 1),
      roughness: 0.28, metalness: 0.1,
      emissive: 0xffffff, emissiveIntensity: 2.3,
      emissiveMap: tex(T.shop.glow, sRep, 1),
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    const q = 0.05;
    if (shopSide !== 'none') {
      plate(w - 2.5, 2.9, shopMat, cx, 1.75, cz + d / 2 + q, 0);
      plate(w - 2.5, 2.9, shopMat, cx, 1.75, cz - d / 2 - q, Math.PI);
      plate(d - 2.5, 2.9, shopMat, cx + w / 2 + q, 1.75, cz, Math.PI / 2);
      plate(d - 2.5, 2.9, shopMat, cx - w / 2 - q, 1.75, cz, -Math.PI / 2);
      const awning = new THREE.Mesh(new THREE.BoxGeometry(w - 3.5, 0.12, 1.5), new THREE.MeshStandardMaterial({
        color: shopSide === 'red' ? 0x7a2420 : 0x21403a, roughness: 0.9, envMapIntensity: 0.6,
      }));
      awning.position.set(cx, 3.35, cz + d / 2 + 0.72);
      awning.rotation.x = 0.12;
      deco(awning, true);
      const shutterMat = new THREE.MeshStandardMaterial({
        map: tex(T.corrugated, 4, 1.4), roughness: 0.55, metalness: 0.6, envMapIntensity: 1.0,
      });
      plate(4.2, 2.7, shutterMat, cx - w / 2 + 3.4, 1.6, cz + d / 2 + q + 0.02, 0);
      sign(cx + w * 0.28, 4.05, cz + d / 2 + 0.35, 0, 4.4, 2.2, null);
      graffiti(cx - w * 0.3, 1.9, cz + d / 2 + q + 0.03, 0, 6.5, 3.2, variant);
    }
    const sideZ = shopSide === 'none' ? 1 : 0;
    graffiti(cx + w / 2 + q + 0.03, 2.0, cz - d * 0.15, Math.PI / 2, 7, 3.6, variant + 1);
    if (sideZ) graffiti(cx - w / 2 - q - 0.03, 2.0, cz + d * 0.1, -Math.PI / 2, 6, 3.0, variant + 2);

    for (let i = 0; i < floors; i++) {
      if (Math.random() < 0.55) {
        const onX = Math.random() < 0.5;
        const px = onX ? cx + (Math.random() - 0.5) * w * 0.8 : cx + w / 2 + 0.42;
        const pz = onX ? cz + d / 2 + 0.42 : cz + (Math.random() - 0.5) * d * 0.8;
        acUnit(px, i * fh + 2.5, pz, onX ? 0 : Math.PI / 2);
      }
    }
    fireEscape(cx + w / 2 - 3.4, cz + d / 2 + 0.1, 0, Math.min(3, Math.max(2, Math.round(floors / 2))), floorMid(floors));
    const pipe = deco(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, h, 10), galvanizedM), false);
    pipe.position.set(cx - w * 0.34, h / 2, cz + d / 2 + 0.24);
  }

  function floorMid(floors) {
    return Math.max(3.4, (floors - Math.round(floors / 2)) * 3.4 - 1.2);
  }

  building(-45, -45, 26, 26, 7, 0, 'green');
  building(45, -45, 30, 24, 5, 1, 'red');
  building(-45, 45, 24, 28, 8, 2, 'red');
  building(45, 45, 26, 26, 6, 0, 'green');

  sign(9.5, 5.2, -45 + 13.2, Math.PI / 2 + Math.PI, 3.6, 1.8, '#7dff9b');
  sign(-9.5, 6.0, 45 - 14.2, -Math.PI / 2, 3.4, 1.7, '#ff5f8a');
  sign(45 - 13.2, 5.6, 9.5, Math.PI, 3.8, 1.9, '#5ce1ff');

  const skylineMats = [];
  for (let i = 0; i < 3; i++) {
    const glow = (i % 2 ? T.facadeGlowA : T.facadeGlowB).clone();
    glow.needsUpdate = true;
    glow.repeat.set(2, 3);
    const m = new THREE.MeshStandardMaterial({
      color: 0x202835, roughness: 0.9,
      emissive: 0xffffff, emissiveIntensity: 1.7, emissiveMap: glow,
    });
    skylineMats.push(m);
  }
  let sseed = 7;
  const srnd = () => (sseed = (sseed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + srnd() * 0.2;
    const r = 118 + srnd() * 90;
    const w = 12 + srnd() * 22;
    const hgt = 20 + srnd() * 65;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, w * 0.8), skylineMats[i % 3]);
    m.position.set(Math.cos(a) * r, hgt / 2, Math.sin(a) * r);
    m.rotation.y = srnd() * Math.PI;
    decor.add(m);
  }

  box(-30, 0, -30, 16, 4.5, 9, concreteM());
  box(-30, 4.5, -35.2, 16, 3, 1.4, concreteM());
  for (let i = 0; i < 4; i++) box(-30, 0, -24.2 + i * 1.2, 6, 0.9 + i * 0.95, 1.2, concreteM());

  const containerM = () => new THREE.MeshStandardMaterial({
    map: tex(T.corrugated, 2, 1), roughness: 0.5, metalness: 0.65, envMapIntensity: 1.05,
  });
  const containerG = () => new THREE.MeshStandardMaterial({
    map: tex(T.corrugatedGreen, 2, 1), roughness: 0.55, metalness: 0.6, envMapIntensity: 1.05,
  });
  box(30, 0, 34, 12, 5.2, 6, containerM(), 0);
  box(32, 0, -34, 12, 5.2, 6, containerG(), 0);
  box(34, 5.2, -34, 12, 5.2, 6, containerM(), 0);
  box(-34, 0, 30, 12, 5.2, 6, containerG(), Math.PI / 2);

  const dumpsterM = new THREE.MeshStandardMaterial({
    map: tex(T.corrugatedGreen, 3, 2), roughness: 0.58, metalness: 0.55, envMapIntensity: 1.1,
  });
  const dumpsterBlueM = new THREE.MeshStandardMaterial({
    map: tex(T.corrugated, 3, 2), roughness: 0.58, metalness: 0.55, envMapIntensity: 1.1,
  });
  function dumpster(x, z, ry, blue) {
    const g = new THREE.Group();
    const mm = blue ? dumpsterBlueM : dumpsterM;
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.15, 1.25), mm);
    body.position.y = 0.72;
    body.castShadow = true; body.receiveShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.09, 1.28), mm);
    lid.position.set(0, 1.34, -0.06);
    lid.rotation.x = -0.16;
    lid.castShadow = true;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 0.1), darkMetalM);
    rail.position.set(0, 0.3, 0.62);
    for (const sx of [-1.12, 1.12]) {
      for (const sz of [-0.55, 0.55]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.09, 10), rubberM);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx, 0.13, sz);
        g.add(wheel);
      }
    }
    g.add(body, lid, rail);
    g.position.set(x, 0.22, z);
    g.rotation.y = ry;
    decor.add(g);
    const cos = Math.abs(Math.cos(ry)), sin = Math.abs(Math.sin(ry));
    const hw = (2.5 * cos + 1.4 * sin) / 2, hd = (2.5 * sin + 1.4 * cos) / 2;
    collider(new THREE.Vector3(x - hw, 0.22, z - hd), new THREE.Vector3(x + hw, 1.6, z + hd), 'metal');
  }
  dumpster(13.2, -16.5, 0.12, false);
  dumpster(15.4, -18.2, -0.06, true);
  dumpster(-13.4, 16.4, Math.PI + 0.1, false);
  dumpster(-15.8, 18.1, Math.PI - 0.04, true);
  dumpster(30.5, 12.6, Math.PI / 2 + 0.08, true);

  const bagM = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.72, metalness: 0.05, envMapIntensity: 0.9 });
  const bagGeo = new THREE.SphereGeometry(0.42, 10, 8);
  for (const [bx, bz] of [[17.2, -19.6], [18.4, -20.4], [16.6, -20.9], [-17.4, 20.3], [-18.6, 19.6], [31.8, 14.4], [-31.6, -14.2]]) {
    for (let i = 0; i < 2; i++) {
      const bag = new THREE.Mesh(bagGeo, bagM);
      bag.position.set(bx + (Math.random() - 0.5) * 0.9, 0.34 + Math.random() * 0.1, bz + (Math.random() - 0.5) * 0.9);
      bag.scale.set(1, 0.82 + Math.random() * 0.2, 1);
      bag.rotation.y = Math.random() * 3;
      bag.castShadow = true;
      decor.add(bag);
    }
    collider(new THREE.Vector3(bx - 0.9, 0, bz - 0.9), new THREE.Vector3(bx + 0.9, 0.8, bz + 0.9), 'fabric');
  }

  const palletM = new THREE.MeshStandardMaterial({
    map: tex(T.concrete, 1, 1), color: 0x6b5334, roughness: 0.85, envMapIntensity: 0.7,
  });
  function pallet(x, z, ry) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.03, 0.14), palletM);
      plank.position.set(0, 0.1, -0.45 + i * 0.225);
      plank.castShadow = true;
      g.add(plank);
    }
    for (let i = 0; i < 3; i++) {
      const bearer = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 1.1), palletM);
      bearer.position.set(-0.46 + i * 0.46, 0.05, 0);
      g.add(bearer);
    }
    g.position.set(x, 0.22, z);
    g.rotation.y = ry;
    decor.add(g);
    collider(new THREE.Vector3(x - 0.7, 0.2, z - 0.7), new THREE.Vector3(x + 0.7, 0.55, z + 0.7), 'wood');
  }
  pallet(20, 30, 0.4);
  pallet(-26, -30, 1.2);
  pallet(-30, 40, 2.1);
  pallet(21.2, 29.4, 0.9);
  pallet(22.4, 31.2, 1.6);
  pallet(-37.5, 24.2, 0.7);

  const cardboardM = new THREE.MeshStandardMaterial({ color: 0x7a6244, roughness: 0.92, envMapIntensity: 0.7 });
  for (let i = 0; i < 6; i++) {
    const s = 0.5 + Math.random() * 0.4;
    const b = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.7, s * 0.9), cardboardM);
    b.position.set((Math.random() - 0.5) * 120, 0.22 + s * 0.35, (Math.random() < 0.5 ? -1 : 1) * (11 + Math.random() * 4));
    b.rotation.y = Math.random() * 3;
    b.castShadow = true;
    decor.add(b);
  }

  const coneM = new THREE.MeshStandardMaterial({ color: 0xe2571f, roughness: 0.7, envMapIntensity: 0.9 });
  const coneBandM = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.6, envMapIntensity: 0.9 });
  function cone(x, z) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), coneM);
    base.position.y = 0.03;
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.62, 12), coneM);
    body.position.y = 0.36;
    body.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.13, 0.08, 12), coneBandM);
    band.position.y = 0.42;
    g.add(base, body, band);
    g.position.set(x, 0.22, z);
    decor.add(g);
  }
  cone(7.4, -12.4); cone(8.1, -13.6); cone(6.8, -14.8); cone(9.2, -12.1);
  cone(-7.6, 12.6); cone(-8.4, 13.8);

  const bollardM = new THREE.MeshStandardMaterial({ color: 0x4b5057, roughness: 0.6, metalness: 0.5, envMapIntensity: 1.1 });
  const bollardGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.95, 12);
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? 1 : -1;
    const b = new THREE.Mesh(bollardGeo, bollardM);
    b.position.set(side * (12.6 + (i % 4) * 3.4), 0.68, side * 10.6);
    b.castShadow = true;
    decor.add(b);
    collider(new THREE.Vector3(b.position.x - 0.14, 0, b.position.z - 0.14), new THREE.Vector3(b.position.x + 0.14, 1.1, b.position.z + 0.14), 'metal');
  }

  function trafficLight(x, z, ry) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 10), darkMetalM);
    pole.position.y = 2.8;
    pole.castShadow = true;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 8), darkMetalM);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(1.1, 5.5, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.3), new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.6, metalness: 0.5 }));
    head.position.set(2.0, 5.15, 0);
    const colors = [[0x5c1410, 0.25], [0x5c4a10, 0.25], [0x1f5c22, 2.4]];
    colors.forEach(([col, inten], i) => {
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: inten, roughness: 0.35,
      }));
      lens.position.set(2.0, 5.15 + 0.28 - i * 0.28, 0.16);
      lens.rotation.y = 0;
      g.add(lens);
    });
    g.add(pole, arm, head);
    g.position.set(x, 0.22, z);
    g.rotation.y = ry;
    decor.add(g);
    const light = new THREE.PointLight(0x35d15a, 5, 12, 2);
    light.position.set(x + Math.cos(ry) * 2.0, 5.3, z - Math.sin(ry) * 2.0);
    scene.add(light);
    collider(new THREE.Vector3(x - 0.18, 0, z - 0.18), new THREE.Vector3(x + 0.18, 5.6, z + 0.18), 'metal');
  }
  trafficLight(-11.2, -12.6, 0.2);
  trafficLight(11.2, 12.6, Math.PI + 0.2);

  const sbMat = new THREE.MeshStandardMaterial({
    map: tex(T.concrete, 3, 1), color: 0x8a7f66, roughness: 0.9, envMapIntensity: 0.8,
  });
  box(-24, 0, -6, 9, 1.4, 1.6, sbMat, 0, 'concrete');
  box(24, 0, 6, 9, 1.4, 1.6, sbMat, 0, 'concrete');
  box(24, 0, -6, 1.6, 1.4, 9, sbMat, 0, 'concrete');
  box(-24, 0, 6, 1.6, 1.4, 9, sbMat, 0, 'concrete');

  function car(x, z, ry, color, kind) {
    const root = new THREE.Group();
    const g = new THREE.Group();
    g.rotation.y = Math.PI / 2;
    root.add(g);
    const police = kind === 'police';
    const paint = new THREE.MeshStandardMaterial({
      color, roughness: police ? 0.22 : 0.28, metalness: 0.85, envMapIntensity: 1.6,
    });
    const darkTrim = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.75, metalness: 0.3, envMapIntensity: 0.9 });
    const glassM = new THREE.MeshStandardMaterial({
      color: 0x1d2a36, roughness: 0.04, metalness: 0.95, transparent: true, opacity: 0.7,
      envMapIntensity: 2.4,
    });
    const chromeM = new THREE.MeshStandardMaterial({ color: 0xc4cbd2, roughness: 0.18, metalness: 1.0, envMapIntensity: 2.0 });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.5, 2.0), darkTrim);
    chassis.position.y = 0.42; g.add(chassis);
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.72, 2.0), paint);
    body.position.y = 1.03; body.castShadow = true; g.add(body);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.5, 1.9), paint);
    hood.position.set(1.55, 1.12, 0); hood.castShadow = true; g.add(hood);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.56, 1.9), paint);
    trunk.position.set(-1.72, 1.14, 0); trunk.castShadow = true; g.add(trunk);
    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 1.85), paint);
    cabRoof.position.set(-0.15, 1.98, 0); cabRoof.castShadow = true; g.add(cabRoof);
    const pilA = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.62, 1.8), paint);
    pilA.position.set(0.98, 1.68, 0); pilA.rotation.z = -0.28; g.add(pilA);
    const pilB = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.6, 1.8), paint);
    pilB.position.set(-1.28, 1.68, 0); pilB.rotation.z = 0.18; g.add(pilB);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 1.7), glassM);
    windshield.position.set(0.62, 1.66, 0); windshield.rotation.z = -0.5; g.add(windshield);
    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 1.7), glassM);
    rearGlass.position.set(-0.95, 1.67, 0); rearGlass.rotation.z = 0.45; g.add(rearGlass);
    const sideGlassL = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 0.05), glassM);
    sideGlassL.position.set(-0.15, 1.7, 0.94); g.add(sideGlassL);
    const sideGlassR = sideGlassL.clone(); sideGlassR.position.z = -0.94; g.add(sideGlassR);
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 2.02), darkTrim);
    bumperF.position.set(2.32, 0.72, 0); g.add(bumperF);
    const bumperR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 2.02), darkTrim);
    bumperR.position.set(-2.32, 0.72, 0); g.add(bumperR);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 1.4), chromeM);
    grille.position.set(2.26, 1.02, 0); g.add(grille);
    const headM = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffedb8, emissiveIntensity: 2.6, roughness: 0.15, envMapIntensity: 1.4 });
    const tailM = new THREE.MeshStandardMaterial({ color: 0x8a1410, emissive: 0xd42a1e, emissiveIntensity: 1.6, roughness: 0.25 });
    for (const sz of [0.68, -0.68]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.42), headM);
      hl.position.set(2.26, 1.22, sz); g.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.4), tailM);
      tl.position.set(-2.26, 1.24, sz); g.add(tl);
    }
    for (const sz of [1.05, -1.05]) {
      const mir = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.22), paint);
      mir.position.set(0.9, 1.55, sz); g.add(mir);
    }
    const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 20);
    const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.34, 12);
    const rimM = new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: 0.22, metalness: 0.95, envMapIntensity: 1.8 });
    [[-1.45, 0.98], [1.45, 0.98], [-1.45, -0.98], [1.45, -0.98]].forEach(([wx, wz]) => {
      const tire = new THREE.Mesh(tireGeo, rubberM);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(wx, 0.42, wz); tire.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, rimM);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(wx, 0.42, wz + (wz > 0 ? 0.02 : -0.02));
      g.add(tire, rim);
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.44),
      new THREE.MeshStandardMaterial({ color: 0xd8d5c8, roughness: 0.6 }));
    plate.position.set(-2.47, 0.72, 0); g.add(plate);
    const exM = new THREE.MeshStandardMaterial({ color: 0x33373c, roughness: 0.4, metalness: 0.92, envMapIntensity: 1.4 });
    for (const sz of [0.45, -0.45]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.38, 10), exM);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(-2.44, 0.5, sz);
      pipe.castShadow = true;
      g.add(pipe);
    }
    const flames = new THREE.Group();
    flames.name = 'exhaust-flames';
    flames.visible = false;
    const flameCoreM = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const flameOutM = new THREE.MeshBasicMaterial({ color: 0xff6a14, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (const rz of [0.45, -0.45]) {
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 8), flameCoreM);
      core.rotation.x = Math.PI / 2;
      core.position.set(rz, 0.5, 2.72);
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.95, 8), flameOutM);
      outer.rotation.x = Math.PI / 2;
      outer.position.set(rz, 0.5, 2.95);
      flames.add(core, outer);
    }
    root.add(flames);
    root.userData.flames = flames;

    const seatM = new THREE.MeshStandardMaterial({ color: 0x191c20, roughness: 0.92, envMapIntensity: 0.6 });
    const seatC = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.52), seatM);
    seatC.position.set(-0.45, 1.02, 0.47); g.add(seatC);
    const seatB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.12), seatM);
    seatB.position.set(-0.45, 1.3, 0.72); seatB.rotation.x = 0.15; g.add(seatB);
    const dashM = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.8 });
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.28, 1.75), dashM);
    dash.position.set(0.62, 1.28, 0); g.add(dash);
    const dialA = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xffb545, toneMapped: false }));
    dialA.position.set(0.26, 1.36, 0.55); dialA.rotation.x = -0.5; g.add(dialA);
    const dialB = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.09),
      new THREE.MeshBasicMaterial({ color: 0x53c8e8, toneMapped: false }));
    dialB.position.set(0.26, 1.36, -0.55); dialB.rotation.x = -0.5; g.add(dialB);
    const wheelG = new THREE.Group();
    const rimW = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 20), dashM);
    wheelG.add(rimW);
    for (let s = 0; s < 3; s++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.016, 0.02), dashM);
      spoke.rotation.z = s * Math.PI / 3;
      wheelG.add(spoke);
    }
    wheelG.position.set(0.1, 1.32, 0.42);
    wheelG.rotation.x = -0.42;
    wheelG.name = 'steering';
    g.add(wheelG);
    const seatMark = new THREE.Object3D();
    seatMark.name = 'driver-seat';
    seatMark.position.set(-0.45, 0.12, 0.47);
    g.add(seatMark);
    const mirrorIn = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.03), darkTrim);
    mirrorIn.position.set(0.28, 1.62, 0.1); g.add(mirrorIn);

    let strobes = null;
    if (police) {
      const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.34), darkTrim);
      barBase.position.set(-0.15, 2.06, 0);
      g.add(barBase);
      const redM = new THREE.MeshBasicMaterial({ color: 0xff2a22, toneMapped: false });
      const blueM = new THREE.MeshBasicMaterial({ color: 0x2a6bff, toneMapped: false });
      const lampL = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.3), redM);
      lampL.position.set(-0.55, 2.16, 0);
      const lampR = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.3), blueM);
      lampR.position.set(0.28, 2.16, 0);
      g.add(lampL, lampR);
      const lr = new THREE.PointLight(0xff2a22, 14, 16, 2);
      lr.position.set(-0.9, 2.1, 0.4);
      const lb = new THREE.PointLight(0x2a6bff, 14, 16, 2);
      lb.position.set(0.9, 2.1, -0.4);
      root.add(lr, lb);
      strobes = { red: redM, blue: blueM, lr, lb };
    }

    root.position.set(x, 0, z); root.rotation.y = ry - Math.PI / 2;
    root.userData.drive = { ry, x, z };
    root.userData.strobes = strobes;
    scene.add(root);
    const cos = Math.abs(Math.cos(root.rotation.y)), sin = Math.abs(Math.sin(root.rotation.y));
    const hw = (2.1 * cos + 4.9 * sin) / 2, hd = (2.1 * sin + 4.9 * cos) / 2;
    const col = {
      min: new THREE.Vector3(x - hw, 0, z - hd),
      max: new THREE.Vector3(x + hw, 2.0, z + hd),
      surface: 'metal',
    };
    col.carGroup = root;
    colliders.push(col);
    driveCars.push(root);
  }
  car(-9, 16.5, 0.1, 0x7a2a22);
  car(9, -16.5, Math.PI - 0.1, 0x26405c);
  car(-16.5, -9, Math.PI / 2 + 0.05, 0x54585e, 'police');
  car(16.5, 8.5, Math.PI / 2 - 0.08, 0x6b5a2c);

  const lampLights = [];
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(0xffb976) }, uOpacity: { value: 0.05 } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        float a = pow(vUv.y, 1.7) * (1.0 - abs(vUv.x - 0.5) * 2.0);
        gl_FragColor = vec4(uColor, max(a, 0.0) * uOpacity);
      }
    `,
  });

  function lamp(x, z, flipX, color, intensity) {
    const fx = flipX ? -1 : 1;
    const poleM = new THREE.MeshStandardMaterial({ color: 0x1d2126, roughness: 0.5, metalness: 0.8, envMapIntensity: 1.2 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 7.2, 10), poleM);
    pole.position.set(x, 3.6, z); pole.castShadow = true;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 10), poleM);
    base.position.set(x, 0.47, z);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 8), poleM);
    arm.rotation.z = fx * Math.PI / 2 - 0.25 * fx;
    arm.position.set(x + fx * 1.0, 7.15, z);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.55, 10), poleM);
    collar.position.set(x, 7.25, z); collar.castShadow = true;
    const strutA = new THREE.Vector3(x, 6.45, z);
    const strutB = new THREE.Vector3(x + fx * 0.9, 7.18, z);
    const strutLen = strutA.distanceTo(strutB);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.042, strutLen, 6), poleM);
    strut.position.copy(strutA).add(strutB).multiplyScalar(0.5);
    strut.rotation.z = Math.atan2(-(strutB.x - strutA.x), strutB.y - strutA.y);
    strut.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.14, 0.3), poleM);
    head.position.set(x + fx * 2.0, 7.0, z);
    const lensCol = color || 0xffe0a8;
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.24), new THREE.MeshStandardMaterial({
      color: lensCol, emissive: lensCol, emissiveIntensity: 9.0, roughness: 0.25, toneMapped: true,
    }));
    lens.position.set(x + fx * 2.0, 6.9, z);
    const shaft = new THREE.Mesh(new THREE.ConeGeometry(1.35, 6.6, 20, 1, true), shaftMat);
    shaft.position.set(x + fx * 2.0, 3.6, z);
    decor.add(shaft);
    scene.add(pole, base, arm, collar, strut, head, lens);
    if (intensity !== 0) {
      const pl = new THREE.PointLight(lensCol, intensity || 78, 36, 2);
      pl.position.set(x + fx * 2.0, 6.65, z);
      scene.add(pl);
      lampLights.push(pl);
    }
    collider(new THREE.Vector3(x - 0.2, 0, z - 0.2), new THREE.Vector3(x + 0.2, 7, z + 0.2), 'metal');
  }
  lamp(-13, -11.5, false);
  lamp(15, 11.5, true);
  lamp(-14, 14, false);
  lamp(16, -14, true);
  lamp(-40, -11.5, false, 0xffd8a8, 0);
  lamp(42, 11.5, true, 0xffd8a8, 0);
  lamp(-42, 12, false, 0xffd8a8, 0);
  lamp(40, -12, true, 0xffd8a8, 0);
  lamp(0, -46, true, 0xffd0a0, 54);
  lamp(0, 46, false, 0xffd0a0, 54);
  lamp(-32, -46, true, 0xffc98a, 0);
  lamp(32, 46, false, 0xffc98a, 0);
  lamp(58, 0, true, 0xffc98a, 0);
  lamp(-58, 0, false, 0xffc98a, 0);
  lamp(20, 60, true, 0xffd0a0, 70);
  lamp(-20, -60, false, 0xffd0a0, 70);
  lamp(60, 20, true, 0xffd0a0, 70);
  lamp(-60, -20, false, 0xffd0a0, 70);

  function wire(x1, z1, x2, z2, y, sag) {
    const a = new THREE.Vector3(x1, y, z1);
    const b = new THREE.Vector3(x2, y, z2);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y -= sag || 1.1;
    const curve = new THREE.CatmullRomCurve3([a, mid, b]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.022, 4, false), rubberM);
    decor.add(tube);
  }
  wire(-13, -11.5, 15, 11.5, 7.2, 1.6);
  wire(15, 11.5, -14, 14, 7.2, 1.4);
  wire(-14, 14, 16, -14, 7.2, 1.8);
  wire(-40, -11.5, -14, 14, 7.2, 1.2);
  wire(42, 11.5, 40, -12, 7.2, 0.9);
  wire(-13, -11.5, -40, -11.5, 7.2, 1.1);

  const hydBody = new THREE.MeshStandardMaterial({ color: 0xa02a20, roughness: 0.45, metalness: 0.35, envMapIntensity: 1.2 });
  const hydCap = new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 0.5, metalness: 0.4, envMapIntensity: 1.2 });
  function hydrant(x, z) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.62, 10), hydBody);
    b.position.y = 0.31; b.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), hydCap);
    cap.position.y = 0.66;
    const n1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), hydBody);
    n1.rotation.z = Math.PI / 2; n1.position.y = 0.42;
    g.add(b, cap, n1);
    g.position.set(x, 0.22, z);
    decor.add(g);
    collider(new THREE.Vector3(x - 0.18, 0, z - 0.18), new THREE.Vector3(x + 0.18, 0.9, z + 0.18), 'metal');
  }
  hydrant(14.5, 30.5);
  hydrant(-14.5, -30.5);

  function kiosk(x, z, ry) {
    const g = new THREE.Group();
    const frameM = new THREE.MeshStandardMaterial({ color: 0x223c30, roughness: 0.6, metalness: 0.35, envMapIntensity: 1.0 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.3, 1.6), frameM);
    body.position.y = 1.35; body.castShadow = true;
    const awn = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.08, 2.1),
      new THREE.MeshStandardMaterial({ color: 0x6e2420, roughness: 0.85, envMapIntensity: 0.6 }));
    awn.position.set(0, 2.55, 0.15); awn.rotation.x = 0.12;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.2), new THREE.MeshStandardMaterial({
      color: 0x141c22, roughness: 0.15, metalness: 0.7,
      emissive: 0xffc98a, emissiveIntensity: 1.9, envMapIntensity: 1.6,
    }));
    win.position.set(0, 1.5, 0.82);
    const kLight = new THREE.PointLight(0xffc07a, 12, 16, 2);
    kLight.position.set(x, 1.7, z + 1.2);
    scene.add(kLight);
    g.add(body, awn, win);
    g.position.set(x, 0.22, z); g.rotation.y = ry;
    decor.add(g);
    const cos = Math.abs(Math.cos(ry)), sin = Math.abs(Math.sin(ry));
    const hw = (3.4 * cos + 1.8 * sin) / 2, hd = (3.4 * sin + 1.8 * cos) / 2;
    collider(new THREE.Vector3(x - hw, 0, z - hd), new THREE.Vector3(x + hw, 2.6, z + hd), 'wood');
  }
  kiosk(20, 15.2, -0.4);
  kiosk(-20, -15.2, 2.7);

  const wallMat = new THREE.MeshStandardMaterial({
    map: tex(T.brick, 30, 3),
    normalMap: tex(T.brick, 30, 3),
    normalScale: new THREE.Vector2(0.7, 0.7),
    color: 0x8a8076, roughness: 0.9, envMapIntensity: 0.7,
  });
  box(0, 0, -75, 150, 9, 2, wallMat, 0, 'brick');
  box(0, 0, 75, 150, 9, 2, wallMat, 0, 'brick');
  box(-75, 0, 0, 2, 9, 150, wallMat, 0, 'brick');
  box(75, 0, 0, 2, 9, 150, wallMat, 0, 'brick');

  const drumMat = new THREE.MeshStandardMaterial({
    map: tex(T.rustyMetal, 3, 1), color: 0x9a6a3a, roughness: 0.65, metalness: 0.5, envMapIntensity: 1.1,
  });
  const drumGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.5, 14);
  const drums = [[14.8, 24], [16.4, 25.2], [-14.8, -24], [-16.4, -25.2], [24.5, 14.8], [-24.5, -14.8]];
  for (const [dx, dz] of drums) {
    const d = new THREE.Mesh(drumGeo, drumMat);
    d.position.set(dx, 0.75, dz); d.castShadow = true;
    scene.add(d);
    collider(new THREE.Vector3(dx - 0.6, 0, dz - 0.6), new THREE.Vector3(dx + 0.6, 1.5, dz + 0.6), 'metal');
  }

  for (const [px, pz] of [[26, 56], [-26, -56], [56, -26], [-56, 26], [26, -56], [-26, 56]]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.0), cardboardM);
    crate.position.set(px, 0.72, pz);
    crate.rotation.y = Math.random() * 0.6;
    crate.castShadow = true;
    decor.add(crate);
    const drum = new THREE.Mesh(drumGeo, drumMat);
    drum.position.set(px + 1.7, 0.75, pz + 0.6);
    drum.castShadow = true;
    decor.add(drum);
    collider(new THREE.Vector3(px - 0.8, 0, pz - 0.8), new THREE.Vector3(px + 2.5, 1.5, pz + 1.4), 'wood');
    cone(px - 1.6, pz + 1.8);
    cone(px - 1.1, pz + 2.4);
  }

  const steamMat = new THREE.MeshBasicMaterial({
    map: softAlpha(64, 1.6), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, color: 0x8fa4b8, opacity: 0.1, toneMapped: false,
  });
  const steams = [];
  for (const [sx, sz] of [[-6, 14], [8, -18], [-20, -2], [26, 6]]) {
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), steamMat.clone());
      s.position.set(sx + (Math.random() - 0.5), 0.6 + i * 0.5, sz + (Math.random() - 0.5));
      s.userData.baseY = s.position.y;
      s.userData.phase = Math.random() * 6.28;
      decor.add(s);
      steams.push(s);
    }
  }

  const neonColors = [0xff3d7a, 0x35d0ff, 0xffc247, 0x62ff9b, 0xb46bff];
  const neonGeo = new THREE.BoxGeometry(0.06, 0.06, 2.8);
  const neonSpots = [
    [-12.6, 3.3, -22, Math.PI / 2],
    [31.7, 3.1, 12.6, Math.PI / 2],
    [-31.7, 3.5, -4, Math.PI / 2],
    [12.6, 2.9, 31.7, 0],
    [-8.6, 3.8, -45 + 13.4, Math.PI / 2],
    [45 - 13.4, 3.6, -8.6, Math.PI],
    [-12.6, 4.1, 19.4, Math.PI / 2],
  ];
  neonSpots.forEach(([nx, ny, nz, nry], i) => {
    const col = neonColors[i % neonColors.length];
    const tube = new THREE.Mesh(neonGeo, new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 4.2, roughness: 0.35,
    }));
    tube.position.set(nx, ny, nz);
    tube.rotation.y = nry;
    decor.add(tube);
    const glow = new THREE.PointLight(col, 11, 16, 2);
    glow.position.set(nx, ny - 0.3, nz + Math.cos(nry) * 0.5);
    scene.add(glow);
    signGlowLights.push({ light: glow, mat: tube.material, base: 11, phase: Math.random() * 10 });
  });

  const spillTex = softAlpha(128, 1.9);
  function spill(x, z, w, d, color, opacity) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({
      map: spillTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.03, z);
    m.renderOrder = 2;
    decor.add(m);
  }
  const shopSpills = [
    [-32.5, -32.5, 26, 26, 0xffb066, 0.5],
    [33.5, -32.5, 28, 26, 0xffab63, 0.46],
    [-32.5, 33.5, 26, 28, 0xffab63, 0.46],
    [33.5, 33.5, 24, 24, 0xffb066, 0.5],
  ];
  for (const [sx, sz, sw, sd, sc, so] of shopSpills) spill(sx, sz, sw, sd, sc, so);
  spill(20, 15.2, 12, 12, 0xffb066, 0.42);
  spill(-20, -15.2, 12, 12, 0xffb066, 0.42);
  spill(-14.5, -11.5, 18, 18, 0xffd6a0, 0.4);
  spill(15, 11.5, 18, 18, 0xffd6a0, 0.4);
  spill(-14, 14, 18, 18, 0xffd6a0, 0.38);
  spill(16, -14, 18, 18, 0xffd6a0, 0.38);
  spill(0, -45, 20, 20, 0xffc98a, 0.34);
  spill(0, 45, 20, 20, 0xffc98a, 0.34);
  for (let i = 0; i < neonSpots.length; i++) {
    const [nx, ny, nz, nry] = neonSpots[i];
    spill(nx + Math.sin(nry) * 2.2, nz + Math.cos(nry) * 2.2, 10, 10, neonColors[i % neonColors.length], 0.4);
  }

  const spawns = [
    [-20, 60], [20, 60], [-20, -60], [20, -60],
    [-58, 0], [58, 0], [0, -58], [0, 58],
    [-68, -45], [30, 45], [45, -20], [-45, 15],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  const coverPoints = [
    [-25, -8], [25, 8], [-10, 25], [12, -25],
    [-18, 4], [20, -14], [8, 20], [-34, 16],
    [0, 2], [-5, -30], [16.5, 29.5], [-48, -30], [48, 30],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  function applyQuality(level) {
    const media = level === 'media';
    const baixa = level === 'baixa';
    lampLights.forEach((l, i) => { l.visible = !baixa && (!media || i < 4); });
    signGlowLights.forEach((sg, i) => { sg.light.visible = !baixa && (!media || i < 6); });
  }

  let animT = 0;
  function animate(t, dt) {
    animT = t;
    skyMat.uniforms.uTime.value = t;
    const st = Math.sin(t * 3.6);
    for (const c of driveCars) {
      const s = c.userData.strobes;
      if (!s) continue;
      const on = Math.sin(t * 7) > 0 ? 1 : 0;
      s.red.color.setRGB(on ? 3.4 : 0.05, 0.05, 0.05);
      s.blue.color.setRGB(0.05, 0.08, on ? 3.6 : 0.05);
      s.lr.intensity = on ? 22 : 2;
      s.lb.intensity = on ? 2 : 22;
    }
    for (const sg of signGlowLights) {
      const flick = 0.88 + Math.sin(t * 7.3 + sg.phase) * 0.06 + Math.sin(t * 31.7 + sg.phase) * 0.07;
      const k = Math.max(0.6, flick);
      sg.light.intensity = sg.base * k;
      if (sg.mat.emissiveIntensity !== undefined) sg.mat.emissiveIntensity = 4.2 * k;
      else sg.mat.color.setScalar(k);
    }
    for (let i = 0; i < steams.length; i++) {
      const s = steams[i];
      const k = (t * 0.35 + s.userData.phase) % 1;
      s.position.y = s.userData.baseY + k * 2.2;
      s.rotation.z = Math.sin(t + i) * 0.2;
      s.material.opacity = 0.11 * (1 - k);
      s.scale.setScalar(0.7 + k * 1.5);
    }
    const camPos = scene.userData.animCam;
    if (camPos) {
      for (const s of steams) s.lookAt(camPos.x, s.position.y, camPos.z);
    }
    void st;
  }

  return { colliders, spawns, coverPoints, sun: moon, driveCars, hemi, animate, applyQuality, sky: skyMesh };
}
