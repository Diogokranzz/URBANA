const CHAVE = 'urbana-config-v1';

export const GRAPHICS_PRESETS = {
  baixa: {
    id: 'baixa',
    label: 'BAIXA',
    pixelRatio: 1,
    postFx: false,
    shadows: false,
    fog: false,
    pointLights: 2,
    biasToHigh: false,
    decals: 16,
    particles: 0.4,
    impactLights: 1,
    lensDirt: false,
    beam: false,
  },
  media: {
    id: 'media',
    label: 'MEDIA',
    pixelRatio: 1.25,
    postFx: true,
    shadows: true,
    softShadows: false,
    fog: true,
    pointLights: 6,
    decals: 40,
    particles: 0.7,
    impactLights: 1,
    lensDirt: true,
    beam: true,
  },
  alta: {
    id: 'alta',
    label: 'ALTA',
    pixelRatio: 1.5,
    postFx: true,
    shadows: true,
    softShadows: true,
    fog: true,
    pointLights: 22,
    decals: 64,
    particles: 1,
    impactLights: 2,
    lensDirt: true,
    beam: true,
  },
  ultra: {
    id: 'ultra',
    label: 'ULTRA',
    pixelRatio: 2,
    postFx: true,
    shadows: true,
    softShadows: true,
    fog: true,
    pointLights: 28,
    decals: 96,
    particles: 1.4,
    impactLights: 3,
    lensDirt: true,
    beam: true,
    bloomBoost: 1.1,
  },
  competitivo: {
    id: 'competitivo',
    label: 'COMPETITIVO',
    pixelRatio: 1.25,
    postFx: true,
    postLight: true,
    shadows: false,
    fog: false,
    pointLights: 2,
    decals: 8,
    particles: 0.35,
    impactLights: 0,
    lensDirt: false,
    beam: false,
    bloom: 0.18,
    grain: 0,
    vignette: 0.1,
    chroma: 0,
    readlegibility: true,
  },
};

export const VISUAL_PRESETS = {
  clareza: {
    id: 'clareza',
    label: 'CLAREZA',
    exposure: 1.6,
    vignette: 0.24,
    contrast: 1.04,
    sat: 1.08,
    chroma: 0.0012,
    grain: 0.014,
    bloom: 0.7,
    shadowLift: 0.038,
    midtoneGain: 1.14,
    highlightCompress: 0.3,
    minLuminance: 0.021,
    hemi: 1.24,
    ambient: 1.3,
    moon: 1.06,
    rim: 1.1,
  },
  cinematografico: {
    id: 'cinematografico',
    label: 'CINEMATOGRAFICO',
    exposure: 1.47,
    vignette: 0.4,
    contrast: 1.1,
    sat: 1.12,
    chroma: 0.0016,
    grain: 0.018,
    bloom: 0.8,
    shadowLift: 0.023,
    midtoneGain: 1.06,
    highlightCompress: 0.34,
    minLuminance: 0.013,
    hemi: 1.08,
    ambient: 1.06,
    moon: 1.02,
    rim: 1.2,
  },
  competitivo: {
    id: 'competitivo',
    label: 'COMPETITIVO',
    exposure: 1.7,
    vignette: 0.07,
    contrast: 1.02,
    sat: 1.0,
    chroma: 0.0,
    grain: 0.0,
    bloom: 0.34,
    shadowLift: 0.052,
    midtoneGain: 1.2,
    highlightCompress: 0.26,
    minLuminance: 0.03,
    hemi: 1.32,
    ambient: 1.4,
    moon: 1.14,
    rim: 1.0,
  },
};

export function visualDe(id) {
  return VISUAL_PRESETS[id] || VISUAL_PRESETS.clareza;
}

export const DEFAULTS = {
  visual: 'clareza',
  brightness: 1.0,
  vignetteScale: 1.0,
  graphics: 'alta',
  fov: 72,
  sensitivity: 1.0,
  master: 0.8,
  hitmarker: true,
  crosshair: true,
  crosshairColor: '#ffffff',
  crosshairScale: 1.0,
  hudScale: 1.0,
  hudOpacity: 1.0,
  safezone: 1.0,
  showMinimap: true,
  showChips: true,
  showCompass: true,
  shakeScale: 1.0,
  flashScale: 1.0,
  weaponSway: 1.0,
  bobScale: 1.0,
  laser: true,
  bloodEnabled: true,
  lowHpEffects: true,
  laserVisibility: 1.0,
  weaponFeel: 'tatico',
};

export const LIMITES_SEGUROS = {
  brightness: [0.7, 1.35],
  vignetteScale: [0, 1.5],
  hudScale: [0.7, 1.4],
  hudOpacity: [0.3, 1],
  safezone: [0.8, 1],
  crosshairScale: [0.6, 1.8],
  shakeScale: [0, 1.5],
  flashScale: [0, 1],
  weaponSway: [0, 1.5],
  bobScale: [0, 1.5],
  laserVisibility: [0.2, 1.5],
  sensitivity: [0.3, 3],
};

export function valorSeguro(k, v) {
  const faixa = LIMITES_SEGUROS[k];
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULTS[k];
  if (!faixa) return n;
  return n < faixa[0] ? faixa[0] : n > faixa[1] ? faixa[1] : n;
}

const listeners = new Set();

export const Settings = {
  data: { ...DEFAULTS },

  load() {
    try {
      const raw = localStorage.getItem(CHAVE);
      if (!raw) return this.data;
      const salvo = JSON.parse(raw);
      for (const k of Object.keys(salvo)) {
        if (DEFAULTS[k] === undefined) continue;
        this.data[k] = typeof DEFAULTS[k] === 'number' ? valorSeguro(k, salvo[k]) : salvo[k];
      }
    } catch {}
    return this.data;
  },

  save() {
    try { localStorage.setItem(CHAVE, JSON.stringify(this.data)); } catch {}
  },

  get(k) {
    return this.data[k];
  },

  set(k, v, silent) {
    const val = typeof DEFAULTS[k] === 'number' ? valorSeguro(k, v) : v;
    if (this.data[k] === val) return val;
    this.data[k] = val;
    this.save();
    if (!silent) this.emit(k, val);
    return val;
  },

  patch(obj, silent) {
    Object.assign(this.data, obj);
    this.save();
    if (!silent) this.emit('*', obj);
  },

  preset() {
    return GRAPHICS_PRESETS[this.data.graphics] || GRAPHICS_PRESETS.alta;
  },

  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  emit(key, value) {
    for (const fn of listeners) {
      try { fn(key, value, this.data); } catch {}
    }
  },

  reset() {
    this.data = { ...DEFAULTS };
    this.save();
    this.emit('*', this.data);
  },
};

Settings.load();

export function aplicarAcessibilidade(gerenciador) {
  const s = Settings.data;
  const regras = {
    shake: ['--urb-shake', String(s.shakeScale)],
    flash: ['--urb-flash', String(s.flashScale)],
    crosshair: ['--urb-cross', s.crosshair ? '1' : '0'],
    brilho: ['--urb-brightness', String(s.brightness)],
    crosshairDisplay: ['--urb-cross-display', s.crosshair ? 'block' : 'none'],
    crosshairColor: ['--urb-cross-color', s.crosshairColor],
    crosshairScale: ['--urb-cross-scale', String(s.crosshairScale)],
    compassDisplay: ['--urb-compass-display', s.showCompass ? 'block' : 'none'],
    minimapDisplay: ['--urb-minimap-display', s.showMinimap ? 'block' : 'none'],
    chipsDisplay: ['--urb-chips-display', s.showChips ? 'flex' : 'none'],
    hudScale: ['--urb-hud-scale', String(s.hudScale)],
    hudOpacity: ['--urb-hud-opacity', String(s.hudOpacity)],
    safezone: ['--urb-safezone', String(s.safezone)],
    minimap: ['--urb-minimap', s.showMinimap ? '1' : '0'],
    chips: ['--urb-chips', s.showChips ? '1' : '0'],
    compass: ['--urb-compass', s.showCompass ? '1' : '0'],
    lowhp: ['--urb-lowhp', s.lowHpEffects ? '1' : '0'],
  };
  const alvo = gerenciador || document.documentElement;
  for (const [, [prop, val]] of Object.entries(regras)) alvo.style.setProperty(prop, val);
}
