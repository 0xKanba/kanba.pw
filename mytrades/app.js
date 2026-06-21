/* ================================================================
   MyTrades — Performance Analytics  (v4 — 20x smarter)
   Major intelligence upgrades:
   1. Recovers CANCELLED SL orders → uses them as "intended risk"
      for R-multiple computation
   2. Smart exit-type classification:
      - TP-Full     (exit ≈ TP)
      - TP-Partial  (profitable, scaled out before TP)
      - BE          (exit ≈ entry, break-even)
      - SL          (exit ≈ SL)
      - Manual      (unprofitable, not matching SL)
   3. Position grouping: clusters partial exits of the same
      position by (symbol, entry price, time window)
   4. Position-level R-multiple aggregated across partial exits
   5. Implied R:R when SL was cancelled but TP still active
   6. Compact dense UI for one-screen fit
   ================================================================ */
(function () {
  'use strict';

  /* ── Config ─────────────────────────────────────────────── */
  const CSV = {
    balance: 'csv/b-h.csv',
    orders:  'csv/o-h.csv',
    journal: 'csv/t-j.csv'
  };

  /* Tunable precision constants */
  const SIBLING_WINDOW_MS     = 15 * 60 * 1000;   // ±15 min around entry
  const CANCEL_SL_WINDOW_MS   = 60 * 60 * 1000;   // ±60 min around entry for cancelled SLs
  const CLOSE_WINDOW_MS       = 90 * 1000;
  const PRICE_TOL_PCT         = 0.0008;
  const MIN_PRICE_TOL         = 0.05;
  const BE_TOL_PCT            = 0.0005;           // 0.05% — break-even tolerance
  const POSITION_GROUP_TOL_MS = 24 * 60 * 60 * 1000; // 24h

  /* ── State ──────────────────────────────────────────────── */
  let balanceRows = [], orderRows = [], journalRows = [];
  let sltpTimelines = {};
  let trades = [];
  let positions = [];     // NEW: logical positions (grouped partial exits)
  let metrics = null;
  let charts = {};
  let currentTheme = 'dark';
  let calYear = null, calMonth = null;
  let activeFilters = { symbol: 'all', side: 'all', outcome: 'all', search: '' };

  /* ── Icons ──────────────────────────────────────────────── */
  const ICONS = {
    moon: '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>',
    sun:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></svg>',
    trendUp: '<svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    target:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
    shield:  '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    zap:     '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    dollar:  '<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    award:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="6"/><polyline points="8.21 13.89 7 22 12 19 17 22 15.79 13.88"/></svg>',
    flame:   '<svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 002.5 2.5z"/></svg>',
    scale:   '<svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M5 21h14"/><path d="M5 7l-3 6h6z"/><path d="M19 7l-3 6h6z"/><path d="M5 7h14"/></svg>',
    clock:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
    layers:  '<svg viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>'
  };

  /* ================================================================
     THEME / SIDEBAR / TABS
     ================================================================ */
  function systemTheme() { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; }
  function setTheme(t) {
    currentTheme = t;
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('mt-theme', t); } catch (e) {}
    updateThemeIcon();
    setTimeout(rebuildCharts, 60);
  }
  function updateThemeIcon() {
    const el = document.getElementById('themeIcon');
    if (el) el.innerHTML = currentTheme === 'dark' ? ICONS.moon : ICONS.sun;
  }
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('mt-theme'); } catch (e) {}
    setTheme(saved || systemTheme());
    const btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', () => setTheme(currentTheme === 'dark' ? 'light' : 'dark'));
  }

  function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sideOverlay');
    const burger  = document.getElementById('burger');
    function open()  { sidebar.classList.add('open');  overlay.classList.add('visible'); burger.classList.add('open'); document.body.style.overflow = 'hidden'; }
    function close() { sidebar.classList.remove('open'); overlay.classList.remove('visible'); burger.classList.remove('open'); document.body.style.overflow = ''; }
    if (burger)  burger.addEventListener('click', () => sidebar.classList.contains('open') ? close() : open());
    if (overlay) overlay.addEventListener('click', close);
  }

  function initTabs() {
    const items = document.querySelectorAll('.nav-item[data-tab]');
    const panels = document.querySelectorAll('.panel');
    const title = document.getElementById('topbarTitle');
    const sub   = document.getElementById('topbarSub');
    const labels = {
      overview:  { t: 'Overview',  s: 'Portfolio performance at a glance' },
      symbols:   { t: 'By Symbol', s: 'Win rate & risk-reward per instrument' },
      positions: { t: 'Positions', s: 'Logical positions with partial exits aggregated' },
      calendar:  { t: 'Calendar',  s: 'Daily P&L heatmap' },
      trades:    { t: 'Trade Log', s: 'Every closed position with detail' },
      analytics: { t: 'Analytics', s: 'Advanced statistics' }
    };
    items.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        items.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        panels.forEach(p => p.classList.remove('active'));
        const panel = document.getElementById('panel-' + tab);
        if (panel) panel.classList.add('active');
        if (title && labels[tab]) title.textContent = labels[tab].t;
        if (sub   && labels[tab]) sub.textContent   = labels[tab].s;
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sideOverlay').classList.remove('visible');
        document.getElementById('burger').classList.remove('open');
        document.body.style.overflow = '';
        setTimeout(rebuildCharts, 50);
      });
    });
  }

  /* ================================================================
     CSV PARSER
     ================================================================ */
  function parseCSVLine(line) {
    const vals = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
        continue;
      }
      if (c === ',' && !inQ) { vals.push(cur); cur = ''; continue; }
      cur += c;
    }
    vals.push(cur);
    return vals;
  }
  function parseCSV(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length > 0);
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = parseCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    });
  }

  /* ================================================================
     DATA LOADING
     ================================================================ */
  async function loadData() {
    const [bRes, oRes, jRes] = await Promise.all([
      fetch(CSV.balance), fetch(CSV.orders), fetch(CSV.journal)
    ]);
    if (!bRes.ok) throw new Error('Failed to load ' + CSV.balance);
    if (!oRes.ok) throw new Error('Failed to load ' + CSV.orders);
    if (!jRes.ok) throw new Error('Failed to load ' + CSV.journal);
    const [bText, oText, jText] = await Promise.all([bRes.text(), oRes.text(), jRes.text()]);

    balanceRows = parseCSV(bText).map(r => ({
      timeStr: r['Time'],
      time: new Date(r['Time'].replace(' ', 'T') + 'Z'),
      balanceBefore: parseFloat(r['Balance before']) || 0,
      balanceAfter:  parseFloat(r['Balance after'])  || 0,
      pnl: parseFloat(r['Realized PnL (value)']) || 0,
      action: r['Action'] || ''
    })).sort((a, b) => a.time - b.time);

    orderRows = parseCSV(oText).map(r => ({
      symbol: r['Symbol'], side: r['Side'], type: r['Type'],
      qty: parseInt(r['Quantity']) || 0,
      limitPrice: r['Limit price'] ? parseFloat(r['Limit price']) : null,
      stopPrice:  r['Stop price']  ? parseFloat(r['Stop price'])  : null,
      fillPrice:  r['Fill price']  ? parseFloat(r['Fill price'])  : null,
      status: r['Status'],
      placingTime: r['Placing time'] ? new Date(r['Placing time'].replace(' ', 'T') + 'Z') : null,
      closingTime: r['Closing time'] ? new Date(r['Closing time'].replace(' ', 'T') + 'Z') : null,
      orderId: r['Order ID']
    }));

    journalRows = parseCSV(jText).map(r => ({
      timeStr: r['Time'],
      time: new Date(r['Time'].replace(' ', 'T') + 'Z'),
      text: r['Text'] || ''
    })).sort((a, b) => a.time - b.time);

    sltpTimelines = buildSLTPTimelines(journalRows);
  }

  /* ================================================================
     JOURNAL SL/TP TIMELINE PARSER
     ================================================================ */
  function buildSLTPTimelines(rows) {
    const timelines = {};
    function push(sym, time, sl, tp) {
      if (!timelines[sym]) timelines[sym] = [];
      timelines[sym].push({ time, sl, tp });
    }
    rows.forEach(r => {
      const t = r.text, time = r.time; let m;
      m = t.match(/Modify position for symbol (\S+) with SL\s+([\d.]+)\s+and\s+TP\s+([\d.]+)/i);
      if (m) { push(m[1], time, parseFloat(m[2]), parseFloat(m[3])); return; }
      m = t.match(/Modified order \S+ for symbol (\S+)[^]*?with SL\s+([\d.]+)\s+and\s+TP\s+([\d.]+)/i);
      if (m) { push(m[1], time, parseFloat(m[2]), parseFloat(m[3])); return; }
      m = t.match(/Modify position for symbol (\S+) with SL\s+([\d.]+)\s*$/i);
      if (m) { push(m[1], time, parseFloat(m[2]), null); return; }
      m = t.match(/Modified order \S+ for symbol (\S+)[^]*?with SL\s+([\d.]+)\s*$/i);
      if (m) { push(m[1], time, parseFloat(m[2]), null); return; }
      m = t.match(/Modify position for symbol (\S+) with TP\s+([\d.]+)\s*$/i);
      if (m) { push(m[1], time, null, parseFloat(m[2])); return; }
      m = t.match(/Modified order \S+ for symbol (\S+)[^]*?with TP\s+([\d.]+)\s*$/i);
      if (m) { push(m[1], time, null, parseFloat(m[2])); return; }
    });
    Object.keys(timelines).forEach(sym => timelines[sym].sort((a, b) => a.time - b.time));
    return timelines;
  }
  function getLatestSLTP(symbol, atTime) {
    const timeline = sltpTimelines[symbol] || [];
    let sl = null, tp = null;
    for (const e of timeline) {
      if (e.time > atTime) break;
      if (e.sl !== null) sl = e.sl;
      if (e.tp !== null) tp = e.tp;
    }
    return { sl, tp };
  }

  /* ================================================================
     PRICE TOLERANCE
     ================================================================ */
  function priceTol(p) { return Math.max(MIN_PRICE_TOL, p * PRICE_TOL_PCT); }
  function beTol(p)    { return Math.max(MIN_PRICE_TOL, p * BE_TOL_PCT); }

  /* ================================================================
     ENTRY-ORDER MATCHER (smarter — tries 3 prices)
     ================================================================ */
  function findEntryOrder(orders, symbol, side, entryPrice, beforeTime) {
    const entrySide = side === 'long' ? 'Buy' : 'Sell';
    const tol = priceTol(entryPrice);
    let best = null, bestDist = Infinity;
    for (const o of orders) {
      if (!o.placingTime || o.placingTime > beforeTime) continue;
      if (o.symbol !== symbol || o.side !== entrySide) continue;
      if (o.status !== 'Filled') continue;
      const candidates = [o.fillPrice, o.limitPrice, o.stopPrice].filter(p => p !== null && !isNaN(p));
      for (const price of candidates) {
        const dist = Math.abs(price - entryPrice);
        if (dist <= tol && dist < bestDist) { best = o; bestDist = dist; }
      }
    }
    return best;
  }

  /* ================================================================
     SIBLING SL/TP FINDER — strict + loose fallback
     ================================================================ */
  function findSiblingSLTP(orders, entryOrder, symbol, side, entryPrice) {
    if (!entryOrder) return { sl: null, tp: null, cancelledSL: null };
    const siblings = orders.filter(o =>
      o.symbol === symbol && o.orderId !== entryOrder.orderId && o.placingTime &&
      Math.abs(o.placingTime - entryOrder.placingTime) < SIBLING_WINDOW_MS
    );
    const oppositeSide = side === 'long' ? 'Sell' : 'Buy';
    let strictSL = null, strictSLdist = Infinity;
    let strictTP = null, strictTPdist = Infinity;
    let looseSL = null, looseSLdist = Infinity;
    let looseTP = null, looseTPdist = Infinity;
    let cancelledSL = null, cancelledSLdist = Infinity;

    siblings.forEach(o => {
      if (o.side !== oppositeSide) return;
      if (o.type === 'Stop' && o.stopPrice) {
        const dist = Math.abs(o.stopPrice - entryPrice);
        const correctDir = side === 'long' ? o.stopPrice < entryPrice : o.stopPrice > entryPrice;
        if (o.status === 'Filled') {
          if (correctDir && dist < strictSLdist) { strictSL = o.stopPrice; strictSLdist = dist; }
          if (!correctDir && dist < looseSLdist) { looseSL = o.stopPrice; looseSLdist = dist; }
        } else if (o.status === 'Cancelled') {
          // Record cancelled SL for "intended risk" computation
          if (correctDir && dist < cancelledSLdist) { cancelledSL = o.stopPrice; cancelledSLdist = dist; }
        }
      }
      if (o.type === 'Limit' && o.limitPrice) {
        const dist = Math.abs(o.limitPrice - entryPrice);
        const correctDir = side === 'long' ? o.limitPrice > entryPrice : o.limitPrice < entryPrice;
        if (correctDir && dist < strictTPdist) { strictTP = o.limitPrice; strictTPdist = dist; }
        if (!correctDir && dist < looseTPdist) { looseTP = o.limitPrice; looseTPdist = dist; }
      }
    });

    return {
      sl: strictSL !== null ? strictSL : looseSL,
      tp: strictTP !== null ? strictTP : looseTP,
      cancelledSL
    };
  }

  /* ================================================================
     SMART EXIT-TYPE CLASSIFICATION (NEW in v4)
     - TP-Full:    exit ≈ TP
     - TP-Partial: profitable, exit price ≠ SL/TP (scaled out)
     - BE:         exit ≈ entry (break-even)
     - SL:         exit ≈ SL
     - Manual:     unprofitable, not matching SL
     ================================================================ */
  function classifyExit(exitPrice, slPrice, tpPrice, entryPrice, side, pnl) {
    const tol = priceTol(exitPrice);
    const beT = beTol(entryPrice);

    // 1. Direct SL/TP match
    if (slPrice && Math.abs(exitPrice - slPrice) <= tol) return 'SL';
    if (tpPrice && Math.abs(exitPrice - tpPrice) <= tol) return 'TP-Full';

    // 2. Break-even
    if (Math.abs(exitPrice - entryPrice) <= beT) return 'BE';

    // 3. Profitable, not matching TP = partial profit taking
    if (pnl > 0) {
      // Verify exit is in profit direction
      const inProfitDir = side === 'long' ? exitPrice > entryPrice : exitPrice < entryPrice;
      if (inProfitDir) return 'TP-Partial';
    }

    // 4. Unprofitable, not matching SL
    return 'Manual';
  }

  /* ================================================================
     CLOSING-ORDER MATCHER (for backup exit detection)
     ================================================================ */
  function findClosingOrderType(orders, entryOrder, closeTime, side) {
    if (!entryOrder) return null;
    const oppositeSide = side === 'long' ? 'Sell' : 'Buy';
    const closeOrders = orders.filter(o =>
      o.symbol === entryOrder.symbol &&
      o.closingTime && Math.abs(o.closingTime - closeTime) < CLOSE_WINDOW_MS &&
      o.status === 'Filled' && o.side === oppositeSide
    );
    for (const o of closeOrders) {
      if (o.type === 'Limit') return 'TP-Full';
      if (o.type === 'Stop')  return 'SL';
    }
    return null;
  }

  /* ================================================================
     TRADE BUILDER (v4 — much smarter)
     ================================================================ */
  function buildTrades(bRows, oRows) {
    const ACTION_RE = /Close (long|short) position for symbol (\S+) at price ([\d.]+) for (\d+) units\. Position AVG Price was ([\d.]+)/i;
    const orders = oRows.slice().sort((a, b) => (a.placingTime || 0) - (b.placingTime || 0));

    const trades = bRows.map(b => {
      const m = b.action.match(ACTION_RE);
      if (!m) return null;

      const side       = m[1].toLowerCase();
      const symbol     = m[2];
      const exitPrice  = parseFloat(m[3]);
      const qty        = parseInt(m[4]);
      const entryPrice = parseFloat(m[5]);
      const pnl        = b.pnl;
      const time       = b.time;
      const timeStr    = b.timeStr;

      /* ── Entry order ── */
      const entryOrder = findEntryOrder(orders, symbol, side, entryPrice, time);

      /* ── SL/TP from journal ── */
      const journalSLTP = getLatestSLTP(symbol, time);

      /* ── SL/TP from sibling orders (incl. cancelled SL) ── */
      const orderSLTP = findSiblingSLTP(orders, entryOrder, symbol, side, entryPrice);

      /* ── Merge: journal priority, then order-based, then cancelled SL ── */
      const slPrice = journalSLTP.sl !== null ? journalSLTP.sl : orderSLTP.sl;
      const tpPrice = journalSLTP.tp !== null ? journalSLTP.tp : orderSLTP.tp;
      const cancelledSL = orderSLTP.cancelledSL;

      const slSource = journalSLTP.sl !== null ? 'journal' :
                       (orderSLTP.sl !== null ? 'order' :
                        (cancelledSL !== null ? 'cancelled' : 'none'));
      const tpSource = journalSLTP.tp !== null ? 'journal' :
                       (orderSLTP.tp !== null ? 'order' : 'none');

      /* ── Effective SL for R-multiple (use cancelled SL if no active SL) ── */
      const effectiveSL = slPrice !== null ? slPrice : cancelledSL;

      /* ── Planned R:R ── */
      let rr = null;
      if (slPrice && tpPrice && entryPrice > 0) {
        const risk = Math.abs(entryPrice - slPrice);
        const reward = Math.abs(tpPrice - entryPrice);
        if (risk > 0) rr = reward / risk;
      }
      // If only cancelled SL + TP, also compute planned R:R
      if (rr === null && cancelledSL !== null && tpPrice && entryPrice > 0) {
        const risk = Math.abs(entryPrice - cancelledSL);
        const reward = Math.abs(tpPrice - entryPrice);
        if (risk > 0) rr = reward / risk;
      }

      /* ── Realized R-multiple (use effective SL: active or cancelled) ── */
      let rMultiple = null;
      if (effectiveSL !== null && entryPrice > 0 && qty > 0) {
        const riskPerUnit = Math.abs(entryPrice - effectiveSL);
        if (riskPerUnit > 0) {
          const totalRisk = riskPerUnit * qty;
          rMultiple = pnl / totalRisk;
        }
      }
      // Fallback: if TP exists but no SL, infer risk from TP assuming 1:1 RR target
      if (rMultiple === null && tpPrice !== null && entryPrice > 0 && qty > 0) {
        const rewardPerUnit = Math.abs(tpPrice - entryPrice);
        if (rewardPerUnit > 0) {
          const impliedRisk = rewardPerUnit;  // assume 1:1
          rMultiple = pnl / (impliedRisk * qty);
        }
      }

      /* ── Smart exit type ── */
      let exitType = classifyExit(exitPrice, slPrice, tpPrice, entryPrice, side, pnl);
      // Backup: check closing order if still indeterminate
      if (exitType === 'Manual' && entryOrder) {
        const closingType = findClosingOrderType(orders, entryOrder, time, side);
        if (closingType) exitType = closingType;
      }

      /* ── Hold time ── */
      let holdMs = null;
      if (entryOrder && entryOrder.placingTime) holdMs = time - entryOrder.placingTime;

      return {
        time, timeStr, symbol, side, qty,
        entryPrice, exitPrice, slPrice, tpPrice,
        cancelledSL, effectiveSL,
        rr, rMultiple, pnl,
        isWin: pnl > 0,
        exitType,
        orderId: entryOrder ? entryOrder.orderId : null,
        slSource, tpSource,
        holdMs
      };
    }).filter(Boolean);

    return trades;
  }

  /* ================================================================
     POSITION GROUPING (NEW in v4)
     Clusters partial exits of the same logical position:
     - Same symbol
     - Same entry price (within tolerance)
     - Close times within 24h
     ================================================================ */
  function groupPositions(trades) {
    const groups = [];
    trades.forEach(t => {
      // Find matching group
      let matched = null;
      for (const g of groups) {
        if (g.symbol !== t.symbol) continue;
        if (Math.abs(g.entryPrice - t.entryPrice) > priceTol(g.entryPrice)) continue;
        if (Math.abs(g.firstCloseTime - t.time) > POSITION_GROUP_TOL_MS &&
            Math.abs(g.lastCloseTime - t.time) > POSITION_GROUP_TOL_MS) continue;
        matched = g; break;
      }
      if (matched) {
        matched.closes.push(t);
        if (t.time < matched.firstCloseTime) matched.firstCloseTime = t.time;
        if (t.time > matched.lastCloseTime)  matched.lastCloseTime  = t.time;
      } else {
        groups.push({
          symbol: t.symbol, side: t.side, entryPrice: t.entryPrice,
          firstCloseTime: t.time, lastCloseTime: t.time,
          closes: [t]
        });
      }
    });

    // Compute position-level metrics
    return groups.map((g, i) => {
      const totalQty = g.closes.reduce((s, t) => s + t.qty, 0);
      const totalPnL = g.closes.reduce((s, t) => s + t.pnl, 0);
      const wins = g.closes.filter(t => t.isWin).length;
      const slPrice = g.closes[0].slPrice || g.closes[0].cancelledSL;
      const tpPrice = g.closes[0].tpPrice;

      // Position-level R-multiple: sum of partial R-multiples (or weighted avg)
      const rCloses = g.closes.filter(t => t.rMultiple !== null);
      let totalR = null;
      if (rCloses.length && slPrice) {
        const riskPerUnit = Math.abs(g.entryPrice - slPrice);
        if (riskPerUnit > 0) totalR = totalPnL / (riskPerUnit * totalQty);
      }

      let rr = null;
      if (slPrice && tpPrice && g.entryPrice > 0) {
        const risk = Math.abs(g.entryPrice - slPrice);
        const reward = Math.abs(tpPrice - g.entryPrice);
        if (risk > 0) rr = reward / risk;
      }

      return {
        id: i + 1,
        symbol: g.symbol, side: g.side, entryPrice: g.entryPrice,
        slPrice, tpPrice, rr, totalR, totalPnL, totalQty,
        closesCount: g.closes.length, winRate: wins / g.closes.length * 100,
        firstCloseTime: g.firstCloseTime,
        isWin: totalPnL > 0,
        closes: g.closes
      };
    }).sort((a, b) => a.firstCloseTime - b.firstCloseTime);
  }

  /* ================================================================
     METRICS CALCULATOR
     ================================================================ */
  function calcMetrics(trades, positions) {
    if (!trades.length) return null;

    const wins   = trades.filter(t => t.isWin);
    const losses = trades.filter(t => !t.isWin);

    const totalPL   = trades.reduce((s, t) => s + t.pnl, 0);
    const winRate   = wins.length / trades.length * 100;
    const grossWin  = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const avgWin    = wins.length   ? grossWin  / wins.length   : 0;
    const avgLoss   = losses.length ? grossLoss / losses.length : 0;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
    const expectancy   = (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss;

    const rrTrades = trades.filter(t => t.rr !== null && t.rr > 0);
    const avgRR    = rrTrades.length ? rrTrades.reduce((s, t) => s + t.rr, 0) / rrTrades.length : 0;

    const rTrades  = trades.filter(t => t.rMultiple !== null);
    const avgR     = rTrades.length ? rTrades.reduce((s, t) => s + t.rMultiple, 0) / rTrades.length : 0;

    // Position-level metrics (NEW)
    const posWins   = positions.filter(p => p.isWin);
    const posLosses = positions.filter(p => !p.isWin);
    const posWinRate = posWins.length / positions.length * 100;
    const posRTrades = positions.filter(p => p.totalR !== null);
    const posAvgR    = posRTrades.length ? posRTrades.reduce((s, p) => s + p.totalR, 0) / posRTrades.length : 0;

    // Drawdown
    let peak = 0, maxDD = 0, ddPct = 0;
    const cumul = [];
    trades.reduce((acc, t) => { acc += t.pnl; cumul.push(acc); return acc; }, 0);
    cumul.forEach(v => { if (v > peak) peak = v; const dd = peak - v; if (dd > maxDD) maxDD = dd; });
    if (peak > 0) ddPct = (maxDD / (peak + 100000)) * 100;

    // Streaks
    let maxCW = 0, maxCL = 0, cw = 0, cl = 0;
    trades.forEach(t => {
      if (t.isWin) { cw++; cl = 0; if (cw > maxCW) maxCW = cw; }
      else         { cl++; cw = 0; if (cl > maxCL) maxCL = cl; }
    });

    // Equity series
    const equitySeries = [];
    let runningBalance = balanceRows.length ? balanceRows[0].balanceBefore : 100000;
    equitySeries.push({ time: balanceRows.length ? balanceRows[0].time : trades[0].time, balance: runningBalance });
    balanceRows.forEach(b => { runningBalance = b.balanceAfter; equitySeries.push({ time: b.time, balance: runningBalance }); });

    // Per-symbol stats
    const bySymbol = {};
    trades.forEach(t => { (bySymbol[t.symbol] = bySymbol[t.symbol] || []).push(t); });
    const symbolStats = Object.keys(bySymbol).map(sym => computeStats(bySymbol[sym], sym)).sort((a, b) => b.totalPL - a.totalPL);

    // Per-side
    const bySide = { long: trades.filter(t => t.side === 'long'), short: trades.filter(t => t.side === 'short') };
    const sideStats = { long: computeStats(bySide.long, 'Long'), short: computeStats(bySide.short, 'Short') };

    // Per-exit-type (5 categories now)
    const byExit = { 'TP-Full': [], 'TP-Partial': [], 'SL': [], 'BE': [], 'Manual': [] };
    trades.forEach(t => { if (byExit[t.exitType]) byExit[t.exitType].push(t); });
    const exitStats = {
      'TP-Full':    computeStats(byExit['TP-Full'],    'Take Profit'),
      'TP-Partial': computeStats(byExit['TP-Partial'], 'Partial Profit'),
      'SL':         computeStats(byExit['SL'],         'Stop Loss'),
      'BE':         computeStats(byExit['BE'],         'Break Even'),
      'Manual':     computeStats(byExit['Manual'],     'Manual')
    };

    // Hourly
    const byHour = {};
    for (let h = 0; h < 24; h++) byHour[h] = 0;
    trades.forEach(t => { byHour[t.time.getUTCHours()] += t.pnl; });

    // Daily
    const byDay = {};
    trades.forEach(t => { const d = t.time.toISOString().slice(0, 10); byDay[d] = (byDay[d] || 0) + t.pnl; });

    return {
      trades, positions, wins, losses,
      totalPL, winRate, grossWin, grossLoss, avgWin, avgLoss,
      profitFactor, expectancy, avgRR, avgR,
      posWinRate, posAvgR, posWins, posLosses,
      maxDD, ddPct, maxCW, maxCL,
      cumul, equitySeries,
      bestTrade: Math.max.apply(null, trades.map(t => t.pnl)),
      worstTrade: Math.min.apply(null, trades.map(t => t.pnl)),
      avgTrade: totalPL / trades.length,
      startingBalance: balanceRows.length ? balanceRows[0].balanceBefore : 0,
      endingBalance: balanceRows.length ? balanceRows[balanceRows.length - 1].balanceAfter : 0,
      symbolStats, sideStats, exitStats,
      byHour, byDay,
      rrTrades, rTrades
    };
  }

  function computeStats(arr, label) {
    if (!arr.length) return { label, count: 0, totalPL: 0, winRate: 0, avgRR: 0, avgR: 0, avgWin: 0, avgLoss: 0, profitFactor: 0, wins: 0, losses: 0 };
    const wins = arr.filter(t => t.isWin);
    const losses = arr.filter(t => !t.isWin);
    const totalPL = arr.reduce((s, t) => s + t.pnl, 0);
    const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const rrArr = arr.filter(t => t.rr !== null && t.rr > 0);
    const rArr  = arr.filter(t => t.rMultiple !== null);
    return {
      label, count: arr.length,
      wins: wins.length, losses: losses.length,
      totalPL,
      winRate: wins.length / arr.length * 100,
      avgRR:   rrArr.length ? rrArr.reduce((s, t) => s + t.rr, 0) / rrArr.length : 0,
      avgR:    rArr.length  ? rArr.reduce((s, t) => s + t.rMultiple, 0) / rArr.length : 0,
      avgWin:  wins.length   ? grossWin  / wins.length   : 0,
      avgLoss: losses.length ? grossLoss / losses.length : 0,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0)
    };
  }

  /* ================================================================
     FORMAT HELPERS
     ================================================================ */
  function fmt(v) { const sign = v >= 0 ? '+' : '−'; return sign + '$' + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtAbs(v) { return '$' + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtRR(v)  { return v === null ? '—' : v.toFixed(2) + 'R'; }
  function fmtR(v)   { return v === null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + 'R'; }
  function fmtHold(ms) {
    if (ms === null) return '—';
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + (s % 60) + 's';
    const h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
  }

  /* ================================================================
     CHART HELPERS
     ================================================================ */
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function palette() {
    return {
      gold:     cssVar('--gold')        || '#fbbf24',
      goldBright:cssVar('--gold-bright')|| '#fcd34d',
      green:    cssVar('--win')         || '#22c55e',
      greenBright:cssVar('--win-bright')|| '#4ade80',
      red:      cssVar('--loss')        || '#f43f5e',
      redBright:cssVar('--loss-bright')|| '#fb7185',
      blue:     cssVar('--info')        || '#3b82f6',
      purple:   cssVar('--purple')      || '#a855f7',
      cyan:     cssVar('--cyan')        || '#06b6d4',
      orange:   cssVar('--orange')      || '#f97316',
      text2:    cssVar('--text-2')      || '#e4e4e7',
      text3:    cssVar('--text-3')      || '#a1a1aa',
      grid:     cssVar('--grid')        || 'rgba(255,255,255,0.06)'
    };
  }
  function tooltipStyle() {
    const dark = currentTheme === 'dark';
    return {
      backgroundColor: dark ? 'rgba(13,13,18,0.96)' : 'rgba(255,255,255,0.96)',
      titleColor: dark ? '#f5f5f7' : '#0a0a12',
      bodyColor:  dark ? '#b8b8c2' : '#4b4b58',
      borderColor: dark ? 'rgba(251,191,36,0.3)' : 'rgba(251,191,36,0.45)',
      borderWidth: 1, padding: 10, cornerRadius: 8,
      titleFont: { weight: '700', family: 'Plus Jakarta Sans', size: 12 },
      bodyFont:  { family: 'JetBrains Mono', size: 11 },
      displayColors: true, boxPadding: 3
    };
  }
  function gridOpts() { return { color: palette().grid, drawTicks: false, drawBorder: false }; }
  function tickOpts() { return { color: palette().text3, font: { family: 'JetBrains Mono', size: 10 }, padding: 6 }; }
  function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

  /* ================================================================
     RENDERERS
     ================================================================ */
  function renderKPIs() {
    const m = metrics; if (!m) return;
    const returnPct = m.startingBalance > 0 ? (m.totalPL / m.startingBalance) * 100 : 0;
    const cards = [
      { label: 'Net Profit', icon: ICONS.dollar, accent: 'gold',
        value: fmt(m.totalPL),
        valueClass: m.totalPL >= 0 ? 'is-win' : 'is-loss',
        sub: `<span class="kpi-trend ${returnPct >= 0 ? '' : 'is-down'}">${returnPct >= 0 ? '▲' : '▼'} ${Math.abs(returnPct).toFixed(2)}%</span>` },
      { label: 'Win Rate', icon: ICONS.target, accent: 'green',
        value: m.winRate.toFixed(1) + '%', valueClass: 'is-win',
        sub: `<strong>${m.wins.length}</strong>W · <strong>${m.losses.length}</strong>L` },
      { label: 'Avg Planned R:R', icon: ICONS.scale, accent: 'gold',
        value: m.avgRR.toFixed(2) + 'R', valueClass: 'is-gold',
        sub: `<strong>${m.rrTrades.length}</strong>/${m.trades.length} have SL+TP` },
      { label: 'Avg Realized R', icon: ICONS.zap, accent: 'gold',
        value: (m.avgR >= 0 ? '+' : '') + m.avgR.toFixed(2) + 'R',
        valueClass: m.avgR >= 0 ? 'is-win' : 'is-loss',
        sub: `<strong>${m.rTrades.length}</strong>/${m.trades.length} have risk data` },
      { label: 'Profit Factor', icon: ICONS.flame, accent: 'gold',
        value: m.profitFactor === Infinity ? '∞' : m.profitFactor.toFixed(2),
        valueClass: m.profitFactor >= 1 ? 'is-win' : 'is-loss',
        sub: `Gross win / loss` },
      { label: 'Position Win Rate', icon: ICONS.layers, accent: 'green',
        value: m.posWinRate.toFixed(1) + '%', valueClass: 'is-win',
        sub: `<strong>${m.posWins.length}</strong>W · <strong>${m.posLosses.length}</strong>L of ${m.positions.length} positions` },
      { label: 'Max Drawdown', icon: ICONS.shield, accent: 'red',
        value: '−' + fmtAbs(m.maxDD), valueClass: 'is-loss',
        sub: `<strong>${m.ddPct.toFixed(1)}%</strong> from peak` },
      { label: 'Best / Worst', icon: ICONS.award, accent: 'gold',
        value: fmtAbs(m.bestTrade), valueClass: 'is-win',
        sub: `Worst: <span class="pl-neg">${fmt(m.worstTrade)}</span>` }
    ];
    const html = cards.map(c => {
      const accentVar = c.accent === 'gold' ? '--gold' : c.accent === 'green' ? '--win' : c.accent === 'red' ? '--loss' : '--gold';
      return `<div class="kpi-card kpi--${c.accent}" style="--accent: var(${accentVar})">
        <div class="kpi-label"><span class="kpi-label-ico">${c.icon}</span>${c.label}</div>
        <div class="kpi-value ${c.valueClass}">${c.value}</div>
        <div class="kpi-sub">${c.sub}</div>
      </div>`;
    }).join('');
    const grid = document.getElementById('kpiGrid');
    if (grid) grid.innerHTML = html;
  }

  function renderEquityChart() {
    const ctx = document.getElementById('equityChart'); if (!ctx) return;
    destroyChart('equity');
    const p = palette();
    const data = metrics.equitySeries;
    const labels = data.map(d => d.time.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }));
    const balances = data.map(d => d.balance);
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, 'rgba(251, 191, 36, 0.42)');
    gradient.addColorStop(1, 'rgba(251, 191, 36, 0.02)');
    charts.equity = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Balance', data: balances, borderColor: p.gold, backgroundColor: gradient, borderWidth: 2, fill: true, tension: 0.28, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: p.gold, pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { ...tooltipStyle(), callbacks: { label: c => 'Balance: ' + fmtAbs(c.parsed.y) } } },
        scales: {
          x: { grid: gridOpts(), ticks: { ...tickOpts(), maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
          y: { grid: gridOpts(), ticks: { ...tickOpts(), callback: v => '$' + (v / 1000).toFixed(1) + 'k' } }
        }
      }
    });
    const legend = document.getElementById('equityLegend');
    if (legend) {
      legend.innerHTML = `<div class="card-legend">
        <span><span class="dot" style="background:${p.gold}"></span>Balance</span>
        <span style="color:${p.text3}">Start: <strong style="color:${p.text2};font-family:var(--font-mono)">${fmtAbs(metrics.startingBalance)}</strong></span>
        <span style="color:${p.text3}">End: <strong style="color:${metrics.totalPL >= 0 ? p.greenBright : p.redBright};font-family:var(--font-mono)">${fmtAbs(metrics.endingBalance)}</strong></span>
      </div>`;
    }
  }

  function renderWinLossChart() {
    const ctx = document.getElementById('winLossChart'); if (!ctx) return;
    destroyChart('winLoss');
    const p = palette();
    charts.winLoss = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['Wins', 'Losses'], datasets: [{ data: [metrics.wins.length, metrics.losses.length], backgroundColor: [p.green, p.red], borderColor: 'transparent', borderWidth: 0, hoverOffset: 8, hoverBorderColor: '#fff', hoverBorderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '72%',
        plugins: {
          legend: { position: 'bottom', labels: { color: p.text2, font: { family: 'Inter', size: 11 }, padding: 10, usePointStyle: true, pointStyle: 'circle' } },
          tooltip: { ...tooltipStyle(), callbacks: { label: c => c.label + ': ' + c.parsed + ' (' + (c.parsed / metrics.trades.length * 100).toFixed(1) + '%)' } }
        }
      },
      plugins: [{
        id: 'centerText',
        afterDraw: (chart) => {
          const { ctx, chartArea } = chart; if (!chartArea) return;
          const cx = (chartArea.left + chartArea.right) / 2;
          const cy = (chartArea.top + chartArea.bottom) / 2;
          ctx.save();
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = p.goldBright; ctx.font = '700 22px JetBrains Mono';
          ctx.fillText(metrics.winRate.toFixed(1) + '%', cx, cy - 6);
          ctx.fillStyle = p.text3; ctx.font = '600 9px Inter';
          ctx.fillText('WIN RATE', cx, cy + 12);
          ctx.restore();
        }
      }]
    });
  }

  function renderPLPerTradeChart() {
    const ctx = document.getElementById('plPerTradeChart'); if (!ctx) return;
    destroyChart('plPerTrade');
    const p = palette();
    const data = metrics.trades;
    const labels = data.map((t, i) => '#' + (i + 1));
    const colors = data.map(t => {
      // Color by exit type for richer info
      if (t.exitType === 'TP-Full')    return p.greenBright;
      if (t.exitType === 'TP-Partial') return p.green;
      if (t.exitType === 'SL')         return p.redBright;
      if (t.exitType === 'BE')         return p.text3;
      return p.red;
    });
    charts.plPerTrade = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'P&L', data: data.map(t => t.pnl), backgroundColor: colors, borderRadius: 3, borderSkipped: false }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { ...tooltipStyle(), callbacks: { label: c => 'P&L: ' + fmt(c.parsed.y), afterLabel: c => { const t = data[c.dataIndex]; return [t.symbol + ' · ' + t.side, 'R:R ' + fmtRR(t.rr), 'R ' + fmtR(t.rMultiple), 'Exit: ' + t.exitType]; } } } },
        scales: {
          x: { grid: { display: false }, ticks: { ...tickOpts(), maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { grid: gridOpts(), ticks: { ...tickOpts(), callback: v => '$' + v.toFixed(0) } }
        }
      }
    });
  }

  function renderExitTypeChart() {
    const ctx = document.getElementById('exitTypeChart'); if (!ctx) return;
    destroyChart('exitType');
    const p = palette();
    const e = metrics.exitStats;
    const labels = ['TP-Full', 'TP-Partial', 'SL', 'BE', 'Manual'];
    const data = labels.map(l => e[l].count);
    const colors = [p.greenBright, p.green, p.redBright, p.text3, p.red];
    charts.exitType = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['Take Profit', 'Partial Profit', 'Stop Loss', 'Break Even', 'Manual'], datasets: [{ data, backgroundColor: colors, borderColor: 'transparent', borderWidth: 0, hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '64%',
        plugins: {
          legend: { position: 'bottom', labels: { color: p.text2, font: { family: 'Inter', size: 10 }, padding: 8, usePointStyle: true, pointStyle: 'circle' } },
          tooltip: { ...tooltipStyle(), callbacks: { label: c => c.label + ': ' + c.parsed + ' trades' } }
        }
      }
    });
  }

  function renderSymbolTable() {
    const tbody = document.querySelector('#symbolTable tbody'); if (!tbody) return;
    const p = palette();
    const stats = metrics.symbolStats;
    const maxPL = Math.max.apply(null, stats.map(s => Math.abs(s.totalPL)));
    tbody.innerHTML = stats.map(s => {
      const plClass = s.totalPL >= 0 ? 'pl-pos' : 'pl-neg';
      const pfStr = s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2);
      const barW = (Math.abs(s.totalPL) / maxPL * 100).toFixed(1);
      return `<tr>
        <td><strong style="color:${p.text2}">${s.label}</strong></td>
        <td class="num">${s.count}</td>
        <td class="num"><span style="color:${s.winRate >= 50 ? p.greenBright : p.redBright};font-weight:700">${s.winRate.toFixed(1)}%</span></td>
        <td class="num"><span style="color:${p.gold};font-weight:700">${s.avgRR.toFixed(2)}R</span></td>
        <td class="num"><span style="color:${s.avgR >= 0 ? p.greenBright : p.redBright};font-weight:700">${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R</span></td>
        <td class="num ${plClass}">${fmt(s.totalPL)}</td>
        <td class="num pl-pos">${s.avgWin ? fmtAbs(s.avgWin) : '—'}</td>
        <td class="num pl-neg">${s.avgLoss ? fmtAbs(s.avgLoss) : '—'}</td>
        <td class="num">${pfStr}</td>
        <td class="bar-cell"><div class="bar-track"><div class="bar-fill" style="width:${barW}%;background:linear-gradient(90deg, ${s.totalPL >= 0 ? p.greenBright : p.redBright}, ${s.totalPL >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(244,63,94,0.3)'})"></div></div></td>
      </tr>`;
    }).join('');
  }

  function renderPositionsTable() {
    const tbody = document.querySelector('#positionsTable tbody');
    if (!tbody) return;
    const p = palette();
    const positions = metrics.positions;
    tbody.innerHTML = positions.map(pos => {
      const plClass = pos.totalPnL >= 0 ? 'pl-pos' : 'pl-neg';
      const rClass = pos.totalR !== null ? (pos.totalR >= 0 ? 'pl-pos' : 'pl-neg') : '';
      const slDisplay = pos.slPrice !== null ? pos.slPrice.toFixed(2) : '—';
      const tpDisplay = pos.tpPrice !== null ? pos.tpPrice.toFixed(2) : '—';
      const rrDisplay = pos.rr !== null ? `<span style="color:${p.gold};font-weight:700">${pos.rr.toFixed(2)}R</span>` : '—';
      const rDisplay = pos.totalR !== null
        ? `<span style="color:${pos.totalR >= 0 ? p.greenBright : p.redBright};font-weight:700">${pos.totalR >= 0 ? '+' : ''}${pos.totalR.toFixed(2)}R</span>`
        : '—';
      return `<tr>
        <td><strong style="color:${p.gold}">#${pos.id}</strong></td>
        <td><strong style="color:${p.text2}">${pos.symbol}</strong></td>
        <td><span class="side-pill ${pos.side}">${pos.side}</span></td>
        <td class="num">${pos.totalQty}</td>
        <td class="num">${pos.entryPrice.toFixed(2)}</td>
        <td class="num">${slDisplay}</td>
        <td class="num">${tpDisplay}</td>
        <td class="num">${rrDisplay}</td>
        <td class="num ${rClass}">${rDisplay}</td>
        <td class="num">${pos.closesCount}</td>
        <td class="num ${plClass}">${fmt(pos.totalPnL)}</td>
      </tr>`;
    }).join('');
  }

  function renderSymbolCharts() {
    const ctx1 = document.getElementById('symbolWinRateChart');
    const ctx2 = document.getElementById('symbolRRChart');
    if (!ctx1 || !ctx2) return;
    destroyChart('symbolWR'); destroyChart('symbolRR');
    const p = palette();
    const stats = metrics.symbolStats;
    const labels = stats.map(s => s.label.replace(/^[A-Z]+:/, ''));

    charts.symbolWR = new Chart(ctx1, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Win Rate %', data: stats.map(s => s.winRate), backgroundColor: stats.map(s => s.winRate >= 50 ? p.green : p.red), borderRadius: 4, borderSkipped: false }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { ...tooltipStyle(), callbacks: { label: c => 'Win Rate: ' + c.parsed.x.toFixed(1) + '%' } } },
        scales: { x: { grid: gridOpts(), ticks: { ...tickOpts(), callback: v => v + '%' }, max: 100 }, y: { grid: { display: false }, ticks: { ...tickOpts(), font: { family: 'JetBrains Mono', size: 10 } } } }
      }
    });

    charts.symbolRR = new Chart(ctx2, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Avg R:R', data: stats.map(s => s.avgRR), backgroundColor: p.gold, borderRadius: 4, borderSkipped: false }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { ...tooltipStyle(), callbacks: { label: c => 'Avg R:R: ' + c.parsed.x.toFixed(2) + 'R' } } },
        scales: { x: { grid: gridOpts(), ticks: { ...tickOpts(), callback: v => v.toFixed(1) + 'R' } }, y: { grid: { display: false }, ticks: { ...tickOpts(), font: { family: 'JetBrains Mono', size: 10 } } } }
      }
    });
  }

  function renderSideChart() {
    const ctx = document.getElementById('sideChart'); if (!ctx) return;
    destroyChart('side');
    const p = palette();
    const s = metrics.sideStats;
    charts.side = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Trades', 'Win %', 'R:R (×5)', 'Avg R', 'P&L ($k)'],
        datasets: [
          { label: 'Long',  data: [s.long.count, s.long.winRate, s.long.avgRR * 5, s.long.avgR, s.long.totalPL / 1000], backgroundColor: p.blue, borderRadius: 4 },
          { label: 'Short', data: [s.short.count, s.short.winRate, s.short.avgRR * 5, s.short.avgR, s.short.totalPL / 1000], backgroundColor: p.purple, borderRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'end', labels: { color: p.text2, font: { family: 'Inter', size: 11 }, usePointStyle: true, pointStyle: 'circle', padding: 10 } }, tooltip: { ...tooltipStyle() } },
        scales: { x: { grid: { display: false }, ticks: tickOpts() }, y: { grid: gridOpts(), ticks: tickOpts() } }
      }
    });
  }

  function initCalendarMonth() {
    if (metrics.trades.length) {
      const range = metrics.trades.map(t => t.time);
      const last = new Date(Math.max.apply(null, range));
      calYear = last.getUTCFullYear();
      calMonth = last.getUTCMonth();
    } else {
      const now = new Date();
      calYear = now.getUTCFullYear();
      calMonth = now.getUTCMonth();
    }
  }

  function renderCalendar() {
    const container = document.getElementById('calendar');
    const label = document.getElementById('calMonthLabel');
    if (!container || !label) return;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    label.textContent = monthNames[calMonth] + ' ' + calYear;
    const dayMap = {};
    Object.keys(metrics.byDay).forEach(d => {
      const dt = new Date(d + 'T00:00:00Z');
      if (dt.getUTCFullYear() === calYear && dt.getUTCMonth() === calMonth) dayMap[dt.getUTCDate()] = metrics.byDay[d];
    });
    const firstDay = new Date(Date.UTC(calYear, calMonth, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(calYear, calMonth + 1, 0)).getUTCDate();
    const today = new Date();
    const isCurrentMonth = (today.getUTCFullYear() === calYear && today.getUTCMonth() === calMonth);
    const dows = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < firstDay; i++) html += '<div class="cal-day cal-empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const pl = dayMap[d];
      const cls = pl === undefined ? '' : (pl >= 0 ? 'win' : 'loss');
      const hasTrades = pl !== undefined ? 'has-trades' : '';
      const todayCls = (isCurrentMonth && d === today.getUTCDate()) ? 'today' : '';
      const plStr = pl !== undefined ? (pl >= 0 ? '+' : '') + Math.round(pl) : '';
      html += `<div class="cal-day ${cls} ${hasTrades} ${todayCls}" data-day="${d}"><span class="cal-day-num">${d}</span>${pl !== undefined ? `<span class="cal-day-pl">${plStr}</span>` : ''}</div>`;
    }
    container.innerHTML = html;
  }

  function initCalendarNav() {
    const prev = document.getElementById('calPrev');
    const next = document.getElementById('calNext');
    if (prev) prev.addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
    if (next) next.addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });
  }

  function renderDailyPLChart() {
    const ctx = document.getElementById('dailyPLChart'); if (!ctx) return;
    destroyChart('dailyPL');
    const p = palette();
    const days = Object.keys(metrics.byDay).sort();
    const labels = days.map(d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }));
    const values = days.map(d => metrics.byDay[d]);
    const colors = values.map(v => v >= 0 ? p.greenBright : p.redBright);
    charts.dailyPL = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Daily P&L', data: values, backgroundColor: colors, borderRadius: 3, borderSkipped: false }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { ...tooltipStyle(), callbacks: { label: c => 'P&L: ' + fmt(c.parsed.y) } } },
        scales: { x: { grid: { display: false }, ticks: { ...tickOpts(), maxRotation: 0 } }, y: { grid: gridOpts(), ticks: { ...tickOpts(), callback: v => '$' + v.toFixed(0) } } }
      }
    });
  }

  function initFilters() {
    const symbolSel = document.getElementById('filterSymbol');
    if (symbolSel && metrics) {
      const symbols = Array.from(new Set(metrics.trades.map(t => t.symbol))).sort();
      symbols.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s.replace(/^[A-Z]+:/, '');
        symbolSel.appendChild(opt);
      });
    }
    const sideSel = document.getElementById('filterSide');
    const outcomeSel = document.getElementById('filterOutcome');
    const search = document.getElementById('filterSearch');
    if (symbolSel)  symbolSel.addEventListener('change', () => { activeFilters.symbol  = symbolSel.value;  renderTradesTable(); });
    if (sideSel)    sideSel.addEventListener('change',   () => { activeFilters.side    = sideSel.value;    renderTradesTable(); });
    if (outcomeSel) outcomeSel.addEventListener('change',() => { activeFilters.outcome = outcomeSel.value; renderTradesTable(); });
    if (search)     search.addEventListener('input',     () => { activeFilters.search  = search.value.toLowerCase(); renderTradesTable(); });
  }

  function renderTradesTable() {
    const tbody = document.querySelector('#tradesTable tbody'); if (!tbody) return;
    const p = palette();
    let data = metrics.trades.slice().reverse();
    if (activeFilters.symbol !== 'all')  data = data.filter(t => t.symbol === activeFilters.symbol);
    if (activeFilters.side !== 'all')    data = data.filter(t => t.side === activeFilters.side);
    if (activeFilters.outcome === 'win') data = data.filter(t => t.isWin);
    if (activeFilters.outcome === 'loss')data = data.filter(t => !t.isWin);
    if (activeFilters.search) {
      data = data.filter(t =>
        t.symbol.toLowerCase().includes(activeFilters.search) ||
        t.side.toLowerCase().includes(activeFilters.search) ||
        t.exitType.toLowerCase().includes(activeFilters.search) ||
        t.timeStr.toLowerCase().includes(activeFilters.search)
      );
    }
    tbody.innerHTML = data.map(t => {
      const plClass = t.pnl >= 0 ? 'pl-pos' : 'pl-neg';
      const exitTag = (() => {
        if (t.exitType === 'TP-Full')    return `<span class="tag tag-win">TP</span>`;
        if (t.exitType === 'TP-Partial') return `<span class="tag tag-tp-partial">PARTIAL</span>`;
        if (t.exitType === 'SL')         return `<span class="tag tag-loss">SL</span>`;
        if (t.exitType === 'BE')         return `<span class="tag tag-be">BE</span>`;
        return `<span class="tag tag-manual">MANUAL</span>`;
      })();
      const sideTag = `<span class="side-pill ${t.side}">${t.side}</span>`;
      const rrDisplay = t.rr !== null
        ? `<span style="color:${p.gold};font-weight:700">${t.rr.toFixed(2)}R</span>`
        : `<span style="color:${p.text3}">—</span>`;
      const rDisplay = t.rMultiple !== null
        ? `<span style="color:${t.rMultiple >= 0 ? p.greenBright : p.redBright};font-weight:700">${t.rMultiple >= 0 ? '+' : ''}${t.rMultiple.toFixed(2)}R</span>`
        : `<span style="color:${p.text3}">—</span>`;
      const slDisplay = t.slPrice !== null
        ? `<span style="color:${p.text2}">${t.slPrice.toFixed(2)}</span>`
        : (t.cancelledSL !== null
          ? `<span style="color:${p.text3};text-decoration:line-through" title="SL was cancelled">${t.cancelledSL.toFixed(2)}</span>`
          : `<span style="color:${p.text3}">—</span>`);
      const tpDisplay = t.tpPrice !== null
        ? `<span style="color:${p.text2}">${t.tpPrice.toFixed(2)}</span>`
        : `<span style="color:${p.text3}">—</span>`;
      return `<tr>
        <td style="color:${p.text3};font-family:var(--font-mono);font-size:11px">${t.timeStr}</td>
        <td><strong style="color:${p.text2}">${t.symbol.replace(/^[A-Z]+:/, '')}</strong></td>
        <td>${sideTag}</td>
        <td class="num">${t.qty}</td>
        <td class="num">${t.entryPrice.toFixed(2)}</td>
        <td class="num">${t.exitPrice.toFixed(2)}</td>
        <td class="num">${slDisplay}</td>
        <td class="num">${tpDisplay}</td>
        <td class="num">${rrDisplay}</td>
        <td class="num">${rDisplay}</td>
        <td class="num ${plClass}">${fmt(t.pnl)}</td>
        <td>${exitTag}</td>
      </tr>`;
    }).join('');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:24px;color:${p.text3}">No trades match filters</td></tr>`;
    }
  }

  function renderMetricsGrid() {
    const grid = document.getElementById('metricsGrid'); if (!grid) return;
    const m = metrics;
    const cells = [
      { label: 'Trades',          value: m.trades.length,            sub: `${m.wins.length}W / ${m.losses.length}L` },
      { label: 'Positions',       value: m.positions.length,         sub: `${m.posWins.length}W / ${m.posLosses.length}L` },
      { label: 'Avg Win',         value: fmtAbs(m.avgWin),  cls: 'is-win',  sub: 'Per winning trade' },
      { label: 'Avg Loss',        value: '−' + fmtAbs(m.avgLoss), cls: 'is-loss', sub: 'Per losing trade' },
      { label: 'Avg Trade',       value: fmt(m.avgTrade),   cls: m.avgTrade >= 0 ? 'is-win' : 'is-loss', sub: 'Mean P&L' },
      { label: 'Best',            value: fmt(m.bestTrade),  cls: 'is-win',  sub: 'Largest win' },
      { label: 'Worst',           value: fmt(m.worstTrade), cls: 'is-loss', sub: 'Largest loss' },
      { label: 'Win Streak',      value: m.maxCW,           cls: 'is-gold', sub: 'Max consecutive' },
      { label: 'Loss Streak',     value: m.maxCL,           cls: 'is-loss', sub: 'Max consecutive' },
      { label: 'Expectancy',      value: fmt(m.expectancy), cls: m.expectancy >= 0 ? 'is-win' : 'is-loss', sub: 'Per trade EV' }
    ];
    grid.innerHTML = cells.map(c => `
      <div class="metric-cell">
        <div class="kpi-label">${c.label}</div>
        <div class="kpi-value ${c.cls || ''}">${c.value}</div>
        <div class="kpi-sub">${c.sub}</div>
      </div>`).join('');
  }

  function renderRRDistChart() {
    const ctx = document.getElementById('rrDistChart'); if (!ctx) return;
    destroyChart('rrDist');
    const p = palette();
    const buckets = [
      { label: '<0.5R', min: 0,   max: 0.5,  color: p.red },
      { label: '0.5-1R', min: 0.5, max: 1,    color: p.orange },
      { label: '1-1.5R', min: 1,   max: 1.5,  color: p.gold },
      { label: '1.5-2R', min: 1.5, max: 2,    color: p.gold },
      { label: '2-3R',   min: 2,   max: 3,    color: p.greenBright },
      { label: '3R+',    min: 3,   max: Infinity, color: p.greenBright }
    ];
    const counts = buckets.map(b => metrics.rrTrades.filter(t => t.rr >= b.min && t.rr < b.max).length);
    charts.rrDist = new Chart(ctx, {
      type: 'bar',
      data: { labels: buckets.map(b => b.label), datasets: [{ label: 'Trades', data: counts, backgroundColor: buckets.map(b => b.color), borderRadius: 4, borderSkipped: false }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { ...tooltipStyle(), callbacks: { label: c => c.parsed.y + ' trades' } } },
        scales: { x: { grid: { display: false }, ticks: tickOpts() }, y: { grid: gridOpts(), ticks: { ...tickOpts(), stepSize: 1 } } }
      }
    });
  }

  function renderRMultDistChart() {
    const ctx = document.getElementById('rMultChart'); if (!ctx) return;
    destroyChart('rMult');
    const p = palette();
    const buckets = [
      { label: '≤−2R',  min: -Infinity, max: -2,   color: p.redBright },
      { label: '−2 to −1R', min: -2, max: -1, color: p.red },
      { label: '−1 to 0R',  min: -1, max: 0,  color: p.orange },
      { label: '0 to 1R',   min: 0,  max: 1,  color: p.gold },
      { label: '1 to 2R',   min: 1,  max: 2,  color: p.green },
      { label: '2 to 3R',   min: 2,  max: 3,  color: p.greenBright },
      { label: '3R+',       min: 3,  max: Infinity, color: p.greenBright }
    ];
    const rTrades = metrics.trades.filter(t => t.rMultiple !== null);
    const counts = buckets.map(b => rTrades.filter(t => t.rMultiple >= b.min && t.rMultiple < b.max).length);
    charts.rMult = new Chart(ctx, {
      type: 'bar',
      data: { labels: buckets.map(b => b.label), datasets: [{ label: 'Trades', data: counts, backgroundColor: buckets.map(b => b.color), borderRadius: 4, borderSkipped: false }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { ...tooltipStyle(), callbacks: { label: c => c.parsed.y + ' trades' } } },
        scales: { x: { grid: { display: false }, ticks: tickOpts() }, y: { grid: gridOpts(), ticks: { ...tickOpts(), stepSize: 1 } } }
      }
    });
  }

  function renderHourlyChart() {
    const ctx = document.getElementById('hourlyChart'); if (!ctx) return;
    destroyChart('hourly');
    const p = palette();
    const hours = []; for (let h = 0; h < 24; h++) hours.push(h);
    const values = hours.map(h => metrics.byHour[h] || 0);
    const colors = values.map(v => v >= 0 ? p.greenBright : p.redBright);
    charts.hourly = new Chart(ctx, {
      type: 'bar',
      data: { labels: hours.map(h => String(h).padStart(2, '0')), datasets: [{ label: 'P&L', data: values, backgroundColor: colors, borderRadius: 3, borderSkipped: false }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { ...tooltipStyle(), callbacks: { label: c => 'P&L: ' + fmt(c.parsed.y) } } },
        scales: { x: { grid: { display: false }, ticks: { ...tickOpts(), maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }, y: { grid: gridOpts(), ticks: { ...tickOpts(), callback: v => '$' + v.toFixed(0) } } }
      }
    });
  }

  function renderCumulChart() {
    const ctx = document.getElementById('cumulChart'); if (!ctx) return;
    destroyChart('cumul');
    const p = palette();
    let cw = 0, cl = 0;
    const labels = [], winsArr = [], lossArr = [];
    metrics.trades.forEach((t, i) => {
      if (t.isWin) cw++; else cl++;
      labels.push('#' + (i + 1));
      winsArr.push(cw); lossArr.push(-cl);
    });
    charts.cumul = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Wins',   data: winsArr, borderColor: p.greenBright, backgroundColor: 'rgba(34,197,94,0.14)',  fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2 },
        { label: 'Losses', data: lossArr, borderColor: p.redBright,   backgroundColor: 'rgba(244,63,94,0.14)', fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2 }
      ] },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { color: p.text2, font: { family: 'Inter', size: 10 }, usePointStyle: true, pointStyle: 'circle', padding: 8 } }, tooltip: { ...tooltipStyle() } },
        scales: { x: { grid: gridOpts(), ticks: { ...tickOpts(), maxTicksLimit: 6, maxRotation: 0 } }, y: { grid: gridOpts(), ticks: tickOpts() } }
      }
    });
  }

  function renderSizeChart() {
    const ctx = document.getElementById('sizeChart'); if (!ctx) return;
    destroyChart('size');
    const p = palette();
    const winData  = metrics.trades.filter(t => t.isWin).map(t => ({ x: t.qty, y: t.pnl }));
    const lossData = metrics.trades.filter(t => !t.isWin).map(t => ({ x: t.qty, y: t.pnl }));
    charts.size = new Chart(ctx, {
      type: 'scatter',
      data: { datasets: [
        { label: 'Wins',   data: winData,  backgroundColor: 'rgba(34,197,94,0.7)',  borderColor: p.greenBright, pointRadius: 5, pointHoverRadius: 7, pointBorderWidth: 2, pointBorderColor: '#fff' },
        { label: 'Losses', data: lossData, backgroundColor: 'rgba(244,63,94,0.7)', borderColor: p.redBright,   pointRadius: 5, pointHoverRadius: 7, pointBorderWidth: 2, pointBorderColor: '#fff' }
      ] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: p.text2, font: { family: 'Inter', size: 10 }, usePointStyle: true, pointStyle: 'circle', padding: 8 } },
          tooltip: { ...tooltipStyle(), callbacks: { label: c => 'Qty: ' + c.parsed.x + ' · P&L: ' + fmt(c.parsed.y) } }
        },
        scales: {
          x: { grid: gridOpts(), ticks: tickOpts(), title: { display: true, text: 'Qty', color: p.text3, font: { family: 'Inter', size: 10 } } },
          y: { grid: gridOpts(), ticks: { ...tickOpts(), callback: v => '$' + v.toFixed(0) } }
        }
      }
    });
  }

  function rebuildCharts() {
    if (!metrics) return;
    renderEquityChart();
    renderWinLossChart();
    renderPLPerTradeChart();
    renderExitTypeChart();
    renderSymbolCharts();
    renderSideChart();
    renderDailyPLChart();
    renderRRDistChart();
    renderRMultDistChart();
    renderHourlyChart();
    renderCumulChart();
    renderSizeChart();
  }

  function showError(err) {
    const box = document.getElementById('errorBox');
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    if (box) {
      box.style.display = 'block';
      box.innerHTML = `<strong>⚠ Failed to load trade data</strong>${err.message}.<br>Make sure the CSV files exist at <code>csv/b-h.csv</code>, <code>csv/o-h.csv</code>, <code>csv/t-j.csv</code> relative to this page.`;
    }
    console.error(err);
  }

  function renderAll() {
    renderKPIs();
    renderEquityChart();
    renderWinLossChart();
    renderPLPerTradeChart();
    renderExitTypeChart();
    renderSymbolTable();
    renderPositionsTable();
    renderSymbolCharts();
    renderSideChart();
    initCalendarMonth();
    renderCalendar();
    renderDailyPLChart();
    initFilters();
    renderTradesTable();
    renderMetricsGrid();
    renderRRDistChart();
    renderRMultDistChart();
    renderHourlyChart();
    renderCumulChart();
    renderSizeChart();

    document.getElementById('loader').style.display = 'none';
    document.getElementById('dash').style.display = 'block';
    document.getElementById('lastUpdate').textContent = 'Updated ' + new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
    document.getElementById('genDate').textContent = 'Generated ' + new Date().toLocaleDateString('en-US');

    // Console debug
    console.log('%c[MyTrades v4] Trade reconstruction summary', 'color:#fbbf24;font-weight:700');
    console.log(`Trades: ${metrics.trades.length} | Positions: ${metrics.positions.length}`);
    console.log(`Win rate: ${metrics.winRate.toFixed(1)}% (trades) | ${metrics.posWinRate.toFixed(1)}% (positions)`);
    console.log(`Avg planned R:R: ${metrics.avgRR.toFixed(2)}R | Avg realized R: ${metrics.avgR >= 0 ? '+' : ''}${metrics.avgR.toFixed(2)}R`);
    console.table(metrics.trades.map(t => ({
      time: t.timeStr, sym: t.symbol.replace(/^[A-Z]+:/, ''), side: t.side,
      entry: t.entryPrice, exit: t.exitPrice,
      SL: t.slPrice !== null ? t.slPrice.toFixed(2) : (t.cancelledSL !== null ? '~' + t.cancelledSL.toFixed(2) : '—'),
      'SL src': t.slSource,
      'R:R': t.rr !== null ? t.rr.toFixed(2) : '—',
      'R-mult': t.rMultiple !== null ? (t.rMultiple >= 0 ? '+' : '') + t.rMultiple.toFixed(2) : '—',
      exit: t.exitType,
      pnl: (t.pnl >= 0 ? '+' : '') + '$' + t.pnl.toFixed(0)
    })));
  }

  async function init() {
    initTheme();
    initSidebar();
    initTabs();
    initCalendarNav();
    try {
      await loadData();
      trades = buildTrades(balanceRows, orderRows);
      positions = groupPositions(trades);
      metrics = calcMetrics(trades, positions);
      if (!metrics || !metrics.trades.length) throw new Error('No trades were reconstructed from the CSV data.');
      renderAll();
    } catch (err) {
      showError(err);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
