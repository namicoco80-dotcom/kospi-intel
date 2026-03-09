const CACHE = 'kospi-intel-v13';
const ASSETS = ['./', './index.html', './prices.json', './news.json', './supply.json', './analysis.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting(); // 즉시 활성화 (대기 없이 바로 새 버전)
});

self.addEventListener('activate', e => {
  // 이전 캐시 전부 삭제
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => {
      console.log('[SW] 이전 캐시 삭제:', k);
      return caches.delete(k);
    }))
  ));
  self.clients.claim();
  // 새 버전 알림 → 앱에서 토스트 표시
  self.clients.matchAll().then(clients => {
    clients.forEach(client => client.postMessage({ type: 'NEW_VERSION' }));
  });
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // JSON 데이터는 항상 네트워크 우선 (주가/뉴스 최신값)
  if (url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // index.html도 네트워크 우선 (새 버전 즉시 반영)
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // 나머지(아이콘 등)는 캐시 우선
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
