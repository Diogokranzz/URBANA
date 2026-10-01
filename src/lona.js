const CTX_NULO = new Proxy({}, {
  get: (_t, p) => (p === 'canvas' ? null : () => CTX_NULO),
  set: () => true,
});

export function lonaGrao(lado) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = lado;
    c.height = lado;
    return c;
  }
  return { width: lado, height: lado, getContext: () => CTX_NULO };
}
