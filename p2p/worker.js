/*
 * worker.js — وسيط Cloudflare Worker (مجاني) بين صفحتك و Binance P2P.
 * لا يُرفع إلى GitHub Pages؛ يُلصق في Cloudflare (انظر README.md).
 *
 * يستقبل POST من صفحتك، يمرره إلى Binance، ويعيد الرد مع ترويسة CORS.
 * ALLOWED_ORIGINS يمنع المواقع الأخرى من استخدام الوسيط الخاص بك.
 * cache 10 ثوانٍ يخفف الضغط إذا فتح الصفحة زوار كثيرون.
 */
const BINANCE = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
const ALLOWED_ORIGINS = ["https://kanba.pw", "https://www.kanba.pw", "http://localhost:8000"];

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const cors = {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return new Response("POST only", { status: 405, headers: cors });

    const body = await request.text();
    if (body.length > 1000) return new Response("Too large", { status: 413, headers: cors });

    // مفتاح كاش حسب محتوى الطلب
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(body)))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    const cacheKey = new Request("https://cache.local/" + hash);
    const cache = caches.default;
    let res = await cache.match(cacheKey);

    if (!res) {
      const upstream = await fetch(BINANCE, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body,
      });
      res = new Response(await upstream.text(), {
        status: upstream.status,
        headers: { "Content-Type": "application/json", "Cache-Control": "max-age=10" },
      });
      if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    const out = new Response(res.body, res);
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  },
};
