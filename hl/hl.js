/* ═══════════════════════════════════════════════════
   HL Trade · app.js
   Hyperliquid xyz Terminal
   EIP-712 · Client-side · No external server
═══════════════════════════════════════════════════ */

/* ── CONSTANTS ── */
const HL_API  = 'https://api.hyperliquid.xyz';
const ARB_RPC = 'https://arb1.arbitrum.io/rpc';
const USDC_CA = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const BRDG_CA = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';
const USDC_ABI = [
  'function approve(address,uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
];
const BRDG_ABI = ['function deposit(address,uint64) external'];

const ASSETS = {
  GOLD:   { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:1, unit:'أونصة', pre:[0.1,0.5,1,2,5],   ico:'🟡', ar:'ذهب'    },
  SILVER: { coin:'xyz:SILVER', idx:110026, lev:25, cross:true,  szDp:2, pxDp:3, unit:'أونصة', pre:[1,2,3,5,10,20],   ico:'⚪', ar:'فضة'    },
  CL:     { coin:'xyz:CL',     idx:110029, lev:20, cross:false, szDp:3, pxDp:2, unit:'برميل', pre:[1,2,3,5,10,20],   ico:'🛢', ar:'نفط خام' },
};

/* ── STATE ── */
let wallet    = null;          // ethers.Wallet instance
let sym       = 'GOLD';        // active asset
let selQty    = 0.1;           // selected quantity
let PX        = { GOLD:{bid:0,ask:0,mid:0}, SILVER:{bid:0,ask:0,mid:0}, CL:{bid:0,ask:0,mid:0} };
let PRV       = { GOLD:0, SILVER:0, CL:0 }; // previous mid for delta
let positions = [];
let timers    = [];
let pendTrade = null;          // { isBuy, qty, sym }
let pendClose = null;          // index in positions[]
let secCount  = 0;

/* ── HELPERS ── */
const $  = id => document.getElementById(id);
const fx = (n, d) => (+n).toFixed(d);

function om(id) { $(id).classList.add('open'); }
function cm(id) { $(id).classList.remove('open'); }

function toast(msg, type = 'if', dur = 3500) {
  const el = $('tst');
  el.textContent = msg;
  el.className   = 'on ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.className = ''), dur);
}
function ld(msg) { $('ldrt').textContent = msg || 'جاري...'; $('ldr').className = 'on'; }
function ul()    { $('ldr').className = ''; }

function ripple(btn, e) {
  const r = document.createElement('span');
  r.className = 'rpl';
  const b = btn.getBoundingClientRect();
  const s = Math.max(b.width, b.height) * 2;
  r.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - b.left - s/2}px;top:${e.clientY - b.top - s/2}px`;
  btn.appendChild(r);
  setTimeout(() => r.remove(), 560);
}

function setBtnLoading(id, text = '⏳') {
  const btn = $(id);
  btn.disabled         = true;
  btn._origHTML        = btn.innerHTML;
  btn.innerHTML        = text;
}
function resetBtn(id) {
  const btn = $(id);
  btn.disabled  = false;
  if (btn._origHTML) btn.innerHTML = btn._origHTML;
}

/* ── HYPERLIQUID API ── */
async function hlInfo(body) {
  const res = await fetch(HL_API + '/info', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/* Core signing + exchange call.
   Bug-fix: all errors bubble up with clear messages. */
async function hlExchange(action) {
  if (!wallet) throw new Error('لا توجد محفظة — سجّل الدخول أولاً');

  // msgpack encode
  if (typeof MessagePack === 'undefined')
    throw new Error('msgpack غير محمّل — أعد تحميل الصفحة');

  const nonce  = Date.now();
  const ab     = MessagePack.encode(action);      // Uint8Array
  const nb     = new ArrayBuffer(8);
  new DataView(nb).setBigUint64(0, BigInt(nonce), false);

  const buf = new Uint8Array(ab.length + 9);
  buf.set(ab);
  buf.set(new Uint8Array(nb), ab.length);
  buf.set([0x00], ab.length + 8);

  const connId = ethers.keccak256(buf);           // bytes32

  const sig = await wallet.signTypedData(
    { name:'Exchange', version:'1', chainId:1337,
      verifyingContract:'0x0000000000000000000000000000000000000000' },
    { Agent:[{ name:'source', type:'string' }, { name:'connectionId', type:'bytes32' }] },
    { source:'a', connectionId:connId },
  );

  const { r, s, v } = ethers.Signature.from(sig);

  const res = await fetch(HL_API + '/exchange', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action, nonce, signature:{ r, s, v }, vaultAddress:null }),
  });
  if (!res.ok) throw new Error('Exchange HTTP ' + res.status);

  const data = await res.json();
  if (data.status !== 'ok') {
    const msg = data.response?.data?.statuses?.[0]
             || data.response
             || JSON.stringify(data).slice(0, 250);
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

/* ── PRICES (every 1 second) ── */
async function pollPrices() {
  await Promise.all(Object.keys(ASSETS).map(async s => {
    try {
      const a  = ASSETS[s];
      const lb = await hlInfo({ type:'l2Book', coin:a.coin });
      const bid = parseFloat(lb.levels?.[0]?.[0]?.px || 0);
      const ask = parseFloat(lb.levels?.[1]?.[0]?.px || 0);
      const mid = (bid && ask) ? (bid + ask) / 2 : 0;
      PX[s] = { bid, ask, mid };

      // Update tab price + flash colour
      const tp  = $('tp' + s);
      if (mid && tp) {
        const prev = PRV[s] || 0;
        const dir  = mid > prev ? 'up' : mid < prev ? 'dn' : '';
        tp.textContent = fx(mid, a.pxDp);
        tp.className   = 'tp' + (dir ? ' ' + dir : '');
        if (dir) setTimeout(() => { tp.className = 'tp'; }, 800);
      }
    } catch { /* silent per-asset */ }
  }));
  updatePxDisplay();
}

function updatePxDisplay() {
  const a = ASSETS[sym];
  const p = PX[sym];
  if (!p || !p.mid) return;

  const prev = PRV[sym] || p.mid;
  const dir  = p.mid > prev ? 1 : p.mid < prev ? -1 : 0;
  const cl   = dir > 0 ? 'u' : dir < 0 ? 'd' : 'n';

  // Band background
  const band = $('pxB');
  if (band) band.className = 'pxband' + (dir > 0 ? ' pu' : dir < 0 ? ' pd' : '');

  // ASK / BID numbers
  setText('pxA',  fx(p.ask, a.pxDp), 'pxn ' + cl);
  setText('pxBD', fx(p.bid, a.pxDp), 'pxn ' + cl);

  // Button prices
  setTxt('bBuP', fx(p.ask, a.pxDp));
  setTxt('bSeP', fx(p.bid, a.pxDp));

  // Spread
  setTxt('pxS', fx(p.ask - p.bid, a.pxDp));

  // Delta
  if (prev && p.mid !== prev) {
    const diff = p.mid - prev;
    const txt  = (diff > 0 ? '+' : '') + fx(diff, a.pxDp);
    setText('pxAd', txt, 'pxdel ' + cl);
    setText('pxBd', txt, 'pxdel ' + cl);
  }

  PRV[sym] = p.mid;

  // Countdown timer
  secCount = 1;
  clearInterval(window._pxTimer);
  setTxt('pxT', '↻ 1s');
  window._pxTimer = setInterval(() => { secCount++; setTxt('pxT', '↻ ' + secCount + 's'); }, 1000);
}

function setText(id, txt, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = txt;
  if (cls !== undefined) el.className = cls;
}
function setTxt(id, txt) { const el = $(id); if (el) el.textContent = txt; }

/* ── ACCOUNT (every 8 seconds) ──
   Unified balance = perps xyz accountValue + spot USDC
   Docs: under unified account, both share collateral.
   We sum both to give the real total.                  */
async function pollAccount() {
  if (!wallet) return;
  try {
    const [perpSt, spotSt] = await Promise.all([
      hlInfo({ type:'clearinghouseState', user:wallet.address, dex:'xyz' }),
      hlInfo({ type:'spotClearinghouseState', user:wallet.address }),
    ]);

    const ms          = perpSt.marginSummary || {};
    const perpEquity  = parseFloat(ms.accountValue    || 0);
    const marginUsed  = parseFloat(ms.totalMarginUsed || 0);
    const withdrawable = parseFloat(perpSt.withdrawable || 0);

    let spotUSDC = 0;
    for (const b of spotSt?.balances || []) {
      if (b.coin === 'USDC' || b.coin === 'USDC:0')
        spotUSDC += parseFloat(b.total || 0);
    }

    const totalEquity = perpEquity + spotUSDC;
    const freeMargin  = withdrawable + spotUSDC;
    const floatPnl    = (perpSt.assetPositions || [])
      .reduce((s, p) => s + parseFloat(p.position?.unrealizedPnl || 0), 0);

    positions = (perpSt.assetPositions || [])
      .filter(p => parseFloat(p.position?.szi || 0) !== 0);

    window._BAL = { totalEquity, perpEquity, spotUSDC, marginUsed, withdrawable, freeMargin, floatPnl };

    renderPositions();
  } catch (e) {
    console.warn('[pollAccount]', e.message);
  }
}

/* ── SWITCH ASSET ── */
function switchSym(s) {
  sym = s;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.s === s));
  const a = ASSETS[s];
  setTxt('pxAN', a.ar);
  setTxt('uLb',  a.unit);
  setTxt('pSym', a.ar);
  renderPresets(a.pre);
  PRV[s] = 0;
  updatePxDisplay();
}

function renderPresets(pre) {
  $('psets').innerHTML = pre
    .map((v, i) => `<button class="ps${i === 0 ? ' on' : ''}" onclick="pickQty(${v},this)">${v}</button>`)
    .join('');
  selQty = pre[0];
  $('qI').value = pre[0];
}

window.pickQty = function(v, btn) {
  selQty = v;
  $('qI').value = v;
  $('psets').querySelectorAll('.ps').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
};

/* ── POSITIONS ── */
function renderPositions() {
  const cnt = $('pCnt');
  if (cnt) cnt.textContent = positions.length;
  const tot = $('pTot');

  if (!positions.length) {
    $('pList').innerHTML = '<div class="posmt">📂 &nbsp; لا توجد صفقات مفتوحة</div>';
    if (tot) { tot.textContent = ''; }
    return;
  }

  let total = 0;
  $('pList').innerHTML = positions.map((p, i) => {
    const pos  = p.position;
    const szi  = parseFloat(pos.szi);
    const pnl  = parseFloat(pos.unrealizedPnl || 0);
    total += pnl;

    const cs   = pos.coin.replace('xyz:', '');
    const a    = ASSETS[cs] || { ar:cs, unit:'', ico:'', pxDp:2 };
    const sAr  = szi > 0 ? 'شراء ↑' : 'بيع ↓';
    const sCl  = szi > 0 ? 'lo' : 'sh';
    const pCl  = pnl >= 0 ? 'po' : 'ne';
    const sg   = pnl >= 0 ? '+' : '';
    const ep   = parseFloat(pos.entryPx || 0);
    const cur  = PX[cs]?.mid || 0;

    return `<div class="posit">
      <div class="pil">
        <div class="pin">${a.ico} ${a.ar}</div>
        <div class="pim">
          <span class="${sCl}">${sAr}</span>
          &nbsp;|&nbsp; دخول: ${fx(ep, a.pxDp)}
          &nbsp;|&nbsp; حالي: ${cur ? fx(cur, a.pxDp) : '—'}
        </div>
        <button class="bclr" onclick="askClose(${i})">إغلاق ✕</button>
      </div>
      <div class="pir">
        <div class="pip ${pCl}">${sg}$${fx(pnl, 2)}</div>
        <div class="pisz">${Math.abs(szi)} ${a.unit}</div>
      </div>
    </div>`;
  }).join('');

  if (tot) {
    const ts = total >= 0 ? '+' : '';
    tot.textContent = `${ts}$${fx(total, 2)}`;
    tot.style.color = total >= 0 ? 'var(--up)' : 'var(--dn)';
  }
}

/* ══════════════════════════════════════
   TRADE — CONFIRM FLOW
   Fix: modal stays open during execution,
   button disabled, loader overlay shown,
   finally always cleans up.
══════════════════════════════════════ */
function askTrade(isBuy, e) {
  ripple(isBuy ? $('bBu') : $('bSe'), e);

  const qty = parseFloat($('qI').value || selQty || 0);
  if (!qty || qty <= 0)    { toast('أدخل الكمية أولاً', 'er'); return; }

  const a = ASSETS[sym];
  const p = PX[sym];
  if (!p || !p.mid)        { toast('لا يوجد سعر — السوق مغلق؟', 'er'); return; }

  const price = isBuy ? p.ask : p.bid;
  const usd   = (price * qty).toFixed(2);
  const mgn   = (price * qty / a.lev).toFixed(2);
  const liq   = isBuy
    ? fx(price * (1 - 1 / a.lev), a.pxDp)
    : fx(price * (1 + 1 / a.lev), a.pxDp);
  const dir   = isBuy ? 'شراء ↑' : 'بيع ↓';

  setTxt('cfT', `تأكيد — ${a.ico} ${dir}`);
  setTxt('cfS', `${a.ar} · رافعة ${a.lev}x`);

  $('cfB').innerHTML = `
    <div class="cr"><div class="ck">الاتجاه</div><div class="cv ${isBuy?'bc':'sc'}">${dir}</div></div>
    <div class="cr"><div class="ck">الكمية</div><div class="cv">${qty} ${a.unit}</div></div>
    <div class="cr"><div class="ck">السعر التقريبي</div><div class="cv">${fx(price, a.pxDp)} $</div></div>
    <div class="cr"><div class="ck">القيمة الكلية</div><div class="cv">≈ $${usd}</div></div>
    <div class="cr"><div class="ck">الهامش المطلوب</div><div class="cv wc">≈ $${mgn}</div></div>
    <div class="cr"><div class="ck">تصفية تقريبية</div><div class="cv sc">≈ ${liq} $</div></div>`;

  const ok = $('cfOk');
  ok.className = 'sok ' + (isBuy ? 'bok' : 'sok2');
  ok.innerHTML = isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع';

  pendTrade = { isBuy, qty, sym };
  om('mCf');
}

/* execTrade: called from confirm button onclick */
window.execTrade = async function() {
  if (!pendTrade) { cm('mCf'); return; }

  const { isBuy, qty, sym: s } = pendTrade;
  const a = ASSETS[s];
  const p = PX[s];

  if (!p || !p.mid) {
    toast('لا يوجد سعر — السوق مغلق؟', 'er');
    cm('mCf');
    return;
  }

  // Disable button + show loader (modal stays visible underneath)
  setBtnLoading('cfOk', '⏳ جاري التنفيذ...');
  ld(`${a.ico} ${isBuy ? 'شراء ↑' : 'بيع ↓'} ${qty} ${a.unit} — ${a.ar}`);

  try {
    // 1. Set leverage (soft fail — may already be set)
    try {
      await hlExchange({ type:'updateLeverage', asset:a.idx, isCross:a.cross, leverage:a.lev });
    } catch (e) { console.warn('[setLev]', e.message); }

    // 2. Place IOC limit order at 2% slippage from mid
    const limitPx = fx(p.mid * (isBuy ? 1.02 : 0.98), a.pxDp);
    const sz      = fx(qty, a.szDp);

    await hlExchange({
      type:   'order',
      orders: [{ a:a.idx, b:isBuy, p:limitPx, s:sz, r:false, t:{ limit:{ tif:'Ioc' } } }],
      grouping: 'na',
    });

    cm('mCf');
    toast(`✅ ${isBuy ? 'شراء' : 'بيع'} ${qty} ${a.unit} ${a.ar} — تم التنفيذ`, 'ok', 5000);
    setTimeout(pollAccount, 2000);

  } catch (err) {
    toast(`❌ ${err.message.slice(0, 120)}`, 'er', 6000);
    // Modal stays open so user can retry or cancel
  } finally {
    resetBtn('cfOk');
    ul();
  }
};

/* ══════════════════════════════════════
   CLOSE — CONFIRM FLOW
══════════════════════════════════════ */
window.askClose = function(i) {
  const p = positions[i];
  if (!p) return;
  const pos = p.position;
  const szi = parseFloat(pos.szi);
  const cs  = pos.coin.replace('xyz:', '');
  const a   = ASSETS[cs] || { ar:cs, unit:'', ico:'', pxDp:2 };
  const pnl = parseFloat(pos.unrealizedPnl || 0);
  const sg  = pnl >= 0 ? '+' : '';
  const cur = PX[cs]?.mid || 0;

  setTxt('clT', `إغلاق — ${a.ico} ${a.ar}`);
  $('clB').innerHTML = `
    <div class="cr"><div class="ck">الاتجاه</div><div class="cv">${szi > 0 ? 'شراء ↑' : 'بيع ↓'}</div></div>
    <div class="cr"><div class="ck">الكمية</div><div class="cv">${Math.abs(szi)} ${a.unit}</div></div>
    <div class="cr"><div class="ck">سعر الدخول</div><div class="cv">${fx(pos.entryPx || 0, a.pxDp)} $</div></div>
    <div class="cr"><div class="ck">السعر الحالي</div><div class="cv">${cur ? fx(cur, a.pxDp) : '—'} $</div></div>
    <div class="cr"><div class="ck">الربح / الخسارة</div>
      <div class="cv" style="color:${pnl >= 0 ? 'var(--up)' : 'var(--dn)'}">${sg}$${fx(pnl, 2)}</div></div>`;

  pendClose = i;
  om('mCl');
};

window.execClose = async function() {
  if (pendClose === null) { cm('mCl'); return; }

  const i   = pendClose;
  const p   = positions[i];
  if (!p) { cm('mCl'); return; }

  const pos = p.position;
  const szi = parseFloat(pos.szi);
  const cs  = pos.coin.replace('xyz:', '');
  const a   = ASSETS[cs];
  if (!a) { toast('أصل غير معروف', 'er'); cm('mCl'); return; }

  const mid = PX[cs]?.mid;
  if (!mid) { toast('لا يوجد سعر حالي', 'er'); cm('mCl'); return; }

  setBtnLoading('clOk', '⏳ جاري الإغلاق...');
  ld(`إغلاق ${a.ico} ${a.ar}...`);

  try {
    const isBuy   = szi < 0;           // reverse direction to close
    const sz      = fx(Math.abs(szi), a.szDp);
    const limitPx = fx(mid * (isBuy ? 1.02 : 0.98), a.pxDp);

    await hlExchange({
      type:   'order',
      orders: [{ a:a.idx, b:isBuy, p:limitPx, s:sz, r:true, t:{ limit:{ tif:'Ioc' } } }],
      grouping: 'na',
    });

    const pnl = parseFloat(pos.unrealizedPnl || 0);
    const sg  = pnl >= 0 ? '+' : '';
    cm('mCl');
    toast(`✅ أُغلقت ${a.ar} | P&L: ${sg}$${fx(pnl, 2)}`, pnl >= 0 ? 'ok' : 'er', 5000);
    setTimeout(pollAccount, 2000);

  } catch (err) {
    toast(`❌ ${err.message.slice(0, 120)}`, 'er', 6000);
  } finally {
    resetBtn('clOk');
    ul();
  }
};

/* ══════════════════════════════════════
   BALANCE MODAL
   Shows unified Hyperliquid balance:
   perps (xyz) + spot USDC combined
══════════════════════════════════════ */
async function showBalance() {
  om('mBl');
  $('blC').innerHTML = '<div class="bld">⏳ جاري جلب الرصيد...</div>';

  try {
    const [perpSt, spotSt] = await Promise.all([
      hlInfo({ type:'clearinghouseState', user:wallet.address, dex:'xyz' }),
      hlInfo({ type:'spotClearinghouseState', user:wallet.address }),
    ]);

    const ms         = perpSt.marginSummary || {};
    const perpEquity = parseFloat(ms.accountValue    || 0);
    const marginUsed = parseFloat(ms.totalMarginUsed || 0);
    const withdrawable = parseFloat(perpSt.withdrawable || 0);

    let spotUSDC = 0;
    for (const b of spotSt?.balances || []) {
      if (b.coin === 'USDC' || b.coin === 'USDC:0')
        spotUSDC += parseFloat(b.total || 0);
    }

    const totalEquity = perpEquity + spotUSDC;
    const freeMargin  = (perpEquity - marginUsed) + spotUSDC;

    const floatPnl = positions.reduce(
      (s, p) => s + parseFloat(p.position?.unrealizedPnl || 0), 0,
    );
    const ps = floatPnl >= 0 ? '+' : '';

    $('blC').innerHTML = `
      <div class="bg2">
        <div class="bi fw">
          <div class="bil">إجمالي رصيد Hyperliquid</div>
          <div class="biv b">$${fx(totalEquity, 2)}</div>
          <div class="bis">Perps xyz ($${fx(perpEquity,2)}) + Spot USDC ($${fx(spotUSDC,2)})</div>
        </div>
        <div class="bi">
          <div class="bil">رصيد حر للتداول</div>
          <div class="biv g">$${fx(freeMargin, 2)}</div>
          <div class="bis">متاح فوراً</div>
        </div>
        <div class="bi">
          <div class="bil">هامش مستخدم</div>
          <div class="biv w">$${fx(marginUsed, 2)}</div>
          <div class="bis">في صفقات مفتوحة</div>
        </div>
        <div class="bi">
          <div class="bil">قابل للسحب</div>
          <div class="biv g">$${fx(withdrawable, 2)}</div>
        </div>
        <div class="bi">
          <div class="bil">ربح / خسارة عائم</div>
          <div class="biv ${floatPnl >= 0 ? 'g' : 'r'}">${ps}$${fx(floatPnl, 2)}</div>
          <div class="bis">${positions.length} صفقة مفتوحة</div>
        </div>
      </div>
      <button class="bref" onclick="showBalance()">🔄 تحديث الرصيد</button>`;

  } catch (err) {
    $('blC').innerHTML =
      `<div class="bld" style="color:var(--dn)">❌ ${err.message.slice(0, 180)}</div>`;
  }
}

/* ══════════════════════════════════════
   WITHDRAW
══════════════════════════════════════ */
async function doWithdraw() {
  const amt  = parseFloat($('wA').value || 0);
  const dest = $('wD').value.trim();
  if (!amt || amt <= 0)                     { toast('أدخل المبلغ', 'er'); return; }
  if (!/^0x[0-9a-fA-F]{40}$/.test(dest))   { toast('عنوان Arbitrum غير صحيح', 'er'); return; }

  setBtnLoading('wOk', '⏳');
  ld('توقيع طلب السحب...');

  try {
    const nonce  = Date.now();
    const to     = dest.toLowerCase();
    const action = {
      type:'withdraw3', hyperliquidChain:'Mainnet',
      signatureChainId:'0xa4b1',
      destination:to, amount:amt.toFixed(2), time:nonce,
    };
    const sig = await wallet.signTypedData(
      { name:'HyperliquidSignTransaction', version:'1', chainId:42161,
        verifyingContract:'0x0000000000000000000000000000000000000000' },
      { 'HyperliquidTransaction:Withdraw':[
          { name:'hyperliquidChain', type:'string' },
          { name:'destination',      type:'string' },
          { name:'amount',           type:'string' },
          { name:'time',             type:'uint64' },
        ] },
      { hyperliquidChain:'Mainnet', destination:to, amount:action.amount, time:nonce },
    );
    const { r, s, v } = ethers.Signature.from(sig);
    const res = await fetch(HL_API + '/exchange', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ action, nonce, signature:{ r, s, v } }),
    });
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(JSON.stringify(data));

    cm('mWd');
    toast(`✅ طلب السحب ${amt} USDC — قيد المعالجة`, 'ok', 5000);
    setTimeout(pollAccount, 5000);

  } catch (err) {
    toast(`❌ ${err.message.slice(0, 120)}`, 'er', 5000);
  } finally {
    resetBtn('wOk');
    ul();
  }
}

/* ══════════════════════════════════════
   DEPOSIT (Arbitrum Bridge)
══════════════════════════════════════ */
async function doDeposit() {
  const amt = parseFloat($('dA').value || 0);
  if (!amt || amt <= 0) { toast('أدخل المبلغ', 'er'); return; }

  setBtnLoading('dOk', '⏳');
  ld('موافقة USDC على Arbitrum...');

  try {
    const prov   = new ethers.JsonRpcProvider(ARB_RPC);
    const w2     = new ethers.Wallet(wallet.privateKey, prov);
    const uc     = new ethers.Contract(USDC_CA, USDC_ABI, w2);
    const bc     = new ethers.Contract(BRDG_CA, BRDG_ABI, w2);
    const raw    = ethers.parseUnits(amt.toString(), 6);
    const bal    = await uc.balanceOf(w2.address);
    if (bal < raw) throw new Error(`رصيد USDC غير كافٍ على Arbitrum: ${ethers.formatUnits(bal, 6)}`);

    const ap  = await uc.approve(BRDG_CA, raw);
    await ap.wait();

    ld('إرسال للجسر...');
    const dep = await bc.deposit(w2.address, raw);
    const rec = await dep.wait();

    cm('mDp');
    toast(`✅ إيداع ناجح! ${amt} USDC · ${rec.hash.slice(0, 10)}...`, 'ok', 6000);
    setTimeout(pollAccount, 7000);

  } catch (err) {
    toast(`❌ ${err.message.slice(0, 120)}`, 'er', 5000);
  } finally {
    resetBtn('dOk');
    ul();
  }
}

/* ══════════════════════════════════════
   LOGIN / LOGOUT
══════════════════════════════════════ */
async function login() {
  let key = $('kI').value.trim();
  if (!key) { toast('أدخل المفتاح الخاص', 'er'); return; }
  if (!key.startsWith('0x')) key = '0x' + key;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    toast('المفتاح يجب أن يكون 64 حرف hex', 'er');
    return;
  }

  setBtnLoading('lBtn', '⏳ التحقق...');
  ld('التحقق من المحفظة...');

  try {
    wallet = new ethers.Wallet(key);
    sessionStorage.setItem('hl_k', key);

    const addr = wallet.address;
    setTxt('nAd', addr.slice(0, 6) + '...' + addr.slice(-4));
    $('wD').value = addr;

    $('sL').classList.add('off');
    $('sA').classList.remove('off');
    switchSym('GOLD');

    ld('جلب الأسعار والمراكز...');
    await Promise.all([pollPrices(), pollAccount()]);

    ul();
    toast('مرحباً · ' + addr.slice(0, 6) + '...', 'ok');

    // Start polling intervals
    timers.push(setInterval(pollPrices,  1000));
    timers.push(setInterval(pollAccount, 8000));

  } catch (err) {
    ul();
    wallet = null;
    sessionStorage.removeItem('hl_k');
    toast('خطأ: ' + err.message.slice(0, 100), 'er', 5000);
  } finally {
    resetBtn('lBtn');
  }
}

/* Logout with professional confirmation */
function askLogout() {
  setTxt('lgT', 'تسجيل الخروج');
  om('mLg');
}

window.doLogout = function() {
  timers.forEach(clearInterval);
  timers = [];
  clearInterval(window._pxTimer);
  sessionStorage.removeItem('hl_k');
  wallet    = null;
  positions = [];
  PX   = { GOLD:{bid:0,ask:0,mid:0}, SILVER:{bid:0,ask:0,mid:0}, CL:{bid:0,ask:0,mid:0} };
  PRV  = { GOLD:0, SILVER:0, CL:0 };
  cm('mLg');
  $('sA').classList.add('off');
  $('sL').classList.remove('off');
  $('kI').value = '';
  toast('تم تسجيل الخروج بأمان', 'if');
};

/* ══════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  // Login
  $('lBtn').addEventListener('click', login);
  $('kI').addEventListener('keydown', e => e.key === 'Enter' && login());
  $('kE').addEventListener('click', () => {
    const inp = $('kI');
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    $('kE').textContent = show ? '🙈' : '👁';
  });

  // Asset tabs
  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => switchSym(t.dataset.s)),
  );

  // Trade buttons
  $('bBu').addEventListener('click', e => {
    if (!wallet) { toast('سجّل الدخول أولاً', 'er'); return; }
    askTrade(true, e);
  });
  $('bSe').addEventListener('click', e => {
    if (!wallet) { toast('سجّل الدخول أولاً', 'er'); return; }
    askTrade(false, e);
  });

  // Qty input
  $('qI').addEventListener('input', function () {
    selQty = parseFloat(this.value) || 0;
    $('psets').querySelectorAll('.ps').forEach(b => b.classList.remove('on'));
  });

  // Bottom bar
  $('bBal').addEventListener('click', () => wallet && showBalance());
  $('bDp').addEventListener('click',  () => wallet && om('mDp'));
  $('bWd').addEventListener('click',  () => wallet && om('mWd'));
  $('bOut').addEventListener('click', () => wallet && askLogout());

  // Deposit / Withdraw
  $('dOk').addEventListener('click', doDeposit);
  $('wOk').addEventListener('click', doWithdraw);

  // Address copy
  $('nAd').addEventListener('click', () => {
    if (wallet) {
      navigator.clipboard?.writeText(wallet.address)
        .then(() => toast('تم نسخ العنوان', 'if', 2000))
        .catch(() => {});
    }
  });

  // Close overlays on backdrop click
  document.querySelectorAll('.ov').forEach(o =>
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); }),
  );

  // Auto-login from session
  const savedKey = sessionStorage.getItem('hl_k');
  if (savedKey) {
    $('kI').value = savedKey;
    login();
  }
});
