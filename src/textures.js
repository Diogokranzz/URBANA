import * as THREE from '../vendor/three.module.js';

export function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function ctx(c) {
  return c.getContext('2d');
}

export function speckle(g, w, h, n, min, max, alpha) {
  for (let i = 0; i < n; i++) {
    const v = (min + Math.random() * (max - min)) | 0;
    const s = 1 + Math.random() * 1.6;
    g.fillStyle = `rgba(${v},${v},${v},${alpha * (0.35 + Math.random() * 0.65)})`;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

export function blobs(g, w, h, n, color, rmin, rmax) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const r = rmin + Math.random() * (rmax - rmin);
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, color);
    rad.addColorStop(0.65, color.replace(/,\s*[\d.]+\)$/, ',0.06)'));
    rad.addColorStop(1, color.replace(/,\s*[\d.]+\)$/, ',0)'));
    g.fillStyle = rad;
    g.beginPath();
    g.moveTo(x + r, y);
    const steps = 12;
    for (let s = 1; s <= steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const rr = r * (0.62 + Math.random() * 0.55);
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }
}

export function drips(g, w, h, n, alpha) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h * 0.6;
    const len = 20 + Math.random() * 150;
    const grd = g.createLinearGradient(0, y, 0, y + len);
    grd.addColorStop(0, `rgba(26,24,22,${alpha})`);
    grd.addColorStop(1, 'rgba(26,24,22,0)');
    g.fillStyle = grd;
    g.fillRect(x, y, 1 + Math.random() * 4, len);
  }
}

export function cracks(g, w, h, n, color) {
  g.strokeStyle = color || 'rgba(14,13,12,0.5)';
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    g.lineWidth = 0.5 + Math.random() * 1.4;
    let x = Math.random() * w, y = Math.random() * h;
    g.beginPath();
    g.moveTo(x, y);
    const seg = 4 + (Math.random() * 7 | 0);
    for (let s = 0; s < seg; s++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      g.lineTo(x, y);
      if (Math.random() < 0.28) {
        g.moveTo(x, y);
        g.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40);
        g.moveTo(x, y);
      }
    }
    g.stroke();
  }
}

export function grunge(g, w, h, n) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const r = 6 + Math.random() * 40;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < 0.7;
    grad.addColorStop(0, dark ? 'rgba(18,16,14,0.22)' : 'rgba(190,182,168,0.14)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function normalFromCanvas(canvas, strength = 2.2) {
  const w = canvas.width, h = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = cv(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    lum[i] = (src[p] * 0.299 + src[p + 1] * 0.587 + src[p + 2] * 0.114) / 255;
  }
  const at = (x, y) => lum[(((y % h) + h) % h) * w + (((x % w) + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const nx = -dx, ny = -dy, nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const i = (y * w + x) * 4;
      img.data[i] = (nx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function colorTex(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function dataTex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 2;
  return t;
}

function asphaltAlbedo() {
  const S = 1024;
  const c = cv(S, S), g = ctx(c);
  g.fillStyle = '#474a51';
  g.fillRect(0, 0, S, S);
  blobs(g, S, S, 26, 'rgba(30,30,34,0.26)', 40, 190);
  blobs(g, S, S, 18, 'rgba(74,76,82,0.2)', 30, 150);
  for (let i = 0; i < 26000; i++) {
    const v = 42 + Math.random() * 86 | 0;
    g.fillStyle = `rgba(${v},${v},${v + 3},${0.1 + Math.random() * 0.3})`;
    g.beginPath();
    g.arc(Math.random() * S, Math.random() * S, 0.6 + Math.random() * 1.5, 0, 7);
    g.fill();
  }
  for (let i = 0; i < 4; i++) {
    const y0 = Math.random() * S;
    g.strokeStyle = 'rgba(16,16,18,0.6)';
    g.lineWidth = 3 + Math.random() * 5;
    g.beginPath();
    g.moveTo(0, y0);
    g.bezierCurveTo(S * 0.3, y0 + (Math.random() - 0.5) * 90, S * 0.7, y0 + (Math.random() - 0.5) * 90, S, y0 + (Math.random() - 0.5) * 60);
    g.stroke();
  }
  cracks(g, S, S, 26, 'rgba(12,12,14,0.55)');
  blobs(g, S, S, 12, 'rgba(10,9,8,0.55)', 18, 70);
  g.globalAlpha = 0.16;
  for (let i = 0; i < 5; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#d8d2bc' : '#c8b45a';
    g.save();
    g.translate(Math.random() * S, Math.random() * S);
    g.rotate(Math.random() * Math.PI);
    g.fillRect(0, 0, 6 + Math.random() * 60, 3 + Math.random() * 5);
    g.restore();
  }
  g.globalAlpha = 1;
  grunge(g, S, S, 40);
  return c;
}

function asphaltRough() {
  const S = 512;
  const c = cv(S, S), g = ctx(c);
  g.fillStyle = '#dcdcdc';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#0e0e0e';
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 22 + Math.random() * 74;
    g.beginPath();
    g.moveTo(x + r, y);
    for (let s = 1; s <= 14; s++) {
      const a = (s / 14) * Math.PI * 2;
      g.lineTo(x + Math.cos(a) * r * (0.6 + Math.random() * 0.6), y + Math.sin(a) * r * (0.6 + Math.random() * 0.6));
    }
    g.closePath();
    g.fill();
  }
  g.filter = 'blur(3px)';
  g.drawImage(c, 0, 0);
  g.filter = 'none';
  const grad = g.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, 'rgba(150,150,150,0.5)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(140,140,140,0.45)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return c;
}

function concreteAlbedo(tone) {
  const S = 512;
  const c = cv(S, S), g = ctx(c);
  g.fillStyle = tone || '#8f8c86';
  g.fillRect(0, 0, S, S);
  speckle(g, S, S, 9000, 60, 210, 0.14);
  blobs(g, S, S, 16, 'rgba(50,46,42,0.22)', 30, 120);
  blobs(g, S, S, 8, 'rgba(160,152,138,0.18)', 20, 90);
  for (let i = 0; i < 7; i++) {
    g.strokeStyle = 'rgba(48,45,42,0.35)';
    g.lineWidth = 1.5;
    const y = Math.random() * S;
    g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
  }
  cracks(g, S, S, 10, 'rgba(30,28,26,0.4)');
  drips(g, S, S, 26, 0.24);
  grunge(g, S, S, 24);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(${110 + Math.random() * 40 | 0},${105 + Math.random() * 40 | 0},${100 + Math.random() * 40 | 0},0.35)`;
    g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  return c;
}

function brickAlbedo() {
  const S = 512;
  const c = cv(S, S), g = ctx(c);
  g.fillStyle = '#4b4038';
  g.fillRect(0, 0, S, S);
  const bw = 64, bh = 26, mortar = 3;
  for (let row = 0; row * bh < S; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col * bw + off < S; col++) {
      const x = col * bw + off, y = row * bh;
      const v = Math.random() * 34 - 17;
      const r = 118 + v, gr = 74 + v * 0.8, b = 58 + v * 0.7;
      const grad = g.createLinearGradient(x, y, x, y + bh);
      grad.addColorStop(0, `rgb(${r + 10 | 0},${gr + 8 | 0},${b + 6 | 0})`);
      grad.addColorStop(1, `rgb(${r - 14 | 0},${gr - 12 | 0},${b - 10 | 0})`);
      g.fillStyle = grad;
      g.fillRect(x + mortar, y + mortar, bw - mortar * 2, bh - mortar * 2);
      if (Math.random() < 0.06) {
        g.fillStyle = 'rgba(30,24,20,0.75)';
        g.fillRect(x + mortar, y + mortar, bw - mortar * 2, bh - mortar * 2);
      }
    }
  }
  speckle(g, S, S, 6000, 40, 200, 0.1);
  blobs(g, S, S, 18, 'rgba(20,18,16,0.3)', 24, 110);
  blobs(g, S, S, 6, 'rgba(210,206,196,0.12)', 20, 70);
  drips(g, S, S, 22, 0.3);
  grunge(g, S, S, 26);
  return c;
}

function sidewalkAlbedo() {
  const S = 512;
  const c = cv(S, S), g = ctx(c);
  g.fillStyle = '#9b978f';
  g.fillRect(0, 0, S, S);
  speckle(g, S, S, 7000, 60, 205, 0.12);
  for (let i = 0; i <= 2; i++) {
    g.strokeStyle = 'rgba(44,42,38,0.6)';
    g.lineWidth = 4;
    const p = i * (S / 2);
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
    g.strokeStyle = 'rgba(210,206,196,0.18)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(p + 4, 0); g.lineTo(p + 4, S); g.stroke();
    g.beginPath(); g.moveTo(0, p + 4); g.lineTo(S, p + 4); g.stroke();
  }
  for (let i = 0; i < 10; i++) {
    g.fillStyle = `rgba(${120 + Math.random() * 60 | 0},${118 + Math.random() * 50 | 0},${110 + Math.random() * 40 | 0},0.28)`;
    g.fillRect(Math.random() * S, Math.random() * S, 8 + Math.random() * 40, 6 + Math.random() * 30);
  }
  cracks(g, S, S, 14, 'rgba(34,32,28,0.45)');
  grunge(g, S, S, 26);
  let seed = 9;
  const rnd = () => (seed = (seed * 16807 + 11) % 2147483647) / 2147483647;
  g.strokeStyle = 'rgba(40,38,36,0.18)';
  g.lineWidth = 1.6;
  for (let x = 0; x < S; x += 9) {
    g.beginPath();
    g.moveTo(x + rnd() * 3, 0);
    g.lineTo(x + rnd() * 3, S);
    g.stroke();
    g.beginPath();
    g.moveTo(0, x + rnd() * 3);
    g.lineTo(S, x + rnd() * 3);
    g.stroke();
  }
  return c;
}

function corrugatedAlbedo(base, rust) {
  const S = 512;
  const c = cv(S, S), g = ctx(c);
  g.fillStyle = base || '#3a4a55';
  g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 18) {
    const grad = g.createLinearGradient(x, 0, x + 18, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.4)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.12)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 18, S);
  }
  const rr = rust === undefined ? 0.5 : rust;
  for (let i = 0; i < 900 * rr; i++) {
    g.fillStyle = `rgba(${120 + Math.random() * 60 | 0},${58 + Math.random() * 34 | 0},${22 + Math.random() * 18 | 0},${Math.random() * 0.45})`;
    g.beginPath();
    g.arc(Math.random() * S, Math.random() * S, 1 + Math.random() * 5, 0, 7);
    g.fill();
  }
  drips(g, S, S, 20, 0.3);
  grunge(g, S, S, 18);
  return c;
}

function facadeWall(g, S, tone, kind) {
  if (kind === 'brick') {
    const img = brickAlbedo();
    g.drawImage(img, 0, 0, S, S);
    return;
  }
  g.fillStyle = tone;
  g.fillRect(0, 0, S, S);
  speckle(g, S, S, 5200, 60, 205, 0.1);
  blobs(g, S, S, 12, 'rgba(48,44,40,0.2)', 30, 130);
  drips(g, S, S, 18, 0.2);
  grunge(g, S, S, 18);
}

function facadeModule(tone, kind, variant) {
  const S = 512;
  const albedo = cv(S, S), g = ctx(albedo);
  facadeWall(g, S, tone, kind);

  const wx = 132, wy = 96, ww = 248, wh = 286;
  const height = cv(S, S), hg = ctx(height);
  hg.fillStyle = '#8a8a8a';
  hg.fillRect(0, 0, S, S);

  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(wx - 10, wy - 10, ww + 20, wh + 24);
  hg.fillStyle = '#2a2a2a';
  hg.fillRect(wx - 10, wy - 10, ww + 20, wh + 24);

  const glass = g.createLinearGradient(wx, wy, wx + ww * 0.4, wy + wh);
  glass.addColorStop(0, '#101820');
  glass.addColorStop(0.45, '#1d2c38');
  glass.addColorStop(0.75, '#0c1219');
  glass.addColorStop(1, '#070a0e');
  g.fillStyle = glass;
  g.fillRect(wx, wy, ww, wh);
  hg.fillStyle = '#1c1c1c';
  hg.fillRect(wx, wy, ww, wh);

  g.fillStyle = 'rgba(150,170,190,0.10)';
  g.beginPath();
  g.moveTo(wx, wy + wh * 0.62);
  g.lineTo(wx + ww, wy + wh * 0.2);
  g.lineTo(wx + ww, wy + wh);
  g.lineTo(wx, wy + wh);
  g.closePath();
  g.fill();

  g.fillStyle = 'rgba(210,214,220,0.55)';
  g.fillRect(wx + ww / 2 - 4, wy, 8, wh);
  g.fillRect(wx, wy + wh * 0.44, ww, 7);
  hg.fillStyle = '#d0d0d0';
  hg.fillRect(wx + ww / 2 - 4, wy, 8, wh);
  hg.fillRect(wx, wy + wh * 0.44, ww, 7);

  if (variant % 3 === 0) {
    g.fillStyle = 'rgba(206,198,178,0.92)';
    g.fillRect(wx, wy, ww, 46 + Math.random() * 40);
    hg.fillStyle = '#c8c8c8';
    hg.fillRect(wx, wy, ww, 46);
  } else if (variant % 3 === 1) {
    g.fillStyle = 'rgba(24,26,30,0.9)';
    g.fillRect(wx, wy, ww, 60 + Math.random() * 30);
  }

  g.strokeStyle = 'rgba(224,226,230,0.5)';
  g.lineWidth = 9;
  g.strokeRect(wx, wy, ww, wh);
  hg.strokeStyle = '#dcdcdc';
  hg.lineWidth = 9;
  hg.strokeRect(wx, wy, ww, wh);

  g.fillStyle = 'rgba(230,228,222,0.85)';
  g.fillRect(wx - 18, wy + wh, ww + 36, 16);
  hg.fillStyle = '#f0f0f0';
  hg.fillRect(wx - 18, wy + wh, ww + 36, 16);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(wx - 18, wy + wh + 16, ww + 36, 12);
  hg.fillStyle = '#101010';
  hg.fillRect(wx - 18, wy + wh + 16, ww + 36, 12);

  g.fillStyle = 'rgba(0,0,0,0.24)';
  g.fillRect(wx - 18, wy + wh + 28, ww + 36, 46);
  drips(g, S, S, 14, 0.28);
  grunge(g, S, S, 10);
  return { albedo, height };
}

function facadeGlowSheet(srgb) {
  const W = 1024, H = 512;
  const c = cv(W, H), g = ctx(c);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  const bayW = W / 8, floorH = H / 4;
  for (let fy = 0; fy < 4; fy++) {
    for (let bx = 0; bx < 8; bx++) {
      if (Math.random() > 0.44) continue;
      const x = bx * bayW + bayW * (132 / 512);
      const y = fy * floorH + floorH * (96 / 512);
      const w = bayW * (248 / 512), h = floorH * (286 / 512);
      const warm = Math.random();
      const col = warm < 0.72
        ? [255, 196 + Math.random() * 40 | 0, 128 + Math.random() * 50 | 0]
        : (warm < 0.88 ? [180, 220, 255] : [120, 255, 210]);
      const inten = 0.5 + Math.random() * 0.9;
      const grad = g.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.95 * inten})`);
      grad.addColorStop(0.7, `rgba(${col[0] * 0.8 | 0},${col[1] * 0.75 | 0},${col[2] * 0.7 | 0},${0.8 * inten})`);
      grad.addColorStop(1, `rgba(${col[0] * 0.5 | 0},${col[1] * 0.45 | 0},${col[2] * 0.4 | 0},${0.55 * inten})`);
      g.fillStyle = grad;
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x + w / 2 - 3, y, 6, h);
      g.fillRect(x, y + h * 0.44, w, 5);
      if (Math.random() < 0.4) {
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillRect(x, y, w, h * (0.18 + Math.random() * 0.35));
      }
      if (Math.random() < 0.22) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(x + w * (0.15 + Math.random() * 0.5), y + h * 0.35, w * 0.16, h * 0.6);
      }
    }
  }
  const t = colorTex(c, srgb);
  return t;
}

function shopFront() {
  const W = 512, H = 256;
  const c = cv(W, H), g = ctx(c);
  g.fillStyle = '#33302c';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#15171a';
  g.fillRect(0, 0, W, 34);
  g.fillStyle = 'rgba(232,195,90,0.9)';
  g.fillRect(24, 10, 96, 12);
  g.fillRect(150, 10, 60, 12);
  g.fillRect(330, 10, 120, 12);
  const glassGrad = g.createLinearGradient(0, 40, 0, H);
  glassGrad.addColorStop(0, '#20262c');
  glassGrad.addColorStop(0.55, '#121820');
  glassGrad.addColorStop(1, '#080b0e');
  g.fillStyle = glassGrad;
  g.fillRect(12, 40, 226, H - 52);
  g.fillRect(274, 40, 226, H - 52);
  g.fillStyle = 'rgba(255,226,170,0.16)';
  g.fillRect(12, 40, 226, 26);
  g.fillRect(274, 40, 226, 26);
  g.fillStyle = '#2b2f34';
  g.fillRect(240, 44, 32, H - 56);
  g.fillStyle = '#c9a63f';
  g.fillRect(268, 150, 4, 18);
  const glow = cv(W, H), gg = ctx(glow);
  gg.fillStyle = '#000';
  gg.fillRect(0, 0, W, H);
  const gg1 = gg.createLinearGradient(0, 40, 0, H);
  gg1.addColorStop(0, 'rgba(255,214,150,0.95)');
  gg1.addColorStop(0.55, 'rgba(255,196,120,0.4)');
  gg1.addColorStop(1, 'rgba(255,180,100,0.08)');
  gg.fillStyle = gg1;
  gg.fillRect(12, 40, 226, H - 52);
  gg.fillRect(274, 40, 226, H - 52);
  gg.fillStyle = '#ffd88a';
  gg.fillRect(24, 10, 96, 12);
  gg.fillRect(150, 10, 60, 12);
  gg.fillRect(330, 10, 120, 12);
  return { map: colorTex(c), glow: colorTex(glow) };
}

function graffitiDecal(seed) {
  const W = 512, H = 256;
  const c = cv(W, H), g = ctx(c);
  g.clearRect(0, 0, W, H);
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const palette = ['#e0407a', '#37c6d8', '#f2d43a', '#8fe36a', '#f06a2a', '#b47cf0', '#f4f2ec'];
  const col = palette[(rnd() * palette.length) | 0];
  const col2 = palette[(rnd() * palette.length) | 0];
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.globalAlpha = 0.9;
  g.strokeStyle = col;
  g.lineWidth = 22 + rnd() * 26;
  g.beginPath();
  let x = 20 + rnd() * 60, y = H * 0.55;
  g.moveTo(x, y);
  for (let i = 0; i < 9; i++) {
    const nx = x + 34 + rnd() * 26;
    const ny = H * (0.18 + rnd() * 0.62);
    g.bezierCurveTo(x + 20, y + (rnd() - 0.5) * 130, nx - 20, ny + (rnd() - 0.5) * 130, nx, ny);
    x = nx; y = ny;
  }
  g.stroke();
  g.strokeStyle = col2;
  g.lineWidth = 6 + rnd() * 10;
  g.beginPath();
  x = 10; y = H * (0.3 + rnd() * 0.5);
  g.moveTo(x, y);
  for (let i = 0; i < 12; i++) {
    const nx = x + 26 + rnd() * 26;
    const ny = H * (0.15 + rnd() * 0.7);
    g.lineTo(nx, ny);
    x = nx; y = ny;
  }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath();
  g.arc(60 + rnd() * 380, H * (0.3 + rnd() * 0.4), 5 + rnd() * 12, 0, 7);
  g.fill();
  const spots = 120;
  for (let i = 0; i < spots; i++) {
    g.fillStyle = `rgba(${rnd() * 255 | 0},${rnd() * 255 | 0},${rnd() * 255 | 0},${rnd() * 0.25})`;
    g.beginPath();
    g.arc(rnd() * W, rnd() * H, 1 + rnd() * 4, 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
  const t = colorTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function signCanvas(text, color, sub) {
  const W = 512, H = 256;
  const c = cv(W, H), g = ctx(c);
  g.fillStyle = '#050607';
  g.fillRect(0, 0, W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 34;
  g.fillStyle = color;
  g.font = `bold ${text.length > 9 ? 62 : 84}px Arial Black, Arial, sans-serif`;
  g.fillText(text, W / 2, sub ? H * 0.42 : H / 2);
  if (sub) {
    g.shadowBlur = 20;
    g.font = 'bold 34px Arial, sans-serif';
    g.fillStyle = '#f4efe4';
    g.fillText(sub, W / 2, H * 0.72);
  }
  g.shadowBlur = 26;
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.strokeRect(18, 18, W - 36, H - 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function litterDecal() {
  const W = 256, H = 256;
  const c = cv(W, H), g = ctx(c);
  g.clearRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) {
    g.save();
    g.translate(30 + Math.random() * (W - 60), 30 + Math.random() * (H - 60));
    g.rotate(Math.random() * Math.PI * 2);
    g.fillStyle = Math.random() < 0.65 ? 'rgba(226,222,206,0.85)' : 'rgba(196,182,150,0.8)';
    g.fillRect(-18, -12, 36, 24);
    g.fillStyle = 'rgba(60,58,54,0.5)';
    g.fillRect(-14, -8, 20, 3);
    g.fillRect(-14, -2, 26, 3);
    g.restore();
  }
  const t = colorTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function tankAlbedo() {
  const S = 256;
  const c = cv(S, S), g = ctx(c);
  g.fillStyle = '#2f3a34';
  g.fillRect(0, 0, S, S);
  speckle(g, S, S, 4000, 30, 150, 0.16);
  blobs(g, S, S, 8, 'rgba(120,60,26,0.25)', 10, 44);
  drips(g, S, S, 10, 0.3);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < S; y += 32) g.fillRect(0, y, S, 2);
  return c;
}

export function buildTextures() {
  const T = {};
  T.asphalt = colorTex(asphaltAlbedo());
  const asphaltHeight = cv(256, 256);
  {
    const g = asphaltHeight.getContext('2d');
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4200; i++) {
      const v = 60 + Math.random() * 130 | 0;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      g.arc(Math.random() * 256, Math.random() * 256, 0.6 + Math.random() * 1.6, 0, 7);
      g.fill();
    }
  }
  T.asphaltNormal = normalFromCanvas(asphaltHeight, 1.5);
  T.asphaltRough = dataTex(asphaltRough());
  T.concrete = colorTex(concreteAlbedo());
  T.concreteDark = colorTex(concreteAlbedo('#6d6a64'));
  T.brick = colorTex(brickAlbedo());
  T.sidewalk = colorTex(sidewalkAlbedo());
  T.corrugated = colorTex(corrugatedAlbedo('#39536a', 0.6));
  T.corrugatedGreen = colorTex(corrugatedAlbedo('#2f4a3a', 1.0));
  T.rustyMetal = colorTex(corrugatedAlbedo('#5a4030', 1.6));
  T.tank = colorTex(tankAlbedo());
  T.litter = litterDecal();
  T.litter2 = litterDecal();

  T.facade = [];
  const tones = [
    ['#a99f8c', 'plaster'],
    ['#9a9da3', 'plaster'],
    ['#98897a', 'brick'],
  ];
  for (let v = 0; v < 3; v++) {
    const mod = facadeModule(tones[v][0], tones[v][1], v);
    T.facade.push({
      map: colorTex(mod.albedo),
      normal: normalFromCanvas(mod.height, 3.4),
    });
  }
  T.facadeGlowA = facadeGlowSheet(true);
  T.facadeGlowB = facadeGlowSheet(true);
  T.shop = shopFront();
  T.graffiti = [graffitiDecal(7), graffitiDecal(23), graffitiDecal(91), graffitiDecal(151), graffitiDecal(211)];
  T.signs = [
    signCanvas('PADARIA', '#ffb24a'),
    signCanvas('MERCADO', '#5ce1ff', '24 HORAS'),
    signCanvas('HOTEL', '#ff5f8a'),
    signCanvas('BAR DO ZE', '#ffd24a'),
    signCanvas('LANCHES', '#7dff9b'),
    signCanvas('FARMACIA', '#8affd0'),
    signCanvas('VIDRACARIA', '#ff9a4a'),
  ];
  return T;
}
