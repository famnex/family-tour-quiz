const CACHE_PREFIX = 'family-rallye-';
const CACHE_NAME = CACHE_PREFIX + 'v10-' + new URL(self.registration.scope).pathname;
const assetUrl = path => new URL(path, self.registration.scope).href;
const CORE_ASSETS = ['', 'index.html', 'css/style.css', 'js/ui.js', 'js/liveView.js', 'js/adminRecovery.js', 'js/editorGuard.js', 'js/invitations.js', 'js/audioSynth.js', 'js/confetti.js', 'js/odometer.js', 'js/app.js', 'js/admin.js', 'manifest.json'].map(assetUrl);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME && (!key.includes('v10-') || key.endsWith(new URL(self.registration.scope).pathname))).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/') || event.request.headers.has('range')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const isCode = event.request.mode === 'navigate' || /\.(css|js|html|json)$/.test(url.pathname);
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached && !isCode) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok && response.status === 200) await cache.put(event.request, response.clone());
      return response;
    } catch {
      return cached || (event.request.mode === 'navigate' && await cache.match(assetUrl('index.html'))) || Response.error();
    }
  })());
});
