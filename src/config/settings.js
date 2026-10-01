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

export const DEFAULTS = {
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
};

const listeners = new Set();

export const Settings = {
  data: { ...DEFAULTS },

  load() {
    try {
      const raw = localStorage.getItem(CHAVE);
      if (raw) Object.assign(this.data, JSON.parse(raw));
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
    if (this.data[k] === v) return v;
    this.data[k] = v;
    this.save();
    if (!silent) this.emit(k, v);
    return v;
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
