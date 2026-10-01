import { surfaceOf } from './config/surfaces.js';

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.reverb = null;
    this._ocluido = null;
    this._ambiente = 'rua';
  }

  setOclusao(fn) {
    this._ocluido = fn;
  }

  setMaster(v) {
    this._volMestre = v;
    if (this.master) this.master.gain.value = v;
  }

  setAmbiente(tipo) {
    this._ambiente = tipo;
    if (!this.reverb) return;
    const presets = {
      rua: { wet: 0.15, corte: 3600, cauda: 1.1 },
      beco: { wet: 0.26, corte: 2600, cauda: 1.3 },
      sala: { wet: 0.34, corte: 2200, cauda: 1.5 },
      galpao: { wet: 0.46, corte: 1500, cauda: 2.1 },
    };
    const p = presets[tipo] || presets.rua;
    this.reverb.wet.gain.value = p.wet;
    this.reverb.corte.frequency.value = p.corte;
    if (!this.reverb.bufDur || Math.abs(this.reverb.bufDur - p.cauda) > 0.2) this._initReverb(p.cauda);
  }

  _initReverb(dur = 1.1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let suave = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const bruto = Math.random() * 2 - 1;
        suave = suave * 0.55 + bruto * 0.45;
        d[i] = suave * Math.pow(1 - t, 2.6) * 0.8;
      }
    }
    const conv = this.reverb ? this.reverb.conv : ctx.createConvolver();
    conv.buffer = buf;
    const corte = this.reverb ? this.reverb.corte : ctx.createBiquadFilter();
    corte.type = 'lowpass';
    corte.frequency.value = 2600;
    const wet = this.reverb ? this.reverb.wet : ctx.createGain();
    conv.connect(corte);
    corte.connect(wet);
    wet.connect(this.master);
    this.reverb = { conv, corte, wet, bufDur: dur };
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 20;
    comp.ratio.value = 5;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    if (this._volMestre !== undefined) this.master.gain.value = this._volMestre;
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._initReverb(1.1);
    this.setAmbiente(this._ambiente);
    this.startAmbience();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _noise(dur, gain, filterType, freq, q, out) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(out || this.master);
    src.start(); src.stop(ctx.currentTime + dur + 0.05);
    return { src, f, g };
  }

  _tone(type, f0, f1, dur, gain, out) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(out || this.master);
    o.start(); o.stop(ctx.currentTime + dur + 0.05);
    return o;
  }

  _pan3d(pos, camPos, camDir, camRight) {
    const ctx = this.ctx;
    const dx = pos.x - camPos.x, dy = pos.y - camPos.y, dz = pos.z - camPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
    const side = (dx * camRight.x + dy * camRight.y + dz * camRight.z) / dist;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, side));
    let ocluido = false;
    if (this._ocluido && dist > 1.4) ocluido = this._ocluido(camPos, pos);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = ocluido ? 780 : 18000;
    const g = ctx.createGain();
    g.gain.value = Math.min(1, 6 / (dist + 2)) * (ocluido ? 0.6 : 1);
    pan.connect(lp); lp.connect(g); g.connect(this.master);
    if (this.reverb && !ocluido) {
      const envio = ctx.createGain();
      envio.gain.value = Math.min(1, 3.5 / (dist + 3));
      g.connect(envio); envio.connect(this.reverb.conv);
    }
    return pan;
  }

  _cauda(pos, camPos, camDir, camRight, dur, ganho, freq) {
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    this._noise(dur, ganho, 'bandpass', freq, 0.6, out);
    this._noise(dur * 1.6, ganho * 0.5, 'lowpass', freq * 0.35, 0.7, out);
  }

  _shotBody(out, { crack = 7.5, punch = 145, body = 0.32, tail = 0.9 } = {}) {
    const ctx = this.ctx;
    const c = this._noise(0.05, 0.85, 'bandpass', crack * 1000, 0.7, out);
    c.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.045);
    this._tone('sine', punch, punch * 0.35, 0.14, 0.9, out);
    this._noise(body, 0.6, 'bandpass', 950, 0.9, out);
    const t1 = this._noise(tail, 0.22, 'highpass', 700, 0.5, out);
    const t2 = this._noise(tail * 0.7, 0.14, 'lowpass', 320, 0.6, out);
    this._noise(0.025, 0.26, 'bandpass', 5200, 1.8, out);
    this._tone('square', 3400, 1600, 0.018, 0.05, out);
    if (this.reverb && out === this.master) {
      const envio = ctx.createGain();
      envio.gain.value = 0.55;
      t1.g.connect(envio);
      t2.g.connect(envio);
      envio.connect(this.reverb.conv);
    }
  }

  shotRifle(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    this._shotBody(out, { crack: 6.5, punch: 120, body: 0.4, tail: 1.15 });
  }

  shotPistol(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    this._shotBody(out, { crack: 6.4, punch: 112, body: 0.44, tail: 1.05 });
  }

  engineStart() {
    if (!this.ctx || this._eng) return;
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 27;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 1.4;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o1.start(); o2.start();
    g.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 0.5);
    this._eng = { g, o1, o2, f };
  }
  engine(speed) {
    if (!this._eng) return;
    const t = this.ctx.currentTime;
    const rpm = 55 + Math.abs(speed) * 7;
    this._eng.o1.frequency.linearRampToValueAtTime(rpm, t + 0.08);
    this._eng.o2.frequency.linearRampToValueAtTime(rpm / 2, t + 0.08);
    this._eng.f.frequency.linearRampToValueAtTime(380 + Math.abs(speed) * 36, t + 0.08);
    this._eng.g.gain.linearRampToValueAtTime(0.1 + Math.abs(speed) * 0.006, t + 0.1);
  }
  engineHit() {
    if (!this.ctx) return;
    this._noise(0.12, 0.3, 'lowpass', 900, 1, this.master);
  }

  turboSet(on) {
    if (!this.ctx) return;
    if (on && !this._turbo) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 850; f.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start();
      g.gain.linearRampToValueAtTime(0.11, ctx.currentTime + 0.18);
      this._turbo = { src, g };
    } else if (!on && this._turbo) {
      const t = this._turbo;
      t.g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.22);
      setTimeout(() => { try { t.src.stop(); } catch {} }, 320);
      this._turbo = null;
    }
  }

  turboIgnite() {
    if (!this.ctx) return;
    this._noise(0.3, 0.4, 'bandpass', 480, 0.6, this.master);
    this._tone('sawtooth', 95, 40, 0.35, 0.28, this.master);
    this._noise(0.08, 0.3, 'highpass', 2600, 1, this.master);
  }

  runOver(pos, camPos, camDir, camRight, kmh) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    const f = Math.min(1, (kmh || 30) / 80);
    this._tone('sine', 110, 42, 0.28, 0.5 + 0.4 * f, out);
    this._noise(0.18, 0.5 + 0.3 * f, 'lowpass', 480, 0.8, out);
    this._noise(0.32, 0.1 + 0.35 * f, 'bandpass', 320, 1.1, out);
    this._tone('square', 900, 830, 0.14, 0.03 + 0.1 * f, out);
    this._tone('square', 1350, 1230, 0.1, 0.02 + 0.06 * f, out);
  }
  engineStop() {
    if (!this._eng) return;
    this.turboSet(false);
    const { g, o1, o2 } = this._eng;
    g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.35);
    setTimeout(() => { try { o1.stop(); o2.stop(); } catch {} }, 450);
    this._eng = null;
  }

  screwTick() {
    if (!this.ctx) return;
    this._tone('square', 2300, 1500, 0.025, 0.07);
    this._noise(0.03, 0.09, 'bandpass', 3300, 2);
  }

  shotSuppressed(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    const ctx = this.ctx;
    const s = this._noise(0.09, 0.34, 'lowpass', 1400, 0.8, out);
    s.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    this._tone('sine', 220, 90, 0.08, 0.3, out);
    this._tone('square', 1900, 900, 0.03, 0.12, out);
    this._noise(0.035, 0.12, 'bandpass', 3600, 2, out);
  }

  shotSmg(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    this._shotBody(out, { crack: 3.6, punch: 150, body: 0.22, tail: 0.5 });
  }

  shotShotgun(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    this._shotBody(out, { crack: 4.4, punch: 70, body: 0.75, tail: 1.3 });
  }

  shotSniper(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    this._shotBody(out, { crack: 4.6, punch: 78, body: 0.5, tail: 1.7 });
    setTimeout(() => {
      if (!this.ctx) return;
      this._noise(0.9, 0.12, 'bandpass', 600, 0.7, out);
    }, 260);
  }

  dryFire() {
    if (!this.ctx) return;
    this._tone('square', 2200, 1400, 0.03, 0.12);
    this._noise(0.04, 0.1, 'highpass', 4000, 1, this.master);
  }

  reload(stage) {
    if (!this.ctx) return;
    if (stage === 0) {
      this._noise(0.05, 0.25, 'bandpass', 1800, 2);
      this._tone('square', 300, 180, 0.05, 0.1);
    } else if (stage === 1) {
      this._tone('square', 500, 260, 0.06, 0.18);
      this._noise(0.06, 0.3, 'bandpass', 1200, 2);
    } else {
      this._tone('square', 800, 400, 0.04, 0.2);
      this._noise(0.05, 0.35, 'highpass', 2500, 1);
    }
  }

  impact(point, id, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const s = surfaceOf(id);
    const cfg = s.audio || { tail: 0.16, body: 0.05 };
    const out = (point && camPos) ? this._pan3d(point, camPos, camDir, camRight) : this.master;
    const ataque = 0.9 + Math.random() * 0.2;
    const corpo = (cfg.body || 0.05) * ataque;
    const cauda = (cfg.tail || 0.16) * (0.85 + Math.random() * 0.3);
    switch (s.id) {
      case 'metal':
        this._tone('triangle', 1700 + Math.random() * 900, 620, cauda * 0.9, 0.2 * ataque, out);
        this._noise(corpo, 0.22, 'highpass', 3200, 1, out);
        this._noise(cauda, 0.16, 'bandpass', 2400, 1.4, out);
        break;
      case 'glass':
        this._tone('sine', 2600 + Math.random() * 1400, 1400, cauda * 0.5, 0.14, out);
        this._noise(corpo, 0.26, 'highpass', 4200, 1.2, out);
        this._noise(cauda, 0.2, 'bandpass', 5200, 1.8, out);
        break;
      case 'wood':
        this._tone('sine', 320 + Math.random() * 120, 140, corpo * 2.4, 0.26, out);
        this._noise(corpo, 0.24, 'bandpass', 1200, 1, out);
        this._noise(cauda, 0.12, 'lowpass', 700, 0.7, out);
        break;
      case 'plaster':
        this._noise(corpo, 0.24, 'lowpass', 900, 0.6, out);
        this._noise(cauda, 0.2, 'bandpass', 1700, 0.7, out);
        break;
      case 'fabric':
        this._noise(corpo, 0.2, 'lowpass', 520, 0.7, out);
        break;
      case 'plastic':
        this._tone('square', 900 + Math.random() * 400, 380, corpo * 1.6, 0.12, out);
        this._noise(corpo, 0.18, 'bandpass', 2200, 1.2, out);
        break;
      case 'flesh':
        this._noise(0.08, 0.32, 'lowpass', 640, 0.7, out);
        this._tone('sine', 150, 70, 0.09, 0.18, out);
        break;
      case 'asphalt':
        this._noise(corpo, 0.22, 'lowpass', 1100, 0.6, out);
        this._noise(cauda, 0.14, 'bandpass', 1400, 0.9, out);
        break;
      default:
        this._noise(corpo, 0.24, 'bandpass', 1500 + Math.random() * 800, 1, out);
        this._noise(cauda, 0.17, 'lowpass', 800, 0.7, out);
        this._tone('sine', 260, 120, corpo * 2, 0.14, out);
    }
  }



  ricochet(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = this._pan3d(pos, camPos, camDir, camRight);
    const f0 = 2500 + Math.random() * 2000;
    this._tone('sawtooth', f0, f0 * 0.25, 0.14 + Math.random() * 0.1, 0.14, out);
  }

  hitmarker() {
    if (!this.ctx) return;
    this._tone('square', 2400, 2200, 0.045, 0.16);
    this._tone('square', 3200, 3000, 0.03, 0.1);
  }
  headshot() {
    if (!this.ctx) return;
    this._tone('square', 3000, 2800, 0.05, 0.2);
    setTimeout(() => this._tone('square', 4000, 3800, 0.06, 0.2), 55);
  }
  kill() {
    if (!this.ctx) return;
    this._tone('sine', 700, 300, 0.22, 0.25);
  }
  explosion(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    this._noise(1.4, 1.0, 'lowpass', 220, 0.4, out);
    this._tone('sine', 120, 28, 0.9, 0.8, out);
    this._noise(0.35, 0.6, 'bandpass', 900, 0.5, out);
  }
  pinPull() { if (this.ctx) { this._tone('square', 1500, 900, 0.05, 0.12); } }
  throwSfx() { if (this.ctx) this._noise(0.12, 0.18, 'bandpass', 800, 1); }

  footstep(run, superficie) {
    if (!this.ctx) return;
    const s = surfaceOf(superficie);
    const g = run ? 0.16 : 0.08;
    const f = 300 + Math.random() * 250;
    const agudo = s.id === 'metal' ? 3.4 : s.id === 'wood' ? 2.2 : s.id === 'asphalt' ? 1.6 : 2.8;
    this._noise(0.09, g, 'lowpass', f, 0.8);
    this._noise(0.05, g * 0.5, 'bandpass', f * agudo, 1);
    if (s.id === 'metal') this._tone('triangle', f * 6, f * 2.4, 0.05, 0.04);
  }
  jumpLand() {
    if (!this.ctx) return;
    this._noise(0.12, 0.25, 'lowpass', 350, 0.8);
  }
  heartbeat() {
    if (!this.ctx) return;
    this._tone('sine', 65, 45, 0.16, 0.5);
    setTimeout(() => this._tone('sine', 60, 40, 0.14, 0.35), 190);
  }

  startAmbience() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoG = ctx.createGain(); lfoG.gain.value = 160;
    lfo.connect(lfoG); lfoG.connect(f.frequency);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    [55, 58.2].forEach((fr, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
      const og = ctx.createGain(); og.gain.value = 0.018;
      const l2 = ctx.createOscillator(); l2.frequency.value = 0.05 + i * 0.03;
      const l2g = ctx.createGain(); l2g.gain.value = 0.012;
      l2.connect(l2g); l2g.connect(og.gain);
      o.connect(og); og.connect(this.master);
      o.start(); l2.start();
    });
  }

  uiHover() {
    if (!this.ctx) return;
    this._tone('sine', 1150, 1400, 0.05, 0.05);
  }
  uiPress() {
    if (!this.ctx) return;
    this._tone('square', 2600, 2400, 0.03, 0.07);
    this._noise(0.035, 0.06, 'bandpass', 3000, 1.4);
  }
  uiBack() {
    if (!this.ctx) return;
    this._tone('sine', 700, 450, 0.09, 0.07);
  }
  uiConfirm() {
    if (!this.ctx) return;
    this._tone('sine', 523, 523, 0.16, 0.10);
    setTimeout(() => this._tone('sine', 784, 784, 0.22, 0.10), 90);
    this._noise(0.05, 0.1, 'bandpass', 2200, 1.5);
  }

  waveStart(wave) {
    if (!this.ctx) return;
    const base = 110 * Math.pow(1.0595, Math.min(wave, 12));
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        this._tone('sawtooth', base, base * 0.99, 0.5, 0.06);
        this._noise(0.1, 0.2, 'bandpass', 150, 1);
      }, i * 320);
    }
  }
  waveClear() {
    if (!this.ctx) return;
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this._tone('sine', f, f, 0.3, 0.12), i * 120));
  }
}
