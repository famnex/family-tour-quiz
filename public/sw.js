const CACHE_NAME = 'family-rallye-v3';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/audioSynth.js',
  '/js/confetti.js',
  '/js/odometer.js',
  '/js/app.js',
  '/js/admin.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip caching for WebSocket or mutating API calls
  if (url.pathname.startsWith('/ws') || (url.pathname.startsWith('/api') && event.request.method !== 'GET')) {
    return;
  }

  // Network-First for Code assets (HTML, CSS, JS) so code changes load instantly without Ctrl+F5
  if (
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    url.pathname.startsWith('/css') ||
    url.pathname.startsWith('/js') ||
    url.pathname.startsWith('/api/')
  ) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Media (Images, Audio, Video, Uploads) Cache-First to save mobile bandwidth
  if (
    url.hostname.includes('images.unsplash.com') ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|mp3|wav|ogg|mp4)$/) ||
    url.pathname.startsWith('/uploads')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (e) {
          return cachedResponse || Response.error();
        }
      })
    );
    return;
  }

  // Fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
