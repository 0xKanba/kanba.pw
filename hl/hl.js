/* ═══════════════════════════════════════════════════════════════
   HL Trade · hl.js v6.0
   ✅ مطابق 100% لبوت التلجرام (worker.js v12)
   ✅ TP/SL native trigger orders (grouping:"positionTpsl")
   ✅ إغلاق الكل / إغلاق فردي / جني ربح 100%
   ✅ MsgPack مدمج · EIP-712 توقيع محلي
   ✅ تحديث أسعار 1 ثانية · تحديث حساب 8 ثوانٍ
═══════════════════════════════════════════════════════════════ */

// ── إعدادات ثابتة (مطابقة للبوت) ──
const HL_API  = 'https://api.hyperliquid.xyz';
const ARB_RPC = 'https://arb1.arbitrum.io/rpc';
const USDC_CA = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const BRDG_CA = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';

const ASSETS = {
  GOLD:   { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:1, unit:'أونصة', presets:[0.1,0.5,1,2,5],     icon:'🟡', name:'ذهب'    },
  SILVER: { coin:'xyz:SILVER', idx:110026, lev:25, cross:true,  szDp:2, pxDp:3, unit:'أونصة', presets:[1,2,3,5,8,10,20],   icon:'⚪', name:'فضة'    },
  CL:     { coin:'xyz:CL',     idx:110029, lev:20, cross:false, szDp:3, pxDp:2, unit:'برميل', presets:[1,2,3,5,8,10,20],   icon:'🛢', name:'نفط خام' }
};

// ── حالة التطبيق ──
const State = {
  wallet:      null,
  asset:       'GOLD',
  qty:         0.1,
  prices:      { GOLD:{bid:0,ask:0,mid:0}, SILVER:{bid:0,ask:0,mid:0}, CL:{bid:0,ask:0,mid:0} },
  prevMid:     { GOLD:0, SILVER:0, CL:0 },
  positions:   [],          // [{position:{...}, tpsl:{tp,sl,tpOid,slOid}}]
  openOrders:  [],
  timers:      [],
  pendingTrade: null,
  pendingClose: null,       // index
  pendingCloseAll: false,
  pendingTP:    null,       // {index, coin, szi, entryPx, sym}
  pendingSL:    null,
  balance:      null,
  priceTimer:   null
};

// ═══════════════════════════════════════
// 🔒 MessagePack مدمج (لا CDN)
// ═══════════════════════════════════════
const MsgPack = (function(){
  const te = new TextEncoder();
  function enc(v, b) {
    if (v === null)   { b.push(0xc0); return; }
    if (v === true)   { b.push(0xc3); return; }
    if (v === false)  { b.push(0xc2); return; }
    if (typeof v === 'number') {
      if (Number.isInteger(v)) {
        if (v >= 0 && v <= 127)           { b.push(v); return; }
        if (v < 0 && v >= -32)            { b.push(0xe0|(v+32)); return; }
        if (v >= 0 && v <= 255)           { b.push(0xcc,v); return; }
        if (v >= -128 && v < 0)           { b.push(0xd0,(v+256)&0xff); return; }
        if (v >= 0 && v <= 65535)         { b.push(0xcd,(v>>8)&0xff,v&0xff); return; }
        if (v >= -32768 && v < 0)         { b.push(0xd1,(v>>8)&0xff,v&0xff); return; }
        b.push(0xce,(v>>>24)&0xff,(v>>>16)&0xff,(v>>>8)&0xff,v&0xff); return;
      }
      const dv = new DataView(new ArrayBuffer(9));
      dv.setFloat64(1, v, false);
      b.push(0xcb);
      for (let i=1;i<=8;i++) b.push(dv.getUint8(i));
      return;
    }
    if (typeof v === 'string') {
      const u = te.encode(v);
      if (u.length<=31) b.push(0xa0|u.length);
      else if (u.length<=255) b.push(0xd9,u.length);
      else b.push(0xda,(u.length>>8)&0xff,u.length&0xff);
      for (const c of u) b.push(c);
      return;
    }
    if (Array.isArray(v)) {
      if (v.length<=15) b.push(0x90|v.length);
      for (const item of v) enc(item,b);
      return;
    }
    if (typeof v==='object') {
      const keys=Object.keys(v);
      if (keys.length<=15) b.push(0x80|keys.length);
      for (const k of keys) { enc(k,b); enc(v[k],b); }
    }
  }
  return { encode: obj => { const b=[]; enc(obj,b); return new Uint8Array(b); } };
})();

// ── أدوات DOM ──
const $ = id => document.getElementById(id);
const openModal  = id => $(id)?.classList.add('open');
const closeModal = id => $(id)?.classList.remove('open');

function toast(msg, type='info', dur=3500) {
  const el=$('toast'); if(!el) return;
  el.textContent=msg; el.className=`show ${type}`;
  clearTimeout(el._t); el._t=setTimeout(()=>el.className='',dur);
}
function showLoader(t='جاري...') { $('loaderText').textContent=t; $('loader').classList.add('active'); }
function hideLoader()             { $('loader').classList.remove('active'); }
function setTxt(id,t)  { const e=$(id); if(e) e.textContent=t; }
function setText(id,t,c){ const e=$(id); if(!e)return; e.textContent=t; if(c) e.className=c; }
function setBtnLoading(id,txt='⏳'){ const b=$(id); if(!b)return; b._orig=b.innerHTML; b.disabled=true; b.innerHTML=txt; }
function resetBtn(id)  { const b=$(id); if(!b)return; b.disabled=false; if(b._orig) b.innerHTML=b._orig; }

// ── wire: تنسيق الأرقام مطابق للبوت ──
function wire(num, dp) {
  let s = (+num).toFixed(dp);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s;
}
const fmt = (n,d) => (+n).toFixed(d);

// ── shortCoin / arName ──
function shortCoin(coin) { return coin.includes(':') ? coin.split(':')[1] : coin; }
function arName(coin) { const s=shortCoin(coin); return ASSETS[s]?.name||s; }

// ═══════════════════════════════════════
// 🌐 Hyperliquid API
// ═══════════════════════════════════════

async function hlInfo(body) {
  const res = await fetch(HL_API+'/info', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function hlExchange(action) {
  if (!State.wallet) throw new Error('لا توجد محفظة');

  const nonce = Date.now();
  const encoded = MsgPack.encode(action);

  const nb = new ArrayBuffer(8);
  new DataView(nb).setBigUint64(0, BigInt(nonce), false);
  const payload = new Uint8Array(encoded.length + 9);
  payload.set(encoded, 0);
  payload.set(new Uint8Array(nb), encoded.length);
  payload[encoded.length + 8] = 0x00;

  const connId = ethers.keccak256(payload);

  const sig = await State.wallet.signTypedData(
    { name:'Exchange', version:'1', chainId:1337, verifyingContract:'0x0000000000000000000000000000000000000000' },
    { Agent:[{name:'source',type:'string'},{name:'connectionId',type:'bytes32'}] },
    { source:'a', connectionId:connId }
  );

  const {r,s,v} = ethers.Signature.from(sig);
  const res = await fetch(HL_API+'/exchange', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action, nonce, signature:{r,s,v}, vaultAddress:null })
  });

  const data = await res.json();
  if (data.status !== 'ok') {
    const err = data.response?.data?.statuses?.[0] || data.response || JSON.stringify(data).slice(0,200);
    throw new Error(typeof err==='string' ? err : JSON.stringify(err));
  }
  return data;
}

// ── tradeErr: ترجمة أخطاء البوت ──
function tradeErr(msg) {
  const m = msg.toLowerCase();
  if (m.includes('does not exist')||m.includes('not found'))
    return '⚠️ الحساب غير مفعّل — أودع USDC أولاً';
  if (m.includes('insufficient')||m.includes('margin'))
    return '❌ رصيد غير كافٍ — أودع المزيد أو اختر كمية أصغر';
  if (m.includes('halted')||m.includes('no fill'))
    return '❌ لم ينفَّذ — السوق خارج أوقات التداول (23/5)';
  if (m.includes('reduce'))
    return '❌ لا يوجد مركز مفتوح للإغلاق';
  return `❌ ${msg.slice(0,150)}`;
}

// ═══════════════════════════════════════
// 📡 تحديث الأسعار (كل 1 ثانية)
// ═══════════════════════════════════════

async function pollPrices() {
  await Promise.all(Object.keys(ASSETS).map(async sym => {
    try {
      const a  = ASSETS[sym];
      const lb = await hlInfo({type:'l2Book', coin:a.coin});
      const bid = parseFloat(lb.levels?.[0]?.[0]?.px||0);
      const ask = parseFloat(lb.levels?.[1]?.[0]?.px||0);
      const mid = (bid&&ask) ? (bid+ask)/2 : 0;
      State.prices[sym] = {bid, ask, mid};

      const el = $(`price${sym}`);
      if (el && mid) {
        const dir = mid>State.prevMid[sym]?'up':mid<State.prevMid[sym]?'dn':'';
        el.textContent = fmt(mid, a.pxDp);
        el.className = `tab-price${dir?' '+dir:''}`;
        if (dir) setTimeout(()=>el.className='tab-price', 800);
      }
    } catch{}
  }));
  updatePriceUI();
}

function updatePriceUI() {
  const a = ASSETS[State.asset], p = State.prices[State.asset];
  if (!p||!p.mid) return;
  const dir = p.mid>State.prevMid[State.asset]?1:p.mid<State.prevMid[State.asset]?-1:0;
  const cls = dir>0?'up':dir<0?'dn':'n';

  $('priceCard').className = `price-card${dir>0?' up':dir<0?' dn':''}`;
  setText('priceValue', fmt(p.mid, a.pxDp), `price-value ${cls}`);
  setTxt('buyPrice',  fmt(p.mid, a.pxDp));
  setTxt('sellPrice', fmt(p.mid, a.pxDp));

  if (State.prevMid[State.asset] && p.mid!==State.prevMid[State.asset]) {
    const delta = p.mid - State.prevMid[State.asset];
    setText('priceDelta', (delta>0?'+':'')+fmt(delta, a.pxDp), `price-delta ${cls}`);
  }

  // Bid/Ask
  if (p.bid && p.ask) {
    setTxt('priceBidAsk', `B ${fmt(p.bid,a.pxDp)} · A ${fmt(p.ask,a.pxDp)}`);
  }

  State.prevMid[State.asset] = p.mid;

  // مؤقت التحديث
  let s=1; clearInterval(State.priceTimer);
  setTxt('priceTimer', `↻ ${s}s`);
  State.priceTimer = setInterval(()=>{ s++; setTxt('priceTimer',`↻ ${s}s`); }, 1000);

  // تحديث سعر TP preview لو مفتوح
  recalcTpPreview();
  recalcSlPreview();
}

// ═══════════════════════════════════════
// 👤 تحديث الحساب (كل 8 ثوانٍ)
// ═══════════════════════════════════════

async function pollAccount() {
  if (!State.wallet) return;
  try {
    const [perp, spot, openOrders] = await Promise.all([
      hlInfo({type:'clearinghouseState', user:State.wallet.address}),
      hlInfo({type:'spotClearinghouseState', user:State.wallet.address}),
      hlInfo({type:'frontendOpenOrders', user:State.wallet.address}).catch(()=>[])
    ]);

    State.openOrders = Array.isArray(openOrders) ? openOrders : [];

    const ms = perp.marginSummary||{};
    const perpVal    = parseFloat(ms.accountValue||0);
    const marginUsed = parseFloat(ms.totalMarginUsed||0);
    const withdrawable = parseFloat(perp.withdrawable||0);

    let spotUSDC = 0;
    for (const b of spot?.balances||[]) {
      if (b.coin==='USDC'||b.coin==='USDC:0') spotUSDC += parseFloat(b.total||0);
    }

    State.balance = {
      total:    perpVal + spotUSDC,
      free:     withdrawable + spotUSDC,
      margin:   marginUsed,
      floatPnl: (perp.assetPositions||[]).reduce((s,p)=>s+parseFloat(p.position?.unrealizedPnl||0),0)
    };

    // إضافة TP/SL لكل مركز
    const rawPos = (perp.assetPositions||[]).filter(p=>parseFloat(p.position?.szi||0)!==0);
    State.positions = rawPos.map(p => ({
      ...p,
      tpsl: parseTpslFromOrders(State.openOrders, p.position.coin)
    }));

    renderPositions();
  } catch(e) {
    if (e.message.toLowerCase().includes('exist')||e.message.toLowerCase().includes('not found')) {
      State.balance = {total:0,free:0,margin:0,floatPnl:0};
      State.positions = [];
      renderPositions();
    } else {
      console.warn('[pollAccount]', e.message);
    }
  }
}

// ── Parse TP/SL من أوامر مفتوحة ──
function parseTpslFromOrders(orders, coin) {
  const r = {tp:null, sl:null, tpOid:null, slOid:null};
  for (const o of orders||[]) {
    if (o.coin!==coin || !o.isTrigger) continue;
    const ot = (o.orderType||'').toLowerCase();
    if (ot.includes('take profit')) { r.tp=parseFloat(o.triggerPx); r.tpOid=o.oid; }
    else if (ot.includes('stop'))   { r.sl=parseFloat(o.triggerPx); r.slOid=o.oid; }
  }
  return r;
}

// ── حساب سعر TP/SL من مبلغ الدولار ──
function calcTpPrice(entryPx, szi, pnlTarget) {
  const sz=parseFloat(szi), ep=parseFloat(entryPx);
  return sz>0 ? ep + pnlTarget/sz : ep - pnlTarget/Math.abs(sz);
}
function calcSlPrice(entryPx, szi, slAmount) {
  const sz=parseFloat(szi), ep=parseFloat(entryPx);
  return sz>0 ? ep - slAmount/sz : ep + slAmount/Math.abs(sz);
}

// ═══════════════════════════════════════
// 🖥️ عرض الصفقات
// ═══════════════════════════════════════

function renderPositions() {
  const count = State.positions.length;
  setTxt('positionsCount', count);

  const clsAllBtn = $('btnCloseAll');
  if (clsAllBtn) clsAllBtn.classList.toggle('hidden', count===0);

  const list = $('positionsList');
  if (!count) {
    list.innerHTML = '<div class="positions-empty">📂 لا توجد صفقات مفتوحة</div>';
    setTxt('totalPnl',''); $('totalPnl').className='positions-pnl';
    return;
  }

  let total = 0;
  list.innerHTML = State.positions.map((p,i) => {
    const pos   = p.position;
    const szi   = parseFloat(pos.szi);
    const pnl   = parseFloat(pos.unrealizedPnl||0);
    total += pnl;
    const coin  = shortCoin(pos.coin);
    const a     = ASSETS[coin]||{name:coin,unit:'',icon:'📊',pxDp:2,szDp:2};
    const isLong = szi>0;
    const dirTxt = isLong?'شراء ↑':'بيع ↓';
    const dirCls = isLong?'long':'short';
    const pCls   = pnl>=0?'pos':'neg';
    const sign   = pnl>=0?'+':'';
    const curPx  = State.prices[coin]?.mid;
    const curStr = curPx ? fmt(curPx, a.pxDp) : '—';

    // TP/SL chips
    const tpsl = p.tpsl||{};
    const tpTxt = tpsl.tp ? `🎯 TP ${fmt(tpsl.tp, a.pxDp)}` : '🎯 TP';
    const slTxt = tpsl.sl ? `🛡 SL ${fmt(tpsl.sl, a.pxDp)}` : '🛡 SL';
    const tpCls = tpsl.tp ? 'tp-set' : 'tp-unset';
    const slCls = tpsl.sl ? 'sl-set' : 'sl-unset';

    return `<div class="position-item">
      <div class="pos-top">
        <div class="pos-info">
          <div class="pos-name">${a.icon} ${a.name}</div>
          <div class="pos-meta">
            <span class="${dirCls}">${dirTxt}</span>
            &nbsp;|&nbsp;دخول: ${fmt(pos.entryPx||0,a.pxDp)}
            &nbsp;|&nbsp;حالي: ${curStr}
          </div>
        </div>
        <div>
          <div class="pos-pnl ${pCls}">${sign}$${fmt(pnl,2)}</div>
          <div class="pos-size">${Math.abs(szi).toFixed(a.szDp)} ${a.unit}</div>
        </div>
      </div>
      <div class="pos-tpsl-row">
        <button class="tpsl-chip ${tpCls}" onclick="openTP(${i})">${tpTxt}</button>
        <button class="tpsl-chip ${slCls}" onclick="openSL(${i})">${slTxt}</button>
      </div>
      <div class="pos-actions-row">
        <button class="btn-pos-close"  onclick="askClose(${i})">إغلاق ✕</button>
        <button class="btn-pos-tp100" onclick="tp100(${i})">جني 100% ✓</button>
      </div>
    </div>`;
  }).join('');

  const totalEl = $('totalPnl');
  totalEl.textContent = `${total>=0?'+':''}$${fmt(total,2)}`;
  totalEl.className = `positions-pnl ${total>=0?'pos':'neg'}`;
}

// ═══════════════════════════════════════
// 📊 واجهة الأصول
// ═══════════════════════════════════════

function switchAsset(sym) {
  State.asset = sym;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.asset===sym));
  const a = ASSETS[sym];
  setTxt('priceAssetName', a.name);
  setTxt('tradeAssetName', a.name);
  setTxt('qtyUnit', a.unit);
  renderPresets(a.presets);
  State.prevMid[sym]=0;
  updatePriceUI();
}

function renderPresets(arr) {
  $('qtyPresets').innerHTML = arr.map((v,i)=>
    `<button class="qty-preset${i===0?' active':''}" data-v="${v}">${v}</button>`
  ).join('');
  State.qty = arr[0];
  $('qtyInput').value = arr[0];
  $('qtyPresets').onclick = e => {
    if (!e.target.classList.contains('qty-preset')) return;
    State.qty = parseFloat(e.target.dataset.v);
    $('qtyInput').value = State.qty;
    $('qtyPresets').querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active'));
    e.target.classList.add('active');
  };
}

// ═══════════════════════════════════════
// 💼 التداول: شراء / بيع
// ═══════════════════════════════════════

function askTrade(isBuy) {
  const qty = parseFloat($('qtyInput').value||State.qty||0);
  if (!qty||qty<=0) return toast('أدخل الكمية أولاً','err');
  const a = ASSETS[State.asset], p = State.prices[State.asset];
  if (!p?.mid) return toast('لا يوجد سعر — السوق مغلق؟','err');

  const usd  = (p.mid*qty).toFixed(2);
  const mgn  = (p.mid*qty/a.lev).toFixed(2);
  const liq  = fmt(p.mid*(isBuy?1-1/a.lev:1+1/a.lev), a.pxDp);

  setTxt('confirmTitle', `تأكيد — ${a.icon} ${isBuy?'شراء ↑':'بيع ↓'}`);
  setTxt('confirmSubtitle', `${a.name} · رافعة ${a.lev}x`);
  $('confirmDetails').innerHTML = `
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${qty} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">السعر</span><span class="confirm-val">${fmt(p.mid,a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">القيمة</span><span class="confirm-val">≈ $${usd}</span></div>
    <div class="confirm-row"><span class="confirm-key">الهامش</span><span class="confirm-val warn">≈ $${mgn}</span></div>
    <div class="confirm-row"><span class="confirm-key">تصفية تقريبية</span><span class="confirm-val sell">≈ ${liq} $</span></div>`;

  const btn = $('confirmExecute');
  btn.className = `btn-modal btn-confirm ${isBuy?'btn-success':'btn-danger'}`;
  btn.innerHTML = isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع';
  State.pendingTrade = {isBuy, qty, sym:State.asset};
  openModal('modalConfirm');
}

async function execTrade() {
  if (!State.pendingTrade) { closeModal('modalConfirm'); return; }
  const {isBuy, qty, sym} = State.pendingTrade;
  const a = ASSETS[sym], p = State.prices[sym];
  if (!p?.mid) { toast('لا يوجد سعر','err'); closeModal('modalConfirm'); return; }

  setBtnLoading('confirmExecute','⏳');
  showLoader(`${a.icon} ${isBuy?'شراء':'بيع'} ${qty} ${a.unit}...`);
  try {
    // تعيين الرافعة أولاً
    try {
      await hlExchange({type:'updateLeverage', asset:a.idx, isCross:a.cross, leverage:a.lev});
    } catch{}

    // أمر IOC مع slippage 2%
    const limitPx = wire(p.mid*(isBuy?1.02:0.98), a.pxDp);
    const sz      = wire(qty, a.szDp);
    await hlExchange({
      type:'order',
      orders:[{ a:a.idx, b:isBuy, p:limitPx, s:sz, r:false, t:{limit:{tif:'Ioc'}} }],
      grouping:'na'
    });
    closeModal('modalConfirm');
    toast(`✅ تم التنفيذ — ${a.icon} ${isBuy?'شراء':'بيع'} ${qty} ${a.unit}`,'ok',5000);
    State.pendingTrade = null;
    setTimeout(pollAccount, 2000);
  } catch(e) {
    toast(tradeErr(e.message),'err',6000);
  } finally {
    resetBtn('confirmExecute'); hideLoader();
  }
}

// ═══════════════════════════════════════
// ❌ إغلاق صفقة فردية
// ═══════════════════════════════════════

window.askClose = function(i) {
  const p = State.positions[i]; if(!p)return;
  const pos = p.position, szi=parseFloat(pos.szi), coin=shortCoin(pos.coin);
  const a = ASSETS[coin]||{name:coin,unit:'',icon:'📊',pxDp:2};
  const pnl=parseFloat(pos.unrealizedPnl||0), cur=State.prices[coin]?.mid||0;

  setTxt('closeTitle', `إغلاق — ${a.icon} ${a.name}`);
  $('closeDetails').innerHTML = `
    <div class="confirm-row"><span class="confirm-key">الاتجاه</span><span class="confirm-val ${szi>0?'buy':'sell'}">${szi>0?'شراء ↑':'بيع ↓'}</span></div>
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${Math.abs(szi).toFixed(a.szDp)} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">دخول</span><span class="confirm-val">${fmt(pos.entryPx||0,a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">حالي</span><span class="confirm-val">${cur?fmt(cur,a.pxDp):'—'} $</span></div>
    <div class="confirm-row"><span class="confirm-key">P&L</span><span class="confirm-val ${pnl>=0?'buy':'sell'}">${pnl>=0?'+':''}$${fmt(pnl,2)}</span></div>`;

  State.pendingClose = i;
  openModal('modalClose');
};

async function execClose() {
  if (State.pendingClose===null) { closeModal('modalClose'); return; }
  const p = State.positions[State.pendingClose]; if(!p){closeModal('modalClose');return;}
  const pos=p.position, szi=parseFloat(pos.szi), coin=shortCoin(pos.coin);
  const a=ASSETS[coin], mid=State.prices[coin]?.mid;
  if (!a||!mid) { toast('بيانات ناقصة','err'); closeModal('modalClose'); return; }

  setBtnLoading('closeExecute','⏳');
  showLoader(`إغلاق ${a.icon} ${a.name}...`);
  try {
    const isBuy = szi<0;
    const px = wire(mid*(isBuy?1.02:0.98), a.pxDp);
    const sz = wire(Math.abs(szi), a.szDp);
    await hlExchange({
      type:'order',
      orders:[{ a:a.idx, b:isBuy, p:px, s:sz, r:true, t:{limit:{tif:'Ioc'}} }],
      grouping:'na'
    });
    closeModal('modalClose');
    toast(`✅ أُغلقت — ${a.icon} ${a.name}`,'ok',5000);
    State.pendingClose = null;
    setTimeout(pollAccount, 2000);
  } catch(e) { toast(tradeErr(e.message),'err',6000); }
  finally { resetBtn('closeExecute'); hideLoader(); }
}

// ═══════════════════════════════════════
// ❌ إغلاق الكل
// ═══════════════════════════════════════

function askCloseAll() {
  if (!State.positions.length) return toast('لا توجد صفقات','info');
  $('closeAllDetails').innerHTML = State.positions.map(p=>{
    const pos=p.position, szi=parseFloat(pos.szi), coin=shortCoin(pos.coin);
    const a=ASSETS[coin]||{name:coin,pxDp:2}, pnl=parseFloat(pos.unrealizedPnl||0);
    return `<div class="confirm-row">
      <span class="confirm-key">${a.icon||'📊'} ${a.name}</span>
      <span class="confirm-val ${pnl>=0?'buy':'sell'}">${pnl>=0?'+':''}$${fmt(pnl,2)}</span>
    </div>`;
  }).join('');
  openModal('modalCloseAll');
}

async function execCloseAll() {
  const positions = [...State.positions];
  if (!positions.length) { closeModal('modalCloseAll'); return; }

  setBtnLoading('closeAllExecute','⏳');
  showLoader('إغلاق جميع الصفقات...');
  let ok=0, fail=0;
  try {
    for (const p of positions) {
      const pos=p.position, szi=parseFloat(pos.szi), coin=shortCoin(pos.coin);
      const a=ASSETS[coin], mid=State.prices[coin]?.mid;
      if (!a||!mid) { fail++; continue; }
      try {
        const isBuy=szi<0;
        const px=wire(mid*(isBuy?1.02:0.98),a.pxDp);
        const sz=wire(Math.abs(szi),a.szDp);
        await hlExchange({type:'order',orders:[{a:a.idx,b:isBuy,p:px,s:sz,r:true,t:{limit:{tif:'Ioc'}}}],grouping:'na'});
        ok++;
      } catch(e){ fail++; console.warn('[closeAll]',coin,e.message); }
    }
    closeModal('modalCloseAll');
    toast(`✅ أُغلق ${ok} مركز${fail?` · فشل ${fail}`:'`'}`, 'ok', 5000);
    setTimeout(pollAccount, 2000);
  } finally { resetBtn('closeAllExecute'); hideLoader(); }
}

// ═══════════════════════════════════════
// 💰 جني ربح 100% (مطابق للبوت)
// ═══════════════════════════════════════

window.tp100 = async function(i) {
  const p=State.positions[i]; if(!p) return toast('الصفقة غير موجودة','err');
  const pos=p.position, szi=parseFloat(pos.szi), coin=shortCoin(pos.coin);
  const a=ASSETS[coin], mid=State.prices[coin]?.mid;
  if (!a||!mid) return toast('لا يوجد سعر','err');
  showLoader(`جني ربح ${a.icon} ${a.name}...`);
  try {
    const isBuy=szi<0;
    const px=wire(mid*(isBuy?1.02:0.98),a.pxDp);
    const sz=wire(Math.abs(szi),a.szDp);
    await hlExchange({type:'order',orders:[{a:a.idx,b:isBuy,p:px,s:sz,r:true,t:{limit:{tif:'Ioc'}}}],grouping:'na'});
    toast(`✅ جني ربح ناجح — ${a.icon} ${a.name}`,'ok',4000);
    setTimeout(pollAccount, 2000);
  } catch(e){ toast(tradeErr(e.message),'err',5000); }
  finally { hideLoader(); }
};

// ═══════════════════════════════════════
// 🎯 TP — جني الأرباح Native
// ═══════════════════════════════════════

window.openTP = function(i) {
  const p=State.positions[i]; if(!p)return;
  const pos=p.position, coin=shortCoin(pos.coin);
  const a=ASSETS[coin]||{name:coin,pxDp:2,szDp:2,unit:'',icon:'📊'};
  const tpsl=p.tpsl||{};
  const isLong=parseFloat(pos.szi)>0;

  setTxt('tpTitle', `🎯 جني الأرباح — ${a.name}`);
  setTxt('tpSubtitle', `${isLong?'🟢 شراء Long':'🔴 بيع Short'} | دخول: $${fmt(pos.entryPx||0,a.pxDp)}`);

  $('tpCurrentDetails').innerHTML = tpsl.tp
    ? `<div class="confirm-row"><span class="confirm-key">TP الحالي</span><span class="confirm-val tp">$${fmt(tpsl.tp,a.pxDp)}</span></div>`
    : `<div class="confirm-row"><span class="confirm-key">TP</span><span class="confirm-val">لم يُعيَّن بعد</span></div>`;

  // إخفاء/إظهار حذف TP
  const delRow=$('tpDeleteRow');
  delRow.classList.toggle('hidden', !tpsl.tpOid);

  $('tpAmount').value='';
  setTxt('tpPreview','سعر التفعيل: —');

  State.pendingTP = {index:i, coin:pos.coin, szi:pos.szi, entryPx:pos.entryPx, sym:coin, tpsl};
  openModal('modalTP');
};

function recalcTpPreview() {
  const tp=State.pendingTP; if(!tp) return;
  const val=parseFloat($('tpAmount')?.value||0);
  if (!val||val<=0) { setTxt('tpPreview','سعر التفعيل: —'); return; }
  const a=ASSETS[tp.sym]||{pxDp:2};
  const px=calcTpPrice(tp.entryPx, tp.szi, val);
  setTxt('tpPreview', `سعر التفعيل: $${fmt(px,a.pxDp)}`);
}

async function execTP() {
  const tp=State.pendingTP; if(!tp) return closeModal('modalTP');
  const val=parseFloat($('tpAmount').value||0);
  if (!val||val<=0) return toast('أدخل مبلغ الربح المستهدف','err');
  const a=ASSETS[tp.sym]; if(!a) return;
  const tpPx=calcTpPrice(tp.entryPx, tp.szi, val);

  setBtnLoading('tpExecute','⏳');
  showLoader(`تعيين TP — ${a.icon} ${a.name}...`);
  try {
    await placeNativeTpsl(tp.sym, tp.szi, 'tp', tpPx);
    closeModal('modalTP');
    toast(`✅ TP تعيين $${fmt(tpPx,a.pxDp)}`,'ok',4000);
    setTimeout(pollAccount, 2000);
  } catch(e){ toast(tradeErr(e.message),'err',5000); }
  finally { resetBtn('tpExecute'); hideLoader(); }
}

async function deleteTP() {
  const tp=State.pendingTP; if(!tp||!tp.tpsl?.tpOid) return;
  const a=ASSETS[tp.sym]; if(!a) return;
  showLoader(`إلغاء TP — ${a.icon}...`);
  try {
    await hlExchange({type:'cancel', cancels:[{a:a.idx, o:Number(tp.tpsl.tpOid)}]});
    closeModal('modalTP');
    toast(`✅ تم إلغاء TP`,'ok',3000);
    setTimeout(pollAccount, 1500);
  } catch(e){ toast(tradeErr(e.message),'err',4000); }
  finally { hideLoader(); }
}

// ═══════════════════════════════════════
// 🛡️ SL — وقف الخسارة Native
// ═══════════════════════════════════════

window.openSL = function(i) {
  const p=State.positions[i]; if(!p)return;
  const pos=p.position, coin=shortCoin(pos.coin);
  const a=ASSETS[coin]||{name:coin,pxDp:2,szDp:2,unit:'',icon:'📊'};
  const tpsl=p.tpsl||{};
  const isLong=parseFloat(pos.szi)>0;

  setTxt('slTitle', `🛡️ وقف الخسارة — ${a.name}`);
  setTxt('slSubtitle', `${isLong?'🟢 شراء Long':'🔴 بيع Short'} | دخول: $${fmt(pos.entryPx||0,a.pxDp)}`);

  $('slCurrentDetails').innerHTML = tpsl.sl
    ? `<div class="confirm-row"><span class="confirm-key">SL الحالي</span><span class="confirm-val sl">$${fmt(tpsl.sl,a.pxDp)}</span></div>`
    : `<div class="confirm-row"><span class="confirm-key">SL</span><span class="confirm-val">لم يُعيَّن بعد</span></div>`;

  const delRow=$('slDeleteRow');
  delRow.classList.toggle('hidden', !tpsl.slOid);

  $('slAmount').value='';
  setTxt('slPreview','سعر التفعيل: —');

  State.pendingSL = {index:i, coin:pos.coin, szi:pos.szi, entryPx:pos.entryPx, sym:coin, tpsl};
  openModal('modalSL');
};

function recalcSlPreview() {
  const sl=State.pendingSL; if(!sl) return;
  const val=parseFloat($('slAmount')?.value||0);
  if (!val||val<=0) { setTxt('slPreview','سعر التفعيل: —'); return; }
  const a=ASSETS[sl.sym]||{pxDp:2};
  const px=calcSlPrice(sl.entryPx, sl.szi, val);
  setTxt('slPreview', `سعر التفعيل: $${fmt(px,a.pxDp)}`);
}

async function execSL() {
  const sl=State.pendingSL; if(!sl) return closeModal('modalSL');
  const val=parseFloat($('slAmount').value||0);
  if (!val||val<=0) return toast('أدخل مبلغ الخسارة المسموح بها','err');
  const a=ASSETS[sl.sym]; if(!a) return;
  const slPx=calcSlPrice(sl.entryPx, sl.szi, val);

  setBtnLoading('slExecute','⏳');
  showLoader(`تعيين SL — ${a.icon} ${a.name}...`);
  try {
    await placeNativeTpsl(sl.sym, sl.szi, 'sl', slPx);
    closeModal('modalSL');
    toast(`✅ SL تعيين $${fmt(slPx,a.pxDp)}`,'ok',4000);
    setTimeout(pollAccount, 2000);
  } catch(e){ toast(tradeErr(e.message),'err',5000); }
  finally { resetBtn('slExecute'); hideLoader(); }
}

async function deleteSL() {
  const sl=State.pendingSL; if(!sl||!sl.tpsl?.slOid) return;
  const a=ASSETS[sl.sym]; if(!a) return;
  showLoader(`إلغاء SL — ${a.icon}...`);
  try {
    await hlExchange({type:'cancel', cancels:[{a:a.idx, o:Number(sl.tpsl.slOid)}]});
    closeModal('modalSL');
    toast(`✅ تم إلغاء SL`,'ok',3000);
    setTimeout(pollAccount, 1500);
  } catch(e){ toast(tradeErr(e.message),'err',4000); }
  finally { hideLoader(); }
}

// ── وضع أمر TP/SL Native (مطابق للبوت placeNativeTpsl) ──
async function placeNativeTpsl(sym, sziStr, tpslType, triggerPxNum) {
  const asset = ASSETS[sym];
  const sz  = parseFloat(sziStr);
  const isBuy = sz < 0;   // عكس الاتجاه للإغلاق
  const absSz  = wire(Math.abs(sz), asset.szDp);
  const tPx    = triggerPxNum;
  // limit price مع هامش أمان 10%
  const limitPx = isBuy
    ? wire(tPx * 1.10, asset.pxDp)
    : wire(tPx * 0.90, asset.pxDp);

  const res = await hlExchange({
    type:'order',
    orders:[{
      a:asset.idx,
      b:isBuy,
      p:limitPx,
      s:absSz,
      r:true,
      t:{ trigger:{ isMarket:true, triggerPx:wire(tPx, asset.pxDp), tpsl:tpslType } }
    }],
    grouping:'positionTpsl'
  });

  const status = res?.response?.data?.statuses?.[0];
  if (status?.error) throw new Error(status.error);
  return status?.resting?.oid ?? null;
}

// ═══════════════════════════════════════
// 💼 الرصيد
// ═══════════════════════════════════════

async function showBalance() {
  openModal('modalBalance');
  $('balanceContent').innerHTML = '<div class="balance-loading">⏳ جاري...</div>';
  try {
    const [perp, spot] = await Promise.all([
      hlInfo({type:'clearinghouseState', user:State.wallet.address}),
      hlInfo({type:'spotClearinghouseState', user:State.wallet.address})
    ]);
    const ms   = perp.marginSummary||{};
    const pVal = parseFloat(ms.accountValue||0);
    const mUsd = parseFloat(ms.totalMarginUsed||0);
    const wVal = parseFloat(perp.withdrawable||0);
    let sUSDC=0;
    for (const b of spot?.balances||[]) {
      if (b.coin==='USDC'||b.coin==='USDC:0') sUSDC+=parseFloat(b.total||0);
    }
    const floatPnl = State.balance?.floatPnl||0;
    $('balanceContent').innerHTML = `
      <div class="balance-grid">
        <div class="balance-item full">
          <div class="balance-label">الإجمالي</div>
          <div class="balance-value blue">$${fmt(pVal+sUSDC,2)}</div>
        </div>
        <div class="balance-item">
          <div class="balance-label">حر للتداول</div>
          <div class="balance-value green">$${fmt(wVal+sUSDC,2)}</div>
        </div>
        <div class="balance-item">
          <div class="balance-label">مستخدم</div>
          <div class="balance-value warn">$${fmt(mUsd,2)}</div>
        </div>
        <div class="balance-item">
          <div class="balance-label">عائم P&L</div>
          <div class="balance-value ${floatPnl>=0?'green':'red'}">${floatPnl>=0?'+':''}$${fmt(floatPnl,2)}</div>
        </div>
        ${sUSDC>0?`<div class="balance-item full"><div class="balance-label">رصيد Spot USDC</div><div class="balance-value blue">$${fmt(sUSDC,2)}</div></div>`:''}
      </div>
      <button class="btn-refresh" onclick="showBalance()">🔄 تحديث</button>`;
  } catch(e) {
    $('balanceContent').innerHTML=`<div class="balance-loading" style="color:var(--dn)">❌ ${e.message.slice(0,150)}</div>`;
  }
}

// ═══════════════════════════════════════
// 💰 إيداع
// ═══════════════════════════════════════

async function doDeposit() {
  const amt = parseFloat($('depositAmount').value||0);
  if (!amt||amt<8) return toast('الحد الأدنى $8','err');
  setBtnLoading('depositExecute','⏳');
  showLoader('موافقة USDC على Arbitrum...');
  try {
    const p = new ethers.JsonRpcProvider(ARB_RPC);
    const w = new ethers.Wallet(State.wallet.privateKey, p);
    const usdc   = new ethers.Contract(USDC_CA, ['function approve(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)'], w);
    const bridge = new ethers.Contract(BRDG_CA, ['function deposit(address,uint64) external'], w);
    const raw    = ethers.parseUnits(amt.toString(), 6);
    const bal    = await usdc.balanceOf(w.address);
    if (bal < raw) throw new Error(`رصيد USDC غير كافٍ على Arbitrum\nلديك: ${ethers.formatUnits(bal,6)} | تريد: ${amt}`);
    await (await usdc.approve(BRDG_CA, raw)).wait();
    showLoader('إرسال للجسر...');
    const tx = await bridge.deposit(w.address, raw);
    await tx.wait();
    closeModal('modalDeposit');
    toast(`✅ إيداع ${amt} USDC — 1-3 دقائق`,'ok',6000);
    setTimeout(pollAccount, 6000);
  } catch(e){ toast(`❌ ${e.message.slice(0,120)}`,'err',5000); }
  finally { resetBtn('depositExecute'); hideLoader(); }
}

// ═══════════════════════════════════════
// 📤 سحب
// ═══════════════════════════════════════

async function doWithdraw() {
  const amt  = parseFloat($('withdrawAmount').value||0);
  const dest = $('withdrawAddress').value.trim();
  if (!amt||amt<=0)                          return toast('أدخل المبلغ','err');
  if (!/^0x[0-9a-fA-F]{40}$/.test(dest))    return toast('عنوان غير صحيح','err');

  setBtnLoading('withdrawExecute','⏳');
  showLoader('توقيع أمر السحب...');
  try {
    const nonce = Date.now();
    const to    = dest.toLowerCase();
    const action = {
      type:'withdraw3', hyperliquidChain:'Mainnet',
      signatureChainId:'0xa4b1', destination:to,
      amount:amt.toFixed(2), time:nonce
    };
    const sig = await State.wallet.signTypedData(
      {name:'HyperliquidSignTransaction',version:'1',chainId:42161,verifyingContract:'0x0000000000000000000000000000000000000000'},
      {'HyperliquidTransaction:Withdraw':[
        {name:'hyperliquidChain',type:'string'},
        {name:'destination',type:'string'},
        {name:'amount',type:'string'},
        {name:'time',type:'uint64'}
      ]},
      {hyperliquidChain:'Mainnet', destination:to, amount:action.amount, time:nonce}
    );
    const {r,s,v} = ethers.Signature.from(sig);
    const res = await fetch(HL_API+'/exchange', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({action,nonce,signature:{r,s,v}})
    });
    const d = await res.json();
    if (d.status!=='ok') throw new Error(JSON.stringify(d));
    closeModal('modalWithdraw');
    toast(`✅ سحب ${amt} USDC قيد المعالجة`,'ok',5000);
    setTimeout(pollAccount, 5000);
  } catch(e){ toast(`❌ ${e.message.slice(0,120)}`,'err',5000); }
  finally { resetBtn('withdrawExecute'); hideLoader(); }
}

// ═══════════════════════════════════════
// 🔑 دخول / خروج
// ═══════════════════════════════════════

async function login() {
  let key = $('privateKey').value.trim();
  if (!key) return toast('أدخل المفتاح الخاص','err');
  key = key.startsWith('0x') ? key : '0x'+key;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return toast('المفتاح 64 حرف hex','err');

  setBtnLoading('loginBtn','⏳');
  showLoader('التحقق من المحفظة...');
  try {
    State.wallet = new ethers.Wallet(key);
    sessionStorage.setItem('hl_key', key);

    const short = State.wallet.address.slice(0,6)+'...'+State.wallet.address.slice(-4);
    setTxt('navAddress', short);
    $('withdrawAddress').value = State.wallet.address;

    $('loginScreen').classList.add('hidden');
    $('appScreen').classList.remove('hidden');

    switchAsset('GOLD');
    showLoader('جلب الأسعار والحساب...');
    await Promise.all([pollPrices(), pollAccount()]);
    hideLoader();
    toast('مرحباً 🤝','ok');

    // timers
    State.timers.push(
      setInterval(pollPrices,  1000),
      setInterval(pollAccount, 8000)
    );
  } catch(e) {
    hideLoader();
    State.wallet = null;
    sessionStorage.removeItem('hl_key');
    toast('خطأ: '+e.message.slice(0,80),'err');
  } finally {
    resetBtn('loginBtn');
  }
}

function doLogout() {
  State.timers.forEach(clearInterval);
  clearInterval(State.priceTimer);
  sessionStorage.removeItem('hl_key');
  State.wallet=null; State.positions=[]; State.openOrders=[];
  closeModal('modalLogout');
  $('appScreen').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('privateKey').value='';
  toast('تم الخروج بأمان','info');
}

// ═══════════════════════════════════════
// 🔗 ربط الأحداث
// ═══════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

  // دخول
  $('loginBtn').onclick = login;
  $('privateKey').onkeydown = e => e.key==='Enter' && login();
  $('toggleKey').onclick = () => {
    const i=$('privateKey');
    i.type = i.type==='password'?'text':'password';
    $('toggleKey').textContent = i.type==='password'?'👁':'🙈';
  };

  // تبويب الأصول
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>switchAsset(t.dataset.asset));

  // أزرار التداول
  $('btnBuy').onclick  = () => State.wallet ? askTrade(true)  : toast('سجّل الدخول أولاً','err');
  $('btnSell').onclick = () => State.wallet ? askTrade(false) : toast('سجّل الدخول أولاً','err');

  // كمية مخصصة
  $('qtyInput').oninput = function(){
    State.qty = parseFloat(this.value)||0;
    $('qtyPresets').querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active'));
  };

  // 100% من الرصيد
  $('qty100').onclick = () => {
    if (!State.wallet) return toast('سجّل الدخول','err');
    const a=ASSETS[State.asset], bal=State.balance?.free||0, px=State.prices[State.asset]?.mid;
    if (!bal||!px) return toast('رصيد غير متاح','err');
    State.qty = parseFloat(wire((bal*a.lev)/px, a.szDp));
    $('qtyInput').value = State.qty;
    $('qtyPresets').querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active'));
    toast(`✅ الكمية: ${State.qty} ${a.unit}`,'ok');
  };

  // شريط التنقل
  $('btnBalance').onclick = () => State.wallet && showBalance();
  $('btnDeposit').onclick = () => State.wallet && openModal('modalDeposit');
  $('btnWithdraw').onclick = () => State.wallet && openModal('modalWithdraw');
  $('btnLogout').onclick  = () => State.wallet && openModal('modalLogout');

  // إغلاق الكل
  $('btnCloseAll').onclick = askCloseAll;

  // تأكيد صفقة
  $('confirmCancel').onclick  = () => { closeModal('modalConfirm'); State.pendingTrade=null; };
  $('confirmExecute').onclick = execTrade;

  // إغلاق فردي
  $('closeCancel').onclick  = () => { closeModal('modalClose'); State.pendingClose=null; };
  $('closeExecute').onclick = execClose;

  // إغلاق الكل
  $('closeAllCancel').onclick  = () => closeModal('modalCloseAll');
  $('closeAllExecute').onclick = execCloseAll;

  // TP
  $('tpCancel').onclick  = () => { closeModal('modalTP'); State.pendingTP=null; };
  $('tpExecute').onclick = execTP;
  $('tpDelete').onclick  = deleteTP;
  $('tpAmount').oninput  = recalcTpPreview;

  // SL
  $('slCancel').onclick  = () => { closeModal('modalSL'); State.pendingSL=null; };
  $('slExecute').onclick = execSL;
  $('slDelete').onclick  = deleteSL;
  $('slAmount').oninput  = recalcSlPreview;

  // رصيد
  $('balanceClose').onclick  = () => closeModal('modalBalance');

  // إيداع / سحب
  $('depositCancel').onclick   = () => closeModal('modalDeposit');
  $('depositExecute').onclick  = doDeposit;
  $('withdrawCancel').onclick  = () => closeModal('modalWithdraw');
  $('withdrawExecute').onclick = doWithdraw;

  // خروج
  $('logoutCancel').onclick  = () => closeModal('modalLogout');
  $('logoutExecute').onclick = doLogout;

  // نسخ العنوان
  $('navAddress').onclick = () => {
    if (!State.wallet) return;
    navigator.clipboard?.writeText(State.wallet.address)
      .then(()=>toast('تم نسخ العنوان','info',2000));
  };

  // إغلاق modals بالنقر خارجها
  document.querySelectorAll('.modal-overlay').forEach(o=>
    o.onclick = e => { if(e.target===o) o.classList.remove('open'); }
  );

  // استعادة الجلسة
  const saved = sessionStorage.getItem('hl_key');
  if (saved) { $('privateKey').value=saved; login(); }

  console.log('⚡ HL Trade v6.0 | TP/SL Native | MsgPack Built-in');
});
