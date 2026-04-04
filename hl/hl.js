/* ═══════════════════════════════════════════════════
   HL Trade · Professional Web Terminal (FINAL)
   ✅ يستخدم MsgPack المدمج في HTML — لا يعتمد على CDN
   ✅ توقيع EIP-712 مطابق للوثائق الرسمية
════════════════════════════════════════════════════ */

// ── إعدادات النظام ──
const HL_API = 'https://api.hyperliquid.xyz';
const ARB_RPC = 'https://arb1.arbitrum.io/rpc';
const ASSETS = {
  GOLD:   { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:1, unit:'أونصة', presets:[0.1,0.5,1,2,5],   icon:'🟡', name:'ذهب'    },
  SILVER: { coin:'xyz:SILVER', idx:110026, lev:25, cross:true,  szDp:2, pxDp:3, unit:'أونصة', presets:[1,2,3,5,10,20],   icon:'⚪', name:'فضة'    },
  CL:     { coin:'xyz:CL',     idx:110029, lev:20, cross:false, szDp:3, pxDp:2, unit:'برميل', presets:[1,2,3,5,10,20],   icon:'🛢', name:'نفط خام' }
};

// ── حالة التطبيق ──
const State = {
  wallet: null, asset: 'GOLD', qty: 0.1,
  prices: { GOLD:{bid:0,ask:0,mid:0}, SILVER:{bid:0,ask:0,mid:0}, CL:{bid:0,ask:0,mid:0} },
  prevMid: { GOLD:0, SILVER:0, CL:0 }, positions: [], timers: [],
  pendingTrade: null, pendingClose: null, balance: null, priceTimer: null
};

// ── أدوات الواجهة ──
const $ = id => document.getElementById(id);
const fmt = (n, d) => (+n).toFixed(d);
const openModal = id => $(id)?.classList.add('open');
const closeModal = id => $(id)?.classList.remove('open');

function toast(msg, type='info', dur=3500) {
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.className = `show ${type}`;
  clearTimeout(el._t); el._t = setTimeout(() => el.className = '', dur);
}
function showLoader(t='جاري...') { $('loaderText').textContent = t; $('loader').classList.add('active'); }
function hideLoader() { $('loader').classList.remove('active'); }
function setBtnLoading(id, txt='⏳') { const b=$(id); if(!b)return; b._orig=b.innerHTML; b.disabled=true; b.innerHTML=txt; }
function resetBtn(id) { const b=$(id); if(!b)return; b.disabled=false; if(b._orig) b.innerHTML=b._orig; }
function setTxt(id, t) { const e=$(id); if(e) e.textContent=t; }
function setText(id, t, c) { const e=$(id); if(!e)return; e.textContent=t; if(c) e.className=c; }

// ═══════════════════════════════════════
// 🔐 Hyperliquid API — مطابق للوثائق الرسمية
// ═══════════════════════════════════════

async function hlInfo(body) {
  const res = await fetch(HL_API+'/info', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function hlExchange(action) {
  if (!State.wallet) throw new Error('لا توجد محفظة — سجّل الدخول أولاً');
  
  // ✅ استخدام المشفر المدمج (لا يعتمد على أي مكتبة خارجية)
  const MP = window.MessagePack || MsgPack;
  if (!MP || typeof MP.encode !== 'function') {
    console.error('[HL] ❌ MsgPack غير متاح');
    throw new Error('خطأ داخلي: مشفر MessagePack غير محمّل');
  }
  
  const nonce = Date.now();
  
  // ✅ ترميز صحيح
  let encoded;
  try {
    encoded = MP.encode(action);
  } catch (e) {
    console.error('[HL] ❌ فشل الترميز:', e, action);
    throw new Error('فشل ترميز الأمر: ' + e.message);
  }
  
  // ✅ بناء payload: [msgpack][nonce 8-byte big-endian][0x00]
  const nb = new ArrayBuffer(8);
  new DataView(nb).setBigUint64(0, BigInt(nonce), false); // big-endian ✓
  
  const payload = new Uint8Array(encoded.length + 9);
  payload.set(encoded, 0);
  payload.set(new Uint8Array(nb), encoded.length);
  payload[encoded.length + 8] = 0x00; // terminator ✓
  
  // ✅ حساب connectionId
  const connId = ethers.keccak256(payload);
  
  // ✅ توقيع EIP-712
  let sig;
  try {
    sig = await State.wallet.signTypedData(
      { name:'Exchange', version:'1', chainId:1337, verifyingContract:'0x0000000000000000000000000000000000000000' },
      { Agent:[{name:'source',type:'string'},{name:'connectionId',type:'bytes32'}] },
      { source:'a', connectionId:connId }
    );
  } catch (e) {
    console.error('[HL] ❌ فشل التوقيع:', e);
    throw new Error('فشل التوقيع: ' + e.message.slice(0,100));
  }
  
  const {r,s,v} = ethers.Signature.from(sig);
  
  // ✅ إرسال الطلب
  const res = await fetch(HL_API+'/exchange', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action, nonce, signature:{r,s,v}, vaultAddress:null })
  });
  
  const data = await res.json();
  if (data.status !== 'ok') {
    const err = data.response?.data?.statuses?.[0] || data.response || JSON.stringify(data).slice(0,200);
    console.error('[HL] ❌ خطأ من الخادم:', err);
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
  return data;
}

// ── تحديث الأسعار ──
async function pollPrices() {
  await Promise.all(Object.keys(ASSETS).map(async sym => {
    try {
      const a = ASSETS[sym];
      const lb = await hlInfo({type:'l2Book', coin:a.coin});
      const bid = parseFloat(lb.levels?.[0]?.[0]?.px || 0);
      const ask = parseFloat(lb.levels?.[1]?.[0]?.px || 0);
      const mid = (bid && ask) ? (bid+ask)/2 : 0;
      State.prices[sym] = {bid, ask, mid};
      
      const el = $(`price${sym}`);
      if (el && mid) {
        const dir = mid > State.prevMid[sym] ? 'up' : mid < State.prevMid[sym] ? 'dn' : '';
        el.textContent = fmt(mid, a.pxDp);
        el.className = `tab-price${dir?' '+dir:''}`;
        if(dir) setTimeout(()=>el.className='tab-price', 800);
      }
    } catch{}
  }));
  updatePriceUI();
}

function updatePriceUI() {
  const a = ASSETS[State.asset], p = State.prices[State.asset];
  if (!p || !p.mid) return;
  const dir = p.mid > State.prevMid[State.asset] ? 1 : p.mid < State.prevMid[State.asset] ? -1 : 0;
  const cls = dir > 0 ? 'up' : dir < 0 ? 'dn' : 'n';
  
  $('priceCard').className = `price-card${dir>0?' up':dir<0?' dn':''}`;
  setText('priceValue', fmt(p.mid, a.pxDp), `price-value ${cls}`);
  setTxt('buyPrice', fmt(p.mid, a.pxDp));
  setTxt('sellPrice', fmt(p.mid, a.pxDp));
  
  if (State.prevMid[State.asset] && p.mid !== State.prevMid[State.asset]) {
    const diff = p.mid - State.prevMid[State.asset];
    setText('priceDelta', (diff>0?'+':'')+fmt(diff, a.pxDp), `price-delta ${cls}`);
  }
  State.prevMid[State.asset] = p.mid;
  
  let s=1; clearInterval(State.priceTimer);
  setTxt('priceTimer', `↻ ${s}s`);
  State.priceTimer = setInterval(()=>{ s++; setTxt('priceTimer', `↻ ${s}s`); }, 1000);
}

// ── تحديث الحساب ──
async function pollAccount() {
  if (!State.wallet) return;
  try {
    const [perp, spot] = await Promise.all([
      hlInfo({type:'clearinghouseState', user:State.wallet.address, dex:'xyz'}),
      hlInfo({type:'spotClearinghouseState', user:State.wallet.address})
    ]);
    const ms = perp.marginSummary||{};
    const perpVal = parseFloat(ms.accountValue||0);
    const marginUsed = parseFloat(ms.totalMarginUsed||0);
    const withdrawable = parseFloat(perp.withdrawable||0);
    let spotUSDC = 0;
    for (const b of spot?.balances||[]) if(b.coin==='USDC'||b.coin==='USDC:0') spotUSDC += parseFloat(b.total||0);
    
    State.balance = {
      total: perpVal + spotUSDC,
      free: withdrawable + spotUSDC,
      margin: marginUsed,
      floatPnl: (perp.assetPositions||[]).reduce((s,p)=>s+parseFloat(p.position?.unrealizedPnl||0),0)
    };
    State.positions = (perp.assetPositions||[]).filter(p=>parseFloat(p.position?.szi||0)!==0);
    renderPositions();
  } catch(e){ console.warn('[account]', e.message); }
}

// ── إدارة الواجهة ──
function switchAsset(sym) {
  State.asset = sym;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.asset===sym));
  const a = ASSETS[sym];
  setTxt('priceAssetName', a.name); setTxt('tradeAssetName', a.name); setTxt('qtyUnit', a.unit);
  renderPresets(a.presets); State.prevMid[sym]=0; updatePriceUI();
}

function renderPresets(arr) {
  $('qtyPresets').innerHTML = arr.map((v,i)=>`<button class="qty-preset${i===0?' active':''}" data-v="${v}">${v}</button>`).join('');
  State.qty = arr[0]; $('qtyInput').value = arr[0];
  $('qtyPresets').onclick = e => {
    if (!e.target.classList.contains('qty-preset')) return;
    State.qty = parseFloat(e.target.dataset.v); $('qtyInput').value = State.qty;
    $('qtyPresets').querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active'));
    e.target.classList.add('active');
  };
}

function renderPositions() {
  $('positionsCount').textContent = State.positions.length;
  const list = $('positionsList');
  if (!State.positions.length) { list.innerHTML = '<div class="positions-empty">📂 لا توجد صفقات مفتوحة</div>'; $('totalPnl').textContent=''; return; }
  
  let total = 0;
  list.innerHTML = State.positions.map((p,i)=>{
    const pos = p.position, szi = parseFloat(pos.szi), pnl = parseFloat(pos.unrealizedPnl||0);
    total += pnl;
    const coin = pos.coin.replace('xyz:',''), a = ASSETS[coin]||{name:coin,unit:'',icon:'',pxDp:2,szDp:2};
    const dir = szi>0?'شراء ↑':'بيع ↓', cls = szi>0?'long':'short', pCls = pnl>=0?'pos':'neg', sign = pnl>=0?'+':'';
    return `<div class="position-item">
      <div class="pos-info"><div class="pos-name">${a.icon} ${a.name}</div>
      <div class="pos-meta"><span class="${cls}">${dir}</span> | دخول: ${fmt(pos.entryPx||0, a.pxDp)} | حالي: ${State.prices[coin]?.mid?fmt(State.prices[coin].mid, a.pxDp):'—'}</div>
      <button class="btn-close" onclick="askClose(${i})">إغلاق ✕</button>
      <button class="btn-tp" onclick="tp100(${i})">جني ربح 100% ✓</button></div>
      <div class="pos-actions"><div class="pos-pnl ${pCls}">${sign}$${fmt(pnl,2)}</div><div class="pos-size">${Math.abs(szi).toFixed(a.szDp)} ${a.unit}</div></div>
    </div>`;
  }).join('');
  $('totalPnl').textContent = `${total>=0?'+':''}$${fmt(total,2)}`;
  $('totalPnl').className = `positions-pnl ${total>=0?'pos':'neg'}`;
}

// ── التداول ──
function askTrade(isBuy) {
  const qty = parseFloat($('qtyInput').value || State.qty || 0);
  if (!qty || qty<=0) return toast('أدخل الكمية أولاً','err');
  const a = ASSETS[State.asset], p = State.prices[State.asset];
  if (!p?.mid) return toast('لا يوجد سعر — السوق مغلق؟','err');
  
  const usd = (p.mid*qty).toFixed(2), mgn = (p.mid*qty/a.lev).toFixed(2);
  const liq = fmt(p.mid*(isBuy?1-1/a.lev:1+1/a.lev), a.pxDp);
  setTxt('confirmTitle', `تأكيد — ${a.icon} ${isBuy?'شراء ↑':'بيع ↓'}`);
  setTxt('confirmSubtitle', `${a.name} · رافعة ${a.lev}x`);
  $('confirmDetails').innerHTML = `
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${qty} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">السعر</span><span class="confirm-val">${fmt(p.mid, a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">القيمة</span><span class="confirm-val">≈ $${usd}</span></div>
    <div class="confirm-row"><span class="confirm-key">الهامش</span><span class="confirm-val warn">≈ $${mgn}</span></div>
    <div class="confirm-row"><span class="confirm-key">تصفية</span><span class="confirm-val sell">≈ ${liq} $</span></div>`;
  
  const btn = $('confirmExecute');
  btn.className = `btn-modal btn-confirm ${isBuy?'btn-success':'btn-danger'}`;
  btn.innerHTML = isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع';
  State.pendingTrade = {isBuy, qty, sym:State.asset};
  openModal('modalConfirm');
}

async function execTrade() {
  if (!State.pendingTrade) { closeModal('modalConfirm'); return; }
  const {isBuy, qty, sym} = State.pendingTrade;
  const a = ASSETS[sym], p = State.prices[sym];
  if (!p?.mid) { toast('لا يوجد سعر','err'); closeModal('modalConfirm'); return; }
  
  setBtnLoading('confirmExecute','⏳'); showLoader(`${a.icon} ${isBuy?'شراء':'بيع'} ${qty}`);
  try {
    try { await hlExchange({type:'updateLeverage', asset:a.idx, isCross:a.cross, leverage:a.lev}); } catch{}
    const limitPx = fmt(p.mid*(isBuy?1.02:0.98), a.pxDp);
    await hlExchange({type:'order', orders:[{a:a.idx, b:isBuy, p:limitPx, s:fmt(qty, a.szDp), r:false, t:{limit:{tif:'Ioc'}}}], grouping:'na'});
    closeModal('modalConfirm'); toast(`✅ تم التنفيذ`,'ok',5000); setTimeout(pollAccount, 2000);
  } catch(e) { toast(`❌ ${e.message.slice(0,120)}`,'err',6000); }
  finally { resetBtn('confirmExecute'); hideLoader(); }
}

window.askClose = function(i) {
  const p = State.positions[i]; if(!p)return;
  const pos = p.position, szi = parseFloat(pos.szi), coin = pos.coin.replace('xyz:','');
  const a = ASSETS[coin]||{name:coin,unit:'',icon:'',pxDp:2};
  const pnl = parseFloat(pos.unrealizedPnl||0), cur = State.prices[coin]?.mid||0;
  setTxt('closeTitle', `إغلاق — ${a.icon} ${a.name}`);
  $('closeDetails').innerHTML = `
    <div class="confirm-row"><span class="confirm-key">الاتجاه</span><span class="confirm-val">${szi>0?'شراء ↑':'بيع ↓'}</span></div>
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${Math.abs(szi).toFixed(a.szDp)} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">الدخول</span><span class="confirm-val">${fmt(pos.entryPx||0, a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">الحالي</span><span class="confirm-val">${cur?fmt(cur, a.pxDp):'—'} $</span></div>
    <div class="confirm-row"><span class="confirm-key">P&L</span><span class="confirm-val ${pnl>=0?'buy':'sell'}">${pnl>=0?'+':''}$${fmt(pnl,2)}</span></div>`;
  State.pendingClose = i; openModal('modalClose');
};

async function execClose() {
  if (State.pendingClose===null) { closeModal('modalClose'); return; }
  const p = State.positions[State.pendingClose]; if(!p){closeModal('modalClose');return;}
  const pos = p.position, szi = parseFloat(pos.szi), coin = pos.coin.replace('xyz:','');
  const a = ASSETS[coin], mid = State.prices[coin]?.mid;
  if (!a||!mid) { toast('بيانات ناقصة','err'); closeModal('modalClose'); return; }
  
  setBtnLoading('closeExecute','⏳'); showLoader(`إغلاق ${a.icon} ${a.name}...`);
  try {
    const isBuy = szi<0;
    await hlExchange({type:'order', orders:[{a:a.idx, b:isBuy, p:fmt(mid*(isBuy?1.02:0.98), a.pxDp), s:fmt(Math.abs(szi), a.szDp), r:true, t:{limit:{tif:'Ioc'}}}], grouping:'na'});
    closeModal('modalClose'); toast(`✅ أُغلقت`,'ok',5000); setTimeout(pollAccount, 2000);
  } catch(e) { toast(`❌ ${e.message.slice(0,120)}`,'err',6000); }
  finally { resetBtn('closeExecute'); hideLoader(); }
}

window.tp100 = async function(i) {
  const p = State.positions[i]; if(!p) return toast('الصفقة غير موجودة','err');
  const pos = p.position, szi = parseFloat(pos.szi), coin = pos.coin.replace('xyz:','');
  const a = ASSETS[coin], mid = State.prices[coin]?.mid;
  if (!a||!mid) return toast('لا يوجد سعر','err');
  showLoader(`جني ربح ${a.icon}...`);
  try {
    const isBuy = szi<0;
    await hlExchange({type:'order', orders:[{a:a.idx, b:isBuy, p:fmt(mid*(isBuy?1.02:0.98), a.pxDp), s:fmt(Math.abs(szi), a.szDp), r:true, t:{limit:{tif:'Ioc'}}}], grouping:'na'});
    toast(`✅ جني ربح ناجح`,'ok',4000); setTimeout(pollAccount, 2000);
  } catch(e) { toast(`❌ ${e.message.slice(0,120)}`,'err',5000); } finally { hideLoader(); }
};

// ── الرصيد / الإيداع / السحب ──
async function showBalance() {
  openModal('modalBalance'); $('balanceContent').innerHTML = '<div class="balance-loading">⏳ جاري...</div>';
  try {
    const [perp, spot] = await Promise.all([
      hlInfo({type:'clearinghouseState', user:State.wallet.address, dex:'xyz'}),
      hlInfo({type:'spotClearinghouseState', user:State.wallet.address})
    ]);
    const ms=perp.marginSummary||{}, pVal=parseFloat(ms.accountValue||0), mUsed=parseFloat(ms.totalMarginUsed||0), wVal=parseFloat(perp.withdrawable||0);
    let sUSDC=0; for(const b of spot?.balances||[]) if(b.coin==='USDC'||b.coin==='USDC:0') sUSDC+=parseFloat(b.total||0);
    $('balanceContent').innerHTML = `
      <div class="balance-grid">
        <div class="balance-item full"><div class="balance-label">الإجمالي</div><div class="balance-value blue">$${fmt(pVal+sUSDC,2)}</div></div>
        <div class="balance-item"><div class="balance-label">حر للتداول</div><div class="balance-value green">$${fmt(wVal+sUSDC,2)}</div></div>
        <div class="balance-item"><div class="balance-label">مستخدم</div><div class="balance-value warn">$${fmt(mUsed,2)}</div></div>
        <div class="balance-item"><div class="balance-label">عائم</div><div class="balance-value ${State.balance?.floatPnl>=0?'green':'red'}">${State.balance?.floatPnl>=0?'+':''}$${fmt(State.balance?.floatPnl||0,2)}</div></div>
      </div><button class="btn-refresh" onclick="showBalance()">🔄 تحديث</button>`;
  } catch(e){ $('balanceContent').innerHTML=`<div class="balance-loading" style="color:var(--dn)">❌ ${e.message.slice(0,150)}</div>`; }
}

async function doDeposit() {
  const amt = parseFloat($('depositAmount').value||0); if(!amt||amt<=0) return toast('أدخل المبلغ','err');
  setBtnLoading('depositExecute','⏳'); showLoader('موافقة USDC...');
  try {
    const p = new ethers.JsonRpcProvider(ARB_RPC), w = new ethers.Wallet(State.wallet.privateKey, p);
    const usdc = new ethers.Contract('0xaf88d065e77c8cC2239327C5EDb3A432268e5831', ['function approve(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)'], w);
    const bridge = new ethers.Contract('0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7', ['function deposit(address,uint64) external'], w);
    const raw = ethers.parseUnits(amt.toString(),6);
    if (await usdc.balanceOf(w.address) < raw) throw new Error('رصيد غير كافٍ');
    await (await usdc.approve(bridge.target, raw)).wait();
    showLoader('إرسال للجسر...'); const tx = await bridge.deposit(w.address, raw); await tx.wait();
    closeModal('modalDeposit'); toast(`✅ إيداع ${amt} USDC`,'ok',5000); setTimeout(pollAccount, 6000);
  } catch(e){ toast(`❌ ${e.message.slice(0,120)}`,'err',5000); } finally { resetBtn('depositExecute'); hideLoader(); }
}

async function doWithdraw() {
  const amt = parseFloat($('withdrawAmount').value||0), dest = $('withdrawAddress').value.trim();
  if(!amt||amt<=0) return toast('أدخل المبلغ','err'); if(!/^0x[0-9a-fA-F]{40}$/.test(dest)) return toast('عنوان غير صحيح','err');
  setBtnLoading('withdrawExecute','⏳'); showLoader('توقيع السحب...');
  try {
    const nonce = Date.now(), to = dest.toLowerCase();
    const action = {type:'withdraw3', hyperliquidChain:'Mainnet', signatureChainId:'0xa4b1', destination:to, amount:amt.toFixed(2), time:nonce};
    const sig = await State.wallet.signTypedData(
      {name:'HyperliquidSignTransaction',version:'1',chainId:42161,verifyingContract:'0x0000000000000000000000000000000000000000'},
      {'HyperliquidTransaction:Withdraw':[{name:'hyperliquidChain',type:'string'},{name:'destination',type:'string'},{name:'amount',type:'string'},{name:'time',type:'uint64'}]},
      {hyperliquidChain:'Mainnet',destination:to,amount:action.amount,time:nonce}
    );
    const {r,s,v}=ethers.Signature.from(sig);
    const res = await fetch(HL_API+'/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,nonce,signature:{r,s,v}})});
    const d = await res.json(); if(d.status!=='ok') throw new Error(JSON.stringify(d));
    closeModal('modalWithdraw'); toast(`✅ سحب ${amt} قيد المعالجة`,'ok',5000); setTimeout(pollAccount, 5000);
  } catch(e){ toast(`❌ ${e.message.slice(0,120)}`,'err',5000); } finally { resetBtn('withdrawExecute'); hideLoader(); }
}

// ── الدخول / الخروج ──
async function login() {
  let key = $('privateKey').value.trim();
  if (!key) return toast('أدخل المفتاح','err');
  key = key.startsWith('0x') ? key : '0x'+key;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return toast('المفتاح 64 حرف hex','err');
  
  setBtnLoading('loginBtn','⏳'); showLoader('التحقق...');
  try {
    State.wallet = new ethers.Wallet(key);
    sessionStorage.setItem('hl_key', key);
    setTxt('navAddress', State.wallet.address.slice(0,6)+'...'+State.wallet.address.slice(-4));
    $('withdrawAddress').value = State.wallet.address;
    $('loginScreen').classList.add('hidden'); $('appScreen').classList.remove('hidden');
    switchAsset('GOLD'); showLoader('جلب البيانات...');
    await Promise.all([pollPrices(), pollAccount()]);
    hideLoader(); toast('مرحباً 🤝','ok');
    State.timers.push(setInterval(pollPrices, 1000), setInterval(pollAccount, 8000));
  } catch(e) { hideLoader(); State.wallet=null; sessionStorage.removeItem('hl_key'); toast('خطأ: '+e.message.slice(0,80),'err'); }
  finally { resetBtn('loginBtn'); }
}

function doLogout() {
  State.timers.forEach(clearInterval); clearInterval(State.priceTimer);
  sessionStorage.removeItem('hl_key'); State.wallet=null; State.positions=[];
  closeModal('modalLogout'); $('appScreen').classList.add('hidden'); $('loginScreen').classList.remove('hidden');
  $('privateKey').value=''; toast('تم الخروج بأمان','info');
}

// ── ربط الأحداث ──
document.addEventListener('DOMContentLoaded', () => {
  $('loginBtn').onclick = login;
  $('privateKey').onkeydown = e => e.key==='Enter' && login();
  $('toggleKey').onclick = () => { const i=$('privateKey'); i.type=i.type==='password'?'text':'password'; $('toggleKey').textContent=i.type==='password'?'👁':'🙈'; };
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>switchAsset(t.dataset.asset));
  $('btnBuy').onclick = () => State.wallet ? askTrade(true) : toast('سجّل الدخول أولاً','err');
  $('btnSell').onclick = () => State.wallet ? askTrade(false) : toast('سجّل الدخول أولاً','err');
  $('qtyInput').oninput = function(){ State.qty=parseFloat(this.value)||0; document.querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active')); };
  $('qty100').onclick = () => {
    if(!State.wallet) return toast('سجّل الدخول','err');
    const a=ASSETS[State.asset], bal=State.balance?.free||0, px=State.prices[State.asset]?.mid;
    if(!bal||!px) return toast('بيانات غير كافية','err');
    State.qty = parseFloat(fmt((bal*a.lev)/px, a.szDp)); $('qtyInput').value=State.qty; toast(`✅ الكمية: ${State.qty}`,'ok');
  };
  
  $('btnBalance').onclick = () => State.wallet && showBalance();
  $('btnDeposit').onclick = () => State.wallet && openModal('modalDeposit');
  $('btnWithdraw').onclick = () => State.wallet && openModal('modalWithdraw');
  $('btnLogout').onclick = () => State.wallet && openModal('modalLogout');
  
  $('confirmCancel').onclick = () => { closeModal('modalConfirm'); State.pendingTrade=null; };
  $('confirmExecute').onclick = execTrade;
  $('closeCancel').onclick = () => { closeModal('modalClose'); State.pendingClose=null; };
  $('closeExecute').onclick = execClose;
  $('balanceClose').onclick = () => closeModal('modalBalance');
  $('depositCancel').onclick = () => closeModal('modalDeposit');
  $('depositExecute').onclick = doDeposit;
  $('withdrawCancel').onclick = () => closeModal('modalWithdraw');
  $('withdrawExecute').onclick = doWithdraw;
  $('logoutCancel').onclick = () => closeModal('modalLogout');
  $('logoutExecute').onclick = doLogout;
  
  $('navAddress').onclick = () => State.wallet && navigator.clipboard?.writeText(State.wallet.address).then(()=>toast('تم النسخ','info',2000));
  document.querySelectorAll('.modal-overlay').forEach(o=>o.onclick=e=>{ if(e.target===o)o.classList.remove('open'); });
  
  if(sessionStorage.getItem('hl_key')) { $('privateKey').value=sessionStorage.getItem('hl_key'); login(); }
  
  // 🔍 تأكيد التحميل
  console.log('⚡ HL Trade loaded | MsgPack:', typeof MsgPack, '| ethers:', typeof ethers);
});
