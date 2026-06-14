const CACHE_NAME = "kanba-v3";
const IMAGE_CACHE = "kanba-images-v1";
const STATIC_CACHE = "kanba-static-v1";

// ملفات أساسية (خفيفة فقط)
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/kanba.css",
  "/css/ccr.css",
  "/js/common.js",
  "/js/kanba.js",
  "/js/ccr.js"
];

// INSTALL: تخزين الملفات الأساسية فقط
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ACTIVATE: تنظيف القديم
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (![CACHE_NAME, IMAGE_CACHE, STATIC_CACHE].includes(key)) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// FETCH STRATEGY
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);

  const isImage =
    req.destination === "image" ||
    url.pathname.startsWith("/images/");

  const isStatic =
    STATIC_ASSETS.includes(url.pathname) ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".html");

  // 1. الصور: Cache First + auto save
  if (isImage) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;

        const res = await fetch(req);
        cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // 2. الملفات الثابتة: Cache First
  if (isStatic) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;

        const res = await fetch(req);
        cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // 3. باقي الطلبات: Network First
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
