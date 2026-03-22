/* ══════════════════════════════════════════════════════════════
   see.js — HLsee Portfolio Analyzer

   API calls (weight cost):
     Phase 1 — parallel fetch:
       clearinghouseState      weight 2   → positions, margins
       spotClearinghouseState  weight 2   → spot balance
       portfolio               weight 20  → allTime/month/week/day PnL
       userNonFundingLedger    weight 20  → deposits / withdrawals
     Phase 2 — background:
       userFills               weight 20  → recent trades + stats

   mark price derived from unrealizedPnl (no allMids call needed):
     markPx = entryPx + unrealizedPnl / szi
══════════════════════════════════════════════════════════════ */

const API = 'https://api.hyperliquid.xyz/info';

const ALIASES = {
  'Yasser': '0x6cc7ea5913c3002d53938b8e93da8425ab0bbafa',
  'Younes': '0x751d8d19760907d5d68c5ea758d1984282a0b39d',
  'Allawi': '0x8fb06d076cb42b3480a19bab8f1d7d4170839e0f',
  'Kanba':  '0x0640F5Bfc50AC53eC68C435a60cB0ffF5C555FAD',
};

const TX_PER = 30;

let currentAddr = '';
let cdTimer     = null;
let txAll = [], txFiltered = [], txTab = 'all', txPage = 0;

/* ═══ API ═══ */
async function post(body) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* ═══ ALIAS CHIPS ═══ */
function buildAliasChips() {
  ge('aliasRow').innerHTML = Object.keys(ALIASES).map(function(n) {
    return '<span class="alias-chip" onclick="quickLoad(\'' + n + '\')">' + n + '</span>';
  }).join('');
}
function quickLoad(n) { ge('addrInput').value = n; analyze(); }

/* ═══ MAIN ANALYZE ═══ */
async function analyze(isRefresh) {
  isRefresh = isRefresh || false;
  const raw  = isRefresh ? currentAddr : ge('addrInput').value.trim();
  const addr = ALIASES[raw] || raw;
  if (!addr || addr.length < 10) { showErr('Enter a valid wallet address or alias'); return; }
  currentAddr = addr;

  if (!isRefresh) {
    ge('hlMain').style.display = 'none';
    showErr('');
  }

  showStatus('Fetching portfolio…');

  try {
    /* ── Phase 1: 4 parallel calls ── */
    const [perp, spot, portfolio, txData] = await Promise.all([
      post({ type: 'clearinghouseState',          user: addr }),
      post({ type: 'spotClearinghouseState',      user: addr }),
      post({ type: 'portfolio',                   user: addr }),
      post({ type: 'userNonFundingLedgerUpdates', user: addr, startTime: 0 }),
    ]);

    ge('acctAddr').textContent = addr;
    renderBalance(perp, spot);
    renderPnlBar(portfolio, null); /* stats without fills yet */
    renderPositions(perp);
    renderTx(txData, addr);

    show('pnlBar');
    show('posSection');
    show('txSection');
    show('hlMain', 'flex');
    ge('updTime').textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    hideStatus();
    showErr('');
    if (!isRefresh) startCountdown();
    else ge('totalBal').classList.add('flash');

    /* ── Phase 2: fills in background ── */
    loadFills(addr, portfolio);

  } catch(e) {
    showErr('Error: ' + e.message);
    hideStatus();
    console.error(e);
  }
}

async function loadFills(addr, portfolio) {
  show('fillsSection');
  ge('fillsLoading').style.display = 'inline';
  showStatus('Loading recent trades…');

  try {
    /* userFills returns the most recent ~2000 fills without chunking */
    const fills = await post({ type: 'userFills', user: addr });
    const sorted = Array.isArray(fills)
      ? fills.sort(function(a, b) { return b.time - a.time; })
      : [];

    renderFills(sorted);
    renderPnlBar(portfolio, sorted); /* update stats row with fills data */
  } catch(e) {
    console.warn('fills:', e.message);
  } finally {
    ge('fillsLoading').style.display = 'none';
    hideStatus();
  }
}

function startCountdown() {
  clearInterval(cdTimer);
  let cd = 30;
  show('refreshTimer');
  ge('countdown').textContent = cd;
  cdTimer = setInterval(function() {
    cd--;
    ge('countdown').textContent = cd;
    if (cd <= 0) { cd = 30; analyze(true); }
  }, 1000);
}

/* ═══ RENDER — BALANCE ═══ */
function renderBalance(perp, spot) {
  const s     = perp.marginSummary || perp.crossMarginSummary || {};
  const perpV = parseFloat(s.accountValue || 0);
  const mU    = parseFloat(s.totalMarginUsed || 0);
  const mF    = parseFloat(perp.withdrawable != null ? perp.withdrawable : perpV - mU);

  let upnl = 0;
  (perp.assetPositions || []).forEach(function(p) {
    upnl += parseFloat(p.position.unrealizedPnl || 0);
  });

  let spotV = 0;
  (spot.balances || []).forEach(function(b) { spotV += parseFloat(b.total || 0); });

  animNum('totalBal',   perpV + spotV, 4);
  animNum('perpBal',    perpV,         4);
  animNum('spotBal',    spotV,         4);
  animNum('marginUsed', mU,            4);
  animNum('marginFree', mF,            4);

  const uEl = ge('unrealPnl');
  uEl.textContent = fmtSgn(upnl, 4) + ' USDC';
  uEl.className   = 'am-v ' + col(upnl);
}

/* ═══ RENDER — PnL BAR ═══ */
function renderPnlBar(portfolio, fills) {
  /* portfolio PnL values */
  const port = parsePortfolio(portfolio);
  setPnl('pnlAllTime', port.allTimePnl);
  setPnl('pnlMonth',   port.monthPnl);
  setPnl('pnlWeek',    port.weekPnl);
  setPnl('pnlDay',     port.dayPnl);

  if (!fills) return; /* phase 1: no fills yet, leave stats as — */

  /* trading stats from fills */
  const closing = fills.filter(function(f) { return parseFloat(f.closedPnl || 0) !== 0; });
  const wins    = closing.filter(function(f) { return parseFloat(f.closedPnl) > 0; }).length;
  const wr      = closing.length ? (wins / closing.length * 100) : null;
  const feeSum  = fills.reduce(function(a, f) { return a + parseFloat(f.fee || 0); }, 0);
  const vol     = fills.reduce(function(a, f) { return a + parseFloat(f.sz||0) * parseFloat(f.px||0); }, 0);

  const wrEl = ge('statWinRate');
  if (wr !== null) {
    wrEl.textContent = wr.toFixed(1) + '%';
    wrEl.className   = 'pi-v ' + (wr >= 50 ? 'green' : 'red');
  }
  ge('statFees').textContent = fmtU(Math.abs(feeSum), 2);
  ge('statVol').textContent  = fmtLarge(vol);
}

function setPnl(id, val) {
  if (val == null) return;
  const el = ge(id);
  el.textContent = fmtSgn(val, 2) + ' USDC';
  el.className   = 'pi-v ' + col(val);
}

/* ═══ RENDER — POSITIONS ═══
   Mark price: markPx = entryPx + unrealizedPnl / szi
   (works for longs and shorts — szi is signed)
═══ */
function renderPositions(perp) {
  const active = (perp.assetPositions || []).filter(function(p) {
    return parseFloat(p.position.szi) !== 0;
  });

  ge('posCnt').textContent = active.length;

  if (!active.length) {
    ge('posTbody').innerHTML = '<tr class="no-row"><td colspan="11">No open positions</td></tr>';
    return;
  }

  ge('posTbody').innerHTML = active.map(function(p, i) {
    const pos      = p.position;
    const szi      = parseFloat(pos.szi);
    const entry    = parseFloat(pos.entryPx || 0);
    const upnl     = parseFloat(pos.unrealizedPnl || 0);
    const liq      = pos.liquidationPx ? parseFloat(pos.liquidationPx) : null;
    const lev      = pos.leverage ? parseFloat(pos.leverage.value || 0) : null;
    const levType  = pos.leverage ? (pos.leverage.type || '') : '';
    const isLong   = szi > 0;
    const absSize  = Math.abs(szi);

    /* derive mark from upnl (no extra API call needed) */
    const mark = szi !== 0 ? entry + upnl / szi : entry;

    /* PnL % = (mark - entry) / entry * 100 * direction */
    const pnlPct = entry > 0 ? (mark - entry) / entry * 100 * (isLong ? 1 : -1) : null;

    /* ROE = upnl / margin_used = upnl / (notional / leverage) */
    const notional = absSize * mark;
    const margin   = lev && notional > 0 ? notional / lev : 0;
    const roe      = margin > 0 ? upnl / margin * 100 : null;

    /* liquidation distance */
    const liqDist  = liq && mark > 0 ? Math.abs((liq - mark) / mark * 100) : null;
    const liqCls   = liqDist != null ? (liqDist < 5 ? 'red fw6' : liqDist < 12 ? 'orange' : 'dim') : 'dim';

    return '<tr class="ra" style="animation-delay:' + (i * .035) + 's">'
      + '<td class="mono fw6">' + pos.coin + '</td>'
      + '<td><span class="tag ' + (isLong ? 't-long' : 't-short') + '">' + (isLong ? '↑ Long' : '↓ Short') + '</span></td>'
      + '<td class="mono">' + fmtSz(absSize) + '</td>'
      + '<td class="mono">' + fmtPx(entry) + '</td>'
      + '<td class="mono ' + col(upnl) + '">' + fmtPx(mark) + '</td>'
      + '<td class="mono fw6 ' + col(upnl) + '">' + fmtSgn(upnl, 4) + '</td>'
      + '<td class="mono ' + col(upnl) + '">' + (pnlPct != null ? fmtSgn(pnlPct, 3) + '%' : '—') + '</td>'
      + '<td class="mono ' + col(roe) + '">'  + (roe != null ? fmtSgn(roe, 2) + '%' : '—') + '</td>'
      + '<td>' + (lev ? '<span class="' + (levType === 'cross' ? 't-lev-crs' : 't-lev-iso') + '">' + lev + 'x' + (levType === 'cross' ? ' ✕' : '') + '</span>' : '—') + '</td>'
      + '<td class="mono ' + liqCls + '">' + (liq ? fmtPx(liq) : '—') + (liqDist != null ? '<span class="liq-sub">' + liqDist.toFixed(2) + '% away</span>' : '') + '</td>'
      + '<td class="mono sub">' + fmtLarge(notional) + '</td>'
      + '</tr>';
  }).join('');
}

/* ═══ RENDER — FILLS (recent only, no chunking) ═══ */
function renderFills(fills) {
  ge('fillsCnt').textContent = fills.length.toLocaleString();
  const tbody = ge('fillsTbody');

  if (!fills.length) {
    tbody.innerHTML = '<tr class="no-row"><td colspan="9">No trades found</td></tr>';
    return;
  }

  tbody.innerHTML = fills.slice(0, 300).map(function(f, i) {
    const pnl  = parseFloat(f.closedPnl || 0);
    const fee  = parseFloat(f.fee || 0);
    const sz   = parseFloat(f.sz || 0);
    const px   = parseFloat(f.px || 0);
    const ntl  = sz * px;
    const ot   = orderType(f);

    return '<tr class="ra" style="animation-delay:' + Math.min(i * .008, .25) + 's">'
      + '<td class="mono sub" style="font-size:11px">' + fmtTime(f.time) + '</td>'
      + '<td class="mono fw6">' + f.coin + '</td>'
      + '<td><span class="tag ' + (f.side === 'B' ? 't-long' : 't-short') + '">' + (f.side === 'B' ? '↑ Buy' : '↓ Sell') + '</span></td>'
      + '<td><span class="tag ' + ot.cls + '">' + ot.label + '</span></td>'
      + '<td class="mono">' + fmtPx(px) + '</td>'
      + '<td class="mono">' + fmtSz(sz) + '</td>'
      + '<td class="mono sub">' + fmtLarge(ntl) + '</td>'
      + '<td class="mono fw6 ' + col(pnl) + '">' + (pnl !== 0 ? fmtSgn(pnl, 4) : '—') + '</td>'
      + '<td class="mono orange" style="font-size:11px">' + fmtU(Math.abs(fee), 4) + '</td>'
      + '</tr>';
  }).join('');
}

/* ═══ RENDER — TRANSACTIONS ═══ */
const TX_LABELS = {
  deposit:              'Deposit',
  withdraw:             'Withdraw',
  spotTransfer:         'Spot Transfer',
  internalTransfer:     'Internal',
  subAccountTransfer:   'Sub-Account',
  accountClassTransfer: 'Classification',
  vaultDeposit:         'Vault Deposit',
  vaultWithdraw:        'Vault Withdraw',
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
function txAddr(tx, field, self) {
  const a = tx.delta[field];
  return a && a.toLowerCase() !== self.toLowerCase() ? a : null;
}

function renderTx(raw, addr) {
  txAll = (Array.isArray(raw) ? raw : [])
    .map(function(t) { return Object.assign({}, t, { _d: txClassify(t), _a: txAmt(t) }); })
    .sort(function(a, b) { return b.time - a.time; });

  const depositsTotal    = txAll.filter(function(t) { return t.delta.type === 'deposit'; })
                                .reduce(function(s, t) { return s + t._a; }, 0);
  const withdrawalsTotal = txAll.filter(function(t) { return t.delta.type === 'withdraw'; })
                                .reduce(function(s, t) { return s + t._a; }, 0);
  const net = depositsTotal - withdrawalsTotal;

  ge('txCnt').textContent = txAll.length;
  ge('txSummary').innerHTML =
    '<div class="ts-item"><div class="ts-l">Total Deposited</div><div class="ts-v green">+' + fmtU(depositsTotal, 2) + '</div><div class="ts-s">USDC</div></div>'
  + '<div class="ts-item"><div class="ts-l">Total Withdrawn</div><div class="ts-v red">-' + fmtU(withdrawalsTotal, 2) + '</div><div class="ts-s">USDC</div></div>'
  + '<div class="ts-item"><div class="ts-l">Net Flow</div><div class="ts-v ' + col(net) + '">' + fmtSgn(net, 2) + '</div><div class="ts-s">USDC</div></div>'
  + '<div class="ts-item"><div class="ts-l">Transactions</div><div class="ts-v yellow">' + txAll.length + '</div><div class="ts-s">total</div></div>';

  txTab = 'all'; txPage = 0;
  setActiveTab('ttab-all');
  txApply();
}

function txSwitch(tab) {
  txTab = tab; txPage = 0;
  setActiveTab('ttab-' + tab);
  txApply();
}
function setActiveTab(id) {
  document.querySelectorAll('.ttab').forEach(function(b) { b.classList.remove('active'); });
  const el = ge(id); if (el) el.classList.add('active');
}
function txApply() {
  txFiltered = txTab === 'all' ? txAll : txAll.filter(function(t) { return t._d === txTab; });
  txPage = 0;
  txRenderPage();
}
function txPrev() { if (txPage > 0) { txPage--; txRenderPage(); } }
function txNext() { if (txPage < Math.ceil(txFiltered.length / TX_PER) - 1) { txPage++; txRenderPage(); } }

function txRenderPage() {
  const start = txPage * TX_PER;
  const slice = txFiltered.slice(start, start + TX_PER);
  const tbody = ge('txTbody');
  const empty = ge('txEmpty');
  const pager = ge('txPager');

  if (!slice.length) {
    tbody.innerHTML = ''; empty.style.display = 'block'; pager.style.display = 'none'; return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = slice.map(function(tx, i) {
    const dir   = tx._d;
    const amt   = tx._a;
    const typL  = TX_LABELS[tx.delta.type] || tx.delta.type;
    const amtC  = dir === 'in' ? 'green' : dir === 'out' ? 'red' : 'blue';
    const sign  = dir === 'in' ? '+' : dir === 'out' ? '-' : '';
    const from  = txAddr(tx, 'user',        currentAddr) || txAddr(tx, 'from',  currentAddr);
    const to    = txAddr(tx, 'destination', currentAddr) || txAddr(tx, 'to',    currentAddr);

    return '<tr class="ra" style="animation-delay:' + (i * .015) + 's">'
      + '<td><span class="tag ' + (dir === 'in' ? 't-long' : dir === 'out' ? 't-short' : 't-maker') + '">' + typL + '</span></td>'
      + '<td class="mono fw6 ' + amtC + '">' + sign + fmtU(amt, amt < 1 ? 4 : 2) + '</td>'
      + '<td class="sub" style="font-size:10px">' + (tx.delta.token || 'USDC') + '</td>'
      + '<td>' + (from ? addrSpan(from) : '<span class="sub" style="font-size:10px">You</span>') + '</td>'
      + '<td>' + (to   ? addrSpan(to)   : '<span class="sub" style="font-size:10px">You</span>') + '</td>'
      + '<td class="mono sub" style="font-size:11px">' + fmtTime(tx.time) + '</td>'
      + '</tr>';
  }).join('');

  const total = txFiltered.length;
  const pages = Math.ceil(total / TX_PER);
  ge('txPagerInfo').textContent = (start + 1) + '–' + Math.min(start + TX_PER, total) + ' / ' + total;
  ge('txBtnPrev').disabled = txPage === 0;
  ge('txBtnNext').disabled = txPage >= pages - 1;
  pager.style.display = pages > 1 ? 'flex' : 'none';
}

function addrSpan(a) {
  const short = a.slice(0,6) + '…' + a.slice(-4);
  return '<span class="mono sub" style="font-size:10px;cursor:pointer" title="' + a + '" onclick="navigator.clipboard&&navigator.clipboard.writeText(\'' + a + '\')">' + short + '</span>';
}

/* ═══ PORTFOLIO PARSE ═══ */
function parsePortfolio(data) {
  const r = { allTimePnl: null, monthPnl: null, weekPnl: null, dayPnl: null };
  if (!Array.isArray(data)) return r;
  data.forEach(function(item) {
    const hist = item[1] && item[1].pnlHistory;
    if (!Array.isArray(hist) || !hist.length) return;
    const last = parseFloat(hist[hist.length - 1][1]);
    if (item[0] === 'allTime') r.allTimePnl = last;
    if (item[0] === 'month')   r.monthPnl   = last;
    if (item[0] === 'week')    r.weekPnl     = last;
    if (item[0] === 'day')     r.dayPnl      = last;
  });
  return r;
}

/* ═══ ANIMATED NUMBER ═══ */
function animNum(id, to, d) {
  const el = ge(id); if (!el) return;
  const from = parseFloat(el.dataset.v || 0);
  to = parseFloat(to); if (isNaN(to)) { el.textContent = '—'; return; }
  el.dataset.v = to;
  if (Math.abs(from - to) < .0001) { el.textContent = fmtU(to, d); return; }
  const t0 = Date.now(), dur = 600;
  (function tick() {
    const p = Math.min((Date.now() - t0) / dur, 1);
    const e = p < .5 ? 2*p*p : -1+(4-2*p)*p;
    el.textContent = fmtU(from + (to - from) * e, d);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = fmtU(to, d);
  })();
}

/* ═══ STATUS ═══ */
function showStatus(txt) {
  ge('statusText').textContent = txt;
  show('statusStrip');
}
function hideStatus() { hide('statusStrip'); }
function showErr(msg) {
  const el = ge('errBox');
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

/* ═══ FORMAT UTILS ═══ */
function ge(id)  { return document.getElementById(id); }
function show(id, d) { const e = ge(id); if (e) e.style.display = d || 'block'; }
function hide(id)    { const e = ge(id); if (e) e.style.display = 'none'; }

/* fmtU: number with fixed decimals, commas */
function fmtU(n, d) {
  const v = parseFloat(n); if (isNaN(v)) return '—';
  d = d != null ? d : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/* fmtSgn: with + sign */
function fmtSgn(n, d) {
  const v = parseFloat(n); if (isNaN(v)) return '—';
  return (v > 0 ? '+' : '') + fmtU(v, d);
}

/* fmtPx: price with adaptive decimals */
function fmtPx(v) {
  v = parseFloat(v); if (!v || isNaN(v)) return '—';
  if (v >= 10000) return fmtU(v, 1);
  if (v >= 1000)  return fmtU(v, 2);
  if (v >= 100)   return fmtU(v, 3);
  if (v >= 1)     return fmtU(v, 4);
  return fmtU(v, 5);
}

/* fmtSz: size with adaptive decimals */
function fmtSz(v) {
  v = parseFloat(v); if (isNaN(v)) return '—';
  if (v >= 1000)  return fmtU(v, 2);
  if (v >= 1)     return fmtU(v, 4);
  return fmtU(v, 6);
}

/* fmtLarge: K/M/B */
function fmtLarge(v) {
  if (!v || isNaN(v)) return '—';
  if (v >= 1e9) return fmtU(v/1e9, 2) + 'B';
  if (v >= 1e6) return fmtU(v/1e6, 2) + 'M';
  if (v >= 1e3) return fmtU(v/1e3, 1) + 'K';
  return fmtU(v, 2);
}

/* fmtTime */
function fmtTime(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* col: CSS class from value sign */
function col(v) { return parseFloat(v) > 0 ? 'green' : parseFloat(v) < 0 ? 'red' : ''; }

/* orderType from fill */
function orderType(f) {
  if (f.crossed === true)  return { label: 'Market', cls: 't-taker' };
  if (f.crossed === false) return { label: 'Limit',  cls: 't-maker' };
  return parseFloat(f.fee || 0) <= 0
    ? { label: 'Limit',  cls: 't-maker' }
    : { label: 'Market', cls: 't-taker' };
}

/* ═══ INIT ═══ */
document.addEventListener('DOMContentLoaded', function() {
  ge('addrInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') analyze();
  });
  buildAliasChips();
});
