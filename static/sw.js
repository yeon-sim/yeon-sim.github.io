// ── 연심(連心) Service Worker ──
// CACHE_VERSION: 게임 데이터 대규모 업데이트 시 올려서 이미지 캐시를 초기화합니다.
const CACHE_VERSION = 'v5';
const STATIC_CACHE  = `yeon-sim-static-${CACHE_VERSION}`;
const IMAGE_CACHE   = `yeon-sim-images-${CACHE_VERSION}`;

// ── install: 즉시 활성화 ──
self.addEventListener('install', () => self.skipWaiting());

// ── activate: 이전 버전 캐시 정리 ──
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('yeon-sim-') && !k.endsWith(CACHE_VERSION))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── fetch: 요청 인터셉트 ──
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // 다른 origin (CDN, Analytics, AdSense 등)은 그냥 통과
  if (url.origin !== self.location.origin) return;

  // ── 이미지: Cache-First ──
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url.pathname)) {
    e.respondWith(cacheFirst(IMAGE_CACHE, request));
    return;
  }

  // ── CSS / JS: Cache-First (fingerprinted URL → 버전 변경 시 자동 무효화) ──
  if (/\.(css|js)$/i.test(url.pathname)) {
    e.respondWith(cacheFirst(STATIC_CACHE, request));
    return;
  }

  // ── HTML 페이지: Network-First (최신 버전 우선, 실패 시 캐시) ──
  if (request.mode === 'navigate') {
    e.respondWith(networkFirst(STATIC_CACHE, request));
    return;
  }
});

// ── 전략 헬퍼 ──

async function cacheFirst(cacheName, request) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(new Request(request, { cache: 'reload' }));
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    // 이미지 요청 실패 시 빈 응답 대신 에러를 그대로 전달
    throw err;
  }
}

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    // cache:'reload' → 브라우저 HTTP 캐시를 우회해 항상 최신 HTML 을 받아온다.
    // (이게 없으면 GitHub Pages 의 max-age 동안 옛 페이지가 반환되어, 배포해도 강력 새로고침 전까지 갱신 안 됨)
    const response = await fetch(new Request(request, { cache: 'reload' }));
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}
