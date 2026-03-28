/* ══════════════════════════════════════════════════════════════
   see.js — HLsee

   Phase 1 (parallel, fast):
     clearinghouseState      w:2   → perp positions + margins
     spotClearinghouseState  w:2   → spot token balances
     allMids                 w:2   → prices for spot USD conversion
     portfolio               w:20  → all-time/month/week/day PnL
     userNonFundingLedger    w:20  → deposits / withdrawals

   Phase 2 (background):
     userFills               w:20  → latest trades (display top 100)

   Spot balance fix:
     spot.balances[i].total = token quantity (NOT USD!)
     USD value = total * mids[coin]  (USDC token = face value)

   Mark price (no extra call):
     mark = entryPx + unrealizedPnl / szi  (signed size)

   Refresh: 60s countdown ring + manual button
══════════════════════════════════════════════════════════════ */

const API = 'https://api.hyperliquid.xyz/info';

const ALIASES = {
  'Yasser': '0x6cc7ea5913c3002d53938b8e93da8425ab0bbafa',
  'Younes': '0x751d8d19760907d5d68c5ea758d1984282a0b39d',
  'Allawi': '0x8fb06d076cb42b3480a19bab8f1d7d4170839e0f',
  'Kanba':  '0x0640F5Bfc50AC53eC68C435a60cB0ffF5C555FAD',
   'kzm':   '0xe8ed44072089b32bd8cc5efe217e49d13aaa8b3f',
};

const TX_PER = 30;
const CIRCUMFERENCE = 2 * Math.PI * 11; /* svg circle r=11 */

let currentAddr  = '';
let cdTimer      = null;
let cdRemaining  = 60;
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

/* ═══ ALIASES ═══ */
function buildAliasChips() {
  ge('aliasRow').innerHTML = Object.keys(ALIASES).map(function(n) {
    return '<span class="alias-chip" onclick="quickLoad(\'' + n + '\')">' + n + '</span>';
  }).join('');
}
function quickLoad(n) { ge('addrInput').value = n; analyze(); }

/* ═══ COPY ADDRESS ═══ */
function copyAddr() {
  if (!currentAddr) return;
  navigator.clipboard && navigator.clipboard.writeText(currentAddr).then(function() {
    const el = ge('acCopied');
    el.classList.add('show');
    setTimeout(function() { el.classList.remove('show'); }, 1600);
  });
}

/* ═══ COUNTDOWN RING ═══ */
function updateRing(sec) {
  const arc = ge('cdArc');
  const num = ge('cdNum');
  if (!arc || !num) return;
  const pct = sec / 60;
  arc.style.strokeDashoffset = CIRCUMFERENCE * (1 - pct);
  num.textContent = sec;
}

function startCountdown() {
  clearInterval(cdTimer);
  cdRemaining = 60;
  updateRing(60);
  show('updTime');
  cdTimer = setInterval(function() {
    cdRemaining--;
    updateRing(cdRemaining);
    if (cdRemaining <= 0) {
      cdRemaining = 60;
      analyze(true);
    }
  }, 1000);
}

/* ═══ MAIN ANALYZE ═══ */
async function analyze(isRefresh) {
  isRefresh = isRefresh || false;
  const raw  = isRefresh ? currentAddr : ge('addrInput').value.trim();
  const addr = ALIASES[raw] || raw;
  if (!addr || addr.length < 10) { showErr('Enter a valid wallet address or alias'); return; }
  currentAddr = addr;

  const refBtn = ge('refBtn');
  if (refBtn) refBtn.classList.add('spinning');

  if (!isRefresh) {
    ge('main').style.display = 'none';
    showErr('');
  }

  showLoad('Fetching portfolio…', 20);

  try {
    /* Phase 1: 5 parallel calls */
    const [perp, spot, mids, portfolio, txData] = await Promise.all([
      post({ type: 'clearinghouseState',          user: addr }),
      post({ type: 'spotClearinghouseState',      user: addr }),
      post({ type: 'allMids' }),
      post({ type: 'portfolio',                   user: addr }),
      post({ type: 'userNonFundingLedgerUpdates', user: addr, startTime: 0 }),
    ]);

    showLoad('Rendering…', 80);

    /* ── Wallet address display ── */
    ge('acAddr').innerHTML =
      '<span class="addr-chip-short">' + addr.slice(0,6) + '…' + addr.slice(-4) + '</span>'
      + '<span class="addr-chip-full">' + addr + '</span>';

    renderBalance(perp, spot, mids);
    renderPnlBar(portfolio, null);
    renderPositions(perp, mids);
    renderTx(txData, addr);

    show('pnlRow');
    show('txCard');
    show('posCard');
    ge('main').style.display = 'flex';

    ge('updTimeVal').textContent = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    show('updTime');

    hideLoad();
    showErr('');

    if (!isRefresh) startCountdown();
    else {
      cdRemaining = 60; updateRing(60);
      ge('totalBal').classList.add('flash');
      setTimeout(function() { ge('totalBal').classList.remove('flash'); }, 400);
    }

    /* Phase 2: fills */
    loadFills(addr, portfolio);

  } catch(e) {
    showErr('Error: ' + e.message);
    hideLoad();
    console.error(e);
  } finally {
    if (refBtn) refBtn.classList.remove('spinning');
  }
}

async function loadFills(addr, portfolio) {
  show('fillsCard');
  ge('fillsDot').style.display = 'inline-block';

  try {
    const fills = await post({ type: 'userFills', user: addr });
    const sorted = Array.isArray(fills)
      ? fills.sort(function(a, b) { return b.time - a.time; })
      : [];

    renderFills(sorted);
    renderPnlBar(portfolio, sorted); /* update stats now fills known */
  } catch(e) {
    console.warn('fills:', e.message);
  } finally {
    ge('fillsDot').style.display = 'none';
  }
}

/* ═══ RENDER — BALANCE ═══
   SPOT FIX: multiply each token balance by its mid price.
   USDC token = 1:1. Other tokens (HYPE, ETH…) need price lookup.
   spot.balances[i] = { coin, token, total, hold, entryNtl }
   The 'coin' field for spot is like "HYPE:SPOT" on some endpoints,
   or just the token name. We try both.
═══ */
function renderBalance(perp, spot, mids) {
  const s     = perp.marginSummary || perp.crossMarginSummary || {};
  const perpV = parseFloat(s.accountValue || 0);
  const mU    = parseFloat(s.totalMarginUsed || 0);
  const mF    = parseFloat(perp.withdrawable != null ? perp.withdrawable : perpV - mU);

  /* unrealized PnL from positions */
  let upnl = 0;
  (perp.assetPositions || []).forEach(function(p) {
    upnl += parseFloat(p.position.unrealizedPnl || 0);
  });

  /* spot balance: convert each token to USDC using allMids */
  let spotV = 0;
  (spot.balances || []).forEach(function(b) {
    const qty = parseFloat(b.total || 0);
    if (!qty) return;
    const coinName = b.coin || b.token || '';
    /* strip :SPOT suffix if present */
    const baseName = coinName.replace(/:SPOT$/i, '');
    if (baseName === 'USDC' || baseName === 'USDC:SPOT') {
      spotV += qty; /* USDC is 1:1 */
    } else {
      /* try mid price for perp, then spot-specific key */
      const px = parseFloat(
        mids[baseName] ||
        mids[baseName + ':SPOT'] ||
        mids[coinName] ||
        0
      );
      spotV += qty * px;
    }
  });

  const openCount = (perp.assetPositions || []).filter(function(p) {
    return parseFloat(p.position.szi) !== 0;
  }).length;

  animNum('totalBal',   perpV + spotV, 2);
  animNum('perpBal',    perpV,         2);
  animNum('spotBal',    spotV,         2);
  animNum('marginUsed', mU,            2);
  animNum('marginFree', mF,            2);

  const uEl = ge('unrealPnl');
  uEl.textContent = fmtSgn(upnl, 4);
  uEl.className   = 'aos-v ' + col(upnl);

  ge('openCount').textContent = openCount;
}

/* ═══ RENDER — PnL BAR ═══ */
function renderPnlBar(portfolio, fills) {
  const port = parsePortfolio(portfolio);

  setPnlEl('pnlAllTime', port.allTimePnl);
  setPnlEl('pnlMonth',   port.monthPnl);
  setPnlEl('pnlWeek',    port.weekPnl);
  setPnlEl('pnlDay',     port.dayPnl);

  if (!fills) return;

  const closing = fills.filter(function(f) { return parseFloat(f.closedPnl || 0) !== 0; });
  const wins    = closing.filter(function(f) { return parseFloat(f.closedPnl) > 0; }).length;
  const wr      = closing.length ? wins / closing.length * 100 : null;
  const fees    = fills.reduce(function(a, f) { return a + parseFloat(f.fee || 0); }, 0);
  const vol     = fills.reduce(function(a, f) { return a + parseFloat(f.sz||0) * parseFloat(f.px||0); }, 0);

  const wrEl = ge('statWr');
  if (wr !== null) {
    wrEl.textContent = wr.toFixed(1) + '%';
    wrEl.className   = 'pr-v ' + (wr >= 50 ? 'green' : 'red');
  }
  ge('statFees').textContent   = fmtU(Math.abs(fees), 2);
  ge('statVol').textContent    = fmtLarge(vol);
  ge('statTrades').textContent = fills.length.toLocaleString();
}

function setPnlEl(id, val) {
  if (val == null) return;
  const el = ge(id);
  el.textContent = fmtSgn(val, 2) + ' $';
  el.className   = 'pr-v ' + col(val);
}

/* ═══ RENDER — POSITIONS ═══
   markPx = entryPx + unrealizedPnl / szi
   (szi is signed: positive = long, negative = short)
═══ */
function renderPositions(perp, mids) {
  const active = (perp.assetPositions || []).filter(function(p) {
    return parseFloat(p.position.szi) !== 0;
  });

  ge('posBadge').textContent = active.length;

  if (!active.length) {
    ge('posTbody').innerHTML = '<tr class="no-row"><td colspan="11">No open positions</td></tr>';
    return;
  }

  ge('posTbody').innerHTML = active.map(function(p, i) {
    const pos    = p.position;
    const szi    = parseFloat(pos.szi);
    const entry  = parseFloat(pos.entryPx || 0);
    const upnl   = parseFloat(pos.unrealizedPnl || 0);
    const liq    = pos.liquidationPx ? parseFloat(pos.liquidationPx) : null;
    const lev    = pos.leverage ? parseFloat(pos.leverage.value || 0) : null;
    const levTyp = pos.leverage ? (pos.leverage.type || '') : '';
    const isLong = szi > 0;
    const absSz  = Math.abs(szi);

    /* derive mark from unrealized pnl — exact, no extra API call */
    const mark = szi !== 0 ? entry + upnl / szi : entry;

    /* PnL % = price move * direction */
    const pnlPct = entry > 0 ? (mark - entry) / entry * 100 * (isLong ? 1 : -1) : null;

    /* ROE = unrealized / initial margin */
    const notional = absSz * mark;
    const margin   = lev && notional > 0 ? notional / lev : 0;
    const roe      = margin > 0 ? upnl / margin * 100 : null;

    /* liquidation distance */
    const liqDist  = liq && mark > 0 ? Math.abs((liq - mark) / mark * 100) : null;
    const liqClass = liqDist != null
      ? (liqDist < 5 ? 'red fw6' : liqDist < 15 ? 'orange' : 'dim-c')
      : 'dim-c';

    return '<tr class="ra" style="animation-delay:' + (i * .04) + 's">'
      + td('mono fw6', pos.coin)
      + td('', '<span class="tag ' + (isLong ? 't-long' : 't-short') + '">' + (isLong ? '↑ Long' : '↓ Short') + '</span>')
      + td('mono', fmtSz(absSz))
      + td('mono', fmtPx(entry))
      + td('mono ' + col(upnl), fmtPx(mark))
      + td('mono fw6 ' + col(upnl), fmtSgn(upnl, 4))
      + td('mono ' + col(upnl), pnlPct != null ? fmtSgn(pnlPct, 3) + '%' : '—')
      + td('mono ' + col(roe),  roe != null  ? fmtSgn(roe, 2)  + '%' : '—')
      + td('', lev ? '<span class="lev ' + (levTyp === 'cross' ? 'lev-crs' : 'lev-iso') + '">' + lev + 'x' + (levTyp === 'cross' ? ' ✕' : '') + '</span>' : '—')
      + '<td class="' + liqClass + '"><span class="mono">' + (liq ? fmtPx(liq) : '—') + '</span>'
        + (liqDist != null ? '<span class="liq-sub">' + liqDist.toFixed(2) + '% away</span>' : '') + '</td>'
      + td('mono sub-c', fmtLarge(notional))
      + '</tr>';
  }).join('');
}

/* ═══ RENDER — FILLS (top 100 only for speed) ═══ */
function renderFills(fills) {
  const top = fills.slice(0, 100);
  ge('fillsBadge').textContent = top.length + (fills.length > 100 ? '+' : '');

  if (!top.length) {
    ge('fillsTbody').innerHTML = '<tr class="no-row"><td colspan="9">No trades found</td></tr>';
    return;
  }

  ge('fillsTbody').innerHTML = top.map(function(f, i) {
    const pnl  = parseFloat(f.closedPnl || 0);
    const fee  = parseFloat(f.fee || 0);
    const sz   = parseFloat(f.sz || 0);
    const px   = parseFloat(f.px || 0);
    const ntl  = sz * px;
    const ot   = orderType(f);

    return '<tr class="ra" style="animation-delay:' + Math.min(i * .006, .2) + 's">'
      + td('mono dim-c', fmtTime(f.time), 11)
      + td('mono fw6', f.coin)
      + td('', '<span class="tag ' + (f.side === 'B' ? 't-long' : 't-short') + '">' + (f.side === 'B' ? '↑ Buy' : '↓ Sell') + '</span>')
      + td('', '<span class="tag ' + ot.cls + '">' + ot.label + '</span>')
      + td('mono', fmtPx(px))
      + td('mono', fmtSz(sz))
      + td('mono sub-c', fmtLarge(ntl))
      + td('mono fw6 ' + col(pnl), pnl !== 0 ? fmtSgn(pnl, 4) : '—')
      + td('mono orange', fmtU(Math.abs(fee), 4), 11)
      + '</tr>';
  }).join('');
}

/* ═══ RENDER — TRANSACTIONS ═══ */
const TX_LABELS = {
  deposit:              'Deposit',
  withdraw:             'Withdrawal',
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
function txCounterparty(tx, field, self) {
  const a = tx.delta[field];
  return a && a.toLowerCase() !== self.toLowerCase() ? a : null;
}

function renderTx(raw, addr) {
  txAll = (Array.isArray(raw) ? raw : [])
    .map(function(t) { return Object.assign({}, t, { _d: txClassify(t), _a: txAmt(t) }); })
    .sort(function(a, b) { return b.time - a.time; });

  const depTotal = txAll.filter(function(t) { return t.delta.type === 'deposit';  })
                        .reduce(function(s, t) { return s + t._a; }, 0);
  const witTotal = txAll.filter(function(t) { return t.delta.type === 'withdraw'; })
                        .reduce(function(s, t) { return s + t._a; }, 0);
  const net = depTotal - witTotal;

  ge('txBadge').textContent = txAll.length;
  ge('txSumrow').innerHTML =
    tsr('Total Deposited',  '+' + fmtU(depTotal, 2), 'green', 'USDC')
  + tsr('Total Withdrawn',  '-' + fmtU(witTotal, 2), 'red',   'USDC')
  + tsr('Net Flow',  fmtSgn(net, 2), col(net), 'USDC')
  + tsr('Transactions', txAll.length, 'yellow', 'total');

  txTab = 'all'; txPage = 0;
  document.querySelectorAll('.ttab').forEach(function(b) { b.classList.remove('active'); });
  const ttAll = ge('tt-all'); if (ttAll) ttAll.classList.add('active');
  txApply();
}

function tsr(label, val, cls, sub) {
  return '<div class="tsr"><div class="tsr-l">' + label + '</div>'
    + '<div class="tsr-v ' + cls + '">' + val + '</div>'
    + '<div class="tsr-s">' + sub + '</div></div>';
}

function txSwitch(tab) {
  txTab = tab; txPage = 0;
  document.querySelectorAll('.ttab').forEach(function(b) { b.classList.remove('active'); });
  const el = ge('tt-' + tab); if (el) el.classList.add('active');
  txApply();
}
function txApply() {
  txFiltered = txTab === 'all' ? txAll : txAll.filter(function(t) { return t._d === txTab; });
  txPage = 0; txRenderPage();
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
    const label = TX_LABELS[tx.delta.type] || tx.delta.type;
    const sign  = dir === 'in' ? '+' : dir === 'out' ? '-' : '';
    const amtC  = dir === 'in' ? 'green' : dir === 'out' ? 'red' : 'blue';
    const tagC  = dir === 'in' ? 't-in' : dir === 'out' ? 't-out' : 't-int';
    const from  = txCounterparty(tx, 'user', currentAddr)
               || txCounterparty(tx, 'from', currentAddr);
    const to    = txCounterparty(tx, 'destination', currentAddr)
               || txCounterparty(tx, 'to', currentAddr);

    return '<tr class="ra" style="animation-delay:' + (i * .012) + 's">'
      + td('', '<span class="tag ' + tagC + '">' + label + '</span>')
      + td('mono fw6 ' + amtC, sign + fmtU(amt, amt < 1 ? 4 : 2))
      + td('dim-c', tx.delta.token || 'USDC', 10)
      + td('', from ? addrBit(from) : you())
      + td('', to   ? addrBit(to)   : you())
      + td('mono dim-c', fmtTime(tx.time), 11)
      + '</tr>';
  }).join('');

  const total = txFiltered.length;
  const pages = Math.ceil(total / TX_PER);
  ge('txPageInfo').textContent = (start + 1) + '–' + Math.min(start + TX_PER, total) + ' of ' + total;
  ge('pgPrev').disabled = txPage === 0;
  ge('pgNext').disabled = txPage >= pages - 1;
  pager.style.display = pages > 1 ? 'flex' : 'none';
}

function addrBit(a) {
  const s = a.slice(0,6) + '…' + a.slice(-4);
  return '<span class="mono sub-c" style="font-size:10px;cursor:pointer" title="' + a + '"'
    + ' onclick="navigator.clipboard&&navigator.clipboard.writeText(\'' + a + '\')">' + s + '</span>';
}
function you() {
  return '<span class="mono green" style="font-size:10px">You</span>';
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
  if (Math.abs(from - to) < .0001) { el.textContent = fmtU(to, d != null ? d : 2); return; }
  const t0 = Date.now(), dur = 650;
  (function tick() {
    const p = Math.min((Date.now() - t0) / dur, 1);
    const e = p < .5 ? 2*p*p : -1+(4-2*p)*p;
    el.textContent = fmtU(from + (to - from) * e, d != null ? d : 2);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = fmtU(to, d != null ? d : 2);
  })();
}

/* ═══ LOAD BAR ═══ */
function showLoad(txt, pct) {
  ge('loadTxt').textContent = txt || 'Loading…';
  ge('lbFill').style.width  = (pct || 30) + '%';
  show('loadBar');
}
function hideLoad() {
  ge('lbFill').style.width = '100%';
  setTimeout(function() { hide('loadBar'); ge('lbFill').style.width = '0'; }, 300);
}
function showErr(msg) {
  const el = ge('errBar');
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

/* ═══ HTML HELPERS ═══ */
function td(cls, content, fs) {
  const style = fs ? ' style="font-size:' + fs + 'px"' : '';
  return '<td class="' + cls + '"' + style + '>' + content + '</td>';
}

/* ═══ FORMAT ═══ */
function ge(id)  { return document.getElementById(id); }
function show(id, d) { const e = ge(id); if (e) e.style.display = d || 'block'; }
function hide(id)    { const e = ge(id); if (e) e.style.display = 'none'; }

function fmtU(n, d) {
  const v = parseFloat(n); if (isNaN(v)) return '—';
  d = d != null ? d : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtSgn(n, d) {
  const v = parseFloat(n); if (isNaN(v)) return '—';
  return (v > 0 ? '+' : '') + fmtU(v, d);
}
function fmtPx(v) {
  v = parseFloat(v); if (!v || isNaN(v)) return '—';
  if (v >= 100000) return fmtU(v, 0);
  if (v >= 10000)  return fmtU(v, 1);
  if (v >= 1000)   return fmtU(v, 2);
  if (v >= 100)    return fmtU(v, 3);
  if (v >= 1)      return fmtU(v, 4);
  return fmtU(v, 6);
}
function fmtSz(v) {
  v = parseFloat(v); if (isNaN(v)) return '—';
  if (v >= 1000)  return fmtU(v, 2);
  if (v >= 1)     return fmtU(v, 4);
  return fmtU(v, 6);
}
function fmtLarge(v) {
  if (!v || isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return fmtU(v/1e9, 3) + 'B';
  if (a >= 1e6) return fmtU(v/1e6, 2) + 'M';
  if (a >= 1e3) return fmtU(v/1e3, 1) + 'K';
  return fmtU(v, 2);
}
function fmtTime(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}
function col(v) {
  const n = parseFloat(v);
  return n > 0 ? 'green' : n < 0 ? 'red' : '';
}
function orderType(f) {
  if (f.crossed === true)  return { label: 'Market', cls: 't-taker' };
  if (f.crossed === false) return { label: 'Limit',  cls: 't-maker' };
  return parseFloat(f.fee || 0) <= 0
    ? { label: 'Limit',  cls: 't-maker' }
    : { label: 'Market', cls: 't-taker' };
}

/* ═══ INIT ═══ */
document.addEventListener('DOMContentLoaded', function() {
  buildAliasChips();
  ge('addrInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') analyze();
  });
  /* init ring at full */
  updateRing(60);
});
