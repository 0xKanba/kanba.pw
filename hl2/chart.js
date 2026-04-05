/* ═══════════════════════════════════════════════════════════════
   HL Trade · chart.js v1.0
   رسم بياني Candlestick لأصول trade.xyz
   ✅ Lightweight Charts v4 (Apache 2.0)
   ✅ candleSnapshot من Hyperliquid API
   ✅ WebSocket لحظي للشموع
   ✅ خطوط دخول + TP + SL من State.positions
   ✅ تبديل الفترات: 1م·5م·15م·1س·4س·يوم
═══════════════════════════════════════════════════════════════ */

const ChartModule = (function () {

  /* ── ثوابت ── */
  const HL_API = 'https://api.hyperliquid.xyz';
  const HL_WS  = 'wss://api.hyperliquid.xyz/ws';

  // مدة البيانات المجلوبة لكل فترة (بالمللي ثانية)
  const RANGES = {
    '1m':  3   * 60 * 60 * 1000,    // 3 ساعات → ~180 شمعة
    '5m':  16  * 60 * 60 * 1000,    // 16 ساعة → ~192 شمعة
    '15m': 48  * 60 * 60 * 1000,    // يومان  → ~192 شمعة
    '1h':  200 * 60 * 60 * 1000,    // 8 أيام  → ~200 شمعة
    '4h':  60  * 24 * 60 * 60 * 1000, // 60 يوم → ~360 شمعة
    '1d':  365 * 24 * 60 * 60 * 1000  // سنة   → ~365 شمعة
  };

  /* ── حالة الوحدة ── */
  let _chart       = null;   // IChartApi
  let _series      = null;   // ISeriesApi (candlestick)
  let _entryLines  = [];     // price lines للصفقات
  let _tpLine      = null;
  let _slLine      = null;
  let _ws          = null;   // WebSocket
  let _wsTimer     = null;   // reconnect timer
  let _visible     = false;
  let _sym         = 'CL';
  let _interval    = '1h';
  let _resizeObs   = null;

  /* ════════════════════════════════════
     مساعدات
  ════════════════════════════════════ */
  function coin(sym) { return `xyz:${sym}`; }

  function assetInfo(sym) {
    return (typeof ASSETS !== 'undefined' && ASSETS[sym]) || { pxDp:2, name:sym, icon:'📊' };
  }

  function setStatus(s) {
    const el = document.getElementById('chartWsStatus');
    if (el) el.textContent = s;
  }

  function setPrice(price) {
    const el = document.getElementById('chartCurrentPrice');
    if (!el || !price) return;
    const a = assetInfo(_sym);
    el.textContent = '$' + (+price).toFixed(a.pxDp);
  }

  function setHeader(sym) {
    const a = assetInfo(sym);
    const icon = document.getElementById('chartAssetIcon');
    const name = document.getElementById('chartAssetName');
    if (icon) icon.textContent = a.icon;
    if (name) name.textContent = a.name;
  }

  function isDark() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /* ════════════════════════════════════
     إنشاء مثيل الرسم
  ════════════════════════════════════ */
  function buildChart() {
    const container = document.getElementById('chartContainer');
    if (!container) return;

    if (_chart) {
      try { _chart.remove(); } catch {}
      _chart = null; _series = null;
    }
    if (_resizeObs) { try { _resizeObs.disconnect(); } catch {} }

    const dark = isDark();
    const bg    = dark ? '#1a1916' : '#f5f0eb';
    const text  = dark ? '#ede8e0' : '#1a1916';
    const grid  = dark ? '#2a2825' : '#e8e3dd';
    const bdr   = dark ? '#3d3a34' : '#c0b9b1';

    _chart = LightweightCharts.createChart(container, {
      width:  container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: 'solid', color: bg },
        textColor: text,
        fontSize: 11,
        fontFamily: "'IBM Plex Mono', monospace",
      },
      grid: {
        vertLines: { color: grid, style: 0 },
        horzLines: { color: grid, style: 0 },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { width: 1, color: dark ? '#4d4840' : '#c0b9b1', style: 3 },
        horzLine: { width: 1, color: dark ? '#4d4840' : '#c0b9b1', style: 3 },
      },
      rightPriceScale: {
        borderColor: bdr,
        scaleMargins: { top: 0.07, bottom: 0.07 },
      },
      timeScale: {
        borderColor: bdr,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
      },
      handleScroll:  { mouseWheel:true, pressedMouseMove:true, horzTouchDrag:true, vertTouchDrag:false },
      handleScale:   { mouseWheel:true, pinch:true, axisPressedMouseMove:{ time:true, price:false } },
      localization:  { locale:'ar-SA' },
      attributionLogo: false,
    });

    _series = _chart.addCandlestickSeries({
      upColor:         '#2da44e',
      downColor:       '#e5534b',
      borderUpColor:   '#2da44e',
      borderDownColor: '#e5534b',
      wickUpColor:     '#2da44e',
      wickDownColor:   '#e5534b',
    });

    // تحديث الـ legend عند تحريك المؤشر
    _chart.subscribeCrosshairMove(param => {
      const el = document.getElementById('chartLegend');
      if (!el) return;
      if (!param.time || !param.seriesData?.size) {
        el.innerHTML = ''; return;
      }
      const bar = param.seriesData.get(_series);
      if (!bar) return;
      const a = assetInfo(_sym);
      const dp = a.pxDp;
      const pnlColor = bar.close >= bar.open ? '#2da44e' : '#e5534b';
      el.innerHTML = `
        <span class="chart-legend-item">ف <b>${(+bar.open).toFixed(dp)}</b></span>
        <span class="chart-legend-item">أع <b>${(+bar.high).toFixed(dp)}</b></span>
        <span class="chart-legend-item">أد <b>${(+bar.low).toFixed(dp)}</b></span>
        <span class="chart-legend-item" style="color:${pnlColor}">إغ <b>${(+bar.close).toFixed(dp)}</b></span>`;
    });

    // resize responsive
    _resizeObs = new ResizeObserver(() => {
      if (_chart && container) {
        _chart.applyOptions({
          width:  container.clientWidth,
          height: container.clientHeight,
        });
      }
    });
    _resizeObs.observe(container);
  }

  /* ════════════════════════════════════
     جلب الشموع التاريخية
  ════════════════════════════════════ */
  async function fetchCandles(sym, interval) {
    const now   = Date.now();
    const start = now - (RANGES[interval] || RANGES['1h']);

    try {
      const res = await fetch(HL_API + '/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req:  { coin: coin(sym), interval, startTime: start, endTime: now }
        })
      });
      const raw = await res.json();
      if (!Array.isArray(raw) || raw.length === 0) return [];
      return raw.map(c => ({
        time:  Math.floor(c.t / 1000),   // ثوانٍ Unix
        open:  parseFloat(c.o),
        high:  parseFloat(c.h),
        low:   parseFloat(c.l),
        close: parseFloat(c.c),
      })).sort((a, b) => a.time - b.time);
    } catch (e) {
      console.warn('[Chart] fetchCandles:', e.message);
      return [];
    }
  }

  /* ════════════════════════════════════
     خطوط الصفقات (دخول · TP · SL)
  ════════════════════════════════════ */
  function clearLines() {
    _entryLines.forEach(l => { try { _series.removePriceLine(l); } catch {} });
    _entryLines = [];
    if (_tpLine) { try { _series.removePriceLine(_tpLine); } catch {} _tpLine = null; }
    if (_slLine) { try { _series.removePriceLine(_slLine); } catch {} _slLine = null; }
  }

  function drawLines() {
    if (!_series || typeof State === 'undefined') return;
    clearLines();

    for (const p of (State.positions || [])) {
      const pos  = p.position;
      const c    = pos.coin.includes(':') ? pos.coin.split(':')[1] : pos.coin;
      if (c !== _sym) continue;

      const entry = parseFloat(pos.entryPx || 0);
      const szi   = parseFloat(pos.szi || 0);
      const pnl   = parseFloat(pos.unrealizedPnl || 0);
      const isLong = szi > 0;
      const a      = assetInfo(_sym);

      if (entry > 0) {
        const sign = pnl >= 0 ? '+' : '';
        const line = _series.createPriceLine({
          price:            entry,
          color:            isLong ? '#2da44e' : '#e5534b',
          lineWidth:        1,
          lineStyle:        2,  // 2 = dashed
          axisLabelVisible: true,
          title: `${isLong ? '▲' : '▼'} دخول  ${sign}$${Math.abs(pnl).toFixed(2)}`,
        });
        _entryLines.push(line);
      }

      const tpsl = p.tpsl || {};
      if (tpsl.tp) {
        _tpLine = _series.createPriceLine({
          price:            tpsl.tp,
          color:            '#22c58b',
          lineWidth:        1,
          lineStyle:        3,  // 3 = large dashed
          axisLabelVisible: true,
          title:            'جني ربح',
        });
      }
      if (tpsl.sl) {
        _slLine = _series.createPriceLine({
          price:            tpsl.sl,
          color:            '#e8804a',
          lineWidth:        1,
          lineStyle:        3,
          axisLabelVisible: true,
          title:            'وقف خسارة',
        });
      }
      break; // صفقة واحدة لكل أصل
    }

    // legend الخطوط
    updateLineLegend();
  }

  function updateLineLegend() {
    const legend = document.getElementById('chartLegend');
    if (!legend) return;
    const parts = [];
    if (_entryLines.length)
      parts.push(`<span class="chart-legend-item"><span class="chart-legend-dot" style="background:#2da44e"></span>دخول</span>`);
    if (_tpLine)
      parts.push(`<span class="chart-legend-item"><span class="chart-legend-dot" style="background:#22c58b"></span>جني ربح</span>`);
    if (_slLine)
      parts.push(`<span class="chart-legend-item"><span class="chart-legend-dot" style="background:#e8804a"></span>وقف خسارة</span>`);
    legend.innerHTML = parts.join('');
  }

  /* ════════════════════════════════════
     WebSocket لحظي
  ════════════════════════════════════ */
  function wsConnect() {
    wsClose();
    clearTimeout(_wsTimer);

    try {
      _ws = new WebSocket(HL_WS);

      _ws.onopen = () => {
        _ws.send(JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'candle', coin: coin(_sym), interval: _interval }
        }));
        setStatus('🟢');
      };

      _ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.channel !== 'candle' || !msg.data) return;
          const c = msg.data;
          if (!_series) return;
          const bar = {
            time:  Math.floor(c.t / 1000),
            open:  parseFloat(c.o),
            high:  parseFloat(c.h),
            low:   parseFloat(c.l),
            close: parseFloat(c.c),
          };
          _series.update(bar);
          setPrice(bar.close);
          drawLines(); // تحديث PnL في عنوان الخط
        } catch {}
      };

      _ws.onerror = () => setStatus('🔴');
      _ws.onclose = () => {
        setStatus('🔴');
        if (_visible) _wsTimer = setTimeout(wsConnect, 4000);
      };
    } catch (e) {
      console.warn('[Chart] WS:', e.message);
    }
  }

  function wsClose() {
    if (_ws) {
      try { _ws.close(); } catch {}
      _ws = null;
    }
    clearTimeout(_wsTimer);
  }

  /* ════════════════════════════════════
     تحميل الرسم
  ════════════════════════════════════ */
  async function load(sym, interval) {
    if (!_chart || !_series) return;
    setStatus('⏳');
    setHeader(sym);

    const candles = await fetchCandles(sym, interval);
    if (candles.length === 0) {
      setStatus('❌');
      return;
    }

    _series.setData(candles);
    _chart.timeScale().fitContent();
    setPrice(candles[candles.length - 1].close);
    drawLines();

    setStatus('🟡');
    wsConnect();
  }

  /* ════════════════════════════════════
     واجهة عامة
  ════════════════════════════════════ */

  /** فتح شاشة الرسم */
  function open(sym, interval) {
    _sym      = sym      || (typeof State !== 'undefined' ? State.asset : 'CL');
    _interval = interval || _interval;
    _visible  = true;

    document.getElementById('chartScreen')?.classList.remove('hidden');

    // تحديث أزرار الفترة
    document.querySelectorAll('.iv-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.iv === _interval)
    );

    // بناء الرسم لأول مرة أو إعادة بناء (للتأكد من أبعاد صحيحة)
    buildChart();
    load(_sym, _interval);
  }

  /** إغلاق شاشة الرسم */
  function close() {
    _visible = false;
    wsClose();
    document.getElementById('chartScreen')?.classList.add('hidden');
    document.getElementById('chartLegend').innerHTML = '';
  }

  /** تبديل الفترة الزمنية */
  function switchInterval(interval) {
    if (interval === _interval) return;
    _interval = interval;
    wsClose();
    document.querySelectorAll('.iv-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.iv === interval)
    );
    load(_sym, _interval);
  }

  /** تبديل الأصل (يُستدعى عند الضغط على tab أصل بينما الرسم مفتوح) */
  function switchAssetChart(sym) {
    if (sym === _sym) return;
    _sym = sym;
    wsClose();
    load(_sym, _interval);
  }

  /** تحديث خطوط الصفقات (يُستدعى من renderPositions في hl.js) */
  function refreshLines() {
    if (_visible && _series) drawLines();
  }

  return { open, close, switchInterval, switchAssetChart, refreshLines };

})();
