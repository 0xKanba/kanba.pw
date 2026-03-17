/* ══════════════════════════════════════════════════════════════
   HYPERLIQUID ANALYZER — see.js

   PnL Calendar (accurate daily):
     Source → portfolio endpoint allTime.pnlHistory
     Each entry [ts_ms, cumulativePnl]. Daily PnL = diff per day.
     Progressive: calendar renders instantly from portfolio call.
     Trade counts (volume, # trades) fill in after fills load.

   KPI — True Total PnL only (no duplicate):
     allTimePnl  = portfolio.allTime.pnlHistory last value
     24h/7d/30d  = portfolio day/week/month last values
     "Realized PnL" card removed — portfolio value IS more accurate.
     Trading stats (win rate, R/R, fees…) added after fills load.

   Analyze flow (two phases):
     Phase 1 (fast): perp, spot, mids, txData, portfolio
       → render balance, positions, calendar, tx, KPI stub
     Phase 2 (bg): fetchAllFills + fetchAllFunding
       → enrich calendar trade counts, full KPI, fills table
══════════════════════════════════════════════════════════════ */

const API = 'https://api.hyperliquid.xyz/info';

const ALIASES = {
  'Yasser': '0x6cc7ea5913c3002d53938b8e93da8425ab0bbafa',
  'Younes': '0x751d8d19760907d5d68c5ea758d1984282a0b39d',
  'Allawi': '0x8fb06d076cb42b3480a19bab8f1d7d4170839e0f',
  'Kanba':  '0x0640F5Bfc50AC53eC68C435a60cB0ffF5C555FAD',
};

const XYZ_ASSETS = [
  { id: 'gold',   coin: 'xyz:GOLD',   name: 'Gold',      icon: '🟡' },
  { id: 'silver', coin: 'xyz:SILVER', name: 'Silver',    icon: '⚪' },
  { id: 'oil',    coin: 'xyz:CL',     name: 'Crude Oil', icon: '🛢️' },
  { id: 'xyz',    coin: 'xyz:XYZ100', name: 'NASDAQ',    icon: '📈' },
];
const HL_ASSETS = ['BTC', 'ETH', 'SOL'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ── state ── */
let currentAddr = '';
let cdTimer     = null;
let calYear, calMonth;
let calPnlData  = {};
let allFills    = [];
let allFunding  = [];
let txAll = [], txFiltered = [], txTab = 'all', txPage = 0;
const TX_PER    = 25;

/* ══════════════════════════════════════════════
   API helper
══════════════════════════════════════════════ */
async function post(body) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* ══════════════════════════════════════════════
   CLOCK
══════════════════════════════════════════════ */
function startClock() {
  const tick = () => {
    const now = new Date();
    ge('clockDate').textContent = now.toLocaleDateString('en-GB',
      { day: 'numeric', month: 'short', year: 'numeric' });
    ge('clockTime').textContent = now.toLocaleTimeString('en-GB',
      { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  tick();
  setInterval(tick, 1000);
}

/* ══════════════════════════════════════════════
   SCROLL / BADGE
══════════════════════════════════════════════ */
function initScrollBehaviors() {
  const badge  = ge('floatBadge');
  const header = ge('siteHeader');
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    badge.classList.toggle('visible', y > 200);
    header.classList.toggle('scrolled', y > 10);
  }, { passive: true });
}
function updateBadge(addr) {
  ge('fbAddr').textContent = addr ? addr.slice(0,6) + '...' + addr.slice(-4) : '—';
}

/* ══════════════════════════════════════════════
   TICKER
══════════════════════════════════════════════ */
function buildTicker() {
  const track = ge('tickerTrack');
  const items = [
    ...XYZ_ASSETS.map(a => ({ id: a.id, sym: a.coin })),
    ...HL_ASSETS.map(s  => ({ id: s.toLowerCase(), sym: s })),
  ];
  const makeItem = (item, sfx) => {
    sfx = sfx || '';
    return '<div class="tick-item" id="ti-' + item.id + sfx + '">'
      + '<span class="tick-sym">' + item.sym + '</span>'
      + '<span class="tick-px" id="tp-' + item.id + sfx + '">—</span>'
      + '<span class="tick-chg neu" id="tc-' + item.id + sfx + '">…</span>'
      + '</div>';
  };
  track.innerHTML = items.map(function(i){ return makeItem(i) + makeItem(i, '2'); }).join('');
}
function setTickerPair(id, px, chg) {
  ['', '2'].forEach(function(sfx){
    const pe = ge('tp-' + id + sfx);
    const ce = ge('tc-' + id + sfx);
    if (pe && px) pe.textContent = '$' + fmtPrice(px);
    if (ce && chg != null) {
      ce.textContent   = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
      ce.className     = 'tick-chg ' + (chg >= 0 ? 'up' : 'dn');
    }
  });
}

/* ══════════════════════════════════════════════
   MARKET CARDS
══════════════════════════════════════════════ */
function buildMarketGrid() {
  const grid  = ge('mktGrid');
  const cards = [
    ...XYZ_ASSETS.map(a => ({ id: a.id, sym: a.coin, name: a.name, icon: a.icon })),
    ...HL_ASSETS.map(s  => ({ id: s.toLowerCase(), sym: s, name: s, icon: cryptoIcon(s) })),
  ];
  grid.innerHTML = cards.map(function(c, i){
    return '<div class="mkt-card" style="animation-delay:' + (i * 0.05) + 's">'
      + '<div class="mkt-dot"></div>'
      + '<span class="mkt-icon">' + c.icon + '</span>'
      + '<div class="mkt-sym">' + c.sym + '</div>'
      + '<div class="mkt-name">' + c.name + '</div>'
      + '<div class="mkt-price" id="mp-' + c.id + '">—</div>'
      + '<div class="mkt-chg neu" id="mc-' + c.id + '">—</div>'
      + '</div>';
  }).join('');
}
function cryptoIcon(s) {
  return s === 'BTC' ? '₿' : s === 'ETH' ? 'Ξ' : s === 'SOL' ? '◎' : '●';
}
function setMktCard(id, px, chg) {
  const pe = ge('mp-' + id);
  const ce = ge('mc-' + id);
  if (!pe) return;
  pe.textContent = '$' + fmtPrice(px);
  pe.dataset.raw = px;
  if (ce && chg != null) {
    ce.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
    ce.className   = 'mkt-chg ' + (chg >= 0 ? 'up' : 'dn');
    pe.style.color = chg >= 0 ? 'var(--green)' : 'var(--red)';
  }
  setTickerPair(id, px, chg);
}

/* ══════════════════════════════════════════════
   MARKET PRICE FETCH
══════════════════════════════════════════════ */
async function fetchMarket() {
  try {
    const xyzRes = await Promise.allSettled(
      XYZ_ASSETS.map(a => post({ type: 'l2Book', coin: a.coin }))
    );
    xyzRes.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const lb = r.value;
      if (!lb.levels || !lb.levels[0] || !lb.levels[0][0] || !lb.levels[1] || !lb.levels[1][0]) return;
      const bid = parseFloat(lb.levels[0][0].px);
      const ask = parseFloat(lb.levels[1][0].px);
      setMktCard(XYZ_ASSETS[i].id, (bid + ask) / 2, null);
    });

    const results = await Promise.all([
      post({ type: 'allMids' }),
      post({ type: 'metaAndAssetCtxs' }),
    ]);
    const midsR = results[0];
    const metaR = results[1];
    const prevMap = {};
    metaR[0].universe.forEach((u, i) => {
      prevMap[u.name] = parseFloat((metaR[1][i] && metaR[1][i].prevDayPx) || 0);
    });
    HL_ASSETS.forEach(sym => {
      const px  = parseFloat(midsR[sym]);
      const prv = prevMap[sym] || 0;
      const chg = prv > 0 ? (px - prv) / prv * 100 : null;
      setMktCard(sym.toLowerCase(), px, chg);
    });

    await Promise.allSettled(XYZ_ASSETS.map(async a => {
      const now = Date.now();
      const cr  = await post({
        type: 'candleSnapshot',
        req:  { coin: a.coin, interval: '1h', startTime: now - 86400000, endTime: now },
      });
      if (!Array.isArray(cr) || cr.length < 2) return;
      const firstOpen = parseFloat(cr[0].o);
      const lastClose = parseFloat(cr[cr.length - 1].c);
      const chg = firstOpen > 0 ? (lastClose - firstOpen) / firstOpen * 100 : null;
      const pxEl = ge('mp-' + a.id);
      const px   = pxEl ? parseFloat(pxEl.dataset.raw || 0) : 0;
      setMktCard(a.id, px, chg);
    }));
  } catch (e) { console.warn('Market fetch:', e.message); }
}

/* ══════════════════════════════════════════════
   ALIAS CHIPS
══════════════════════════════════════════════ */
function buildAliasChips() {
  ge('aliasRow').innerHTML = Object.keys(ALIASES).map(function(name){
    return '<span class="alias-chip" onclick="quickLoad(\'' + name + '\')">' + name + '</span>';
  }).join('');
}
function quickLoad(name) {
  ge('addrInput').value = name;
  analyze();
}

/* ══════════════════════════════════════════════
   FETCH ALL FILLS — complete history (chunked)
   Strategy:
   1. userFills → latest batch
   2. Chunk backward 30-day windows from oldest fill
   3. Stop after 3 consecutive empty chunks or 5yrs back
══════════════════════════════════════════════ */
async function fetchAllFills(addr) {
  setLoadText('Loading trade history…');

  const seen  = new Set();
  const fills = [];
  const CHUNK = 30 * 86400000;
  const LIMIT = Date.now() - 5 * 365 * 86400000;

  function addBatch(batch) {
    if (!Array.isArray(batch)) return 0;
    let added = 0;
    batch.forEach(function(f) {
      const key = f.oid != null
        ? f.oid + '-' + f.coin + '-' + f.side
        : f.time + '-' + f.coin + '-' + f.px + '-' + f.sz;
      if (!seen.has(key)) { seen.add(key); fills.push(f); added++; }
    });
    return added;
  }

  try {
    const latest = await post({ type: 'userFills', user: addr });
    addBatch(latest);
  } catch(e) { console.warn('userFills:', e.message); }

  let endTime     = fills.length
    ? Math.min.apply(null, fills.map(function(f){ return f.time; })) - 1
    : Date.now();
  let emptyStreak = 0;

  while (endTime > LIMIT && emptyStreak < 3) {
    const startTime = Math.max(endTime - CHUNK, LIMIT);
    const dateLabel = new Date(startTime).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    setLoadText('Loading fills… ' + fills.length.toLocaleString() + ' found (' + dateLabel + ')');
    try {
      const chunk = await post({
        type: 'userFillsByTime',
        user: addr,
        startTime: startTime,
        endTime: endTime,
        aggregateByTime: false,
      });
      const added = addBatch(chunk);
      emptyStreak = added === 0 ? emptyStreak + 1 : 0;
    } catch(e) {
      console.warn('chunk:', e.message);
      emptyStreak++;
    }
    endTime = startTime - 1;
  }

  fills.sort(function(a, b){ return b.time - a.time; });
  return fills;
}

/* ══════════════════════════════════════════════
   FETCH ALL FUNDING
══════════════════════════════════════════════ */
async function fetchAllFunding(addr) {
  try {
    const data = await post({ type: 'userFunding', user: addr, startTime: 0 });
    return Array.isArray(data) ? data : [];
  } catch(e) {
    console.warn('Funding fetch:', e.message);
    return [];
  }
}

/* ══════════════════════════════════════════════
   MAIN ANALYZE — two-phase
══════════════════════════════════════════════ */
async function analyze(isRefresh) {
  isRefresh = isRefresh || false;
  const raw  = isRefresh ? currentAddr : ge('addrInput').value.trim();
  const addr = ALIASES[raw] || raw;
  if (!addr || addr.length < 10) { showErr('Please enter a valid wallet address'); return; }
  currentAddr = addr;

  if (!isRefresh) {
    ['posCard','siteFooter','kpiGrid','calCard','txWrapper','feeNote','fillsCard'].forEach(function(id){
      const el = ge(id); if (el) el.style.display = 'none';
    });
    ge('balHero').style.display = 'none';
    showErr('');
    allFills   = [];
    allFunding = [];
  }

  show('loadingBar', 'flex');
  setLoadText('Fetching portfolio data…');

  try {
    /* ── Phase 1: fast fetch ── */
    const [perp, spot, mids, txData, portfolioData] = await Promise.all([
      post({ type: 'clearinghouseState',          user: addr }),
      post({ type: 'spotClearinghouseState',      user: addr }),
      post({ type: 'allMids' }),
      post({ type: 'userNonFundingLedgerUpdates', user: addr, startTime: 0 }),
      post({ type: 'portfolio',                   user: addr }),
    ]);

    updateBadge(addr);
    const wt = ge('walletTag');
    wt.style.display = 'flex';
    ge('walletAddr').textContent = addr.slice(0,6) + '...' + addr.slice(-4);

    /* render immediately from portfolio data */
    renderBalance(perp, spot);
    renderKPI([], [], portfolioData);              /* portfolio KPIs shown now */
    renderPositions(perp, mids);
    buildCalendarFromPnlHistory(portfolioData);    /* calendar from pnlHistory */
    renderTx(txData, addr);

    ['posCard','siteFooter','feeNote','txWrapper','calCard'].forEach(function(id){
      const el = ge(id); if (el) el.style.display = '';
    });
    ge('kpiGrid').style.display  = 'grid';
    ge('balHero').style.display  = 'block';
    ge('updTime').textContent    = new Date().toLocaleTimeString();
    showErr('');
    hide('loadingBar');

    if (!isRefresh) startCountdown();
    else {
      const tb = ge('totalBal');
      tb.classList.add('flash');
      setTimeout(function(){ tb.classList.remove('flash'); }, 350);
    }

    /* ── Phase 2: background fill loading ── */
    loadFillsBackground(addr, portfolioData);

  } catch(e) {
    showErr('Error: ' + e.message);
    console.error(e);
    hide('loadingBar');
  }
}

/* ── Background fills + funding ── */
async function loadFillsBackground(addr, portfolioData) {
  try {
    show('loadingBar', 'flex');
    allFills   = await fetchAllFills(addr);

    setLoadText('Fetching funding payments…');
    allFunding = await fetchAllFunding(addr);

    /* enrich calendar trade counts */
    enrichCalendarWithFills(allFills, allFunding);

    /* full KPI with trading stats */
    renderKPI(allFills, allFunding, portfolioData);

    /* update fees in balance row */
    const feeEl = ge('totalFees');
    if (feeEl) {
      const feeTot = allFills.reduce(function(a, f){ return a + parseFloat(f.fee || 0); }, 0);
      feeEl.textContent = fmt(Math.abs(feeTot), 2);
    }

    /* fills table */
    renderFills(allFills);
    show('fillsCard');

  } catch(e) {
    console.warn('Background fills:', e.message);
  } finally {
    hide('loadingBar');
    const pfn = ge('pnlFetchNote');
    if (pfn) pfn.style.display = 'none';
  }
}

function startCountdown() {
  clearInterval(cdTimer);
  let cd = 30;
  const timer = ge('refreshTimer');
  timer.style.display = 'block';
  ge('countdown').textContent = cd;
  cdTimer = setInterval(function(){
    cd--;
    ge('countdown').textContent = cd;
    if (cd <= 0) { cd = 30; analyze(true); }
  }, 1000);
}

/* ══════════════════════════════════════════════
   PORTFOLIO — parse period PnLs
══════════════════════════════════════════════ */
function parsePortfolio(portfolioData) {
  const result = { allTimePnl: null, monthPnl: null, weekPnl: null, dayPnl: null };
  if (!Array.isArray(portfolioData)) return result;
  portfolioData.forEach(function(item){
    const period  = item[0];
    const data    = item[1];
    const history = data && data.pnlHistory;
    if (!Array.isArray(history) || history.length === 0) return;
    const lastVal = parseFloat(history[history.length - 1][1]);
    if (period === 'allTime') result.allTimePnl = lastVal;
    if (period === 'month')   result.monthPnl   = lastVal;
    if (period === 'week')    result.weekPnl     = lastVal;
    if (period === 'day')     result.dayPnl      = lastVal;
  });
  return result;
}

/* ══════════════════════════════════════════════
   RENDER — BALANCE HERO
══════════════════════════════════════════════ */
function renderBalance(perp, spot) {
  const s     = perp.marginSummary || perp.crossMarginSummary || {};
  const perpV = parseFloat(s.accountValue || 0);
  const mU    = parseFloat(s.totalMarginUsed || 0);
  const mF    = parseFloat(perp.withdrawable != null ? perp.withdrawable : (perpV - mU));

  let unrealPnl = 0;
  (perp.assetPositions || []).forEach(function(p){
    unrealPnl += parseFloat(p.position.unrealizedPnl || 0);
  });

  let spotV = 0;
  (spot.balances || []).forEach(function(b){ spotV += parseFloat(b.total || 0); });

  const active = (perp.assetPositions || []).filter(function(p){
    return parseFloat(p.position.szi) !== 0;
  }).length;

  const total = perpV + spotV;

  show('balHero');
  animNum('totalBal',   total, 2);
  animNum('perpBal',    perpV, 2);
  animNum('spotBal',    spotV, 2);
  animNum('marginUsed', mU,    2);
  animNum('marginFree', mF,    2);

  const uEl = ge('unrealPnl');
  if (uEl) {
    uEl.textContent = (unrealPnl >= 0 ? '+' : '') + fmt(unrealPnl, 2);
    uEl.className   = 'si-val ' + (unrealPnl >= 0 ? 'green' : 'red');
  }
  ge('openCount').textContent = active;
  /* fees updated later in loadFillsBackground */
  ge('totalFees').textContent = '…';
}

/* ══════════════════════════════════════════════
   RENDER — KPI
   Phase 1 (fills=[]): shows portfolio PnLs only
   Phase 2 (fills loaded): adds trading stats
══════════════════════════════════════════════ */
function renderKPI(fills, funding, portfolioData) {
  const grid = ge('kpiGrid');
  const port = parsePortfolio(portfolioData);

  /* ── Trading stats (only when fills available) ── */
  const hasFills   = fills.length > 0;
  const tradesPnl  = fills.reduce(function(a, f){ return a + parseFloat(f.closedPnl || 0); }, 0);
  const fundingPnl = funding.reduce(function(a, f){ return a + parseFloat((f.delta && f.delta.usdc) || 0); }, 0);
  const feeAll     = fills.reduce(function(a, f){ return a + parseFloat(f.fee || 0); }, 0);
  const netReal    = tradesPnl + fundingPnl - feeAll;

  const closing = fills.filter(function(f){ return parseFloat(f.closedPnl || 0) !== 0; });
  const wins    = closing.filter(function(f){ return parseFloat(f.closedPnl) > 0; }).length;
  const losses  = closing.filter(function(f){ return parseFloat(f.closedPnl) < 0; }).length;
  const wr      = closing.length > 0 ? (wins / closing.length * 100).toFixed(1) : null;

  const winPnls  = closing.filter(function(f){ return parseFloat(f.closedPnl) > 0; })
                          .map(function(f){ return parseFloat(f.closedPnl); });
  const lossPnls = closing.filter(function(f){ return parseFloat(f.closedPnl) < 0; })
                          .map(function(f){ return parseFloat(f.closedPnl); });
  const avgWin   = winPnls.length  ? winPnls.reduce(function(a,b){ return a+b;},0)  / winPnls.length  : 0;
  const avgLoss  = lossPnls.length ? lossPnls.reduce(function(a,b){ return a+b;},0) / lossPnls.length : 0;
  const rr       = avgLoss !== 0 ? Math.abs(avgWin / avgLoss).toFixed(2) : '—';

  const makers = fills.filter(function(f){
    return f.crossed === false || (f.crossed == null && parseFloat(f.fee || 0) <= 0);
  }).length;
  const mkPct  = fills.length > 0 ? Math.round(makers / fills.length * 100) : 0;

  const dayPnl = {};
  fills.forEach(function(f){
    const pnl = parseFloat(f.closedPnl || 0); if (!pnl) return;
    const key = keyFromTime(f.time);
    dayPnl[key] = (dayPnl[key] || 0) + pnl;
  });
  const dayVals  = Object.values(dayPnl);
  const bestDay  = dayVals.length ? Math.max.apply(null, dayVals) : 0;
  const worstDay = dayVals.length ? Math.min.apply(null, dayVals) : 0;

  const totalVol = fills.reduce(function(a, f){
    return a + parseFloat(f.sz||0) * parseFloat(f.px||0);
  }, 0);
  const bigWin  = fills.length ? Math.max.apply(null, fills.map(function(f){ return parseFloat(f.closedPnl||0); })) : 0;
  const bigLoss = fills.length ? Math.min.apply(null, fills.map(function(f){ return parseFloat(f.closedPnl||0); })) : 0;

  let html = '';

  /* ── All-Time PnL (portfolio — most accurate) ── */
  if (port.allTimePnl != null) {
    html += kpiCard(
      'All-Time PnL ✦',
      (port.allTimePnl >= 0 ? '+' : '') + fmt(port.allTimePnl),
      port.allTimePnl >= 0 ? 'green' : 'red',
      'portfolio · most accurate',
      .02, true
    );
  }

  /* ── Period PnLs from portfolio ── */
  if (port.dayPnl != null) {
    html += kpiCard('24h PnL', (port.dayPnl >= 0 ? '+' : '') + fmt(port.dayPnl),
      port.dayPnl >= 0 ? 'green' : 'red', 'USDC', .04);
  }
  if (port.weekPnl != null) {
    html += kpiCard('7-Day PnL', (port.weekPnl >= 0 ? '+' : '') + fmt(port.weekPnl),
      port.weekPnl >= 0 ? 'green' : 'red', 'USDC', .06);
  }
  if (port.monthPnl != null) {
    html += kpiCard('30-Day PnL', (port.monthPnl >= 0 ? '+' : '') + fmt(port.monthPnl),
      port.monthPnl >= 0 ? 'green' : 'red', 'USDC', .08);
  }

  /* ── Stats below only after fills loaded ── */
  if (hasFills) {
    html += kpiCard('Net (after fees)',
      (netReal >= 0 ? '+' : '') + fmt(netReal),
      netReal >= 0 ? 'green' : 'red', 'realized − fees', .10);

    if (wr !== null) {
      html += '<div class="kpi" style="animation-delay:.12s">'
        + '<div class="kpi-lbl">Win Rate</div>'
        + '<div class="kpi-val ' + (parseFloat(wr) >= 50 ? 'green' : 'red') + '">' + wr + '%</div>'
        + '<div class="bar-w"><div class="bar-f" style="width:' + wr + '%"></div></div>'
        + '<div class="kpi-sub">' + wins + 'W / ' + losses + 'L</div>'
        + '</div>';
    }

    html += kpiCard('Total Trades', fills.length.toLocaleString(), 'yellow',
      closing.length.toLocaleString() + ' closing', .14);

    html += kpiCard('Risk / Reward', rr,
      rr !== '—' && parseFloat(rr) >= 1 ? 'green' : 'orange', 'avg win / avg loss', .16);

    html += kpiCard('Avg Win',  '+' + fmt(avgWin),  'green', 'per closing trade', .18);
    html += kpiCard('Avg Loss', fmt(avgLoss),        'red',   'per closing trade', .20);

    html += kpiCard('Maker Rate', mkPct + '%', 'purple',
      makers.toLocaleString() + ' trades', .22);

    html += kpiCard('Total Fees', fmt(Math.abs(feeAll)), 'orange',
      feeAll < 0 ? 'net rebates' : 'USDC paid', .24);

    html += kpiCard('Funding PnL',
      (fundingPnl >= 0 ? '+' : '') + fmt(fundingPnl),
      fundingPnl >= 0 ? 'cyan' : 'red',
      funding.length + ' events', .26);

    html += kpiCard('Best Day',   '+' + fmt(bestDay),  'green', 'USDC', .28);
    html += kpiCard('Worst Day',  fmt(worstDay),       'red',   'USDC', .30);
    html += kpiCard('Biggest Win',  '+' + fmt(bigWin),  'green', 'single trade', .32);
    html += kpiCard('Biggest Loss', fmt(bigLoss),       'red',   'single trade', .34);
    html += kpiCard('Total Volume', fmtLarge(totalVol), 'blue',  'USDC notional', .36);
  }

  grid.innerHTML = html;
}

function kpiCard(lbl, val, cls, sub, delay, highlight) {
  return '<div class="kpi' + (highlight ? ' kpi-highlight' : '') + '" style="animation-delay:' + delay + 's">'
    + '<div class="kpi-lbl">' + lbl + '</div>'
    + '<div class="kpi-val ' + cls + '">' + val + '</div>'
    + '<div class="kpi-sub">' + sub + '</div>'
    + '</div>';
}

/* ══════════════════════════════════════════════
   RENDER — POSITIONS
══════════════════════════════════════════════ */
function renderPositions(perp, mids) {
  const active = (perp.assetPositions || []).filter(function(p){
    return parseFloat(p.position.szi) !== 0;
  });
  ge('posBadge').textContent = active.length + ' position' + (active.length !== 1 ? 's' : '');

  if (!active.length) {
    ge('posTbody').innerHTML = '<tr class="no-data-row"><td colspan="12">No open positions</td></tr>';
    return;
  }

  const coinStats = {};
  allFills.forEach(function(f){
    if (!coinStats[f.coin]) coinStats[f.coin] = { fees: 0, count: 0, takers: 0, lastFill: null };
    const cs = coinStats[f.coin];
    cs.fees += parseFloat(f.fee || 0);
    cs.count++;
    if (f.crossed === true || (f.crossed == null && parseFloat(f.fee||0) > 0)) cs.takers++;
    if (!cs.lastFill) cs.lastFill = f;
  });

  ge('posTbody').innerHTML = active.map(function(p, i){
    const pos      = p.position;
    const size     = parseFloat(pos.szi);
    const entry    = parseFloat(pos.entryPx || 0);
    const unreal   = parseFloat(pos.unrealizedPnl || 0);
    const mark     = parseFloat(mids[pos.coin] || 0);
    const liq      = pos.liquidationPx ? parseFloat(pos.liquidationPx) : null;
    const notional = Math.abs(size) * mark;
    const leverage = (pos.leverage && pos.leverage.value) ? pos.leverage.value : null;
    const levType  = (pos.leverage && pos.leverage.type)  ? pos.leverage.type  : '';

    const pnlPct = entry > 0 && mark > 0
      ? (mark - entry) / entry * 100 * (size > 0 ? 1 : -1) : null;

    let liqDist = null;
    if (liq && mark > 0) liqDist = Math.abs((liq - mark) / mark * 100);

    const marginUsed = leverage && notional > 0 ? notional / parseFloat(leverage) : 0;
    const roe = marginUsed > 0 ? (unreal / marginUsed * 100) : null;

    const cs = coinStats[pos.coin] || {};
    const makerPct = cs.count > 0 ? Math.round((1 - cs.takers / cs.count) * 100) : null;
    const lastOt   = cs.lastFill ? orderType(cs.lastFill) : null;

    const coinRealized = (allFills.filter(function(f){ return f.coin === pos.coin; })
                                  .reduce(function(a,f){ return a + parseFloat(f.closedPnl||0); }, 0));

    const liqCls = liqDist != null && liqDist < 8 ? 'red' : liqDist != null && liqDist < 15 ? 'orange' : 'muted-txt';

    return '<tr class="row-anim" style="animation-delay:' + (i * 0.04) + 's">'
      + '<td class="pos-coin fw7">' + pos.coin + '</td>'
      + '<td><span class="tag ' + (size > 0 ? 'tag-buy' : 'tag-sell') + '">' + (size > 0 ? '▲ LONG' : '▼ SHORT') + '</span></td>'
      + '<td class="mono">' + fmt(Math.abs(size), 4) + '</td>'
      + '<td class="mono">' + fmt(entry, 2) + '</td>'
      + '<td class="mono blue">' + (mark ? fmt(mark, 2) : '—') + '</td>'
      + '<td class="mono ' + colClass(unreal) + ' fw7">' + (unreal >= 0 ? '+' : '') + fmt(unreal, 2) + ' $</td>'
      + '<td class="mono ' + colClass(unreal) + '">' + (pnlPct != null ? (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%' : '—') + '</td>'
      + '<td class="mono ' + (roe != null && roe >= 0 ? 'green' : 'red') + '">' + (roe != null ? (roe >= 0 ? '+' : '') + roe.toFixed(1) + '%' : '—') + '</td>'
      + '<td><span class="lev-badge ' + (levType === 'cross' ? 'lev-cross' : 'lev-iso') + '">'
          + (leverage ? leverage + 'x' : '—') + (levType === 'cross' ? ' ✕' : '') + '</span></td>'
      + '<td class="mono ' + liqCls + '">' + (liq ? fmt(liq, 2) : '—')
          + (liqDist != null ? '<br><span class="liq-dist">' + liqDist.toFixed(1) + '% away</span>' : '') + '</td>'
      + '<td class="mono muted-txt">' + (notional >= 1000 ? fmtLarge(notional) : fmt(notional, 0)) + '</td>'
      + '<td>'
          + (lastOt ? '<span class="tag ' + lastOt.cls + '">' + lastOt.label + '</span>' : '—')
          + (makerPct != null ? '<br><span class="maker-pct">' + makerPct + '% maker</span>' : '')
          + (coinRealized !== 0 ? '<br><span class="' + (coinRealized > 0 ? 'green' : 'red') + ' maker-pct">' + (coinRealized > 0 ? '+' : '') + fmt(coinRealized, 2) + '</span>' : '')
          + '</td>'
      + '</tr>';
  }).join('');
}

/* ══════════════════════════════════════════════
   PnL CALENDAR — accurate daily from pnlHistory
   ─────────────────────────────────────────────
   Source: portfolio.allTime.pnlHistory
     [[ts_ms, cumulativePnl], ...]
   Algorithm:
     1. Group by YYYY-MM-DD, keep LAST value per day
     2. Daily PnL = last_today - last_yesterday
   Progressive: trade counts added by enrichCalendarWithFills()
══════════════════════════════════════════════ */
function buildCalendarFromPnlHistory(portfolioData) {
  calPnlData = {};

  if (!Array.isArray(portfolioData)) {
    renderCalendar(); show('calCard'); return;
  }

  const allTimeItem = portfolioData.find(function(item){ return item[0] === 'allTime'; });
  if (!allTimeItem || !allTimeItem[1] || !Array.isArray(allTimeItem[1].pnlHistory)) {
    renderCalendar(); show('calCard'); return;
  }

  const hist = allTimeItem[1].pnlHistory; /* [[ts_ms, cum_pnl], ...] */

  /* Group: keep last cumulative PnL value per calendar day */
  const dayLast = {};
  hist.forEach(function(pt){
    const key = keyFromTime(pt[0]);
    dayLast[key] = parseFloat(pt[1]);
  });

  /* Sort days ascending to compute diffs */
  const days = Object.keys(dayLast).sort();

  days.forEach(function(key, i){
    const prev = i > 0 ? dayLast[days[i - 1]] : 0;
    const curr = dayLast[key];
    calPnlData[key] = {
      pnl:     curr - prev,
      volume:  0,
      trades:  -1,   /* -1 = "not yet loaded" */
      funding: 0,
    };
  });

  const now = new Date();
  calYear   = now.getFullYear();
  calMonth  = now.getMonth();
  renderCalendar();
  show('calCard');
}

/* Enrich calendar with fill trade counts (Phase 2) */
function enrichCalendarWithFills(fills, funding) {
  /* reset trade counts */
  Object.keys(calPnlData).forEach(function(k){
    calPnlData[k].trades  = 0;
    calPnlData[k].volume  = 0;
    calPnlData[k].funding = 0;
  });

  fills.forEach(function(f){
    const key = keyFromTime(f.time);
    if (!calPnlData[key]) calPnlData[key] = { pnl: 0, volume: 0, trades: 0, funding: 0 };
    calPnlData[key].volume += parseFloat(f.sz||0) * parseFloat(f.px||0);
    calPnlData[key].trades++;
  });

  funding.forEach(function(f){
    const usdc = parseFloat((f.delta && f.delta.usdc) || 0);
    if (!usdc) return;
    const key = keyFromTime(f.time);
    if (!calPnlData[key]) calPnlData[key] = { pnl: 0, volume: 0, trades: 0, funding: 0 };
    calPnlData[key].funding += usdc;
  });

  renderCalendar();
}

function calNav(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar();
}

function renderCalendar() {
  ge('calMonthLbl').textContent = MONTHS[calMonth] + ' ' + calYear;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const today       = new Date();

  let monthPnl = 0, monthVol = 0, monthTrades = 0, maxAbs = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const key  = calYear + '-' + pad2(calMonth + 1) + '-' + pad2(d);
    const data = calPnlData[key];
    if (data) {
      monthPnl    += data.pnl;
      monthVol    += data.volume;
      if (data.trades > 0) monthTrades += data.trades;
      if (Math.abs(data.pnl) > maxAbs) maxAbs = Math.abs(data.pnl);
    }
  }

  const sumEl = ge('calSummary');
  sumEl.innerHTML = '<span style="color:' + (monthPnl >= 0 ? 'var(--green)' : 'var(--red)') + '; font-size:14px; font-weight:700">'
    + (monthPnl >= 0 ? '+' : '') + fmt(monthPnl, 2) + ' $'
    + '</span>'
    + '<span class="cal-sum-sub">'
    + (monthTrades > 0 ? monthTrades.toLocaleString() + ' trades · ' : '')
    + (monthVol > 0 ? fmtLarge(monthVol) + ' vol' : '')
    + '</span>';

  let html = '';
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const key     = calYear + '-' + pad2(calMonth + 1) + '-' + pad2(d);
    const data    = calPnlData[key];
    const pnl     = data ? data.pnl : null;
    const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();

    let cls   = 'cal-day ';
    let inner = '';

    if (data && pnl !== 0) {
      cls += pnl > 0 ? 'pnl-pos' : 'pnl-neg';
      const intensity = maxAbs > 0 ? Math.min(Math.abs(pnl) / maxAbs, 1) : 0;
      const abs       = Math.abs(pnl);
      const sign      = pnl > 0 ? '+' : '';
      const pnlStr    = abs >= 100000 ? sign + (pnl/1000).toFixed(0) + 'k'
                      : abs >= 10000  ? sign + (pnl/1000).toFixed(1) + 'k'
                      : abs >= 1000   ? sign + pnl.toFixed(0)
                      : sign + pnl.toFixed(1);

      /* trades count display */
      let tradesStr = '';
      if (data.trades === -1) {
        tradesStr = '<div class="cal-trades" style="color:var(--dim)">…</div>';
      } else if (data.trades > 0) {
        tradesStr = '<div class="cal-trades">' + data.trades + 't</div>';
      }

      inner = '<div class="cal-intensity" style="height:' + Math.round(intensity * 100) + '%;opacity:' + (0.15 + intensity * 0.3) + '"></div>'
            + '<div class="cal-dn">' + d + '</div>'
            + '<div class="cal-pnl">' + pnlStr + '</div>'
            + tradesStr;
    } else {
      cls  += 'no-data';
      inner = '<div class="cal-dn">' + d + '</div>';
    }

    if (isToday) cls += ' today';

    const tooltipTrades = data && data.trades > 0 ? '\nTrades: ' + data.trades + '\nVolume: ' + fmtLarge(data.volume) : '';
    const tooltipFund   = data && data.funding ? '\nFunding: ' + fmt(data.funding, 2) + ' $' : '';
    const tooltip = data
      ? key + '\nPnL: ' + (pnl >= 0 ? '+' : '') + fmt(pnl, 2) + ' $' + tooltipTrades + tooltipFund
      : key;

    html += '<div class="' + cls + '" title="' + tooltip + '" style="animation:fade-up .22s ' + (((firstDay + d - 1) % 7) * 0.025) + 's both">' + inner + '</div>';
  }
  ge('calDays').innerHTML = html;
}

/* ══════════════════════════════════════════════
   RENDER — FILLS TABLE
══════════════════════════════════════════════ */
function renderFills(fills) {
  ge('fillsBadge').textContent = fills.length.toLocaleString();
  const tbody = ge('fillsTbody');
  if (!fills.length) {
    tbody.innerHTML = '<tr class="no-data-row"><td colspan="9">No trades found</td></tr>';
    return;
  }
  tbody.innerHTML = fills.slice(0, 500).map(function(f, i){
    const pnl   = parseFloat(f.closedPnl || 0);
    const fee   = parseFloat(f.fee || 0);
    const sz    = parseFloat(f.sz || 0);
    const px    = parseFloat(f.px || 0);
    const notl  = sz * px;
    const feePct = notl > 0 ? (Math.abs(fee) / notl * 100).toFixed(4) : '—';
    const ot    = orderType(f);
    return '<tr class="row-anim" style="animation-delay:' + Math.min(i * 0.01, 0.3) + 's">'
      + '<td class="tx-time">' + fmtTime(f.time) + '</td>'
      + '<td class="fw7">' + f.coin + '</td>'
      + '<td><span class="tag ' + (f.side === 'B' ? 'tag-buy' : 'tag-sell') + '">'
          + (f.side === 'B' ? '▲ Buy' : '▼ Sell') + '</span></td>'
      + '<td><span class="tag ' + ot.cls + '">' + ot.label + '</span></td>'
      + '<td class="mono">' + fmt(px, 2) + '</td>'
      + '<td class="mono">' + fmt(sz, 4) + '</td>'
      + '<td class="mono ' + colClass(pnl) + ' fw7">'
          + (pnl !== 0 ? (pnl >= 0 ? '+' : '') + fmt(pnl, 2) : '—') + '</td>'
      + '<td class="mono orange">' + fmt(Math.abs(fee), 4) + '</td>'
      + '<td class="mono muted-txt">' + feePct + (feePct !== '—' ? '%' : '') + '</td>'
      + '</tr>';
  }).join('');
}

/* ══════════════════════════════════════════════
   RENDER — TRANSACTIONS
══════════════════════════════════════════════ */
const TX_TYPE_LABELS = {
  deposit:              'Bridge Deposit',
  withdraw:             'Bridge Withdraw',
  spotTransfer:         'Spot Transfer',
  internalTransfer:     'Internal',
  subAccountTransfer:   'Sub-Account',
  accountClassTransfer: 'Classification',
  vaultDeposit:         'Vault Deposit',
  vaultWithdraw:        'Vault Withdraw',
  funding:              'Funding',
  liquidation:          'Liquidation',
};

function txClassify(tx) {
  const t = tx.delta.type;
  if (t === 'deposit')       return 'in';
  if (t === 'withdraw')      return 'out';
  if (t === 'vaultDeposit')  return 'out';
  if (t === 'vaultWithdraw') return 'in';
  if (t === 'spotTransfer')  return parseFloat(tx.delta.usdc || 0) > 0 ? 'in' : 'out';
  return 'int';
}
function txAmt(tx) {
  const d = tx.delta;
  return Math.abs(parseFloat(d.usdc || d.amount || d.nUsdc || 0));
}
function txFrom(tx, addr) {
  const d = tx.delta;
  if (d.type === 'deposit' || (d.type === 'spotTransfer' && d.user)) return d.user || addr;
  return addr;
}
function txTo(tx, addr) {
  const d = tx.delta;
  if (d.type === 'withdraw' || (d.type === 'spotTransfer' && d.destination)) return d.destination || '—';
  return addr;
}

function renderTx(raw, addr) {
  txAll = (Array.isArray(raw) ? raw : [])
    .map(function(tx){ return Object.assign({}, tx, { _dir: txClassify(tx), _amt: txAmt(tx) }); })
    .sort(function(a, b){ return b.time - a.time; });

  const bridgeIn  = txAll.filter(function(t){ return t.delta.type === 'deposit'; });
  const bridgeOut = txAll.filter(function(t){ return t.delta.type === 'withdraw'; });
  const bInTot    = bridgeIn.reduce(function(s, t){ return s + t._amt; }, 0);
  const bOutTot   = bridgeOut.reduce(function(s, t){ return s + t._amt; }, 0);
  const netBridge = bInTot - bOutTot;

  ge('txStatIn').textContent  = '+' + fmt(bInTot, 2);
  ge('txStatOut').textContent = '-' + fmt(bOutTot, 2);
  const netEl = ge('txStatNet');
  netEl.textContent = (netBridge >= 0 ? '+' : '') + fmt(netBridge, 2);
  netEl.className   = 'tsv ' + (netBridge >= 0 ? 'green' : 'red');
  ge('txStatCnt').textContent = txAll.length;

  ['all','in','out','int'].forEach(function(t){
    const el = ge('txcnt-' + t);
    if (!el) return;
    el.textContent = t === 'all' ? txAll.length : txAll.filter(function(tx){ return tx._dir === t; }).length;
  });
  ge('txInfoLbl').textContent = txAll.length + ' txns · ' + bridgeIn.length + ' deposits · ' + bridgeOut.length + ' withdrawals';

  txTab = 'all'; txPage = 0;
  document.querySelectorAll('.tx-tab').forEach(function(b){ b.classList.remove('active'); });
  const allTab = ge('txtab-all');
  if (allTab) allTab.classList.add('active');
  txApply();
}

function txSwitch(tab) {
  txTab = tab; txPage = 0;
  document.querySelectorAll('.tx-tab').forEach(function(b){ b.classList.remove('active'); });
  const btn = ge('txtab-' + tab);
  if (btn) btn.classList.add('active');
  txApply();
}
function txApply() {
  txFiltered = txTab === 'all' ? txAll : txAll.filter(function(t){ return t._dir === txTab; });
  txRenderPage();
}
function txRenderPage() {
  const start = txPage * TX_PER;
  const slice = txFiltered.slice(start, start + TX_PER);
  const tbody = ge('txTbody');
  const empty = ge('txEmpty');
  const pager = ge('txPager');

  if (!slice.length) {
    tbody.innerHTML     = '';
    empty.style.display = 'block';
    pager.style.display = 'none';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = slice.map(function(tx, i){
    const dir     = tx._dir;
    const amt     = tx._amt;
    const from    = txFrom(tx, currentAddr);
    const to      = txTo(tx, currentAddr);
    const isMe    = function(a){ return a && a.toLowerCase() === currentAddr.toLowerCase(); };
    const typeLbl = TX_TYPE_LABELS[tx.delta.type] || tx.delta.type;
    const token   = tx.delta.token || 'USDC';
    const chipCls = dir === 'in' ? 'tc-in' : dir === 'out' ? 'tc-out' : 'tc-int';
    const dirLbl  = dir === 'in' ? '↓ In' : dir === 'out' ? '↑ Out' : '⇄ Int';
    const amtCls  = dir === 'in' ? 'green' : dir === 'out' ? 'red' : 'blue';
    const sign    = dir === 'in' ? '+' : dir === 'out' ? '-' : '';
    return '<tr class="row-anim" style="animation-delay:' + (i * 0.02) + 's">'
      + '<td><span class="tx-chip ' + chipCls + '">' + dirLbl + '</span></td>'
      + '<td class="' + amtCls + ' fw7">' + sign + fmt(amt, amt < 1 ? 4 : 2) + '</td>'
      + '<td class="muted-txt" style="font-size:10px">' + token + '</td>'
      + '<td>' + (isMe(from) ? '<span class="tx-you">You</span>'
          : '<span class="tx-addr" onclick="navigator.clipboard&&navigator.clipboard.writeText(\'' + from + '\')" title="' + from + '">' + shortAddr(from) + '</span>') + '</td>'
      + '<td>' + (isMe(to) ? '<span class="tx-you">You</span>'
          : '<span class="tx-addr" onclick="navigator.clipboard&&navigator.clipboard.writeText(\'' + to + '\')" title="' + to + '">' + shortAddr(to) + '</span>') + '</td>'
      + '<td class="tx-time" title="' + new Date(tx.time).toLocaleString() + '">' + ageStr(tx.time) + '</td>'
      + '<td class="muted-txt" style="font-size:11px">' + typeLbl + '</td>'
      + '</tr>';
  }).join('');

  const total = txFiltered.length;
  const pages = Math.ceil(total / TX_PER);
  if (pages > 1) {
    ge('txPagerInfo').textContent = (start + 1) + '–' + Math.min(start + TX_PER, total) + ' of ' + total;
    ge('txBtnPrev').disabled = txPage === 0;
    ge('txBtnNext').disabled = txPage >= pages - 1;
    pager.style.display = 'flex';
  } else {
    pager.style.display = 'none';
  }
}
function txPrev() { if (txPage > 0) { txPage--; txRenderPage(); } }
function txNext() {
  if (txPage < Math.ceil(txFiltered.length / TX_PER) - 1) { txPage++; txRenderPage(); }
}

/* ══════════════════════════════════════════════
   ANIMATED NUMBER
══════════════════════════════════════════════ */
function animNum(id, val, decimals) {
  decimals = decimals != null ? decimals : 2;
  const el = ge(id);
  if (!el) return;
  const from = parseFloat(el.dataset.v || 0);
  const to   = parseFloat(val);
  if (isNaN(to)) { el.textContent = '—'; return; }
  el.dataset.v = to;
  if (Math.abs(from - to) < 0.01) { el.textContent = fmt(to, decimals); return; }
  const t0 = Date.now(), dur = 750;
  (function tick(){
    const p = Math.min((Date.now() - t0) / dur, 1);
    const e = p < .5 ? 2*p*p : -1 + (4 - 2*p)*p;
    el.textContent = fmt(from + (to - from) * e, decimals);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = fmt(to, decimals);
  })();
}

/* ══════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════ */
function ge(id)  { return document.getElementById(id); }
function show(id, d) { d = d || 'block'; const e = ge(id); if (e) e.style.display = d; }
function hide(id)    { const e = ge(id); if (e) e.style.display = 'none'; }
function fmt(n, d) {
  d = d != null ? d : 2;
  const v = parseFloat(n);
  if (isNaN(v)) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtLarge(v) {
  if (!v || isNaN(v)) return '—';
  if (v >= 1e9) return (v/1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v/1e3).toFixed(1) + 'K';
  return fmt(v, 2);
}
function fmtPrice(v) {
  if (!v || isNaN(v)) return '—';
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (v >= 1000)  return v.toFixed(2);
  if (v >= 100)   return v.toFixed(3);
  if (v >= 1)     return v.toFixed(4);
  return v.toFixed(5);
}
function fmtTime(ts) {
  return new Date(ts).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function ageStr(ts) {
  const d = Date.now() - ts;
  if (d < 60000)    return 'just now';
  if (d < 3600000)  return Math.floor(d/60000) + 'm ago';
  if (d < 86400000) return Math.floor(d/3600000) + 'h ago';
  return fmtTime(ts);
}
function shortAddr(a) {
  return a && a.length > 10 ? a.slice(0,6) + '...' + a.slice(-4) : (a || '—');
}
function pad2(n)  { return String(n).padStart(2, '0'); }
function colClass(v) { return v > 0 ? 'green' : v < 0 ? 'red' : ''; }
function keyFromTime(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
}
function orderType(f) {
  if (f.crossed === true)  return { label: 'Market', cls: 'tag-taker' };
  if (f.crossed === false) return { label: 'Limit',  cls: 'tag-maker' };
  return parseFloat(f.fee || 0) <= 0
    ? { label: 'Limit',  cls: 'tag-maker' }
    : { label: 'Market', cls: 'tag-taker' };
}
function showErr(msg) {
  const el = ge('errBox');
  if (!el) return;
  el.textContent   = msg;
  el.style.display = msg ? 'block' : 'none';
}
function setLoadText(txt) {
  const el = ge('loadingText');
  if (el) el.textContent = txt;
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function(){
  ge('addrInput').addEventListener('keydown', function(e){
    if (e.key === 'Enter') analyze();
  });
  buildAliasChips();
  buildMarketGrid();
  buildTicker();
  startClock();
  initScrollBehaviors();
  fetchMarket();
  setInterval(fetchMarket, 7000);
});
