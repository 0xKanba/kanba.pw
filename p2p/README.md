# kanba.pw/p2p — أسعار Binance P2P مباشرة

## الملفات
| الملف | أين يوضع | الوظيفة |
|---|---|---|
| index.html | GitHub `/p2p/` | هيكل الصفحة |
| style.css | GitHub `/p2p/` | الشكل والألوان (المتغيرات في أعلى الملف) |
| config.js | GitHub `/p2p/` | الإعدادات: رابط الوسيط، العملة، عدد الأسعار، مدة التحديث |
| app.js | GitHub `/p2p/` | الجلب والترتيب والرسم والتحديث التلقائي (مشروح بالتعليقات) |
| worker.js | Cloudflare فقط | وسيط لأن Binance تمنع المتصفح من قراءة بياناتها مباشرة (CORS) |

## الخطوة 1: نشر الوسيط (مرة واحدة، مجاني)
1. ادخل https://dash.cloudflare.com ← Workers & Pages ← Create ← Create Worker.
2. سمّه `p2p-proxy` ← Deploy ← Edit code.
3. احذف الكود الموجود والصق محتوى `worker.js` ← Deploy.
4. انسخ الرابط مثل `https://p2p-proxy.xxxx.workers.dev`.

## الخطوة 2: الإعداد
افتح `config.js` وضع الرابط في `PROXY_URL`.

## الخطوة 3: الرفع
ارفع الملفات الأربعة (بدون worker.js) إلى مجلد `p2p/` في مستودعك، ثم افتح `https://kanba.pw/p2p/`.

## التجربة محلياً
```
cd p2p && python -m http.server 8000
```
ثم افتح http://localhost:8000 (مسموح في worker.js).

## التحديث
Binance P2P لا توفر WebSocket للإعلانات، لذا الصفحة تحدّث كل 15 ثانية، وترسم من جديد فقط عند وجود تغيير وتومض البطاقة التي تغيّر سعرها، وتحدّث فوراً عند الرجوع للتبويب، وفيها زر تحديث.
