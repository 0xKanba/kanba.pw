/* ══════════════════════════════════════════════════════════════
   see.js — HLsee Portfolio Analyzer

   Two-phase loading:
     Phase 1 (fast): portfolio + perp + spot + mids + txData
       → renders balance, KPIs, positions, calendar, transactions
     Phase 2 (background): fills + funding
       → enriches calendar trade counts, full KPI stats, fills table

   PnL Calendar:
     Source: portfolio.allTime.pnlHistory  [[ts_ms, cumPnl], ...]
     Algorithm: daily PnL = diff of consecutive cumulative values

   Aliases: 4 named wallets (Yasser, Younes, Allawi, Kanba)
══════════════════════════════════════════════════════════════ */

const API = 'https://api.hyperliquid.xyz/info';

const ALIASES = {
  'Yasser': '0x6cc7ea5913c3002d53938b8e93da8425ab0bbafa',
  'Younes': '0x751d8d19760907d5d68c5ea758d1984282a0b39d',
  'Allawi': '0x8fb06d076cb42b3480a19bab8f1d7d4170839e0f',
  'Kanba':  '0x0640F5Bfc50AC53eC68C435a60cB0ffF5C555FAD',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TX_PER = 25;

/* ── State ── */
let currentAddr = '';
let cdTimer     = null;
let calYear, calMonth;
let calPnlData  = {};
let allFills    = [];
let allFunding  = [];
let txAll = [], txFiltered = [], txTab = 'all', txPage = 0;

/* ══════════════════════════════════════════════
   API
══════════════════════════════════════════════ */
async function post(body) {
  const r = await fetch(API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* ══════════════════════════════════════════════
   CLOCK
══════════════════════════════════════════════ */
function startClock() {
  const tick = function() {
    const el = ge('tbTime');
    if (el) el.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  tick();
  setInterval(tick, 1000);
}

/* ══════════════════════════════════════════════
   ALIAS CHIPS
══════════════════════════════════════════════ */
function buildAliasChips() {
  ge('aliasRow').innerHTML = Object.keys(ALIASES).map(function(name) {
    return '<span class="alias-chip" onclick="quickLoad(\'' + name + '\')">' + name + '</span>';
  }).join('');
}
function quickLoad(name) {
  ge('addrInput').value = name;
  analyze();
}

/* ══════════════════════════════════════════════
   FETCH ALL FILLS — time-chunked backward
   Chunks: 30-day windows · up to 5 years back
   Stops after 3 consecutive empty chunks
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
    addBatch(await post({ type: 'userFills', user: addr }));
  } catch(e) { console.warn('userFills:', e.message); }

  let endTime     = fills.length
    ? Math.min.apply(null, fills.map(function(f){ return f.time; })) - 1
    : Date.now();
  let emptyStreak = 0;

  while (endTime > LIMIT && emptyStreak < 3) {
    const startTime = Math.max(endTime - CHUNK, LIMIT);
    const label     = new Date(startTime).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    setLoadText('Loading fills… ' + fills.length.toLocaleString() + ' (' + label + ')');
    try {
      const chunk = await post({
        type:            'userFillsByTime',
        user:            addr,
        startTime:       startTime,
        endTime:         endTime,
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

async function fetchAllFunding(addr) {
  try {
    const data = await post({ type: 'userFunding', user: addr, startTime: 0 });
    return Array.isArray(data) ? data : [];
  } catch(e) { return []; }
}

/* ══════════════════════════════════════════════
   MAIN ANALYZE — two-phase
══════════════════════════════════════════════ */
async function analyze(isRefresh) {
  isRefresh = isRefresh || false;
  const raw  = isRefresh ? currentAddr : ge('addrInput').value.trim();
  const addr = ALIASES[raw] || raw;
  if (!addr || addr.length < 10) { showErr('Enter a valid wallet address or alias'); return; }
  currentAddr = addr;

  if (!isRefresh) {
    ge('hlMain').style.display  = 'none';
    allFills = []; allFunding = [];
    showErr('');
  }

  show('loadingBar', 'flex');
  setLoadText('Fetching portfolio…');

  try {
    /* ── Phase 1 ── */
    const [perp, spot, mids, txData, portfolioData] = await Promise.all([
      post({ type: 'clearinghouseState',          user: addr }),
      post({ type: 'spotClearinghouseState',      user: addr }),
      post({ type: 'allMids' }),
      post({ type: 'userNonFundingLedgerUpdates', user: addr, startTime: 0 }),
      post({ type: 'portfolio',                   user: addr }),
    ]);

    /* wallet pill */
    const pill = ge('walletPill');
    pill.style.display = 'flex';
    ge('walletPillAddr').textContent = addr.slice(0,6) + '…' + addr.slice(-4);

    /* render phase 1 data */
    renderBalance(perp, spot);
    renderKPI([], [], portfolioData);
    renderPositions(perp, mids);
    buildCalendarFromPnlHistory(portfolioData);
    renderTx(txData, addr);

    /* show main content */
    ge('hlMain').style.display = 'flex';
    ge('updTime').textContent  = new Date().toLocaleTimeString();

    /* show sections */
    ['posCard','calCard','txSection'].forEach(function(id) {
      const el = ge(id); if (el) el.style.display = '';
    });

    showErr('');
    hide('loadingBar');
    if (!isRefresh) startCountdown();
    else { ge('acct-total') && ge('acct-total').classList.add('flash'); }

    /* ── Phase 2 ── */
    loadFillsBackground(addr, portfolioData);

  } catch(e) {
    showErr('Error: ' + e.message);
    console.error(e);
    hide('loadingBar');
  }
}

async function loadFillsBackground(addr, portfolioData) {
  const fl = ge('fillsLoading');
  if (fl) fl.style.display = 'flex';
  show('fillsCard');

  try {
    show('loadingBar', 'flex');
    allFills   = await fetchAllFills(addr);

    setLoadText('Fetching funding payments…');
    allFunding = await fetchAllFunding(addr);

    enrichCalendarWithFills(allFills, allFunding);
    renderKPI(allFills, allFunding, portfolioData);
    renderFills(allFills);

    const feeTot = allFills.reduce(function(a, f){ return a + parseFloat(f.fee || 0); }, 0);
    const feeEl  = ge('totalFees');
    if (feeEl) feeEl.textContent = fmt(Math.abs(feeTot), 2);

  } catch(e) {
    console.warn('Phase 2:', e.message);
  } finally {
    hide('loadingBar');
    if (fl) fl.style.display = 'none';
  }
}

function startCountdown() {
  clearInterval(cdTimer);
  let cd = 30;
  const timer = ge('refreshTimer');
  if (timer) timer.style.display = 'inline-flex';
  ge('countdown').textContent = cd;
  cdTimer = setInterval(function() {
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
  portfolioData.forEach(function(item) {
    const history = item[1] && item[1].pnlHistory;
    if (!Array.isArray(history) || !history.length) return;
    const last = parseFloat(history[history.length - 1][1]);
    if (item[0] === 'allTime') result.allTimePnl = last;
    if (item[0] === 'month')   result.monthPnl   = last;
    if (item[0] === 'week')    result.weekPnl     = last;
    if (item[0] === 'day')     result.dayPnl      = last;
  });
  return result;
}

/* ══════════════════════════════════════════════
   RENDER — BALANCE
══════════════════════════════════════════════ */
function renderBalance(perp, spot) {
  const s     = perp.marginSummary || perp.crossMarginSummary || {};
  const perpV = parseFloat(s.accountValue || 0);
  const mU    = parseFloat(s.totalMarginUsed || 0);
  const mF    = parseFloat(perp.withdrawable != null ? perp.withdrawable : (perpV - mU));

  let unrealPnl = 0;
  (perp.assetPositions || []).forEach(function(p) {
    unrealPnl += parseFloat(p.position.unrealizedPnl || 0);
  });

  let spotV = 0;
  (spot.balances || []).forEach(function(b) { spotV += parseFloat(b.total || 0); });

  animNum('totalBal',   perpV + spotV, 2);
  animNum('perpBal',    perpV,         2);
  animNum('spotBal',    spotV,         2);
  animNum('marginUsed', mU,            2);
  animNum('marginFree', mF,            2);

  const uEl = ge('unrealPnl');
  if (uEl) {
    uEl.textContent = (unrealPnl >= 0 ? '+' : '') + fmt(unrealPnl, 2);
    uEl.className   = 'as-val ' + (unrealPnl >= 0 ? 'green' : 'red');
  }
  ge('totalFees').textContent = '…';
}

/* ══════════════════════════════════════════════
   RENDER — KPI
   Phase 1: portfolio PnLs only
   Phase 2: full trading stats added
══════════════════════════════════════════════ */
function renderKPI(fills, funding, portfolioData) {
  const grid = ge('kpiGrid');
  const port = parsePortfolio(portfolioData);
  const hasFills = fills.length > 0;

  /* trading stats */
  const tradesPnl  = fills.reduce(function(a, f){ return a + parseFloat(f.closedPnl || 0); }, 0);
  const fundingPnl = funding.reduce(function(a, f){ return a + parseFloat((f.delta && f.delta.usdc) || 0); }, 0);
  const feeAll     = fills.reduce(function(a, f){ return a + parseFloat(f.fee || 0); }, 0);
  const netReal    = tradesPnl + fundingPnl - feeAll;

  const closing = fills.filter(function(f){ return parseFloat(f.closedPnl || 0) !== 0; });
  const wins    = closing.filter(function(f){ return parseFloat(f.closedPnl) > 0; }).length;
  const losses  = closing.filter(function(f){ return parseFloat(f.closedPnl) < 0; }).length;
  const wr      = closing.length ? (wins / closing.length * 100).toFixed(1) : null;

  const winPnls  = closing.filter(function(f){ return parseFloat(f.closedPnl) > 0; }).map(function(f){ return parseFloat(f.closedPnl); });
  const lossPnls = closing.filter(function(f){ return parseFloat(f.closedPnl) < 0; }).map(function(f){ return parseFloat(f.closedPnl); });
  const avgWin   = winPnls.length  ? winPnls.reduce(function(a,b){ return a+b; },0)  / winPnls.length  : 0;
  const avgLoss  = lossPnls.length ? lossPnls.reduce(function(a,b){ return a+b; },0) / lossPnls.length : 0;
  const rr       = avgLoss !== 0 ? Math.abs(avgWin / avgLoss).toFixed(2) : '—';

  const makers   = fills.filter(function(f){ return f.crossed === false || (f.crossed == null && parseFloat(f.fee || 0) <= 0); }).length;
  const mkPct    = fills.length ? Math.round(makers / fills.length * 100) : 0;

  const dayPnl   = {};
  fills.forEach(function(f) {
    const pnl = parseFloat(f.closedPnl || 0); if (!pnl) return;
    const key = keyFromTime(f.time);
    dayPnl[key] = (dayPnl[key] || 0) + pnl;
  });
  const dayVals  = Object.values(dayPnl);
  const bestDay  = dayVals.length ? Math.max.apply(null, dayVals) : 0;
  const worstDay = dayVals.length ? Math.min.apply(null, dayVals) : 0;
  const totalVol = fills.reduce(function(a, f){ return a + parseFloat(f.sz||0) * parseFloat(f.px||0); }, 0);
  const bigWin   = fills.length ? Math.max.apply(null, fills.map(function(f){ return parseFloat(f.closedPnl||0); })) : 0;
  const bigLoss  = fills.length ? Math.min.apply(null, fills.map(function(f){ return parseFloat(f.closedPnl||0); })) : 0;

  let html = '';
  let i = 0;

  const kpi = function(lbl, val, cls, sub, hl) {
    return '<div class="kpi' + (hl ? ' kpi-highlight' : '') + '" style="animation-delay:' + (i++ * .03) + 's">'
      + '<div class="kpi-lbl">' + lbl + '</div>'
      + '<div class="kpi-val ' + cls + '">' + val + '</div>'
      + '<div class="kpi-sub">' + sub + '</div>'
      + '</div>';
  };

  if (port.allTimePnl != null) html += kpi('All-Time PnL', sgn(port.allTimePnl) + fmt(port.allTimePnl), colClass(port.allTimePnl), 'portfolio · most accurate', true);
  if (port.dayPnl   != null)   html += kpi('24h PnL',      sgn(port.dayPnl)   + fmt(port.dayPnl),   colClass(port.dayPnl),   'USDC');
  if (port.weekPnl  != null)   html += kpi('7-Day PnL',    sgn(port.weekPnl)  + fmt(port.weekPnl),  colClass(port.weekPnl),  'USDC');
  if (port.monthPnl != null)   html += kpi('30-Day PnL',   sgn(port.monthPnl) + fmt(port.monthPnl), colClass(port.monthPnl), 'USDC');

  if (hasFills) {
    html += kpi('Net (after fees)', sgn(netReal) + fmt(netReal), colClass(netReal), 'realized − fees');

    if (wr !== null) {
      html += '<div class="kpi" style="animation-delay:' + (i++ * .03) + 's">'
        + '<div class="kpi-lbl">Win Rate</div>'
        + '<div class="kpi-val ' + (parseFloat(wr) >= 50 ? 'green' : 'red') + '">' + wr + '%</div>'
        + '<div class="bar-w"><div class="bar-f" style="width:' + wr + '%"></div></div>'
        + '<div class="kpi-sub">' + wins + 'W / ' + losses + 'L</div>'
        + '</div>';
    }

    html += kpi('Total Trades',   fills.length.toLocaleString(),      'yellow', closing.length.toLocaleString() + ' closing');
    html += kpi('Risk / Reward',  rr,                                  rr !== '—' && parseFloat(rr) >= 1 ? 'green' : 'orange', 'avg win / avg loss');
    html += kpi('Avg Win',       '+' + fmt(avgWin),                    'green',  'per closing trade');
    html += kpi('Avg Loss',       fmt(avgLoss),                        'red',    'per closing trade');
    html += kpi('Maker Rate',     mkPct + '%',                         'purple', makers.toLocaleString() + ' trades');
    html += kpi('Total Fees',     fmt(Math.abs(feeAll)),               'orange', feeAll < 0 ? 'net rebates' : 'USDC paid');
    html += kpi('Funding PnL',    sgn(fundingPnl) + fmt(fundingPnl),  fundingPnl >= 0 ? 'cyan' : 'red', funding.length + ' events');
    html += kpi('Best Day',      '+' + fmt(bestDay),                   'green',  'USDC');
    html += kpi('Worst Day',      fmt(worstDay),                       'red',    'USDC');
    html += kpi('Biggest Win',   '+' + fmt(bigWin),                    'green',  'single trade');
    html += kpi('Biggest Loss',   fmt(bigLoss),                        'red',    'single trade');
    html += kpi('Total Volume',   fmtLarge(totalVol),                  'blue',   'USDC notional');
  }

  grid.innerHTML = html;
}

/* ══════════════════════════════════════════════
   RENDER — POSITIONS
══════════════════════════════════════════════ */
function renderPositions(perp, mids) {
  const active = (perp.assetPositions || []).filter(function(p) {
    return parseFloat(p.position.szi) !== 0;
  });

  ge('posBadge').textContent = active.length + ' position' + (active.length !== 1 ? 's' : '');

  if (!active.length) {
    ge('posTbody').innerHTML = '<tr class="no-data-row"><td colspan="12">No open positions</td></tr>';
    return;
  }

  /* per-coin stats from fills (Phase 2 enrichment) */
  const coinStats = {};
  allFills.forEach(function(f) {
    if (!coinStats[f.coin]) coinStats[f.coin] = { fees: 0, count: 0, takers: 0, lastFill: null };
    const cs = coinStats[f.coin];
    cs.fees += parseFloat(f.fee || 0);
    cs.count++;
    if (f.crossed === true || (f.crossed == null && parseFloat(f.fee||0) > 0)) cs.takers++;
    if (!cs.lastFill) cs.lastFill = f;
  });

  ge('posTbody').innerHTML = active.map(function(p, idx) {
    const pos      = p.position;
    const size     = parseFloat(pos.szi);
    const entry    = parseFloat(pos.entryPx || 0);
    const unreal   = parseFloat(pos.unrealizedPnl || 0);
    const mark     = parseFloat(mids[pos.coin] || 0);
    const liq      = pos.liquidationPx ? parseFloat(pos.liquidationPx) : null;
    const notional = Math.abs(size) * mark;
    const leverage = (pos.leverage && pos.leverage.value) ? pos.leverage.value : null;
    const levType  = (pos.leverage && pos.leverage.type)  ? pos.leverage.type  : '';
    const pnlPct   = entry > 0 && mark > 0 ? (mark - entry) / entry * 100 * (size > 0 ? 1 : -1) : null;
    const liqDist  = liq && mark > 0 ? Math.abs((liq - mark) / mark * 100) : null;
    const marginU  = leverage && notional > 0 ? notional / parseFloat(leverage) : 0;
    const roe      = marginU > 0 ? (unreal / marginU * 100) : null;
    const cs       = coinStats[pos.coin] || {};
    const mkPct    = cs.count > 0 ? Math.round((1 - cs.takers / cs.count) * 100) : null;
    const lastOt   = cs.lastFill ? orderType(cs.lastFill) : null;
    const coinReal = (allFills.filter(function(f){ return f.coin === pos.coin; })
                              .reduce(function(a,f){ return a + parseFloat(f.closedPnl||0); }, 0));
    const liqCls   = liqDist != null && liqDist < 8 ? 'red' : liqDist != null && liqDist < 15 ? 'orange' : 'muted-txt';

    return '<tr class="row-anim" style="animation-delay:' + (idx * .04) + 's">'
      + '<td class="fw7 mono">' + pos.coin + '</td>'
      + '<td><span class="tag ' + (size > 0 ? 'tag-buy' : 'tag-sell') + '">' + (size > 0 ? '▲ LONG' : '▼ SHORT') + '</span></td>'
      + '<td class="mono">' + fmt(Math.abs(size), 4) + '</td>'
      + '<td class="mono">' + fmt(entry, 2) + '</td>'
      + '<td class="mono blue">' + (mark ? fmt(mark, 2) : '—') + '</td>'
      + '<td class="mono fw7 ' + colClass(unreal) + '">' + sgn(unreal) + fmt(unreal, 2) + '</td>'
      + '<td class="mono ' + colClass(unreal) + '">' + (pnlPct != null ? (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%' : '—') + '</td>'
      + '<td class="mono ' + (roe != null && roe >= 0 ? 'green' : 'red') + '">' + (roe != null ? (roe >= 0 ? '+' : '') + roe.toFixed(1) + '%' : '—') + '</td>'
      + '<td><span class="lev-badge ' + (levType === 'cross' ? 'lev-cross' : 'lev-iso') + '">' + (leverage ? leverage + 'x' : '—') + '</span></td>'
      + '<td class="mono ' + liqCls + '">' + (liq ? fmt(liq, 2) : '—') + (liqDist != null ? '<br><span class="liq-dist">' + liqDist.toFixed(1) + '% away</span>' : '') + '</td>'
      + '<td class="mono muted-txt">' + (notional >= 1000 ? fmtLarge(notional) : fmt(notional, 0)) + '</td>'
      + '<td>'
        + (lastOt ? '<span class="tag ' + lastOt.cls + '">' + lastOt.label + '</span>' : '—')
        + (mkPct  != null ? '<br><span class="maker-pct">' + mkPct + '% maker</span>' : '')
        + (coinReal !== 0  ? '<br><span class="maker-pct ' + (coinReal > 0 ? 'green' : 'red') + '">' + sgn(coinReal) + fmt(coinReal, 2) + '</span>' : '')
        + '</td>'
      + '</tr>';
  }).join('');
}

/* ══════════════════════════════════════════════
   PnL CALENDAR
   Source: portfolio.allTime.pnlHistory
   Algorithm: cumulative diff per day
══════════════════════════════════════════════ */
function buildCalendarFromPnlHistory(portfolioData) {
  calPnlData = {};
  if (!Array.isArray(portfolioData)) { renderCalendar(); show('calCard'); return; }

  const allTimeItem = portfolioData.find(function(item){ return item[0] === 'allTime'; });
  if (!allTimeItem || !allTimeItem[1] || !Array.isArray(allTimeItem[1].pnlHistory)) {
    renderCalendar(); show('calCard'); return;
  }

  const hist  = allTimeItem[1].pnlHistory;
  const dayLast = {};
  hist.forEach(function(pt) {
    dayLast[keyFromTime(pt[0])] = parseFloat(pt[1]);
  });

  const days = Object.keys(dayLast).sort();
  days.forEach(function(key, i) {
    calPnlData[key] = {
      pnl:    dayLast[key] - (i > 0 ? dayLast[days[i - 1]] : 0),
      volume: 0,
      trades: -1,
      funding: 0,
    };
  });

  const now = new Date();
  calYear   = now.getFullYear();
  calMonth  = now.getMonth();
  renderCalendar();
}

function enrichCalendarWithFills(fills, funding) {
  Object.keys(calPnlData).forEach(function(k) {
    calPnlData[k].trades  = 0;
    calPnlData[k].volume  = 0;
    calPnlData[k].funding = 0;
  });
  fills.forEach(function(f) {
    const key = keyFromTime(f.time);
    if (!calPnlData[key]) calPnlData[key] = { pnl: 0, volume: 0, trades: 0, funding: 0 };
    calPnlData[key].volume += parseFloat(f.sz||0) * parseFloat(f.px||0);
    calPnlData[key].trades++;
  });
  funding.forEach(function(f) {
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
  const dim      = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const today    = new Date();

  let monthPnl = 0, monthVol = 0, monthTrades = 0, maxAbs = 0;
  for (let d = 1; d <= dim; d++) {
    const key  = calYear + '-' + pad2(calMonth + 1) + '-' + pad2(d);
    const data = calPnlData[key];
    if (data) {
      monthPnl += data.pnl;
      monthVol += data.volume;
      if (data.trades > 0) monthTrades += data.trades;
      if (Math.abs(data.pnl) > maxAbs) maxAbs = Math.abs(data.pnl);
    }
  }

  const sumEl = ge('calSummary');
  sumEl.innerHTML =
    '<span style="font-family:var(--mono);font-size:13px;font-weight:600;color:' + (monthPnl >= 0 ? 'var(--green)' : 'var(--red)') + '">'
    + sgn(monthPnl) + fmt(monthPnl, 2) + ' $</span>'
    + '<span class="cal-sum-sub">'
    + (monthTrades > 0 ? ' · ' + monthTrades.toLocaleString() + ' trades' : '')
    + (monthVol > 0    ? ' · ' + fmtLarge(monthVol) + ' vol' : '')
    + '</span>';

  let html = '';
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

  for (let d = 1; d <= dim; d++) {
    const key     = calYear + '-' + pad2(calMonth + 1) + '-' + pad2(d);
    const data    = calPnlData[key];
    const pnl     = data ? data.pnl : null;
    const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();

    let cls = 'cal-day ';
    let inner = '';

    if (data && pnl !== 0) {
      cls += pnl > 0 ? 'pnl-pos' : 'pnl-neg';
      const intensity = maxAbs > 0 ? Math.min(Math.abs(pnl) / maxAbs, 1) : 0;
      const abs       = Math.abs(pnl);
      const pnlStr    = abs >= 100000 ? sgn(pnl) + (pnl/1000).toFixed(0) + 'k'
                      : abs >= 10000  ? sgn(pnl) + (pnl/1000).toFixed(1) + 'k'
                      : abs >= 1000   ? sgn(pnl) + pnl.toFixed(0)
                      : sgn(pnl) + pnl.toFixed(1);
      const trades    = data.trades === -1
        ? '<div class="cal-trades" style="opacity:.4">…</div>'
        : data.trades > 0 ? '<div class="cal-trades">' + data.trades + 't</div>' : '';

      inner = '<div class="cal-intensity" style="height:' + Math.round(intensity * 100) + '%;opacity:' + (0.12 + intensity * 0.28) + '"></div>'
            + '<div class="cal-dn">' + d + '</div>'
            + '<div class="cal-pnl">' + pnlStr + '</div>'
            + trades;
    } else {
      cls  += 'no-data';
      inner = '<div class="cal-dn">' + d + '</div>';
    }
    if (isToday) cls += ' today';

    const tt = data
      ? key + '\nPnL: ' + sgn(pnl) + fmt(pnl, 2) + ' $'
        + (data.trades > 0 ? '\nTrades: ' + data.trades + '\nVol: ' + fmtLarge(data.volume) : '')
        + (data.funding ? '\nFunding: ' + fmt(data.funding, 2) + ' $' : '')
      : key;

    html += '<div class="' + cls + '" title="' + tt + '" style="animation:fade-up .18s ' + ((firstDay + d - 1) % 7 * 0.025) + 's both">' + inner + '</div>';
  }
  ge('calDays').innerHTML = html;
}

/* ══════════════════════════════════════════════
   RENDER — FILLS TABLE (first 500)
══════════════════════════════════════════════ */
function renderFills(fills) {
  ge('fillsBadge').textContent = fills.length.toLocaleString();
  const tbody = ge('fillsTbody');
  if (!fills.length) {
    tbody.innerHTML = '<tr class="no-data-row"><td colspan="9">No trades found</td></tr>';
    return;
  }
  tbody.innerHTML = fills.slice(0, 500).map(function(f, i) {
    const pnl    = parseFloat(f.closedPnl || 0);
    const fee    = parseFloat(f.fee || 0);
    const sz     = parseFloat(f.sz || 0);
    const px     = parseFloat(f.px || 0);
    const notl   = sz * px;
    const feePct = notl > 0 ? (Math.abs(fee) / notl * 100).toFixed(4) : '—';
    const ot     = orderType(f);
    return '<tr class="row-anim" style="animation-delay:' + Math.min(i * .01, .3) + 's">'
      + '<td class="tx-time">' + fmtTime(f.time) + '</td>'
      + '<td class="fw7 mono">' + f.coin + '</td>'
      + '<td><span class="tag ' + (f.side === 'B' ? 'tag-buy' : 'tag-sell') + '">' + (f.side === 'B' ? '▲ Buy' : '▼ Sell') + '</span></td>'
      + '<td><span class="tag ' + ot.cls + '">' + ot.label + '</span></td>'
      + '<td class="mono">' + fmt(px, 2) + '</td>'
      + '<td class="mono">' + fmt(sz, 4) + '</td>'
      + '<td class="mono fw7 ' + colClass(pnl) + '">' + (pnl !== 0 ? sgn(pnl) + fmt(pnl, 2) : '—') + '</td>'
      + '<td class="mono orange">' + fmt(Math.abs(fee), 4) + '</td>'
      + '<td class="mono muted-txt">' + feePct + (feePct !== '—' ? '%' : '') + '</td>'
      + '</tr>';
  }).join('');
}

/* ══════════════════════════════════════════════
   RENDER — TRANSACTIONS
══════════════════════════════════════════════ */
const TX_LABELS = {
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
  if (t === 'deposit')      return 'in';
  if (t === 'withdraw')     return 'out';
  if (t === 'vaultDeposit') return 'out';
  return 'int';
}
function txAmt(tx) {
  const d = tx.delta;
  return Math.abs(parseFloat(d.amount || d.usdc || d.usd || 0));
}
function txFrom(tx, addr) {
  const d = tx.delta;
  if (d.type === 'deposit' || (d.type === 'spotTransfer' && d.user)) return d.user || '—';
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

  const bridgeIn  = txAll.filter(function(t){ return t.delta.type === 'deposit';  });
  const bridgeOut = txAll.filter(function(t){ return t.delta.type === 'withdraw'; });
  const bInTot    = bridgeIn.reduce(function(s, t){ return s + t._amt; }, 0);
  const bOutTot   = bridgeOut.reduce(function(s, t){ return s + t._amt; }, 0);
  const net       = bInTot - bOutTot;

  ge('txStatIn').textContent  = fmt(bInTot, 2);
  ge('txStatOut').textContent = fmt(bOutTot, 2);
  const netEl = ge('txStatNet');
  netEl.textContent = sgn(net) + fmt(Math.abs(net), 2);
  ge('txStatNetWrap').className = 'tsi ' + (net >= 0 ? 'green' : 'red');

  ['all','in','out','int'].forEach(function(t) {
    const el = ge('txcnt-' + t);
    if (el) el.textContent = t === 'all' ? txAll.length : txAll.filter(function(tx){ return tx._dir === t; }).length;
  });

  txTab = 'all'; txPage = 0;
  document.querySelectorAll('.tx-tab').forEach(function(b){ b.classList.remove('active'); });
  const allBtn = ge('txtab-all');
  if (allBtn) allBtn.classList.add('active');
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
function txPrev() { if (txPage > 0) { txPage--; txRenderPage(); } }
function txNext() { if (txPage < Math.ceil(txFiltered.length / TX_PER) - 1) { txPage++; txRenderPage(); } }

function txRenderPage() {
  const start  = txPage * TX_PER;
  const slice  = txFiltered.slice(start, start + TX_PER);
  const tbody  = ge('txTbody');
  const empty  = ge('txEmpty');
  const pager  = ge('txPager');

  if (!slice.length) {
    tbody.innerHTML = ''; empty.style.display = 'block'; pager.style.display = 'none'; return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = slice.map(function(tx, i) {
    const dir     = tx._dir;
    const amt     = tx._amt;
    const from    = txFrom(tx, currentAddr);
    const to      = txTo(tx, currentAddr);
    const isMe    = function(a){ return a && a.toLowerCase() === currentAddr.toLowerCase(); };
    const chipCls = dir === 'in' ? 'tc-in' : dir === 'out' ? 'tc-out' : 'tc-int';
    const dirLbl  = dir === 'in' ? '↓ In' : dir === 'out' ? '↑ Out' : '⇄';
    const amtCls  = dir === 'in' ? 'green' : dir === 'out' ? 'red' : 'blue';
    const sign    = dir === 'in' ? '+' : dir === 'out' ? '-' : '';

    return '<tr class="row-anim" style="animation-delay:' + (i * .02) + 's">'
      + '<td><span class="tx-chip ' + chipCls + '">' + dirLbl + '</span></td>'
      + '<td class="mono fw7 ' + amtCls + '">' + sign + fmt(amt, amt < 1 ? 4 : 2) + '</td>'
      + '<td class="muted-txt" style="font-size:10px">' + (tx.delta.token || 'USDC') + '</td>'
      + '<td>' + (isMe(from) ? '<span class="tx-you">You</span>' : '<span class="tx-addr" title="' + from + '" onclick="navigator.clipboard&&navigator.clipboard.writeText(\'' + from + '\')">' + shortAddr(from) + '</span>') + '</td>'
      + '<td>' + (isMe(to)   ? '<span class="tx-you">You</span>' : '<span class="tx-addr" title="' + to   + '" onclick="navigator.clipboard&&navigator.clipboard.writeText(\'' + to   + '\')">' + shortAddr(to)   + '</span>') + '</td>'
      + '<td class="tx-time">' + ageStr(tx.time) + '</td>'
      + '<td class="muted-txt" style="font-size:11px">' + (TX_LABELS[tx.delta.type] || tx.delta.type) + '</td>'
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

/* ══════════════════════════════════════════════
   ANIMATED NUMBER
══════════════════════════════════════════════ */
function animNum(id, val, decimals) {
  const el = ge(id);
  if (!el) return;
  const from = parseFloat(el.dataset.v || 0);
  const to   = parseFloat(val);
  if (isNaN(to)) { el.textContent = '—'; return; }
  el.dataset.v = to;
  if (Math.abs(from - to) < .01) { el.textContent = fmt(to, decimals != null ? decimals : 2); return; }
  const t0 = Date.now(), dur = 700;
  (function tick() {
    const p = Math.min((Date.now() - t0) / dur, 1);
    const e = p < .5 ? 2*p*p : -1 + (4 - 2*p)*p;
    el.textContent = fmt(from + (to - from) * e, decimals != null ? decimals : 2);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = fmt(to, decimals != null ? decimals : 2);
  })();
}

/* ══════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════ */
function ge(id)    { return document.getElementById(id); }
function show(id, d) { const e = ge(id); if (e) e.style.display = d || 'block'; }
function hide(id)    { const e = ge(id); if (e) e.style.display = 'none'; }
function sgn(v)    { return parseFloat(v) > 0 ? '+' : ''; }
function fmt(n, d) {
  const v = parseFloat(n);
  if (isNaN(v)) return '—';
  d = d != null ? d : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtLarge(v) {
  if (!v || isNaN(v)) return '—';
  if (v >= 1e9) return (v/1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v/1e3).toFixed(1) + 'K';
  return fmt(v, 2);
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
function shortAddr(a) { return a && a.length > 10 ? a.slice(0,6) + '…' + a.slice(-4) : (a || '—'); }
function pad2(n) { return String(n).padStart(2, '0'); }
function colClass(v) { return parseFloat(v) > 0 ? 'green' : parseFloat(v) < 0 ? 'red' : ''; }
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
document.addEventListener('DOMContentLoaded', function() {
  ge('addrInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') analyze();
  });
  buildAliasChips();
  startClock();
});
