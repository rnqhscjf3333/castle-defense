// 설치형 앱(PWA) 서비스 워커: 한 번 받은 파일은 기기에 저장해 두어 다음부터 빠르게 열리고, 인터넷이 없어도 게임을 할 수 있다.
// 페이지·스크립트는 '인터넷 먼저'(새 버전이 있으면 바로 받음), 그림은 '저장본 먼저'. 배경음악(mp3)과 랭킹 서버 요청은 건드리지 않는다.
const CACHE = 'cd-v1';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon.png', 'icon-192.png', 'icon-512.png', 'assets/title.webp'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range') || url.pathname.endsWith('.mp3')) return;
  const put = res => { if (res && res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; };
  if (/\.(webp|png|svg|jpg)$/i.test(url.pathname)) { e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(put))); return; }
  e.respondWith(fetch(req).then(put).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(hit => hit || caches.match('index.html'))));
});
