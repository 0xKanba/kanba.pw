/* ═══════════════════════════════════════════════════════════════
   HL Trade · chart.js v3.0
   ✅ Lightweight Charts v4 — Candlestick بدون Volume
   ✅ touch-action:none — pinch يقتصر على الرسم فقط
   ✅ Fullscreen عند الفتح
   ✅ ساعة عربية +3 في رأس الرسم
   ✅ أزرار شراء/بيع مدمجة + تأكيد
   ✅ خطوط Entry · TP · SL
   ✅ WebSocket لحظي
═══════════════════════════════════════════════════════════════ */

const ChartModule = (function () {

  const HL_API = 'https://api.hyperliquid.xyz';
  const HL_WS  = 'wss://api.hyperliquid.xyz/ws';

  const RANGES = {
    '1m':  4   * 3600000,
    '5m':  20  * 3600000,
    '15m': 60  * 3600000,
    '1h':  240 * 3600000,
    '4h':  1440* 3600000,
    '1d':  9600* 3600000,
  };

  let _chart        = null;
  let _candleSeries = null;
  let _entryLines   = [];
  let _tpLine       = null;
  let _slLine       = null;
  let _ws           = null;
  let _wsTimer      = null;
  let _visible      = false;
  let _sym          = 'CL';
  let _interval     = '1h';
  let _resizeObs    = null;
  let _lastClose    = 0;
  let _clockTimer   = null;
  let _gestureBlocked = false;

  /* ════════════════════════════════
     CSS (injection once)
  ════════════════════════════════ */
  (function injectCSS() {
    if (document.getElementById('_chartCSS')) return;
    const s = document.createElement('style');
    s.id = '_chartCSS';
    s.textContent = `
/* ── شاشة الرسم ── */
.chart-screen {
  position: fixed; inset: 0; z-index: 50;
  display: flex; flex-direction: column;
  background: var(--bg-app);
  /* منع تكبير المتصفح بالكامل داخل الشاشة */
  touch-action: pan-x pan-y;
}
.chart-screen.hidden { display: none !important; }

/* ── شريط العنوان ── */
.chart-nav {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  direction: rtl;
}
.chart-back {
  color: var(--ac); font-size: 12px; font-weight: 700;
  padding: 5px 12px; border-radius: 999px;
  border: 1.5px solid var(--ac-dim);
  background: var(--ac-dim); white-space: nowrap;
  font-family: 'Cairo', sans-serif;
}
.chart-back:active { opacity: .7; }

.chart-header-info {
  flex: 1; display: flex; align-items: center; gap: 6px; overflow: hidden;
}
#chartAssetIcon  { font-size: 17px; line-height: 1; }
.chart-asset-name{ font-size: 13px; font-weight: 900; }
.chart-cur-price {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 15px; font-weight: 700; color: var(--text-primary);
}
.chart-ws-dot { font-size: 13px; flex-shrink: 0; }

/* ── الساعة ── */
.chart-clock-wrap {
  display: flex; flex-direction: column; align-items: center;
  position: absolute; left: 50%; transform: translateX(-50%);
  pointer-events: none; top: 8px;
}
.chart-clock-time {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 13px; font-weight: 700;
  color: var(--text-primary); white-space: nowrap;
}
.chart-clock-date {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px; color: var(--text-muted); white-space: nowrap; letter-spacing: .5px;
}

/* ── أزرار الفترات ── */
.chart-intervals {
  display: flex; gap: 5px; padding: 6px 10px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.iv-btn {
  flex: 1; padding: 6px 4px; border-radius: 999px;
  border: 1.5px solid var(--border);
  background: var(--bg-elev);
  color: var(--text-muted); font-size: 11px; font-weight: 700;
  font-family: 'IBM Plex Mono', monospace;
  text-align: center; transition: all .15s; cursor: pointer;
}
.iv-btn:active { transform: scale(.88); }
.iv-btn.active {
  border-color: var(--ac); background: var(--ac-dim); color: var(--ac);
}

/* ── Trade Bar ── */
.chart-trade-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0; direction: rtl;
}
.cbt-btn {
  flex: 1; padding: 8px 4px; border-radius: 999px;
  border: none; font-family: 'Cairo', sans-serif;
  font-size: 13px; font-weight: 900; cursor: pointer;
  color: #fff; min-height: 44px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
  transition: filter .14s, transform .1s;
}
.cbt-btn:active { transform: scale(.93); }
.cbt-buy  { background: linear-gradient(150deg,#2da44e,#1a7f37); box-shadow: 0 3px 10px rgba(45,164,78,.3); }
.cbt-sell { background: linear-gradient(150deg,#e5534b,#a0281e); box-shadow: 0 3px 10px rgba(229,83,75,.3); }
.cbt-btn:hover { filter: brightness(1.1); }
.cbt-dir { font-size: 14px; line-height: 1; }
.cbt-px  { font-family: 'IBM Plex Mono', monospace; font-size: 9px; opacity: .75; }

/* qty */
.cbt-mid {
  display: flex; flex-direction: column; align-items: center; gap: 3px; flex-shrink: 0;
}
.cbt-qty-label { font-size: 8px; color: var(--text-muted); font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
.cbt-qty-row   { display: flex; align-items: center; gap: 3px; }
.cbt-qty-input {
  width: 64px; font-family: 'IBM Plex Mono', monospace;
  font-size: 14px; font-weight: 700; text-align: center; direction: ltr;
  background: var(--bg-input); border: 2px solid var(--border-strong);
  border-radius: 999px; padding: 5px 6px; color: var(--text-primary);
  outline: none; transition: border-color .15s;
}
.cbt-qty-input:focus { border-color: var(--ac); }
.cbt-qty-unit { font-size: 8px; color: var(--text-secondary); font-weight: 700; }
.cbt-presets  { display: flex; gap: 3px; }
.cbt-preset {
  font-family: 'IBM Plex Mono', monospace; font-size: 9px; font-weight: 700;
  padding: 3px 6px; border-radius: 999px;
  border: 1.5px solid var(--border); background: var(--bg-elev);
  color: var(--text-muted); cursor: pointer; transition: all .12s;
}
.cbt-preset.active, .cbt-preset:hover {
  border-color: var(--ac); color: var(--ac); background: var(--ac-dim);
}

/* ── Wrap/Inner ── */
.chart-wrap {
  position: relative; flex: 1; min-height: 0;
  display: flex; flex-direction: column;
}
/* ★ هنا جوهر الإصلاح — يمنع pinch من التصاعد للمتصفح */
.chart-inner {
  flex: 1; min-height: 0; width: 100%;
  touch-action: none;          /* يعطي الرسم كل اللمس */
  -webkit-user-select: none;
  user-select: none;
  overflow: hidden;
}

/* ── Legend ── */
.chart-legend {
  padding: 4px 12px; background: var(--bg-card);
  border-top: 1px solid var(--border);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px; color: var(--text-muted);
  display: flex; gap: 10px; flex-wrap: wrap;
  flex-shrink: 0; min-height: 22px; align-items: center;
}

/* ── Confirmation overlay ── */
.cf-overlay {
  position: absolute; inset: 0; z-index: 95;
  display: flex; align-items: flex-end; justify-content: center;
  background: rgba(0,0,0,.6);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  animation: cfFi .17s ease; direction: rtl;
}
@keyframes cfFi { from{opacity:0} to{opacity:1} }
.cf-card {
  background: var(--bg-card); border-top: 2px solid var(--border-strong);
  border-radius: 24px 24px 0 0; width: 100%; max-width: 480px;
  padding: 16px 16px 22px;
  box-shadow: 0 -10px 36px rgba(0,0,0,.4);
  animation: cfSu .23s cubic-bezier(.4,0,.2,1);
}
@keyframes cfSu { from{transform:translateY(100%)} to{transform:none} }
.cf-handle { width:34px;height:4px;background:var(--border-strong);border-radius:999px;margin:0 auto 13px; }
.cf-title  { font-size:17px;font-weight:900;margin-bottom:3px; }
.cf-sub    { font-size:11px;color:var(--text-secondary);margin-bottom:12px; }
.cf-rows   {
  background:var(--bg-input);border-radius:16px;
  padding:10px 12px;display:flex;flex-direction:column;gap:5px;margin-bottom:12px;
}
.cf-row { display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border); }
.cf-row:last-child { border:none; }
.cf-key { font-size:11px;color:var(--text-secondary);font-weight:600; }
.cf-val { font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:700; }
.cf-val.g { color:#2da44e; }
.cf-val.r { color:#e5534b; }
.cf-val.w { color:var(--warn); }
.cf-btns { display:grid;grid-template-columns:1fr 1fr;gap:8px; }
.cf-cancel {
  padding:12px;border-radius:999px;
  border:2px solid var(--border-strong);background:var(--bg-elev);
  color:var(--text-secondary);font-size:13px;font-weight:700;cursor:pointer;
  font-family:'Cairo',sans-serif;
}
.cf-cancel:active { transform:scale(.96); }
.cf-exec {
  padding:12px;border-radius:999px;border:none;color:#fff;
  font-size:13px;font-weight:900;cursor:pointer;
  font-family:'Cairo',sans-serif;
  display:flex;align-items:center;justify-content:center;gap:6px;
  transition:filter .14s;
}
.cf-exec.g { background:linear-gradient(135deg,#2da44e,#1a7f37);box-shadow:0 3px 12px rgba(45,164,78,.3); }
.cf-exec.r { background:linear-gradient(135deg,#e5534b,#a0281e);box-shadow:0 3px 12px rgba(229,83,75,.3); }
.cf-exec:active { filter:brightness(.88); }
.cf-exec:disabled { opacity:.5;pointer-events:none; }
.cf-spin { width:15px;height:15px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:cfRot .7s linear infinite; }
@keyframes cfRot { to{transform:rotate(360deg)} }
`;
    document.head.appendChild(s);
  })();

  /* ════════════════════════════════
     مساعدات
  ════════════════════════════════ */
  function coin(s) { return `xyz:${s}`; }
  function ai(s)   { return (typeof ASSETS!=='undefined'&&ASSETS[s])||{pxDp:2,szDp:2,name:s,icon:'📊',unit:'',lev:10,presets:[1],idx:0,cross:true}; }

  function setStatus(t) {
    const e = document.getElementById('chartWsDot');
    if (e) e.textContent = t;
  }
  function setPrice(p) {
    _lastClose = +p;
    const e = document.getElementById('chartCurPrice');
    if (e && p) e.textContent = '$' + (+p).toFixed(ai(_sym).pxDp);
    updateBtnPrices();
  }
  function isDark() { return window.matchMedia('(prefers-color-scheme:dark)').matches; }
  function fp(n,s){ return (+n).toFixed(ai(s||_sym).pxDp); }
  function fs(n,s){ return (+n).toFixed(ai(s||_sym).szDp); }

  /* ════════════════════════════════
     ساعة عربية +3
  ════════════════════════════════ */
  function startClock() {
    stopClock();
    function tick() {
      const now  = new Date(Date.now() + 3*3600*1000); // UTC+3
      const hh   = String(now.getUTCHours()).padStart(2,'0');
      const mm   = String(now.getUTCMinutes()).padStart(2,'0');
      const ss   = String(now.getUTCSeconds()).padStart(2,'0');
      const ampm = now.getUTCHours()<12 ? 'ص' : 'م';
      const dd   = String(now.getUTCDate()).padStart(2,'0');
      const mo   = String(now.getUTCMonth()+1).padStart(2,'0');
      const yr   = now.getUTCFullYear();
      const tEl  = document.getElementById('chartClockTime');
      const dEl  = document.getElementById('chartClockDate');
      if (tEl) tEl.textContent = `${hh}:${mm}:${ss} ${ampm}`;
      if (dEl) dEl.textContent = `${dd}-${mo}-${yr} · UTC+3`;
    }
    tick();
    _clockTimer = setInterval(tick, 1000);
  }
  function stopClock() {
    clearInterval(_clockTimer); _clockTimer = null;
  }

  /* ════════════════════════════════
     منع gesture events المتصفح
  ════════════════════════════════ */
  function blockGestures(el) {
    if (_gestureBlocked) return;
    // Safari
    el.addEventListener('gesturestart',  e => e.preventDefault(), {passive:false});
    el.addEventListener('gesturechange', e => e.preventDefault(), {passive:false});
    el.addEventListener('gestureend',    e => e.preventDefault(), {passive:false});
    // Chrome / Firefox — منع الـ wheel مع ctrl (pinch-to-zoom)
    el.addEventListener('wheel', e => {
      if (e.ctrlKey) e.preventDefault();
    }, {passive:false});
    _gestureBlocked = true;
  }

  /* ════════════════════════════════
     Fullscreen
  ════════════════════════════════ */
  function enterFullscreen(el) {
    try {
      const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (fn) fn.call(el);
    } catch {}
  }
  function exitFullscreen() {
    try {
      const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      if (fn) fn.call(document);
    } catch {}
  }

  /* ════════════════════════════════
     Trade Bar
  ════════════════════════════════ */
  function buildTradeBar(wrap) {
    document.getElementById('_cbtBar')?.remove();
    const a  = ai(_sym);
    const ps = (a.presets||[]).slice(0,3);
    const bar = document.createElement('div');
    bar.id = '_cbtBar';
    bar.className = 'chart-trade-bar';
    bar.innerHTML = `
      <button class="cbt-btn cbt-sell" id="cbtSell">
        <span class="cbt-dir">▼ بيع</span>
        <span class="cbt-px" id="cbtSellPx">—</span>
      </button>
      <div class="cbt-mid">
        <span class="cbt-qty-label">الكمية</span>
        <div class="cbt-qty-row">
          <input type="number" class="cbt-qty-input" id="cbtQty"
            value="${a.presets?.[0]||1}" min="0" step="any" inputmode="decimal">
          <span class="cbt-qty-unit">${a.unit}</span>
        </div>
        <div class="cbt-presets">
          ${ps.map((v,i)=>`<button class="cbt-preset${i===0?' active':''}" data-pv="${v}">${v}</button>`).join('')}
        </div>
      </div>
      <button class="cbt-btn cbt-buy" id="cbtBuy">
        <span class="cbt-dir">▲ شراء</span>
        <span class="cbt-px" id="cbtBuyPx">—</span>
      </button>`;

    wrap.insertAdjacentElement('afterbegin', bar);
    bar.querySelectorAll('.cbt-preset').forEach(b => {
      b.onclick = () => {
        bar.querySelectorAll('.cbt-preset').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        document.getElementById('cbtQty').value = b.dataset.pv;
      };
    });
    document.getElementById('cbtQty').oninput = () =>
      bar.querySelectorAll('.cbt-preset').forEach(x=>x.classList.remove('active'));
    document.getElementById('cbtBuy').onclick  = () => showConfirm(true);
    document.getElementById('cbtSell').onclick = () => showConfirm(false);
    updateBtnPrices();
  }

  function updateBtnPrices() {
    if (!_lastClose) return;
    const a = ai(_sym);
    const bp = document.getElementById('cbtBuyPx');
    const sp = document.getElementById('cbtSellPx');
    if (bp) bp.textContent = '$' + (_lastClose * 1.0005).toFixed(a.pxDp);
    if (sp) sp.textContent = '$' + (_lastClose * 0.9995).toFixed(a.pxDp);
  }

  /* ════════════════════════════════
     Confirmation
  ════════════════════════════════ */
  function showConfirm(isBuy) {
    if (typeof State==='undefined'||!State.wallet)
      return typeof toast!=='undefined' ? toast('سجّل الدخول أولاً','err') : null;
    const qty = parseFloat(document.getElementById('cbtQty')?.value||0);
    if (!qty||qty<=0) return typeof toast!=='undefined' ? toast('أدخل الكمية','err') : null;
    const a   = ai(_sym);
    const mid = _lastClose || (typeof State!=='undefined' ? State.prices[_sym]?.mid : 0);
    if (!mid) return typeof toast!=='undefined' ? toast('لا يوجد سعر','err') : null;
    const usd = (mid*qty).toFixed(2);
    const mgn = (mid*qty/a.lev).toFixed(2);
    const liq = isBuy ? fp(mid*(1-1/a.lev)) : fp(mid*(1+1/a.lev));
    hideConfirm();
    const wrap = document.getElementById('chartWrap');
    if (!wrap) return;
    const ov = document.createElement('div');
    ov.id = '_cfOv'; ov.className = 'cf-overlay';
    ov.innerHTML = `
      <div class="cf-card">
        <div class="cf-handle"></div>
        <div class="cf-title" style="color:${isBuy?'#2da44e':'#e5534b'}">
          ${a.icon} ${isBuy?'شراء ▲':'بيع ▼'} — ${a.name}
        </div>
        <div class="cf-sub">رافعة ${a.lev}x · الرجاء التأكيد</div>
        <div class="cf-rows">
          <div class="cf-row"><span class="cf-key">الكمية</span><span class="cf-val">${fs(qty)} ${a.unit}</span></div>
          <div class="cf-row"><span class="cf-key">السعر</span><span class="cf-val">${fp(mid)} $</span></div>
          <div class="cf-row"><span class="cf-key">القيمة</span><span class="cf-val">≈ $${usd}</span></div>
          <div class="cf-row"><span class="cf-key">الهامش</span><span class="cf-val w">≈ $${mgn}</span></div>
          <div class="cf-row"><span class="cf-key">التصفية</span><span class="cf-val ${isBuy?'r':'g'}">≈ ${liq} $</span></div>
        </div>
        <div class="cf-btns">
          <button class="cf-cancel" id="_cfCancel">إلغاء ✕</button>
          <button class="cf-exec ${isBuy?'g':'r'}" id="_cfExec">${isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'}</button>
        </div>
      </div>`;
    wrap.appendChild(ov);
    ov.onclick = e => { if (e.target===ov) hideConfirm(); };
    document.getElementById('_cfCancel').onclick = hideConfirm;
    document.getElementById('_cfExec').onclick   = () => execTrade(isBuy, qty);
  }

  function hideConfirm() {
    document.getElementById('_cfOv')?.remove();
  }

  async function execTrade(isBuy, qty) {
    if (typeof State==='undefined'||!State.wallet) return;
    const btn = document.getElementById('_cfExec');
    if (btn) { btn.disabled=true; btn.innerHTML='<span class="cf-spin"></span>'; }
    const a   = ai(_sym);
    const mid = _lastClose || (typeof State!=='undefined' ? State.prices[_sym]?.mid : 0);
    if (!mid) { hideConfirm(); return; }
    try {
      try { await hlExchange({type:'updateLeverage',asset:a.idx,isCross:a.cross,leverage:a.lev}); } catch{}
      await hlExchange({
        type:'order',
        orders:[{a:a.idx,b:isBuy,p:wire(mid*(isBuy?1.02:0.98),a.pxDp),s:wire(qty,a.szDp),r:false,t:{limit:{tif:'Ioc'}}}],
        grouping:'na'
      });
      hideConfirm();
      if(typeof toast!=='undefined') toast(`✅ ${a.icon} ${isBuy?'شراء':'بيع'} ${fs(qty)} ${a.unit}`,'ok',4000);
      if(typeof pollAccount!=='undefined') setTimeout(pollAccount,2000);
    } catch(e) {
      if(typeof toast!=='undefined') toast((typeof tradeErr!=='undefined'?tradeErr(e.message):'❌ '+e.message.slice(0,100)),'err',5000);
      if(btn){ btn.disabled=false; btn.innerHTML=isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'; }
    }
  }

  /* ════════════════════════════════
     بناء الرسم
  ════════════════════════════════ */
  function buildChart(container) {
    if (_chart) { try{_chart.remove();}catch{} _chart=null; _candleSeries=null; }
    if (_resizeObs) { try{_resizeObs.disconnect();}catch{} }

    const dark = isDark();
    const BG   = dark ? '#1a1916' : '#f5f0eb';
    const TXT  = dark ? '#9b9287' : '#6b6460';
    const GRID = dark ? '#252320' : '#ebe6e0';
    const BDR  = dark ? '#3d3a34' : '#c0b9b1';

    _chart = LightweightCharts.createChart(container, {
      width:  container.clientWidth,
      height: container.clientHeight,
      layout: { background:{type:'solid',color:BG}, textColor:TXT, fontSize:11, fontFamily:"'IBM Plex Mono',monospace" },
      grid: {
        vertLines: { color:GRID, style:LightweightCharts.LineStyle.Dotted },
        horzLines: { color:GRID, style:LightweightCharts.LineStyle.Dotted },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { width:1, color:dark?'#5a534a':'#b0a898', style:LightweightCharts.LineStyle.Dashed, labelBackgroundColor:dark?'#3d3a34':'#c0b9b1' },
        horzLine: { width:1, color:dark?'#5a534a':'#b0a898', style:LightweightCharts.LineStyle.Dashed, labelBackgroundColor:dark?'#3d3a34':'#c0b9b1' },
      },
      rightPriceScale: {
        borderColor: BDR,
        scaleMargins: { top:0.06, bottom:0.06 },
        minimumWidth: 72,
      },
      timeScale: {
        borderColor: BDR,
        timeVisible: true, secondsVisible: false,
        rightOffset: 8, barSpacing: 8,
        lockVisibleTimeRangeOnResize: true,
      },
      // ★ pinch يعمل داخل الرسم بسبب touch-action:none على container
      handleScroll: { mouseWheel:true, pressedMouseMove:true, horzTouchDrag:true, vertTouchDrag:false },
      handleScale:  { mouseWheel:true, pinch:true, axisPressedMouseMove:{time:true,price:false} },
      localization: {
        locale: 'en-US',
        priceFormatter: p => p.toLocaleString('en-US',{minimumFractionDigits:ai(_sym).pxDp,maximumFractionDigits:ai(_sym).pxDp}),
      },
      attributionLogo: false,
    });

    _candleSeries = _chart.addCandlestickSeries({
      upColor:'#2da44e', downColor:'#e5534b',
      borderUpColor:'#2da44e', borderDownColor:'#e5534b',
      wickUpColor:'#2da44e', wickDownColor:'#e5534b',
    });

    _chart.subscribeCrosshairMove(param => {
      const el = document.getElementById('_chartLegend');
      if (!el) return;
      if (!param.time||!param.seriesData?.size) { el.innerHTML=''; return; }
      const bar = param.seriesData.get(_candleSeries);
      if (!bar) return;
      const dp = ai(_sym).pxDp;
      const cl = bar.close>=bar.open?'#2da44e':'#e5534b';
      const chg= (((bar.close-bar.open)/bar.open)*100).toFixed(2);
      el.innerHTML =
        `<span style="color:${cl};font-weight:900">O&nbsp;${bar.open.toFixed(dp)}</span>` +
        `<span style="color:${cl}">H&nbsp;${bar.high.toFixed(dp)}</span>` +
        `<span style="color:${cl}">L&nbsp;${bar.low.toFixed(dp)}</span>` +
        `<span style="color:${cl}">C&nbsp;${bar.close.toFixed(dp)}</span>` +
        `<span style="color:${cl}">${chg>0?'+':''}${chg}%</span>`;
    });

    _resizeObs = new ResizeObserver(() => {
      if (_chart && container)
        _chart.applyOptions({ width:container.clientWidth, height:container.clientHeight });
    });
    _resizeObs.observe(container);
  }

  /* ════════════════════════════════
     جلب الشموع
  ════════════════════════════════ */
  async function fetchCandles(sym, interval) {
    const now=Date.now(), start=now-(RANGES[interval]||RANGES['1h']);
    try {
      const r = await fetch(HL_API+'/info',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({type:'candleSnapshot',req:{coin:coin(sym),interval,startTime:start,endTime:now}})
      });
      const raw=await r.json();
      if(!Array.isArray(raw)||!raw.length) return [];
      return raw.map(c=>({time:Math.floor(c.t/1000),open:+c.o,high:+c.h,low:+c.l,close:+c.c}))
                .sort((a,b)=>a.time-b.time);
    } catch(e){ console.warn('[Chart]',e.message); return []; }
  }

  /* ════════════════════════════════
     خطوط الصفقات
  ════════════════════════════════ */
  function clearLines() {
    _entryLines.forEach(l=>{ try{_candleSeries.removePriceLine(l);}catch{} });
    _entryLines=[];
    if(_tpLine){try{_candleSeries.removePriceLine(_tpLine);}catch{} _tpLine=null;}
    if(_slLine){try{_candleSeries.removePriceLine(_slLine);}catch{} _slLine=null;}
  }
  function drawLines() {
    if(!_candleSeries||typeof State==='undefined') return;
    clearLines();
    for(const p of (State.positions||[])){
      const c=p.position.coin.includes(':')?p.position.coin.split(':')[1]:p.position.coin;
      if(c!==_sym) continue;
      const pos=p.position, szi=+pos.szi, pnl=+(pos.unrealizedPnl||0), entry=+(pos.entryPx||0);
      if(entry>0){
        const sign=pnl>=0?'+':'';
        _entryLines.push(_candleSeries.createPriceLine({
          price:entry, lineWidth:2, lineStyle:2,
          color:szi>0?'#2da44e':'#e5534b', axisLabelVisible:true,
          title:`${szi>0?'▲':'▼'} Entry  ${sign}$${Math.abs(pnl).toFixed(2)}`,
        }));
      }
      const tpsl=p.tpsl||{};
      if(tpsl.tp) _tpLine=_candleSeries.createPriceLine({price:tpsl.tp,lineWidth:1,lineStyle:3,color:'#22c58b',axisLabelVisible:true,title:'TP'});
      if(tpsl.sl) _slLine=_candleSeries.createPriceLine({price:tpsl.sl,lineWidth:1,lineStyle:3,color:'#e8804a',axisLabelVisible:true,title:'SL'});
      break;
    }
  }

  /* ════════════════════════════════
     WebSocket
  ════════════════════════════════ */
  function wsConnect() {
    wsClose(); clearTimeout(_wsTimer);
    try {
      _ws=new WebSocket(HL_WS);
      _ws.onopen=()=>{
        _ws.send(JSON.stringify({method:'subscribe',subscription:{type:'candle',coin:coin(_sym),interval:_interval}}));
        setStatus('🟢');
      };
      _ws.onmessage=e=>{
        try{
          const msg=JSON.parse(e.data);
          if(msg.channel!=='candle'||!msg.data) return;
          const c=msg.data;
          if(!_candleSeries) return;
          const bar={time:Math.floor(c.t/1000),open:+c.o,high:+c.h,low:+c.l,close:+c.c};
          _candleSeries.update(bar);
          setPrice(bar.close);
          drawLines();
        }catch{}
      };
      _ws.onerror=()=>setStatus('🔴');
      _ws.onclose=()=>{ setStatus('🔴'); if(_visible) _wsTimer=setTimeout(wsConnect,4000); };
    }catch(e){console.warn('[Chart WS]',e.message);}
  }
  function wsClose(){
    if(_ws){try{_ws.close();}catch{} _ws=null;}
    clearTimeout(_wsTimer);
  }

  /* ════════════════════════════════
     تحميل
  ════════════════════════════════ */
  async function load(sym,interval){
    if(!_chart||!_candleSeries) return;
    setStatus('⏳');
    const px=document.getElementById('chartCurPrice');
    if(px) px.textContent='—';
    const candles=await fetchCandles(sym,interval);
    if(!candles.length){setStatus('❌');return;}
    _candleSeries.setData(candles);
    _chart.timeScale().fitContent();
    _lastClose=candles[candles.length-1].close;
    setPrice(_lastClose);
    drawLines();
    setStatus('🟡');
    wsConnect();
  }

  /* ════════════════════════════════
     بناء الشاشة (مرة واحدة)
  ════════════════════════════════ */
  function ensureScreen() {
    const screen=document.getElementById('chartScreen');
    if(!screen||document.getElementById('chartWrap')) return;

    screen.innerHTML=`
      <!-- Nav -->
      <div class="chart-nav" style="position:relative;">
        <button class="chart-back" id="_chartBack">← رجوع</button>
        <div class="chart-header-info">
          <span id="chartAssetIcon">🛢</span>
          <span id="chartAssetName" class="chart-asset-name">نفط خام</span>
          <span id="chartCurPrice" class="chart-cur-price">—</span>
        </div>
        <!-- الساعة — وسط العنوان -->
        <div class="chart-clock-wrap">
          <span class="chart-clock-time" id="chartClockTime">—</span>
          <span class="chart-clock-date" id="chartClockDate">—</span>
        </div>
        <div class="chart-ws-dot" id="chartWsDot">⏳</div>
      </div>
      <!-- فترات -->
      <div class="chart-intervals">
        <button class="iv-btn" data-iv="1m">1m</button>
        <button class="iv-btn" data-iv="5m">5m</button>
        <button class="iv-btn" data-iv="15m">15m</button>
        <button class="iv-btn active" data-iv="1h">1H</button>
        <button class="iv-btn" data-iv="4h">4H</button>
        <button class="iv-btn" data-iv="1d">D</button>
      </div>
      <!-- wrap -->
      <div class="chart-wrap" id="chartWrap">
        <!-- trade bar يُحقن هنا -->
        <div class="chart-inner" id="chartInner"></div>
        <div class="chart-legend" id="_chartLegend"></div>
      </div>`;

    document.getElementById('_chartBack').onclick = () => ChartModule.close();
    document.querySelectorAll('.iv-btn').forEach(b =>
      b.onclick = () => ChartModule.switchInterval(b.dataset.iv)
    );
  }

  function setHeader(sym) {
    const a=ai(sym);
    const icon=document.getElementById('chartAssetIcon');
    const name=document.getElementById('chartAssetName');
    if(icon) icon.textContent=a.icon;
    if(name) name.textContent=a.name;
  }

  /* ════════════════════════════════
     واجهة عامة
  ════════════════════════════════ */
  function open(sym) {
    _sym=sym||(typeof State!=='undefined'?State.asset:'CL');
    _visible=true;

    ensureScreen();
    const screen=document.getElementById('chartScreen');
    screen?.classList.remove('hidden');
    setHeader(_sym);
    document.querySelectorAll('.iv-btn').forEach(b=>b.classList.toggle('active',b.dataset.iv===_interval));

    // Fullscreen
    if (screen) enterFullscreen(screen);

    // Trade bar
    const wrap=document.getElementById('chartWrap');
    if(wrap) buildTradeBar(wrap);

    // الرسم
    const inner=document.getElementById('chartInner');
    if(inner){
      blockGestures(inner);
      buildChart(inner);
      load(_sym,_interval);
    }

    // ساعة
    startClock();
  }

  function close() {
    _visible=false;
    wsClose(); hideConfirm(); stopClock();
    exitFullscreen();
    document.getElementById('chartScreen')?.classList.add('hidden');
    const lg=document.getElementById('_chartLegend');
    if(lg) lg.innerHTML='';
  }

  function switchInterval(iv) {
    if(iv===_interval) return;
    _interval=iv;
    wsClose();
    document.querySelectorAll('.iv-btn').forEach(b=>b.classList.toggle('active',b.dataset.iv===iv));
    load(_sym,_interval);
  }

  function switchAssetChart(sym) {
    if(!_visible) return;
    _sym=sym; setHeader(sym); wsClose();
    const wrap=document.getElementById('chartWrap');
    if(wrap) buildTradeBar(wrap);
    const inner=document.getElementById('chartInner');
    if(inner){ buildChart(inner); load(_sym,_interval); }
  }

  function refreshLines() {
    if(_visible&&_candleSeries) drawLines();
  }

  return {open,close,switchInterval,switchAssetChart,refreshLines};
})();
