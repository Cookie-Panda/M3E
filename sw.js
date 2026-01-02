const CACHE_NAME = 'm3e-player-v5';

const ASSETS_TO_CACHE = [
  '/M3E/',
  '/M3E/index.html',
  '/M3E/app.js',
  '/M3E/scripts.js',
  '/M3E/styles.css',
  '/M3E/manifest.json',
  '/M3E/icon-192.png',
  '/M3E/icon-512.png',
  '/M3E/jsmediatags.min.js',
  '/M3E/sykg-zNym6YjUruM-QrEh7-nyTnjDwKNJ_190FjzaqkNCeE.woff2',
  '/M3E/t5svIQcYNIWbFgDgAAzZ34auoVyXkJCOvp3SFWJbN5hF8Ju1x6sKCyp0l9sI40swNJwGpVd4AZzz0v6lJ4qFXNZhGjLvDSkV4W6GGn9Q3I8i.woff2'
];


// 1. INSTALL
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  
  // Activate immediately
  self.skipWaiting();
});


// 2. ACTIVATE
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        )
      ),
      self.clients.claim()
    ])
  );
});


// 3. FETCH (Offline-first)
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request)
        .then((networkResponse) => {
          // Cache new successful requests
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          // Offline fallback for navigation
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});