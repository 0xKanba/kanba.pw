/*
 * app.js — منطق صفحة أسعار P2P
 * =================================
 * كيف يعمل:
 *  1) fetchSide(side)  يطلب الإعلانات من الوسيط (worker.js) الذي يمررها إلى Binance.
 *       side="BUY"  = أنت تشتري USDT  → الأفضل = الأرخص.
 *       side="SELL" = أنت تبيع USDT   → الأفضل = الأغلى.
 *  2) parseAd(raw)     يحوّل الإعلان الخام إلى كائن بسيط.
 *       monthFinishRate و positiveRate تأتي ككسر (1 = 100%) فنضربها ×100.
 *       الحد الأعلى الحقيقي = dynamicMaxSingleTransAmount.
 *  3) refresh()        يجلب الشراء والبيع معاً كل REFRESH_SECONDS ثانية،
 *       ويرسم البطاقات من جديد فقط إذا تغيّرت البيانات (بصمة signature)،
 *       ويومض البطاقة التي تغيّر سعرها.
 *  ملاحظة: Binance P2P لا توفر WebSocket للإعلانات، لذلك نستخدم تحديثاً
 *  دورياً + زر تحديث + تحديث فوري عند العودة إلى التبويب.
 */
(() => {
  const C = window.P2P_CONFIG;
  const $ = (id) => document.getElementById(id);

  const state = { side: "BUY", merchantOnly: false, data: { BUY: [], SELL: [] }, sig: "", prev: {} };

  // ---------- 1) الجلب ----------
  async function fetchSide(side) {
    const res = await fetch(C.PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fiat: C.FIAT, asset: C.ASSET, tradeType: side,
        page: 1, rows: 20, payTypes: [], countries: [],
        publisherType: state.merchantOnly ? "merchant" : null,
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    if (json.code && json.code !== "000000") throw new Error(json.message || "Binance error");
    const ads = (json.data || [])
      .filter((x) => x.adv && x.adv.isTradable !== false)
      .map(parseAd)
      .filter((a) => a.price > 0 && a.available > 0);
    ads.sort((a, b) => (side === "BUY" ? a.price - b.price : b.price - a.price));
    return ads.slice(0, C.TOP_N);
  }

  // ---------- 2) التحويل ----------
  const num = (v) => (isFinite(+v) ? +v : 0);
  function parseAd({ adv, advertiser: u = {} }) {
    return {
      id: adv.advNo,
      price: num(adv.price),
      min: num(adv.minSingleTransAmount),
      max: num(adv.dynamicMaxSingleTransAmount || adv.maxSingleTransAmount),
      available: num(adv.tradableQuantity || adv.surplusAmount),
      payMin: num(adv.payTimeLimit),
      methods: (adv.tradeMethods || []).map((m) => m.tradeMethodName || m.identifier),
      nick: u.nickName || "—",
      merchant: u.userType === "merchant",
      orders: num(u.monthOrderCount),
      finish: num(u.monthFinishRate) * 100,
      positive: num(u.positiveRate) * 100,
      active: u.activeTimeInSecond ?? null,
    };
  }

  // ---------- 3) الرسم ----------
  const fmt = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (n) => (n >= 100 ? fmt(n) : fmt(n, 2));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function seen(sec) {
    if (sec == null || sec < 0) return "غير معروف";
    if (sec < 300) return "🟢 متصل الآن";
    if (sec < 3600) return `🟡 قبل ${Math.floor(sec / 60)} د`;
    if (sec < 86400) return `🟠 قبل ${Math.floor(sec / 3600)} س`;
    return `⚪ قبل ${Math.floor(sec / 86400)} يوم`;
  }

  function card(a, i, side) {
    const changed = state.prev[a.id] !== undefined && state.prev[a.id] !== a.price;
    return `
    <article class="card side-${side}${changed ? " flash" : ""}">
      <div class="rank">#${i + 1}</div>
      <div class="price">${fmt(a.price, 2)} <small>${C.FIAT}</small></div>
      <div><span class="nick">${esc(a.nick)}</span>
        <span class="badge ${a.merchant ? "merchant" : ""}">${a.merchant ? "✓ تاجر موثّق" : "مستخدم"}</span></div>
      <div class="meta">
        <span>المتاح: <b>${money(a.available)} ${C.ASSET}</b></span>
        <span>الحد: <b dir="ltr">${money(a.min)} – ${money(a.max)}</b> ${C.FIAT}</span>
        <span>صفقات 30 يوم: <b>${a.orders}</b></span>
        <span>إتمام: <b>${a.finish.toFixed(1)}%</b></span>
        <span>تقييم: <b>${a.positive.toFixed(1)}%</b></span>
        <span>${seen(a.active)}</span>
        <span>مهلة الدفع: <b>${a.payMin}</b> د</span>
      </div>
      <div class="pays">${a.methods.slice(0, 5).map((m) => `<span class="pay">${esc(m)}</span>`).join("")}</div>
    </article>`;
  }

  function render() {
    const { BUY, SELL } = state.data;
    $("bestBuy").textContent = BUY[0] ? fmt(BUY[0].price, 2) : "—";
    $("bestSell").textContent = SELL[0] ? fmt(SELL[0].price, 2) : "—";
    $("spread").textContent = BUY[0] && SELL[0] ? fmt(BUY[0].price - SELL[0].price, 2) : "—";
    const list = state.data[state.side];
    $("list").innerHTML = list.length
      ? list.map((a, i) => card(a, i, state.side)).join("")
      : `<div class="empty">لا توجد إعلانات حالياً</div>`;
    // نحفظ الأسعار لنعرف لاحقاً أي بطاقة تغيّرت
    state.prev = Object.fromEntries([...BUY, ...SELL].map((a) => [a.id, a.price]));
  }

  // ---------- 4) التحديث ----------
  let busy = false;
  async function refresh(force = false) {
    if (busy) return;
    busy = true;
    $("refreshBtn").disabled = true;
    try {
      const [BUY, SELL] = await Promise.all([fetchSide("BUY"), fetchSide("SELL")]);
      const sig = JSON.stringify([BUY, SELL].map((l) => l.map((a) => [a.id, a.price, a.available, a.max])));
      state.data = { BUY, SELL };
      if (force || sig !== state.sig) { render(); state.sig = sig; }
      $("updated").textContent = new Date().toLocaleTimeString("ar-IQ");
      setStatus("مباشر", "live");
    } catch (e) {
      console.error(e);
      setStatus("تعذّر الاتصال: " + e.message, "err");
    } finally {
      busy = false;
      $("refreshBtn").disabled = false;
    }
  }
  function setStatus(t, cls) { const s = $("status"); s.textContent = t; s.className = "status " + cls; }

  // ---------- 5) الأحداث ----------
  document.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
      state.side = b.dataset.side;
      render();
    })
  );
  $("merchantOnly").addEventListener("change", (e) => { state.merchantOnly = e.target.checked; refresh(true); });
  $("refreshBtn").addEventListener("click", () => refresh(true));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

  $("fiatLabel").textContent = C.FIAT;
  refresh(true);
  setInterval(() => { if (!document.hidden) refresh(); }, Math.max(10, C.REFRESH_SECONDS) * 1000);
})();
