/* ================================================================
   TradingPro Dashboard — Application Logic
   ================================================================ */
(function () {
  'use strict';

  /* ── State ────────────────────────────────────────────────── */
  let allOrders = [];
  let trades = [];
  let metrics = null;
  let charts = {};
  let currentTheme = 'dark';
  let calYear = null;
  let calMonth = null;

  /* ================================================================
     SVG ICONS (inline, zero dependencies)
     ================================================================ */
  const ICONS = {
    moon: '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    list: '<svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    analytics: '<svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    chevLeft: '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
    chevRight: '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
    trendUp: '<svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    zap: '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    dollar: '<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    award: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
    flame: '<svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>',
  };

  /* ================================================================
     THEME SYSTEM
     ================================================================ */
  function systemTheme() {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function setTheme(t) {
    currentTheme = t;
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('tp-theme', t);
    updateThemeIcon();
    // Rebuild charts with new colors after a brief delay for CSS vars to update
    setTimeout(rebuildCharts, 80);
  }

  function updateThemeIcon() {
    var btn = document.getElementById('themeToggleIcon');
    if (!btn) return;
    btn.innerHTML = currentTheme === 'dark' ? ICONS.moon : ICONS.sun;
  }

  function initTheme() {
    var saved = localStorage.getItem('tp-theme');
    setTheme(saved || systemTheme());

    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function (e) {
      if (!localStorage.getItem('tp-theme')) setTheme(e.matches ? 'light' : 'dark');
    });
  }

  /* ================================================================
     SIDEBAR & HAMBURGER
     ================================================================ */
  function initSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    var hamburger = document.getElementById('hamburgerBtn');

    function open() {
      sidebar.classList.add('open');
      overlay.classList.add('visible');
      hamburger.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function close() {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
      hamburger.classList.remove('open');
      document.body.style.overflow = '';
    }

    if (hamburger) hamburger.addEventListener('click', function () { sidebar.classList.contains('open') ? close() : open(); });
    if (overlay) overlay.addEventListener('click', close);

    // Navigation
    var navItems = document.querySelectorAll('.nav-item[data-tab]');
    var panels = document.querySelectorAll('.tab-panel');
    var topbarTitle = document.getElementById('topbarTitle');
    var tabLabels = { overview: 'Overview', calendar: 'Calendar', trades: 'Trade History', analytics: 'Analytics' };

    navItems.forEach(function (item) {
      item.addEventListener('click', function () {
        var tab = item.getAttribute('data-tab');
        navItems.forEach(function (n) { n.classList.remove('active'); });
        item.classList.add('active');
        panels.forEach(function (p) { p.classList.remove('active'); });
        var panel = document.getElementById('panel-' + tab);
        if (panel) panel.classList.add('active');
        if (topbarTitle) topbarTitle.textContent = tabLabels[tab] || tab;
        close();
      });
    });
  }

  /* ================================================================
     CSV PARSER
     ================================================================ */
  function parseCSVLine(line) {
    var vals = [];
    var cur = '';
    var inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { vals.push(cur); cur = ''; continue; }
      cur += c;
    }
    vals.push(cur);
    return vals;
  }

  function parseCSV(csv) {
    var lines = csv.trim().split('\n');
    if (lines.length < 2) return [];
    var headers = parseCSVLine(lines[0]);
    return lines.slice(1).map(function (line) {
      var vals = parseCSVLine(line);
      var obj = {};
      headers.forEach(function (h, i) { obj[h.trim()] = (vals[i] || '').trim(); });
      return obj;
    });
  }

  /* ================================================================
     TRADE BUILDER
     ================================================================ */
  function buildTrades(orders) {
    var groups = {};
    orders.forEach(function (o) {
      var t = o['Update Time'];
      if (!groups[t]) groups[t] = [];
      groups[t].push(o);
    });

    var result = [];
    var timeKeys = Object.keys(groups).sort();
    timeKeys.forEach(function (t) {
      var group = groups[t];
      group.forEach(function (o) {
        if (o.Type !== 'Market' || o.Status !== 'Filled') return;
        if (!o['Net PL'] || o['Net PL'] === '') return;

        var netPL = parseFloat(o['Net PL']) || 0;
        var qty = parseInt(o['Filled Qty']) || parseInt(o['Qty']) || 0;
        var side = o.Side;
        var entryPrice = parseFloat(o['Avg Fill Price']) || 0;

        var slPrice = null, tpPrice = null;
        group.forEach(function (g) {
          if (g.Type === 'Stop Loss' || g.Type === 'Trailing Stop') {
            if (g['Stop Price']) slPrice = parseFloat(g['Stop Price']);
          }
          if (g.Type === 'Take Profit' && g['Limit Price']) {
            tpPrice = parseFloat(g['Limit Price']);
          }
        });

        var risk = 0, reward = 0, rr = 0;
        if (entryPrice > 0) {
          if (side === 'Buy') {
            if (slPrice) risk = Math.abs(entryPrice - slPrice);
            if (tpPrice) reward = Math.abs(tpPrice - entryPrice);
          } else {
            if (slPrice) risk = Math.abs(slPrice - entryPrice);
            if (tpPrice) reward = Math.abs(entryPrice - tpPrice);
          }
          if (risk > 0 && reward > 0) rr = reward / risk;
        }

        var exitType = 'Manual';
        group.forEach(function (g) {
          if (g.Type === 'Take Profit' && g.Status === 'Filled') exitType = 'TP';
        });
        if (exitType === 'Manual') {
          group.forEach(function (g) {
            if ((g.Type === 'Stop Loss' || g.Type === 'Trailing Stop') && g.Status === 'Filled') exitType = 'SL';
          });
        }

        result.push({
          time: new Date(t), timeStr: t, symbol: o.Symbol, side: side,
          qty: qty, entryPrice: entryPrice, netPL: netPL,
          slPrice: slPrice, tpPrice: tpPrice, risk: risk, reward: reward, rr: rr,
          isWin: netPL > 0, exitType: exitType, orderId: o['Order ID']
        });
      });
    });

    return result.sort(function (a, b) { return a.time - b.time; });
  }

  /* ================================================================
     METRICS CALCULATOR
     ================================================================ */
  function calcMetrics() {
    if (!trades.length) return null;
    var wins = [], losses = [];
    trades.forEach(function (t) { (t.isWin ? wins : losses).push(t); });

    var totalPL = trades.reduce(function (s, t) { return s + t.netPL; }, 0);
    var winRate = wins.length / trades.length * 100;
    var avgWin = wins.length ? wins.reduce(function (s, t) { return s + t.netPL; }, 0) / wins.length : 0;
    var avgLoss = losses.length ? Math.abs(losses.reduce(function (s, t) { return s + t.netPL; }, 0) / losses.length) : 0;
    var grossWin = wins.reduce(function (s, t) { return s + t.netPL; }, 0);
    var grossLoss = Math.abs(losses.reduce(function (s, t) { return s + t.netPL; }, 0));
    var profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);

    // Max Drawdown
    var peak = 0, maxDD = 0, ddPct = 0;
    var cumul = [];
    trades.reduce(function (acc, t) { acc += t.netPL; cumul.push(acc); return acc; }, 0);
    cumul.forEach(function (v) {
      if (v > peak) peak = v;
      var dd = peak - v;
      if (dd > maxDD) maxDD = dd;
    });
    if (peak > 0) ddPct = (maxDD / peak) * 100;

    var rrTrades = trades.filter(function (t) { return t.rr > 0; });
    var avgRR = rrTrades.length ? rrTrades.reduce(function (s, t) { return s + t.rr; }, 0) / rrTrades.length : 0;
    var bestTrade = Math.max.apply(null, trades.map(function (t) { return t.netPL; }));
    var worstTrade = Math.min.apply(null, trades.map(function (t) { return t.netPL; }));
    var expectancy = winRate / 100 * avgWin - (1 - winRate / 100) * avgLoss;

    var maxCW = 0, maxCL = 0, cw = 0, cl = 0;
    trades.forEach(function (t) {
      if (t.isWin) { cw++; cl = 0; if (cw > maxCW) maxCW = cw; }
      else { cl++; cw = 0; if (cl > maxCL) maxCL = cl; }
    });

    return {
      wins: wins, losses: losses, totalPL: totalPL, winRate: winRate,
      avgWin: avgWin, avgLoss: avgLoss, profitFactor: profitFactor,
      maxDD: maxDD, ddPct: ddPct, avgRR: avgRR, rrTrades: rrTrades,
      bestTrade: bestTrade, worstTrade: worstTrade, expectancy: expectancy,
      maxCW: maxCW, maxCL: maxCL, cumul: cumul
    };
  }

  /* ================================================================
     FORMAT HELPERS
     ================================================================ */
  function fmt(v) {
    return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function fmtAbs(v) {
    return '$' + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* ================================================================
     CHART.JS HELPERS
     ================================================================ */
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function palette() {
    return {
      green: cssVar('--green'), red: cssVar('--red'), yellow: cssVar('--yellow'),
      blue: cssVar('--blue'), purple: cssVar('--purple'), cyan: cssVar('--cyan'),
      orange: cssVar('--orange'), text: cssVar('--text-secondary'),
      grid: cssVar('--grid-color') || 'rgba(30,37,48,.6)'
    };
  }

  function killChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  function tooltipStyle() {
    return {
      backgroundColor: currentTheme === 'dark' ? 'rgba(21,25,33,.95)' : 'rgba(255,255,255,.95)',
      titleColor: currentTheme === 'dark' ? '#e8eaed' : '#111827',
      bodyColor: currentTheme === 'dark' ? '#8b95a5' : '#6b7280',
      borderColor: currentTheme === 'dark' ? 'rgba(30,37,48,.8)' : 'rgba(229,231,235,.8)',
      borderWidth: 1, padding: 12, cornerRadius: 8, titleFont: { weight: '700' }
    };
  }

  function yScale() {
    var c = palette();
    return {
      y: { grid: { color: c.grid }, ticks: { color: c.text, callback: function (v) { return '$' + v.toFixed(0); } } },
      x: { grid: { display: false }, ticks: { color: c.text } }
    };
  }

  /* ================================================================
     RENDER STATS
     ================================================================ */
  function renderStats(m) {
    var cards = [
      { label: 'Net P&L', icon: ICONS.trendUp, val: fmt(m.totalPL), color: m.totalPL >= 0 ? 'green' : 'red', cls: m.totalPL >= 0 ? 'c-green' : 'c-red', sub: trades.length + ' closed trades' },
      { label: 'Win Rate', icon: ICONS.target, val: m.winRate.toFixed(1) + '%', color: m.winRate >= 50 ? 'green' : 'red', cls: 'c-blue', sub: m.wins.length + 'W / ' + m.losses.length + 'L' },
      { label: 'Profit Factor', icon: ICONS.zap, val: m.profitFactor === Infinity ? 'Inf' : m.profitFactor.toFixed(2), color: m.profitFactor >= 1 ? 'green' : 'red', cls: 'c-yellow', sub: 'Gross W: ' + fmtAbs(m.wins.reduce(function (s, t) { return s + t.netPL; }, 0)) },
      { label: 'Avg R:R', icon: ICONS.award, val: m.avgRR.toFixed(2) + 'R', color: m.avgRR >= 1 ? 'green' : 'yellow', cls: 'c-purple', sub: m.rrTrades.length + ' trades with data' },
      { label: 'Max Drawdown', icon: ICONS.flame, val: fmtAbs(-m.maxDD), color: 'red', cls: 'c-red', sub: m.ddPct > 0 ? m.ddPct.toFixed(1) + '% from peak' : 'No drawdown' },
      { label: 'Expectancy', icon: ICONS.dollar, val: fmt(m.expectancy), color: m.expectancy >= 0 ? 'green' : 'red', cls: 'c-cyan', sub: 'Avg $ per trade' },
      { label: 'Best Trade', icon: ICONS.trendUp, val: fmt(m.bestTrade), color: 'green', cls: 'c-green', sub: trades.filter(function (t) { return t.netPL === m.bestTrade; })[0]?.exitType || '' },
      { label: 'Worst Trade', icon: ICONS.flame, val: fmt(m.worstTrade), color: 'red', cls: 'c-orange', sub: trades.filter(function (t) { return t.netPL === m.worstTrade; })[0]?.exitType || '' },
      { label: 'Max Streak', icon: ICONS.shield, val: m.maxCW + 'W / ' + m.maxCL + 'L', color: m.maxCW >= m.maxCL ? 'green' : 'red', cls: 'c-blue', sub: 'Consecutive' }
    ];

    document.getElementById('statsGrid').innerHTML = cards.map(function (c, i) {
      return '<div class="stat-card ' + c.cls + ' anim d' + Math.min(i + 1, 10) + '">' +
        '<div class="stat-label">' + c.icon + ' ' + c.label + '</div>' +
        '<div class="stat-value ' + c.color + '">' + c.val + '</div>' +
        '<div class="stat-sub">' + c.sub + '</div>' +
        '</div>';
    }).join('');
  }

  /* ================================================================
     RENDER CHARTS
     ================================================================ */
  function renderCharts() {
    if (!metrics) return;
    var m = metrics;
    var c = palette();

    // ── Equity Curve ─────────────────────────────────
    killChart('equity');
    var eqCtx = document.getElementById('equityChart');
    if (eqCtx) {
      var ctx = eqCtx.getContext('2d');
      var grad = ctx.createLinearGradient(0, 0, 0, 300);
      grad.addColorStop(0, m.totalPL >= 0 ? c.green + '35' : c.red + '35');
      grad.addColorStop(1, 'transparent');

      charts.equity = new Chart(eqCtx, {
        type: 'line',
        data: {
          labels: trades.map(function (_, i) { return '#' + (i + 1); }),
          datasets: [{
            label: 'Cumulative P&L', data: m.cumul,
            borderColor: m.totalPL >= 0 ? c.green : c.red,
            backgroundColor: grad, fill: true, tension: .4, borderWidth: 2.5,
            pointBackgroundColor: trades.map(function (t) { return t.isWin ? c.green : c.red; }),
            pointRadius: 5, pointHoverRadius: 8
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, tooltipStyle(), {
              callbacks: {
                title: function (i) { return 'Trade #' + (i[0].dataIndex + 1); },
                label: function (i) {
                  var t = trades[i.dataIndex];
                  return ['P&L: ' + fmt(t.netPL), 'Side: ' + t.side, 'Exit: ' + t.exitType, 'R:R: ' + (t.rr > 0 ? t.rr.toFixed(2) + 'R' : 'N/A')];
                }
              }
            })
          },
          scales: yScale()
        }
      });
    }

    // ── P&L Distribution ────────────────────────────
    killChart('plDist');
    var plEl = document.getElementById('plDistChart');
    if (plEl) {
      charts.plDist = new Chart(plEl, {
        type: 'bar',
        data: {
          labels: trades.map(function (_, i) { return '#' + (i + 1); }),
          datasets: [{
            label: 'P&L', data: trades.map(function (t) { return t.netPL; }),
            backgroundColor: trades.map(function (t) { return t.isWin ? c.green + 'B0' : c.red + 'B0'; }),
            borderColor: trades.map(function (t) { return t.isWin ? c.green : c.red; }),
            borderWidth: 1, borderRadius: 4
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: Object.assign({}, tooltipStyle(), { callbacks: { label: function (i) { return fmt(i.raw); } } }) },
          scales: yScale()
        }
      });
    }

    // ── Win/Loss Donut ──────────────────────────────
    killChart('winLoss');
    var wlEl = document.getElementById('winLossChart');
    if (wlEl) {
      charts.winLoss = new Chart(wlEl, {
        type: 'doughnut',
        data: {
          labels: ['Wins', 'Losses'],
          datasets: [{
            data: [m.wins.length, m.losses.length],
            backgroundColor: [c.green + 'CC', c.red + 'CC'],
            borderColor: [c.green, c.red], borderWidth: 2, hoverOffset: 8
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '68%',
          plugins: {
            legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true, pointStyle: 'circle', color: c.text } },
            tooltip: Object.assign({}, tooltipStyle(), { callbacks: { label: function (i) { return i.label + ': ' + i.raw + ' (' + (i.raw / trades.length * 100).toFixed(0) + '%)'; } } })
          }
        }
      });
    }

    // ── Hourly Performance ───────────────────────────
    killChart('hourly');
    var hData = {};
    trades.forEach(function (t) {
      var h = String(t.time.getHours()).padStart(2, '0') + ':00';
      if (!hData[h]) hData[h] = { pl: 0, n: 0 };
      hData[h].pl += t.netPL; hData[h].n++;
    });
    var hKeys = Object.keys(hData).sort();
    var hEl = document.getElementById('hourlyChart');
    if (hEl) {
      charts.hourly = new Chart(hEl, {
        type: 'bar',
        data: {
          labels: hKeys,
          datasets: [{
            label: 'P&L', data: hKeys.map(function (k) { return hData[k].pl; }),
            backgroundColor: hKeys.map(function (k) { return hData[k].pl >= 0 ? c.green + 'B0' : c.red + 'B0'; }),
            borderColor: hKeys.map(function (k) { return hData[k].pl >= 0 ? c.green : c.red; }),
            borderWidth: 1, borderRadius: 6
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false },
            tooltip: Object.assign({}, tooltipStyle(), { callbacks: { label: function (i) { var k = hKeys[i.dataIndex]; return [fmt(hData[k].pl), hData[k].n + ' trades']; } } })
          },
          scales: yScale()
        }
      });
    }

    // ── Calendar ────────────────────────────────────
    renderCalendar();

    // ── Daily P&L ───────────────────────────────────
    killChart('dailyPL');
    var dpEl = document.getElementById('dailyPLChart');
    if (dpEl) {
      charts.dailyPL = new Chart(dpEl, {
        type: 'bar',
        data: {
          labels: hKeys,
          datasets: [{
            label: 'P&L', data: hKeys.map(function (k) { return hData[k].pl; }),
            backgroundColor: hKeys.map(function (k) { return hData[k].pl >= 0 ? c.green + '99' : c.red + '99'; }),
            borderColor: hKeys.map(function (k) { return hData[k].pl >= 0 ? c.green : c.red; }),
            borderWidth: 1, borderRadius: 6
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: yScale() }
      });
    }

    // ── Trade Table ─────────────────────────────────
    renderTable();

    // ── Analytics Metrics ───────────────────────────
    renderAnalytics(m, c);

    // ── R:R Chart ───────────────────────────────────
    killChart('rr');
    var rrT = trades.filter(function (t) { return t.rr > 0; });
    var rrEl = document.getElementById('rrChart');
    if (rrEl) {
      charts.rr = new Chart(rrEl, {
        type: 'bar',
        data: {
          labels: rrT.map(function (t) { return '#' + (trades.indexOf(t) + 1); }),
          datasets: [
            { label: 'Risk', data: rrT.map(function (t) { return -t.risk; }), backgroundColor: c.red + '99', borderColor: c.red, borderWidth: 1, borderRadius: 4 },
            { label: 'Reward', data: rrT.map(function (t) { return t.isWin ? t.reward : 0; }), backgroundColor: c.green + '99', borderColor: c.green, borderWidth: 1, borderRadius: 4 },
            { label: 'R:R', type: 'line', data: rrT.map(function (t) { return t.rr; }), borderColor: c.yellow, yAxisID: 'rr', tension: .3, pointBackgroundColor: rrT.map(function (t) { return t.isWin ? c.green : c.red; }), pointRadius: 6, borderWidth: 2 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { usePointStyle: true, padding: 14, color: c.text } } },
          scales: {
            y: { grid: { color: c.grid }, ticks: { color: c.text, callback: function (v) { return '$' + v.toFixed(0); } } },
            rr: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'R:R', color: c.text }, ticks: { color: c.text, callback: function (v) { return v.toFixed(1) + 'R'; } } },
            x: { grid: { display: false }, ticks: { color: c.text } }
          }
        }
      });
    }

    // ── Frequency Chart ─────────────────────────────
    killChart('freq');
    var fData = {};
    trades.forEach(function (t) { var h = t.time.getHours(); fData[h] = (fData[h] || 0) + 1; });
    var fKeys = Object.keys(fData).sort(function (a, b) { return a - b; });
    var freqEl = document.getElementById('freqChart');
    if (freqEl) {
      charts.freq = new Chart(freqEl, {
        type: 'bar',
        data: {
          labels: fKeys.map(function (h) { return h + ':00'; }),
          datasets: [{ label: 'Trades', data: fKeys.map(function (k) { return fData[k]; }), backgroundColor: c.blue + '99', borderColor: c.blue, borderWidth: 1, borderRadius: 6 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: c.grid }, ticks: { stepSize: 1, color: c.text } },
            x: { grid: { display: false }, ticks: { color: c.text } }
          }
        }
      });
    }

    // ── Cumulative W/L ──────────────────────────────
    killChart('cumul');
    var wArr = [], lArr = [];
    var wc = 0, lc = 0;
    trades.forEach(function (t) { if (t.isWin) wc++; else lc++; wArr.push(wc); lArr.push(lc); });
    var cumEl = document.getElementById('cumulChart');
    if (cumEl) {
      charts.cumul = new Chart(cumEl, {
        type: 'line',
        data: {
          labels: trades.map(function (_, i) { return '#' + (i + 1); }),
          datasets: [
            { label: 'Wins', data: wArr, borderColor: c.green, backgroundColor: c.green + '15', fill: true, tension: .3, pointRadius: 3, borderWidth: 2 },
            { label: 'Losses', data: lArr, borderColor: c.red, backgroundColor: c.red + '15', fill: true, tension: .3, pointRadius: 3, borderWidth: 2 },
            { label: 'Total', data: trades.map(function (_, i) { return i + 1; }), borderColor: c.text, borderDash: [4, 4], tension: 0, pointRadius: 0, borderWidth: 1 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { usePointStyle: true, padding: 10, color: c.text, font: { size: 11 } } } },
          scales: {
            y: { beginAtZero: true, grid: { color: c.grid }, ticks: { stepSize: 1, color: c.text } },
            x: { grid: { display: false }, ticks: { color: c.text } }
          }
        }
      });
    }

    // ── Size Performance ────────────────────────────
    killChart('size');
    var sData = {};
    trades.forEach(function (t) {
      var k = t.qty + ' ' + t.side;
      if (!sData[k]) sData[k] = { pl: 0, n: 0 };
      sData[k].pl += t.netPL; sData[k].n++;
    });
    var sKeys = Object.keys(sData);
    var sizeEl = document.getElementById('sizeChart');
    if (sizeEl) {
      charts.size = new Chart(sizeEl, {
        type: 'bar',
        data: {
          labels: sKeys,
          datasets: [
            { label: 'P&L', data: sKeys.map(function (k) { return sData[k].pl; }), yAxisID: 'pl', borderRadius: 6, borderWidth: 1,
              backgroundColor: sKeys.map(function (k) { return sData[k].pl >= 0 ? c.green + 'B0' : c.red + 'B0'; }),
              borderColor: sKeys.map(function (k) { return sData[k].pl >= 0 ? c.green : c.red; }) },
            { label: 'Trades', data: sKeys.map(function (k) { return sData[k].n; }), yAxisID: 'ct', borderRadius: 6, borderWidth: 1, backgroundColor: c.blue + '66', borderColor: c.blue }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { usePointStyle: true, padding: 14, color: c.text } } },
          scales: {
            pl: { position: 'left', grid: { color: c.grid }, ticks: { color: c.text, callback: function (v) { return '$' + v.toFixed(0); } } },
            ct: { position: 'right', grid: { drawOnChartArea: false }, ticks: { stepSize: 1, color: c.text }, title: { display: true, text: 'Count', color: c.text } },
            x: { grid: { display: false }, ticks: { color: c.text } }
          }
        }
      });
    }
  }

  /* ================================================================
     CALENDAR RENDERER
     ================================================================ */
  function renderCalendar() {
    var container = document.getElementById('calendarContainer');
    if (!container || !metrics) return;

    if (calYear === null) {
      var first = trades[0].time;
      calYear = first.getFullYear();
      calMonth = first.getMonth();
    }

    var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var firstDow = new Date(calYear, calMonth, 1).getDay();
    var daysIn = new Date(calYear, calMonth + 1, 0).getDate();

    var dailyPL = {};
    trades.forEach(function (t) {
      if (t.time.getFullYear() !== calYear || t.time.getMonth() !== calMonth) return;
      var d = t.time.getDate();
      if (!dailyPL[d]) dailyPL[d] = { pl: 0, w: 0, l: 0 };
      dailyPL[d].pl += t.netPL;
      if (t.isWin) dailyPL[d].w++; else dailyPL[d].l++;
    });

    var html = '<div class="cal-header"><div class="cal-title">' + monthNames[calMonth] + ' ' + calYear + '</div>' +
      '<div class="cal-nav">' +
      '<button class="cal-nav-btn" id="calPrev" type="button">' + ICONS.chevLeft + '</button>' +
      '<button class="cal-nav-btn" id="calNext" type="button">' + ICONS.chevRight + '</button>' +
      '</div></div>' +
      '<div class="cal-weekdays">' + dayNames.map(function (d) { return '<div class="cal-weekday">' + d + '</div>'; }).join('') + '</div>' +
      '<div class="cal-days">';

    for (var i = 0; i < firstDow; i++) html += '<div class="cal-day empty"></div>';
    for (var d = 1; d <= daysIn; d++) {
      var data = dailyPL[d];
      var isToday = d === new Date().getDate() && calMonth === new Date().getMonth() && calYear === new Date().getFullYear();
      var cls = 'cal-day';
      if (data) {
        if (data.w > 0 && data.l === 0) cls += ' win';
        else if (data.l > 0 && data.w === 0) cls += ' loss';
        else cls += ' mix';
      }
      if (isToday) cls += ' today';
      var plTxt = data ? (data.pl >= 0 ? '+' : '') + '$' + data.pl.toFixed(0) : '';
      var title = data ? fmt(data.pl) + ' (' + data.w + 'W/' + data.l + 'L)' : 'No trades';
      html += '<div class="' + cls + '" title="' + title + '"><span class="d-num">' + d + '</span>' +
        (data ? '<span class="d-pl">' + plTxt + '</span>' : '') + '</div>';
    }
    html += '</div>';
    container.innerHTML = html;

    // Wire calendar nav buttons
    document.getElementById('calPrev').addEventListener('click', function () { navCal(-1); });
    document.getElementById('calNext').addEventListener('click', function () { navCal(1); });
  }

  function navCal(dir) {
    calMonth += dir;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  }

  /* ================================================================
     TRADE TABLE
     ================================================================ */
  function renderTable(fType, fStatus) {
    fType = fType || 'all';
    fStatus = fStatus || 'all';
    var filtered = allOrders.slice();
    if (fType !== 'all') filtered = filtered.filter(function (o) { return o.Type === fType; });
    if (fStatus !== 'all') filtered = filtered.filter(function (o) { return o.Status === fStatus; });
    filtered.sort(function (a, b) { return new Date(b['Update Time']) - new Date(a['Update Time']); });

    var tbody = document.getElementById('tradesTableBody');
    if (!tbody) return;

    tbody.innerHTML = filtered.map(function (o) {
      var pl = o['Net PL'] ? parseFloat(o['Net PL']) : null;
      var plH = pl !== null
        ? '<span class="' + (pl >= 0 ? 'pl-pos' : 'pl-neg') + '">' + fmt(pl) + '</span>'
        : '<span style="color:var(--text-muted)">--</span>';
      return '<tr>' +
        '<td>' + o['Update Time'] + '</td>' +
        '<td><strong>' + o.Symbol + '</strong></td>' +
        '<td class="' + (o.Side === 'Buy' ? 'side-buy' : 'side-sell') + '">' + o.Side + '</td>' +
        '<td><span class="type-badge">' + o.Type + '</span></td>' +
        '<td>' + (o['Filled Qty'] || o.Qty) + '</td>' +
        '<td>' + (o['Avg Fill Price'] || o['Limit Price'] || o['Stop Price'] || '--') + '</td>' +
        '<td>' + plH + '</td>' +
        '<td class="' + (o.Status === 'Filled' ? 'st-filled' : 'st-cancel') + '">' + o.Status + '</td>' +
        '<td style="color:var(--text-muted);font-size:.68rem">' + o['Order ID'] + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ================================================================
     ANALYTICS METRICS
     ================================================================ */
  function renderAnalytics(m, c) {
    var longs = trades.filter(function (t) { return t.side === 'Buy'; });
    var shorts = trades.filter(function (t) { return t.side === 'Sell'; });
    var lWR = longs.length ? longs.filter(function (t) { return t.isWin; }).length / longs.length * 100 : 0;
    var sWR = shorts.length ? shorts.filter(function (t) { return t.isWin; }).length / shorts.length * 100 : 0;
    var lPL = longs.reduce(function (s, t) { return s + t.netPL; }, 0);
    var sPL = shorts.reduce(function (s, t) { return s + t.netPL; }, 0);
    var tpE = trades.filter(function (t) { return t.exitType === 'TP'; });
    var slE = trades.filter(function (t) { return t.exitType === 'SL'; });
    var tpPct = trades.length ? (tpE.length / trades.length * 100) : 0;

    var fCounts = {};
    trades.forEach(function (t) { var h = t.time.getHours(); fCounts[h] = (fCounts[h] || 0) + 1; });
    var peakH = 0, peakHN = 0;
    Object.keys(fCounts).forEach(function (h) { if (fCounts[h] > peakHN) { peakHN = fCounts[h]; peakH = h; } });

    var grid = document.getElementById('metricsGrid');
    if (!grid) return;

    grid.innerHTML =
      '<div class="metric-card anim d1">' +
        '<h4>Direction Breakdown</h4>' +
        '<div class="m-row"><span class="lbl">Long Trades</span><span class="val">' + longs.length + '</span></div>' +
        '<div class="m-row"><span class="lbl">Long Win Rate</span><span class="val" style="color:' + (lWR >= 50 ? 'var(--green)' : 'var(--red)') + '">' + lWR.toFixed(1) + '%</span></div>' +
        '<div class="m-row"><span class="lbl">Long P&L</span><span class="val" style="color:' + (lPL >= 0 ? 'var(--green)' : 'var(--red)') + '">' + fmt(lPL) + '</span></div>' +
        '<div style="height:10px"></div>' +
        '<div class="m-row"><span class="lbl">Short Trades</span><span class="val">' + shorts.length + '</span></div>' +
        '<div class="m-row"><span class="lbl">Short Win Rate</span><span class="val" style="color:' + (sWR >= 50 ? 'var(--green)' : 'var(--red)') + '">' + sWR.toFixed(1) + '%</span></div>' +
        '<div class="m-row"><span class="lbl">Short P&L</span><span class="val" style="color:' + (sPL >= 0 ? 'var(--green)' : 'var(--red)') + '">' + fmt(sPL) + '</span></div>' +
        '<div class="progress-bar" style="margin-top:14px"><div class="progress-fill" style="width:' + lWR + '%;background:var(--green)"></div></div>' +
        '<div style="font-size:.65rem;color:var(--text-muted);margin-top:4px">Long ' + lWR.toFixed(0) + '% | Short ' + sWR.toFixed(0) + '%</div>' +
      '</div>' +

      '<div class="metric-card anim d2">' +
        '<h4>Exit Analysis</h4>' +
        '<div class="m-row"><span class="lbl">TP Exits</span><span class="val" style="color:var(--green)">' + tpE.length + ' (' + tpPct.toFixed(0) + '%)</span></div>' +
        '<div class="m-row"><span class="lbl">SL Exits</span><span class="val" style="color:var(--red)">' + slE.length + ' (' + (trades.length ? (slE.length / trades.length * 100).toFixed(0) : 0) + '%)</span></div>' +
        '<div class="m-row"><span class="lbl">Manual Exits</span><span class="val">' + (trades.length - tpE.length - slE.length) + '</span></div>' +
        '<div style="height:10px"></div>' +
        '<div class="m-row"><span class="lbl">TP Avg P&L</span><span class="val" style="color:var(--green)">' + (tpE.length ? fmt(tpE.reduce(function (s, t) { return s + t.netPL; }, 0) / tpE.length) : 'N/A') + '</span></div>' +
        '<div class="m-row"><span class="lbl">SL Avg P&L</span><span class="val" style="color:var(--red)">' + (slE.length ? fmt(slE.reduce(function (s, t) { return s + t.netPL; }, 0) / slE.length) : 'N/A') + '</span></div>' +
        '<div class="progress-bar" style="margin-top:14px"><div class="progress-fill" style="width:' + tpPct + '%;background:var(--green)"></div></div>' +
      '</div>' +

      '<div class="metric-card anim d3">' +
        '<h4>Risk Management</h4>' +
        '<div class="m-row"><span class="lbl">Avg Win</span><span class="val" style="color:var(--green)">' + fmt(m.avgWin) + '</span></div>' +
        '<div class="m-row"><span class="lbl">Avg Loss</span><span class="val" style="color:var(--red)">' + fmt(-m.avgLoss) + '</span></div>' +
        '<div class="m-row"><span class="lbl">Win/Loss Size</span><span class="val">' + (m.avgLoss > 0 ? (m.avgWin / m.avgLoss).toFixed(2) : 'N/A') + '</span></div>' +
        '<div class="m-row"><span class="lbl">Avg R:R (Planned)</span><span class="val" style="color:var(--yellow)">' + m.avgRR.toFixed(2) + 'R</span></div>' +
        '<div class="m-row"><span class="lbl">Expectancy</span><span class="val" style="color:' + (m.expectancy >= 0 ? 'var(--green)' : 'var(--red)') + '">' + fmt(m.expectancy) + '</span></div>' +
        '<div class="m-row"><span class="lbl">Max Drawdown</span><span class="val" style="color:var(--red)">' + fmtAbs(m.maxDD) + (m.ddPct > 0 ? ' (' + m.ddPct.toFixed(1) + '%)' : '') + '</span></div>' +
        '<div class="rr-visual">' +
          '<span class="rr-label">Risk</span>' +
          '<div class="rr-bar" style="background:var(--red);flex:' + Math.max(m.avgLoss, 0.1) + '">' + fmtAbs(m.avgLoss) + '</div>' +
          '<span class="rr-label">Reward</span>' +
          '<div class="rr-bar" style="background:var(--green);flex:' + Math.max(m.avgWin, 0.1) + '">' + fmtAbs(m.avgWin) + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="metric-card anim d4">' +
        '<h4>Session Stats</h4>' +
        '<div class="m-row"><span class="lbl">Total Trades</span><span class="val">' + trades.length + '</span></div>' +
        '<div class="m-row"><span class="lbl">Total Volume</span><span class="val">' + trades.reduce(function (s, t) { return s + t.qty; }, 0) + ' units</span></div>' +
        '<div class="m-row"><span class="lbl">Trading Span</span><span class="val">' + Object.keys(fCounts).length + 'h</span></div>' +
        '<div class="m-row"><span class="lbl">Peak Hour</span><span class="val">' + String(peakH).padStart(2, '0') + ':00 (' + peakHN + ')</span></div>' +
        '<div class="m-row"><span class="lbl">Max Consec. Wins</span><span class="val" style="color:var(--green)">' + m.maxCW + '</span></div>' +
        '<div class="m-row"><span class="lbl">Max Consec. Losses</span><span class="val" style="color:var(--red)">' + m.maxCL + '</span></div>' +
        '<div class="m-row"><span class="lbl">Profit Factor</span><span class="val" style="color:' + (m.profitFactor >= 1 ? 'var(--green)' : 'var(--red)') + '">' + (m.profitFactor === Infinity ? 'Infinity' : m.profitFactor.toFixed(2)) + '</span></div>' +
      '</div>';
  }

  /* ================================================================
     CHART REBUILD (theme change)
     ================================================================ */
  function rebuildCharts() {
    if (!metrics) return;
    renderCharts();
  }

  /* ================================================================
     DATA LOADING & INIT
     ================================================================ */
  function processData(csv) {
    allOrders = parseCSV(csv);
    trades = buildTrades(allOrders);
    metrics = calcMetrics();

    // Reset calendar to first trade date
    if (trades.length) {
      calYear = trades[0].time.getFullYear();
      calMonth = trades[0].time.getMonth();
    }

    // Destroy old charts
    Object.keys(charts).forEach(function (k) { charts[k].destroy(); delete charts[k]; });

    // Show dashboard
    var loading = document.getElementById('loadingState');
    var panels = document.getElementById('dashboardPanels');
    if (loading) loading.style.display = 'none';
    if (panels) panels.style.display = 'block';

    renderStats(metrics);
    renderCharts();

    document.getElementById('lastUpdate').textContent = 'Updated: ' + new Date().toLocaleTimeString();
    document.getElementById('genDate').textContent = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function initFilters() {
    var typeF = document.getElementById('filterType');
    var statusF = document.getElementById('filterStatus');
    if (typeF) typeF.addEventListener('change', function () { renderTable(typeF.value, statusF.value); });
    if (statusF) statusF.addEventListener('change', function () { renderTable(typeF.value, statusF.value); });
  }

  /* ================================================================
     BOOT
     ================================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initSidebar();
    initFilters();

    // Theme toggle
    var themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
      });
    }

    // Try loading CSV from /mytrades/csv/file.csv
    fetch('/mytrades/csv/file.csv')
      .then(function (r) {
        if (!r.ok) throw new Error('Not found');
        return r.text();
      })
      .then(function (csv) { processData(csv); })
      .catch(function () {
        var loading = document.getElementById('loadingState');
        if (loading) {
          loading.innerHTML =
            '<div class="loading-spinner"></div>' +
            '<h2>Data Not Found</h2>' +
            '<p>Place your CSV file at <code>mytrades/csv/file.csv</code> in the repository root and redeploy.</p>';
        }
      });

    // Set initial theme icon
    updateThemeIcon();
  });

})();