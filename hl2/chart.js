/* ═══════════════════════════════════════════════════════════════
   HL Trade · chart.js v2.0
   ✅ Lightweight Charts v4 — Candlestick احترافي
   ✅ أزرار شراء/بيع مدمجة فوق الرسم (عربي)
   ✅ حقل الكمية بين الزرين
   ✅ تأكيد انسيابي قبل التنفيذ
   ✅ خطوط الدخول + TP + SL من State.positions
   ✅ WebSocket لحظي + إعادة اتصال تلقائية
   ✅ رسم بياني English بالكامل
═══════════════════════════════════════════════════════════════ */

const ChartModule = (function () {

  /* ── ثوابت ── */
  const HL_API = 'https://api.hyperliquid.xyz';
  const HL_WS  = 'wss://api.hyperliquid.xyz/ws';

  const RANGES = {
    '1m':  4   * 60 * 60 * 1000,
    '5m':  20  * 60 * 60 * 1000,
    '15m': 60  * 60 * 60 * 1000,
    '1h':  10  * 24 * 60 * 60 * 1000,
    '4h':  60  * 24 * 60 * 60 * 1000,
    '1d':  400 * 24 * 60 * 60 * 1000,
  };

  /* ── حالة الوحدة ── */
  let _chart       = null;
  let _candleSeries= null;
  let _volSeries   = null;   // volume histogram
  let _entryLines  = [];
  let _tpLine      = null;
  let _slLine      = null;
  let _ws          = null;
  let _wsTimer     = null;
  let _visible     = false;
  let _sym         = 'CL';
  let _interval    = '1h';
  let _resizeObs   = null;
  let _lastClose   = 0;
  let _confirmDir  = null;   // 'buy' | 'sell'

  /* ════════════════════════════════════
     CSS injection — مرة واحدة
  ════════════════════════════════════ */
  (function injectCSS() {
    if (document.getElementById('chart-module-css')) return;
    const s = document.createElement('style');
    s.id = 'chart-module-css';
    s.textContent = `
/* ── Trade bar ── */
.chart-trade-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  direction: rtl;
}
.cbt-btn {
  flex: 1;
  padding: 9px 6px;
  border-radius: 10px;
  border: none;
  font-family: 'Cairo', sans-serif;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
  transition: filter .15s, transform .1s, box-shadow .15s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  color: #fff;
  min-height: 46px;
  justify-content: center;
}
.cbt-btn:active { transform: scale(.94); }
.cbt-buy  { background: linear-gradient(150deg, #2da44e, #1a7f37); box-shadow: 0 3px 12px rgba(45,164,78,.35); }
.cbt-sell { background: linear-gradient(150deg, #e5534b, #a0281e); box-shadow: 0 3px 12px rgba(229,83,75,.35); }
.cbt-btn:hover { filter: brightness(1.1); }
.cbt-btn .cbt-dir  { font-size: 16px; line-height: 1; }
.cbt-btn .cbt-sub  { font-size: 10px; opacity: .78; font-weight: 600; }
.cbt-btn .cbt-px   { font-family: 'IBM Plex Mono', monospace; font-size: 10px; opacity: .7; }

/* qty block */
.cbt-qty-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}
.cbt-qty-label { font-size: 9px; color: var(--text-muted); font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
.cbt-qty-row { display: flex; align-items: center; gap: 4px; }
.cbt-qty-input {
  width: 72px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  direction: ltr;
  background: var(--bg-input);
  border: 2px solid var(--border-strong);
  border-radius: 8px;
  padding: 6px 6px;
  color: var(--text-primary);
  outline: none;
  transition: border-color .15s;
}
.cbt-qty-input:focus { border-color: var(--ac); }
.cbt-qty-unit { font-size: 9px; color: var(--text-secondary); font-weight: 700; }
.cbt-preset-row { display: flex; gap: 3px; }
.cbt-preset {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px; font-weight: 700;
  padding: 3px 6px; border-radius: 6px;
  border: 1.5px solid var(--border); background: var(--bg-elev);
  color: var(--text-muted); cursor: pointer; transition: all .12s;
}
.cbt-preset.active,
.cbt-preset:hover { border-color: var(--ac); color: var(--ac); background: var(--ac-dim); }

/* ── Confirmation overlay ── */
.chart-confirm-overlay {
  position: absolute;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0,0,0,.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: cfFadeIn .18s ease;
  direction: rtl;
}
@keyframes cfFadeIn { from{opacity:0} to{opacity:1} }
.chart-confirm-card {
  background: var(--bg-card);
  border-top: 2px solid var(--border-strong);
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-width: 480px;
  padding: 18px 18px 24px;
  box-shadow: 0 -10px 40px rgba(0,0,0,.4);
  animation: cfSlideUp .24s cubic-bezier(.4,0,.2,1);
}
@keyframes cfSlideUp { from{transform:translateY(100%)} to{transform:none} }
.cf-handle { width:36px;height:4px;background:var(--border-strong);border-radius:2px;margin:0 auto 14px; }
.cf-title {
  font-size: 18px; font-weight: 900;
  margin-bottom: 3px;
}
.cf-sub { font-size: 12px; color: var(--text-secondary); margin-bottom: 14px; }
.cf-rows {
  background: var(--bg-input);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex; flex-direction: column; gap: 7px;
  margin-bottom: 14px;
}
.cf-row { display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid var(--border); }
.cf-row:last-child { border:none; }
.cf-key { font-size: 12px; color: var(--text-secondary); font-weight: 600; }
.cf-val { font-family: 'IBM Plex Mono', monospace; font-size: 14px; font-weight: 700; }
.cf-val.buy  { color: #2da44e; }
.cf-val.sell { color: #e5534b; }
.cf-val.warn { color: var(--warn); }
.cf-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.cf-cancel {
  padding: 13px; border-radius: 12px;
  border: 2px solid var(--border-strong);
  background: var(--bg-elev); color: var(--text-secondary);
  font-size: 14px; font-weight: 700; cursor: pointer;
  font-family: 'Cairo', sans-serif;
}
.cf-cancel:active { transform: scale(.96); }
.cf-execute {
  padding: 13px; border-radius: 12px;
  border: none; color: #fff;
  font-size: 14px; font-weight: 900; cursor: pointer;
  font-family: 'Cairo', sans-serif;
  display: flex; align-items: center; justify-content: center; gap: 7px;
  transition: filter .15s;
}
.cf-execute.buy-exec  { background: linear-gradient(135deg, #2da44e, #1a7f37); box-shadow: 0 3px 14px rgba(45,164,78,.35); }
.cf-execute.sell-exec { background: linear-gradient(135deg, #e5534b, #a0281e); box-shadow: 0 3px 14px rgba(229,83,75,.35); }
.cf-execute:active { filter: brightness(.88); }
.cf-execute:disabled { opacity: .5; pointer-events: none; }
.cf-spinner { width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:cfSpin .7s linear infinite; }
@keyframes cfSpin { to{transform:rotate(360deg)} }

/* chart container relative for overlay */
.chart-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.chart-inner {
  flex: 1;
  min-height: 0;
  width: 100%;
}
`;
    document.head.appendChild(s);
  })();

  /* ════════════════════════════════════
     مساعدات
  ════════════════════════════════════ */
  function coin(sym) { return `xyz:${sym}`; }
  function ai(sym)   { return (typeof ASSETS!=='undefined'&&ASSETS[sym])||{pxDp:2,szDp:2,name:sym,icon:'📊',unit:'',lev:10,presets:[1]}; }
  function setStatus(s) { const e=document.getElementById('chartWsStatus'); if(e) e.textContent=s; }
  function setPrice(p) {
    _lastClose = +p;
    const e=document.getElementById('chartCurrentPrice');
    if(e&&p) e.textContent='$'+(+p).toFixed(ai(_sym).pxDp);
    // تحديث سعر الأزرار
    updateTradeBtnPrices();
  }
  function isDark() { return window.matchMedia('(prefers-color-scheme:dark)').matches; }
  function fmtP(n,sym) { return (+n).toFixed(ai(sym||_sym).pxDp); }
  function fmtS(n,sym) { return (+n).toFixed(ai(sym||_sym).szDp); }

  /* ════════════════════════════════════
     بناء Trade Bar
  ════════════════════════════════════ */
  function buildTradeBar(wrap) {
    // إزالة القديم إن وجد
    const old = document.getElementById('chartTradeBar');
    if (old) old.remove();

    const a = ai(_sym);
    // presets أول 3 فقط
    const ps = (a.presets||[]).slice(0,3);

    const bar = document.createElement('div');
    bar.id = 'chartTradeBar';
    bar.className = 'chart-trade-bar';
    bar.innerHTML = `
      <!-- زر البيع -->
      <button class="cbt-btn cbt-sell" id="cbtSell">
        <span class="cbt-dir">▼ بيع</span>
        <span class="cbt-px" id="cbtSellPx">—</span>
      </button>

      <!-- الكمية -->
      <div class="cbt-qty-wrap">
        <span class="cbt-qty-label">الكمية</span>
        <div class="cbt-qty-row">
          <input type="number" class="cbt-qty-input" id="cbtQty"
            value="${a.presets?.[0]||1}" min="0" step="any" inputmode="decimal">
          <span class="cbt-qty-unit">${a.unit}</span>
        </div>
        <div class="cbt-preset-row">
          ${ps.map((v,i)=>`<button class="cbt-preset${i===0?' active':''}" data-pv="${v}">${v}</button>`).join('')}
        </div>
      </div>

      <!-- زر الشراء -->
      <button class="cbt-btn cbt-buy" id="cbtBuy">
        <span class="cbt-dir">▲ شراء</span>
        <span class="cbt-px" id="cbtBuyPx">—</span>
      </button>
    `;

    // ضع قبل chart-wrap
    wrap.insertAdjacentElement('afterbegin', bar);

    // presets onclick
    bar.querySelectorAll('.cbt-preset').forEach(b => {
      b.onclick = () => {
        bar.querySelectorAll('.cbt-preset').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        document.getElementById('cbtQty').value = b.dataset.pv;
      };
    });

    // qty input → remove active presets highlight
    document.getElementById('cbtQty').oninput = () => {
      bar.querySelectorAll('.cbt-preset').forEach(x=>x.classList.remove('active'));
    };

    document.getElementById('cbtBuy').onclick  = () => showConfirm(true);
    document.getElementById('cbtSell').onclick = () => showConfirm(false);

    updateTradeBtnPrices();
  }

  function updateTradeBtnPrices() {
    if (!_lastClose) return;
    const a   = ai(_sym);
    const mid = _lastClose;
    // سعر بيع: midبشكل
    const buyPx  = (mid * 1.0005).toFixed(a.pxDp);  // ask تقريبي
    const sellPx = (mid * 0.9995).toFixed(a.pxDp);  // bid تقريبي
    const bp = document.getElementById('cbtBuyPx');
    const sp = document.getElementById('cbtSellPx');
    if (bp) bp.textContent = '$' + buyPx;
    if (sp) sp.textContent = '$' + sellPx;
  }

  /* ════════════════════════════════════
     Confirmation overlay
  ════════════════════════════════════ */
  function showConfirm(isBuy) {
    if (typeof State==='undefined'||!State.wallet) {
      if (typeof toast==='undefined') return alert('سجّل الدخول أولاً');
      return toast('سجّل الدخول أولاً','err');
    }

    const qty = parseFloat(document.getElementById('cbtQty')?.value||0);
    if (!qty || qty <= 0) {
      if (typeof toast!=='undefined') toast('أدخل الكمية','err');
      return;
    }

    _confirmDir = isBuy ? 'buy' : 'sell';
    const a   = ai(_sym);
    const mid = _lastClose || (typeof State!=='undefined' ? State.prices[_sym]?.mid : 0);
    if (!mid) {
      if (typeof toast!=='undefined') toast('لا يوجد سعر حالياً','err');
      return;
    }

    const px  = isBuy ? (mid*1.02) : (mid*0.98);
    const usd = (px * qty).toFixed(2);
    const mgn = (px * qty / a.lev).toFixed(2);
    const liq = isBuy ? (mid*(1-1/a.lev)).toFixed(a.pxDp) : (mid*(1+1/a.lev)).toFixed(a.pxDp);

    // إزالة confirm قديم
    hideConfirm();

    const wrap = document.getElementById('chartWrap');
    if (!wrap) return;

    const ov = document.createElement('div');
    ov.id = 'chartConfirmOv';
    ov.className = 'chart-confirm-overlay';
    ov.innerHTML = `
      <div class="chart-confirm-card">
        <div class="cf-handle"></div>
        <div class="cf-title" style="color:${isBuy?'#2da44e':'#e5534b'}">
          ${a.icon} ${isBuy?'شراء ▲':'بيع ▼'} — ${a.name}
        </div>
        <div class="cf-sub">رافعة ${a.lev}x · تأكيد قبل التنفيذ</div>
        <div class="cf-rows">
          <div class="cf-row"><span class="cf-key">الكمية</span><span class="cf-val">${fmtS(qty)} ${a.unit}</span></div>
          <div class="cf-row"><span class="cf-key">السعر</span><span class="cf-val">${fmtP(mid)} $</span></div>
          <div class="cf-row"><span class="cf-key">القيمة</span><span class="cf-val">≈ $${usd}</span></div>
          <div class="cf-row"><span class="cf-key">الهامش</span><span class="cf-val warn">≈ $${mgn}</span></div>
          <div class="cf-row"><span class="cf-key">التصفية</span><span class="cf-val ${isBuy?'sell':'buy'}">≈ ${liq} $</span></div>
        </div>
        <div class="cf-buttons">
          <button class="cf-cancel" id="cfCancel">إلغاء ✕</button>
          <button class="cf-execute ${isBuy?'buy-exec':'sell-exec'}" id="cfExecute">
            ${isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'}
          </button>
        </div>
      </div>`;

    wrap.appendChild(ov);

    // إغلاق بالنقر خارج الكارد
    ov.onclick = e => { if (e.target === ov) hideConfirm(); };
    document.getElementById('cfCancel').onclick = hideConfirm;
    document.getElementById('cfExecute').onclick = () => executeChartTrade(isBuy, qty);
  }

  function hideConfirm() {
    const ov = document.getElementById('chartConfirmOv');
    if (ov) ov.remove();
    _confirmDir = null;
  }

  /* ════════════════════════════════════
     تنفيذ الصفقة من داخل الرسم
  ════════════════════════════════════ */
  async function executeChartTrade(isBuy, qty) {
    if (typeof State==='undefined'||!State.wallet) return;

    const btn = document.getElementById('cfExecute');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="cf-spinner"></span>';
    }

    const a   = ai(_sym);
    const mid = _lastClose || State.prices[_sym]?.mid;
    if (!mid) { hideConfirm(); if(typeof toast!=='undefined') toast('لا يوجد سعر','err'); return; }

    try {
      // 1. تعيين الرافعة
      try {
        await hlExchange({type:'updateLeverage', asset:a.idx, isCross:a.cross, leverage:a.lev});
      } catch {}

      // 2. أمر IOC
      const px = wire(mid*(isBuy?1.02:0.98), a.pxDp);
      const sz = wire(qty, a.szDp);
      await hlExchange({
        type:'order',
        orders:[{a:a.idx, b:isBuy, p:px, s:sz, r:false, t:{limit:{tif:'Ioc'}}}],
        grouping:'na'
      });

      hideConfirm();
      if(typeof toast!=='undefined')
        toast(`✅ تم — ${a.icon} ${isBuy?'شراء':'بيع'} ${fmtS(qty)} ${a.unit}`, 'ok', 4000);

      // تحديث الحساب بعد ثانيتين
      if(typeof pollAccount!=='undefined') setTimeout(pollAccount, 2000);

    } catch(e) {
      if(typeof tradeErr!=='undefined') {
        if(typeof toast!=='undefined') toast(tradeErr(e.message),'err',5000);
      } else {
        if(typeof toast!=='undefined') toast('❌ '+e.message.slice(0,100),'err',5000);
      }
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع';
      }
    }
  }

  /* ════════════════════════════════════
     بناء مثيل الرسم
  ════════════════════════════════════ */
  function buildChart(container) {
    if (_chart) { try { _chart.remove(); } catch {} _chart=null; _candleSeries=null; _volSeries=null; }
    if (_resizeObs) { try { _resizeObs.disconnect(); } catch {} }

    const dark = isDark();
    const BG   = dark ? '#1a1916' : '#f5f0eb';
    const TXT  = dark ? '#9b9287' : '#6b6460';
    const GRID = dark ? '#2a2825' : '#ebe6e0';
    const BDR  = dark ? '#3d3a34' : '#c0b9b1';
    const UP   = '#2da44e';
    const DN   = '#e5534b';

    _chart = LightweightCharts.createChart(container, {
      width:  container.clientWidth,
      height: container.clientHeight,
      layout: {
        background:  { type:'solid', color:BG },
        textColor:   TXT,
        fontSize:    11,
        fontFamily:  "'IBM Plex Mono', monospace",
      },
      grid: {
        vertLines: { color:GRID, style:LightweightCharts.LineStyle.Dotted },
        horzLines: { color:GRID, style:LightweightCharts.LineStyle.Dotted },
      },
      crosshair: {
        mode:     LightweightCharts.CrosshairMode.Normal,
        vertLine: { width:1, color: dark?'#5a534a':'#b8b0a8', style:LightweightCharts.LineStyle.Dashed, labelBackgroundColor: dark?'#3d3a34':'#c0b9b1' },
        horzLine: { width:1, color: dark?'#5a534a':'#b8b0a8', style:LightweightCharts.LineStyle.Dashed, labelBackgroundColor: dark?'#3d3a34':'#c0b9b1' },
      },
      rightPriceScale: {
        borderColor: BDR,
        scaleMargins: { top:0.08, bottom:0.15 },
        minimumWidth: 72,
      },
      timeScale: {
        borderColor:     BDR,
        timeVisible:     true,
        secondsVisible:  false,
        rightOffset:     8,
        barSpacing:      8,
        fixLeftEdge:     false,
        lockVisibleTimeRangeOnResize: true,
      },
      handleScroll: { mouseWheel:true, pressedMouseMove:true, horzTouchDrag:true, vertTouchDrag:false },
      handleScale:  { mouseWheel:true, pinch:true, axisPressedMouseMove:{time:true, price:false} },
      localization: {
        locale: 'en-US',
        priceFormatter: p => p.toLocaleString('en-US', {minimumFractionDigits:ai(_sym).pxDp, maximumFractionDigits:ai(_sym).pxDp}),
      },
      attributionLogo: false,
    });

    /* شموع */
    _candleSeries = _chart.addCandlestickSeries({
      upColor:         UP, downColor:       DN,
      borderUpColor:   UP, borderDownColor: DN,
      wickUpColor:     UP, wickDownColor:   DN,
    });

    /* حجم التداول (histogram أسفل الرسم) */
    _volSeries = _chart.addHistogramSeries({
      color:    'rgba(100,100,100,.25)',
      priceScaleId: 'vol',
    });
    _chart.priceScale('vol').applyOptions({
      scaleMargins: { top:0.85, bottom:0 },
    });

    /* Crosshair Legend */
    _chart.subscribeCrosshairMove(param => {
      const el = document.getElementById('chartLegend');
      if (!el) return;
      if (!param.time || !param.seriesData?.size) { el.innerHTML = ''; return; }
      const bar = param.seriesData.get(_candleSeries);
      if (!bar) return;
      const dp = ai(_sym).pxDp;
      const pColor = bar.close >= bar.open ? UP : DN;
      const chg    = (((bar.close - bar.open) / bar.open) * 100).toFixed(2);
      el.innerHTML =
        `<span style="color:${pColor};font-weight:900">O ${bar.open.toFixed(dp)}</span>` +
        `<span style="color:${pColor}">H ${bar.high.toFixed(dp)}</span>` +
        `<span style="color:${pColor}">L ${bar.low.toFixed(dp)}</span>` +
        `<span style="color:${pColor}">C ${bar.close.toFixed(dp)}</span>` +
        `<span style="color:${pColor}">${chg>0?'+':''}${chg}%</span>`;
    });

    /* ResizeObserver */
    _resizeObs = new ResizeObserver(() => {
      if (_chart && container) {
        _chart.applyOptions({ width:container.clientWidth, height:container.clientHeight });
      }
    });
    _resizeObs.observe(container);
  }

  /* ════════════════════════════════════
     جلب الشموع
  ════════════════════════════════════ */
  async function fetchCandles(sym, interval) {
    const now   = Date.now();
    const start = now - (RANGES[interval]||RANGES['1h']);
    try {
      const r = await fetch(HL_API+'/info', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type:'candleSnapshot', req:{ coin:coin(sym), interval, startTime:start, endTime:now } })
      });
      const raw = await r.json();
      if (!Array.isArray(raw)||!raw.length) return [];
      return raw.map(c=>({
        time:  Math.floor(c.t/1000),
        open:  +c.o, high:+c.h, low:+c.l, close:+c.c,
        vol:   +c.v
      })).sort((a,b)=>a.time-b.time);
    } catch(e) { console.warn('[Chart]',e.message); return []; }
  }

  /* ════════════════════════════════════
     خطوط الصفقات
  ════════════════════════════════════ */
  function clearLines() {
    _entryLines.forEach(l=>{ try{_candleSeries.removePriceLine(l);}catch{} });
    _entryLines=[];
    if (_tpLine) { try{_candleSeries.removePriceLine(_tpLine);}catch{} _tpLine=null; }
    if (_slLine) { try{_candleSeries.removePriceLine(_slLine);}catch{} _slLine=null; }
  }

  function drawLines() {
    if (!_candleSeries||typeof State==='undefined') return;
    clearLines();
    for (const p of (State.positions||[])) {
      const c   = p.position.coin.includes(':')?p.position.coin.split(':')[1]:p.position.coin;
      if (c!==_sym) continue;
      const pos  = p.position;
      const szi  = +pos.szi, entry=+(pos.entryPx||0);
      const pnl  = +(pos.unrealizedPnl||0);
      const sign = pnl>=0?'+':'';
      if (entry>0) {
        const l = _candleSeries.createPriceLine({
          price: entry, lineWidth:2, lineStyle:2,
          color: szi>0?'#2da44e':'#e5534b',
          axisLabelVisible:true,
          title: `${szi>0?'▲':'▼'} Entry  ${sign}$${Math.abs(pnl).toFixed(2)}`,
        });
        _entryLines.push(l);
      }
      const tpsl=p.tpsl||{};
      if (tpsl.tp) _tpLine=_candleSeries.createPriceLine({price:tpsl.tp,lineWidth:1,lineStyle:3,color:'#22c58b',axisLabelVisible:true,title:'TP'});
      if (tpsl.sl) _slLine=_candleSeries.createPriceLine({price:tpsl.sl,lineWidth:1,lineStyle:3,color:'#e8804a',axisLabelVisible:true,title:'SL'});
      break;
    }
  }

  /* ════════════════════════════════════
     WebSocket
  ════════════════════════════════════ */
  function wsConnect() {
    wsClose(); clearTimeout(_wsTimer);
    try {
      _ws = new WebSocket(HL_WS);
      _ws.onopen = () => {
        _ws.send(JSON.stringify({ method:'subscribe', subscription:{ type:'candle', coin:coin(_sym), interval:_interval } }));
        setStatus('🟢');
      };
      _ws.onmessage = e => {
        try {
          const msg=JSON.parse(e.data);
          if (msg.channel!=='candle'||!msg.data) return;
          const c=msg.data;
          if (!_candleSeries) return;
          const bar = { time:Math.floor(c.t/1000), open:+c.o, high:+c.h, low:+c.l, close:+c.c };
          _candleSeries.update(bar);
          if (_volSeries) _volSeries.update({ time:bar.time, value:+c.v, color:bar.close>=bar.open?'rgba(45,164,78,.3)':'rgba(229,83,75,.3)' });
          setPrice(bar.close);
          drawLines();
        } catch {}
      };
      _ws.onerror = () => setStatus('🔴');
      _ws.onclose = () => { setStatus('🔴'); if(_visible) _wsTimer=setTimeout(wsConnect,4000); };
    } catch(e) { console.warn('[Chart WS]',e.message); }
  }

  function wsClose() {
    if(_ws){ try{_ws.close();}catch{} _ws=null; }
    clearTimeout(_wsTimer);
  }

  /* ════════════════════════════════════
     تحميل كامل
  ════════════════════════════════════ */
  async function load(sym, interval) {
    if (!_chart||!_candleSeries) return;
    setStatus('⏳');
    document.getElementById('chartCurrentPrice').textContent = '—';

    const candles = await fetchCandles(sym, interval);
    if (!candles.length) { setStatus('❌'); return; }

    _candleSeries.setData(candles.map(({time,open,high,low,close})=>({time,open,high,low,close})));

    if (_volSeries) {
      _volSeries.setData(candles.map(c=>({
        time:c.time, value:c.vol,
        color: c.close>=c.open ? 'rgba(45,164,78,.3)' : 'rgba(229,83,75,.3)'
      })));
    }

    _chart.timeScale().fitContent();
    _lastClose = candles[candles.length-1].close;
    setPrice(_lastClose);
    drawLines();
    setStatus('🟡');
    wsConnect();
  }

  /* ════════════════════════════════════
     هيكل الشاشة (يُبنى مرة واحدة)
  ════════════════════════════════════ */
  function ensureChartScreen() {
    const screen = document.getElementById('chartScreen');
    if (!screen) return;

    // هل يحتوي بالفعل على chart-wrap؟
    if (document.getElementById('chartWrap')) return;

    // بناء البنية الداخلية
    screen.innerHTML = `
      <div class="chart-nav">
        <button class="chart-back" id="chartBack">← رجوع</button>
        <div class="chart-header-info">
          <span id="chartAssetIcon">🛢</span>
          <span id="chartAssetName" class="chart-asset-name">نفط خام</span>
          <span id="chartCurrentPrice" class="chart-current-price">—</span>
        </div>
        <div class="chart-ws-status" id="chartWsStatus">⏳</div>
      </div>
      <div class="chart-intervals">
        <button class="iv-btn" data-iv="1m">1m</button>
        <button class="iv-btn" data-iv="5m">5m</button>
        <button class="iv-btn" data-iv="15m">15m</button>
        <button class="iv-btn active" data-iv="1h">1H</button>
        <button class="iv-btn" data-iv="4h">4H</button>
        <button class="iv-btn" data-iv="1d">D</button>
      </div>
      <div class="chart-wrap" id="chartWrap">
        <!-- trade bar يُحقن هنا -->
        <div class="chart-inner" id="chartContainer"></div>
        <div id="chartLegend" class="chart-legend"></div>
      </div>`;

    // ربط أزرار الرجوع والفترات
    document.getElementById('chartBack').onclick = () => ChartModule.close();
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

  /* ════════════════════════════════════
     واجهة عامة
  ════════════════════════════════════ */

  function open(sym) {
    _sym     = sym || (typeof State!=='undefined'?State.asset:'CL');
    _visible = true;

    ensureChartScreen();
    document.getElementById('chartScreen')?.classList.remove('hidden');
    setHeader(_sym);

    // تحديث active tab فترة
    document.querySelectorAll('.iv-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.iv===_interval)
    );

    // trade bar
    const wrap = document.getElementById('chartWrap');
    if (wrap) buildTradeBar(wrap);

    // الرسم
    const container = document.getElementById('chartContainer');
    if (container) {
      buildChart(container);
      load(_sym, _interval);
    }
  }

  function close() {
    _visible = false;
    wsClose();
    hideConfirm();
    document.getElementById('chartScreen')?.classList.add('hidden');
    const lg = document.getElementById('chartLegend');
    if (lg) lg.innerHTML = '';
  }

  function switchInterval(iv) {
    if (iv===_interval) return;
    _interval = iv;
    wsClose();
    document.querySelectorAll('.iv-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.iv===iv)
    );
    load(_sym, _interval);
  }

  function switchAssetChart(sym) {
    if (sym===_sym&&_visible) return;
    _sym = sym;
    setHeader(sym);
    wsClose();
    // إعادة بناء trade bar للكميات الجديدة
    const wrap = document.getElementById('chartWrap');
    if (wrap) buildTradeBar(wrap);
    // إعادة بناء الرسم لتنسيق الأسعار
    const container = document.getElementById('chartContainer');
    if (container) {
      buildChart(container);
      load(_sym, _interval);
    }
  }

  function refreshLines() {
    if (_visible && _candleSeries) drawLines();
  }

  return { open, close, switchInterval, switchAssetChart, refreshLines };

})();
