/* ═══════════════════════════════════════
   HL Trade · app.js (Web Version)
════════════════════════════════════════ */

const HL_API = 'https://api.hyperliquid.xyz';

const ASSETS = {
  GOLD:   { coin: 'xyz:GOLD',   idx: 110003, lev: 25, isCross: true, szDp: 4, pxDp: 1, unit: 'أونصة', pre: [0.1, 0.5, 1, 2, 5], ico: '🟡', ar: 'ذهب' },
  SILVER: { coin: 'xyz:SILVER', idx: 110026, lev: 25, isCross: true, szDp: 2, pxDp: 3, unit: 'أونصة', pre: [1, 2, 5, 10],      ico: '⚪', ar: 'فضة' },
  CL:     { coin: 'xyz:CL',     idx: 110029, lev: 20, isCross: false, szDp: 3, pxDp: 2, unit: 'برميل', pre: [1, 2, 5, 10],      ico: '🛢', ar: 'نفط' },
};

let wallet = null, sym = 'GOLD', selQty = 0.1;
let PX = {}, positions = [], pend = null;
let prevMid = 0;

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
    const res = await fetch(`${HL_API}/info`, {
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

// ═══ LOGIC FROM WORKER.JS (100% Working Logic) ═══
async function hlExchange(action) {
  if (!wallet) throw new Error('No Wallet');
  if (!window.MessagePack || !window.ethers) throw new Error('Libs missing');

  const nonce = Date.now();
  const ab = MessagePack.encode(action); // Uint8Array

  // Construct ConnectionId
  const nb = new ArrayBuffer(8);
  new DataView(nb).setBigUint64(0, BigInt(nonce), false);
  const combined = new Uint8Array(ab.length + 9);
  combined.set(ab, 0);
  combined.set(new Uint8Array(nb), ab.length);
  combined.set([0x00], ab.length + 8);
  const connId = ethers.keccak256(combined);

  // EIP-712 Signature
  const sig = await wallet.signTypedData(
    { name: "Exchange", version: "1", chainId: 1337, verifyingContract: "0x0000000000000000000000000000000000000000" },
    { Agent: [{ name: "source", type: "string" }, { name: "connectionId", type: "bytes32" }] },
    { source: "a", connectionId: connId }
  );
  const { r, s, v } = ethers.Signature.from(sig);

  const res = await fetch(`${HL_API}/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature: { r, s, v }, vaultAddress: null }),
  });
  const data = await res.json();
  if (data.status !== "ok") {
    const errMsg = data.response?.data?.statuses?.[0] || data.response || JSON.stringify(data);
    throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
  }
  return data;
}

/* ── DATA SYNC ── */
async function poll() {
  if (!wallet) return;
  // Prices
  for (const [s, a] of Object.entries(ASSETS)) {
    try {
      const lb = await hlInfo({ type: 'l2Book', coin: a.coin });
      const bid = parseFloat(lb.levels?.[0]?.[0]?.px || 0);
      const ask = parseFloat(lb.levels?.[1]?.[0]?.px || 0);
      PX[s] = { bid, ask, mid: (bid + ask) / 2 };
    } catch (e) {}
  }
  updatePriceUI();

  // Account
  try {
    const st = await hlInfo({ type: 'clearinghouseState', user: wallet.address });
    if (st && st.assetPositions) {
      positions = st.assetPositions.filter(p => parseFloat(p.position?.szi || 0) !== 0);
      renderPositions();
    }
  } catch (e) {}
}

function updatePriceUI() {
  const a = ASSETS[sym];
  const p = PX[sym];
  if (!a || !p || !p.mid) return;

  const val = $('pxVal');
  val.textContent = fx(p.mid, a.pxDp);
  
  // Flash effect
  if (prevMid && p.mid !== prevMid) {
    val.className = 'pxval ' + (p.mid > prevMid ? 'u' : 'd');
    setTimeout(() => val.className = 'pxval', 300);
  }
  prevMid = p.mid;

  $('bBuP').textContent = fx(p.ask, a.pxDp);
  $('bSeP').textContent = fx(p.bid, a.pxDp);
}

/* ── LOGIN (Instant UI Fix) ── */
async function login() {
  let key = $('kI').value.trim();
  if (!key) { toast('أدخل المفتاح', 'er'); return; }
  if (!key.startsWith('0x')) key = '0x' + key;

  setBtn('lBtn', true);
  try {
    // 1. Setup Wallet
    wallet = new ethers.Wallet(key);
    sessionStorage.setItem('hl_k', key);

    // 2. Switch UI IMMEDIATELY (Fix Freeze)
    $('nAd').textContent = wallet.address.slice(0, 6) + '...' + wallet.address.slice(-4);
    $('sL').classList.add('off');
    $('sA').classList.remove('off');
    setBtn('lBtn', false); // Reset button state visually
    
    // 3. Init Data
    switchSym('GOLD');
    toast('مرحباً!', 'ok');
    
    // Start Background Polling
    await poll(); // First load
    setInterval(poll, 2000); // Loop

  } catch (e) {
    setBtn('lBtn', false);
    toast('خطأ: ' + e.message.slice(0, 30), 'er');
  }
}

/* ── POSITIONS ── */
function renderPositions() {
  const list = $('pList');
  if (!positions.length) {
    list.innerHTML = '<div class="posmt">📂 لا توجد صفقات مفتوحة</div>';
    $('pTot').textContent = '';
    return;
  }

  let total = 0;
  list.innerHTML = positions.map((p, i) => {
    const pos = p.position;
    const szi = parseFloat(pos.szi);
    const pnl = parseFloat(pos.unrealizedPnl || 0);
    total += pnl;
    const coin = pos.coin.replace('xyz:', '');
    const a = ASSETS[coin] || { ar: coin, unit: '', ico: '📊' };
    
    return `<div class="posit">
      <div>
        <div style="font-weight:700">${a.ico} ${a.ar} <span style="font-size:11px;color:var(--t2)">${szi>0?'شراء':'بيع'}</span></div>
        <div style="font-size:12px;color:var(--t2)">${Math.abs(szi).toFixed(a.szDp||2)} ${a.unit}</div>
      </div>
      <div style="text-align:left">
        <div class="pip ${pnl>=0?'po':'ne'}">${pnl>=0?'+':''}$${fx(pnl,2)}</div>
        <button class="bclr" onclick="askClose(${i})">إغلاق</button>
      </div>
    </div>`;
  }).join('');
  
  $('pTot').textContent = (total>=0?'+':'') + '$' + fx(total,2);
  $('pTot').style.color = total >= 0 ? 'var(--up)' : 'var(--dn)';
}

/* ── TRADE ── */
function switchSym(s) {
  sym = s;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.s === s));
  const a = ASSETS[s];
  $('pxSym').textContent = a.ar;
  $('uLb').textContent = a.unit;
  $('psets').innerHTML = a.pre.map((v, i) => `<button class="ps${i===0?' on':''}" onclick="pickQty(${v},this)">${v}</button>`).join('');
  selQty = a.pre[0];
  $('qI').value = selQty;
  updatePriceUI();
}

window.pickQty = function(v, btn) {
  selQty = v;
  $('qI').value = v;
  document.querySelectorAll('.ps').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
};

function askTrade(isBuy) {
  if (!wallet) { toast('سجل الدخول أولاً', 'er'); return; }
  const qty = parseFloat($('qI').value || 0);
  if (!qty) { toast('أدخل الكمية', 'er'); return; }
  
  const a = ASSETS[sym];
  const p = PX[sym];
  if(!p || !p.mid) { toast('لا يوجد سعر', 'er'); return; }

  const price = isBuy ? p.ask : p.bid;
  const usd = (qty * price).toFixed(2);
  const margin = (qty * price / a.lev).toFixed(2);
  const liq = isBuy ? (price * (1 - 0.9/a.lev)).toFixed(a.pxDp) : (price * (1 + 0.9/a.lev)).toFixed(a.pxDp);

  $('cfT').textContent = `${isBuy ? 'شراء' : 'بيع'} ${a.ico} ${a.ar}`;
  $('cfB').innerHTML = `
    <div class="cr"><span>الاتجاه</span><span class="cv" style="color:${isBuy?'var(--up)':'var(--dn)'}">${isBuy?'شراء':'بيع'}</span></div>
    <div class="cr"><span>الكمية</span><span class="cv">${qty} ${a.unit}</span></div>
    <div class="cr"><span>السعر</span><span class="cv">$${fx(price, a.pxDp)}</span></div>
    <div class="cr"><span>الهامش (${a.lev}x)</span><span class="cv">$${margin}</span></div>
    <div class="cr"><span>تصفية ≈</span><span class="cv" style="color:var(--dn)">$${liq}</span></div>
  `;
  $('cfOk').className = 'sok ' + (isBuy ? 'bok' : 'wok');
  pend = { isBuy, qty, sym };
  om('mCf');
}

window.execTrade = async function() {
  if (!pend) return;
  const { isBuy, qty, sym: s } = pend;
  const a = ASSETS[s];
  const p = PX[s];
  
  cm('mCf');
  setBtn('bBu', true); setBtn('bSe', true);
  ld('جاري التنفيذ...');

  try {
    // 1. Set Leverage
    try {
      await hlExchange({ type: 'updateLeverage', asset: a.idx, isCross: a.isCross, leverage: a.lev });
    } catch (e) { console.warn("Lev set failed (might be already set)"); }

    // 2. Place Order (IOC Limit)
    const limitPx = fx(p.mid * (isBuy ? 1.02 : 0.98), a.pxDp);
    const sz = fx(qty, a.szDp);

    await hlExchange({
      type: 'order',
      orders: [{ a: a.idx, b: isBuy, p: limitPx, s: sz, r: false, t: { limit: { tif: 'Ioc' } } }],
      grouping: 'na'
    });

    toast('✅ تم فتح الصفقة', 'ok');
    setTimeout(poll, 1000);

  } catch (e) {
    toast('❌ ' + e.message.slice(0, 50), 'er');
  } finally {
    ul();
    setBtn('bBu', false); setBtn('bSe', false);
    pend = null;
  }
};

window.askClose = async function(i) {
  const pos = positions[i]?.position;
  if (!pos) return;
  const szi = parseFloat(pos.szi);
  const coin = pos.coin.replace('xyz:', '');
  const a = ASSETS[coin];
  
  $('clT').textContent = `إغلاق ${a.ar}`;
  $('clB').innerHTML = `
    <div style="text-align:center">
      <div style="font-size:20px;font-weight:700">${Math.abs(szi).toFixed(a.szDp||2)} ${a.unit}</div>
      <div style="color:var(--t2)">${szi>0?'شراء':'بيع'}</div>
    </div>`;
  
  pend = { isBuy: szi < 0, qty: Math.abs(szi), sym: coin, close: true };
  om('mCl');
};

window.execClose = async function() {
  if (!pend) return;
  const { isBuy, qty, sym: s } = pend;
  const a = ASSETS[s];
  const p = PX[s];
  
  cm('mCl');
  ld('إغلاق...');
  
  try {
    const limitPx = fx(p.mid * (isBuy ? 1.02 : 0.98), a.pxDp);
    await hlExchange({
      type: 'order',
      orders: [{ a: a.idx, b: isBuy, p: limitPx, s: fx(qty, a.szDp), r: true, t: { limit: { tif: 'Ioc' } } }],
      grouping: 'na'
    });
    toast('✅ تم الإغلاق', 'ok');
    setTimeout(poll, 1000);
  } catch (e) {
    toast('❌ فشل الإغلاق', 'er');
  } finally {
    ul();
    pend = null;
  }
};

/* ── BALANCE ── */
 $('bBal').onclick = async () => {
  om('mBl');
  $('blC').innerHTML = '⏳ جاري التحميل...';
  try {
    const st = await hlInfo({ type: 'clearinghouseState', user: wallet.address });
    const val = parseFloat(st.marginSummary?.accountValue || 0);
    $('blC').innerHTML = `
      <div style="text-align:center">
        <div style="font-size:12px;color:var(--t2)">القيمة الإجمالية</div>
        <div style="font-size:28px;font-weight:700;color:var(--ac)">$${fx(val, 2)}</div>
      </div>
    `;
  } catch (e) {
    $('blC').innerHTML = '❌ خطأ في التحميل';
  }
};

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  $('lBtn').onclick = login;
  $('bBu').onclick = () => askTrade(true);
  $('bSe').onclick = () => askTrade(false);
  $('bOut').onclick = () => { sessionStorage.clear(); location.reload(); };
  $('nAd').onclick = () => {
    if(wallet) {
      navigator.clipboard.writeText(wallet.address);
      toast('تم النسخ', 'ok', 1000);
    }
  };

  document.querySelectorAll('.tab').forEach(t => t.onclick = () => switchSym(t.dataset.s));

  // Auto Login
  const k = sessionStorage.getItem('hl_k');
  if (k) { $('kI').value = k; login(); }
});
