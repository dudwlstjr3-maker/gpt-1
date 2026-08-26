/**
 * Market Mood 3 서비스 워커.
 *
 * 전략
 *  - 정적 자산(/_next/static, /icons): cache-first
 *  - 페이지 이동: network-first, 실패 시 캐시 → 오프라인 안내
 *  - /api/*: 캐시하지 않는다. 오래된 시세를 오프라인에서 최신인 척 보여주면 안 된다.
 *    (앱은 서버 캐시의 stale-while-revalidate 로 마지막 정상 데이터를 처리한다.)
 */

const VERSION = 'mm3-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

const OFFLINE_HTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>오프라인 — Market Mood 3</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#0a0d14;color:#e9eef8;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;}
  .box{max-width:320px;padding:24px;text-align:center}
  h1{font-size:16px;margin:0 0 8px}
  p{font-size:13px;color:#98a5bd;line-height:1.6;margin:0 0 16px}
  button{background:#6ea8fe;color:#0a0d14;border:0;border-radius:8px;padding:10px 18px;font-weight:700;font-size:13px}
</style></head>
<body><div class="box">
  <h1>오프라인 상태입니다</h1>
  <p>네트워크에 연결되면 최신 시세와 심리 점수를 다시 불러옵니다. 오래된 값을 최신처럼 보여주지 않기 위해 시세는 캐시하지 않습니다.</p>
  <button onclick="location.reload()">다시 시도</button>
</div></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(['/icons/icon-192.png', '/icons/icon-512.png', '/manifest.webmanifest']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 시세·점수 API 는 절대 캐시하지 않는다.
  if (url.pathname.startsWith('/api/')) return;

  // 개발 서버의 HMR 요청은 건드리지 않는다.
  if (url.pathname.includes('/_next/webpack-hmr') || url.pathname.includes('__nextjs')) return;

  const isStatic = url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons/');

  if (isStatic) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then(
            (hit) =>
              hit ||
              new Response(OFFLINE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
          ),
        ),
    );
  }
});
