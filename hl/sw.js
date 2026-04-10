const CACHE_NAME = 'hltrade-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/hl/hl.css',
  '/hl/hl.js',
  '/hl/chart.js',
    '/hl/manifest.json',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=IBM+Plex+Mono:wght@400;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.0/ethers.umd.min.js',
  'https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js'
];

// Install Event
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', e => {
  // Skip cross-origin requests and non-GET requests
  if (e.request.method !== 'GET') return;
  
  e.respondWith(
    caches.match(e.request).then(res => {
      return res || fetch(e.request).catch(() => {
        // Fallback or just fail
      });
    })
  );
});

// Inactivity check logic is handled in hl.js via localStorage timestamps
// because Service Workers cannot access the DOM or reliably track mouse movements.
