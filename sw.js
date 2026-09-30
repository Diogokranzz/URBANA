const CACHE = 'urbana.v12';
const ESSENCIAIS = [
  './',
  'index.html',
  'manifest.json',
  'logo.svg',
  'favicon.svg',
  'icon192.png',
  'icon512.png',
  'docs/banner.svg',
  'src/main.js',
  'src/world.js',
  'src/entities.js',
  'src/weapons.js',
  'src/audio.js',
  'src/fx.js',
  'src/physics.js',
  'src/net.js',
  'vendor/three.module.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname === '/ws' || url.protocol.startsWith('ws')) return;
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res.ok && url.origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match('index.html'));
    })
  );
});
