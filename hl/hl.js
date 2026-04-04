/* ═══════════════════════════════════════════════════
   HL Trade · Professional JavaScript
   Hyperliquid xyz Terminal · Client-side Only
════════════════════════════════════════════════════ */

/* ── CONFIGURATION ── */
const CONFIG = {
  HL_API: 'https://api.hyperliquid.xyz',
  ARB_RPC: 'https://arb1.arbitrum.io/rpc',
  USDC_CA: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  BRDG_CA: '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7',
  USDC_ABI: [
    'function approve(address,uint256) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
  ],
  BRDG_ABI: ['function deposit(address,uint64) external'],
};

const ASSETS = {
  GOLD:   { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:1, unit:'أونصة', presets:[0.1,0.5,1,2,5],   icon:'🟡', name:'ذهب'    },
  SILVER: { coin:'xyz:SILVER', idx:110026, lev:25, cross:true,  szDp:2, pxDp:3, unit:'أونصة', presets:[1,2,3,5,10,20],   icon:'⚪', name:'فضة'    },
  CL:     { coin:'xyz:CL',     idx:110029, lev:20, cross:false, szDp:3, pxDp:2, unit:'برميل', presets:[1,2,3,5,10,20],   icon:'🛢', name:'نفط خام' },
};

/* ── STATE MANAGEMENT ── */
const State = {
  wallet: null,
  asset: 'GOLD',
  qty: 0.1,
  prices: { GOLD:{bid:0,ask:0,mid:0}, SILVER:{bid:0,ask:0,mid:0}, CL:{bid:0,ask:0,mid:0} },
  prevMid: { GOLD:0, SILVER:0, CL:0 },
  positions: [],
  timers: [],
  pendingTrade: null,
  pendingClose: null,
  priceTimer: null,
  balance: null,
};

/* ── DOM HELPERS ── */
const $ = id => document.getElementById(id);
const fmt = (n, d) => (+n).toFixed(d);
const openModal = id => $(id)?.classList.add('open');
const closeModal = id => $(id)?.classList.remove('open');

/* ── TOAST NOTIFICATIONS ── */
function toast(msg, type = 'info', duration = 3500) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.className = '', duration);
}

/* ── LOADER ── */
function showLoader(text = 'جاري...') {
  $('loaderText').textContent = text;
  $('loader').classList.add('active');
}
function hideLoader() {
  $('loader').classList.remove('active');
}

/* ── BUTTON LOADING STATE ── */
function setBtnLoading(btnId, text = '⏳') {
  const btn = $(btnId);
  if (!btn) return;
  btn._originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = text;
}
function resetBtn(btnId) {
  const btn = $(btnId);
  if (!btn) return;
  btn.disabled = false;
  if (btn._originalHTML) btn.innerHTML = btn._originalHTML;
}

/* ── HYPERLIQUID API ── */
async function hlInfo(body) {
  const res = await fetch(CONFIG.HL_API + '/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function hlExchange(action) {
  if (!State.wallet) throw new Error('لا توجد محفظة — سجّل الدخول أولاً');
  if (typeof MessagePack === 'undefined') throw new Error('msgpack غير محمّل');

  const nonce = Date.now();
  const ab = MessagePack.encode(action);
  const nb = new ArrayBuffer(8);
  new DataView(nb).setBigUint64(0, BigInt(nonce), false);
  
  const buf = new Uint8Array(ab.length + 9);
  buf.set(ab);
  buf.set(new Uint8Array(nb), ab.length);
  buf.set([0x00], ab.length + 8);
  
  const connId = ethers.keccak256(buf);
  
  const sig = await State.wallet.signTypedData(
    { name:'Exchange', version:'1', chainId:1337, verifyingContract:'0x0000000000000000000000000000000000000000' },
    { Agent:[{ name:'source', type:'string' }, { name:'connectionId', type:'bytes32' }] },
    { source:'a', connectionId:connId },
  );
  
  const { r, s, v } = ethers.Signature.from(sig);
  
  const res = await fetch(CONFIG.HL_API + '/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature:{ r, s, v }, vaultAddress:null }),
  });
  
  if (!res.ok) throw new Error(`Exchange HTTP ${res.status}`);
  
  const data = await res.json();
  if (data.status !== 'ok') {
    const msg = data.response?.data?.statuses?.[0] || data.response || JSON.stringify(data).slice(0, 250);
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

/* ── PRICE POLLING ── */
async function pollPrices() {
  await Promise.all(Object.keys(ASSETS).map(async sym => {
    try {
      const asset = ASSETS[sym];
      const lb = await hlInfo({ type:'l2Book', coin:asset.coin });
      const bid = parseFloat(lb.levels?.[0]?.[0]?.px || 0);
      const ask = parseFloat(lb.levels?.[1]?.[0]?.px || 0);
      const mid = (bid && ask) ? (bid + ask) / 2 : 0;
      
      State.prices[sym] = { bid, ask, mid };
      
      // Update tab price with flash effect
      const tabPrice = $(`price${sym}`);
      if (tabPrice && mid) {
        const prev = State.prevMid[sym] || 0;
        const dir = mid > prev ? 'up' : mid < prev ? 'dn' : '';
        tabPrice.textContent = fmt(mid, asset.pxDp);
        tabPrice.className = `tab-price${dir ? ' ' + dir : ''}`;
        if (dir) setTimeout(() => tabPrice.className = 'tab-price', 800);
      }
    } catch (e) {
      console.warn(`[price:${sym}]`, e.message);
    }
  }));
  updatePriceDisplay();
}

function updatePriceDisplay() {
  const asset = ASSETS[State.asset];
  const price = State.prices[State.asset];
  if (!price || !price.mid) return;
  
  const prev = State.prevMid[State.asset] || price.mid;
  const dir = price.mid > prev ? 1 : price.mid < prev ? -1 : 0;
  const cls = dir > 0 ? 'up' : dir < 0 ? 'dn' : 'n';
  
  // Price card styling
  const card = $('priceCard');
  if (card) card.className = `price-card${dir > 0 ? ' up' : dir < 0 ? ' dn' : ''}`;
  
  // Update price value
  setText('priceValue', fmt(price.mid, asset.pxDp), `price-value ${cls}`);
  
  // Update button prices
  setTxt('buyPrice', fmt(price.mid, asset.pxDp));
  setTxt('sellPrice', fmt(price.mid, asset.pxDp));
  
  // Update delta
  if (prev && price.mid !== prev) {
    const diff = price.mid - prev;
    const txt = (diff > 0 ? '+' : '') + fmt(diff, asset.pxDp);
    setText('priceDelta', txt, `price-delta ${cls}`);
  }
  
  State.prevMid[State.asset] = price.mid;
  
  // Update timer
  let sec = 1;
  clearInterval(State.priceTimer);
  setTxt('priceTimer', `↻ ${sec}s`);
  State.priceTimer = setInterval(() => {
    sec++;
    setTxt('priceTimer', `↻ ${sec}s`);
  }, 1000);
}

function setText(id, txt, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = txt;
  if (cls) el.className = cls;
}
function setTxt(id, txt) {
  const el = $(id);
  if (el) el.textContent = txt;
}

/* ── ACCOUNT POLLING ── */
async function pollAccount() {
  if (!State.wallet) return;
  try {
    const [perpState, spotState] = await Promise.all([
      hlInfo({ type:'clearinghouseState', user:State.wallet.address, dex:'xyz' }),
      hlInfo({ type:'spotClearinghouseState', user:State.wallet.address }),
    ]);
    
    const ms = perpState.marginSummary || {};
    const perpEquity = parseFloat(ms.accountValue || 0);
    const marginUsed = parseFloat(ms.totalMarginUsed || 0);
    const withdrawable = parseFloat(perpState.withdrawable || 0);
    
    let spotUSDC = 0;
    for (const b of spotState?.balances || []) {
      if (b.coin === 'USDC' || b.coin === 'USDC:0') {
        spotUSDC += parseFloat(b.total || 0);
      }
    }
    
    const totalEquity = perpEquity + spotUSDC;
    const freeMargin = withdrawable + spotUSDC;
    const floatPnl = (perpState.assetPositions || [])
      .reduce((sum, p) => sum + parseFloat(p.position?.unrealizedPnl || 0), 0);
    
    State.positions = (perpState.assetPositions || [])
      .filter(p => parseFloat(p.position?.szi || 0) !== 0);
    
    State.balance = { totalEquity, perpEquity, spotUSDC, marginUsed, withdrawable, freeMargin, floatPnl };
    
    renderPositions();
  } catch (e) {
    console.warn('[pollAccount]', e.message);
  }
}

/* ── ASSET SWITCHING ── */
function switchAsset(sym) {
  State.asset = sym;
  
  // Update tab active state
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.asset === sym);
  });
  
  const asset = ASSETS[sym];
  setTxt('priceAssetName', asset.name);
  setTxt('tradeAssetName', asset.name);
  setTxt('qtyUnit', asset.unit);
  
  renderPresets(asset.presets);
  State.prevMid[sym] = 0;
  updatePriceDisplay();
}

function renderPresets(presets) {
  const container = $('qtyPresets');
  if (!container) return;
  
  container.innerHTML = presets.map((v, i) => 
    `<button class="qty-preset${i === 0 ? ' active' : ''}" data-qty="${v}">${v}</button>`
  ).join('');
  
  State.qty = presets[0];
  $('qtyInput').value = presets[0];
  
  // Add click handlers
  container.querySelectorAll('.qty-preset').forEach(btn => {
    btn.onclick = () => {
      State.qty = parseFloat(btn.dataset.qty);
      $('qtyInput').value = State.qty;
      container.querySelectorAll('.qty-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });
}

/* ── POSITIONS RENDERING ── */
function renderPositions() {
  const countEl = $('positionsCount');
  if (countEl) countEl.textContent = State.positions.length;
  
  const totalEl = $('totalPnl');
  const listEl = $('positionsList');
  
  if (!State.positions.length) {
    listEl.innerHTML = '<div class="positions-empty">📂 لا توجد صفقات مفتوحة</div>';
    if (totalEl) totalEl.textContent = '';
    return;
  }
  
  let totalPnl = 0;
  listEl.innerHTML = State.positions.map((p, idx) => {
    const pos = p.position;
    const szi = parseFloat(pos.szi);
    const pnl = parseFloat(pos.unrealizedPnl || 0);
    totalPnl += pnl;
    
    const coinShort = pos.coin.replace('xyz:', '');
    const asset = ASSETS[coinShort] || { name:coinShort, unit:'', icon:'', pxDp:2, szDp:2 };
    const sideAr = szi > 0 ? 'شراء ↑' : 'بيع ↓';
    const sideCls = szi > 0 ? 'long' : 'short';
    const pnlCls = pnl >= 0 ? 'pos' : 'neg';
    const pnlSign = pnl >= 0 ? '+' : '';
    const entryPx = parseFloat(pos.entryPx || 0);
    const curPx = State.prices[coinShort]?.mid || 0;
    
    return `
      <div class="position-item">
        <div class="pos-info">
          <div class="pos-name">${asset.icon} ${asset.name}</div>
          <div class="pos-meta">
            <span class="${sideCls}">${sideAr}</span>
            &nbsp;|&nbsp; دخول: ${fmt(entryPx, asset.pxDp)}
            &nbsp;|&nbsp; حالي: ${curPx ? fmt(curPx, asset.pxDp) : '—'}
          </div>
          <button class="btn-close" onclick="askClosePosition(${idx})">إغلاق ✕</button>
          <button class="btn-tp" onclick="takeProfit100(${idx})">جني ربح 100% ✓</button>
        </div>
        <div class="pos-actions">
          <div class="pos-pnl ${pnlCls}">${pnlSign}$${fmt(pnl, 2)}</div>
          <div class="pos-size">${Math.abs(szi).toFixed(asset.szDp)} ${asset.unit}</div>
        </div>
      </div>
    `;
  }).join('');
  
  if (totalEl) {
    const sign = totalPnl >= 0 ? '+' : '';
    totalEl.textContent = `${sign}$${fmt(totalPnl, 2)}`;
    totalEl.className = `positions-pnl ${totalPnl >= 0 ? 'pos' : 'neg'}`;
  }
}

/* ── TRADE CONFIRMATION FLOW ── */
function askTrade(isBuy) {
  const qty = parseFloat($('qtyInput').value || State.qty || 0);
  if (!qty || qty <= 0) { toast('أدخل الكمية أولاً', 'err'); return; }
  
  const asset = ASSETS[State.asset];
  const price = State.prices[State.asset];
  if (!price || !price.mid) { toast('لا يوجد سعر — السوق مغلق؟', 'err'); return; }
  
  const midPrice = price.mid;
  const usd = (midPrice * qty).toFixed(2);
  const margin = (midPrice * qty / asset.lev).toFixed(2);
  const liqEst = isBuy 
    ? fmt(midPrice * (1 - 1 / asset.lev), asset.pxDp)
    : fmt(midPrice * (1 + 1 / asset.lev), asset.pxDp);
  const dir = isBuy ? 'شراء ↑' : 'بيع ↓';
  
  setTxt('confirmTitle', `تأكيد — ${asset.icon} ${dir}`);
  setTxt('confirmSubtitle', `${asset.name} · رافعة ${asset.lev}x`);
  
  $('confirmDetails').innerHTML = `
    <div class="confirm-row"><span class="confirm-key">الاتجاه</span><span class="confirm-val ${isBuy?'buy':'sell'}">${dir}</span></div>
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${qty} ${asset.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">السعر</span><span class="confirm-val">${fmt(midPrice, asset.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">القيمة</span><span class="confirm-val">≈ $${usd}</span></div>
    <div class="confirm-row"><span class="confirm-key">الهامش</span><span class="confirm-val warn">≈ $${margin}</span></div>
    <div class="confirm-row"><span class="confirm-key">تصفية تقريبية</span><span class="confirm-val sell">≈ ${liqEst} $</span></div>
  `;
  
  const okBtn = $('confirmExecute');
  okBtn.className = `btn-modal btn-confirm ${isBuy ? 'btn-success' : 'btn-danger'}`;
  okBtn.innerHTML = isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع';
  
  State.pendingTrade = { isBuy, qty, sym:State.asset };
  openModal('modalConfirm');
}

async function execTrade() {
  if (!State.pendingTrade) { closeModal('modalConfirm'); return; }
  
  const { isBuy, qty, sym } = State.pendingTrade;
  const asset = ASSETS[sym];
  const price = State.prices[sym];
  
  if (!price || !price.mid) {
    toast('لا يوجد سعر — السوق مغلق؟', 'err');
    closeModal('modalConfirm');
    return;
  }
  
  setBtnLoading('confirmExecute', '⏳ جاري التنفيذ...');
  showLoader(`${asset.icon} ${isBuy ? 'شراء ↑' : 'بيع ↓'} ${qty} ${asset.unit}`);
  
  try {
    // Set leverage (soft fail)
    try {
      await hlExchange({ type:'updateLeverage', asset:asset.idx, isCross:asset.cross, leverage:asset.lev });
    } catch (e) { console.warn('[setLev]', e.message); }
    
    // Place IOC limit order with 2% slippage
    const limitPx = fmt(price.mid * (isBuy ? 1.02 : 0.98), asset.pxDp);
    const sz = fmt(qty, asset.szDp);
    
    await hlExchange({
      type: 'order',
      orders: [{ a:asset.idx, b:isBuy, p:limitPx, s:sz, r:false, t:{ limit:{ tif:'Ioc' } } }],
      grouping: 'na',
    });
    
    closeModal('modalConfirm');
    toast(`✅ ${isBuy ? 'شراء' : 'بيع'} ${qty} ${asset.unit} ${asset.name} — تم التنفيذ`, 'ok', 5000);
    setTimeout(pollAccount, 2000);
    
  } catch (err) {
    toast(`❌ ${err.message.slice(0, 120)}`, 'err', 6000);
  } finally {
    resetBtn('confirmExecute');
    hideLoader();
  }
}

/* ── CLOSE POSITION FLOW ── */
window.askClosePosition = function(idx) {
  const p = State.positions[idx];
  if (!p) return;
  
  const pos = p.position;
  const szi = parseFloat(pos.szi);
  const coinShort = pos.coin.replace('xyz:', '');
  const asset = ASSETS[coinShort] || { name:coinShort, unit:'', icon:'', pxDp:2 };
  const pnl = parseFloat(pos.unrealizedPnl || 0);
  const pnlSign = pnl >= 0 ? '+' : '';
  const curPx = State.prices[coinShort]?.mid || 0;
  
  setTxt('closeTitle', `إغلاق — ${asset.icon} ${asset.name}`);
  
  $('closeDetails').innerHTML = `
    <div class="confirm-row"><span class="confirm-key">الاتجاه</span><span class="confirm-val">${szi > 0 ? 'شراء ↑' : 'بيع ↓'}</span></div>
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${Math.abs(szi).toFixed(asset.szDp)} ${asset.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">سعر الدخول</span><span class="confirm-val">${fmt(pos.entryPx || 0, asset.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">السعر الحالي</span><span class="confirm-val">${curPx ? fmt(curPx, asset.pxDp) : '—'} $</span></div>
    <div class="confirm-row"><span class="confirm-key">الربح / الخسارة</span><span class="confirm-val ${pnl >= 0 ? 'buy' : 'sell'}">${pnlSign}$${fmt(pnl, 2)}</span></div>
  `;
  
  State.pendingClose = idx;
  openModal('modalClose');
};

async function execClosePosition() {
  if (State.pendingClose === null) { closeModal('modalClose'); return; }
  
  const idx = State.pendingClose;
  const p = State.positions[idx];
  if (!p) { closeModal('modalClose'); return; }
  
  const pos = p.position;
  const szi = parseFloat(pos.szi);
  const coinShort = pos.coin.replace('xyz:', '');
  const asset = ASSETS[coinShort];
  if (!asset) { toast('أصل غير معروف', 'err'); closeModal('modalClose'); return; }
  
  const mid = State.prices[coinShort]?.mid;
  if (!mid) { toast('لا يوجد سعر حالي', 'err'); closeModal('modalClose'); return; }
  
  setBtnLoading('closeExecute', '⏳ جاري الإغلاق...');
  showLoader(`إغلاق ${asset.icon} ${asset.name}...`);
  
  try {
    const isBuy = szi < 0; // Reverse to close
    const sz = fmt(Math.abs(szi), asset.szDp);
    const limitPx = fmt(mid * (isBuy ? 1.02 : 0.98), asset.pxDp);
    
    await hlExchange({
      type: 'order',
      orders: [{ a:asset.idx, b:isBuy, p:limitPx, s:sz, r:true, t:{ limit:{ tif:'Ioc' } } }],
      grouping: 'na',
    });
    
    const pnl = parseFloat(pos.unrealizedPnl || 0);
    const pnlSign = pnl >= 0 ? '+' : '';
    closeModal('modalClose');
    toast(`✅ أُغلقت ${asset.name} | P&L: ${pnlSign}$${fmt(pnl, 2)}`, pnl >= 0 ? 'ok' : 'err', 5000);
    setTimeout(pollAccount, 2000);
    
  } catch (err) {
    toast(`❌ ${err.message.slice(0, 120)}`, 'err', 6000);
  } finally {
    resetBtn('closeExecute');
    hideLoader();
  }
}

/* ── TAKE PROFIT 100% ── */
window.takeProfit100 = async function(idx) {
  const p = State.positions[idx];
  if (!p) { toast('الصفقة غير موجودة', 'err'); return; }
  
  const pos = p.position;
  const szi = parseFloat(pos.szi);
  const coinShort = pos.coin.replace('xyz:', '');
  const asset = ASSETS[coinShort];
  if (!asset) { toast('أصل غير معروف', 'err'); return; }
  
  const mid = State.prices[coinShort]?.mid;
  if (!mid) { toast('لا يوجد سعر', 'err'); return; }
  
  showLoader(`جني ربح ${asset.icon} ${asset.name}...`);
  
  try {
    const isBuy = szi < 0;
    const sz = fmt(Math.abs(szi), asset.szDp);
    const limitPx = fmt(mid * (isBuy ? 1.02 : 0.98), asset.pxDp);
    
    await hlExchange({
      type: 'order',
      orders: [{ a:asset.idx, b:isBuy, p:limitPx, s:sz, r:true, t:{ limit:{ tif:'Ioc' } } }],
      grouping: 'na',
    });
    
    const pnl = parseFloat(pos.unrealizedPnl || 0);
    const pnlSign = pnl >= 0 ? '+' : '';
    toast(`✅ أُغلقت ${asset.name} | الربح: ${pnlSign}$${fmt(pnl, 2)}`, pnl >= 0 ? 'ok' : 'err', 5000);
    setTimeout(pollAccount, 2000);
    
  } catch (err) {
    toast(`❌ ${err.message.slice(0, 120)}`, 'err', 6000);
  } finally {
    hideLoader();
  }
};

/* ── BALANCE MODAL ── */
async function showBalance() {
  openModal('modalBalance');
  $('balanceContent').innerHTML = '<div class="balance-loading">⏳ جاري جلب الرصيد...</div>';
  
  try {
    const [perpState, spotState] = await Promise.all([
      hlInfo({ type:'clearinghouseState', user:State.wallet.address, dex:'xyz' }),
      hlInfo({ type:'spotClearinghouseState', user:State.wallet.address }),
    ]);
    
    const ms = perpState.marginSummary || {};
    const perpEquity = parseFloat(ms.accountValue || 0);
    const marginUsed = parseFloat(ms.totalMarginUsed || 0);
    const withdrawable = parseFloat(perpState.withdrawable || 0);
    
    let spotUSDC = 0;
    for (const b of spotState?.balances || []) {
      if (b.coin === 'USDC' || b.coin === 'USDC:0') {
        spotUSDC += parseFloat(b.total || 0);
      }
    }
    
    const totalEquity = perpEquity + spotUSDC;
    const freeMargin = (perpEquity - marginUsed) + spotUSDC;
    const floatPnl = State.positions.reduce((s, p) => s + parseFloat(p.position?.unrealizedPnl || 0), 0);
    const pnlSign = floatPnl >= 0 ? '+' : '';
    
    $('balanceContent').innerHTML = `
      <div class="balance-grid">
        <div class="balance-item full">
          <div class="balance-label">إجمالي رصيد Hyperliquid</div>
          <div class="balance-value blue">$${fmt(totalEquity, 2)}</div>
          <div class="balance-desc">Perps $${fmt(perpEquity,2)} + Spot $${fmt(spotUSDC,2)}</div>
        </div>
        <div class="balance-item">
          <div class="balance-label">رصيد حر للتداول</div>
          <div class="balance-value green">$${fmt(freeMargin, 2)}</div>
          <div class="balance-desc">متاح فوراً</div>
        </div>
        <div class="balance-item">
          <div class="balance-label">هامش مستخدم</div>
          <div class="balance-value warn">$${fmt(marginUsed, 2)}</div>
          <div class="balance-desc">في صفقات مفتوحة</div>
        </div>
        <div class="balance-item">
          <div class="balance-label">قابل للسحب</div>
          <div class="balance-value green">$${fmt(withdrawable, 2)}</div>
        </div>
        <div class="balance-item">
          <div class="balance-label">ربح / خسارة عائم</div>
          <div class="balance-value ${floatPnl >= 0 ? 'green' : 'red'}">${pnlSign}$${fmt(floatPnl, 2)}</div>
          <div class="balance-desc">${State.positions.length} صفقة مفتوحة</div>
        </div>
      </div>
      <button class="btn-refresh" onclick="showBalance()">🔄 تحديث الرصيد</button>
    `;
    
  } catch (err) {
    $('balanceContent').innerHTML = `<div class="balance-loading" style="color:var(--dn)">❌ ${err.message.slice(0, 180)}</div>`;
  }
}

/* ── DEPOSIT ── */
async function doDeposit() {
  const amt = parseFloat($('depositAmount').value || 0);
  if (!amt || amt <= 0) { toast('أدخل المبلغ', 'err'); return; }
  
  setBtnLoading('depositExecute', '⏳');
  showLoader('موافقة USDC على Arbitrum...');
  
  try {
    const provider = new ethers.JsonRpcProvider(CONFIG.ARB_RPC);
    const wallet = new ethers.Wallet(State.wallet.privateKey, provider);
    const usdc = new ethers.Contract(CONFIG.USDC_CA, CONFIG.USDC_ABI, wallet);
    const bridge = new ethers.Contract(CONFIG.BRDG_CA, CONFIG.BRDG_ABI, wallet);
    
    const raw = ethers.parseUnits(amt.toString(), 6);
    const bal = await usdc.balanceOf(wallet.address);
    if (bal < raw) throw new Error(`رصيد USDC غير كافٍ: ${ethers.formatUnits(bal, 6)}`);
    
    const approveTx = await usdc.approve(CONFIG.BRDG_CA, raw);
    await approveTx.wait();
    
    showLoader('إرسال للجسر...');
    const depositTx = await bridge.deposit(wallet.address, raw);
    const receipt = await depositTx.wait();
    
    closeModal('modalDeposit');
    toast(`✅ إيداع ناجح! ${amt} USDC · ${receipt.hash.slice(0, 10)}...`, 'ok', 6000);
    setTimeout(pollAccount, 7000);
    
  } catch (err) {
    toast(`❌ ${err.message.slice(0, 120)}`, 'err', 5000);
  } finally {
    resetBtn('depositExecute');
    hideLoader();
  }
}

/* ── WITHDRAW ── */
async function doWithdraw() {
  const amt = parseFloat($('withdrawAmount').value || 0);
  const dest = $('withdrawAddress').value.trim();
  
  if (!amt || amt <= 0) { toast('أدخل المبلغ', 'err'); return; }
  if (!/^0x[0-9a-fA-F]{40}$/.test(dest)) { toast('عنوان Arbitrum غير صحيح', 'err'); return; }
  
  setBtnLoading('withdrawExecute', '⏳');
  showLoader('توقيع طلب السحب...');
  
  try {
    const nonce = Date.now();
    const to = dest.toLowerCase();
    const action = {
      type:'withdraw3', hyperliquidChain:'Mainnet',
      signatureChainId:'0xa4b1',
      destination:to, amount:amt.toFixed(2), time:nonce,
    };
    
    const sig = await State.wallet.signTypedData(
      { name:'HyperliquidSignTransaction', version:'1', chainId:42161, verifyingContract:'0x0000000000000000000000000000000000000000' },
      { 'HyperliquidTransaction:Withdraw':[
          { name:'hyperliquidChain', type:'string' },
          { name:'destination', type:'string' },
          { name:'amount', type:'string' },
          { name:'time', type:'uint64' },
        ] },
      { hyperliquidChain:'Mainnet', destination:to, amount:action.amount, time:nonce },
    );
    
    const { r, s, v } = ethers.Signature.from(sig);
    const res = await fetch(CONFIG.HL_API + '/exchange', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ action, nonce, signature:{ r, s, v } }),
    });
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(JSON.stringify(data));
    
    closeModal('modalWithdraw');
    toast(`✅ طلب السحب ${amt} USDC — قيد المعالجة`, 'ok', 5000);
    setTimeout(pollAccount, 5000);
    
  } catch (err) {
    toast(`❌ ${err.message.slice(0, 120)}`, 'err', 5000);
  } finally {
    resetBtn('withdrawExecute');
    hideLoader();
  }
}

/* ── LOGIN / LOGOUT ── */
async function login() {
  let key = $('privateKey').value.trim();
  if (!key) { toast('أدخل المفتاح الخاص', 'err'); return; }
  if (!key.startsWith('0x')) key = '0x' + key;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    toast('المفتاح يجب أن يكون 64 حرف hex', 'err');
    return;
  }
  
  setBtnLoading('loginBtn', '⏳ التحقق...');
  showLoader('التحقق من المحفظة...');
  
  try {
    State.wallet = new ethers.Wallet(key);
    sessionStorage.setItem('hl_wallet_key', key);
    
    const addr = State.wallet.address;
    setTxt('navAddress', addr.slice(0, 6) + '...' + addr.slice(-4));
    $('withdrawAddress').value = addr;
    
    // Switch screens
    $('loginScreen').classList.add('hidden');
    $('appScreen').classList.remove('hidden');
    
    // Initialize
    switchAsset('GOLD');
    showLoader('جلب الأسعار والمراكز...');
    await Promise.all([pollPrices(), pollAccount()]);
    
    hideLoader();
    toast('مرحباً · ' + addr.slice(0, 6) + '...', 'ok');
    
    // Start polling
    State.timers.push(setInterval(pollPrices, 1000));
    State.timers.push(setInterval(pollAccount, 8000));
    
  } catch (err) {
    hideLoader();
    State.wallet = null;
    sessionStorage.removeItem('hl_wallet_key');
    toast('خطأ: ' + err.message.slice(0, 100), 'err', 5000);
  } finally {
    resetBtn('loginBtn');
  }
}

function askLogout() {
  openModal('modalLogout');
}

function doLogout() {
  State.timers.forEach(clearInterval);
  State.timers = [];
  clearInterval(State.priceTimer);
  sessionStorage.removeItem('hl_wallet_key');
  State.wallet = null;
  State.positions = [];
  State.prices = { GOLD:{bid:0,ask:0,mid:0}, SILVER:{bid:0,ask:0,mid:0}, CL:{bid:0,ask:0,mid:0} };
  State.prevMid = { GOLD:0, SILVER:0, CL:0 };
  
  closeModal('modalLogout');
  $('appScreen').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('privateKey').value = '';
  toast('تم تسجيل الخروج بأمان', 'info');
}

/* ── EVENT LISTENERS ── */
document.addEventListener('DOMContentLoaded', () => {
  // Login
  $('loginBtn').addEventListener('click', login);
  $('privateKey').addEventListener('keydown', e => e.key === 'Enter' && login());
  $('toggleKey').addEventListener('click', () => {
    const inp = $('privateKey');
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    $('toggleKey').textContent = show ? '🙈' : '👁';
  });
  
  // Asset tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchAsset(tab.dataset.asset));
  });
  
  // Trade buttons
  $('btnBuy').addEventListener('click', () => {
    if (!State.wallet) { toast('سجّل الدخول أولاً', 'err'); return; }
    askTrade(true);
  });
  $('btnSell').addEventListener('click', () => {
    if (!State.wallet) { toast('سجّل الدخول أولاً', 'err'); return; }
    askTrade(false);
  });
  
  // Quantity input
  $('qtyInput').addEventListener('input', function() {
    State.qty = parseFloat(this.value) || 0;
    document.querySelectorAll('.qty-preset').forEach(b => b.classList.remove('active'));
  });
  
  // 100% button
  $('qty100').addEventListener('click', () => {
    if (!State.wallet) { toast('سجّل الدخول أولاً', 'err'); return; }
    const asset = ASSETS[State.asset];
    const bal = State.balance?.freeMargin || 0;
    if (!bal || bal <= 0) { toast('لا يوجد رصيد حر', 'err'); return; }
    const price = State.prices[State.asset]?.mid;
    if (!price) { toast('لا يوجد سعر', 'err'); return; }
    const maxQty = (bal * asset.lev) / price;
    State.qty = parseFloat(fmt(maxQty, asset.szDp));
    $('qtyInput').value = State.qty;
    document.querySelectorAll('.qty-preset').forEach(b => b.classList.remove('active'));
    toast(`✅ الكمية: ${State.qty} ${asset.unit}`, 'ok', 2000);
  });
  
  // Bottom bar
  $('btnBalance').addEventListener('click', () => State.wallet && showBalance());
  $('btnDeposit').addEventListener('click', () => State.wallet && openModal('modalDeposit'));
  $('btnWithdraw').addEventListener('click', () => State.wallet && openModal('modalWithdraw'));
  $('btnLogout').addEventListener('click', () => State.wallet && askLogout());
  
  // Modal buttons
  $('confirmCancel').addEventListener('click', () => { closeModal('modalConfirm'); State.pendingTrade = null; });
  $('confirmExecute').addEventListener('click', execTrade);
  $('closeCancel').addEventListener('click', () => { closeModal('modalClose'); State.pendingClose = null; });
  $('closeExecute').addEventListener('click', execClosePosition);
  $('balanceClose').addEventListener('click', () => closeModal('modalBalance'));
  $('depositCancel').addEventListener('click', () => closeModal('modalDeposit'));
  $('depositExecute').addEventListener('click', doDeposit);
  $('withdrawCancel').addEventListener('click', () => closeModal('modalWithdraw'));
  $('withdrawExecute').addEventListener('click', doWithdraw);
  $('logoutCancel').addEventListener('click', () => closeModal('modalLogout'));
  $('logoutExecute').addEventListener('click', doLogout);
  
  // Address copy
  $('navAddress').addEventListener('click', () => {
    if (State.wallet) {
      navigator.clipboard?.writeText(State.wallet.address)
        .then(() => toast('تم نسخ العنوان', 'info', 2000))
        .catch(() => {});
    }
  });
  
  // Close modals on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
  
  // Auto-login from session
  const savedKey = sessionStorage.getItem('hl_wallet_key');
  if (savedKey) {
    $('privateKey').value = savedKey;
    login();
  }
});

// Expose functions for inline onclick handlers
window.askClosePosition = askClosePosition;
window.takeProfit100 = takeProfit100;
window.showBalance = showBalance;
