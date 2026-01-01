const CACHE_NAME = 'm3e-player-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './icon-512.png',
  './icon-192.png',
  './manifest.json',
  './jsmediatags.min.js',
  './sykg-zNym6YjUruM-QrEh7-nyTnjDwKNJ_190FjzaqkNCeE.woff2',
  './scripts.js',
  './styles.css'
];

// 1. Install Event: Cache resources immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching all: app shell and content');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Fetch Event: Serve from Cache, Fallback to Network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cache hit or fetch over network
      return response || fetch(event.request);
    })
  );
});

// 3. Activate Event: Clean up old caches if versions change
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});
