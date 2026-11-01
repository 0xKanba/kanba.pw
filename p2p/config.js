/*
 * config.js — الإعدادات الوحيدة التي تحتاج تعديلها.
 *
 * PROXY_URL: رابط Cloudflare Worker بعد نشر ملف worker.js (انظر README.md).
 *   لماذا؟ Binance لا تسمح للمتصفح بقراءة بياناتها من موقع آخر (CORS)،
 *   لذلك يمر الطلب عبر هذا الوسيط المجاني الصغير.
 */
window.P2P_CONFIG = {
  PROXY_URL: "https://p2p-proxy.YOUR-NAME.workers.dev",
  FIAT: "IQD",
  ASSET: "USDT",
  TOP_N: 5,              // عدد الأسعار المعروضة
  REFRESH_SECONDS: 15,   // التحديث التلقائي (لا تجعله أقل من 10)
};
