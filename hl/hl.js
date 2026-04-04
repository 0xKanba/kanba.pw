/* ═══════════════════════════════════════
   HL Trade · app.js (Fixed & Optimized)
════════════════════════════════════════ */

const HL_API  = 'https://api.hyperliquid.xyz';
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

function ld(msg) { 
  $('ldrt').textContent = msg || '...'; 
  $('ldr').classList.add('on'); 
}
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
  const res = await fetch(HL_API + '/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function hlExchange(action) {
  if (!wallet) throw new Error('No Wallet');
  
  // EIP-712 Signing
  const nonce = Date.now();
  const connectionId = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(action) + nonce)
  );
  
  const domain = { name:'Exchange', version:'1', chainId:1337, verifyingContract:'0x0000000000000000000000000000000000000000' };
  const types = { Agent: [{name:'source',type:'string'}, {name:'connectionId',type:'bytes32'}] };
  const value = { source:'a', connectionId };
  
  const sig = await wallet.signTypedData(domain, types, value);
  const { r, s, v } = ethers.Signature.from(sig);

  const res = await fetch(HL_API + '/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature: { r, s, v }, vaultAddress: null }),
  });
  
  const data = await res.json();
  if (data.status === 'ok') return data;
  throw new Error(data.response || 'Exchange Error');
}

/* ── PRICING ── */
async function pollPrices() {
  for (const [s, a] of Object.entries(ASSETS)) {
    try {
      const lb = await hlInfo({ type:'l2Book', coin:a.coin });
      const bid = parseFloat(lb.levels?.[0]?.[0]?.px || 0);
      const ask = parseFloat(lb.levels?.[1]?.[0]?.px || 0);
      const mid = (bid && ask) ? (bid + ask) / 2 : 0;
      PX[s] = { bid, ask, mid };
    } catch (e) { /* silent fail for price polling */ }
  }
  updateUI();
}

function updateUI() {
  const a = ASSETS[sym];
  const p = PX[sym];
  if (!a || !p || !p.mid) return;

  // Price Display
  $('pxVal').textContent = fx(p.mid, a.pxDp);
  $('pxVal').className = 'pxval ' + (p.mid > (PRV[sym]||0) ? 'u' : p.mid < (PRV[sym]||0) ? 'd' : '');
  
  // Buttons Price
  $('bBuP').textContent = fx(p.ask, a.pxDp);
  $('bSeP').textContent = fx(p.bid, a.pxDp);

  PRV[sym] = p.mid;
}

/* ── POSITIONS ── */
async function pollAccount() {
  if (!wallet) return;
  try {
    const st = await hlInfo({ type:'clearinghouseState', user:wallet.address });
    positions = (st.assetPositions || []).filter(p => parseFloat(p.position?.szi || 0) !== 0);
    renderPositions();
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
    const a = ASSETS[coin] || { ar:coin, unit:'', ico:'' };
    
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
  
  $('cfT').textContent = `${isBuy ? 'شراء' : 'بيع'} ${a.ico} ${a.ar}`;
  $('cfB').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:10px">
      <span>الكمية</span><span style="font-family:var(--mono)">${qty} ${a.unit}</span>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:10px">
      <span>السعر التقريبي</span><span style="font-family:var(--mono)">${fx(isBuy ? p.ask : p.bid, a.pxDp)} $</span>
    </div>
    <div style="display:flex;justify-content:space-between">
      <span>الهامش (${a.lev}x)</span><span style="font-family:var(--mono);color:var(--ac)">${((isBuy ? p.ask : p.bid) * qty / a.lev).toFixed(2)} $</span>
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

  cm('mCf'); // Close modal immediately to prevent freeze feeling
  setBtn('bBu', true); setBtn('bSe', true); // Disable buttons
  ld('جاري التنفيذ...');

  try {
    // 1. Set Leverage
    await hlExchange({ type:'updateLeverage', asset:a.idx, isCross:true, leverage:a.lev }).catch(()=>{});
    
    // 2. Place Order
    const price = fx(p.mid * (isBuy ? 1.02 : 0.98), a.pxDp); // 2% slippage protection
    await hlExchange({
      type: 'order',
      orders: [{ a:a.idx, b:isBuy, p:price, s:fx(qty, a.szDp), r:false, t:{ limit:{ tif:'Ioc' } } }],
      grouping: 'na'
    });

    toast(`✅ تم تنفيذ الصفقة`, 'ok');
    setTimeout(pollAccount, 2000);

  } catch (e) {
    toast(`❌ فشل: ${e.message.slice(0, 50)}`, 'er');
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
  
  pendTrade = { isBuy: szi < 0, qty: Math.abs(szi), sym: a.coin.replace('xyz:', ''), closeIdx: i };
  om('mCl');
};

window.execClose = async function() {
  if (!pendTrade) return;
  const { qty, sym: s } = pendTrade;
  const a = ASSETS[s];
  
  cm('mCl');
  ld('جاري الإغلاق...');
  
  try {
    const mid = PX[s]?.mid;
    const price = fx(mid * (pendTrade.isBuy ? 1.02 : 0.98), a.pxDp);
    await hlExchange({
      type: 'order',
      orders: [{ a:a.idx, b:pendTrade.isBuy, p:price, s:fx(qty, a.szDp), r:true, t:{ limit:{ tif:'Ioc' } } }],
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
  ld('جاري التحقق...');
  
  try {
    wallet = new ethers.Wallet(key);
    sessionStorage.setItem('hl_k', key);
    
    $('nAd').textContent = wallet.address.slice(0,6) + '...' + wallet.address.slice(-4);
    $('sL').classList.add('off');
    $('sA').classList.remove('off');
    
    switchSym('GOLD');
    await Promise.all([pollPrices(), pollAccount()]);
    
    timers.push(setInterval(pollPrices, 2000));
    timers.push(setInterval(pollAccount, 10000));
    
  } catch (e) {
    toast('خطأ في المفتاح', 'er');
    ul();
    setBtn('lBtn', false);
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
  // Listeners
  $('lBtn').onclick = login;
  $('bBu').onclick = () => askTrade(true);
  $('bSe').onclick = () => askTrade(false);
  $('bBal').onclick = () => alert('الرصيد: ' + (window._BAL?.totalEquity || 0).toFixed(2) + ' $');
  $('bOut').onclick = () => om('mLg');
  
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => switchSym(t.dataset.s));
  
  // Auto Login
  const k = sessionStorage.getItem('hl_k');
  if (k) { $('kI').value = k; login(); }
  
  // Safety check silent
  window.addEventListener('error', (e) => console.error('Script Error:', e.message));
});
