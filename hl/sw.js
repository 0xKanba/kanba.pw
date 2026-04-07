/* ═══════════════════════════════════════════════
   HL Trade · Service Worker v1.0
   Cache: shell files فقط (JS/CSS/HTML)
   Network-first للـ API دائماً
═══════════════════════════════════════════════ */

const CACHE  = 'hl-trade-v7';
const SHELL  = [
  '/hl/',
  '/hl/index.html',
  '/hl/hl.css',
  '/hl/hl.js',
  '/hl/manifest.json',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=IBM+Plex+Mono:wght@400;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.0/ethers.umd.min.js'
];

// ── تثبيت: cache الـ shell ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── تفعيل: حذف caches قديمة ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch strategy ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API Hyperliquid → network only (لا تخزين أبداً)
  if (url.hostname === 'api.hyperliquid.xyz' ||
      url.hostname === 'arb1.arbitrum.io') {
    e.respondWith(fetch(e.request));
    return;
  }

  // Google Fonts → network-first مع cache fallback
  if (url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const clone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Shell files → cache-first مع network fallback
  e.respondWith(
    caches.match(e.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return r;
        });
      })
      .catch(() => caches.match('/hl/index.html'))
  );
});
