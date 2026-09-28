const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const PORT = process.env.PORT || 8137;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const okCache = new Set();

const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

const server = http.createServer((req, res) => {
  const ip = req.socket.remoteAddress || '?';
  const n = (hits.get(ip) || 0) + 1;
  hits.set(ip, n);
  if (n > 240) { res.writeHead(429); return res.end('Too Many Requests'); }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  let p;
  try {
    p = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (p === '/') p = '/index.html';

  const base = path.basename(p);
  if (base.startsWith('.')) { res.writeHead(403); return res.end(); }
  const ext = path.extname(p).toLowerCase();
  if (!types[ext]) { res.writeHead(404); return res.end(); }

  const file = path.resolve(root, '.' + path.posix.normalize('/' + p));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end(); }
  if (!okCache.has(file)) {
    let st;
    try { st = fs.statSync(file); } catch { res.writeHead(404); return res.end('404'); }
    if (!st.isFile()) { res.writeHead(404); return res.end(); }
    if (!fs.realpathSync(file).startsWith(root)) { res.writeHead(403); return res.end(); }
    okCache.add(file);
  }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    securityHeaders(res);
    res.writeHead(200, {
      'Content-Type': types[ext],
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.on('upgrade', handleUpgrade);
const HOST = process.env.URBANA_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
server.listen(PORT, HOST, () => {
  console.log(`URBANA rodando em http://${HOST === '0.0.0.0' ? '<ip-local>' : HOST}:${PORT}`);
  console.log('Multiplayer: WebSocket em ws://<host>:' + PORT + '/ws');
  if (HOST === '127.0.0.1') console.log('Servidor local apenas, nenhum dado sai desta máquina.');
});

const crypto = require('crypto');
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MSG = 2048;
const MAX_NAME = 14;
const MAX_PER_IP = 4;
const TICK_MS = 80;

const MAX_SPEED = 14;
const MAX_PITCH = 1.5;
const MSG_RATE = 55;
const SHOT_MIN = { ak: 0.085, pistol: 0.2, sniper: 1.2, smg: 0.06, shotgun: 0.75 };
const HIT_DMG_MAX = 45;
const HIT_RATE = 9;

const rooms = { players: new Map() };
const ipCount = new Map();
let nextId = 1;

function wsAccept(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

function encodeFrame(str) {
  const payload = Buffer.from(str);
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x81, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}

function decodeFrames(buf) {
  const frames = [];
  let off = 0;
  while (buf.length - off >= 2) {
    const b0 = buf[off], b1 = buf[off + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let pos = off + 2;
    if (len === 126) { if (buf.length - pos < 2) break; len = buf.readUInt16BE(pos); pos += 2; }
    else if (len === 127) { if (buf.length - pos < 8) break; len = Number(buf.readBigUInt64BE(pos)); pos += 8; }
    if (len > MAX_MSG * 4) return { frames, rest: null, close: true };
    if (buf.length - pos < len + (masked ? 4 : 0)) break;
    let payload;
    if (masked) {
      const mask = buf.slice(pos, pos + 4);
      payload = Buffer.from(buf.slice(pos + 4, pos + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      pos += 4;
    } else {
      payload = buf.slice(pos, pos + len);
    }
    pos += len;
    off = pos;
    if (opcode === 8) return { frames, rest: null, close: true };
    if (opcode === 9) continue;
    if (opcode === 1) frames.push(payload.toString('utf8'));
  }
  return { frames, rest: buf.slice(off) };
}

function wsSend(sock, str) {
  if (sock.destroyed) return;
  try { sock.write(encodeFrame(str)); } catch {   }
}
const broadcast = (str, exceptId) => {
  for (const [id, p] of rooms.players) if (id !== exceptId) wsSend(p.sock, str);
};

function sanitizeName(s) {
  return String(s || '').replace(/[\u0000-\u001f<>{}\\"`|]/g, '').trim().slice(0, MAX_NAME) || 'OPERADOR';
}

function boardPayload() {
  return JSON.stringify({ t: 'score', b: [...rooms.players.values()].map(p => [p.id, p.name, p.kills, p.cls]) });
}

function handleUpgrade(req, socket) {
  if (req.url !== '/ws') { socket.destroy(); return; }
  const ip = req.socket.remoteAddress || '?';
  const n = (hits.get(ip) || 0) + 1; hits.set(ip, n);
  if ((ipCount.get(ip) || 0) >= MAX_PER_IP) { socket.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  const origin = req.headers.origin || '';
  const host = req.headers.host || '';
  if (!key || !origin.endsWith(host)) { socket.destroy(); return; }

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${wsAccept(key)}\r\n\r\n`
  );
  socket.setNoDelay(true);

  const player = {
    id: nextId++, sock: socket, ip, name: 'OPERADOR', cls: 'police',
    kills: 0, pos: [0, 0, 0], yaw: 0, pitch: 0, slot: 0, hp: 100,
    buf: Buffer.alloc(0), lastState: 0,
    msgTimes: [], shotLast: 0, shotVio: 0, speedVio: 0, hitTimes: [],
    helloDone: false,
  };
  socket.on('close', () => leave(player));
  socket.on('error', () => leave(player));
  socket.on('data', chunk => onData(player, chunk));
}

function leave(p) {
  if (!rooms.players.has(p.id)) return;
  rooms.players.delete(p.id);
  ipCount.set(p.ip, Math.max(0, (ipCount.get(p.ip) || 1) - 1));
  broadcast(JSON.stringify({ t: 'leave', id: p.id }));
  broadcast(boardPayload());
}

function kick(p, why) {
  wsSend(p.sock, JSON.stringify({ t: 'kick', why }));
  setTimeout(() => { try { p.sock.destroy(); } catch {} }, 60);
  leave(p);
}

function rateOK(p) {
  const now = Date.now();
  p.msgTimes.push(now);
  while (p.msgTimes.length && now - p.msgTimes[0] > 1000) p.msgTimes.shift();
  return p.msgTimes.length <= MSG_RATE;
}

function onData(p, chunk) {
  p.buf = p.buf.length ? Buffer.concat([p.buf, chunk]) : chunk;
  if (p.buf.length > MAX_MSG * 8) return kick(p, 'flood');
  const { frames, rest, close } = decodeFrames(p.buf);
  if (close) return leave(p);
  p.buf = rest || Buffer.alloc(0);
  for (const f of frames) {
    if (f.length > MAX_MSG) return kick(p, 'mensagem grande');
    if (!rateOK(p)) return kick(p, 'taxa de mensagens');
    let m; try { m = JSON.parse(f); } catch { continue; }
    handleMessage(p, m);
  }
}

function handleMessage(p, m) {
  switch (m.t) {
    case 'hello': {
      p.name = sanitizeName(m.name);
      p.cls = m.cls === 'thug' ? 'thug' : 'police';
      p.helloDone = true;
      const you = { id: p.id, name: p.name, cls: p.cls };
      const others = [...rooms.players.values()].map(q => ({ id: q.id, name: q.name, cls: q.cls }));
      rooms.players.set(p.id, p);
      ipCount.set(p.ip, (ipCount.get(p.ip) || 0) + 1);
      wsSend(p.sock, JSON.stringify({ t: 'welcome', you, players: others }));
      broadcast(JSON.stringify({ t: 'join', pl: you }), p.id);
      broadcast(boardPayload());
      break;
    }
    case 'state': {
      if (!p.helloDone) return;
      if (!Array.isArray(m.p) || m.p.length !== 3) return;
      const [x, y, z] = m.p;
      if (![x, y, z, m.yaw, m.pitch].every(Number.isFinite)) return;
      const dx = x - p.pos[0], dz = z - p.pos[2];
      const dist = Math.hypot(dx, dz);
      if (p.lastState && dist > MAX_SPEED * 0.2) {
        if (++p.speedVio > 20) return kick(p, 'velocidade impossível');
        wsSend(p.sock, JSON.stringify({ t: 'snap', p: p.pos }));
        return;
      }
      p.speedVio = Math.max(0, p.speedVio - 1);
      p.pos = [x, Math.max(0, Math.min(30, y)), z];
      p.yaw = m.yaw; p.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, m.pitch));
      if (Number.isInteger(m.slot) && m.slot >= 0 && m.slot <= 5) p.slot = m.slot;
      if (Number.isFinite(m.hp)) p.hp = Math.max(0, Math.min(999, m.hp | 0));
      p.moving = m.m ? 1 : 0;
      p.lastState = Date.now();
      break;
    }
    case 'shot': {
      if (!p.helloDone) return;
      const now = Date.now();
      const min = (SHOT_MIN[m.sfx] || 0.2) * 1000;
      if (now - p.shotLast < min * 0.7) {
        if (++p.shotVio > 15) return kick(p, 'cadência de tiro impossível');
        return;
      }
      p.shotVio = Math.max(0, p.shotVio - 1);
      p.shotLast = now;
      if (!Array.isArray(m.o) || !Array.isArray(m.d) || ![...m.o, ...m.d].every(Number.isFinite)) return;
      broadcast(JSON.stringify({ t: 'shots', s: [[p.id, ...m.o.map(v => +v.toFixed(2)), ...m.d.map(v => +v.toFixed(2)), String(m.sfx).slice(0, 8)] ] }), p.id);
      break;
    }
    case 'hit': {
      if (!p.helloDone) return;
      const now = Date.now();
      p.hitTimes.push(now);
      while (p.hitTimes.length && now - p.hitTimes[0] > 1000) p.hitTimes.shift();
      if (p.hitTimes.length > HIT_RATE) return kick(p, 'dano alegado demais');
      const dmg = m.dmg | 0;
      if (dmg <= 0 || dmg > HIT_DMG_MAX) return;
      p.kills += (m.kill ? 1 : 0);
      if (m.kill && p.kills % 5 === 0) broadcast(boardPayload());
      break;
    }
    case 'chat': {
      if (!p.helloDone) return;
      const msg = sanitizeName(m.m).slice(0, 80);
      if (!msg) return;
      broadcast(JSON.stringify({ t: 'chat', id: p.id, name: p.name, m: msg }));
      break;
    }
  }
}

setInterval(() => {
  if (rooms.players.size === 0) return;
  const s = [];
  for (const p of rooms.players.values()) {
    if (!p.helloDone || !p.lastState) continue;
    s.push([p.id, +p.pos[0].toFixed(2), +p.pos[1].toFixed(2), +p.pos[2].toFixed(2),
      +p.yaw.toFixed(2), +p.pitch.toFixed(2), p.slot, p.hp, p.moving || 0]);
  }
  if (s.length) broadcast(JSON.stringify({ t: 'states', s }));
}, TICK_MS).unref();
