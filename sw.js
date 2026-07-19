const CACHE_VERSION = "kanba-v12";
const IMAGE_CACHE = "kanba-images-v12";
const STATIC_CACHE = "kanba-static-v12";

// ملفات أساسية (لا تضع كل المشروع هنا)
const STATIC_ASSETS = [
  "/",
  "/css/kanba.css",
  "/css/ccr.css",
  "/js/kanba.js",
  "/js/ccr.js"
];

// INSTALL
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ACTIVATE
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (![CACHE_VERSION, IMAGE_CACHE, STATIC_CACHE].includes(key)) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// FETCH
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

  // =========================
  // 1. IMAGES (FULL OFFLINE SYSTEM)
  // =========================
  if (isImage) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);

        // لو موجود في الكاش → فورًا
        if (cached) return cached;

        // تحميل + تخزين تلقائي
        const res = await fetch(req);
        cache.put(req, res.clone());

        return res;
      })
    );
    return;
  }

  // =========================
  // 2. STATIC FILES
  // =========================
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

  // =========================
  // 3. OTHERS
  // =========================
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
