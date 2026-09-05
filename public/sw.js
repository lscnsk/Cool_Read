const CACHE_NAME = 'coolread-v5';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => console.warn('SW failed to cache:', url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const requestUrl = event.request.url;
  // Never intercept or cache GitHub API, raw files or CDN repository calls in SW
  if (
    requestUrl.includes('api.github.com') ||
    requestUrl.includes('raw.githubusercontent.com') ||
    requestUrl.includes('jsdelivr')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached asset immediately, update cache in background
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request)
        .then((response) => {
          // Cache successful script, css, font, and image requests
          if (response && response.status === 200) {
            const url = event.request.url;
            if (
              url.includes('/assets/') ||
              url.includes('.js') ||
              url.includes('.css') ||
              url.includes('.png') ||
              url.includes('.woff') ||
              url.includes('.woff2') ||
              url.includes('fonts.googleapis.com') ||
              url.includes('fonts.gstatic.com')
            ) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
            }
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html') || caches.match('./') || caches.match('/index.html') || caches.match('/');
          }
        });
    })
  );
});

