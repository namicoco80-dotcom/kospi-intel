const CACHE = 'kospi-intel-v3';
const ASSETS = [
  '/kospi-intel/',
  '/kospi-intel/index.html',
  '/kospi-intel/css/style.css',
  '/kospi-intel/js/state.js',
  '/kospi-intel/js/init.js',
  '/kospi-intel/js/router.js',
  '/kospi-intel/js/utils.js',
  '/kospi-intel/js/tab_my.js',
  '/kospi-intel/js/tab_feed.js',
  '/kospi-intel/js/tab_ai.js',
  '/kospi-intel/js/tab_port.js',
  '/kospi-intel/js/tab_etc.js',
  '/kospi-intel/js/chart.js',
  '/kospi-intel/js/main.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('data/public/')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
