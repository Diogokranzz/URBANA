// ============================================================
//  MUNDO — mapa urbano, iluminação, texturas procedurais
// ============================================================
import * as THREE from '../vendor/three.module.js';

export const TEX = {}; // texturas procedurais compartilhadas

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// grão fino compartilhado (poeira/pintas) usado por várias texturas
function grain(g, w, h, n, alpha) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() * 255 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha * Math.random()})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}

// manchas escuras irregulares (umidade, fuligem)
function stains(g, w, h, n, color, maxR) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 8 + Math.random() * (maxR || 42);
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, color);
    rad.addColorStop(1, color.replace(/0\.\d+\)/, '0)'));
    g.fillStyle = rad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// rachaduras finas
function cracks(g, w, h, n) {
  g.strokeStyle = 'rgba(20,18,16,0.35)';
  for (let i = 0; i < n; i++) {
    g.lineWidth = 0.6 + Math.random();
    g.beginPath();
    let x = Math.random() * w, y = Math.random() * h;
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (Math.random() - 0.5) * 40; y += Math.random() * 26;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

// textura de concreto com manchas e juntas
function makeConcrete() {
  const c = cv(256, 256), g = c.getContext('2d');
  g.fillStyle = '#97918a'; g.fillRect(0, 0, 256, 256);
  grain(g, 256, 256, 4200, 0.09);
  stains(g, 256, 256, 12, 'rgba(58,52,46,0.16)', 44);
  stains(g, 256, 256, 6, 'rgba(140,130,110,0.12)', 30);
  cracks(g, 256, 256, 7);
  g.strokeStyle = 'rgba(48,46,42,0.5)'; g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256); // junta de laje
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// tijolo escuro com variação por tijolo e argamassa
function makeBrick() {
  const c = cv(256, 256), g = c.getContext('2d');
  g.fillStyle = '#6b5a4f'; g.fillRect(0, 0, 256, 256);
  const bw = 32, bh = 16;
  for (let y = 0; y < 256 / bh; y++) {
    const off = (y % 2) * bw / 2;
    for (let x = -1; x < 256 / bw + 1; x++) {
      const v = Math.random() * 30 - 15;
      // gradiente por tijolo (volume)
      const grad = g.createLinearGradient(x * bw + off, y * bh, x * bw + off, y * bh + bh);
      grad.addColorStop(0, `rgb(${112 + v},${82 + v},${66 + v})`);
      grad.addColorStop(1, `rgb(${88 + v},${62 + v},${50 + v})`);
      g.fillStyle = grad;
      g.fillRect(x * bw + off + 1, y * bh + 1, bw - 2, bh - 2);
    }
  }
  grain(g, 256, 256, 1400, 0.1);
  stains(g, 256, 256, 8, 'rgba(30,24,20,0.22)', 36);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// asfalto puro (sem faixa — faixas são geometria separada)
function makeAsphalt() {
  const c = cv(256, 256), g = c.getContext('2d');
  g.fillStyle = '#333437'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 34 + Math.random() * 58 | 0;
    g.fillStyle = `rgba(${v},${v},${v + 4},${0.12 + Math.random() * 0.18})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 1.6);
  }
  // pedras do agregado
  for (let i = 0; i < 500; i++) {
    const v = 60 + Math.random() * 40 | 0;
    g.fillStyle = `rgba(${v},${v},${v},0.3)`;
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 0.8 + Math.random() * 1.4, 0, 7); g.fill();
  }
  stains(g, 256, 256, 7, 'rgba(18,16,14,0.25)', 40); // óleo/manchas
  // remendos escuros
  for (let i = 0; i < 3; i++) {
    g.fillStyle = 'rgba(22,20,18,0.35)';
    g.fillRect(Math.random() * 200, Math.random() * 200, 30 + Math.random() * 50, 12 + Math.random() * 24);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// calçada de concreto com placas e meio-fio embutido
function makeSidewalk() {
  const c = cv(256, 256), g = c.getContext('2d');
  g.fillStyle = '#a09a90'; g.fillRect(0, 0, 256, 256);
  grain(g, 256, 256, 3500, 0.07);
  // placas 64px com juntas
  g.strokeStyle = 'rgba(55,52,48,0.55)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
  }
  stains(g, 256, 256, 9, 'rgba(60,54,46,0.14)', 34);
  cracks(g, 256, 256, 5);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// metal pintado (containers) com corrugado forte
function makeMetal() {
  const c = cv(128, 128), g = c.getContext('2d');
  g.fillStyle = '#3d5a68'; g.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 16) { // corrugado
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, 0, 5, 128);
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 5, 0, 3, 128);
  }
  for (let i = 0; i < 420; i++) { // ferrugem
    g.fillStyle = `rgba(126,62,24,${Math.random() * 0.3})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 3, 2 + Math.random() * 2);
  }
  stains(g, 128, 128, 5, 'rgba(20,16,12,0.25)', 26);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// fachada de prédio: painéis de concreto + faixa de janelas de vidro
function makeFacade(hue) {
  const c = cv(256, 256), g = c.getContext('2d');
  const base = hue === 'warm' ? '#8d8578' : '#7e8288';
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  grain(g, 256, 256, 3200, 0.08);
  stains(g, 256, 256, 10, 'rgba(46,42,38,0.2)', 40);
  // escorrido de água abaixo das janelas
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * 256, y0 = 30 + Math.random() * 100;
    g.fillStyle = 'rgba(40,38,34,0.12)';
    g.fillRect(x, y0, 2 + Math.random() * 2, 40 + Math.random() * 90);
  }
  // faixa de janelas (linha horizontal de vidro escuro)
  g.fillStyle = '#121a22';
  g.fillRect(0, 96, 256, 64);
  // reflexo no vidro
  const refl = g.createLinearGradient(0, 96, 0, 160);
  refl.addColorStop(0, 'rgba(180,200,220,0.28)');
  refl.addColorStop(0.5, 'rgba(120,140,160,0.1)');
  refl.addColorStop(1, 'rgba(60,70,80,0.04)');
  g.fillStyle = refl; g.fillRect(0, 96, 256, 64);
  // montantes verticais do vitrô
  for (let x = 0; x <= 256; x += 42) {
    g.fillStyle = 'rgba(30,32,34,0.9)'; g.fillRect(x - 2, 96, 4, 64);
  }
  // peitoril
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 92, 256, 5);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 158, 256, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// máscara emissiva das janelas (alinhada 1:1 com a makeFacade; brilho aleatório por janela)
function makeFacadeGlow() {
  const c = cv(256, 256), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  // banda de janelas y:96..160, células de 42px (igual aos montantes da fachada)
  for (let x = 0; x < 256; x += 42) {
    const lit = Math.random() < 0.55;
    const v = lit ? 150 + Math.random() * 105 | 0 : 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x + 2, 96, 38, 64);
    // meia-janela mais escura (persiana)
    if (lit && Math.random() < 0.4) {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(x + 2, 128, 38, 32);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// vitrine de loja (térreo): map com letreiro/vidro + emissiveMap com MESMAS UVs
function makeShop() {
  const c = cv(256, 128), g = c.getContext('2d');
  g.fillStyle = '#5f5b54'; g.fillRect(0, 0, 256, 128);       // moldura
  g.fillStyle = '#22262b'; g.fillRect(6, 6, 244, 26);        // letreiro
  g.fillStyle = 'rgba(232,195,90,0.85)'; g.fillRect(20, 14, 70, 8); g.fillRect(100, 14, 44, 8);
  const glass = (x, w) => {
    const grad = g.createLinearGradient(0, 36, 0, 122);
    grad.addColorStop(0, '#2a3540'); grad.addColorStop(0.5, '#141c24'); grad.addColorStop(1, '#0b1015');
    g.fillStyle = grad; g.fillRect(x, 36, w, 86);
  };
  glass(10, 100); glass(146, 100);
  g.fillStyle = '#1a2026'; g.fillRect(116, 44, 24, 78);      // porta
  g.fillStyle = '#c8a24a'; g.fillRect(134, 80, 3, 10);       // maçaneta
  // glow com EXATAMENTE a mesma disposição do map (só o interior dos vidros acende)
  const glow = cv(256, 128), gg = glow.getContext('2d');
  gg.fillStyle = '#000'; gg.fillRect(0, 0, 256, 128);
  gg.fillStyle = '#fff';
  gg.fillRect(10, 36, 100, 86); gg.fillRect(146, 36, 100, 86);
  gg.fillStyle = 'rgba(0,0,0,0.5)';                           // vultos dentro da loja
  gg.beginPath(); gg.ellipse(60, 100, 18, 26, 0, 0, 7); gg.fill();
  gg.beginPath(); gg.ellipse(196, 102, 14, 22, 0, 0, 7); gg.fill();
  gg.fillStyle = '#000'; gg.fillRect(116, 36, 24, 86);        // porta não acende
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const tg = new THREE.CanvasTexture(glow); tg.wrapS = tg.wrapT = THREE.RepeatWrapping;
  return { map: t, glow: tg };
}

export function buildWorld(scene) {
  const driveCars = [];            // carros dirigíveis (tecla E) — declarado cedo
  TEX.concrete = makeConcrete();
  TEX.brick = makeBrick();
  TEX.asphalt = makeAsphalt();
  TEX.sidewalk = makeSidewalk();
  TEX.metal = makeMetal();
  TEX.facadeA = makeFacade('warm');
  TEX.facadeB = makeFacade('cool');
  TEX.facadeGlowA = makeFacadeGlow();
  TEX.facadeGlowB = makeFacadeGlow();
  TEX.shop = makeShop();           // {map, glow} com UVs correspondentes

  const colliders = []; // {min:Vector3, max:Vector3}
  const decor = new THREE.Group(); // não-colisão (miniaturas, fiação)
  scene.add(decor);

  // material helper
  const mat = (tex, rep, color, rough = 0.9) => {
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rep[0], rep[1]);
    return new THREE.MeshStandardMaterial({ map: t, color: color || 0xffffff, roughness: rough });
  };

  function box(x, y, z, w, h, d, material, ry = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    if (Math.abs(Math.sin(ry)) < 0.01) {
      colliders.push({
        min: new THREE.Vector3(x - w / 2, y, z - d / 2),
        max: new THREE.Vector3(x + w / 2, y + h, z + d / 2),
      });
    } else {
      colliders.push({
        min: new THREE.Vector3(x - d / 2, y, z - w / 2),
        max: new THREE.Vector3(x + d / 2, y + h, z + w / 2),
      });
    }
    return m;
  }

  // ==================== CÉU / ILUMINAÇÃO ====================
  const skyGeo = new THREE.SphereGeometry(400, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2e3f55) },
      mid: { value: new THREE.Color(0x8f9aa4) },
      bot: { value: new THREE.Color(0xd9a06a) },   // horizonte quente
      sunDir: { value: new THREE.Vector3(55, 42, -35).normalize() },
    },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vP; uniform vec3 top,mid,bot,sunDir;
      void main(){
        vec3 dir=normalize(vP); float h=dir.y;
        vec3 c=mix(bot,mid,smoothstep(-0.02,0.22,h)); c=mix(c,top,smoothstep(0.18,0.6,h));
        // glow do sol no horizonte
        float s=max(dot(dir,normalize(sunDir)),0.0);
        c+=vec3(1.0,0.75,0.45)*pow(s,22.0)*0.55;
        c+=vec3(1.0,0.85,0.6)*pow(s,220.0)*1.1;   // disco
        gl_FragColor=vec4(c,1.0);
      }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.FogExp2(0xb5a184, 0.0075); // névoa quente do fim de tarde

  const hemi = new THREE.HemisphereLight(0xaebdc8, 0x5a4f3f, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a8, 1.6);
  sun.position.set(55, 42, -35);   // sol baixo (fim de tarde)
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
  sun.shadow.camera.far = 300;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // ==================== PISO: RUA + CALÇADAS ====================
  // rua central (asfalto) 16m de largura em X, quadra nas laterais
  TEX.asphalt.repeat.set(10, 10);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.MeshStandardMaterial({ map: TEX.asphalt, roughness: 0.96 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // faixas de rolamento (geométricas, desgastadas)
  const laneMat = new THREE.MeshStandardMaterial({ color: 0xd8cf9e, roughness: 0.85, transparent: true, opacity: 0.55 });
  const crossMat = new THREE.MeshStandardMaterial({ color: 0xd8cf9e, roughness: 0.85, transparent: true, opacity: 0.5 });
  function laneLine(x, z, len, horizontal) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(horizontal ? len : 0.35, horizontal ? 0.35 : len), laneMat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z);
    decor.add(m);
  }
  // tracejado central ao longo das 2 ruas (pula cruzamento + zebras: |i| >= 20)
  for (let i = -72; i <= 72; i += 7) {
    if (Math.abs(i) < 20) continue;
    laneLine(i, 0, 3.5, true);
    laneLine(0, i, 3.5, false);
  }
  // faixas laterais contínuas em 2 segmentos cada (não cruzam o cruzamento)
  laneLine(42.5, -9.5, 59, true); laneLine(-42.5, -9.5, 59, true);
  laneLine(42.5, 9.5, 59, true); laneLine(-42.5, 9.5, 59, true);
  laneLine(-9.5, 42.5, 59, false); laneLine(-9.5, -42.5, 59, false);
  laneLine(9.5, 42.5, 59, false); laneLine(9.5, -42.5, 59, false);
  // faixas de pedestre (zebra continental) — FORA do núcleo do cruzamento (|x|,|z| > 12),
  // atravessando cada boca da rua por dentro dos meio-fios (largura da pista = 19m)
  function crosswalk(axis) {
    // axis 'x': barras finas em X empilhadas ao longo do eixo X, compridas em Z (banda leste/oeste)
    for (let i = 12.5; i <= 17.61; i += 1.7) {
      for (const s of [1, -1]) {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(axis === 'x' ? 0.85 : 18.6, axis === 'x' ? 18.6 : 0.85), crossMat);
        m.rotation.x = -Math.PI / 2;
        if (axis === 'x') m.position.set(s * i, 0.02, 0);
        else m.position.set(0, 0.02, s * i);
        decor.add(m);
      }
    }
  }
  crosswalk('x');   // bandas leste (x≈+12.5..17.6) e oeste (x≈-12.5..-17.6)
  crosswalk('z');   // bandas norte (z≈+12.5..17.6) e sul (z≈-12.5..-17.6)

  // calçadas elevadas nas 4 quadras (com meio-fio) — as ruas cruzam no centro
  const sideM = mat(TEX.sidewalk, [13, 13], 0xffffff, 0.94);
  const curbMat = mat(TEX.concrete, [16, 1], 0xbdb6ac, 0.9);
  function sidewalk(cx, cz, w, d) {
    const sw = box(cx, 0, cz, w, 0.22, d, sideM);   // laje elevada
    // meio-fio aparente (as 4 bordas)
    box(cx, 0, cz - d / 2, w, 0.3, 0.5, curbMat);
    box(cx, 0, cz + d / 2, w, 0.3, 0.5, curbMat);
    box(cx - w / 2, 0, cz, 0.5, 0.3, d, curbMat);
    box(cx + w / 2, 0, cz, 0.5, 0.3, d, curbMat);
    return sw;
  }
  sidewalk(43, 43, 62, 62);    // NE
  sidewalk(-43, 43, 62, 62);   // NW
  sidewalk(43, -43, 62, 62);   // SE
  sidewalk(-43, -43, 62, 62);  // SW

  // ---------- prédios por andar (fachada + glow das janelas) ----------
  const conc = (r) => mat(TEX.concrete, r, 0xffffff);
  const brickM = (r) => mat(TEX.brick, r, 0xffffff);

  function building(cx, cz, w, d, floors, facadeTex, glowTex, shopPair) {
    const fh = 3.4;                       // altura do andar
    const h = floors * fh;
    // 1 tile de textura = 1 andar (banda de janelas alinhada); horizontal: ~6m por tile
    const rx = Math.max(2, Math.round(w / 6));
    const rz = Math.max(2, Math.round(d / 6));
    const rep = [Math.max(rx, rz), floors];   // BoxGeometry: UV única pra todas as faces
    const mt = facadeTex.clone(); mt.needsUpdate = true; mt.repeat.set(rep[0], rep[1]);
    const gt = glowTex.clone(); gt.needsUpdate = true; gt.repeat.set(rep[0], rep[1]);
    const body = new THREE.MeshStandardMaterial({
      map: mt, roughness: 0.85,
      emissive: 0xffc98c, emissiveIntensity: 1.0,
      emissiveMap: gt,                        // mesma UV do map: janelas acendem exatamente onde estão
    });
    box(cx, 0, cz, w, h, d, body);

    // térreo: vitrines de loja (map + emissiveMap com MESMO repeat — sempre alinhados)
    const sRep = Math.max(1, Math.round(w / 9));
    const sm = shopPair.map.clone(); sm.needsUpdate = true; sm.repeat.set(sRep, 1);
    const sg = shopPair.glow.clone(); sg.needsUpdate = true; sg.repeat.set(sRep, 1);
    const shopMat = new THREE.MeshStandardMaterial({
      map: sm, roughness: 0.5,
      emissive: 0xffd9a0, emissiveIntensity: 0.9, emissiveMap: sg,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    const q = 0.04;
    const mkShop = (x, z, ww, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ww, 2.9), shopMat);
      m.position.set(x, 1.75, z);
      if (ry) m.rotation.y = ry;
      decor.add(m);
    };
    mkShop(cx, cz + d / 2 + q, w - 2.5, 0);
    mkShop(cx + w / 2 + q, cz, d - 2.5, Math.PI / 2);

    // laje/telhado com parapeito
    box(cx, h, cz, w + 0.6, 0.35, d + 0.6, conc([2, 1]));
    box(cx, h + 0.35, cz + d / 2, w + 0.6, 0.9, 0.25, conc([2, 1]));
    box(cx, h + 0.35, cz - d / 2, w + 0.6, 0.9, 0.25, conc([2, 1]));
    box(cx + w / 2, h + 0.35, cz, 0.25, 0.9, d + 0.6, conc([2, 1]));
    box(cx - w / 2, h + 0.35, cz, 0.25, 0.9, d + 0.6, conc([2, 1]));

    // caixas de AC + antena no telhado (decor)
    const acM = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.6, metalness: 0.4 });
    for (let i = 0; i < 2 + (floors % 3); i++) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.9), acM);
      ac.position.set(cx - w / 2 + 1.5 + Math.random() * (w - 3), h + 0.55, cz - d / 2 + 1.5 + Math.random() * (d - 3));
      ac.castShadow = true;
      decor.add(ac);
    }
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 3.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.7, metalness: 0.6 }));
    ant.position.set(cx + w / 2 - 1.2, h + 1.9, cz + d / 2 - 1.2);
    decor.add(ant);
  }

  building(-45, -45, 26, 26, 7, TEX.facadeA, TEX.facadeGlowA, TEX.shop);
  building(45, -45, 30, 24, 5, TEX.facadeB, TEX.facadeGlowB, TEX.shop);
  building(-45, 45, 24, 28, 8, TEX.facadeB, TEX.facadeGlowB, TEX.shop);
  building(45, 45, 26, 26, 6, TEX.facadeA, TEX.facadeGlowA, TEX.shop);

  // ---------- cobertura central (no quadrante NW, fora do cruzamento) ----------
  box(-30, 0, -30, 16, 4.5, 9, conc([2, 1]));     // plataforma
  box(-30, 4.5, -35.2, 16, 3, 1.4, conc([2, 1])); // parede de trás
  for (let i = 0; i < 4; i++) box(-30, 0, -24.2 + i * 1.2, 6, 0.9 + i * 0.95, 1.2, conc([1, 1])); // degraus

  // ---------- containers (pátios internos das quadras) ----------
  const metalM = () => mat(TEX.metal, [2, 1], 0xffffff, 0.6);
  box(30, 0, 34, 12, 5.2, 6, metalM(), 0);
  box(32, 0, -34, 12, 5.2, 6, metalM(), 0);
  box(34, 5.2, -34, 12, 5.2, 6, metalM(), 0);   // empilhado
  box(-34, 0, 30, 12, 5.2, 6, metalM(), Math.PI / 2);

  // ---------- muros baixos / sandbags ----------
  const sbMat = mat(TEX.concrete, [3, 1], 0x9a8b6a);
  box(-24, 0, -6, 9, 1.4, 1.6, sbMat);
  box(24, 0, 6, 9, 1.4, 1.6, sbMat);
  box(24, 0, -6, 1.6, 1.4, 9, sbMat);
  box(-24, 0, 6, 1.6, 1.4, 9, sbMat);

  // ---------- carros realistas ----------
  // root = grupo EXTERNO controlado pelo motor de direção (frente = -Z local,
  // convenção three.js). g = carroceria modelada com o nariz no EIXO +X, girada
  // +90° dentro do root para alinhar o nariz com o -Z do motor (senão o carro
  // "anda de lado"). root.rotation.y = ry - 90° preserva o rumo original de ry.
  function car(x, z, ry, color) {
    const root = new THREE.Group();
    const g = new THREE.Group();
    g.rotation.y = Math.PI / 2;
    root.add(g);
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.75 });
    const darkTrim = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.85 });
    const glassM = new THREE.MeshStandardMaterial({
      color: 0x2a3a46, roughness: 0.08, metalness: 0.9,
      transparent: true, opacity: 0.82,
    });
    const chromeM = new THREE.MeshStandardMaterial({ color: 0xb9c0c7, roughness: 0.25, metalness: 1.0 });

    // chassi baixo (entre as rodas)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.5, 2.0), darkTrim);
    chassis.position.y = 0.42; g.add(chassis);
    // corpo principal
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.72, 2.0), paint);
    body.position.y = 1.03; body.castShadow = true; g.add(body);
    // capô (mais baixo) e porta-malas
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.5, 1.9), paint);
    hood.position.set(1.55, 1.12, 0); hood.castShadow = true; g.add(hood);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.56, 1.9), paint);
    trunk.position.set(-1.72, 1.14, 0); trunk.castShadow = true; g.add(trunk);
    // cabine com vidros (para-brisa inclinado)
    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 1.85), paint);
    cabRoof.position.set(-0.15, 1.98, 0); cabRoof.castShadow = true; g.add(cabRoof);
    const pilA = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.62, 1.8), paint); // pilar dianteiro
    pilA.position.set(0.98, 1.68, 0); pilA.rotation.z = -0.28; g.add(pilA);
    const pilB = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.6, 1.8), paint); // pilar traseiro
    pilB.position.set(-1.28, 1.68, 0); pilB.rotation.z = 0.18; g.add(pilB);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 1.7), glassM);
    windshield.position.set(0.62, 1.66, 0); windshield.rotation.z = -0.5; g.add(windshield);
    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 1.7), glassM);
    rearGlass.position.set(-0.95, 1.67, 0); rearGlass.rotation.z = 0.45; g.add(rearGlass);
    const sideGlassL = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 0.05), glassM);
    sideGlassL.position.set(-0.15, 1.7, 0.94); g.add(sideGlassL);
    const sideGlassR = sideGlassL.clone(); sideGlassR.position.z = -0.94; g.add(sideGlassR);
    // para-choques + grade
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 2.02), darkTrim);
    bumperF.position.set(2.32, 0.72, 0); g.add(bumperF);
    const bumperR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 2.02), darkTrim);
    bumperR.position.set(-2.32, 0.72, 0); g.add(bumperR);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 1.4), chromeM);
    grille.position.set(2.26, 1.02, 0); g.add(grille);
    // faróis e lanternas
    const headM = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffedb8, emissiveIntensity: 1.2, roughness: 0.2 });
    const tailM = new THREE.MeshStandardMaterial({ color: 0x8a1410, emissive: 0xd42a1e, emissiveIntensity: 0.9, roughness: 0.3 });
    for (const sz of [0.68, -0.68]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.42), headM);
      hl.position.set(2.26, 1.22, sz); g.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.4), tailM);
      tl.position.set(-2.26, 1.24, sz); g.add(tl);
    }
    // espelhos
    for (const sz of [1.05, -1.05]) {
      const mir = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.22), paint);
      mir.position.set(0.9, 1.55, sz); g.add(mir);
    }
    // rodas: pneu (torus) + calota
    const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 20);
    const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.34, 12);
    const tireM = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.95 });
    const rimM = new THREE.MeshStandardMaterial({ color: 0x9aa2aa, roughness: 0.3, metalness: 0.9 });
    [[-1.45, 0.98], [1.45, 0.98], [-1.45, -0.98], [1.45, -0.98]].forEach(([wx, wz]) => {
      const tire = new THREE.Mesh(tireGeo, tireM);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(wx, 0.42, wz); tire.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, rimM);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(wx, 0.42, wz + (wz > 0 ? 0.02 : -0.02));
      g.add(tire, rim);
    });
    // placa
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.44),
      new THREE.MeshStandardMaterial({ color: 0xd8d5c8, roughness: 0.6 }));
    plate.position.set(-2.47, 0.72, 0); g.add(plate);
    // escapamento: dois canos na traseira
    const exM = new THREE.MeshStandardMaterial({ color: 0x33373c, roughness: 0.45, metalness: 0.9 });
    for (const sz of [0.45, -0.45]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.38, 10), exM);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(-2.44, 0.5, sz);
      pipe.castShadow = true;
      g.add(pipe);
    }
    // chamas do turbo (grupo visível só com o turbo ativo)
    const flames = new THREE.Group();
    flames.name = 'exhaust-flames';
    flames.visible = false;
    const flameCoreM = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const flameOutM = new THREE.MeshBasicMaterial({ color: 0xff6a14, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
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

    // ---- INTERIOR: bancos, painel com mostradores, volante FUNCIONAL ----
    const seatM = new THREE.MeshStandardMaterial({ color: 0x1d2126, roughness: 0.9 });
    const seatC = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.52), seatM);
    seatC.position.set(-0.45, 1.02, 0.47); g.add(seatC);
    const seatB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.12), seatM);
    seatB.position.set(-0.45, 1.3, 0.72); seatB.rotation.x = 0.15; g.add(seatB);
    const dashM = new THREE.MeshStandardMaterial({ color: 0x191c20, roughness: 0.8 });
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.28, 1.75), dashM);
    dash.position.set(0.62, 1.28, 0); g.add(dash);
    // mostradores iluminados (odômetro âmbar + velcímetro ciano)
    const dialA = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xffb545 }));
    dialA.position.set(0.26, 1.36, 0.55); dialA.rotation.x = -0.5; g.add(dialA);
    const dialB = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.09),
      new THREE.MeshBasicMaterial({ color: 0x53c8e8 }));
    dialB.position.set(0.26, 1.36, -0.55); dialB.rotation.x = -0.5; g.add(dialB);
    // volante (anima com a direção quando dirigido)
    const wheelG = new THREE.Group();
    const rimW = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 20), dashM);
    wheelG.add(rimW);
    for (let s = 0; s < 3; s++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.016, 0.02), dashM);
      spoke.rotation.z = s * Math.PI / 3;
      wheelG.add(spoke);
    }
    wheelG.position.set(0.1, 1.32, 0.42);
    wheelG.rotation.x = -0.42;                    // inclinação de coluna de direção
    wheelG.name = 'steering';
    g.add(wheelG);
    // marcador do banco do motorista (o boneco senta aqui ao dirigir)
    const seatMark = new THREE.Object3D();
    seatMark.name = 'driver-seat';
    seatMark.position.set(-0.45, 0.12, 0.47);     // quadril NO BANCO (cabeça sob o teto)
    g.add(seatMark);
    // pedaleira básica + retrovisor interno
    const mirrorIn = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.03), darkTrim);
    mirrorIn.position.set(0.28, 1.62, 0.1); g.add(mirrorIn);

    root.position.set(x, 0, z); root.rotation.y = ry - Math.PI / 2;   // yaw do motor preserva o rumo original
    root.userData.drive = { ry, x, z };           // registrável para o sistema de direção
    scene.add(root);
    // AABB do colisor: comprimento (4.9) ao longo do -Z local do root,
    // largura (2.1) no X local — meia-extensão mundial gira com o yaw do root
    const cos = Math.abs(Math.cos(root.rotation.y)), sin = Math.abs(Math.sin(root.rotation.y));
    const hw = (2.1 * cos + 4.9 * sin) / 2, hd = (2.1 * sin + 4.9 * cos) / 2;
    const col = {
      min: new THREE.Vector3(x - hw, 0, z - hd),
      max: new THREE.Vector3(x + hw, 2.0, z + hd),
    };
    col.carGroup = root;                          // collider sabe qual carro é
    colliders.push(col);
    driveCars.push(root);
  }
  car(-9, 16.5, 0.1, 0x8a2f26);      // encostado no meio-fio, sentido leste
  car(9, -16.5, Math.PI - 0.1, 0x2e4a68);  // sentido oeste
  car(-16.5, -9, Math.PI / 2 + 0.05, 0x6b6f74); // na rua N-S, sentido sul
  car(16.5, 8.5, Math.PI / 2 - 0.08, 0x8a733a);   // sentido norte, livre do poste

  // ---------- postes de luz (braço curvado, luminária real) ----------
  function lamp(x, z, flipX) {
    const fx = flipX ? -1 : 1;
    const poleM = new THREE.MeshStandardMaterial({ color: 0x23272c, roughness: 0.6, metalness: 0.7 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 7.2, 10), poleM);
    pole.position.set(x, 3.6, z); pole.castShadow = true;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 10), poleM);
    base.position.set(x, 0.47, z);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 8), poleM);
    arm.rotation.z = fx * Math.PI / 2 - 0.25 * fx;   // curva pra rua
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
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xfff2c9, emissive: 0xffe2a0, emissiveIntensity: 1.6 }));
    lens.position.set(x + fx * 2.0, 6.91, z);
    const pl = new THREE.PointLight(0xffd98a, 18, 30, 2);
    pl.position.set(x + fx * 2.0, 6.7, z);
    scene.add(pole, base, arm, collar, strut, head, lens, pl);
    colliders.push({
      min: new THREE.Vector3(x - 0.2, 0, z - 0.2),
      max: new THREE.Vector3(x + 0.2, 7, z + 0.2),
    });
  }
  lamp(-13, -11.5, false); lamp(15, 11.5, true);   // na borda da pista, opostos
  lamp(-14, 14, false); lamp(16, -14, true);
  lamp(-40, -11.5, false); lamp(42, 11.5, true);

  // ---------- hidrantes ----------
  const hydBody = new THREE.MeshStandardMaterial({ color: 0xb03024, roughness: 0.5, metalness: 0.3 });
  function hydrant(x, z) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.62, 10), hydBody);
    b.position.y = 0.31; b.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), hydBody);
    cap.position.y = 0.66;
    const n1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), hydBody);
    n1.rotation.z = Math.PI / 2; n1.position.y = 0.42;
    g.add(b, cap, n1);
    g.position.set(x, 0.22, z);   // sobre a calçada
    decor.add(g);
    colliders.push({ min: new THREE.Vector3(x - 0.18, 0, z - 0.18), max: new THREE.Vector3(x + 0.18, 0.9, z + 0.18) });
  }
  hydrant(14.5, 30.5); hydrant(-14.5, -30.5);   // sobre as calçadas

  // ---------- bancas de jornal / quiosques ----------
  function kiosk(x, z, ry) {
    const g = new THREE.Group();
    const frameM = new THREE.MeshStandardMaterial({ color: 0x2e4a3a, roughness: 0.7, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.3, 1.6), frameM);
    body.position.y = 1.35; body.castShadow = true;
    const awn = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.08, 2.1),
      new THREE.MeshStandardMaterial({ color: 0x8a2f26, roughness: 0.8 }));
    awn.position.set(0, 2.55, 0.15); awn.rotation.x = 0.12;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.2, metalness: 0.5,
        emissive: 0x3a3226, emissiveIntensity: 0.5 }));
    win.position.set(0, 1.5, 0.82);
    g.add(body, awn, win);
    g.position.set(x, 0.22, z); g.rotation.y = ry;
    decor.add(g);
    const cos = Math.abs(Math.cos(ry)), sin = Math.abs(Math.sin(ry));
    const hw = (3.4 * cos + 1.8 * sin) / 2, hd = (3.4 * sin + 1.8 * cos) / 2;
    colliders.push({ min: new THREE.Vector3(x - hw, 0, z - hd), max: new THREE.Vector3(x + hw, 2.6, z + hd) });
  }
  kiosk(20, 15.2, -0.4); kiosk(-20, -15.2, 2.7);   // sobre as calçadas, virados pra rua

  // ---------- muros perimetrais ----------
  const wallMat = mat(TEX.brick, [10, 1.5], 0x8a7f72);
  box(0, 0, -75, 150, 9, 2, wallMat);
  box(0, 0, 75, 150, 9, 2, wallMat);
  box(-75, 0, 0, 2, 9, 150, wallMat);
  box(75, 0, 0, 2, 9, 150, wallMat);

  // ---------- detalhes: tambores e paletes ----------
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x7a4a1e, roughness: 0.7, metalness: 0.3 });
  const drumGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.5, 14);
  const drums = [[14.8, 24], [16.4, 25.2], [-14.8, -24], [-16.4, -25.2], [24.5, 14.8], [-24.5, -14.8]];   // pátios internos das quadras
  for (const [dx, dz] of drums) {
    const d = new THREE.Mesh(drumGeo, drumMat);
    d.position.set(dx, 0.75, dz); d.castShadow = true;
    scene.add(d);
    colliders.push({
      min: new THREE.Vector3(dx - 0.6, 0, dz - 0.6),
      max: new THREE.Vector3(dx + 0.6, 1.5, dz + 0.6),
    });
  }

  // entulho (paletes)
  const palMat = mat(TEX.concrete, [1, 1], 0x6e5b40);
  [[20, 30], [-26, -30], [-30, 40]].forEach(([px, pz]) => {
    box(px, 0, pz, 3, 0.3, 2.2, palMat);
    box(px, 0.3, pz, 2.4, 0.8, 1.8, palMat);
  });

  // ---------- pontos de spawn ----------
  // NOTA: coordenadas fora das AABB dos prédios (nada dentro de x:[-67,-43] z:[28,62], etc.)
  const spawns = [
    [-20, 60], [20, 60], [-20, -60], [20, -60],
    [-58, 0], [58, 0], [0, -58], [0, 58],
    [-68, -45], [30, 45], [45, -20], [-45, 15],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  // ---------- zona de cobertura para IA ----------
  const coverPoints = [
    [-25, -8], [25, 8], [-10, 25], [12, -25],
    [-18, 4], [20, -14], [8, 20], [-34, 16],
    [0, 2], [-5, -30], [16.5, 29.5], [-48, -30], [48, 30],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  return { colliders, spawns, coverPoints, sun, driveCars };
}
