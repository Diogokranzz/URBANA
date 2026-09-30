// Gera docs/trilha.wav — synthwave cinematografico livre de direitos (100% sintetizado)
// Progressao: Am - F - C - G, 100 BPM, ~64s, com kick, baixo, pad, arpejo e hats.
const fs = require('fs');
const path = require('path');

const SR = 44100;
const BPM = 100;
const BEAT = 60 / BPM;            // 0.6s
const BAR = BEAT * 4;             // 2.4s
const BARS = 27;                  // ~64.8s
const DUR = BARS * BAR;
const N = Math.floor(SR * DUR);
const L = new Float64Array(N), R = new Float64Array(N);

const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz
// Acordes (MIDI): Am(57,60,64) F(53,57,60) C(48,52,55->60,64) G(55,59,62)
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48 + 12, 52 + 12, 55 + 12], // C
  [55, 59, 62], // G
];
const BASS_ROOT = [33, 29, 36, 31]; // A1 F1 C2 G1

function addSamples(t0, dur, fn, gain = 1, pan = 0) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  for (let i = 0; i < n; i++) {
    const idx = i0 + i;
    if (idx < 0 || idx >= N) continue;
    const t = i / SR;
    const s = fn(t, dur) * gain;
    const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
    L[idx] += s * gl; R[idx] += s * gr;
  }
}
const env = (t, a, d, s, r, dur) => {
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * (t - a) / d;
  if (t < dur - r) return s;
  return s * Math.max(0, (dur - t) / r);
};

for (let bar = 0; bar < BARS; bar++) {
  const t0 = bar * BAR;
  const ch = CHORDS[bar % 4];
  const root = BASS_ROOT[bar % 4];
  const intro = bar < 2, outro = bar >= BARS - 1;
  const g = intro ? 0.5 : 1;

  // KICK: 4 batidas por compasso
  for (let b = 0; b < 4; b++) {
    addSamples(t0 + b * BEAT, 0.22, t => {
      const f = 110 * Math.exp(-t * 30) + 42;
      return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 16);
    }, 0.55 * g);
  }
  // HAT: contratempos com ruido
  for (let b = 0; b < 4; b++) {
    addSamples(t0 + b * BEAT + BEAT / 2, 0.06, (t) => {
      return (Math.random() * 2 - 1) * Math.exp(-t * 90);
    }, 0.10 * g, 0.3);
  }
  // BAixo: colcheias no compasso (root, root, quinta, root)
  const bassSeq = [0, 0, 7, 0, 0, 7, 0, 12];
  for (let i = 0; i < 8; i++) {
    const f = NOTE(root + bassSeq[i]);
    addSamples(t0 + i * BEAT / 2, BEAT / 2 * 0.9, t =>
      (Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(2 * Math.PI * f * 2 * t) * 0.25 + Math.sin(2 * Math.PI * f * 3 * t) * 0.1)
      * env(t, 0.004, 0.08, 0.5, 0.05, BEAT / 2 * 0.9)
    , 0.30 * g);
  }
  // PAD: acorde sustentado
  for (const m of ch) {
    const f = NOTE(m);
    addSamples(t0, BAR * 0.98, t =>
      (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.005 * t)) * 0.5
      * env(t, 0.6, 0.4, 0.75, 0.8, BAR * 0.98)
    , 0.085 * g, (m % 3 - 1) * 0.4);
  }
  // ARPEJO: semicolcheias subindo o acorde (a partir do compasso 2)
  if (!intro) {
    const arp = [ch[0], ch[1], ch[2], ch[1] + 12, ch[0] + 12, ch[1] + 12, ch[2], ch[1]];
    for (let i = 0; i < 16; i++) {
      const m = arp[i % 8] + (i >= 8 ? 12 : 0);
      const f = NOTE(m);
      addSamples(t0 + i * BEAT / 4, BEAT / 4 * 0.85, t =>
        Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 18)
      , 0.14, (i % 2 ? 0.35 : -0.35));
    }
  }
  // Brilho final: nota alta sustentada no ultimo compasso
  if (outro) {
    addSamples(t0 + BAR * 0.5, BAR * 0.5, t =>
      Math.sin(2 * Math.PI * NOTE(69) * t) * Math.exp(-t * 2), 0.12);
  }
}

// Master: soft clip + fade out final
const fadeN = Math.floor(SR * 2.5);
let peak = 0;
for (let i = 0; i < N; i++) {
  if (i > N - fadeN) { const k = (N - i) / fadeN; L[i] *= k; R[i] *= k; }
  L[i] = Math.tanh(L[i] * 1.1); R[i] = Math.tanh(R[i] * 1.1);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.92 / (peak || 1);
const out = Buffer.alloc(44 + N * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVE', 8);
out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * norm * 32767))), 44 + i * 4);
  out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * norm * 32767))), 46 + i * 4);
}
const dest = path.join(__dirname, '..', 'docs', 'trilha.wav');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log('OK', dest, (fs.statSync(dest).size / 1e6).toFixed(1) + 'MB', 'duracao', DUR.toFixed(1) + 's');
