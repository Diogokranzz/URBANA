if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const novo = reg.installing;
        if (!novo) return;
        novo.addEventListener('statechange', () => {
          if (novo.state === 'activated' && navigator.serviceWorker.controller) location.reload();
        });
      });
    }).catch(() => {});
  });
  let atualizou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (atualizou) return;
    atualizou = true;
    location.reload();
  });
}
