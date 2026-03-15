/* ═══════════════════════════════════════════════════════
   HYPERLIQUID ANALYZER — see.js  (corrected data model)

   PnL truth:  Total PnL = accountValue + allWithdrawals − allDeposits
               (per official HL docs: portfolio endpoint pnlHistory)

   Realized PnL = Σ fill.closedPnl  +  Σ funding.delta.usdc
   Unrealized PnL = from open assetPositions

   Deposits / Withdrawals = only bridge-level ops (type=deposit / type=withdraw)
   Vault ops shown separately so stats are never inflated.
═══════════════════════════════════════════════════════ */

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
let cdTimer      = null;
let calYear, calMonth, calPnlData = {};
let allFills  = [];
let allFunding = [];
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
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* ══════════════════════════════════════════════
   CLOCK
══════════════════════════════════════════════ */
function startClock() {
  const tick = () => {
    const now = new Date();
    ge('clockDate').textContent = now.toLocaleDateString('en-GB',
      { day: 'numeric', month: 'long', year: 'numeric' });
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
  ge('fbAddr').textContent = addr ? addr.slice(0,6) + '…' + addr.slice(-4) : '—';
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
  const makeItem = (item, sfx = '') =>
    `<div class="tick-item" id="ti-${item.id}${sfx}">
       <span class="tick-sym">${item.sym}</span>
       <span class="tick-px"  id="tp-${item.id}${sfx}">—</span>
       <span class="tick-chg neu" id="tc-${item.id}${sfx}">…</span>
     </div>`;
  track.innerHTML = items.map(i => makeItem(i) + makeItem(i, '2')).join('');
}
function setTickerPair(id, px, chg) {
  ['', '2'].forEach(sfx => {
    const pe = ge(`tp-${id}${sfx}`);
    const ce = ge(`tc-${id}${sfx}`);
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
  grid.innerHTML = cards.map((c, i) =>
    `<div class="mkt-card" style="animation-delay:${i * 0.05}s">
       <div class="mkt-dot"></div>
       <span class="mkt-icon">${c.icon}</span>
       <div class="mkt-sym">${c.sym}</div>
       <div class="mkt-name">${c.name}</div>
       <div class="mkt-price" id="mp-${c.id}">—</div>
       <div class="mkt-chg neu" id="mc-${c.id}">—</div>
     </div>`
  ).join('');
}
function cryptoIcon(s) {
  return s === 'BTC' ? '₿' : s === 'ETH' ? 'Ξ' : s === 'SOL' ? '◎' : '●';
}
function setMktCard(id, px, chg) {
  const pe = ge(`mp-${id}`);
  const ce = ge(`mc-${id}`);
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
      if (!lb.levels?.[0]?.[0] || !lb.levels?.[1]?.[0]) return;
      const bid = parseFloat(lb.levels[0][0].px);
      const ask = parseFloat(lb.levels[1][0].px);
      setMktCard(XYZ_ASSETS[i].id, (bid + ask) / 2, null);
    });

    const [midsR, metaR] = await Promise.all([
      post({ type: 'allMids' }),
      post({ type: 'metaAndAssetCtxs' }),
    ]);
    const prevMap = {};
    metaR[0].universe.forEach((u, i) => {
      prevMap[u.name] = parseFloat(metaR[1][i]?.prevDayPx || 0);
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
      const px  = parseFloat(ge(`mp-${a.id}`)?.dataset?.raw || 0);
      setMktCard(a.id, px, chg);
    }));
  } catch (e) { console.warn('Market fetch:', e.message); }
}

/* ══════════════════════════════════════════════
   ALIAS CHIPS
══════════════════════════════════════════════ */
function buildAliasChips() {
  ge('aliasRow').innerHTML = Object.keys(ALIASES).map(name =>
    `<span class="alias-chip" onclick="quickLoad('${name}')">${name}</span>`
  ).join('');
}
function quickLoad(name) {
  ge('addrInput').value = name;
  analyze();
}

/* ══════════════════════════════════════════════
   FETCH ALL FILLS  (complete history)
══════════════════════════════════════════════ */
async function fetchAllFills(addr) {
  setLoadText('Loading trade history…');
  showPnlNote(true, 'Fetching all fills…');

  const seen = new Set();
  let fills  = [];

  const addFills = batch => {
    if (!Array.isArray(batch)) return;
    batch.forEach(f => {
      const key = f.oid != null
        ? `${f.oid}-${f.coin}-${f.side}`
        : `${f.time}-${f.coin}-${f.px}-${f.sz}`;
      if (!seen.has(key)) { seen.add(key); fills.push(f); }
    });
  };

  try {
    addFills(await post({ type: 'userFills', user: addr }));
  } catch(e) { console.warn('Primary fills:', e.message); }

  /* time-chunked fetch for very active wallets */
  if (fills.length > 0 && fills.length % 500 === 0) {
    const oldestTime = Math.min(...fills.map(f => f.time));
    showPnlNote(true, `Fetching history before ${fmtDate(oldestTime)}…`);
    const chunkMs  = 90 * 86400000;
    let   endTime  = oldestTime - 1;
    const hardStop = Date.now() - 3 * 365 * 86400000;
    for (let i = 0; i < 12 && endTime > hardStop; i++) {
      const startTime = Math.max(endTime - chunkMs, hardStop);
      try {
        const chunk = await post({ type: 'userFillsByTime', user: addr, startTime, endTime });
        if (!Array.isArray(chunk) || chunk.length === 0) break;
        addFills(chunk);
        endTime = startTime - 1;
        showPnlNote(true, `${fills.length} trades fetched…`);
      } catch { break; }
    }
  }

  fills.sort((a, b) => b.time - a.time);
  showPnlNote(false);
  return fills;
}

/* ══════════════════════════════════════════════
   FETCH ALL FUNDING  (needed for true realized PnL)
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

function showPnlNote(show, msg = '') {
  const el = ge('pnlFetchNote');
  const tx = ge('pnlFetchText');
  if (!el) return;
  el.style.display = show ? 'flex' : 'none';
  if (tx) tx.textContent = msg;
}

/* ══════════════════════════════════════════════
   MAIN ANALYZE
══════════════════════════════════════════════ */
async function analyze(isRefresh = false) {
  const raw  = isRefresh ? currentAddr : ge('addrInput').value.trim();
  const addr = ALIASES[raw] || raw;
  if (!addr || addr.length < 10) { showErr('Please enter a valid wallet address'); return; }
  currentAddr = addr;

  if (!isRefresh) {
    ['posCard','fillsCard','siteFooter','kpiGrid','calCard','txWrapper','feeNote'].forEach(
      id => { const el = ge(id); if (el) el.style.display = 'none'; }
    );
    ge('balHero').style.display = 'none';
    showErr('');
  }

  show('loadingBar', 'flex');
  setLoadText('Fetching portfolio data…');

  try {
    /* Parallel: all base data + fills + funding */
    const [perp, spot, mids, txData, portfolioData] = await Promise.all([
      post({ type: 'clearinghouseState',          user: addr }),
      post({ type: 'spotClearinghouseState',      user: addr }),
      post({ type: 'allMids' }),
      post({ type: 'userNonFundingLedgerUpdates', user: addr, startTime: 0 }),
      post({ type: 'portfolio',                   user: addr }),
    ]);

    allFills   = await fetchAllFills(addr);
    allFunding = await fetchAllFunding(addr);

    updateBadge(addr);
    const wt = ge('walletTag');
    wt.style.display = 'flex';
    ge('walletAddr').textContent = addr.slice(0,6) + '…' + addr.slice(-4);

    renderBalance(perp, spot, allFills, allFunding, portfolioData);
    renderKPI(allFills, allFunding, portfolioData);
    renderPositions(perp, mids);
    renderFills(allFills);
    buildCalendar(allFills, allFunding);
    renderTx(txData, addr);

    ['posCard','fillsCard','siteFooter','feeNote','txWrapper','calCard'].forEach(id => {
      const el = ge(id); if (el) el.style.display = '';
    });
    ge('kpiGrid').style.display = 'grid';
    ge('balHero').style.display = 'block';
    ge('updTime').textContent   = new Date().toLocaleTimeString();
    showErr('');

    if (!isRefresh) startCountdown();
    else {
      const tb = ge('totalBal');
      tb.classList.add('flash');
      setTimeout(() => tb.classList.remove('flash'), 350);
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
  cdTimer = setInterval(() => {
    cd--;
    ge('countdown').textContent = cd;
    if (cd <= 0) { cd = 30; analyze(true); }
  }, 1000);
}

/* ══════════════════════════════════════════════
   PARSE PORTFOLIO ENDPOINT → true PnL
   Formula (official docs):
     PnL = accountValue + totalWithdrawals − totalDeposits
   The pnlHistory array's LAST value is the current PnL.
══════════════════════════════════════════════ */
function parsePortfolio(portfolioData) {
  const result = { allTimePnl: null, monthPnl: null, weekPnl: null, dayPnl: null };
  if (!Array.isArray(portfolioData)) return result;

  portfolioData.forEach(([period, data]) => {
    const history = data?.pnlHistory;
    if (!Array.isArray(history) || history.length === 0) return;
    const lastVal = parseFloat(history[history.length - 1][1]);
    if (period === 'allTime')  result.allTimePnl = lastVal;
    if (period === 'month')    result.monthPnl   = lastVal;
    if (period === 'week')     result.weekPnl    = lastVal;
    if (period === 'day')      result.dayPnl     = lastVal;
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
  // withdrawable is the correct "free margin" — not a manual calculation
  const mF    = parseFloat(perp.withdrawable ?? (perpV - mU));

  /* unrealized PnL from positions */
  let unrealPnl = 0;
  (perp.assetPositions || []).forEach(p => {
    unrealPnl += parseFloat(p.position.unrealizedPnl || 0);
  });

  /* spot value (USDC only for simplicity) */
  let spotV = 0;
  (spot.balances || []).forEach(b => { spotV += parseFloat(b.total || 0); });

  /* total fees from all fills */
  const feeTot = fills.reduce((a, f) => a + parseFloat(f.fee || 0), 0);

  /* open positions count */
  const active = (perp.assetPositions || []).filter(
    p => parseFloat(p.position.szi) !== 0
  ).length;

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
  ge('totalFees').textContent = fmt(feeTot, 2) + ' $';
  ge('openCount').textContent  = active;
}

/* ══════════════════════════════════════════════
   RENDER — KPI  (corrected PnL breakdown)

   ┌─────────────────────────────────────────┐
   │ TRUE PnL  = portfolio allTime last val  │
   │   = accountValue + withdrawals − deposits│
   │                                         │
   │ Realized PnL (trades) = Σ closedPnl     │
   │ Funding PnL           = Σ delta.usdc    │
   │ Total Realized        = trades + fund.  │
   │ Unrealized            = open positions  │
   └─────────────────────────────────────────┘
══════════════════════════════════════════════ */
function renderKPI(fills, funding, portfolioData) {
  const grid = ge('kpiGrid');

  /* portfolio-based true PnL */
  const port       = parsePortfolio(portfolioData);
  const allTimePnl = port.allTimePnl;

  /* trades realized PnL */
  const tradesPnl = fills.reduce((a, f) => a + parseFloat(f.closedPnl || 0), 0);

  /* funding realized PnL */
  const fundingPnl = funding.reduce((a, f) => {
    return a + parseFloat(f.delta?.usdc || 0);
  }, 0);

  /* total realized = trades + funding */
  const totalRealized = tradesPnl + fundingPnl;

  /* fees */
  const feeAll = fills.reduce((a, f) => a + parseFloat(f.fee || 0), 0);

  /* net realized after fees */
  const netRealized = totalRealized - feeAll;

  /* win / loss stats */
  const total   = fills.length;
  const wins    = fills.filter(f => parseFloat(f.closedPnl || 0) > 0).length;
  const losses  = fills.filter(f => parseFloat(f.closedPnl || 0) < 0).length;
  const wr      = total > 0 ? (wins / total * 100).toFixed(1) : '0.0';

  /* maker rate */
  const makers = fills.filter(f =>
    f.crossed === false || (f.crossed == null && parseFloat(f.fee || 0) <= 0)
  ).length;
  const mkPct  = total > 0 ? Math.round(makers / total * 100) : 0;

  /* best / worst day */
  const dayPnl = {};
  fills.forEach(f => {
    const pnl = parseFloat(f.closedPnl || 0);
    if (!pnl) return;
    const d   = new Date(f.time);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    dayPnl[key] = (dayPnl[key] || 0) + pnl;
  });
  const dayVals  = Object.values(dayPnl);
  const bestDay  = dayVals.length ? Math.max(...dayVals) : 0;
  const worstDay = dayVals.length ? Math.min(...dayVals) : 0;

  /* volume */
  const totalVol = fills.reduce((a, f) => {
    return a + parseFloat(f.sz || 0) * parseFloat(f.px || 0);
  }, 0);

  grid.innerHTML = `
    ${allTimePnl != null ? `
    <div class="kpi" style="animation-delay:.03s">
      <div class="kpi-lbl">True Total PnL ✦</div>
      <div class="kpi-val ${allTimePnl >= 0 ? 'green' : 'red'}">${allTimePnl >= 0 ? '+' : ''}${fmt(allTimePnl)}</div>
      <div class="kpi-sub">portfolio endpoint · most accurate</div>
    </div>` : ''}
    <div class="kpi" style="animation-delay:.06s">
      <div class="kpi-lbl">Realized (Trades + Funding)</div>
      <div class="kpi-val ${totalRealized >= 0 ? 'green' : 'red'}">${totalRealized >= 0 ? '+' : ''}${fmt(totalRealized)}</div>
      <div class="kpi-sub">trades ${fmt(tradesPnl)} · funding ${fmt(fundingPnl)}</div>
    </div>
    <div class="kpi" style="animation-delay:.09s">
      <div class="kpi-lbl">Net Realized (after fees)</div>
      <div class="kpi-val ${netRealized >= 0 ? 'green' : 'red'}">${netRealized >= 0 ? '+' : ''}${fmt(netRealized)}</div>
      <div class="kpi-sub">USDC</div>
    </div>
    <div class="kpi" style="animation-delay:.12s">
      <div class="kpi-lbl">Win Rate</div>
      <div class="kpi-val ${parseFloat(wr) >= 50 ? 'green' : 'red'}">${wr}%</div>
      <div class="bar-w"><div class="bar-f" style="width:${wr}%"></div></div>
    </div>
    <div class="kpi" style="animation-delay:.15s">
      <div class="kpi-lbl">Total Trades</div>
      <div class="kpi-val yellow">${total.toLocaleString()}</div>
      <div class="kpi-sub">${wins}W / ${losses}L</div>
    </div>
    <div class="kpi" style="animation-delay:.18s">
      <div class="kpi-lbl">Maker Rate</div>
      <div class="kpi-val purple">${mkPct}%</div>
      <div class="kpi-sub">${makers.toLocaleString()} trades</div>
    </div>
    <div class="kpi" style="animation-delay:.21s">
      <div class="kpi-lbl">Total Fees Paid</div>
      <div class="kpi-val orange">${fmt(Math.abs(feeAll))}</div>
      <div class="kpi-sub">${feeAll < 0 ? 'net rebates' : 'USDC paid'}</div>
    </div>
    <div class="kpi" style="animation-delay:.24s">
      <div class="kpi-lbl">Funding Payments</div>
      <div class="kpi-val ${fundingPnl >= 0 ? 'cyan' : 'red'}">${fundingPnl >= 0 ? '+' : ''}${fmt(fundingPnl)}</div>
      <div class="kpi-sub">${funding.length} events</div>
    </div>
    <div class="kpi" style="animation-delay:.27s">
      <div class="kpi-lbl">Best Day</div>
      <div class="kpi-val green">+${fmt(bestDay)}</div>
      <div class="kpi-sub">USDC</div>
    </div>
    <div class="kpi" style="animation-delay:.30s">
      <div class="kpi-lbl">Worst Day</div>
      <div class="kpi-val red">${fmt(worstDay)}</div>
      <div class="kpi-sub">USDC</div>
    </div>
    <div class="kpi" style="animation-delay:.33s">
      <div class="kpi-lbl">Total Volume</div>
      <div class="kpi-val blue">${fmtLarge(totalVol)}</div>
      <div class="kpi-sub">USDC notional</div>
    </div>
    ${port.dayPnl != null ? `
    <div class="kpi" style="animation-delay:.36s">
      <div class="kpi-lbl">24h PnL</div>
      <div class="kpi-val ${port.dayPnl >= 0 ? 'green' : 'red'}">${port.dayPnl >= 0 ? '+' : ''}${fmt(port.dayPnl)}</div>
      <div class="kpi-sub">USDC</div>
    </div>` : ''}`;
}

/* ══════════════════════════════════════════════
   RENDER — POSITIONS
══════════════════════════════════════════════ */
function renderPositions(perp, mids) {
  const active = (perp.assetPositions || []).filter(
    p => parseFloat(p.position.szi) !== 0
  );
  ge('posBadge').textContent = `${active.length} position${active.length !== 1 ? 's' : ''}`;

  if (!active.length) {
    ge('posTbody').innerHTML =
      '<tr class="no-data-row"><td colspan="8">No open positions</td></tr>';
    return;
  }

  ge('posTbody').innerHTML = active.map((p, i) => {
    const pos    = p.position;
    const size   = parseFloat(pos.szi);
    const entry  = parseFloat(pos.entryPx || 0);
    const unreal = parseFloat(pos.unrealizedPnl || 0);
    const mark   = parseFloat(mids[pos.coin] || 0);
    const pnlPct = entry > 0 && mark > 0
      ? ((mark - entry) / entry * 100 * (size > 0 ? 1 : -1)).toFixed(2)
      : null;
    const liq    = pos.liquidationPx ? parseFloat(pos.liquidationPx) : null;
    const notional = Math.abs(size) * mark;
    return `<tr class="row-anim" style="animation-delay:${i * 0.03}s">
      <td style="font-weight:700">${pos.coin}</td>
      <td><span class="tag ${size > 0 ? 'tag-buy' : 'tag-sell'}">${size > 0 ? '▲ LONG' : '▼ SHORT'}</span></td>
      <td>${fmt(Math.abs(size), 4)}</td>
      <td>${fmt(entry, 2)}</td>
      <td class="blue">${mark ? fmt(mark, 2) : '—'}</td>
      <td class="${colClass(unreal)}">${unreal >= 0 ? '+' : ''}${fmt(unreal, 2)} $</td>
      <td class="${colClass(unreal)}">${pnlPct != null ? (parseFloat(pnlPct) >= 0 ? '+' : '') + pnlPct + '%' : '—'}</td>
      <td class="yellow">${pos.leverage?.value ?? '—'}x</td>
    </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   RENDER — FILLS HISTORY
══════════════════════════════════════════════ */
function renderFills(fills) {
  ge('fillsBadge').textContent =
    `${fills.length.toLocaleString()} trade${fills.length !== 1 ? 's' : ''}`;

  if (!fills.length) {
    ge('fillsTbody').innerHTML =
      '<tr class="no-data-row"><td colspan="9">No trade history</td></tr>';
    return;
  }

  ge('fillsTbody').innerHTML = fills.slice(0, 500).map((f, i) => {
    const pnl      = parseFloat(f.closedPnl || 0);
    const fee      = parseFloat(f.fee || 0);
    const sz       = parseFloat(f.sz || 0);
    const px       = parseFloat(f.px || 0);
    const notional = sz * px;
    const feePct   = notional > 0
      ? (Math.abs(fee) / notional * 100).toFixed(4)
      : '—';
    const ot = orderType(f);
    return `<tr class="row-anim" style="animation-delay:${Math.min(i, 30) * 0.015}s">
      <td class="muted-txt">${fmtTime(f.time)}</td>
      <td style="font-weight:700">${f.coin}</td>
      <td><span class="tag ${f.side === 'B' ? 'tag-buy' : 'tag-sell'}">${f.side === 'B' ? '▲ BUY' : '▼ SELL'}</span></td>
      <td><span class="tag ${ot.cls}">${ot.label}</span></td>
      <td>${fmt(px, 2)}</td>
      <td>${fmt(sz, 4)}</td>
      <td class="${colClass(pnl)}">${pnl !== 0 ? (pnl > 0 ? '+' : '') + fmt(pnl, 2) + ' $' : '—'}</td>
      <td class="${fee < 0 ? 'green' : ''}">${fee < 0 ? '↩ ' + fmt(Math.abs(fee), 4) : fmt(fee, 4)}</td>
      <td class="muted-txt">${feePct !== '—' ? feePct + '%' : '—'}</td>
    </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   PnL CALENDAR  (includes funding per day)
══════════════════════════════════════════════ */
function buildCalendar(fills, funding) {
  calPnlData = {};

  fills.forEach(f => {
    const pnl = parseFloat(f.closedPnl || 0);
    if (!pnl) return;
    const d   = new Date(f.time);
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    calPnlData[key] = (calPnlData[key] || 0) + pnl;
  });

  /* add funding per day */
  funding.forEach(f => {
    const usdc = parseFloat(f.delta?.usdc || 0);
    if (!usdc) return;
    const d   = new Date(f.time);
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    calPnlData[key] = (calPnlData[key] || 0) + usdc;
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
  ge('calMonthLbl').textContent = `${MONTHS[calMonth]} ${calYear}`;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const today       = new Date();

  let monthTotal = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${calYear}-${pad2(calMonth + 1)}-${pad2(d)}`;
    monthTotal += calPnlData[key] || 0;
  }

  const sumEl = ge('calSummary');
  sumEl.innerHTML = monthTotal !== 0
    ? `<span style="color:${monthTotal >= 0 ? 'var(--green)' : 'var(--red)'}">
         ${monthTotal >= 0 ? '+' : ''}${fmt(monthTotal, 2)} $
       </span>`
    : '';

  let html = '';
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const key     = `${calYear}-${pad2(calMonth + 1)}-${pad2(d)}`;
    const pnl     = calPnlData[key];
    const isToday = d === today.getDate() &&
                    calMonth === today.getMonth() &&
                    calYear  === today.getFullYear();
    let cls     = 'cal-day ';
    let pnlHtml = '';

    if (pnl !== undefined && pnl !== 0) {
      cls += pnl >= 0 ? 'pnl-pos' : 'pnl-neg';
      const sign = pnl >= 0 ? '+' : '';
      const abs  = Math.abs(pnl);
      const str  = abs >= 10000 ? sign + (pnl / 1000).toFixed(1) + 'k'
                 : abs >= 1000  ? sign + pnl.toFixed(0)
                 : sign + pnl.toFixed(1);
      pnlHtml = `<div class="cal-pnl">${str}</div>`;
    } else {
      cls += 'no-data';
    }
    if (isToday) cls += ' today';

    html += `<div class="${cls}" title="${key}: ${pnl != null ? (pnl >= 0 ? '+' : '') + fmt(pnl, 2) + ' $' : 'no data'}"
      style="animation:fade-up .22s ${((firstDay + d - 1) % 7) * 0.025}s both">
      <div class="cal-dn">${d}</div>${pnlHtml}
    </div>`;
  }
  ge('calDays').innerHTML = html;
}

/* ══════════════════════════════════════════════
   RENDER — TRANSACTIONS
   FIX: bridge ops (deposit/withdraw) are separated from
        vault ops so stats are never inflated.
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

/* 
  'in'  = money flowing INTO the user's trading account
  'out' = money flowing OUT OF the user's trading account
  'int' = internal moves (no net change to user's total balance)

  deposit   → external bridge → INTO account ✓ in
  withdraw  → external bridge → OUT of account ✓ out
  vaultDeposit  → user deposits from perp wallet INTO a vault → out
  vaultWithdraw → user withdraws from vault INTO perp wallet → in
  spotTransfer  → depends on sign of usdc
*/
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
    .map(tx => ({ ...tx, _dir: txClassify(tx), _amt: txAmt(tx) }))
    .sort((a, b) => b.time - a.time);

  /* FIX: separate bridge deposits/withdrawals from vault ops */
  const bridgeIn  = txAll.filter(t => t.delta.type === 'deposit');
  const bridgeOut = txAll.filter(t => t.delta.type === 'withdraw');
  const vaultIn   = txAll.filter(t => t.delta.type === 'vaultWithdraw');
  const vaultOut  = txAll.filter(t => t.delta.type === 'vaultDeposit');

  const bridgeInTotal  = bridgeIn.reduce((s, t)  => s + t._amt, 0);
  const bridgeOutTotal = bridgeOut.reduce((s, t) => s + t._amt, 0);
  const netBridge      = bridgeInTotal - bridgeOutTotal;

  /* update stats display */
  ge('txStatIn').textContent  = '+' + fmt(bridgeInTotal, 2);
  ge('txStatOut').textContent = '-' + fmt(bridgeOutTotal, 2);
  const netEl = ge('txStatNet');
  netEl.textContent = (netBridge >= 0 ? '+' : '') + fmt(netBridge, 2);
  netEl.className   = 'tsv ' + (netBridge >= 0 ? 'green' : 'red');
  ge('txStatCnt').textContent = txAll.length;

  /* update stat labels to clarify bridge-only */
  const inLbl = ge('txStatInLbl');
  const outLbl = ge('txStatOutLbl');
  if (inLbl)  inLbl.textContent  = 'Bridge Deposits';
  if (outLbl) outLbl.textContent = 'Bridge Withdrawals';

  ['all', 'in', 'out', 'int'].forEach(t => {
    const el = ge(`txcnt-${t}`);
    if (!el) return;
    el.textContent = t === 'all' ? txAll.length
      : txAll.filter(tx => tx._dir === t).length;
  });
  ge('txInfoLbl').textContent = `${txAll.length} transactions · ${bridgeIn.length} deposits · ${bridgeOut.length} withdrawals`;

  txTab = 'all'; txPage = 0;
  document.querySelectorAll('.tx-tab').forEach(b => b.classList.remove('active'));
  const allTab = ge('txtab-all');
  if (allTab) allTab.classList.add('active');
  txApply();
}

function txSwitch(tab) {
  txTab = tab; txPage = 0;
  document.querySelectorAll('.tx-tab').forEach(b => b.classList.remove('active'));
  const activeBtn = ge(`txtab-${tab}`);
  if (activeBtn) activeBtn.classList.add('active');
  txApply();
}
function txApply() {
  txFiltered = txTab === 'all' ? txAll : txAll.filter(t => t._dir === txTab);
  txRenderPage();
}
function txRenderPage() {
  const start  = txPage * TX_PER;
  const slice  = txFiltered.slice(start, start + TX_PER);
  const tbody  = ge('txTbody');
  const empty  = ge('txEmpty');
  const pager  = ge('txPager');

  if (!slice.length) {
    tbody.innerHTML    = '';
    empty.style.display = 'block';
    pager.style.display = 'none';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = slice.map((tx, i) => {
    const dir     = tx._dir;
    const amt     = tx._amt;
    const from    = txFrom(tx, currentAddr);
    const to      = txTo(tx, currentAddr);
    const isMe    = a => a && a.toLowerCase() === currentAddr.toLowerCase();
    const typeLbl = TX_TYPE_LABELS[tx.delta.type] || tx.delta.type;
    const token   = tx.delta.token || 'USDC';
    const chipCls = dir === 'in' ? 'tc-in' : dir === 'out' ? 'tc-out' : 'tc-int';
    const dirLbl  = dir === 'in' ? '↓ In' : dir === 'out' ? '↑ Out' : '⇄ Internal';
    const amtCls  = dir === 'in' ? 'green' : dir === 'out' ? 'red' : 'blue';
    const sign    = dir === 'in' ? '+' : dir === 'out' ? '-' : '';
    return `<tr class="row-anim" style="animation-delay:${i * 0.02}s">
      <td><span class="tx-chip ${chipCls}">${dirLbl}</span></td>
      <td class="${amtCls}" style="font-weight:700">${sign}${fmt(amt, amt < 1 ? 4 : 2)}</td>
      <td class="muted-txt" style="font-size:10px">${token}</td>
      <td>${isMe(from) ? '<span class="tx-you">You</span>' :
        `<span class="tx-addr" onclick="navigator.clipboard?.writeText('${from}')" title="${from}">${shortAddr(from)}</span>`}</td>
      <td>${isMe(to)   ? '<span class="tx-you">You</span>' :
        `<span class="tx-addr" onclick="navigator.clipboard?.writeText('${to}')" title="${to}">${shortAddr(to)}</span>`}</td>
      <td class="tx-time" title="${new Date(tx.time).toLocaleString()}">${ageStr(tx.time)}</td>
      <td class="muted-txt" style="font-size:11px">${typeLbl}</td>
    </tr>`;
  }).join('');

  const total = txFiltered.length;
  const pages = Math.ceil(total / TX_PER);
  if (pages > 1) {
    ge('txPagerInfo').textContent = `${start + 1}–${Math.min(start + TX_PER, total)} of ${total}`;
    ge('txBtnPrev').disabled = txPage === 0;
    ge('txBtnNext').disabled = txPage >= pages - 1;
    pager.style.display = 'flex';
  } else {
    pager.style.display = 'none';
  }
}
function txPrev() { if (txPage > 0) { txPage--; txRenderPage(); } }
function txNext() {
  if (txPage < Math.ceil(txFiltered.length / TX_PER) - 1) {
    txPage++; txRenderPage();
  }
}

/* ══════════════════════════════════════════════
   ANIMATED NUMBER
══════════════════════════════════════════════ */
function animNum(id, val, decimals = 2) {
  const el = ge(id);
  if (!el) return;
  const from = parseFloat(el.dataset.v || 0);
  const to   = parseFloat(val);
  if (isNaN(to)) { el.textContent = '—'; return; }
  el.dataset.v = to;
  if (Math.abs(from - to) < 0.01) { el.textContent = fmt(to, decimals); return; }
  const t0 = Date.now(), dur = 750;
  const tick = () => {
    const p = Math.min((Date.now() - t0) / dur, 1);
    const e = p < .5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
    el.textContent = fmt(from + (to - from) * e, decimals);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = fmt(to, decimals);
  };
  requestAnimationFrame(tick);
}

/* ══════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════ */
const ge   = id => document.getElementById(id);
const show = (id, d = 'block') => { const e = ge(id); if (e) e.style.display = d; };
const hide = id => { const e = ge(id); if (e) e.style.display = 'none'; };

function fmt(n, d = 2) {
  const v = parseFloat(n);
  if (isNaN(v)) return '—';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
function fmtLarge(v) {
  if (!v || isNaN(v)) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
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
  return new Date(ts).toLocaleString('en-GB', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
function ageStr(ts) {
  const d = Date.now() - ts;
  if (d < 60000)    return 'just now';
  if (d < 3600000)  return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  return fmtTime(ts);
}
function shortAddr(a) {
  return a && a.length > 10 ? a.slice(0, 6) + '…' + a.slice(-4) : (a || '—');
}
function pad2(n)  { return String(n).padStart(2, '0'); }
function colClass(v) { return v > 0 ? 'green' : v < 0 ? 'red' : ''; }
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
document.addEventListener('DOMContentLoaded', () => {
  ge('addrInput').addEventListener('keydown', e => {
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
