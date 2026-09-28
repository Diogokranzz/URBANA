// ============================================================
//  ÁUDIO PROCEDURAL — tudo sintetizado com WebAudio (sem arquivos)
// ============================================================

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    // compressão suave no master
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 20;
    comp.ratio.value = 5;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    // buffer de ruído branco reutilizável (2s)
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // ------- helpers -------
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

  // posiciona um som 3D simples no espaço (listener em 0,0,0 olhando -Z)
  _pan3d(pos, camPos, camDir, camRight) {
    const ctx = this.ctx;
    const dx = pos.x - camPos.x, dy = pos.y - camPos.y, dz = pos.z - camPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
    // componente lateral = produto escalar com o vetor direito da câmera
    const side = (dx * camRight.x + dy * camRight.y + dz * camRight.z) / dist;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, side));
    const g = ctx.createGain();
    g.gain.value = Math.min(1, 6 / (dist + 2));
    pan.connect(g); g.connect(this.master);
    return pan;
  }

  // ------- armas -------
  // carroceria do tiro real: crack inicial + body ressonante + tail de eco urbano.
  // O crack de 8kHz→1.4kHz em 8ms é o que dá a sensação de "estouro" real.
  _shotBody(out, { crack = 7.5, punch = 145, body = 0.32, tail = 0.9 } = {}) {
    const ctx = this.ctx;
    // 1) crack: ruído bandpass agudo curtíssimo (supersônico)
    const c = this._noise(0.05, 0.85, 'bandpass', crack * 1000, 0.7, out);
    c.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.045);
    // 2) punch grave (o "thump" que bate no peito)
    this._tone('sine', punch, punch * 0.35, 0.14, 0.9, out);
    // 3) body: ruído passa-banda médio com decaimento rápido
    this._noise(body, 0.6, 'bandpass', 950, 0.9, out);
    // 4) tail: reflexos urbanos com eco decrescente
    this._noise(tail, 0.22, 'highpass', 700, 0.5, out);
    this._noise(tail * 0.7, 0.14, 'lowpass', 320, 0.6, out);
  }

  shotRifle(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    // AK-47: 7.62mm — grave, estouro seco, eco longo
    this._shotBody(out, { crack: 6.5, punch: 120, body: 0.4, tail: 1.15 });
  }

  shotPistol(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    // .50 AE aberto (sem silenciador): estampa alto e seco, eco de rua curto
    this._shotBody(out, { crack: 6.4, punch: 112, body: 0.44, tail: 1.05 });
  }

  // ---------------- motor do carro (síntese contínua) ----------------
  engineStart() {
    if (!this.ctx || this._eng) return;
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 27;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 1.4;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o1.start(); o2.start();
    // partida: vira rápido e assenta
    g.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 0.5);
    this._eng = { g, o1, o2, f };
  }
  engine(speed) {
    if (!this._eng) return;
    const t = this.ctx.currentTime;
    const rpm = 55 + Math.abs(speed) * 7;                 // giro sobe com velocidade
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

  // atropelamento: THUD grave do corpo na lataria + crunch + "ding" metálico do capô
  // (mistura escala com a velocidade do carro)
  runOver(pos, camPos, camDir, camRight, kmh) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    const f = Math.min(1, (kmh || 30) / 80);
    this._tone('sine', 110, 42, 0.28, 0.5 + 0.4 * f, out);        // punch no peito
    this._noise(0.18, 0.5 + 0.3 * f, 'lowpass', 480, 0.8, out);   // thud do corpo
    this._noise(0.32, 0.1 + 0.35 * f, 'bandpass', 320, 1.1, out); // crunch
    this._tone('square', 900, 830, 0.14, 0.03 + 0.1 * f, out);    // ding da lataria
    this._tone('square', 1350, 1230, 0.1, 0.02 + 0.06 * f, out);  // 2º harmônico
  }
  engineStop() {
    if (!this._eng) return;
    this.turboSet(false);
    const { g, o1, o2 } = this._eng;
    g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.35);
    setTimeout(() => { try { o1.stop(); o2.stop(); } catch {} }, 450);
    this._eng = null;
  }

  // desrosquear/rosquear o silenciador: clique metálico curto do cano
  screwTick() {
    if (!this.ctx) return;
    this._tone('square', 2300, 1500, 0.025, 0.07);
    this._noise(0.03, 0.09, 'bandpass', 3300, 2);
  }

  // pistola com silenciador: sopro abafado + mecanismo metálico
  shotSuppressed(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    const ctx = this.ctx;
    // sopro abafado (o "pfft" do silenciador)
    const s = this._noise(0.09, 0.34, 'lowpass', 1400, 0.8, out);
    s.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    this._tone('sine', 220, 90, 0.08, 0.3, out);
    // ação do ferrolho metálica (slide)
    this._tone('square', 1900, 900, 0.03, 0.12, out);
    this._noise(0.035, 0.12, 'bandpass', 3600, 2, out);
  }

  // MP5-SD: rajada curta abafada, click de ferrolho rápido
  shotSmg(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    this._shotBody(out, { crack: 3.6, punch: 150, body: 0.22, tail: 0.5 });
  }

  // Pump 12: ESTAMPO grave largo + baixo-médio de pressão (cartucho 12)
  shotShotgun(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    this._shotBody(out, { crack: 4.4, punch: 70, body: 0.75, tail: 1.3 });
  }

  shotSniper(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = (pos && camPos) ? this._pan3d(pos, camPos, camDir, camRight) : this.master;
    // .338 Lapua: o tiro mais pesado do jogo — crack alto, punch profundo, eco duplo distante
    this._shotBody(out, { crack: 4.6, punch: 78, body: 0.5, tail: 1.7 });
    // eco distante de segunda reflexão (sniper dispara de longe)
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
    if (stage === 0) {        // ejeta o carregador
      this._noise(0.05, 0.25, 'bandpass', 1800, 2);
      this._tone('square', 300, 180, 0.05, 0.1);
    } else if (stage === 1) { // insere carregador novo
      this._tone('square', 500, 260, 0.06, 0.18);
      this._noise(0.06, 0.3, 'bandpass', 1200, 2);
    } else {                  // trava ferrolho
      this._tone('square', 800, 400, 0.04, 0.2);
      this._noise(0.05, 0.35, 'highpass', 2500, 1);
    }
  }

  // ------- impacts -------
  impact(world, matKind) {
    if (!this.ctx) return;
    if (matKind === 'metal') {
      this._tone('triangle', 1900 + Math.random() * 700, 700, 0.12, 0.2);
      this._noise(0.05, 0.2, 'highpass', 3500, 1);
    } else if (matKind === 'flesh') {
      this._noise(0.08, 0.3, 'lowpass', 700, 0.7);
    } else {
      this._noise(0.06, 0.22, 'bandpass', 1500 + Math.random() * 800, 1);
    }
  }

  ricochet(pos, camPos, camDir, camRight) {
    if (!this.ctx) return;
    const out = this._pan3d(pos, camPos, camDir, camRight);
    const f0 = 2500 + Math.random() * 2000;
    this._tone('sawtooth', f0, f0 * 0.25, 0.14 + Math.random() * 0.1, 0.14, out);
  }

  // ------- eventos -------
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

  // ------- movimento -------
  footstep(run) {
    if (!this.ctx) return;
    const g = run ? 0.16 : 0.08;
    const f = 300 + Math.random() * 250;
    this._noise(0.09, g, 'lowpass', f, 0.8);
    this._noise(0.05, g * 0.5, 'bandpass', f * 3, 1);
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

  // ------- ambiente -------
  startAmbience() {
    const ctx = this.ctx;
    // vento contínuo com LFO no filtro
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
    // drones graves distantes (tensão)
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

  // ------- interface (menus / HUD) -------
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
    // acorde de missão aceita: dois tons + click mecânico
    this._tone('sine', 523, 523, 0.16, 0.10);
    setTimeout(() => this._tone('sine', 784, 784, 0.22, 0.10), 90);
    this._noise(0.05, 0.1, 'bandpass', 2200, 1.5);
  }

  // música de onda: percussão de tensão
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
