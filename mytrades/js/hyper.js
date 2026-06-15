/* ================================================================
   Hyperliquid Dashboard — Application Logic
   Parses Hyperliquid account export CSV (class/hash/time/time_iso/
   type/methodLabel/token/from/to/amount/chainName/chainLogo/
   px/USDAmount/priority/fee)
   ================================================================ */
(function () {
  'use strict';

  /* ── Chart instances (destroyed on re-render) ─────────────── */
  var charts = [];

  /* ── Parsed data store ────────────────────────────────────── */
  var allTrades = [];     // Close Long rows (realized trades)
  var dailyMap  = {};     // 'YYYY-MM-DD' → { pnl, wins, losses, count }
  var metrics   = {};

  /* ── Inline SVG icons for stat cards ──────────────────────── */
  var ICONS = {
    pnl:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    win:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    count: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    avg:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    pf:    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    dd:    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/></svg>',
    best:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    worst: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    token: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };

  /* ================================================================
     THEME SYSTEM
     ================================================================ */
  function getSystemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('hyper-theme', t);
    updateThemeIcon(t);
  }

  function updateThemeIcon(t) {
    var el = document.getElementById('themeToggleIcon');
    if (!el) return;
    el.innerHTML = t === 'dark'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
  }

  function initTheme() {
    var saved = localStorage.getItem('hyper-theme');
    var theme = saved || getSystemTheme();
    setTheme(theme);
  }

  /* ================================================================
     SIDEBAR
     ================================================================ */
  function initSidebar() {
    var navItems = document.querySelectorAll('.nav-item[data-tab]');
    var panels   = document.querySelectorAll('.tab-panel');
    var title    = document.getElementById('topbarTitle');
    var sidebar  = document.getElementById('sidebar');
    var overlay  = document.getElementById('sidebarOverlay');
    var hamburger = document.getElementById('hamburgerBtn');

    function switchTab(tab) {
      navItems.forEach(function (n) { n.classList.toggle('active', n.dataset.tab === tab); });
      panels.forEach(function (p) {
        p.classList.toggle('active', p.id === 'panel-' + tab);
      });
      if (title) title.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
      // Close sidebar on mobile after click
      if (window.innerWidth <= 768) closeSidebar();
    }

    navItems.forEach(function (item) {
      item.addEventListener('click', function () { switchTab(this.dataset.tab); });
      item.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab(this.dataset.tab); } });
    });

    function openSidebar()  { sidebar.classList.add('open'); overlay.classList.add('active'); document.body.style.overflow = 'hidden'; if (hamburger) hamburger.setAttribute('aria-expanded', 'true'); }
    function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('active'); document.body.style.overflow = ''; if (hamburger) hamburger.setAttribute('aria-expanded', 'false'); }

    if (hamburger) hamburger.addEventListener('click', function () { sidebar.classList.contains('open') ? closeSidebar() : openSidebar(); });
    if (overlay) overlay.addEventListener('click', closeSidebar);
  }

  /* ================================================================
     CSV PARSER
     ================================================================ */
  function parseCSVLine(line) {
    var result = [], current = '', inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { current += c; }
      } else {
        if (c === '"') { inQuotes = true; }
        else if (c === ',') { result.push(current.trim()); current = ''; }
        else { current += c; }
      }
    }
    result.push(current.trim());
    return result;
  }

  function parseCSV(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 2) return [];
    var headers = parseCSVLine(lines[0]);
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var vals = parseCSVLine(lines[i]);
      if (vals.length < headers.length) continue;
      var row = {};
      headers.forEach(function (h, idx) { row[h] = vals[idx] || ''; });
      rows.push(row);
    }
    return rows;
  }

  /* ================================================================
     DATA BUILDER — extract realized trades from Hyperliquid CSV
     ================================================================ */
  function buildTrades(rows) {
    var trades = [];
    var wallet = '';
    rows.forEach(function (row) {
      // Extract wallet from first non-empty 'from' field
      if (!wallet && row.from && row.from.length > 10 && row.from.startsWith('0x')) wallet = row.from;

      // Only PERP Close Long = realized P&L
      if (row.class !== 'PERP') return;
      if (row.type  !== 'Close Long') return;

      var pnl = parseFloat(row.USDAmount);
      if (isNaN(pnl)) return;

      trades.push({
        time:   row.time_iso || '',
        ts:     parseInt(row.time, 10) || 0,
        token:  (row.token || '').replace('-USD', '').replace('-PERP', ''),
        side:   'Long',
        size:   Math.abs(parseFloat(row.amount)) || 0,
        price:  parseFloat(row.px) || 0,
        pnl:    pnl,
        hash:   row.hash || '',
        fee:    parseFloat(row.fee) || 0
      });
    });

    // Sort by time ascending (for equity curve)
    trades.sort(function (a, b) { return a.ts - b.ts; });

    // Set wallet display
    if (wallet) {
      var el = document.getElementById('walletInfo');
      if (el) el.textContent = wallet.slice(0, 6) + '...' + wallet.slice(-4);
    }

    return trades;
  }

  /* ================================================================
     METRICS CALCULATOR
     ================================================================ */
  function calcMetrics(trades) {
    if (!trades.length) return {};
    var wins = [], losses = [];
    var totalPnL = 0, peak = 0, maxDD = 0, maxDDPct = 0;
    var cumul = [];
    var daily = {};
    var hourly = {};
    var tokens = {};

    trades.forEach(function (t, i) {
      totalPnL += t.pnl;
      cumul.push(totalPnL);

      if (totalPnL > peak) peak = totalPnL;
      var dd = peak - totalPnL;
      if (dd > maxDD) maxDD = dd;
      var ddPct = peak > 0 ? (dd / peak) * 100 : 0;
      if (ddPct > maxDDPct) maxDDPct = ddPct;

      if (t.pnl >= 0) wins.push(t); else losses.push(t);

      // Daily
      var day = t.time.slice(0, 10);
      if (!daily[day]) daily[day] = { pnl: 0, wins: 0, losses: 0, count: 0 };
      daily[day].pnl += t.pnl;
      daily[day].count++;
      if (t.pnl >= 0) daily[day].wins++; else daily[day].losses++;

      // Hourly
      var hr = new Date(t.time).getUTCHours();
      if (!hourly[hr]) hourly[hr] = { pnl: 0, count: 0 };
      hourly[hr].pnl += t.pnl;
      hourly[hr].count++;

      // Token
      if (!tokens[t.token]) tokens[t.token] = { pnl: 0, count: 0, volume: 0 };
      tokens[t.token].pnl += t.pnl;
      tokens[t.token].count++;
      tokens[t.token].volume += t.size * t.price;
    });

    var sumWin  = wins.reduce(function (s, t) { return s + t.pnl; }, 0);
    var sumLoss = Math.abs(losses.reduce(function (s, t) { return s + t.pnl; }, 0));
    var avgWin  = wins.length  ? sumWin  / wins.length  : 0;
    var avgLoss = losses.length ? sumLoss / losses.length : 0;

    // Streaks
    var maxWS = 0, maxLS = 0, cw = 0, cl = 0;
    trades.forEach(function (t) {
      if (t.pnl >= 0) { cw++; cl = 0; if (cw > maxWS) maxWS = cw; }
      else            { cl++; cw = 0; if (cl > maxLS) maxLS = cl; }
    });

    var m = {
      totalPnL: totalPnL, wins: wins, losses: losses,
      winCount: wins.length, lossCount: losses.length,
      totalTrades: trades.length,
      winRate: trades.length ? (wins.length / trades.length * 100) : 0,
      avgWin: avgWin, avgLoss: avgLoss,
      profitFactor: sumLoss > 0 ? sumWin / sumLoss : 0,
      maxDD: maxDD, maxDDPct: maxDDPct,
      bestTrade: trades.reduce(function (a, b) { return a.pnl > b.pnl ? a : b; }).pnl,
      worstTrade: trades.reduce(function (a, b) { return a.pnl < b.pnl ? a : b; }).pnl,
      avgTrade: totalPnL / trades.length,
      expectancy: (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss,
      maxWinStreak: maxWS, maxLossStreak: maxLS,
      cumul: cumul, daily: daily, hourly: hourly, tokens: tokens
    };
    return m;
  }

  /* ================================================================
     RENDERERS
     ================================================================ */
  function fmt(n) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtK(n) {
    var a = Math.abs(n);
    if (a >= 1e6) return (n < 0 ? '-' : '') + '$' + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return (n < 0 ? '-' : '') + '$' + (a / 1e3).toFixed(1) + 'K';
    return '$' + fmt(n);
  }
  function pnlColor(v) { return v >= 0 ? 'var(--green)' : 'var(--red)'; }
  function pctColor(v) { return v >= 50 ? 'var(--green)' : v >= 30 ? 'var(--yellow)' : 'var(--red)'; }
  function tokenClass(t) {
    var l = t.toLowerCase();
    if (l === 'btc')  return 'token-btc';
    if (l === 'eth')  return 'token-eth';
    if (l === 'hype') return 'token-hype';
    if (l === 'usdc') return 'token-usdc';
    if (l === 'sol')  return 'token-sol';
    if (l === 'arb')  return 'token-arb';
    return '';
  }

  function getCSS(prop) {
    return getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
  }

  /* ── Stats Cards ──────────────────────────────────────────── */
  function renderStats(m) {
    var grid = document.getElementById('statsGrid');
    if (!grid) return;

    var cards = [
      { icon: ICONS.pnl,   label: 'Total P&L',     value: fmtK(m.totalPnL),    color: pnlColor(m.totalPnL),    cls: 'd1' },
      { icon: ICONS.win,   label: 'Win Rate',       value: m.winRate.toFixed(1) + '%', color: pctColor(m.winRate),  cls: 'd2' },
      { icon: ICONS.count, label: 'Total Trades',   value: m.totalTrades,        color: 'var(--blue)',            cls: 'd3' },
      { icon: ICONS.avg,   label: 'Avg Trade',      value: fmtK(m.avgTrade),     color: pnlColor(m.avgTrade),    cls: 'd4' },
      { icon: ICONS.pf,    label: 'Profit Factor',  value: m.profitFactor.toFixed(2), color: m.profitFactor >= 1 ? 'var(--green)' : 'var(--red)', cls: 'd5' },
      { icon: ICONS.dd,    label: 'Max Drawdown',   value: fmtK(m.maxDD) + ' (' + m.maxDDPct.toFixed(1) + '%)', color: 'var(--red)', cls: 'd6' },
      { icon: ICONS.best,  label: 'Best Trade',     value: fmtK(m.bestTrade),    color: 'var(--green)',           cls: 'd7' },
      { icon: ICONS.worst, label: 'Worst Trade',    value: fmtK(m.worstTrade),   color: 'var(--red)',             cls: 'd8' },
      { icon: ICONS.token, label: 'Tokens Traded',  value: Object.keys(m.tokens).length, color: 'var(--accent)', cls: 'd9' }
    ];

    grid.innerHTML = cards.map(function (c) {
      return '<div class="stat-card ' + c.cls + '">'
        + '<div class="stat-icon" style="color:' + c.color + '">' + c.icon + '</div>'
        + '<div class="stat-info"><div class="stat-label">' + c.label + '</div>'
        + '<div class="stat-value" style="color:' + c.color + '">' + c.value + '</div></div>'
        + '</div>';
    }).join('');
  }

  /* ── Charts ───────────────────────────────────────────────── */
  function destroyCharts() {
    charts.forEach(function (c) { c.destroy(); });
    charts = [];
  }

  function chartDefaults() {
    return {
      color: getCSS('--text-primary'),
      borderColor: getCSS('--border'),
      font: { family: "'Inter',system-ui,-apple-system,sans-serif" }
    };
  }

  function renderCharts(trades, m) {
    var d = chartDefaults();
    var gridC = getCSS('--grid-color');
    var txt2  = getCSS('--text-secondary');

    // ── 1. Equity Curve ──
    (function () {
      var ctx = document.getElementById('equityChart');
      if (!ctx) return;
      var c = new Chart(ctx, {
        type: 'line',
        data: {
          labels: trades.map(function (t) { return t.time.slice(5, 16).replace('T', ' '); }),
          datasets: [{
            label: 'Equity',
            data: m.cumul,
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168,85,247,.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHitRadius: 8,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return '$' + fmt(c.parsed.y); } } } },
          scales: {
            x: { ticks: { color: txt2, maxTicksLimit: 10, font: d.font }, grid: { color: gridC } },
            y: { ticks: { color: txt2, callback: function (v) { return '$' + fmtK(v); }, font: d.font }, grid: { color: gridC } }
          },
          interaction: { intersect: false, mode: 'index' }
        }
      });
      charts.push(c);
    })();

    // ── 2. P&L Distribution ──
    (function () {
      var ctx = document.getElementById('plDistChart');
      if (!ctx) return;
      var pnls = trades.map(function (t) { return t.pnl; });
      var mn = Math.min.apply(null, pnls), mx = Math.max.apply(null, pnls);
      var binCount = 30;
      var step = (mx - mn) / binCount || 1;
      var bins = [], labels = [];
      for (var i = 0; i < binCount; i++) { bins.push(0); labels.push(fmtK(mn + step * i)); }
      pnls.forEach(function (p) {
        var idx = Math.min(Math.floor((p - mn) / step), binCount - 1);
        if (idx < 0) idx = 0;
        bins[idx]++;
      });
      var colors = labels.map(function (_, i) { return (mn + step * i) >= 0 ? getCSS('--green') : getCSS('--red'); });
      var c = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ data: bins, backgroundColor: colors, borderRadius: 3 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: txt2, maxTicksLimit: 8, font: { size: 10, family: d.font.family } }, grid: { display: false } },
            y: { ticks: { color: txt2, font: d.font }, grid: { color: gridC } }
          }
        }
      });
      charts.push(c);
    })();

    // ── 3. Win / Loss Donut ──
    (function () {
      var ctx = document.getElementById('winLossChart');
      if (!ctx) return;
      var c = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Wins', 'Losses'],
          datasets: [{ data: [m.winCount, m.lossCount], backgroundColor: [getCSS('--green'), getCSS('--red')], borderWidth: 0, spacing: 3 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { position: 'bottom', labels: { color: txt2, padding: 16, font: d.font, usePointStyle: true, pointStyle: 'circle' } }
          }
        }
      });
      charts.push(c);
    })();

    // ── 4. P&L by Token ──
    (function () {
      var ctx = document.getElementById('tokenChart');
      if (!ctx) return;
      var tkns = Object.keys(m.tokens);
      var vals = tkns.map(function (t) { return m.tokens[t].pnl; });
      var cols = tkns.map(function (t) { return m.tokens[t].pnl >= 0 ? getCSS('--green') : getCSS('--red'); });
      var c = new Chart(ctx, {
        type: 'bar',
        data: { labels: tkns, datasets: [{ label: 'P&L', data: vals, backgroundColor: cols, borderRadius: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return '$' + fmt(c.parsed.x); } } } },
          scales: {
            x: { ticks: { color: txt2, callback: function (v) { return '$' + fmtK(v); }, font: d.font }, grid: { color: gridC } },
            y: { ticks: { color: txt2, font: d.font }, grid: { display: false } }
          }
        }
      });
      charts.push(c);
    })();

    // ── 5. Hourly Performance ──
    (function () {
      var ctx = document.getElementById('hourlyChart');
      if (!ctx) return;
      var labels = [], vals = [], counts = [];
      for (var h = 0; h < 24; h++) {
        labels.push(String(h).padStart(2, '0') + ':00');
        vals.push(m.hourly[h] ? m.hourly[h].pnl : 0);
        counts.push(m.hourly[h] ? m.hourly[h].count : 0);
      }
      var colors = vals.map(function (v) { return v >= 0 ? getCSS('--green') : getCSS('--red'); });
      var c = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [
          { label: 'P&L', data: vals, backgroundColor: colors, borderRadius: 3, order: 2 },
          { label: 'Trades', data: counts, type: 'line', borderColor: getCSS('--accent'), backgroundColor: 'transparent', pointRadius: 2, borderWidth: 1.5, yAxisID: 'y1', order: 1 }
        ]},
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: txt2, maxTicksLimit: 12, font: { size: 10, family: d.font.family } }, grid: { display: false } },
            y:  { ticks: { color: txt2, callback: function (v) { return '$' + fmtK(v); }, font: d.font }, grid: { color: gridC } },
            y1: { position: 'right', ticks: { color: txt2, font: d.font }, grid: { display: false } }
          }
        }
      });
      charts.push(c);
    })();

    // ── 6. Daily P&L (Calendar tab) ──
    (function () {
      var ctx = document.getElementById('dailyPLChart');
      if (!ctx) return;
      var days = Object.keys(m.daily).sort();
      var vals = days.map(function (d) { return m.daily[d].pnl; });
      var colors = vals.map(function (v) { return v >= 0 ? getCSS('--green') : getCSS('--red'); });
      var c = new Chart(ctx, {
        type: 'bar',
        data: { labels: days, datasets: [{ label: 'Daily P&L', data: vals, backgroundColor: colors, borderRadius: 3 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return '$' + fmt(c.parsed.y); } } } },
          scales: {
            x: { ticks: { color: txt2, maxTicksLimit: 15, font: { size: 10, family: d.font.family } }, grid: { display: false } },
            y: { ticks: { color: txt2, callback: function (v) { return '$' + fmtK(v); }, font: d.font }, grid: { color: gridC } }
          }
        }
      });
      charts.push(c);
    })();

    // ── 7. Token Volume (Analytics tab) ──
    (function () {
      var ctx = document.getElementById('volumeChart');
      if (!ctx) return;
      var tkns = Object.keys(m.tokens).sort(function (a, b) { return m.tokens[b].volume - m.tokens[a].volume; });
      var vals = tkns.map(function (t) { return m.tokens[t].volume; });
      var palette = [getCSS('--accent'), getCSS('--green'), getCSS('--blue'), getCSS('--yellow'), getCSS('--orange'), getCSS('--cyan')];
      var c = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: tkns, datasets: [{ data: vals, backgroundColor: palette.slice(0, tkns.length), borderWidth: 0, spacing: 2 }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '60%',
          plugins: { legend: { position: 'right', labels: { color: txt2, padding: 12, font: d.font, usePointStyle: true, pointStyle: 'circle' } } }
        }
      });
      charts.push(c);
    })();

    // ── 8. Trade Frequency (Analytics tab) ──
    (function () {
      var ctx = document.getElementById('freqChart');
      if (!ctx) return;
      var days = Object.keys(m.daily).sort();
      var vals = days.map(function (d) { return m.daily[d].count; });
      var c = new Chart(ctx, {
        type: 'bar',
        data: { labels: days, datasets: [{ label: 'Trades', data: vals, backgroundColor: getCSS('--accent') + '88', borderRadius: 3 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: txt2, maxTicksLimit: 15, font: { size: 10, family: d.font.family } }, grid: { display: false } },
            y: { ticks: { color: txt2, font: d.font }, grid: { color: gridC }, beginAtZero: true }
          }
        }
      });
      charts.push(c);
    })();

    // ── 9. Cumulative W/L (Analytics tab) ──
    (function () {
      var ctx = document.getElementById('cumulChart');
      if (!ctx) return;
      var cw = 0, cl = 0;
      var wData = [], lData = [], lbls = [];
      trades.forEach(function (t, i) {
        if (t.pnl >= 0) cw++; else cl++;
        wData.push(cw);
        lData.push(cl);
        lbls.push(t.time.slice(5, 16).replace('T', ' '));
      });
      var c = new Chart(ctx, {
        type: 'line',
        data: {
          labels: lbls,
          datasets: [
            { label: 'Wins', data: wData, borderColor: getCSS('--green'), backgroundColor: 'transparent', pointRadius: 0, borderWidth: 2, tension: 0.3 },
            { label: 'Losses', data: lData, borderColor: getCSS('--red'), backgroundColor: 'transparent', pointRadius: 0, borderWidth: 2, tension: 0.3 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: txt2, padding: 14, font: d.font, usePointStyle: true, pointStyle: 'circle' } } },
          scales: {
            x: { ticks: { color: txt2, maxTicksLimit: 8, font: { size: 10, family: d.font.family } }, grid: { display: false } },
            y: { ticks: { color: txt2, font: d.font }, grid: { color: gridC }, beginAtZero: true }
          },
          interaction: { intersect: false, mode: 'index' }
        }
      });
      charts.push(c);
    })();

    // ── 10. Size vs P&L Scatter (Analytics tab) ──
    (function () {
      var ctx = document.getElementById('sizeChart');
      if (!ctx) return;
      var pts = trades.map(function (t) { return { x: t.size, y: t.pnl }; });
      var cols = trades.map(function (t) { return t.pnl >= 0 ? getCSS('--green') : getCSS('--red'); });
      var c = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: [{ label: 'Trades', data: pts, backgroundColor: cols, pointRadius: 3, pointHoverRadius: 6 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return 'Size: ' + c.parsed.x.toFixed(2) + ' | P&L: $' + fmt(c.parsed.y); } } } },
          scales: {
            x: { title: { display: true, text: 'Position Size', color: txt2, font: d.font }, ticks: { color: txt2, font: d.font }, grid: { color: gridC } },
            y: { title: { display: true, text: 'P&L (USD)', color: txt2, font: d.font }, ticks: { color: txt2, callback: function (v) { return '$' + fmtK(v); }, font: d.font }, grid: { color: gridC } }
          }
        }
      });
      charts.push(c);
    })();
  }

  /* ── Calendar ─────────────────────────────────────────────── */
  function renderCalendar(m) {
    var container = document.getElementById('calendarContainer');
    if (!container) return;

    var days = Object.keys(m.daily).sort();
    if (!days.length) { container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px 0">No trading days found.</p>'; return; }

    var now = new Date();
    var curYear  = now.getUTCFullYear();
    var curMonth = now.getUTCMonth();

    function render(year, month) {
      var firstDay    = new Date(Date.UTC(year, month, 1)).getUTCDay();
      var daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      var monthNames  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      var dayLabels   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

      var html = '<div class="calendar-header">'
        + '<button class="cal-nav-btn" id="calPrev" type="button" aria-label="Previous month"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>'
        + '<span class="cal-month-label">' + monthNames[month] + ' ' + year + '</span>'
        + '<button class="cal-nav-btn" id="calNext" type="button" aria-label="Next month"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>'
        + '</div><div class="calendar-grid">';

      dayLabels.forEach(function (d) { html += '<div class="cal-day-label">' + d + '</div>'; });

      for (var i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';

      for (var d = 1; d <= daysInMonth; d++) {
        var key = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        var info = m.daily[key];
        if (info) {
          var cls = info.pnl >= 0 ? (info.losses > 0 ? 'mix-hyper' : 'win-hyper') : 'loss-hyper';
          var clr = info.pnl >= 0 ? 'var(--green)' : 'var(--red)';
          html += '<div class="cal-cell ' + cls + '" title="' + key + ': $' + fmt(info.pnl) + ' (' + info.count + ' trades)">'
            + '<div class="cal-day-num">' + d + '</div>'
            + '<div class="cal-pnl" style="color:' + clr + '">' + (info.pnl >= 0 ? '+' : '') + fmtK(info.pnl) + '</div>'
            + '<div class="cal-count">' + info.count + ' trades</div>'
            + '</div>';
        } else {
          html += '<div class="cal-cell"><div class="cal-day-num">' + d + '</div></div>';
        }
      }
      html += '</div>';
      container.innerHTML = html;

      // Wire nav buttons
      var prevBtn = document.getElementById('calPrev');
      var nextBtn = document.getElementById('calNext');
      if (prevBtn) prevBtn.addEventListener('click', function () {
        var nm = month - 1; var ny = year;
        if (nm < 0) { nm = 11; ny--; }
        render(ny, nm);
      });
      if (nextBtn) nextBtn.addEventListener('click', function () {
        var nm = month + 1; var ny = year;
        if (nm > 11) { nm = 0; ny++; }
        render(ny, nm);
      });
    }

    render(curYear, curMonth);
  }

  /* ── Trade Table ──────────────────────────────────────────── */
  function renderTable(trades, m) {
    var tbody = document.getElementById('tradesTableBody');
    var filterToken  = document.getElementById('filterToken');
    var filterResult = document.getElementById('filterResult');
    if (!tbody) return;

    // Populate token filter
    if (filterToken) {
      var tkns = Object.keys(m.tokens).sort();
      // Keep first "All Tokens" option, add rest
      filterToken.innerHTML = '<option value="all">All Tokens</option>'
        + tkns.map(function (t) { return '<option value="' + t + '">' + t + '</option>'; }).join('');
    }

    function buildRows() {
      var ft = filterToken  ? filterToken.value  : 'all';
      var fr = filterResult ? filterResult.value : 'all';
      var filtered = trades.slice().reverse(); // newest first
      if (ft !== 'all') filtered = filtered.filter(function (t) { return t.token === ft; });
      if (fr === 'win')  filtered = filtered.filter(function (t) { return t.pnl >= 0; });
      if (fr === 'loss') filtered = filtered.filter(function (t) { return t.pnl < 0;  });

      tbody.innerHTML = filtered.map(function (t, i) {
        var cumPnl = m.cumul[trades.length - 1 - i];
        var pnlC   = t.pnl >= 0 ? 'var(--green)' : 'var(--red)';
        var cumC   = cumPnl >= 0 ? 'var(--green)' : 'var(--red)';
        var shortHash = t.hash ? t.hash.slice(0, 10) + '...' : '';
        return '<tr>'
          + '<td>' + t.time.replace('T', ' ').slice(0, 19) + '</td>'
          + '<td class="' + tokenClass(t.token) + '" style="font-weight:600">' + t.token + '</td>'
          + '<td>' + t.side + '</td>'
          + '<td>' + t.size.toFixed(2) + '</td>'
          + '<td>$' + fmt(t.price) + '</td>'
          + '<td style="color:' + pnlC + ';font-weight:600">' + (t.pnl >= 0 ? '+' : '') + '$' + fmt(t.pnl) + '</td>'
          + '<td style="color:' + cumC + '">' + (cumPnl >= 0 ? '+' : '') + '$' + fmt(cumPnl) + '</td>'
          + '<td title="' + t.hash + '">' + shortHash + '</td>'
          + '</tr>';
      }).join('');
    }

    buildRows();
    if (filterToken)  filterToken.addEventListener('change', buildRows);
    if (filterResult) filterResult.addEventListener('change', buildRows);
  }

  /* ── Analytics Metric Cards ───────────────────────────────── */
  function renderAnalytics(m) {
    var grid = document.getElementById('metricsGrid');
    if (!grid) return;

    // Find best/worst token
    var bestToken = '', worstToken = '', bestPnl = -Infinity, worstPnl = Infinity;
    Object.keys(m.tokens).forEach(function (t) {
      if (m.tokens[t].pnl > bestPnl)  { bestPnl  = m.tokens[t].pnl; bestToken  = t; }
      if (m.tokens[t].pnl < worstPnl) { worstPnl = m.tokens[t].pnl; worstToken = t; }
    });

    // Best hour
    var bestHour = 0, bestHourPnl = -Infinity;
    for (var h = 0; h < 24; h++) {
      if (m.hourly[h] && m.hourly[h].pnl > bestHourPnl) { bestHourPnl = m.hourly[h].pnl; bestHour = h; }
    }

    var cards = [
      { label: 'Best Token',    value: bestToken  + ' (' + fmtK(bestPnl) + ')',    color: 'var(--green)' },
      { label: 'Worst Token',   value: worstToken + ' (' + fmtK(worstPnl) + ')',   color: 'var(--red)' },
      { label: 'Best Hour (UTC)', value: String(bestHour).padStart(2, '0') + ':00 (' + fmtK(bestHourPnl) + ')', color: 'var(--accent)' },
      { label: 'Max Win Streak', value: m.maxWinStreak + ' in a row', color: 'var(--green)' }
    ];

    grid.innerHTML = cards.map(function (c, i) {
      return '<div class="metric-card d' + (i + 1) + '">'
        + '<div class="metric-label">' + c.label + '</div>'
        + '<div class="metric-value" style="color:' + c.color + '">' + c.value + '</div>'
        + '</div>';
    }).join('');
  }

  /* ================================================================
     MAIN PIPELINE
     ================================================================ */
  function processData(csvText) {
    var rows   = parseCSV(csvText);
    allTrades  = buildTrades(rows);
    if (!allTrades.length) {
      var ls = document.getElementById('loadingState');
      if (ls) ls.innerHTML = '<div class="loading-spinner"></div><h2>No Trades Found</h2><p>No Close Long trades found in the CSV.</p>';
      return;
    }
    metrics = calcMetrics(allTrades);
    dailyMap = metrics.daily;

    destroyCharts();
    renderStats(metrics);
    renderCharts(allTrades, metrics);
    renderCalendar(metrics);
    renderTable(allTrades, metrics);
    renderAnalytics(metrics);

    // Show dashboard
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('dashboardPanels').style.display = '';

    // Meta
    var lastTime = allTrades[allTrades.length - 1].time;
    var lu = document.getElementById('lastUpdate');
    if (lu) lu.textContent = 'Updated: ' + lastTime.replace('T', ' ').slice(0, 19) + ' UTC';
    var gd = document.getElementById('genDate');
    if (gd) gd.textContent = new Date().toISOString().slice(0, 10);
  }

  /* ================================================================
     LOCAL CACHE — stores CSV for 7 page-opens
     ================================================================ */
  var CACHE_KEY    = 'hyper-csv-data';
  var CACHE_COUNT  = 'hyper-cache-count';
  var CACHE_MAX    = 7;
  var CSV_PATH     = 'csv/hyper.csv';   // relative — works locally & GitHub Pages

  function getCachedCSV() {
    try {
      var count = parseInt(localStorage.getItem(CACHE_COUNT), 10);
      var data  = localStorage.getItem(CACHE_KEY);
      if (data && count > 0) return data;
    } catch (e) { /* storage unavailable */ }
    return null;
  }

  function setCachedCSV(text) {
    try {
      localStorage.setItem(CACHE_KEY, text);
      localStorage.setItem(CACHE_COUNT, String(CACHE_MAX));
    } catch (e) { /* quota exceeded — silently ignore */ }
  }

  function tickCacheCount() {
    try {
      var c = parseInt(localStorage.getItem(CACHE_COUNT), 10);
      if (c > 0) localStorage.setItem(CACHE_COUNT, String(c - 1));
    } catch (e) {}
  }

  function showProgress(pct) {
    var ls = document.getElementById('loadingState');
    if (!ls) return;
    var bar = ls.querySelector('.progress-bar-inner');
    if (bar) bar.style.width = pct + '%';
  }

  /* ================================================================
     BOOT
     ================================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initSidebar();

    // Theme toggle
    var btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme') || 'dark';
      setTheme(current === 'dark' ? 'light' : 'dark');
      if (allTrades.length) { destroyCharts(); renderCharts(allTrades, metrics); }
    });

    // Show progress bar in loading state
    var ls = document.getElementById('loadingState');
    if (ls) {
      ls.innerHTML =
        '<div class="loading-spinner" aria-label="Loading"></div>'
        + '<h2>Loading Hyperliquid Data</h2>'
        + '<p id="loadMsg">Checking cache...</p>'
        + '<div class="progress-bar"><div class="progress-bar-inner" style="width:0%"></div></div>';
    }

    // 1) Try cache first — instant render
    var cached = getCachedCSV();
    if (cached) {
      tickCacheCount();
      if (ls) {
        var msg = document.getElementById('loadMsg');
        if (msg) msg.textContent = 'Loaded from cache (' + (cached.split(/\r?\n/).length) + ' rows)';
        showProgress(100);
      }
      // Render from cache immediately
      setTimeout(function () { processData(cached); }, 120);
      return;
    }

    // 2) No valid cache — fetch from server
    if (ls) {
      var msg = document.getElementById('loadMsg');
      if (msg) msg.textContent = 'Fetching ' + CSV_PATH + ' ...';
      showProgress(10);
    }

    fetch(CSV_PATH)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        showProgress(30);
        // Read with streaming-like progress for large files
        var reader = r.body.getReader();
        var decoder = new TextDecoder();
        var chunks = [];
        var total = 0;

        function readChunk() {
          return reader.read().then(function (result) {
            if (result.done) return;
            var text = decoder.decode(result.value, { stream: true });
            chunks.push(text);
            total += text.length;
            // Rough progress: assume ~200KB full file
            var pct = Math.min(30 + Math.round((total / 200000) * 60), 90);
            showProgress(pct);
            return readChunk();
          });
        }
        return readChunk().then(function () {
          return chunks.join('');
        });
      })
      .then(function (csv) {
        showProgress(95);
        setCachedCSV(csv);   // save for next 7 opens
        processData(csv);
        showProgress(100);
      })
      .catch(function (err) {
        showProgress(0);
        if (ls) {
          ls.innerHTML =
            '<div class="loading-spinner"></div>'
            + '<h2>Data Not Found</h2>'
            + '<p>Could not load <code>' + CSV_PATH + '</code> — ' + err.message + '</p>'
            + '<p style="margin-top:8px;font-size:13px;color:var(--text-muted)">'
            + 'Make sure <code>csv/hyper.csv</code> exists in the same folder as <code>hyper.html</code>.</p>';
        }
      });

    updateThemeIcon(document.documentElement.getAttribute('data-theme') || 'dark');
  });

})();