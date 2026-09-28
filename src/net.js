import * as THREE from '../vendor/three.module.js';
import { makeOperatorMesh } from './entities.js';

export class Net {
  constructor(scene) {
    this.scene = scene;
    this.ws = null;
    this.connected = false;
    this.id = null;
    this.players = new Map();
    this.onFeed = null;
    this.onRoster = null;
    this.retry = 0;
    this.closedByUs = false;
    this.stateAcc = 0;
  }

  get url() {
    let custom = '';
    try { custom = localStorage.getItem('urbana-server') || ''; } catch {}
    if (custom) {
      if (custom.startsWith('ws://') || custom.startsWith('wss://')) return custom;
      const secure = location.protocol === 'https:' ? 'wss://' : 'ws://';
      return secure + custom + '/ws';
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/ws';
  }

  connect(onFeed, onRoster) {
    this.onFeed = onFeed || this.onFeed;
    this.onRoster = onRoster || this.onRoster;
    this.closedByUs = false;
    try { this.ws = new WebSocket(this.url); } catch { return this.scheduleRetry(); }
    this.ws.onopen = () => {
      this.connected = true;
      this.retry = 0;
      this.send({ t: 'hello', name: this.myName(), cls: this.myCls });
    };
    this.ws.onmessage = e => this.dispatch(e.data);
    this.ws.onclose = () => {
      this.connected = false;
      if (this.closedByUs) return;
      this.clearPlayers();
      this.scheduleRetry();
    };
    this.ws.onerror = () => {   };
  }

  scheduleRetry() {
    if (this.closedByUs) return;
    this.retry = Math.min(30, (this.retry || 1) * 1.6 + 0.5);
    setTimeout(() => { if (!this.connected && !this.closedByUs) this.connect(this.onFeed, this.onRoster); }, this.retry * 1000);
  }

  disconnect() {
    this.closedByUs = true;
    try { this.ws && this.ws.close(); } catch {}
    this.clearPlayers();
    this.connected = false;
  }

  myName() {
    let n = '';
    try { n = localStorage.getItem('urbana-name') || ''; } catch {}
    if (!n) {
      n = 'OPERADOR-' + Math.floor(100 + Math.random() * 900);
      try { localStorage.setItem('urbana-name', n); } catch {}
    }
    return n;
  }
  myCls = 'police';

  send(obj) {
    if (this.connected && this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(obj)); } catch {}
    }
  }

  sendState(pos, yaw, pitch, slot, hp, moving) {
    this.stateAcc++;
    if (this.stateAcc % 2) return;
    this.send({ t: 'state', p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)], yaw: +yaw.toFixed(2), pitch: +pitch.toFixed(2), slot, hp, m: moving ? 1 : 0 });
  }
  sendShot(origin, dir, sfx) {
    this.send({ t: 'shot', o: [+origin.x.toFixed(1), +origin.y.toFixed(1), +origin.z.toFixed(1)], d: [+dir.x.toFixed(2), +dir.y.toFixed(2), +dir.z.toFixed(2)], sfx });
  }
  sendKill(dmg) { this.send({ t: 'hit', dmg: Math.max(1, Math.min(45, dmg | 0)), kill: 1 }); }
  sendChat(m) { this.send({ t: 'chat', m }); }

  dispatch(raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    switch (m.t) {
      case 'welcome': {
        this.id = m.you.id;
        for (const pl of m.players) this.spawn(pl);
        if (this.onRoster) this.onRoster();
        break;
      }
      case 'join': this.spawn(m.pl); if (this.onRoster) this.onRoster(); break;
      case 'leave': this.remove(m.id); if (this.onRoster) this.onRoster(); break;
      case 'states': for (const s of m.s) this.applyState(s); break;
      case 'snap':   break;
      case 'shots': for (const s of m.s) this.remoteShot(s); break;
      case 'chat': if (this.onFeed) this.onFeed(`${m.name}: ${m.m}`, '#c9d8a0'); break;
      case 'score': if (this.onRoster) this.onRoster(m.b); break;
      case 'kick': this.disconnect(); break;
    }
  }

  spawn(pl) {
    if (this.players.has(pl.id) || pl.id === this.id) return;
    const mesh = makeOperatorMesh(pl.cls === 'thug' ? 'thug' : 'police');
    mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(8,10,12,0.65)';
    g.roundRect ? (g.beginPath(), g.roundRect(28, 8, 200, 44, 10), g.fill()) : g.fillRect(28, 8, 200, 44);
    g.font = '700 24px Segoe UI, sans-serif';
    g.fillStyle = '#e8c35a';
    g.textAlign = 'center';
    g.fillText(String(pl.name).slice(0, 14), 128, 39);
    const tex = new THREE.CanvasTexture(cv);
    const plate = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    plate.scale.set(1.5, 0.375, 1);
    plate.position.y = 2.15;
    mesh.add(plate);
    if (this.scene) this.scene.add(mesh);
    this.players.set(pl.id, {
      mesh, plate, name: pl.name, cls: pl.cls, kills: 0,
      target: new THREE.Vector3(), yawT: 0, pitchT: 0, slot: 0, hp: 100,
      moving: 0, animT: 0, last: 0,
    });
  }

  remove(id) {
    const r = this.players.get(id);
    if (!r) return;
    if (r.mesh.parent) r.mesh.parent.remove(r.mesh);
    this.players.delete(id);
  }

  clearPlayers() { for (const id of [...this.players.keys()]) this.remove(id); this.id = null; }

  applyState(s) {
    if (!Array.isArray(s) || s.length < 9) return;
    const [id, x, y, z, yaw, pitch, slot, hp, moving] = s;
    if (id === this.id) return;
    const r = this.players.get(id);
    if (!r) return;
    r.target.set(x, y, z);
    r.yawT = yaw; r.pitchT = pitch; r.slot = slot; r.hp = hp; r.moving = moving;
  }

  remoteShot(s) {
    if (!this.onRemoteShot) return;
    this.onRemoteShot(s);
  }

  update(dt) {
    for (const r of this.players.values()) {
      if (!r.mesh.parent) continue;
      const k = 1 - Math.exp(-12 * dt);
      r.mesh.position.lerp(r.target, k);
      let d = r.yawT - r.mesh.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      r.mesh.rotation.y += d * k;
      r.animT += dt * (r.moving ? 8 : 2);
      const kids = r.mesh.children;
      const armL = kids[kids.length - 4], armR = kids[kids.length - 3];
      const legL = kids[kids.length - 2], legR = kids[kids.length - 1];
      const amp = r.moving ? 0.5 : 0.08;
      legL.rotation.x = Math.sin(r.animT) * amp;
      legR.rotation.x = -Math.sin(r.animT) * amp;
      armR.rotation.x = -0.9 + Math.sin(r.animT) * amp * 0.15;
      armL.rotation.x = -0.75 - Math.sin(r.animT) * amp * 0.15;
    }
  }
}
