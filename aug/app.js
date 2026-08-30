/* لوحة تحكم التداول الورقي — NAS100 أغسطس 2026
   يقرأ t-h.csv (سجل الصفقات) و b-h.csv (سجل الرصيد) ويبني كل التحليلات. */

/* ============ CSV parsing ============ */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; if (row.some(v => v !== '')) rows.push(row); row = []; }
    else field += c;
  }
  row.push(field);
  if (row.some(v => v !== '')) rows.push(row);
  const header = rows.shift().map(h => h.trim());
  return rows.map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}

const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
// "Aug 6, 2026, 04:17"
function parseTradeDate(str) {
  const m = /^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})/.exec(str || '');
  if (!m) return null;
  return new Date(+m[3], MONTHS[m[1]], +m[2], +m[4], +m[5]);
}
// "2026-08-28 23:49:25"
function parseBalDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(str || '');
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}
const num = v => { const n = parseFloat(String(v).replace(/[^\d.\-eE]/g, '')); return Number.isFinite(n) ? n : 0; };

/* ============ formatting ============ */
const fMoney = v => (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fMoney2 = v => (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fPrice = v => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fPct = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
const pad = n => String(n).padStart(2, '0');
const fDT = d => d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '—';
const fDTFull = d => d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : '—';
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function fDur(ms) {
  if (!ms || ms < 0) return '—';
  const m = Math.round(ms / 60000);
  if (m < 60) return m + ' د';
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r ? `${h}س ${r}د` : `${h}س`;
  return `${Math.floor(h / 24)}ي ${h % 24}س`;
}

/* ============ state ============ */
const S = {
  trades: [], balance: [], filtered: [],
  filters: { range: 'all', side: 'all', result: 'all', q: '' },
  sort: { key: 'entryTime', dir: 'desc' },
  page: 1, perPage: 25,
  charts: {},
};

/* ============ load ============ */
async function load() {
  const [tTxt, bTxt] = await Promise.all([
    fetch('t-h.csv').then(r => { if (!r.ok) throw new Error('t-h.csv'); return r.text(); }),
    fetch('b-h.csv').then(r => { if (!r.ok) throw new Error('b-h.csv'); return r.text(); }),
  ]);

  // --- trades: pair Entry/Exit rows per trade number ---
  const raw = parseCSV(tTxt);
  const byNum = new Map();
  for (const r of raw) {
    const n = num(r['Trade number']);
    const type = (r['Type'] || '').toLowerCase();
    const date = parseTradeDate(r['Date and time']);
    const rec = {
      date, price: num(r['Price']), qty: num(r['Size (qty)']), value: num(r['Size (value)']),
      pnl: num(r['Net PnL USD']), retPct: num(r['Return %']), cum: num(r['Cumulative PnL USD']),
      side: type.includes('short') ? 'short' : 'long',
    };
    if (!byNum.has(n)) byNum.set(n, { num: n, symbol: r['Symbol'] });
    const t = byNum.get(n);
    if (type.startsWith('entry')) t.entry = rec; else t.exit = rec;
    t.side = rec.side; t.pnl = rec.pnl; t.retPct = rec.retPct; t.cum = rec.cum;
    t.qty = rec.qty; t.value = rec.value;
  }
  S.trades = [...byNum.values()].filter(t => t.entry && t.exit).map(t => ({
    num: t.num, side: t.side, symbol: t.symbol,
    entryTime: t.entry.date, exitTime: t.exit.date,
    entryPrice: t.entry.price, exitPrice: t.exit.price,
    qty: t.qty, value: t.value, pnl: t.pnl, retPct: t.retPct, cum: t.cum,
    duration: t.exit.date && t.entry.date ? t.exit.date - t.entry.date : 0,
  })).sort((a, b) => a.entryTime - b.entryTime);

  // --- balance history (file is newest-first → reverse) ---
  S.balance = parseCSV(bTxt).map(r => ({
    time: parseBalDate(r['Time']),
    before: num(r['Balance before']),
    after: num(r['Balance after']),
    pnl: num(r['Realized PnL (value)']),
    action: r['Action'] || '',
  })).filter(b => b.time).sort((a, b) => a.time - b.time);

  document.getElementById('loader').hidden = true;
  document.getElementById('app').hidden = false;

  const first = S.trades[0]?.entryTime, last = S.trades[S.trades.length - 1]?.exitTime;
  document.getElementById('rangeLabel').textContent =
    first && last ? `${fDT(first)} → ${fDT(last)} · ${S.trades.length} صفقة` : '';

  applyFilters();
}

/* ============ filters ============ */
function applyFilters() {
  const { range, side, result, q } = S.filters;
  let list = S.trades.slice();

  if (range !== 'all' && S.trades.length) {
    const end = S.trades[S.trades.length - 1].exitTime.getTime();
    const from = end - (+range) * 86400000;
    list = list.filter(t => t.entryTime.getTime() >= from);
  }
  if (side !== 'all') list = list.filter(t => t.side === side);
  if (result !== 'all') list = list.filter(t => result === 'win' ? t.pnl > 0 : t.pnl < 0);
  if (q) {
    const s = q.trim().toLowerCase();
    list = list.filter(t =>
      String(t.num).includes(s) ||
      t.entryPrice.toFixed(2).includes(s) ||
      t.exitPrice.toFixed(2).includes(s));
  }
  S.filtered = list;
  S.page = 1;
  renderAll();
}

function renderAll() {
  renderStats();
  renderCharts();
  renderTimeline();
  renderBalanceTable();
  renderTradesTable();
}

/* ============ metrics ============ */
function metrics(list) {
  const wins = list.filter(t => t.pnl > 0), losses = list.filter(t => t.pnl < 0);
  const gross = wins.reduce((a, t) => a + t.pnl, 0);
  const loss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const total = list.reduce((a, t) => a + t.pnl, 0);

  // equity curve from balance history
  const bal = S.balance;
  const startBal = bal.length ? bal[0].before : 0;
  const endBal = bal.length ? bal[bal.length - 1].after : 0;
  let peak = -Infinity, maxDD = 0, maxDDPct = 0;
  for (const b of bal) {
    peak = Math.max(peak, b.after);
    const dd = peak - b.after;
    if (dd > maxDD) { maxDD = dd; maxDDPct = peak ? (dd / peak) * 100 : 0; }
  }

  let curW = 0, curL = 0, bestW = 0, bestL = 0;
  for (const t of list) {
    if (t.pnl > 0) { curW++; curL = 0; bestW = Math.max(bestW, curW); }
    else if (t.pnl < 0) { curL++; curW = 0; bestL = Math.max(bestL, curL); }
  }

  const avgWin = wins.length ? gross / wins.length : 0;
  const avgLoss = losses.length ? loss / losses.length : 0;
  const winRate = list.length ? (wins.length / list.length) * 100 : 0;

  return {
    total, wins: wins.length, losses: losses.length, count: list.length,
    winRate, profitFactor: loss ? gross / loss : (gross ? Infinity : 0),
    avgWin, avgLoss,
    bestTrade: list.reduce((m, t) => t.pnl > (m?.pnl ?? -Infinity) ? t : m, null),
    worstTrade: list.reduce((m, t) => t.pnl < (m?.pnl ?? Infinity) ? t : m, null),
    startBal, endBal, maxDD, maxDDPct, bestW, bestL,
    avgDur: list.length ? list.reduce((a, t) => a + t.duration, 0) / list.length : 0,
    volume: list.reduce((a, t) => a + t.qty, 0),
    turnover: list.reduce((a, t) => a + t.value, 0),
    expectancy: list.length ? total / list.length : 0,
  };
}

function renderStats() {
  const m = metrics(S.filtered);
  const retPct = m.startBal ? ((m.endBal - m.startBal) / m.startBal) * 100 : 0;
  const pf = m.profitFactor === Infinity ? '∞' : m.profitFactor.toFixed(2);

  const cards = [
    ['الرصيد الحالي', fMoney(m.endBal), `من ${fMoney(m.startBal)}`, m.endBal >= m.startBal ? 'success' : 'danger'],
    ['صافي الربح (المعروض)', `<span class="${m.total >= 0 ? 'positive' : 'negative'}">${fMoney(m.total)}</span>`, `${m.count} صفقة`, m.total >= 0 ? 'success' : 'danger'],
    ['العائد الكلي', `<span class="${retPct >= 0 ? 'positive' : 'negative'}">${fPct(retPct)}</span>`, 'على رأس المال الابتدائي', retPct >= 0 ? 'success' : 'danger'],
    ['نسبة الفوز', m.winRate.toFixed(1) + '%', `رابحة ${m.wins} · خاسرة ${m.losses}`, m.winRate >= 50 ? 'success' : 'warning'],
    ['عامل الربح', pf, `متوسط ربح ${fMoney(m.avgWin)}`, m.profitFactor >= 1 ? 'success' : 'danger'],
    ['التوقع لكل صفقة', `<span class="${m.expectancy >= 0 ? 'positive' : 'negative'}">${fMoney2(m.expectancy)}</span>`, `متوسط خسارة ${fMoney(m.avgLoss)}`, ''],
    ['أقصى تراجع', `<span class="negative">${fMoney(m.maxDD)}</span>`, m.maxDDPct.toFixed(2) + '% من القمة', 'danger'],
    ['أفضل صفقة', `<span class="positive">${m.bestTrade ? fMoney(m.bestTrade.pnl) : '—'}</span>`, m.bestTrade ? `#${m.bestTrade.num} · ${fDT(m.bestTrade.entryTime)}` : '', 'success'],
    ['أسوأ صفقة', `<span class="negative">${m.worstTrade ? fMoney(m.worstTrade.pnl) : '—'}</span>`, m.worstTrade ? `#${m.worstTrade.num} · ${fDT(m.worstTrade.entryTime)}` : '', 'danger'],
    ['أطول سلسلة', `${m.bestW} ✓`, `أطول خسائر متتالية ${m.bestL}`, 'purple'],
    ['متوسط المدة', fDur(m.avgDur), 'لكل صفقة', 'purple'],
    ['الحجم المتداول', m.volume.toLocaleString('en-US'), `قيمة ${fMoney(m.turnover)}`, ''],
  ];

  document.getElementById('statsGrid').innerHTML = cards.map(([label, val, sub, cls], i) => `
    <div class="stat-card ${cls}" style="animation-delay:${i * 30}ms">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${val}</div>
      <div class="stat-change">${sub}</div>
    </div>`).join('');
}

/* ============ charts ============ */
const css = v => getComputedStyle(document.body).getPropertyValue(v).trim();
const textColor = () => css('--text-secondary');
const gridColor = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.06)');

function baseOpts(extra = {}) {
  return Object.assign({
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: textColor(), font: { family: 'Tajawal', size: 11 }, boxWidth: 12, usePointStyle: true } },
      tooltip: {
        backgroundColor: css('--bg-secondary'), titleColor: css('--text-primary'),
        bodyColor: css('--text-primary'), borderColor: css('--border'), borderWidth: 1,
        padding: 10, titleFont: { family: 'Tajawal' }, bodyFont: { family: 'Tajawal' },
      },
    },
    scales: {
      x: { ticks: { color: textColor(), font: { family: 'Tajawal', size: 10 }, maxRotation: 0, autoSkipPadding: 18 }, grid: { color: gridColor() } },
      y: { ticks: { color: textColor(), font: { family: 'Tajawal', size: 10 } }, grid: { color: gridColor() } },
    },
  }, extra);
}

function draw(id, cfg) {
  S.charts[id]?.destroy();
  S.charts[id] = new Chart(document.getElementById(id), cfg);
}

function renderCharts() {
  const list = S.filtered;
  const GREEN = css('--success'), RED = css('--danger'), BLUE = css('--accent'), WARN = css('--warning'), PUR = css('--purple');

  /* balance + drawdown */
  const bal = S.balance;
  let peak = -Infinity;
  const ddSeries = bal.map(b => { peak = Math.max(peak, b.after); return { x: b.time, y: peak ? -((peak - b.after) / peak) * 100 : 0 }; });
  draw('balanceChart', {
    type: 'line',
    data: {
      datasets: [
        { label: 'الرصيد', data: bal.map(b => ({ x: b.time, y: b.after })), borderColor: BLUE, backgroundColor: 'rgba(59,130,246,.15)', fill: true, borderWidth: 2, pointRadius: 0, tension: .25, yAxisID: 'y' },
        { label: 'التراجع %', data: ddSeries, borderColor: RED, backgroundColor: 'rgba(239,68,68,.12)', fill: true, borderWidth: 1.5, pointRadius: 0, tension: .25, yAxisID: 'y1' },
      ],
    },
    options: baseOpts({
      scales: {
        x: { type: 'time', time: { unit: 'day' }, ticks: { color: textColor(), font: { family: 'Tajawal', size: 10 } }, grid: { color: gridColor() } },
        y: { position: 'right', ticks: { color: textColor(), font: { size: 10 }, callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: gridColor() } },
        y1: { position: 'left', max: 0, ticks: { color: textColor(), font: { size: 10 }, callback: v => v.toFixed(0) + '%' }, grid: { drawOnChartArea: false } },
      },
    }),
  });

  /* cumulative pnl of filtered trades */
  let run = 0;
  draw('cumPnlChart', {
    type: 'line',
    data: { datasets: [{ label: 'ربح تراكمي', data: list.map(t => { run += t.pnl; return { x: t.exitTime, y: run }; }), borderColor: GREEN, backgroundColor: 'rgba(16,185,129,.15)', fill: true, borderWidth: 2, pointRadius: 0, tension: .2 }] },
    options: baseOpts({
      scales: {
        x: { type: 'time', time: { unit: 'day' }, ticks: { color: textColor(), font: { size: 10 } }, grid: { color: gridColor() } },
        y: { ticks: { color: textColor(), font: { size: 10 }, callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: gridColor() } },
      },
    }),
  });

  /* per-trade pnl */
  draw('perTradeChart', {
    type: 'bar',
    data: {
      labels: list.map(t => '#' + t.num),
      datasets: [{ label: 'PnL', data: list.map(t => t.pnl), backgroundColor: list.map(t => t.pnl >= 0 ? GREEN : RED), borderRadius: 3 }],
    },
    options: baseOpts({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fMoney(c.parsed.y) } } } }),
  });

  /* daily pnl */
  const daily = new Map();
  list.forEach(t => { const k = dayKey(t.exitTime); daily.set(k, (daily.get(k) || 0) + t.pnl); });
  const dKeys = [...daily.keys()].sort();
  draw('dailyPnlChart', {
    type: 'bar',
    data: { labels: dKeys.map(k => k.slice(5)), datasets: [{ label: 'ربح يومي', data: dKeys.map(k => daily.get(k)), backgroundColor: dKeys.map(k => daily.get(k) >= 0 ? GREEN : RED), borderRadius: 4 }] },
    options: baseOpts({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fMoney(c.parsed.y) } } } }),
  });

  /* price scatter */
  draw('priceChart', {
    type: 'scatter',
    data: {
      datasets: [
        { label: 'دخول شراء', data: list.filter(t => t.side === 'long').map(t => ({ x: t.entryTime, y: t.entryPrice })), backgroundColor: GREEN, pointRadius: 3 },
        { label: 'خروج شراء', data: list.filter(t => t.side === 'long').map(t => ({ x: t.exitTime, y: t.exitPrice })), backgroundColor: 'rgba(16,185,129,.4)', pointRadius: 3, pointStyle: 'triangle' },
        { label: 'دخول بيع', data: list.filter(t => t.side === 'short').map(t => ({ x: t.entryTime, y: t.entryPrice })), backgroundColor: RED, pointRadius: 3 },
        { label: 'خروج بيع', data: list.filter(t => t.side === 'short').map(t => ({ x: t.exitTime, y: t.exitPrice })), backgroundColor: 'rgba(239,68,68,.4)', pointRadius: 3, pointStyle: 'triangle' },
      ],
    },
    options: baseOpts({
      interaction: { mode: 'nearest', intersect: true },
      scales: {
        x: { type: 'time', time: { unit: 'day' }, ticks: { color: textColor(), font: { size: 10 } }, grid: { color: gridColor() } },
        y: { ticks: { color: textColor(), font: { size: 10 }, callback: v => fPrice(v) }, grid: { color: gridColor() } },
      },
      plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fPrice(c.parsed.y)}` } } },
    }),
  });

  /* histogram */
  const vals = list.map(t => t.pnl);
  const bins = 12;
  let hLabels = [], hData = [], hColors = [];
  if (vals.length) {
    const min = Math.min(...vals), max = Math.max(...vals), step = (max - min) / bins || 1;
    hData = new Array(bins).fill(0);
    vals.forEach(v => { const i = Math.min(bins - 1, Math.floor((v - min) / step)); hData[i]++; });
    hLabels = hData.map((_, i) => fMoney(min + step * i));
    hColors = hData.map((_, i) => (min + step * (i + .5)) >= 0 ? GREEN : RED);
  }
  draw('histChart', {
    type: 'bar',
    data: { labels: hLabels, datasets: [{ label: 'عدد الصفقات', data: hData, backgroundColor: hColors, borderRadius: 4 }] },
    options: baseOpts({ plugins: { legend: { display: false } } }),
  });

  /* win rate doughnut */
  const m = metrics(list);
  draw('winRateChart', {
    type: 'doughnut',
    data: { labels: ['رابحة', 'خاسرة'], datasets: [{ data: [m.wins, m.losses], backgroundColor: [GREEN, RED], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: baseOpts().plugins, scales: {} },
  });

  /* long vs short */
  const agg = side => { const l = list.filter(t => t.side === side); return { pnl: l.reduce((a, t) => a + t.pnl, 0), n: l.length, wr: l.length ? l.filter(t => t.pnl > 0).length / l.length * 100 : 0 }; };
  const L = agg('long'), Sh = agg('short');
  draw('sideChart', {
    type: 'bar',
    data: {
      labels: ['شراء', 'بيع'],
      datasets: [
        { label: 'صافي الربح', data: [L.pnl, Sh.pnl], backgroundColor: [L.pnl >= 0 ? GREEN : RED, Sh.pnl >= 0 ? GREEN : RED], borderRadius: 5, yAxisID: 'y' },
        { label: 'نسبة الفوز %', data: [L.wr, Sh.wr], type: 'line', borderColor: WARN, backgroundColor: WARN, pointRadius: 5, yAxisID: 'y1' },
      ],
    },
    options: baseOpts({
      scales: {
        x: { ticks: { color: textColor(), font: { family: 'Tajawal' } }, grid: { display: false } },
        y: { ticks: { color: textColor(), font: { size: 10 }, callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: gridColor() } },
        y1: { position: 'left', min: 0, max: 100, ticks: { color: textColor(), font: { size: 10 }, callback: v => v + '%' }, grid: { drawOnChartArea: false } },
      },
    }),
  });

  /* by hour */
  const hours = new Array(24).fill(0), hoursN = new Array(24).fill(0);
  list.forEach(t => { const h = t.entryTime.getHours(); hours[h] += t.pnl; hoursN[h]++; });
  draw('hourChart', {
    type: 'bar',
    data: { labels: hours.map((_, i) => pad(i)), datasets: [{ label: 'صافي الربح', data: hours, backgroundColor: hours.map(v => v >= 0 ? GREEN : RED), borderRadius: 3 }] },
    options: baseOpts({
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${fMoney(c.parsed.y)} · ${hoursN[c.dataIndex]} صفقة` } } },
    }),
  });

  /* volume */
  draw('volumeChart', {
    type: 'bar',
    data: { labels: list.map(t => '#' + t.num), datasets: [{ label: 'الكمية', data: list.map(t => t.qty), backgroundColor: PUR, borderRadius: 3 }] },
    options: baseOpts({ plugins: { legend: { display: false } } }),
  });
}

/* ============ timeline ============ */
function renderTimeline() {
  const nums = new Set(S.filtered.map(t => t.num));
  const events = [];
  S.filtered.forEach(t => {
    events.push({ time: t.entryTime, kind: 'entry', t });
    events.push({ time: t.exitTime, kind: 'exit', t });
  });
  // balance events inside the filtered window
  if (S.filtered.length) {
    const from = Math.min(...S.filtered.map(t => t.entryTime.getTime()));
    const to = Math.max(...S.filtered.map(t => t.exitTime.getTime()));
    S.balance.filter(b => b.time >= from && b.time <= to).forEach(b => events.push({ time: b.time, kind: 'bal', b }));
  }
  events.sort((a, b) => b.time - a.time);
  const shown = events.slice(0, 300);

  document.getElementById('timelineCount').textContent = `${events.length} حدث · يعرض ${shown.length}`;
  document.getElementById('timeline').innerHTML = shown.map(e => {
    if (e.kind === 'bal') {
      const price = /at price ([\d.]+)/.exec(e.b.action)?.[1];
      const units = /for (\d+) units/.exec(e.b.action)?.[1];
      return `<div class="tl-item">
        <span class="tl-dot ${e.b.pnl >= 0 ? 'win' : 'loss'}"></span>
        <div><div class="tl-main">إغلاق مركز ${price ? '@ ' + fPrice(+price) : ''} ${units ? `· ${units} وحدة` : ''}</div>
        <div class="tl-sub">${fDTFull(e.time)} · الرصيد ${fMoney(e.b.before)} → ${fMoney(e.b.after)}</div></div>
        <div class="tl-val ${e.b.pnl >= 0 ? 'positive' : 'negative'}">${fMoney(e.b.pnl)}</div></div>`;
    }
    const t = e.t, isEntry = e.kind === 'entry';
    const sideAr = t.side === 'long' ? 'شراء' : 'بيع';
    return `<div class="tl-item">
      <span class="tl-dot ${isEntry ? 'entry' : (t.pnl >= 0 ? 'win' : 'loss')}"></span>
      <div><div class="tl-main">${isEntry ? 'دخول' : 'خروج'} ${sideAr} #${t.num} @ ${fPrice(isEntry ? t.entryPrice : t.exitPrice)}</div>
      <div class="tl-sub">${fDTFull(e.time)} · ${t.qty} وحدة · ${fMoney(t.value)}</div></div>
      <div class="tl-val ${isEntry ? 'muted' : (t.pnl >= 0 ? 'positive' : 'negative')}">${isEntry ? fDur(t.duration) : fMoney(t.pnl)}</div></div>`;
  }).join('') || '<div class="tl-sub">لا توجد أحداث ضمن الفلاتر الحالية.</div>';
  void nums;
}

/* ============ balance table ============ */
function renderBalanceTable() {
  const rows = S.balance.slice().reverse().slice(0, 200);
  document.getElementById('balanceTableBody').innerHTML = rows.map(b => `
    <tr>
      <td>${fDTFull(b.time)}</td>
      <td>${fMoney(b.before)}</td>
      <td>${fMoney(b.after)}</td>
      <td class="${b.pnl >= 0 ? 'positive' : 'negative'}">${fMoney2(b.pnl)}</td>
      <td class="action-cell">${b.action.replace(/for symbol VANTAGE:NAS100 /, '')}</td>
    </tr>`).join('');
}

/* ============ trades table ============ */
function sortedTrades() {
  const { key, dir } = S.sort;
  return S.filtered.slice().sort((a, b) => {
    const va = a[key], vb = b[key];
    const cmp = va instanceof Date ? va - vb : (typeof va === 'string' ? va.localeCompare(vb) : va - vb);
    return dir === 'asc' ? cmp : -cmp;
  });
}

function renderTradesTable() {
  const all = sortedTrades();
  const pages = Math.max(1, Math.ceil(all.length / S.perPage));
  S.page = Math.min(S.page, pages);
  const rows = all.slice((S.page - 1) * S.perPage, S.page * S.perPage);

  document.getElementById('tradesCount').textContent = `${all.length} صفقة · صفحة ${S.page}/${pages}`;
  document.getElementById('tradesTableBody').innerHTML = rows.map(t => `
    <tr>
      <td>#${t.num}</td>
      <td><span class="badge ${t.side}">${t.side === 'long' ? 'شراء' : 'بيع'}</span></td>
      <td>${fDT(t.entryTime)}</td>
      <td>${fDT(t.exitTime)}</td>
      <td class="muted">${fDur(t.duration)}</td>
      <td>${fPrice(t.entryPrice)}</td>
      <td>${fPrice(t.exitPrice)}</td>
      <td>${t.qty.toLocaleString('en-US')}</td>
      <td class="muted">${fMoney(t.value)}</td>
      <td class="${t.pnl >= 0 ? 'positive' : 'negative'}">${fMoney(t.pnl)}</td>
      <td class="${t.retPct >= 0 ? 'positive' : 'negative'}">${fPct(t.retPct)}</td>
      <td class="${t.cum >= 0 ? 'positive' : 'negative'}">${fMoney(t.cum)}</td>
    </tr>`).join('') || '<tr><td colspan="12" class="muted">لا توجد صفقات مطابقة.</td></tr>';

  // pagination
  const el = document.getElementById('pagination');
  const btn = (label, page, opts = {}) =>
    `<button ${opts.disabled ? 'disabled' : ''} class="${opts.active ? 'active' : ''}" data-page="${page}">${label}</button>`;
  let html = btn('‹', S.page - 1, { disabled: S.page === 1 });
  const win = [];
  for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - S.page) <= 2) win.push(p);
  let prev = 0;
  win.forEach(p => { if (p - prev > 1) html += '<button disabled>…</button>'; html += btn(p, p, { active: p === S.page }); prev = p; });
  html += btn('›', S.page + 1, { disabled: S.page === pages });
  el.innerHTML = html;
}

/* ============ events ============ */
document.querySelectorAll('.filter-group').forEach(g => {
  const key = g.dataset.key;
  g.querySelectorAll('.chip').forEach((c, i) => {
    if (i === 0) c.classList.add('active');
    c.addEventListener('click', () => {
      g.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      S.filters[key] = c.dataset.val;
      applyFilters();
    });
  });
});

let searchTimer;
document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { S.filters.q = e.target.value; applyFilters(); }, 200);
});

document.getElementById('pagination').addEventListener('click', e => {
  const b = e.target.closest('button[data-page]');
  if (!b || b.disabled) return;
  S.page = +b.dataset.page;
  renderTradesTable();
  document.getElementById('tradesTable').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.querySelectorAll('#tradesTable th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    S.sort = { key, dir: S.sort.key === key && S.sort.dir === 'desc' ? 'asc' : 'desc' };
    renderTradesTable();
  });
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const head = ['Trade', 'Side', 'Entry time', 'Exit time', 'Duration (min)', 'Entry price', 'Exit price', 'Qty', 'Value', 'PnL', 'Return %', 'Cumulative PnL'];
  const lines = [head.join(',')].concat(sortedTrades().map(t => [
    t.num, t.side, fDTFull(t.entryTime), fDTFull(t.exitTime), Math.round(t.duration / 60000),
    t.entryPrice, t.exitPrice, t.qty, t.value, t.pnl, t.retPct, t.cum,
  ].join(',')));
  const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'nas100-trades-filtered.csv'; a.click();
  URL.revokeObjectURL(url);
});

const themeBtn = document.getElementById('themeToggle');
themeBtn.addEventListener('click', () => {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  document.documentElement.setAttribute('data-theme', light ? 'dark' : 'light');
  document.body.setAttribute('data-theme', light ? 'dark' : 'light');
  document.getElementById('themeIcon').textContent = light ? '☀️' : '🌙';
  document.getElementById('themeText').textContent = light ? 'فاتح' : 'داكن';
  renderCharts();
});

load().catch(err => {
  document.getElementById('loader').hidden = true;
  const box = document.getElementById('errorBox');
  box.hidden = false;
  box.textContent = 'تعذّر تحميل البيانات: ' + err.message + ' — تأكد من وجود t-h.csv و b-h.csv بجانب الصفحة.';
});
