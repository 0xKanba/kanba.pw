/* ══════════════════════════════════════════════════════════════
   see.js — HLsee v4
   ──────────────────────────────────────────────────────────────
   API calls (Phase 1, parallel):
     clearinghouseState      → perp positions + margins
     spotClearinghouseState  → spot token balances
     allMids                 → prices for spot USD valuation
     portfolio               → period PnL (day/week/month/allTime)
     userNonFundingLedger    → all ledger events (deposits/withdrawals)

   API calls (Phase 2, background):
     userFills               → ALL fills; we derive last-100 closed trades

   HIP-3 / xyz DEX:
     Fills from xyz DEX have coin = "xyz:ASSET" (e.g. "xyz:GOLD")
     Positions appear in the same clearinghouseState response.
     No separate dex param needed for read-only info calls.

   Saved wallets:
     localStorage key: hlsee_wallets_v2
     Format: [{name, addr, ts}]  — up to 15 entries

   Trade definition:
     One trade = one closing fill (dir starts with "Close"|"Flip"
     or closedPnl != 0). Stats computed from ALL closing fills;
     the table shows last 100.

   Deposit / Withdrawal:
     deposit  → IN  (money arriving from outside Hyperliquid)
     withdraw → OUT (money leaving to external wallet)
     all else → INT (internal: spot-perp transfer, vault, etc.)
══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── Constants ─── */
const API            = 'https://api.hyperliquid.xyz/info';
const STORAGE_KEY    = 'hlsee_wallets_v2';
const TX_PER         = 30;
const CIRCUMFERENCE  = 2 * Math.PI * 11;

/* Built-in aliases */
const ALIASES = {
  'Yasser': '0x6cc7ea5913c3002d53938b8e93da8425ab0bbafa',
  'Younes': '0x751d8d19760907d5d68c5ea758d1984282a0b39d',
  'Allawi': '0x8fb06d076cb42b3480a19bab8f1d7d4170839e0f',
  'Kanba':  '0x0640F5Bfc50AC53eC68C435a60cB0ffF5C555FAD',
};

/* ─── State ─── */
let currentAddr    = '';
let cdTimer        = null;
let cdRemaining    = 60;
let txAll          = [];
let txFiltered     = [];
let txTab          = 'all';
let txPage         = 0;

/* ══════════════════════════════════════════════════════════════
   SAVED WALLETS  (localStorage)
══════════════════════════════════════════════════════════════ */

function getSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch (e) { return []; }
}

function putSaved(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 15))); }
  catch (e) {}
}

function isSaved(addr) {
  return getSaved().some(function(w) {
    return w.addr.toLowerCase() === addr.toLowerCase();
  });
}

function getSavedName(addr) {
  const w = getSaved().find(function(w) {
    return w.addr.toLowerCase() === addr.toLowerCase();
  });
  return w ? w.name : null;
}

function saveWallet(name, addr) {
  name = name.trim().slice(0, 20);
  if (!name || !addr) return;
  const list = getSaved().filter(function(w) {
    return w.addr.toLowerCase() !== addr.toLowerCase();
  });
  list.unshift({ name: name, addr: addr, ts: Date.now() });
  putSaved(list);
  buildChips();
}

function deleteWallet(addr) {
  const list = getSaved().filter(function(w) {
    return w.addr.toLowerCase() !== addr.toLowerCase();
  });
  putSaved(list);
  buildChips();
  /* hide save bar if this was the current addr */
  if (currentAddr.toLowerCase() === addr.toLowerCase()) {
    showSaveBar();
  }
  updateAliasLabel();
}

function doSave() {
  const name = (ge('saveName').value || '').trim();
  if (!name) { ge('saveName').focus(); return; }
  saveWallet(name, currentAddr);
  closeSaveBar();
  updateAliasLabel();
}

function showSaveBar() {
  if (!currentAddr || isSaved(currentAddr)) { closeSaveBar(); return; }
  ge('saveName').value = '';
  ge('saveBar').style.display = 'flex';
}

function closeSaveBar() {
  ge('saveBar').style.display = 'none';
}

function updateAliasLabel() {
  const el = ge('walletAlias');
  if (!el || !currentAddr) { if (el) el.textContent = ''; return; }
  /* check built-in aliases first */
  const builtin = Object.keys(ALIASES).find(function(n) {
    return ALIASES[n].toLowerCase() === currentAddr.toLowerCase();
  });
  const saved = getSavedName(currentAddr);
  const label = builtin || saved;
  el.textContent = label ? label : '';
}

/* ─── Chip row: built-in aliases + saved wallets ─── */
function buildChips() {
  const row    = ge('chipsRow');
  if (!row) return;
  const saved  = getSaved();
  const chips  = [];

  /* Built-in aliases */
  Object.keys(ALIASES).forEach(function(n) {
    chips.push(
      '<span class="alias-chip" onclick="quickLoad(\'' + n + '\')" title="' + ALIASES[n] + '">' + n + '</span>'
    );
  });

  /* Saved wallets (with × delete) */
  saved.forEach(function(w) {
    const short = w.addr.slice(0, 6) + '…' + w.addr.slice(-4);
    chips.push(
      '<span class="alias-chip sv-chip" onclick="quickLoadAddr(\'' + escAttr(w.addr) + '\')" title="' + escAttr(w.addr) + '">'
      + escHtml(w.name)
      + '<span class="sv-del" onclick="event.stopPropagation();deleteWallet(\'' + escAttr(w.addr) + '\')" title="Remove">×</span>'
      + '</span>'
    );
  });

  row.innerHTML = chips.join('');
}

function quickLoad(name) {
  ge('addrInput').value = name;
  analyze();
}

function quickLoadAddr(addr) {
  ge('addrInput').value = addr;
  analyze();
}

/* ══════════════════════════════════════════════════════════════
   API
══════════════════════════════════════════════════════════════ */

async function post(body) {
  const r = await fetch(API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* ══════════════════════════════════════════════════════════════
   COPY ADDRESS
══════════════════════════════════════════════════════════════ */

function copyAddr() {
  if (!currentAddr) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(currentAddr).then(function() {
      const el = ge('acCopied');
      el.classList.add('show');
      setTimeout(function() { el.classList.remove('show'); }, 1600);
    });
  }
}

/* ══════════════════════════════════════════════════════════════
   COUNTDOWN RING
══════════════════════════════════════════════════════════════ */

function updateRing(sec) {
  const arc = ge('cdArc');
  const num = ge('cdNum');
  if (!arc || !num) return;
  arc.style.strokeDashoffset = CIRCUMFERENCE * (1 - sec / 60);
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
    if (cdRemaining <= 0) { cdRemaining = 60; analyze(true); }
  }, 1000);
}

/* ══════════════════════════════════════════════════════════════
   MAIN ANALYZE
══════════════════════════════════════════════════════════════ */

async function analyze(isRefresh) {
  isRefresh = isRefresh || false;
  const raw  = isRefresh ? currentAddr : (ge('addrInput').value || '').trim();
  const addr = ALIASES[raw] || raw;

  if (!addr || addr.length < 10) {
    showErr('Enter a valid wallet address or alias'); return;
  }
  currentAddr = addr;

  const refBtn = ge('refBtn');
  if (refBtn) refBtn.classList.add('spinning');

  if (!isRefresh) {
    ge('main').style.display = 'none';
    showErr('');
    closeSaveBar();
  }

  showLoad('Fetching portfolio…', 20);

  try {
    /* Phase 1 — 5 parallel calls */
    const [perp, spot, mids, portfolio, txData] = await Promise.all([
      post({ type: 'clearinghouseState',          user: addr }),
      post({ type: 'spotClearinghouseState',      user: addr }),
      post({ type: 'allMids' }),
      post({ type: 'portfolio',                   user: addr }),
      post({ type: 'userNonFundingLedgerUpdates', user: addr, startTime: 0 }),
    ]);

    showLoad('Rendering…', 80);

    /* Address display */
    ge('acAddr').innerHTML =
      '<span class="addr-short">' + addr.slice(0, 6) + '…' + addr.slice(-4) + '</span>'
      + '<span class="addr-full">'  + addr + '</span>';

    renderBalance(perp, spot, mids);
    renderPnlBar(portfolio);
    renderPositions(perp, mids);
    renderTx(txData);

    show('pnlRow');
    show('txCard');
    show('posCard');
    ge('main').style.display = 'flex';

    ge('updTimeVal').textContent = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    show('updTime');

    hideLoad();
    showErr('');
    updateAliasLabel();

    if (!isRefresh) {
      startCountdown();
      /* Show save bar only if not already saved and not a built-in alias */
      const isBuiltin = Object.values(ALIASES).some(function(a) {
        return a.toLowerCase() === addr.toLowerCase();
      });
      if (!isBuiltin) showSaveBar();
    } else {
      cdRemaining = 60; updateRing(60);
      ge('totalBal').classList.add('flash');
      setTimeout(function() { ge('totalBal').classList.remove('flash'); }, 400);
    }

    /* Phase 2 — fills (background) */
    loadFills(addr);

  } catch (e) {
    showErr('Error: ' + e.message);
    hideLoad();
    console.error(e);
  } finally {
    if (refBtn) refBtn.classList.remove('spinning');
  }
}

/* ─── Phase 2: fills ─── */
async function loadFills(addr) {
  show('fillsCard');
  ge('fillsDot').style.display = 'inline-block';

  try {
    const fills = await post({ type: 'userFills', user: addr });
    const sorted = Array.isArray(fills)
      ? fills.sort(function(a, b) { return b.time - a.time; })
      : [];

    renderTrades(sorted);
    computeStats(sorted);
    show('statsRow');
  } catch (e) {
    console.warn('fills error:', e.message);
  } finally {
    ge('fillsDot').style.display = 'none';
  }
}

/* ══════════════════════════════════════════════════════════════
   RENDER — UNIFIED BALANCE
   Spot fix: token balance × mid price = USD value
   Mark price: entry + unrealizedPnl / signedSz  (exact)
══════════════════════════════════════════════════════════════ */

function renderBalance(perp, spot, mids) {
  /* Perp account value & margins */
  const ms   = perp.marginSummary || perp.crossMarginSummary || {};
  const perpV = parseFloat(ms.accountValue || 0);
  const mU    = parseFloat(ms.totalMarginUsed || 0);
  /* withdrawable comes directly from API — most accurate */
  const wdraw = perp.withdrawable != null ? parseFloat(perp.withdrawable) : Math.max(perpV - mU, 0);

  /* Unrealized PnL: sum of all open positions */
  let upnl = 0;
  (perp.assetPositions || []).forEach(function(p) {
    upnl += parseFloat(p.position.unrealizedPnl || 0);
  });

  /* Spot balance: each token × mid price → USD */
  let spotV = 0;
  (spot.balances || []).forEach(function(b) {
    const qty = parseFloat(b.total || 0);
    if (!qty) return;
    /* coin field can be "USDC", "HYPE", "@107", etc. */
    const coin = (b.coin || b.token || '').toString();
    if (coin === 'USDC') {
      spotV += qty;
    } else {
      /* Try multiple key forms: raw, with @, SPOT suffix */
      const px = parseFloat(
        mids[coin] ||
        mids[coin.replace(/:SPOT$/i, '')] ||
        mids[coin + ':SPOT'] ||
        0
      );
      spotV += qty * px;
    }
  });

  const total     = perpV + spotV;
  const openCount = (perp.assetPositions || []).filter(function(p) {
    return parseFloat(p.position.szi) !== 0;
  }).length;

  /* Animate main numbers */
  animNum('totalBal',   total, 2);
  animNum('perpBal',    perpV, 2);
  animNum('spotBal',    spotV, 2);
  animNum('marginUsed', mU,    2);
  animNum('marginFree', wdraw, 2);
  animNum('withdrawable', wdraw, 2);

  ge('openCount').textContent = openCount;

  /* Unrealized PnL block */
  const uEl = ge('aoUpnl');
  if (uEl) {
    uEl.textContent = fmtSgn(upnl, 4) + ' $';
    uEl.className   = 'ao-upnl ' + col(upnl);
  }
  const pb = ge('aoPnlBlock');
  if (pb) pb.style.display = 'block';
}

/* ══════════════════════════════════════════════════════════════
   RENDER — PnL PERIOD BAR
   portfolio format: [ ["day", {pnlHistory:[[ts,val],...]}], … ]
══════════════════════════════════════════════════════════════ */

function renderPnlBar(portfolio) {
  if (!Array.isArray(portfolio)) return;

  portfolio.forEach(function(item) {
    if (!Array.isArray(item) || item.length < 2) return;
    const period = item[0];
    const data   = item[1] || {};
    const hist   = data.pnlHistory;
    if (!Array.isArray(hist) || !hist.length) return;

    /* last entry in pnlHistory = cumulative PnL for this period */
    const val = parseFloat(hist[hist.length - 1][1]);

    if      (period === 'allTime') setPnlEl('pnlAllTime', val);
    else if (period === 'month')   setPnlEl('pnlMonth',   val);
    else if (period === 'week')    setPnlEl('pnlWeek',    val);
    else if (period === 'day')     setPnlEl('pnlDay',     val);
  });
}

function setPnlEl(id, val) {
  if (val == null || isNaN(val)) return;
  const el = ge(id);
  if (!el) return;
  el.textContent = fmtSgn(val, 2) + ' $';
  el.className   = 'pr-v ' + col(val);
}

/* ══════════════════════════════════════════════════════════════
   RENDER — OPEN POSITIONS
   markPx derived from unrealizedPnl — no extra API call needed
══════════════════════════════════════════════════════════════ */

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
    const coin   = pos.coin || '';
    const szi    = parseFloat(pos.szi);
    const entry  = parseFloat(pos.entryPx || 0);
    const upnl   = parseFloat(pos.unrealizedPnl || 0);
    const liqRaw = pos.liquidationPx;
    const liq    = (liqRaw != null && liqRaw !== '0') ? parseFloat(liqRaw) : null;
    const levObj = pos.leverage || {};
    const lev    = levObj.value  ? parseFloat(levObj.value) : null;
    const levTyp = levObj.type   || '';
    const isLong = szi > 0;
    const absSz  = Math.abs(szi);

    /* markPx: entry + upnl/szi  (szi is signed) */
    const mark    = szi !== 0 ? entry + upnl / szi : entry;
    const pnlPct  = entry > 0 ? (mark - entry) / entry * 100 * (isLong ? 1 : -1) : null;
    const notional = absSz * mark;
    const margin   = (lev && notional > 0) ? notional / lev : 0;
    const roe      = margin > 0 ? upnl / margin * 100 : null;
    const liqDist  = (liq && mark > 0) ? Math.abs((liq - mark) / mark * 100) : null;
    const liqCls   = liqDist != null
      ? (liqDist < 5 ? 'red fw6' : liqDist < 15 ? 'orange' : 'dim-c')
      : 'dim-c';

    /* Detect xyz/HIP-3 coin */
    const displayCoin = coinLabel(coin);

    return '<tr class="ra" style="animation-delay:' + (i * 0.04) + 's">'
      + td('mono fw6', displayCoin)
      + td('', '<span class="tag ' + (isLong ? 't-long' : 't-short') + '">' + (isLong ? '↑ Long' : '↓ Short') + '</span>')
      + td('mono', fmtSz(absSz))
      + td('mono', fmtPx(entry))
      + td('mono ' + col(upnl), fmtPx(mark))
      + td('mono fw6 ' + col(upnl), fmtSgn(upnl, 4))
      + td('mono ' + col(upnl), pnlPct != null ? fmtSgn(pnlPct, 3) + '%' : '—')
      + td('mono ' + col(roe),  roe  != null ? fmtSgn(roe, 2)  + '%' : '—')
      + td('', lev
          ? '<span class="lev ' + (levTyp === 'cross' ? 'lev-crs' : 'lev-iso') + '">' + lev + 'x' + (levTyp === 'cross' ? ' ✕' : '') + '</span>'
          : '—')
      + '<td class="' + liqCls + '"><span class="mono">' + (liq ? fmtPx(liq) : '—') + '</span>'
        + (liqDist != null ? '<span class="liq-sub">' + liqDist.toFixed(2) + '% away</span>' : '') + '</td>'
      + td('mono sub-c', fmtLarge(notional))
      + '</tr>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   RENDER — TRADE HISTORY  (last 100 CLOSING fills)
   "Closing" = dir starts with "Close" or "Flip", or closedPnl ≠ 0
   This gives the purest "realized trade" view.
══════════════════════════════════════════════════════════════ */

function isClosingFill(f) {
  const d = (f.dir || '').toLowerCase();
  const cpnl = parseFloat(f.closedPnl || 0);
  return d.startsWith('close') || d.startsWith('flip') || cpnl !== 0;
}

function renderTrades(fills) {
  /* Separate closing vs all fills */
  const closing = fills.filter(isClosingFill);
  const top100  = closing.slice(0, 100);

  ge('fillsBadge').textContent = top100.length + (closing.length > 100 ? '+' : '');

  if (!top100.length) {
    ge('fillsTbody').innerHTML = '<tr class="no-row"><td colspan="9">No closed trades found</td></tr>';
    return;
  }

  ge('fillsTbody').innerHTML = top100.map(function(f, i) {
    const pnl  = parseFloat(f.closedPnl || 0);
    const fee  = parseFloat(f.fee || 0);
    const sz   = parseFloat(f.sz  || 0);
    const px   = parseFloat(f.px  || 0);
    const ntl  = sz * px;
    const ot   = orderType(f);
    const dir  = f.dir || (f.side === 'B' ? 'Buy' : 'Sell');
    const isBuy = f.side === 'B';

    return '<tr class="ra" style="animation-delay:' + Math.min(i * 0.006, 0.2) + 's">'
      + td('mono dim-c', fmtTime(f.time), 11)
      + td('mono fw6', coinLabel(f.coin || ''))
      + td('', dirTag(dir))
      + td('', '<span class="tag ' + ot.cls + '">' + ot.label + '</span>')
      + td('mono', fmtPx(px))
      + td('mono', fmtSz(sz))
      + td('mono sub-c', fmtLarge(ntl))
      + td('mono fw6 ' + col(pnl), pnl !== 0 ? fmtSgn(pnl, 4) : '—')
      + td('mono orange', fee < 0 ? '+' + fmtU(Math.abs(fee), 4) : fmtU(Math.abs(fee), 4), 11)
      + '</tr>';
  }).join('');
}

/* Direction tag for trade table */
function dirTag(dir) {
  const d  = dir.toLowerCase();
  const cls = d.startsWith('close') ? (d.includes('long')  ? 't-short' : 't-long')
             : d.startsWith('flip')  ? 't-taker'
             : d.includes('buy')     ? 't-long'
             :                          't-short';
  return '<span class="tag ' + cls + '">' + dir + '</span>';
}

/* ══════════════════════════════════════════════════════════════
   TRADE STATS  (from ALL closing fills — not limited to 100)
══════════════════════════════════════════════════════════════ */

function computeStats(fills) {
  const closing = fills.filter(isClosingFill);
  if (!closing.length) return;

  const pnls   = closing.map(function(f) { return parseFloat(f.closedPnl || 0); });
  const wins   = pnls.filter(function(p) { return p > 0; });
  const losses = pnls.filter(function(p) { return p < 0; });

  const winRate = pnls.length ? wins.length / pnls.length * 100 : null;
  const avgWin  = wins.length   ? wins.reduce(function(a,b) { return a+b; }, 0)   / wins.length   : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce(function(a,b) { return a+b; }, 0) / losses.length) : 0;
  const pf      = avgLoss > 0 ? avgWin / avgLoss : null;
  const best    = pnls.length ? Math.max.apply(null, pnls)    : null;
  const worst   = pnls.length ? Math.min.apply(null, pnls)    : null;

  const totalFees = closing.reduce(function(s,f) { return s + parseFloat(f.fee || 0); }, 0);
  const totalVol  = closing.reduce(function(s,f) {
    return s + parseFloat(f.sz || 0) * parseFloat(f.px || 0);
  }, 0);

  /* Set DOM */
  setStatEl('statWr',    winRate != null ? winRate.toFixed(1) + '%' : '—', winRate >= 50 ? 'green' : 'red');
  setStatEl('statAvgW',  avgWin  > 0 ? '+' + fmtU(avgWin, 2) : '—',    'green');
  setStatEl('statAvgL',  avgLoss > 0 ? '-' + fmtU(avgLoss, 2) : '—',   'red');
  setStatEl('statPF',    pf != null  ? pf.toFixed(2) : '—',             pf >= 1 ? 'green' : 'red');
  setStatEl('statBest',  best != null  ? fmtSgn(best, 2)  : '—',       'green');
  setStatEl('statWorst', worst != null ? fmtSgn(worst, 2) : '—',       'red');
  setStatEl('statFees',  '-' + fmtU(Math.abs(totalFees), 2),            'orange');
  setStatEl('statVol',   fmtLarge(totalVol),                             'blue');
  setStatEl('statTrades', closing.length.toLocaleString(),               '');
}

function setStatEl(id, text, cls) {
  const el = ge(id);
  if (!el) return;
  el.textContent = text;
  if (cls) el.className = 'sr-v ' + cls;
}

/* ══════════════════════════════════════════════════════════════
   RENDER — TRANSACTIONS
   IN  = deposit (external → account)
   OUT = withdraw (account → external)
   INT = anything internal (spot transfer, vault, sub-account…)
══════════════════════════════════════════════════════════════ */

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
  funding:              'Funding',
};

function txClassify(tx) {
  const t = (tx.delta || {}).type || '';
  if (t === 'deposit')      return 'in';
  if (t === 'withdraw')     return 'out';
  return 'int';
}

function txAmt(tx) {
  const d = tx.delta || {};
  /* Try every possible amount field */
  return Math.abs(parseFloat(
    d.usdc   != null ? d.usdc   :
    d.amount != null ? d.amount :
    d.usd    != null ? d.usd    :
    d.nonce  != null ? 0 : 0
  ));
}

function txToken(tx) {
  const d = tx.delta || {};
  return d.feeToken || d.token || 'USDC';
}

function txCounterparty(tx, field) {
  const a = (tx.delta || {})[field];
  return a && a.toLowerCase() !== currentAddr.toLowerCase() ? a : null;
}

function renderTx(raw) {
  txAll = (Array.isArray(raw) ? raw : [])
    .map(function(t) {
      return Object.assign({}, t, { _d: txClassify(t), _a: txAmt(t) });
    })
    .sort(function(a, b) { return b.time - a.time; });

  /* Summary: only TRUE deposits and withdrawals */
  const depTotal = txAll
    .filter(function(t) { return t.delta && t.delta.type === 'deposit'; })
    .reduce(function(s, t) { return s + t._a; }, 0);
  const witTotal = txAll
    .filter(function(t) { return t.delta && t.delta.type === 'withdraw'; })
    .reduce(function(s, t) { return s + t._a; }, 0);
  const net = depTotal - witTotal;

  ge('txBadge').textContent = txAll.length;
  ge('txSumrow').innerHTML =
    tsr('Total Deposited',  '+' + fmtU(depTotal, 2), 'green',  'USDC')
  + tsr('Total Withdrawn',  '-' + fmtU(witTotal, 2), 'red',    'USDC')
  + tsr('Net Flow',          fmtSgn(net, 2),          col(net), 'USDC')
  + tsr('Transactions',      txAll.length,             'yellow', 'total');

  txTab = 'all'; txPage = 0;
  document.querySelectorAll('.ttab').forEach(function(b) { b.classList.remove('active'); });
  const ttAll = ge('tt-all'); if (ttAll) ttAll.classList.add('active');
  txApply();
}

function tsr(label, val, cls, sub) {
  return '<div class="tsr">'
    + '<div class="tsr-l">' + label + '</div>'
    + '<div class="tsr-v ' + cls + '">' + val + '</div>'
    + '<div class="tsr-s">' + sub + '</div>'
    + '</div>';
}

function txSwitch(tab) {
  txTab = tab; txPage = 0;
  document.querySelectorAll('.ttab').forEach(function(b) { b.classList.remove('active'); });
  const el = ge('tt-' + tab); if (el) el.classList.add('active');
  txApply();
}

function txApply() {
  txFiltered = txTab === 'all'
    ? txAll
    : txAll.filter(function(t) { return t._d === txTab; });
  txPage = 0;
  txRenderPage();
}

function txPrev() { if (txPage > 0) { txPage--; txRenderPage(); } }
function txNext() {
  if (txPage < Math.ceil(txFiltered.length / TX_PER) - 1) { txPage++; txRenderPage(); }
}

function txRenderPage() {
  const start  = txPage * TX_PER;
  const slice  = txFiltered.slice(start, start + TX_PER);
  const tbody  = ge('txTbody');
  const empty  = ge('txEmpty');
  const pager  = ge('txPager');

  if (!slice.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    pager.style.display = 'none';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = slice.map(function(tx, i) {
    const dir   = tx._d;
    const amt   = tx._a;
    const label = TX_LABELS[(tx.delta || {}).type] || (tx.delta || {}).type || '?';
    const sign  = dir === 'in' ? '+' : dir === 'out' ? '-' : '';
    const amtC  = dir === 'in' ? 'green' : dir === 'out' ? 'red' : 'blue';
    const tagC  = dir === 'in' ? 't-in'  : dir === 'out' ? 't-out' : 't-int';
    const token = txToken(tx);
    const from  = txCounterparty(tx, 'user')
               || txCounterparty(tx, 'from');
    const to    = txCounterparty(tx, 'destination')
               || txCounterparty(tx, 'to');

    return '<tr class="ra" style="animation-delay:' + (i * 0.012) + 's">'
      + td('', '<span class="tag ' + tagC + '">' + label + '</span>')
      + td('mono fw6 ' + amtC, sign + fmtU(amt, amt < 1 ? 6 : 2))
      + td('dim-c', escHtml(token), 10)
      + td('', from ? addrBit(from) : youBadge())
      + td('', to   ? addrBit(to)   : youBadge())
      + td('mono dim-c', fmtTime(tx.time), 11)
      + '</tr>';
  }).join('');

  const total = txFiltered.length;
  const pages = Math.ceil(total / TX_PER);
  ge('txPageInfo').textContent = (start + 1) + '–' + Math.min(start + TX_PER, total) + ' of ' + total;
  ge('pgPrev').disabled = txPage === 0;
  ge('pgNext').disabled = txPage >= pages - 1;
  pager.style.display   = pages > 1 ? 'flex' : 'none';
}

function addrBit(a) {
  const s = a.slice(0, 6) + '…' + a.slice(-4);
  return '<span class="mono sub-c addr-bit" title="' + escAttr(a) + '"'
    + ' onclick="navigator.clipboard&&navigator.clipboard.writeText(\'' + escAttr(a) + '\')">' + s + '</span>';
}
function youBadge() {
  return '<span class="mono green" style="font-size:10px">You</span>';
}

/* ══════════════════════════════════════════════════════════════
   HELPERS — COIN LABEL
   HIP-3 xyz coins arrive as "xyz:GOLD", "xyz:SILVER", etc.
   Show as "GOLD [xyz]" with a badge.
══════════════════════════════════════════════════════════════ */

function coinLabel(coin) {
  if (!coin) return '—';
  const xyzMatch = coin.match(/^([^:]+):(.+)$/);
  if (xyzMatch) {
    /* HIP-3: dex:ASSET */
    return escHtml(xyzMatch[2]) + ' <span class="tag t-xyz">' + escHtml(xyzMatch[1]) + '</span>';
  }
  /* Spot coins: @107 format */
  if (coin.startsWith('@')) {
    return '<span class="tag t-spot">SPOT</span> ' + escHtml(coin);
  }
  return escHtml(coin);
}

/* ══════════════════════════════════════════════════════════════
   ANIMATED NUMBER
══════════════════════════════════════════════════════════════ */

function animNum(id, to, d) {
  const el = ge(id);
  if (!el) return;
  to = parseFloat(to);
  if (isNaN(to)) { el.textContent = '—'; return; }
  const from = parseFloat(el.dataset.v || 0);
  el.dataset.v = to;
  if (Math.abs(from - to) < 0.0001) { el.textContent = fmtU(to, d != null ? d : 2); return; }
  const t0 = Date.now(), dur = 650;
  (function tick() {
    const p = Math.min((Date.now() - t0) / dur, 1);
    const e = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
    el.textContent = fmtU(from + (to - from) * e, d != null ? d : 2);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = fmtU(to, d != null ? d : 2);
  })();
}

/* ══════════════════════════════════════════════════════════════
   LOAD BAR
══════════════════════════════════════════════════════════════ */

function showLoad(txt, pct) {
  ge('loadTxt').textContent = txt || 'Loading…';
  ge('lbFill').style.width  = (pct || 30) + '%';
  show('loadBar');
}
function hideLoad() {
  ge('lbFill').style.width = '100%';
  setTimeout(function() {
    hide('loadBar');
    ge('lbFill').style.width = '0';
  }, 300);
}
function showErr(msg) {
  const el = ge('errBar');
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

/* ══════════════════════════════════════════════════════════════
   HTML UTILS
══════════════════════════════════════════════════════════════ */

function td(cls, content, fs) {
  const style = fs ? ' style="font-size:' + fs + 'px"' : '';
  return '<td class="' + cls + '"' + style + '>' + content + '</td>';
}
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(s) {
  return String(s).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════════════════════════
   DOM SHORTCUTS
══════════════════════════════════════════════════════════════ */

function ge(id)      { return document.getElementById(id); }
function show(id, d) { const e = ge(id); if (e) e.style.display = d || 'block'; }
function hide(id)    { const e = ge(id); if (e) e.style.display = 'none'; }

/* ══════════════════════════════════════════════════════════════
   FORMAT
══════════════════════════════════════════════════════════════ */

function fmtU(n, d) {
  const v = parseFloat(n);
  if (isNaN(v)) return '—';
  d = d != null ? d : 2;
  return v.toLocaleString('en-US', {
    minimumFractionDigits:  d,
    maximumFractionDigits:  d,
  });
}
function fmtSgn(n, d) {
  const v = parseFloat(n);
  if (isNaN(v)) return '—';
  return (v > 0 ? '+' : '') + fmtU(v, d);
}
function fmtPx(v) {
  v = parseFloat(v);
  if (!v || isNaN(v)) return '—';
  if (v >= 100000) return fmtU(v, 0);
  if (v >= 10000)  return fmtU(v, 1);
  if (v >= 1000)   return fmtU(v, 2);
  if (v >= 100)    return fmtU(v, 3);
  if (v >= 1)      return fmtU(v, 4);
  if (v >= 0.01)   return fmtU(v, 6);
  return fmtU(v, 8);
}
function fmtSz(v) {
  v = parseFloat(v);
  if (isNaN(v)) return '—';
  if (v >= 1000) return fmtU(v, 2);
  if (v >= 1)    return fmtU(v, 4);
  if (v >= 0.01) return fmtU(v, 6);
  return fmtU(v, 8);
}
function fmtLarge(v) {
  v = parseFloat(v);
  if (!v || isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return fmtU(v / 1e9, 3) + 'B';
  if (a >= 1e6) return fmtU(v / 1e6, 2) + 'M';
  if (a >= 1e3) return fmtU(v / 1e3, 1) + 'K';
  return fmtU(v, 2);
}
function fmtTime(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    day:    '2-digit',
    month:  'short',
    hour:   '2-digit',
    minute: '2-digit',
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

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', function() {
  buildChips();
  updateRing(60);

  ge('addrInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') analyze();
  });

  /* Save on Enter in saveName input */
  const sn = ge('saveName');
  if (sn) {
    sn.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doSave();
    });
  }
});
