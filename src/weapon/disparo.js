export function contagemDeProjeteis(d) {
  if (!d || d.class !== 'shotgun') return 1;
  const n = Number(d.pelletCount);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(24, Math.floor(n));
}

export function projeteisComTracer(projeteis) {
  return Math.min(3, Math.max(0, Math.floor(projeteis)));
}

export function permiteDisparo(auto, t, ultimoDisparo, rpm) {
  const intervalo = 60 / Math.max(1, rpm);
  return t - ultimoDisparo >= intervalo - 1e-6;
}
