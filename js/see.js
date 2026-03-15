/* ══════════════════════════════════════════════════════════════
   HYPERLIQUID ANALYZER — see.js

   PnL Formula (official HL docs):
     True PnL = accountValue + totalWithdrawals − totalDeposits
     (from portfolio endpoint pnlHistory last value)

   Fills fetch:  ALWAYS chunked by time — no fill count limit.
     Strategy: go back from now in 30-day windows until 3 empty
     consecutive chunks → stop. Covers wallets with 10,000+ fills.

   Realized PnL = Σ fill.closedPnl + Σ funding.delta.usdc
   Unrealized PnL = from open assetPositions
   Deposits/Withdrawals = bridge-level ops only
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
let currentAddr  = '';
let cdTimer      = null;
let calYear, calMonth;
let calPnlData   = {};
let allFills     = [];
let allFunding   = [];
let txAll = [], txFiltered = [], txTab = 'all', txPage = 0;
const TX_PER    = 25;
const mktPrices = {};

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
      ce.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
      ce.className   = 'tick-chg ' + (chg >= 0 ? 'up' : 'dn');
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
      const px  = pxEl ? parseFloat(pxEl.dataset.raw || 0) : 0;
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
   FETCH ALL FILLS — COMPLETE HISTORY (no limit)
   ────────────────────────────────────────────
   Strategy:
   1. userFills → latest batch (up to ~2000)
   2. ALWAYS continue: chunk backward in 30-day windows
      from oldest known fill timestamp.
   3. Stop: 3 consecutive empty chunks OR 5 years back.
   Handles wallets with 10,000+ fills correctly.
══════════════════════════════════════════════ */
async function fetchAllFills(addr) {
  setLoadText('Fetching all trade history...');

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

  /* Step 1: latest fills */
  try {
    const latest = await post({ type: 'userFills', user: addr });
    addBatch(latest);
  } catch(e) { console.warn('userFills:', e.message); }

  /* Step 2: always chunk backward regardless of count */
  let endTime     = fills.length
    ? Math.min.apply(null, fills.map(function(f){ return f.time; })) - 1
    : Date.now();
  let emptyStreak = 0;

  while (endTime > LIMIT && emptyStreak < 3) {
    const startTime = Math.max(endTime - CHUNK, LIMIT);
    const dateLabel = new Date(startTime).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    setLoadText('Loading fills... ' + fills.length.toLocaleString() + ' found (' + dateLabel + ')');
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
      console.warn('chunk fetch:', e.message);
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
   MAIN ANALYZE
══════════════════════════════════════════════ */
async function analyze(isRefresh) {
  isRefresh = isRefresh || false;
  const raw  = isRefresh ? currentAddr : ge('addrInput').value.trim();
  const addr = ALIASES[raw] || raw;
  if (!addr || addr.length < 10) { showErr('Please enter a valid wallet address'); return; }
  currentAddr = addr;

  if (!isRefresh) {
    ['posCard','siteFooter','kpiGrid','calCard','txWrapper','feeNote'].forEach(function(id){
      const el = ge(id); if (el) el.style.display = 'none';
    });
    ge('balHero').style.display = 'none';
    showErr('');
  }

  show('loadingBar', 'flex');
  setLoadText('Fetching portfolio data...');

  try {
    const results = await Promise.all([
      post({ type: 'clearinghouseState',          user: addr }),
      post({ type: 'spotClearinghouseState',      user: addr }),
      post({ type: 'allMids' }),
      post({ type: 'userNonFundingLedgerUpdates', user: addr, startTime: 0 }),
      post({ type: 'portfolio',                   user: addr }),
    ]);
    const perp          = results[0];
    const spot          = results[1];
    const mids          = results[2];
    const txData        = results[3];
    const portfolioData = results[4];

    allFills   = await fetchAllFills(addr);
    setLoadText('Fetching funding payments...');
    allFunding = await fetchAllFunding(addr);

    updateBadge(addr);
    const wt = ge('walletTag');
    wt.style.display = 'flex';
    ge('walletAddr').textContent = addr.slice(0,6) + '...' + addr.slice(-4);

    renderBalance(perp, spot, allFills, allFunding, portfolioData);
    renderKPI(allFills, allFunding, portfolioData);
    renderPositions(perp, mids);
    buildCalendar(allFills, allFunding);
    renderTx(txData, addr);

    ['posCard','siteFooter','feeNote','txWrapper','calCard'].forEach(function(id){
      const el = ge(id); if (el) el.style.display = '';
    });
    ge('kpiGrid').style.display = 'grid';
    ge('balHero').style.display = 'block';
    ge('updTime').textContent = new Date().toLocaleTimeString();
    showErr('');

    if (!isRefresh) startCountdown();
    else {
      const tb = ge('totalBal');
      tb.classList.add('flash');
      setTimeout(function(){ tb.classList.remove('flash'); }, 350);
    }
  } catch(e) {
    showErr('Error: ' + e.message);
    console.error(e);
  } finally {
    hide('loadingBar');
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
   PORTFOLIO ENDPOINT → true PnL
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
    if (period === 'week')    result.weekPnl    = lastVal;
    if (period === 'day')     result.dayPnl     = lastVal;
  });
  return result;
}

/* ══════════════════════════════════════════════
   RENDER — BALANCE HERO
══════════════════════════════════════════════ */
function renderBalance(perp, spot, fills, funding, portfolioData) {
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

  const feeTot = fills.reduce(function(a, f){ return a + parseFloat(f.fee || 0); }, 0);
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
  ge('totalFees').textContent  = fmt(Math.abs(feeTot), 2);
  ge('openCount').textContent  = active;
}

/* ══════════════════════════════════════════════
   RENDER — KPI
══════════════════════════════════════════════ */
function renderKPI(fills, funding, portfolioData) {
  const grid = ge('kpiGrid');

  const port       = parsePortfolio(portfolioData);
  const allTimePnl = port.allTimePnl;

  const tradesPnl  = fills.reduce(function(a, f){ return a + parseFloat(f.closedPnl || 0); }, 0);
  const fundingPnl = funding.reduce(function(a, f){ return a + parseFloat((f.delta && f.delta.usdc) || 0); }, 0);
  const totalReal  = tradesPnl + fundingPnl;
  const feeAll     = fills.reduce(function(a, f){ return a + parseFloat(f.fee || 0); }, 0);
  const netReal    = totalReal - feeAll;

  /* only trades that close a position */
  const closing = fills.filter(function(f){ return parseFloat(f.closedPnl || 0) !== 0; });
  const wins    = closing.filter(function(f){ return parseFloat(f.closedPnl) > 0; }).length;
  const losses  = closing.filter(function(f){ return parseFloat(f.closedPnl) < 0; }).length;
  const wr      = closing.length > 0 ? (wins / closing.length * 100).toFixed(1) : '0.0';

  const winPnls  = closing.filter(function(f){ return parseFloat(f.closedPnl) > 0; })
                          .map(function(f){ return parseFloat(f.closedPnl); });
  const lossPnls = closing.filter(function(f){ return parseFloat(f.closedPnl) < 0; })
                          .map(function(f){ return parseFloat(f.closedPnl); });
  const avgWin   = winPnls.length  ? winPnls.reduce(function(a,b){ return a+b; }, 0)  / winPnls.length  : 0;
  const avgLoss  = lossPnls.length ? lossPnls.reduce(function(a,b){ return a+b; }, 0) / lossPnls.length : 0;
  const rr       = avgLoss !== 0 ? Math.abs(avgWin / avgLoss).toFixed(2) : '—';

  const makers   = fills.filter(function(f){
    return f.crossed === false || (f.crossed == null && parseFloat(f.fee || 0) <= 0);
  }).length;
  const mkPct    = fills.length > 0 ? Math.round(makers / fills.length * 100) : 0;

  /* best / worst day */
  const dayPnl = {};
  fills.forEach(function(f){
    const pnl = parseFloat(f.closedPnl || 0);
    if (!pnl) return;
    const key = keyFromTime(f.time);
    dayPnl[key] = (dayPnl[key] || 0) + pnl;
  });
  const dayVals  = Object.values(dayPnl);
  const bestDay  = dayVals.length ? Math.max.apply(null, dayVals) : 0;
  const worstDay = dayVals.length ? Math.min.apply(null, dayVals) : 0;

  const totalVol = fills.reduce(function(a, f){
    return a + parseFloat(f.sz||0) * parseFloat(f.px||0);
  }, 0);

  const allPnls   = fills.map(function(f){ return parseFloat(f.closedPnl||0); });
  const bigWin    = allPnls.length ? Math.max.apply(null, allPnls) : 0;
  const bigLoss   = allPnls.length ? Math.min.apply(null, allPnls) : 0;

  let html = '';

  if (allTimePnl != null) {
    html += '<div class="kpi kpi-highlight" style="animation-delay:.02s">'
      + '<div class="kpi-lbl">True Total PnL ✦</div>'
      + '<div class="kpi-val ' + (allTimePnl >= 0 ? 'green' : 'red') + '">' + (allTimePnl >= 0 ? '+' : '') + fmt(allTimePnl) + '</div>'
      + '<div class="kpi-sub">portfolio · most accurate</div>'
      + '</div>';
  }

  html += '<div class="kpi" style="animation-delay:.04s">'
    + '<div class="kpi-lbl">Realized PnL</div>'
    + '<div class="kpi-val ' + (totalReal >= 0 ? 'green' : 'red') + '">' + (totalReal >= 0 ? '+' : '') + fmt(totalReal) + '</div>'
    + '<div class="kpi-sub">trades + funding</div>'
    + '</div>';

  html += '<div class="kpi" style="animation-delay:.06s">'
    + '<div class="kpi-lbl">Net (after fees)</div>'
    + '<div class="kpi-val ' + (netReal >= 0 ? 'green' : 'red') + '">' + (netReal >= 0 ? '+' : '') + fmt(netReal) + '</div>'
    + '<div class="kpi-sub">USDC</div>'
    + '</div>';

  if (port.dayPnl != null) {
    html += '<div class="kpi" style="animation-delay:.08s">'
      + '<div class="kpi-lbl">24h PnL</div>'
      + '<div class="kpi-val ' + (port.dayPnl >= 0 ? 'green' : 'red') + '">' + (port.dayPnl >= 0 ? '+' : '') + fmt(port.dayPnl) + '</div>'
      + '<div class="kpi-sub">USDC</div>'
      + '</div>';
  }

  if (port.weekPnl != null) {
    html += '<div class="kpi" style="animation-delay:.10s">'
      + '<div class="kpi-lbl">7-Day PnL</div>'
      + '<div class="kpi-val ' + (port.weekPnl >= 0 ? 'green' : 'red') + '">' + (port.weekPnl >= 0 ? '+' : '') + fmt(port.weekPnl) + '</div>'
      + '<div class="kpi-sub">USDC</div>'
      + '</div>';
  }

  if (port.monthPnl != null) {
    html += '<div class="kpi" style="animation-delay:.12s">'
      + '<div class="kpi-lbl">30-Day PnL</div>'
      + '<div class="kpi-val ' + (port.monthPnl >= 0 ? 'green' : 'red') + '">' + (port.monthPnl >= 0 ? '+' : '') + fmt(port.monthPnl) + '</div>'
      + '<div class="kpi-sub">USDC</div>'
      + '</div>';
  }

  html += '<div class="kpi" style="animation-delay:.14s">'
    + '<div class="kpi-lbl">Win Rate</div>'
    + '<div class="kpi-val ' + (parseFloat(wr) >= 50 ? 'green' : 'red') + '">' + wr + '%</div>'
    + '<div class="bar-w"><div class="bar-f" style="width:' + wr + '%"></div></div>'
    + '<div class="kpi-sub">' + wins + 'W / ' + losses + 'L</div>'
    + '</div>';

  html += '<div class="kpi" style="animation-delay:.16s">'
    + '<div class="kpi-lbl">Total Trades</div>'
    + '<div class="kpi-val yellow">' + fills.length.toLocaleString() + '</div>'
    + '<div class="kpi-sub">' + closing.length.toLocaleString() + ' closing</div>'
    + '</div>';

  html += '<div class="kpi" style="animation-delay:.18s">'
    + '<div class="kpi-lbl">Risk / Reward</div>'
    + '<div class="kpi-val ' + (rr !== '—' && parseFloat(rr) >= 1 ? 'green' : 'orange') + '">' + rr + '</div>'
    + '<div class="kpi-sub">avg win / avg loss</div>'
    + '</div>';

  html += '<div class="kpi" style="animation-delay:.20s">'
    + '<div class="kpi-lbl">Avg Win</div>'
    + '<div class="kpi-val green">+' + fmt(avgWin) + '</div>'
    + '<div class="kpi-sub">per closing trade</div>'
    + '</div>';

  html += '<div class="kpi" style="animation-delay:.22s">'
    + '<div class="kpi-lbl">Avg Loss</div>'
    + '<div class="kpi-val red">' + fmt(avgLoss) + '</div>'
    + '<div class="kpi-sub">per closing trade</div>'
    + '</div>';

  html += '<div class="kpi" style="animation-delay:.24s">'
    + '<div class="kpi-lbl">Maker Rate</div>'
    + '<div class="kpi-val purple">' + mkPct + '%</div>'
    + '<div class="kpi-sub">' + makers.toLocaleString() + ' trades</div>'
    + '</div>';

  html += '<div class="kpi" style="animation-delay:.26s">'
    + '<div class="kpi-lbl">Total Fees</div>'
    + '<div class="kpi-val orange">' + fmt(Math.abs(feeAll)) + '</div>'
    + '<div class="kpi-sub">' + (feeAll < 0 ? 'net rebates' : 'USDC paid') + '</div>'
    + '</div>';

  html += '<div class="kpi" style="animation-delay:.28s">'
    + '<div class="kpi-lbl">Funding PnL</div>'
    + '<div class="kpi-val ' + (fundingPnl >= 0 ? 'cyan' : 'red') + '">' + (fundingPnl >= 0 ? '+' : '') + fmt(fundingPnl) + '</div>'
    + '<div class="kpi-sub">' + funding.length + ' events</div>'
    + '</div>';

  html += '<div class="kpi" style="animation-delay:.30s">'
    + '<div class="kpi-lbl">Best Day</div>'
    + '<div class="kpi-val green">+' + fmt(bestDay) + '</div>'
    + '<div class="kpi-sub">USDC</div>'
    + '</div>';

  html += '<div class="kpi" style="animation-delay:.32s">'
    + '<div class="kpi-lbl">Worst Day</div>'
    + '<div class="kpi-val red">' + fmt(worstDay) + '</div>'
    + '<div class="kpi-sub">USDC</div>'
    + '</div>';

  html += '<div class="kpi" style="animation-delay:.34s">'
    + '<div class="kpi-lbl">Biggest Win</div>'
    + '<div class="kpi-val green">+' + fmt(bigWin) + '</div>'
    + '<div class="kpi-sub">single trade</div>'
    + '</div>';

  html += '<div class="kpi" style="animation-delay:.36s">'
    + '<div class="kpi-lbl">Biggest Loss</div>'
    + '<div class="kpi-val red">' + fmt(bigLoss) + '</div>'
    + '<div class="kpi-sub">single trade</div>'
    + '</div>';

  html += '<div class="kpi" style="animation-delay:.38s">'
    + '<div class="kpi-lbl">Total Volume</div>'
    + '<div class="kpi-val blue">' + fmtLarge(totalVol) + '</div>'
    + '<div class="kpi-sub">USDC notional</div>'
    + '</div>';

  grid.innerHTML = html;
}

/* ══════════════════════════════════════════════
   RENDER — POSITIONS (full details)
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

  /* per-coin fill stats */
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
    const maxLev   = (pos.leverage && pos.leverage.maxTradeLeverage) ? pos.leverage.maxTradeLeverage : null;

    const pnlPct = entry > 0 && mark > 0
      ? (mark - entry) / entry * 100 * (size > 0 ? 1 : -1) : null;

    let liqDist = null;
    if (liq && mark > 0) liqDist = Math.abs((liq - mark) / mark * 100);

    /* ROE relative to margin */
    const marginUsed = leverage && notional > 0 ? notional / parseFloat(leverage) : 0;
    const roe = marginUsed > 0 ? (unreal / marginUsed * 100) : null;

    const cs = coinStats[pos.coin] || {};
    const makerPct = cs.count > 0 ? Math.round((1 - cs.takers / cs.count) * 100) : null;
    const lastOt   = cs.lastFill ? orderType(cs.lastFill) : null;

    /* cumulative realized for this coin */
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
   PnL CALENDAR — enhanced
   Daily: net PnL (closes + funding - fees), volume, trade count
══════════════════════════════════════════════ */
function buildCalendar(fills, funding) {
  calPnlData = {};

  function day(key) {
    if (!calPnlData[key]) calPnlData[key] = { pnl: 0, volume: 0, trades: 0, funding: 0 };
    return calPnlData[key];
  }

  fills.forEach(function(f){
    const pnl = parseFloat(f.closedPnl || 0);
    const fee = parseFloat(f.fee || 0);
    const vol = parseFloat(f.sz||0) * parseFloat(f.px||0);
    const key = keyFromTime(f.time);
    const d   = day(key);
    d.pnl    += pnl - fee;
    d.volume += vol;
    d.trades++;
  });

  funding.forEach(function(f){
    const usdc = parseFloat((f.delta && f.delta.usdc) || 0);
    if (!usdc) return;
    const key = keyFromTime(f.time);
    const d   = day(key);
    d.pnl     += usdc;
    d.funding += usdc;
  });

  const now = new Date();
  calYear   = now.getFullYear();
  calMonth  = now.getMonth();
  renderCalendar();
  show('calCard');
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

  let monthPnl = 0, monthVol = 0, monthTrades = 0;
  let maxAbs   = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const key  = calYear + '-' + pad2(calMonth + 1) + '-' + pad2(d);
    const data = calPnlData[key];
    if (data) {
      monthPnl    += data.pnl;
      monthVol    += data.volume;
      monthTrades += data.trades;
      if (Math.abs(data.pnl) > maxAbs) maxAbs = Math.abs(data.pnl);
    }
  }

  const sumEl = ge('calSummary');
  sumEl.innerHTML = '<span style="color:' + (monthPnl >= 0 ? 'var(--green)' : 'var(--red)') + '; font-size:14px; font-weight:700">'
    + (monthPnl >= 0 ? '+' : '') + fmt(monthPnl, 2) + ' $'
    + '</span>'
    + '<span class="cal-sum-sub">' + monthTrades.toLocaleString() + ' trades &middot; ' + fmtLarge(monthVol) + ' vol</span>';

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
      const abs    = Math.abs(pnl);
      const sign   = pnl > 0 ? '+' : '';
      const pnlStr = abs >= 100000 ? sign + (pnl/1000).toFixed(0) + 'k'
                   : abs >= 10000  ? sign + (pnl/1000).toFixed(1) + 'k'
                   : abs >= 1000   ? sign + pnl.toFixed(0)
                   : sign + pnl.toFixed(1);

      inner = '<div class="cal-intensity" style="height:' + Math.round(intensity * 100) + '%;opacity:' + (0.15 + intensity * 0.3) + '"></div>'
            + '<div class="cal-dn">' + d + '</div>'
            + '<div class="cal-pnl">' + pnlStr + '</div>'
            + (data.trades > 0 ? '<div class="cal-trades">' + data.trades + 't</div>' : '');
    } else {
      cls  += 'no-data';
      inner = '<div class="cal-dn">' + d + '</div>';
    }

    if (isToday) cls += ' today';

    const tooltip = data
      ? key + '\nPnL: ' + (pnl >= 0 ? '+' : '') + fmt(pnl, 2) + ' $\nTrades: ' + data.trades + '\nVolume: ' + fmtLarge(data.volume) + '\nFunding: ' + fmt(data.funding, 2) + ' $'
      : key;

    html += '<div class="' + cls + '" title="' + tooltip + '" style="animation:fade-up .22s ' + (((firstDay + d - 1) % 7) * 0.025) + 's both">' + inner + '</div>';
  }
  ge('calDays').innerHTML = html;
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
function ge(id)            { return document.getElementById(id); }
function show(id, d)       { d = d || 'block'; const e = ge(id); if (e) e.style.display = d; }
function hide(id)          { const e = ge(id); if (e) e.style.display = 'none'; }
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
