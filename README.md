# kanba.pw ✅

موقع تداول متعدد الصفحات مبني على **Cloudflare Pages** — يجمع بين صفحة شخصية، أدوات تحليل on-chain، وحاسبات للتداول.

🌐 **[kanba.pw](https://kanba.pw)**

---

## الصفحات

| الصفحة | المسار | الوصف |
|--------|--------|-------|
| الصفحة الرئيسية | `/` | صفحة شخصية — روابط التواصل الاجتماعي وخيار التبرع |
| HLsee Analyzer | `/HLsee` | تحليل محافظ Hyperliquid — PnL، صفقات، تقويم |
| حاسبة مركبة | `/scc` | حاسبة الفائدة المركبة مع رسم بياني تفاعلي |
| حاسبة مخاطر | `/ccr` | حاسبة إدارة رأس المال والمخاطر |
| فيديوهات | `/videos` | أرشيف المحتوى التعليمي |
| Yaser | `/yaser` | تقرير أداء محفظة Yaser |
| Younis | `/younis` | تقرير أداء محفظة Younis |

---

## HLsee — محلل محافظ Hyperliquid

أبرز ما يتضمنه:

- **Portfolio Overview** — إجمالي المحفظة، رصيد Perp، Spot، Unrealized PnL
- **PnL Calendar** — تقويم شهري يعرض الأرباح والخسائر يوماً بيوم
- **Open Positions** — جدول المراكز المفتوحة مع Entry/Mark/Liquidation/ROE
- **Trade History** — سجل كامل للصفقات مع pagination زمني (تغطية 5 سنوات)
- **Transactions** — إيداعات وسحوبات Bridge مع تبويب All / In / Out / Internal
- **Market Ticker** — شريط أسعار لحظي في أعلى الصفحة
- **Alias Support** — البحث بأسماء مختصرة بدلاً من العناوين الكاملة

**التحديث:** كل 30 ثانية تلقائياً.

---

## هيكل المشروع

```
kanba.pw/
│
├── index.html          ← الصفحة الشخصية
├── HLsee.html          ← محلل Hyperliquid
├── scc.html            ← حاسبة الفائدة المركبة
├── ccr.html            ← حاسبة المخاطر
├── videos.html         ← صفحة الفيديوهات
├── yaser.html          ← تقرير Yaser
├── younis.html         ← تقرير Younis
│
├── css/
│   ├── styles.css      ← أنماط مشتركة (footer, nav, base)
│   ├── kanba.css       ← أنماط الصفحة الشخصية
│   └── see.css         ← أنماط HLsee
│
├── js/
│   ├── common.js       ← footer مشترك + منع FOUC
│   ├── kanba.js        ← منطق الصفحة الشخصية
│   ├── see.js          ← منطق HLsee (API calls, rendering)
│   └── full.js         ← مشترك عام
│
└── images/
    ├── 0xKanba.png
    └── 0xbtc.png
```

---

## التقنيات

| التقنية | الاستخدام |
|---------|-----------|
| **Cloudflare Pages** | استضافة ونشر تلقائي من GitHub |
| **Hyperliquid Public API** | بيانات المحافظ والأسعار |
| **Chart.js** | الرسوم البيانية |
| **Vanilla JS** | لا frameworks — أداء وسرعة |
| **CSS Variables** | ثيم داكن موحد عبر الصفحات |
| **Google Fonts — Geist** | خط HLsee |

---

## النشر

المشروع منشور عبر **Cloudflare Pages** مربوط بـ `kanba.pw` عبر Unstoppable Domains → Cloudflare DNS.

أي `push` إلى `master` يُطلق نشراً تلقائياً فورياً.

---

## Hyperliquid Endpoints المستخدمة

```
POST https://api.hyperliquid.xyz/info

clearinghouseState       ← الأرصدة والمراكز
userFillsByTime          ← سجل الصفقات (pagination زمني)
userNonFundingLedgerUpdates ← الإيداعات والسحوبات
portfolio                ← PnL التاريخي اليومي
userFunding              ← مدفوعات التمويل
allMids                  ← أسعار السوق اللحظية
```

---

## التواصل

| القناة | الرابط |
|--------|--------|
| Telegram | [@Kanba_trader](https://t.me/Kanba_trader) |
| X (Twitter) | [@Kanba_trader](https://x.com/intent/user?screen_name=Kanba_trader) |
| GitHub | [@0xKanba](https://github.com/0xKanba) |
| Email | Kanba_trader@proton.me |

---

<div align="center">
  <sub>Built by <a href="https://kanba.pw">0xKanba</a> · Powered by Cloudflare Pages</sub>
</div>
