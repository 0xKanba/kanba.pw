/* ═══════════════════════════════════════
   HL Trade · app.js (Fixed & Robust)
════════════════════════════════════════ */

const HL_API = 'https://api.hyperliquid.xyz';
const ASSETS = {
  GOLD:   { coin:'xyz:GOLD',   idx:110003, lev:25, szDp:4, pxDp:1, unit:'أونصة', pre:[0.1,0.5,1,2,5], ico:'🟡', ar:'ذهب' },
  SILVER: { coin:'xyz:SILVER', idx:110026, lev:25, szDp:2, pxDp:3, unit:'أونصة', pre:[1,5,10],      ico:'⚪', ar:'فضة' },
  CL:     { coin:'xyz:CL',     idx:110029, lev:20, szDp:3, pxDp:2, unit:'برميل', pre:[1,5,10],      ico:'🛢', ar:'نفط' },
};

let wallet = null, sym = 'GOLD', selQty = 0.1;
let PX = {}, PRV = {}, positions = [];
let timers = [], pendTrade = null;

/* ── HELPERS ── */
const $ = id => document.getElementById(id);
const fx = (n, d) => (+n).toFixed(d);
const om = id => $(id).classList.add('open');
const cm = id => $(id).classList.remove('open');

function toast(msg, type = 'if', dur = 3000) {
  const el = $('tst');
  el.textContent = msg;
  el.className = 'on ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = '', dur);
}

function ld(msg) { $('ldrt').textContent = msg || '...'; $('ldr').classList.add('on'); }
function ul() { $('ldr').classList.remove('on'); }

function setBtn(id, loading) {
  const btn = $(id);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '⏳';
  } else if (btn.dataset.orig) {
    btn.innerHTML = btn.dataset.orig;
  }
}

/* ── HYPERLIQUID API ── */
async function hlInfo(body) {
  try {
    const res = await fetch(HL_API + '/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  } catch (e) {
    console.error("HL Info Error", e);
    return null;
  }
}

// Correct EIP-712 Signing for Hyperliquid
async function hlExchange(action) {
  if (!wallet) throw new Error('No Wallet');

  const nonce = Date.now();
  
  // 1. MessagePack Encode Action
  // Using the globally loaded msgpack library
  if (typeof MessagePack === 'undefined') throw new Error('Msgpack not loaded');
  const actionBytes = MessagePack.encode(action); // Uint8Array

  // 2. Create ConnectionId Hash
  // Structure: action_bytes + nonce(8 bytes big-endian) + phantom_byte(0x00)
  const nonceBuf = new ArrayBuffer(8);
  new DataView(nonceBuf).setBigUint64(0, BigInt(nonce), false); // false = big-endian
  
  const buf = new Uint8Array(actionBytes.length + 8 + 1);
  buf.set(actionBytes, 0);
  buf.set(new Uint8Array(nonceBuf), actionBytes.length);
  buf.set([0x00], actionBytes.length + 8);

  const connectionId = ethers.keccak256(buf);

  // 3. Sign Typed Data (EIP-712)
  const domain = {
    name: 'Exchange',
    version: '1',
    chainId: 42161, // Arbitrum Chain ID used by HL
    verifyingContract: '0x0000000000000000000000000000000000000000'
  };
  const types = {
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' }
    ]
  };
  const value = { source: 'a', connectionId };
  
  const sig = await wallet.signTypedData(domain, types, value);
  const { r, s, v } = ethers.Signature.from(sig);

  // 4. Send Request
  const res = await fetch(HL_API + '/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      nonce,
      signature: { r, s, v },
      vaultAddress: null
    }),
  });

  const data = await res.json();
  if (data.status === 'ok') return data;
  throw new Error(data.response || 'Exchange Error');
}

/* ── PRICING ── */
async function pollPrices() {
  for (const [s, a] of Object.entries(ASSETS)) {
    try {
      const lb = await hlInfo({ type: 'l2Book', coin: a.coin });
      if (lb && lb.levels) {
        const bid = parseFloat(lb.levels[0]?.[0]?.px || 0);
        const ask = parseFloat(lb.levels[1]?.[0]?.px || 0);
        const mid = (bid && ask) ? (bid + ask) / 2 : 0;
        PX[s] = { bid, ask, mid };
      }
    } catch (e) {}
  }
  updateUI();
}

function updateUI() {
  const a = ASSETS[sym];
  const p = PX[sym];
  if (!a || !p || !p.mid) return;

  $('pxVal').textContent = fx(p.mid, a.pxDp);
  // Flash effect
  const dir = p.mid > (PRV[sym] || 0) ? 'u' : p.mid < (PRV[sym] || 0) ? 'd' : '';
  $('pxVal').className = 'pxval' + (dir ? ' ' + dir : '');
  
  $('bBuP').textContent = fx(p.ask, a.pxDp);
  $('bSeP').textContent = fx(p.bid, a.pxDp);
  PRV[sym] = p.mid;
}

/* ── POSITIONS ── */
async function pollAccount() {
  if (!wallet) return;
  try {
    const st = await hlInfo({ type: 'clearinghouseState', user: wallet.address });
    if (st && st.assetPositions) {
      positions = st.assetPositions.filter(p => parseFloat(p.position?.szi || 0) !== 0);
      renderPositions();
    }
  } catch (e) {}
}

function renderPositions() {
  const list = $('pList');
  if (!positions.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--t2);">لا توجد صفقات مفتوحة</div>';
    return;
  }
  
  list.innerHTML = positions.map((p, i) => {
    const pos = p.position;
    const szi = parseFloat(pos.szi);
    const pnl = parseFloat(pos.unrealizedPnl || 0);
    const coin = pos.coin.replace('xyz:', '');
    const a = ASSETS[coin] || { ar: coin, unit: '', ico: '' };
    
    return `<div class="posit">
      <div>
        <div style="font-weight:900">${a.ico} ${a.ar} <span style="font-size:12px;color:var(--t2)">${szi>0?'شراء':'بيع'}</span></div>
        <div style="font-size:12px;color:var(--t2)">${Math.abs(szi)} ${a.unit}</div>
      </div>
      <div style="text-align:left">
        <div class="pip ${pnl>=0?'po':'ne'}">${pnl>=0?'+':''}$${fx(pnl,2)}</div>
        <button class="bclr" onclick="askClose(${i})">إغلاق</button>
      </div>
    </div>`;
  }).join('');
}

/* ── TRADE FLOW ── */
function askTrade(isBuy) {
  if (!wallet) { toast('سجل الدخول أولاً', 'er'); return; }
  
  const qty = parseFloat($('qI').value || 0);
  if (!qty) { toast('أدخل الكمية', 'er'); return; }
  
  const a = ASSETS[sym];
  const p = PX[sym];
  if(!p || !p.mid) { toast('لا يوجد سعر حالياً', 'er'); return; }

  const price = isBuy ? p.ask : p.bid;
  
  $('cfT').textContent = `${isBuy ? 'شراء' : 'بيع'} ${a.ico} ${a.ar}`;
  $('cfB').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:10px">
      <span>الكمية</span><span style="font-family:var(--mono)">${qty} ${a.unit}</span>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:10px">
      <span>السعر</span><span style="font-family:var(--mono)">${fx(price, a.pxDp)} $</span>
    </div>
    <div style="display:flex;justify-content:space-between">
      <span>الهامش (${a.lev}x)</span><span style="font-family:var(--mono);color:var(--ac)">${(price * qty / a.lev).toFixed(2)} $</span>
    </div>`;

  pendTrade = { isBuy, qty, sym };
  $('cfOk').className = 'sok ' + (isBuy ? 'bok' : 'wok');
  om('mCf');
}

window.execTrade = async function() {
  if (!pendTrade) return;
  const { isBuy, qty, sym: s } = pendTrade;
  const a = ASSETS[s];
  const p = PX[s];

  cm('mCf'); // Close modal immediately
  setBtn('bBu', true); setBtn('bSe', true);
  ld('جاري التنفيذ...');

  try {
    // 1. Set Leverage (Cross Margin)
    // Wrap in try-catch to ignore if already set
    try {
      await hlExchange({ 
        type: 'updateLeverage', 
        asset: a.idx, 
        isCross: true, 
        leverage: a.lev 
      });
    } catch(e) {}

    // 2. Place Order (IOC Limit)
    // Slippage protection: 2% from mid price
    const limitPrice = fx(p.mid * (isBuy ? 1.02 : 0.98), a.pxDp);
    
    await hlExchange({
      type: 'order',
      orders: [{
        a: a.idx,
        b: isBuy,
        p: limitPrice,
        s: fx(qty, a.szDp),
        r: false,
        t: { limit: { tif: 'Ioc' } }
      }],
      grouping: 'na'
    });

    toast(`✅ تم تنفيذ الصفقة`, 'ok');
    setTimeout(pollAccount, 2000);

  } catch (e) {
    toast(`❌ فشل: ${e.message.slice(0, 60)}`, 'er');
  } finally {
    ul();
    setBtn('bBu', false); setBtn('bSe', false);
    pendTrade = null;
  }
};

window.askClose = async function(i) {
  const p = positions[i];
  if (!p) return;
  const pos = p.position;
  const szi = parseFloat(pos.szi);
  const a = ASSETS[pos.coin.replace('xyz:', '')];
  
  $('clT').textContent = `إغلاق ${a.ar}`;
  $('clB').innerHTML = `
    <div style="text-align:center;margin-bottom:10px">
      <div style="font-size:20px;font-weight:900">${Math.abs(szi)} ${a.unit}</div>
      <div style="color:var(--t2)">${szi>0?'شراء':'بيع'}</div>
    </div>`;
  
  // Close logic: just reverse the trade
  pendTrade = { isBuy: szi < 0, qty: Math.abs(szi), sym: a.coin.replace('xyz:', ''), closeIdx: i };
  om('mCl');
};

window.execClose = async function() {
  if (!pendTrade) return;
  const { qty, sym: s } = pendTrade;
  const a = ASSETS[s];
  const p = PX[s];
  
  cm('mCl');
  ld('جاري الإغلاق...');
  
  try {
    const limitPrice = fx(p.mid * (pendTrade.isBuy ? 1.02 : 0.98), a.pxDp);
    await hlExchange({
      type: 'order',
      orders: [{
        a: a.idx,
        b: pendTrade.isBuy,
        p: limitPrice,
        s: fx(qty, a.szDp),
        r: true, // Reduce only
        t: { limit: { tif: 'Ioc' } }
      }],
      grouping: 'na'
    });
    toast('✅ تم الإغلاق', 'ok');
    setTimeout(pollAccount, 2000);
  } catch (e) {
    toast('❌ فشل الإغلاق: ' + e.message.slice(0, 30), 'er');
  } finally {
    ul();
    pendTrade = null;
  }
};

/* ── AUTH ── */
async function login() {
  let key = $('kI').value.trim();
  if (!key) return;
  if (!key.startsWith('0x')) key = '0x' + key;
  
  setBtn('lBtn', true);
  ld('جاري فك التشفير...');

  try {
    // 1. Init Wallet
    wallet = new ethers.Wallet(key);
    sessionStorage.setItem('hl_k', key);
    
    // 2. UI Switch Immediately (Fix Freeze)
    $('nAd').textContent = wallet.address.slice(0,6) + '...' + wallet.address.slice(-4);
    $('sL').classList.add('off');
    $('sA').classList.remove('off');
    ul(); // Hide loader immediately
    
    // 3. Init Data in Background
    switchSym('GOLD');
    // Don't await, let it run in background
    pollPrices().then(() => pollAccount());
    
    // Start loops
    timers.push(setInterval(pollPrices, 2000));
    timers.push(setInterval(pollAccount, 10000));
    
  } catch (e) {
    ul();
    setBtn('lBtn', false);
    toast('خطأ في المفتاح: ' + e.message.slice(0, 30), 'er');
  }
}

function switchSym(s) {
  sym = s;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.s === s));
  const a = ASSETS[s];
  $('pxSym').textContent = a.ar;
  $('uLb').textContent = a.unit;
  $('psets').innerHTML = a.pre.map((v,i) => 
    `<button class="ps${i===0?' on':''}" onclick="pickQty(${v},this)">${v}</button>`
  ).join('');
  selQty = a.pre[0];
  $('qI').value = selQty;
  updateUI();
}

window.pickQty = function(v, btn) {
  selQty = v;
  $('qI').value = v;
  document.querySelectorAll('.ps').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
};

window.doLogout = function() {
  timers.forEach(clearInterval);
  sessionStorage.clear();
  location.reload();
};

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  $('lBtn').onclick = login;
  $('bBu').onclick = () => askTrade(true);
  $('bSe').onclick = () => askTrade(false);
  $('bBal').onclick = () => alert('الرصيد: ' + (window._BAL?.totalEquity || 0).toFixed(2) + ' $');
  $('bOut').onclick = () => om('mLg');
  
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => switchSym(t.dataset.s));
  
  // Auto Login
  const k = sessionStorage.getItem('hl_k');
  if (k) { $('kI').value = k; login(); }
});
