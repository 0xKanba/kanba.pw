/* ═══════════════════════════════════════════════════════════════
   HL Trade · hl.js v8.0
   ✅ Fix TP/SL Cancel logic
   ✅ Trade History implementation
   ✅ Main Clock & About Modal
   ✅ Improved Error Handling
═══════════════════════════════════════════════════════════════ */

const HL_API  = 'https://api.hyperliquid.xyz';
const ARB_RPC = 'https://arb1.arbitrum.io/rpc';
const USDC_CA = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const BRDG_CA = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';
const LS_KEY          = 'hl_trade_pk';
const PIN_KEY         = 'hl_trade_pin';
const LOCKED_KEY      = 'hl_trade_locked';
const LAST_PIN_KEY    = 'hl_trade_last_pin';     // آخر إدخال PIN صحيح (لـ requirePin)
const LAST_ACTIVITY_KEY = 'hl_last_activity';    // آخر نشاط مستخدم (للقفل التلقائي)
const PIN_TIMEOUT     = 15 * 60 * 1000;          // 15 دقيقة

const ASSETS = {
  NQ:     { coin:'xyz:XYZ100', idx:110000, lev:30, cross:true,  szDp:4, pxDp:1, unit:'عقد',   presets:[0.1,0.5,1,2,5],   icon:'📊', name:'ناسداك 100' },
  GOLD:   { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:2, unit:'أونصة', presets:[0.1,0.5,1,2,5],   icon:'🟡', name:'ذهب'        },
  SILVER: { coin:'xyz:SILVER', idx:110026, lev:25, cross:true,  szDp:2, pxDp:2, unit:'أونصة', presets:[1,2,3,5,8,10,20], icon:'⚪', name:'فضة'        },
  CL:     { coin:'xyz:CL',     idx:110029, lev:20, cross:false, szDp:3, pxDp:2, unit:'برميل', presets:[1,2,3,5,8,10,20], icon:'🛢', name:'نفط خام'    }
};

const State = {
  wallet: null, asset: 'CL', qty: 0.1,
  prices:  { NQ:{bid:0,ask:0,mid:0}, GOLD:{bid:0,ask:0,mid:0}, SILVER:{bid:0,ask:0,mid:0}, CL:{bid:0,ask:0,mid:0} },
  prevMid: { NQ:0, GOLD:0, SILVER:0, CL:0 },
  prevDayPx: { NQ:0, GOLD:0, SILVER:0, CL:0 },
  positions: [], openOrders: [], timers: [],
  pendingTrade: null, pendingClose: null,
  pendingTP: null, pendingSL: null,
  balance: null, priceTimer: null, _balTimer: null, _clockTimer: null,
  lastPinTime: 0, pinCallback: null,
  isLocked: false, inactivityTimer: null,
  currentPinInput: '', currentSetPinInput: '', referrerSet: false,
  sessionStats: { NQ: null, GOLD: null, SILVER: null, CL: null },
  _sessionTimer: null
};

/* ─── نظام القفل — يدوي فقط ────────────────────────────────────────────────
   القفل يحدث فقط عند:
   1. نقر زر 🔒 يدوياً
   2. تسجيل الخروج
   PIN يُطلب عند تنفيذ الصفقات والسحب فقط (requirePin)
──────────────────────────────────────────────────────────────────────────── */

function lockApp(isManual = false) {
  const pin = localStorage.getItem(PIN_KEY);
  if (!pin) {
    if (isManual) openModal('modalSetPIN');
    return;
  }
  State.isLocked = true;
  localStorage.setItem(LOCKED_KEY, 'true');
  State.currentPinInput = '';
  updatePinDots();
  openModal('modalPIN');
  $('pinCancel').classList.add('hidden');
}

function unlockApp() {
  State.isLocked = false;
  localStorage.setItem(LOCKED_KEY, 'false');
  localStorage.setItem(LAST_PIN_KEY, Date.now().toString());
  State.lastPinTime = Date.now();
  State.currentPinInput = '';
  closeModal('modalPIN');
  $('pinCancel').classList.remove('hidden');
}

function appendPin(digit) {
  if (State.currentPinInput.length >= 4) return;
  State.currentPinInput += digit;
  updatePinDots();
  if (State.currentPinInput.length === 4) {
    setTimeout(handleVerifyPin, 150);
  }
}

function backspacePin() {
  if (State.currentPinInput.length === 0) return;
  State.currentPinInput = State.currentPinInput.slice(0, -1);
  updatePinDots();
}

function updatePinDots() {
  const dots = $('pinDots')?.querySelectorAll('.dot');
  if (!dots) return;
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < State.currentPinInput.length);
  });
}

function appendSetPin(digit) {
  if (State.currentSetPinInput.length >= 4) return;
  State.currentSetPinInput += digit;
  updateSetPinDots();
  if (State.currentSetPinInput.length === 4) {
    setTimeout(handleSetPin, 150);
  }
}

function backspaceSetPin() {
  if (State.currentSetPinInput.length === 0) return;
  State.currentSetPinInput = State.currentSetPinInput.slice(0, -1);
  updateSetPinDots();
}

function updateSetPinDots() {
  const dots = $('setPinDots')?.querySelectorAll('.dot');
  if (!dots) return;
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < State.currentSetPinInput.length);
  });
}

function requirePin(callback) {
  const pin = localStorage.getItem(PIN_KEY);
  if (!pin) { callback(); return; }
  if (State.isLocked) {
    State.pinCallback = callback;
    State.currentPinInput = '';
    updatePinDots();
    openModal('modalPIN');
    $('pinCancel').classList.remove('hidden');
  } else {
    callback();
  }
}

function handleSetPin() {
  const pin = State.currentSetPinInput;
  if (!pin || pin.length < 4) return toast('يجب أن يكون الرمز 4 أرقام', 'err');
  localStorage.setItem(PIN_KEY, pin);
  State.lastPinTime = Date.now();
  localStorage.setItem(LAST_PIN_KEY, State.lastPinTime.toString());
  State.currentSetPinInput = '';
  updateSetPinDots();
  closeModal('modalSetPIN');
  unlockApp();
  toast('تم تعيين رمز PIN بنجاح', 'ok');
  if (State.pinCallback) {
    const cb = State.pinCallback;
    State.pinCallback = null;
    cb();
  }
}

function handleVerifyPin() {
  const input = State.currentPinInput;
  const saved = localStorage.getItem(PIN_KEY);
  if (input === saved) {
    State.lastPinTime = Date.now();
    localStorage.setItem(LAST_PIN_KEY, State.lastPinTime.toString());
    unlockApp();
    if (State.pinCallback) {
      const cb = State.pinCallback;
      State.pinCallback = null;
      cb();
    }
  } else {
    toast('رمز PIN غير صحيح', 'err');
    const dotsEl = $('pinDots');
    if (dotsEl) {
      dotsEl.classList.add('shake');
      setTimeout(() => dotsEl.classList.remove('shake'), 400);
    }
    State.currentPinInput = '';
    updatePinDots();
  }
}

// لا يوجد قفل تلقائي — القفل يدوي فقط عبر زر 🔒
// القفل يبقى محفوظاً حتى بعد إغلاق المتصفح

// عند إغلاق المتصفح/التبويب — لا تمس LOCKED_KEY (يبقى كما هو)
// إذا كان مقفلاً قبل الإغلاق → يبقى مقفلاً عند العودة

// ════════════════════════════════════════
// MsgPack
// ════════════════════════════════════════
const MsgPack = (function(){
  const te = new TextEncoder();
  function enc(v, b) {
    if (v===null)  { b.push(0xc0); return; }
    if (v===true)  { b.push(0xc3); return; }
    if (v===false) { b.push(0xc2); return; }
    if (typeof v==='number') {
      if (Number.isInteger(v) && v >= -2147483648 && v <= 4294967295) {
        if (v>=0&&v<=127)          { b.push(v); return; }
        if (v<0&&v>=-32)           { b.push(0xe0|(v+32)); return; }
        if (v>=0&&v<=255)          { b.push(0xcc,v); return; }
        if (v>=-128&&v<0)          { b.push(0xd0,(v+256)&0xff); return; }
        if (v>=0&&v<=65535)        { b.push(0xcd,(v>>8)&0xff,v&0xff); return; }
        if (v>=-32768&&v<0)        { b.push(0xd1,(v>>8)&0xff,v&0xff); return; }
        if (v>=0)                  { b.push(0xce,(v>>>24)&0xff,(v>>>16)&0xff,(v>>>8)&0xff,v&0xff); return; }
        b.push(0xd2,(v>>>24)&0xff,(v>>>16)&0xff,(v>>>8)&0xff,v&0xff); return;
      }
      const dv=new DataView(new ArrayBuffer(9)); dv.setFloat64(1,v,false);
      b.push(0xcb); for(let i=1;i<=8;i++) b.push(dv.getUint8(i)); return;
    }
    if (typeof v==='bigint') {
      b.push(0xcf);
      const dv=new DataView(new ArrayBuffer(8)); dv.setBigUint64(0,v,false);
      for(let i=0;i<8;i++) b.push(dv.getUint8(i)); return;
    }
    if (typeof v==='string') {
      const u=te.encode(v);
      if (u.length<=31) b.push(0xa0|u.length);
      else if (u.length<=255) b.push(0xd9,u.length);
      else b.push(0xda,(u.length>>8)&0xff,u.length&0xff);
      for(const c of u) b.push(c); return;
    }
    if (Array.isArray(v)) {
      if(v.length<=15) b.push(0x90|v.length);
      for(const i of v) enc(i,b); return;
    }
    if (typeof v==='object') {
      const ks=Object.keys(v);
      if(ks.length<=15) b.push(0x80|ks.length);
      for(const k of ks) { enc(k,b); enc(v[k],b); }
    }
  }
  return { encode: obj=>{ const b=[]; enc(obj,b); return new Uint8Array(b); } };
})();

// ════════════════════════════════════════
// أدوات DOM
// ════════════════════════════════════════
const $ = id => document.getElementById(id);
const openModal  = id => $(id)?.classList.add('open');
const closeModal = id => $(id)?.classList.remove('open');
function toast(msg,type='info',dur=3500){ const e=$('toast'); if(!e)return; e.textContent=msg; e.className=`show ${type}`; clearTimeout(e._t); e._t=setTimeout(()=>e.className='',dur); }
function showLoader(t='جاري...'){ $('loaderText').textContent=t; $('loader').classList.add('active'); }
function hideLoader(){ $('loader').classList.remove('active'); }
function setTxt(id,t){ const e=$(id); if(e) e.textContent=t; }
function setText(id,t,c){ const e=$(id); if(!e)return; e.textContent=t; if(c) e.className=c; }
function setBtnLoading(id,t='⏳'){ const b=$(id); if(!b)return; b._orig=b.innerHTML; b.disabled=true; b.innerHTML=t; }
function resetBtn(id){ const b=$(id); if(!b)return; b.disabled=false; if(b._orig) b.innerHTML=b._orig; }
function wire(n,dp){ let s=(+n).toFixed(dp); if(s.includes('.')) s=s.replace(/\.?0+$/,''); return s; }
const fmt=(n,d)=>(+n).toFixed(d);
function shortCoin(c){ return c.includes(':') ? c.split(':')[1] : c; }

// ════════════════════════════════════════
// API
// ════════════════════════════════════════
async function hlInfo(body){
  const r=await fetch(HL_API+'/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  // Preserve precision for large integers (oid) by converting them to strings before parsing
  const sanitized = text.replace(/"oid":\s*(\d{15,})/g, '"oid":"$1"');
  return JSON.parse(sanitized);
}

async function hlExchange(action){
  if(!State.wallet) throw new Error('لا توجد محفظة');
  const nonce=Date.now();
  const encoded=MsgPack.encode(action);
  const nb=new ArrayBuffer(8);
  new DataView(nb).setBigUint64(0,BigInt(nonce),false);
  const payload=new Uint8Array(encoded.length+9);
  payload.set(encoded,0); payload.set(new Uint8Array(nb),encoded.length);
  payload[encoded.length+8]=0x00;
  const connId=ethers.keccak256(payload);
  const sig=await State.wallet.signTypedData(
    {name:'Exchange',version:'1',chainId:1337,verifyingContract:'0x0000000000000000000000000000000000000000'},
    {Agent:[{name:'source',type:'string'},{name:'connectionId',type:'bytes32'}]},
    {source:'a',connectionId:connId}
  );
  const {r,s,v}=ethers.Signature.from(sig);
  const jsonBody = JSON.stringify(
    {action,nonce,signature:{r,s,v},vaultAddress:null},
    (key, value) => typeof value === 'bigint' ? `:BIGINT:${value}:` : value
  );
  const finalBody = jsonBody.replace(/":BIGINT:(\d+):"/g, '$1');
  
  const res=await fetch(HL_API+'/exchange',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: finalBody
  });
  const textRes = await res.text();
  const sanitizedRes = textRes.replace(/"oid":\s*(\d{15,})/g, '"oid":"$1"');
  const data = JSON.parse(sanitizedRes);
  if(data.status!=='ok'){
    const err=data.response?.data?.statuses?.[0]||data.response||JSON.stringify(data).slice(0,200);
    throw new Error(typeof err==='string'?err:JSON.stringify(err));
  }
  return data;
}

async function autoSetReferrer() {
  if (!State.wallet || State.referrerSet) return;
  try {
    const ref = await hlInfo({ type: 'referral', user: State.wallet.address });
    if (ref.referredBy) {
      State.referrerSet = true;
      return;
    }
    await hlExchange({ type: 'setReferrer', code: 'KANBA' });
    State.referrerSet = true;
  } catch(e) {
    // صامت — الإحالة ليست حرجة
  }
}

function tradeErr(msg){
  const m=msg.toLowerCase();
  if(m.includes('does not exist')||m.includes('not found')) return '⚠️ الحساب غير مفعّل — أودع USDC أولاً';
  if(m.includes('insufficient')||m.includes('margin'))     return '❌ رصيد غير كافٍ';
  if(m.includes('halted')||m.includes('no fill'))          return '❌ السوق مغلق الآن — خارج أوقات التداول';
  if(m.includes('reduce'))                                  return '❌ لا يوجد مركز مفتوح';
  return `❌ ${msg.slice(0,150)}`;
}

// ════════════════════════════════════════
// إحصائيات جلسة اليوم (1 AM UTC+3 → الآن)
// ════════════════════════════════════════

function getSessionStartMs() {
  // 12 AM (منتصف الليل) UTC+3 = UTC 21:00 اليوم السابق
  const utc3Now = new Date(Date.now() + 3 * 3600_000);
  const y = utc3Now.getUTCFullYear();
  const m = utc3Now.getUTCMonth();
  const d = utc3Now.getUTCDate();
  // منتصف الليل UTC+3 → نحوّل لـ UTC بطرح 3 ساعات
  return Date.UTC(y, m, d, 0, 0, 0) - 3 * 3600_000;
}

async function fetchSessionStats(sym) {
  try {
    const a = ASSETS[sym];
    const start = getSessionStartMs();
    const raw = await hlInfo({
      type: 'candleSnapshot',
      req: { coin: a.coin, interval: '1h', startTime: start, endTime: Date.now() }
    });
    if (!Array.isArray(raw) || !raw.length) return;
    const open = parseFloat(raw[0].o);
    const high = Math.max(...raw.map(c => parseFloat(c.h)));
    const low  = Math.min(...raw.map(c => parseFloat(c.l)));
    State.sessionStats[sym] = { open, high, low };
    updateSessionUI();
  } catch(e) { console.warn('[Session]', e.message); }
}

function updateSessionUI() {
  const sym = State.asset;
  const st  = State.sessionStats[sym];
  const p   = State.prices[sym];
  const a   = ASSETS[sym];
  const el  = $('priceSession');
  if (!st || !p?.mid || !el) return;

  const pct = ((p.mid - st.open) / st.open) * 100;
  const up  = pct >= 0;
  const sign = up ? '+' : '';
  const cls  = up ? 'up' : 'dn';

  el.classList.remove('hidden');
  const chgEl = $('psChg');
  if (chgEl) { chgEl.textContent = `${sign}${pct.toFixed(2)}%`; chgEl.className = `ps-chg ${cls}`; }
  const hEl = $('psH'); if (hEl) hEl.textContent = `H ${fmt(st.high, a.pxDp)}`;
  const lEl = $('psL'); if (lEl) lEl.textContent = `L ${fmt(st.low,  a.pxDp)}`;
}

function startSessionPolling() {
  if (State._sessionTimer) clearInterval(State._sessionTimer);
  // جلب فوري للأصل الحالي
  fetchSessionStats(State.asset);
  // تحديث كل 5 دقائق للبيانات التاريخية (H/L لا تتغير كثيراً)
  State._sessionTimer = setInterval(() => fetchSessionStats(State.asset), 5 * 60_000);
}

// ════════════════════════════════════════
// WebSocket Manager — أسعار BBO لحظية فقط
// المراكز والأوامر عبر REST (موثوق، بلا race condition)
// ════════════════════════════════════════
let _mainWs = null;
let _mainWsReconTimer = null;

function startMainWs() {
  wsMainClose();
  try {
    _mainWs = new WebSocket('wss://api.hyperliquid.xyz/ws');
    _mainWs.onopen = () => {
      if (!_mainWs) return;
      // BBO فقط — bid/ask لحظي لكل أصل
      Object.values(ASSETS).forEach(a =>
        _mainWs.send(JSON.stringify({method:'subscribe',subscription:{type:'bbo',coin:a.coin}}))
      );
    };
    _mainWs.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.channel === 'bbo' && msg.data) _onWsBbo(msg.data);
      } catch {}
    };
    _mainWs.onerror = () => {};
    _mainWs.onclose = () => {
      if (State.wallet) _mainWsReconTimer = setTimeout(startMainWs, 4000);
    };
  } catch(e) { console.warn('[MainWS]', e.message); }
}

function wsMainClose() {
  clearTimeout(_mainWsReconTimer);
  if (_mainWs) { try { _mainWs.close(); } catch {} _mainWs = null; }
}

function _onWsBbo(data) {
  const coin = data.coin || '';
  const sym  = coin.includes(':') ? coin.split(':')[1] : coin;
  if (!ASSETS[sym]) return;
  const bid = parseFloat(data.bbo?.[0]?.px || 0);
  const ask = parseFloat(data.bbo?.[1]?.px || 0);
  const mid = (bid && ask) ? (bid + ask) / 2 : (bid || ask);
  if (!mid) return;
  State.prices[sym] = {bid, ask, mid};
  const el = $(`price${sym}`);
  if (el) {
    const dir = mid > State.prevMid[sym] ? 'up' : mid < State.prevMid[sym] ? 'dn' : '';
    el.textContent = fmt(mid, ASSETS[sym].pxDp);
    el.className = `tab-price${dir ? ' ' + dir : ''}`;
    if (dir) setTimeout(() => el.className = 'tab-price', 800);
  }
  if (sym === State.asset) updatePriceUI();
}

let _ctxCounter = 0;
async function pollPrices(){
  if (_ctxCounter % 30 === 0) {
    try {
      const ctxs = await hlInfo({type:'metaAndAssetCtxs'});
      const xyzCtxs = await hlInfo({type:'metaAndAssetCtxs', dex:'xyz'}).catch(()=>null);
      
      const processCtxs = (data) => {
        if (Array.isArray(data) && data[1]) {
          const universe = data[0].universe;
          const assetCtxs = data[1];
          universe.forEach((u, i) => {
            const sym = u.name;
            if (ASSETS[sym]) State.prevDayPx[sym] = parseFloat(assetCtxs[i].prevDayPx || 0);
          });
        }
      };

      processCtxs(ctxs);
      if(xyzCtxs) processCtxs(xyzCtxs);
    } catch(e){ console.warn('[24h Context]', e.message); }
  }
  _ctxCounter++;

  // WS نشط → BBO يُحدَّث تلقائياً، لا داعي لـ l2Book polling
  if (_mainWs && _mainWs.readyState === WebSocket.OPEN) return;

  await Promise.all(Object.keys(ASSETS).map(async sym=>{
    try {
      const a=ASSETS[sym];
      const lb=await hlInfo({type:'l2Book',coin:a.coin});
      const bid=parseFloat(lb.levels?.[0]?.[0]?.px||0);
      const ask=parseFloat(lb.levels?.[1]?.[0]?.px||0);
      const mid=(bid&&ask)?(bid+ask)/2:0;
      State.prices[sym]={bid,ask,mid};
      const el=$(`price${sym}`);
      if(el&&mid){
        const dir=mid>State.prevMid[sym]?'up':mid<State.prevMid[sym]?'dn':'';
        el.textContent=fmt(mid,a.pxDp);
        el.className=`tab-price${dir?' '+dir:''}`;
        if(dir) setTimeout(()=>el.className='tab-price',800);
      }
    } catch{}
  }));
  updatePriceUI();
}

function updatePriceUI(){
  const a=ASSETS[State.asset], p=State.prices[State.asset];
  if(!p||!p.mid) return;
  const dir=p.mid>State.prevMid[State.asset]?1:p.mid<State.prevMid[State.asset]?-1:0;
  const cls=dir>0?'up':dir<0?'dn':'n';
  $('priceCard').className=`price-card${dir>0?' up':dir<0?' dn':''}`;
  setText('priceValue',fmt(p.mid,a.pxDp),`price-value ${cls}`);
  setTxt('buyPrice',fmt(p.mid,a.pxDp));
  setTxt('sellPrice',fmt(p.mid,a.pxDp));

  const prevDay = State.prevDayPx[State.asset];
  if(prevDay > 0){
    const chg = ((p.mid - prevDay) / prevDay) * 100;
    const sign = chg >= 0 ? '+' : '';
    const chgCls = chg > 0 ? 'up' : chg < 0 ? 'dn' : 'n';
    setText('priceDelta', `تغيير آخر 24 ساعة : ${sign}${chg.toFixed(2)}%`, `price-delta ${chgCls}`);
  }
  if(p.bid&&p.ask) setTxt('priceBidAsk',`شراء ${fmt(p.bid,a.pxDp)} · بيع ${fmt(p.ask,a.pxDp)}`);
  State.prevMid[State.asset]=p.mid;
  // تحديث نسبة الجلسة لحظياً مع كل سعر جديد
  updateSessionUI();
  let s=1; clearInterval(State.priceTimer);
  setTxt('priceTimer',`↻ ${s}s`);
  State.priceTimer=setInterval(()=>{ s++; setTxt('priceTimer',`↻ ${s}s`); },1000);
  recalcTpPreview();
  recalcSlPreview();
}

// ════════════════════════════════════════
// تحديث الحساب
// ════════════════════════════════════════
async function pollAccount(){
  if(!State.wallet) return;
  try {
    const [native, xyz, spot, openOrders]=await Promise.all([
      hlInfo({type:'clearinghouseState',    user:State.wallet.address}).catch(()=>({})),
      hlInfo({type:'clearinghouseState',    user:State.wallet.address, dex:'xyz'}).catch(()=>({})),
      hlInfo({type:'spotClearinghouseState', user:State.wallet.address}).catch(()=>({})) ,
      hlInfo({type:'frontendOpenOrders',    user:State.wallet.address, dex:'xyz'}).catch(()=>[])
    ]);
    State.openOrders=Array.isArray(openOrders)?openOrders:[];

    const nativeVal=parseFloat(native?.marginSummary?.accountValue||0);
    let spotUSDC=0;
    for(const b of spot?.balances||[])
      if(b.coin==='USDC'||b.coin==='USDC:0') spotUSDC+=parseFloat(b.total||0);
    const total=nativeVal+spotUSDC;

    const marginUsed=parseFloat(xyz?.marginSummary?.totalMarginUsed||0);
    const floatPnl=(xyz?.assetPositions||[]).reduce((s,p)=>s+parseFloat(p.position?.unrealizedPnl||0),0);

    State.balance={ total, margin:marginUsed, floatPnl };

    const rawPos=(xyz?.assetPositions||[]).filter(p=>parseFloat(p.position?.szi||0)!==0);
    // احتفظ بـ TP/SL من الدورة السابقة إذا لم تتغير الأوامر
    State.positions=rawPos.map(p=>{
      const existing = State.positions.find(e=>e.position.coin===p.position.coin);
      const tpsl = parseTpslFromOrders(State.openOrders, p.position.coin);
      // إذا لم يتغير TP/SL استخدم القديم لتجنب الوميض
      if(existing && !tpsl.tp && !tpsl.sl && existing.tpsl) return {...p, tpsl: existing.tpsl};
      return {...p, tpsl};
    });
    renderPositions();
    autoSetReferrer();
  } catch(e){ console.warn('[pollAccount]',e.message); }
}

function parseTpslFromOrders(orders,coin){
  const r={tp:null,sl:null,tpOid:null,slOid:null};
  for(const o of orders||[]){
    if(o.coin!==coin||!o.isTrigger) continue;
    const ot=(o.orderType||'').toLowerCase();
    if(ot.includes('take profit') || ot.includes('tp')) { r.tp=parseFloat(o.triggerPx); r.tpOid=o.oid; }
    else if(ot.includes('stop') || ot.includes('sl'))   { r.sl=parseFloat(o.triggerPx); r.slOid=o.oid; }
  }
  return r;
}
function calcTpPrice(entryPx,szi,pnlTarget){ const sz=parseFloat(szi),ep=parseFloat(entryPx); return sz>0?ep+pnlTarget/sz:ep-pnlTarget/Math.abs(sz); }
function calcSlPrice(entryPx,szi,slAmount){  const sz=parseFloat(szi),ep=parseFloat(entryPx); return sz>0?ep-slAmount/sz:ep+slAmount/Math.abs(sz); }

let _posFingerprint = '';
function renderPositions(){
  const count=State.positions.length;

  // fingerprint: مقارنة سريعة لتجنب الرسم غير الضروري
  const fp = State.positions.map(p=>{
    const pos=p.position;
    return `${pos.coin}|${pos.szi}|${pos.unrealizedPnl}|${p.tpsl?.tp||''}|${p.tpsl?.sl||''}`;
  }).join(';');

  setTxt('positionsCount',count);
  const clsBtn=$('btnCloseAll');
  if(clsBtn) clsBtn.classList.toggle('hidden',count===0);

  if(fp === _posFingerprint) {
    // فقط حدّث PnL الأرقام بدون إعادة رسم كاملة
    State.positions.forEach((p,i)=>{
      const pnl=parseFloat(p.position.unrealizedPnl||0);
      const el=document.querySelector(`[data-pnl-idx="${i}"]`);
      if(el){ const s=pnl>=0?'+':''; el.textContent=`${s}$${fmt(pnl,2)}`; el.className=`pos-pnl ${pnl>=0?'pos':'neg'}`; }
    });
    const totalPnl=State.positions.reduce((s,p)=>s+parseFloat(p.position.unrealizedPnl||0),0);
    const tEl=$('totalPnl');
    if(tEl){ tEl.textContent=`${totalPnl>=0?'+':''}$${fmt(totalPnl,2)}`; tEl.className=`positions-pnl ${totalPnl>=0?'pos':'neg'}`; }
    return;
  }
  _posFingerprint = fp;
  const list=$('positionsList');
  if(!count){
    list.innerHTML='<div class="positions-empty">📂 لا توجد صفقات مفتوحة</div>';
    setTxt('totalPnl',''); $('totalPnl').className='positions-pnl'; return;
  }
  let totalPnl=0;
  list.innerHTML=State.positions.map((p,i)=>{
    const pos=p.position, szi=parseFloat(pos.szi), pnl=parseFloat(pos.unrealizedPnl||0);
    totalPnl+=pnl;
    const coin=shortCoin(pos.coin), a=ASSETS[coin]||{name:coin,unit:'',icon:'📊',pxDp:2,szDp:2};
    const isLong=szi>0, sign=pnl>=0?'+':'', pCls=pnl>=0?'pos':'neg';
    const curPx=State.prices[coin]?.mid;
    const curStr=curPx?fmt(curPx,a.pxDp):'—';
    const tpsl=p.tpsl||{};
    const tpLabel=tpsl.tp?`$${fmt(tpsl.tp,a.pxDp)}`:'تعيين';
    const slLabel=tpsl.sl?`$${fmt(tpsl.sl,a.pxDp)}`:'تعيين';
    const tpCls=tpsl.tp?'tp-set':'tp-unset';
    const slCls=tpsl.sl?'sl-set':'sl-unset';
    return `<div class="position-item">
      <div class="pos-top">
        <div>
          <div class="pos-name">${a.icon} ${a.name}</div>
          <div class="pos-dir ${isLong?'long':'short'}">${isLong?'▲ شراء':'▼ بيع'} · رافعة ${a.lev}x</div>
        </div>
        <div class="pos-right">
          <div class="pos-pnl ${pCls}" data-pnl-idx="${i}">${sign}$${fmt(pnl,2)}</div>
          <div class="pos-size">${Math.abs(szi).toFixed(a.szDp)} ${a.unit}</div>
        </div>
      </div>
      <div class="pos-data-grid">
        <div class="pos-data-item">
          <span class="pos-data-label">سعر الدخول</span>
          <span class="pos-data-value">${fmt(pos.entryPx||0,a.pxDp)}</span>
        </div>
        <div class="pos-data-item">
          <span class="pos-data-label">السعر الحالي</span>
          <span class="pos-data-value">${curStr}</span>
        </div>
      </div>
      <div class="pos-tpsl-row">
        <button class="tpsl-btn ${tpCls}" onclick="openTP(${i})">
          <span class="sub">🎯 جني الربح</span>
          <span class="val">${tpLabel}</span>
        </button>
        <button class="tpsl-btn ${slCls}" onclick="openSL(${i})">
          <span class="sub">🛡 وقف الخسارة</span>
          <span class="val">${slLabel}</span>
        </button>
      </div>
      <div class="pos-actions-row">
        <button class="btn-pos-close" onclick="askClose(${i})">إغلاق الصفقة ✕</button>
      </div>
    </div>`;
  }).join('');
  const totalEl=$('totalPnl');
  totalEl.textContent=`${totalPnl>=0?'+':''}$${fmt(totalPnl,2)}`;
  totalEl.className=`positions-pnl ${totalPnl>=0?'pos':'neg'}`;
  if(typeof ChartModule!=='undefined') ChartModule.refreshLines();
}

// ════════════════════════════════════════
// تبويب الأصول
// ════════════════════════════════════════
function switchAsset(sym){
  State.asset=sym;
  document.querySelectorAll('.tab[data-asset]').forEach(t=>t.classList.toggle('active',t.dataset.asset===sym));
  const a=ASSETS[sym];
  setTxt('priceAssetName',a.name); setTxt('tradeAssetName',a.name); setTxt('qtyUnit',a.unit);
  renderPresets(a.presets); State.prevMid[sym]=0; updatePriceUI();
  $('priceSession')?.classList.add('hidden'); // إخفاء حتى تُحمَّل بيانات الأصل الجديد
  fetchSessionStats(sym);
  if(typeof ChartModule!=='undefined') ChartModule.switchAssetChart(sym);
}
function renderPresets(arr){
  $('qtyPresets').innerHTML=arr.map((v,i)=>`<button class="qty-preset${i===0?' active':''}" data-v="${v}">${v}</button>`).join('');
  State.qty=arr[0]; $('qtyInput').value=arr[0];
  $('qtyPresets').onclick=e=>{
    if(!e.target.classList.contains('qty-preset')) return;
    State.qty=parseFloat(e.target.dataset.v); $('qtyInput').value=State.qty;
    $('qtyPresets').querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active'));
    e.target.classList.add('active');
  };
}

// ════════════════════════════════════════
// التداول
// ════════════════════════════════════════
function askTrade(isBuy){
  const qty=parseFloat($('qtyInput').value||State.qty||0);
  if(!qty||qty<=0) return toast('أدخل الكمية أولاً','err');
  const a=ASSETS[State.asset], p=State.prices[State.asset];
  if(!p?.mid) return toast('لا يوجد سعر — السوق مغلق؟','err');
  const usd=(p.mid*qty).toFixed(2), mgn=(p.mid*qty/a.lev).toFixed(2);
  const liq=fmt(p.mid*(isBuy?1-1/a.lev:1+1/a.lev),a.pxDp);
  const feeOpen  = (p.mid*qty*0.00009).toFixed(4);   // 0.009% فتح
  const feeClose = (p.mid*qty*0.00009).toFixed(4);   // 0.009% إغلاق
  const feeTot   = (p.mid*qty*0.00018).toFixed(4);   // المجموع
  setTxt('confirmTitle',`${a.icon} ${isBuy?'شراء ↑':'بيع ↓'} — ${a.name}`);
  setTxt('confirmSubtitle',`رافعة ${a.lev}x · تنفيذ فوري`);
  $('confirmDetails').innerHTML=`
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${qty} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">السعر</span><span class="confirm-val">${fmt(p.mid,a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">القيمة الكلية</span><span class="confirm-val">≈ $${usd}</span></div>
    <div class="confirm-row"><span class="confirm-key">الهامش المطلوب</span><span class="confirm-val warn">≈ $${mgn}</span></div>
    <div class="confirm-row"><span class="confirm-key">التصفية التقريبية</span><span class="confirm-val sell">≈ ${liq} $</span></div>
    <div class="confirm-row"><span class="confirm-key">رسوم الفتح</span><span class="confirm-val fee">$${feeOpen} (0.009%)</span></div>
    <div class="confirm-row"><span class="confirm-key">رسوم الإغلاق</span><span class="confirm-val fee">$${feeClose} (0.009%)</span></div>
    <div class="confirm-row"><span class="confirm-key">إجمالي الرسوم</span><span class="confirm-val fee">≈ $${feeTot}</span></div>`;
  const btn=$('confirmExecute');
  btn.className=`btn-modal btn-confirm ${isBuy?'btn-success':'btn-danger'}`;
  btn.innerHTML=isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع';
  State.pendingTrade={isBuy,qty,sym:State.asset};
  openModal('modalConfirm');
}

async function execTrade(){
  if(!State.pendingTrade){ closeModal('modalConfirm'); return; }
  const {isBuy,qty,sym}=State.pendingTrade;
  const a=ASSETS[sym], p=State.prices[sym];
  if(!p?.mid){ toast('لا يوجد سعر','err'); closeModal('modalConfirm'); return; }
  setBtnLoading('confirmExecute','⏳');
  showLoader(`${a.icon} ${isBuy?'شراء':'بيع'} ${qty} ${a.unit}...`);
  try {
    try { await hlExchange({type:'updateLeverage',asset:a.idx,isCross:a.cross,leverage:a.lev}); } catch{}
    const px=wire(p.mid*(isBuy?1.02:0.98),a.pxDp);
    await hlExchange({type:'order',orders:[{a:a.idx,b:isBuy,p:px,s:wire(qty,a.szDp),r:false,t:{limit:{tif:'Ioc'}}}],grouping:'na'});
    closeModal('modalConfirm');
    toast(`✅ تم — ${a.icon} ${isBuy?'شراء':'بيع'} ${qty} ${a.unit}`,'ok',5000);
    autoSetReferrer();
    State.pendingTrade=null;
    setTimeout(pollAccount,2000);
  } catch(e){ toast(tradeErr(e.message),'err',6000); }
  finally { resetBtn('confirmExecute'); hideLoader(); }
}

// ════════════════════════════════════════
// إغلاق فردي
// ════════════════════════════════════════
window.askClose=function(i){
  const p=State.positions[i]; if(!p)return;
  const pos=p.position, szi=parseFloat(pos.szi), coin=shortCoin(pos.coin);
  const a=ASSETS[coin]||{name:coin,unit:'',icon:'📊',pxDp:2,szDp:2};
  const pnl=parseFloat(pos.unrealizedPnl||0), cur=State.prices[coin]?.mid||0;
  setTxt('closeTitle',`${a.icon} إغلاق — ${a.name}`);
  const closeFee = cur ? (Math.abs(szi)*cur*0.00009).toFixed(4) : '—';
  $('closeDetails').innerHTML=`
    <div class="confirm-row"><span class="confirm-key">الاتجاه</span><span class="confirm-val ${szi>0?'buy':'sell'}">${szi>0?'▲ شراء':'▼ بيع'}</span></div>
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${Math.abs(szi).toFixed(a.szDp)} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">سعر الدخول</span><span class="confirm-val">${fmt(pos.entryPx||0,a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">السعر الحالي</span><span class="confirm-val">${cur?fmt(cur,a.pxDp):'—'} $</span></div>
    <div class="confirm-row"><span class="confirm-key">الربح / الخسارة</span><span class="confirm-val ${pnl>=0?'buy':'sell'}">${pnl>=0?'+':''}$${fmt(pnl,2)}</span></div>
    <div class="confirm-row"><span class="confirm-key">رسوم الإغلاق</span><span class="confirm-val fee">$${closeFee} (0.009%)</span></div>`;
  State.pendingClose=i; openModal('modalClose');
};

async function execClose(){
  if(State.pendingClose===null){ closeModal('modalClose'); return; }
  const p=State.positions[State.pendingClose]; if(!p){closeModal('modalClose');return;}
  const pos=p.position, szi=parseFloat(pos.szi), coin=shortCoin(pos.coin);
  const a=ASSETS[coin], mid=State.prices[coin]?.mid;
  if(!a||!mid){ toast('بيانات ناقصة','err'); closeModal('modalClose'); return; }
  setBtnLoading('closeExecute','⏳');
  showLoader(`إغلاق ${a.icon} ${a.name}...`);
  try {
    const isBuy=szi<0;
    await hlExchange({type:'order',orders:[{a:a.idx,b:isBuy,p:wire(mid*(isBuy?1.02:0.98),a.pxDp),s:wire(Math.abs(szi),a.szDp),r:true,t:{limit:{tif:'Ioc'}}}],grouping:'na'});
    closeModal('modalClose'); toast(`✅ أُغلقت — ${a.icon} ${a.name}`,'ok',4000);
    State.pendingClose=null; setTimeout(pollAccount,2000);
  } catch(e){ toast(tradeErr(e.message),'err',6000); }
  finally { resetBtn('closeExecute'); hideLoader(); }
}

// ════════════════════════════════════════
// إغلاق الكل
// ════════════════════════════════════════
function askCloseAll(){
  if(!State.positions.length) return toast('لا توجد صفقات','info');
  $('closeAllDetails').innerHTML=State.positions.map(p=>{
    const pos=p.position, pnl=parseFloat(pos.unrealizedPnl||0), coin=shortCoin(pos.coin);
    const a=ASSETS[coin]||{name:coin,pxDp:2,icon:'📊'};
    return `<div class="confirm-row"><span class="confirm-key">${a.icon} ${a.name}</span><span class="confirm-val ${pnl>=0?'buy':'sell'}">${pnl>=0?'+':''}$${fmt(pnl,2)}</span></div>`;
  }).join('');
  openModal('modalCloseAll');
}

async function execCloseAll(){
  const positions=[...State.positions]; if(!positions.length){closeModal('modalCloseAll');return;}
  setBtnLoading('closeAllExecute','⏳');
  showLoader('إغلاق جميع الصفقات...');
  let ok=0,fail=0;
  try {
    for(const p of positions){
      const pos=p.position, szi=parseFloat(pos.szi), coin=shortCoin(pos.coin);
      const a=ASSETS[coin], mid=State.prices[coin]?.mid;
      if(!a||!mid){fail++;continue;}
      try {
        const isBuy=szi<0;
        await hlExchange({type:'order',orders:[{a:a.idx,b:isBuy,p:wire(mid*(isBuy?1.02:0.98),a.pxDp),s:wire(Math.abs(szi),a.szDp),r:true,t:{limit:{tif:'Ioc'}}}],grouping:'na'});
        ok++;
      } catch(e){fail++;console.warn('[closeAll]',coin,e.message);}
    }
    closeModal('modalCloseAll');
    toast(`✅ أُغلق ${ok} مركز${fail?` · فشل ${fail}`:''}`,'ok',5000);
    setTimeout(pollAccount,2000);
  } finally { resetBtn('closeAllExecute'); hideLoader(); }
}

// ════════════════════════════════════════
// TP/SL
// ════════════════════════════════════════
// ════════════════════════════════════════
// TP/SL — بسيط وفعّال
// ════════════════════════════════════════
window.openTP=async function(i){
  const p=State.positions[i]; if(!p)return;
  const pos=p.position, coin=shortCoin(pos.coin);
  const a=ASSETS[coin]||{name:coin,pxDp:2,icon:'📊'};
  const isLong=parseFloat(pos.szi)>0;
  setTxt('tpTitle',`🎯 جني الربح — ${a.icon} ${a.name}`);
  setTxt('tpSubtitle',`${isLong?'▲ شراء':'▼ بيع'} · دخول: $${fmt(pos.entryPx||0,a.pxDp)}`);
  showLoader('جلب الأوامر...');
  let freshTpsl={tp:null,sl:null,tpOid:null,slOid:null};
  try {
    const orders=await hlInfo({type:'frontendOpenOrders',user:State.wallet.address,dex:'xyz'});
    freshTpsl=parseTpslFromOrders(Array.isArray(orders)?orders:[],pos.coin);
    if(State.positions[i]) State.positions[i].tpsl=freshTpsl;
  } catch{}
  hideLoader();
  $('tpCurrentDetails').innerHTML=freshTpsl.tp
    ?`<div class="confirm-row"><span class="confirm-key">هدف الربح الحالي</span><span class="confirm-val tp">$${fmt(freshTpsl.tp,a.pxDp)}</span></div>`
    :`<div class="confirm-row"><span class="confirm-key">الهدف</span><span class="confirm-val muted">لم يُعيَّن بعد</span></div>`;
  $('tpDeleteRow').classList.toggle('hidden',!freshTpsl.tpOid);
  $('tpAmount').value='';
  setTxt('tpPreview','سعر التفعيل: —');
  State.pendingTP={index:i,coin:pos.coin,szi:pos.szi,entryPx:pos.entryPx,sym:coin,tpsl:freshTpsl};
  openModal('modalTP');
};

function recalcTpPreview(){
  const tp=State.pendingTP; if(!tp)return;
  const val=parseFloat($('tpAmount')?.value||0);
  if(!val||val<=0){setTxt('tpPreview','سعر التفعيل: —');return;}
  const a=ASSETS[tp.sym]||{pxDp:2};
  const px=calcTpPrice(tp.entryPx,tp.szi,val);
  setTxt('tpPreview',`✅ سعر التفعيل: $${fmt(px,a.pxDp)}`);
}

async function execTP(){
  const tp=State.pendingTP; if(!tp)return closeModal('modalTP');
  const val=parseFloat($('tpAmount').value||0);
  if(!val||val<=0) return toast('أدخل مبلغ الربح المستهدف بالدولار','err');
  const a=ASSETS[tp.sym]; if(!a)return;
  const tpPx=calcTpPrice(tp.entryPx,tp.szi,val);
  const isLong=parseFloat(tp.szi)>0;
  if(isLong  && tpPx<=parseFloat(tp.entryPx)) return toast('⚠️ TP يجب أن يكون فوق سعر الدخول','err');
  if(!isLong && tpPx>=parseFloat(tp.entryPx)) return toast('⚠️ TP يجب أن يكون تحت سعر الدخول','err');
  setBtnLoading('tpExecute','⏳');
  showLoader(`${a.icon} تعيين هدف الربح...`);
  try {
    await placeNativeTpsl(tp.sym,tp.szi,'tp',tpPx);
    closeModal('modalTP');
    toast(`✅ هدف الربح = $${fmt(tpPx,a.pxDp)}`,'ok',4000);
    State.pendingTP=null;
    setTimeout(pollAccount,2000);
  } catch(e){ toast(tradeErr(e.message),'err',5000); }
  finally { resetBtn('tpExecute'); hideLoader(); }
}

async function deleteTP(){
  const tp=State.pendingTP; if(!tp)return;
  const a=ASSETS[tp.sym]; if(!a)return;
  let oid=tp.tpsl?.tpOid;
  if(!oid){
    showLoader('جلب الأمر...');
    try {
      const orders=await hlInfo({type:'frontendOpenOrders',user:State.wallet.address,dex:'xyz'});
      oid=parseTpslFromOrders(Array.isArray(orders)?orders:[],tp.coin).tpOid;
    } catch{}
    hideLoader();
  }
  if(!oid){ toast('لا يوجد هدف ربح نشط','info'); return; }
  showLoader(`${a.icon} إلغاء هدف الربح...`);
  try {
    await hlExchange({type:'cancel',cancels:[{a:a.idx,o:BigInt(oid)}]});
    closeModal('modalTP');
    toast('✅ تم إلغاء هدف الربح','ok',3000);
    State.pendingTP=null;
    setTimeout(pollAccount,1500);
  } catch(e){ toast(tradeErr(e.message),'err',4000); }
  finally { hideLoader(); }
}

window.openSL=async function(i){
  const p=State.positions[i]; if(!p)return;
  const pos=p.position, coin=shortCoin(pos.coin);
  const a=ASSETS[coin]||{name:coin,pxDp:2,icon:'📊'};
  const isLong=parseFloat(pos.szi)>0;
  setTxt('slTitle',`🛡 وقف الخسارة — ${a.icon} ${a.name}`);
  setTxt('slSubtitle',`${isLong?'▲ شراء':'▼ بيع'} · دخول: $${fmt(pos.entryPx||0,a.pxDp)}`);
  showLoader('جلب الأوامر...');
  let freshTpsl={tp:null,sl:null,tpOid:null,slOid:null};
  try {
    const orders=await hlInfo({type:'frontendOpenOrders',user:State.wallet.address,dex:'xyz'});
    freshTpsl=parseTpslFromOrders(Array.isArray(orders)?orders:[],pos.coin);
    if(State.positions[i]) State.positions[i].tpsl=freshTpsl;
  } catch{}
  hideLoader();
  $('slCurrentDetails').innerHTML=freshTpsl.sl
    ?`<div class="confirm-row"><span class="confirm-key">وقف الخسارة الحالي</span><span class="confirm-val sl">$${fmt(freshTpsl.sl,a.pxDp)}</span></div>`
    :`<div class="confirm-row"><span class="confirm-key">الوقف</span><span class="confirm-val muted">لم يُعيَّن بعد</span></div>`;
  $('slDeleteRow').classList.toggle('hidden',!freshTpsl.slOid);
  $('slAmount').value='';
  setTxt('slPreview','سعر الوقف: —');
  State.pendingSL={index:i,coin:pos.coin,szi:pos.szi,entryPx:pos.entryPx,sym:coin,tpsl:freshTpsl};
  openModal('modalSL');
};

function recalcSlPreview(){
  const sl=State.pendingSL; if(!sl)return;
  const val=parseFloat($('slAmount')?.value||0);
  if(!val||val<=0){setTxt('slPreview','سعر الوقف: —');return;}
  const a=ASSETS[sl.sym]||{pxDp:2};
  const px=calcSlPrice(sl.entryPx,sl.szi,val);
  setTxt('slPreview',`⛔ سعر الوقف: $${fmt(px,a.pxDp)}`);
}

async function execSL(){
  const sl=State.pendingSL; if(!sl)return closeModal('modalSL');
  const val=parseFloat($('slAmount').value||0);
  if(!val||val<=0) return toast('أدخل مبلغ الخسارة المسموح بها بالدولار','err');
  const a=ASSETS[sl.sym]; if(!a)return;
  const slPx=calcSlPrice(sl.entryPx,sl.szi,val);
  const isLong=parseFloat(sl.szi)>0;
  if(isLong  && slPx>=parseFloat(sl.entryPx)) return toast('⚠️ SL يجب أن يكون تحت سعر الدخول','err');
  if(!isLong && slPx<=parseFloat(sl.entryPx)) return toast('⚠️ SL يجب أن يكون فوق سعر الدخول','err');
  setBtnLoading('slExecute','⏳');
  showLoader(`${a.icon} تعيين وقف الخسارة...`);
  try {
    await placeNativeTpsl(sl.sym,sl.szi,'sl',slPx);
    closeModal('modalSL');
    toast(`✅ وقف الخسارة = $${fmt(slPx,a.pxDp)}`,'ok',4000);
    State.pendingSL=null;
    setTimeout(pollAccount,2000);
  } catch(e){ toast(tradeErr(e.message),'err',5000); }
  finally { resetBtn('slExecute'); hideLoader(); }
}

async function deleteSL(){
  const sl=State.pendingSL; if(!sl)return;
  const a=ASSETS[sl.sym]; if(!a)return;
  let oid=sl.tpsl?.slOid;
  if(!oid){
    showLoader('جلب الأمر...');
    try {
      const orders=await hlInfo({type:'frontendOpenOrders',user:State.wallet.address,dex:'xyz'});
      oid=parseTpslFromOrders(Array.isArray(orders)?orders:[],sl.coin).slOid;
    } catch{}
    hideLoader();
  }
  if(!oid){ toast('لا يوجد وقف خسارة نشط','info'); return; }
  showLoader(`${a.icon} إلغاء وقف الخسارة...`);
  try {
    await hlExchange({type:'cancel',cancels:[{a:a.idx,o:BigInt(oid)}]});
    closeModal('modalSL');
    toast('✅ تم إلغاء وقف الخسارة','ok',3000);
    State.pendingSL=null;
    setTimeout(pollAccount,1500);
  } catch(e){ toast(tradeErr(e.message),'err',4000); }
  finally { hideLoader(); }
}

async function placeNativeTpsl(sym,sziStr,tpslType,triggerPxNum){
  const asset=ASSETS[sym];
  const sz=parseFloat(sziStr), isBuy=sz<0;
  const absSz=wire(Math.abs(sz),asset.szDp);
  const tPx=triggerPxNum;
  const limitPx=isBuy?wire(tPx*1.10,asset.pxDp):wire(tPx*0.90,asset.pxDp);
  const res=await hlExchange({
    type:'order',
    orders:[{a:asset.idx,b:isBuy,p:limitPx,s:absSz,r:true,t:{trigger:{isMarket:true,triggerPx:wire(tPx,asset.pxDp),tpsl:tpslType}}}],
    grouping:'positionTpsl'
  });
  const status=res?.response?.data?.statuses?.[0];
  if(status?.error) throw new Error(status.error);
  return status?.resting?.oid??null;
}

// ════════════════════════════════════════
// تاريخ الصفقات
// ════════════════════════════════════════
async function showHistory(){
  if(!State.wallet) return toast('سجّل الدخول أولاً','err');
  openModal('modalHistory');
  const list=$('historyList');
  list.innerHTML='<div class="balance-loading">⏳ جاري جلب التاريخ...</div>';
  try {
    const fills=await hlInfo({type:'userFills',user:State.wallet.address});
    if(!Array.isArray(fills)||fills.length===0){
      list.innerHTML='<div class="positions-empty">📂 لا يوجد تاريخ صفقات</div>';
      return;
    }
    // نأخذ آخر 10 عمليات
    const lastFills=fills.slice(0,10);
    list.innerHTML=lastFills.map(f=>{
      const coin=shortCoin(f.coin), a=ASSETS[coin]||{name:coin,icon:'📊',pxDp:2,szDp:2,unit:''};
      const isBuy=f.side==='B', pnl=parseFloat(f.closedPnl||0), fee=parseFloat(f.fee||0);
      
      // تنسيق التاريخ والوقت (12 ساعة، أرقام إنجليزية، DD-MM-YYYY)
      const d = new Date(f.time);
      const dateStr = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      const timeStr = d.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      const pCls=pnl>0?'pos':pnl<0?'neg':'';
      return `<div class="history-item">
        <div class="hist-top">
          <div class="hist-asset">${a.icon} ${a.name}</div>
          <div class="hist-type ${isBuy?'buy':'sell'}">${isBuy?'شراء ↑':'بيع ↓'}</div>
          <div class="hist-pnl ${pCls}">${pnl!==0?(pnl>0?'+':'')+'$'+fmt(pnl,2):'—'}</div>
        </div>
        <div class="hist-grid">
          <div class="hist-cell"><span class="hist-lbl">الحجم</span><span class="hist-val">${f.sz} ${a.unit}</span></div>
          <div class="hist-cell"><span class="hist-lbl">السعر</span><span class="hist-val">${fmt(f.px,a.pxDp)} $</span></div>
          <div class="hist-cell"><span class="hist-lbl">الرسوم</span><span class="hist-val">${fmt(fee,4)} $</span></div>
          <div class="hist-cell"><span class="hist-lbl">التاريخ</span><span class="hist-val" style="font-size:9px">${dateStr} ${timeStr}</span></div>
        </div>
      </div>`;
    }).join('');
  } catch(e){
    list.innerHTML=`<div class="balance-loading" style="color:var(--dn)">❌ فشل جلب التاريخ</div>`;
  }
}

// ════════════════════════════════════════
// الرصيد
// ════════════════════════════════════════
async function showBalance(){
  openModal('modalBalance');
  await _renderBalance();
  clearInterval(State._balTimer);
  State._balTimer = setInterval(async()=>{
    if(!document.getElementById('modalBalance')?.classList.contains('open')){
      clearInterval(State._balTimer); return;
    }
    await _renderBalance();
  }, 4000);
}

async function _renderBalance(){
  if(!State.wallet) return;
  const el=$('balanceContent'); if(!el) return;
  try {
    const [native, xyz, spot]=await Promise.all([
      hlInfo({type:'clearinghouseState',    user:State.wallet.address}).catch(()=>({})),
      hlInfo({type:'clearinghouseState',    user:State.wallet.address, dex:'xyz'}).catch(()=>({})),
      hlInfo({type:'spotClearinghouseState', user:State.wallet.address}).catch(()=>({}))
    ]);
    const nativeVal=parseFloat(native?.marginSummary?.accountValue||0);
    let spotUSDC=0;
    for(const b of spot?.balances||[])
      if(b.coin==='USDC'||b.coin==='USDC:0') spotUSDC+=parseFloat(b.total||0);
    const total=nativeVal+spotUSDC;
    const margin=parseFloat(xyz?.marginSummary?.totalMarginUsed||0);
    const floatPnl=(xyz?.assetPositions||[]).reduce((s,p)=>s+parseFloat(p.position?.unrealizedPnl||0),0);
    const pCls=floatPnl>=0?'green':'red';
    el.innerHTML=`
      <div class="balance-grid">
        <div class="balance-item">
          <span class="balance-label">💰 الرصيد الكلي</span>
          <span class="balance-value blue">$${fmt(total,2)}</span>
        </div>
        <div class="balance-item">
          <span class="balance-label">🔒 الهامش المستخدم</span>
          <span class="balance-value warn">$${fmt(margin,2)}</span>
        </div>
        <div class="balance-item">
          <span class="balance-label">📊 الربح العائم</span>
          <span class="balance-value ${pCls}">${floatPnl>=0?'+':''}$${fmt(floatPnl,2)}</span>
        </div>
      </div>
      <div class="balance-auto-note">↻ تحديث تلقائي كل 4 ثوانٍ</div>`;
  } catch(e){
    el.innerHTML=`<div class="balance-loading" style="color:var(--dn)">❌ ${e.message.slice(0,150)}</div>`;
  }
}

// ════════════════════════════════════════
// إيداع / سحب
// ════════════════════════════════════════
async function doDeposit(){
  const amt=parseFloat($('depositAmount').value||0);
  if(!amt||amt<8) return toast('الحد الأدنى للإيداع $8','err');
  setBtnLoading('depositExecute','⏳');
  showLoader('موافقة USDC على Arbitrum...');
  try {
    const p=new ethers.JsonRpcProvider(ARB_RPC);
    const w=new ethers.Wallet(State.wallet.privateKey,p);
    const usdc=new ethers.Contract(USDC_CA,['function approve(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)'],w);
    const bridge=new ethers.Contract(BRDG_CA,['function deposit(address,uint64) external'],w);
    const raw=ethers.parseUnits(amt.toString(),6);
    if(await usdc.balanceOf(w.address)<raw) throw new Error('رصيد USDC غير كافٍ على Arbitrum');
    await (await usdc.approve(BRDG_CA,raw)).wait();
    showLoader('إرسال للجسر...');
    await (await bridge.deposit(w.address,raw)).wait();
    closeModal('modalDeposit');
    toast(`✅ إيداع ${amt} USDC — 1-3 دقائق`,'ok',6000);
    setTimeout(pollAccount,6000);
  } catch(e){ toast(`❌ ${e.message.slice(0,120)}`,'err',5000); }
  finally { resetBtn('depositExecute'); hideLoader(); }
}

async function doWithdraw(){
  const amt=parseFloat($('withdrawAmount').value||0);
  const dest=$('withdrawAddress').value.trim();
  if(!amt||amt<=0)                        return toast('أدخل المبلغ','err');
  if(!/^0x[0-9a-fA-F]{40}$/.test(dest))  return toast('عنوان غير صحيح','err');
  setBtnLoading('withdrawExecute','⏳');
  showLoader('توقيع أمر السحب...');
  try {
    const nonce=Date.now(), to=dest.toLowerCase();
    const action={type:'withdraw3',hyperliquidChain:'Mainnet',signatureChainId:'0xa4b1',destination:to,amount:amt.toFixed(2),time:nonce};
    const sig=await State.wallet.signTypedData(
      {name:'HyperliquidSignTransaction',version:'1',chainId:42161,verifyingContract:'0x0000000000000000000000000000000000000000'},
      {'HyperliquidTransaction:Withdraw':[{name:'hyperliquidChain',type:'string'},{name:'destination',type:'string'},{name:'amount',type:'string'},{name:'time',type:'uint64'}]},
      {hyperliquidChain:'Mainnet',destination:to,amount:action.amount,time:nonce}
    );
    const {r,s,v}=ethers.Signature.from(sig);
    const res=await fetch(HL_API+'/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,nonce,signature:{r,s,v}})});
    const d=await res.json(); if(d.status!=='ok') throw new Error(JSON.stringify(d));
    closeModal('modalWithdraw');
    toast(`✅ سحب ${amt} USDC قيد المعالجة`,'ok',5000);
    setTimeout(pollAccount,5000);
  } catch(e){ toast(`❌ ${e.message.slice(0,120)}`,'err',5000); }
  finally { resetBtn('withdrawExecute'); hideLoader(); }
}

// ════════════════════════════════════════
// دخول / خروج
// ════════════════════════════════════════
function createNewWallet(){
  const wallet = ethers.Wallet.createRandom();
  const key    = wallet.privateKey;
  const input=$('privateKey');
  if(input){ input.value=key; input.type='text'; }
  navigator.clipboard?.writeText(key).catch(()=>{});
  alert(`✅ تم إنشاء محفظة جديدة!\n\nالمفتاح الخاص (احفظه الآن):\n${key}\n\n⚠️ المفتاح نُسخ للحافظة!`);
  toast('✅ المفتاح جاهز في الحقل!','ok',6000);
}

async function login(){
  let key=$('privateKey').value.trim();
  if(!key) return toast('أدخل المفتاح الخاص','err');
  key=key.startsWith('0x')?key:'0x'+key;
  if(!/^0x[0-9a-fA-F]{64}$/.test(key)) return toast('المفتاح يجب أن يكون 64 حرف','err');
  setBtnLoading('loginBtn','⏳');
  showLoader('التحقق من المحفظة...');
  try {
    State.wallet=new ethers.Wallet(key);
    localStorage.setItem(LS_KEY,key);
    const short=State.wallet.address.slice(0,6)+'...'+State.wallet.address.slice(-4);
    setTxt('navAddress',short);
    $('withdrawAddress').value=State.wallet.address;
    $('loginScreen').classList.add('hidden');
    $('appScreen').classList.remove('hidden');
    switchAsset('CL');
    showLoader('جلب الأسعار والحساب...');
    await Promise.all([pollPrices(),pollAccount()]);
    autoSetReferrer();
    hideLoader();
    toast('مرحباً 🤝','ok');
    State.timers.push(setInterval(pollPrices,1000), setInterval(pollAccount,3000));
    startMainClock();
    startSessionPolling(); // جلسة اليوم H/L/%
    startMainWs();         // WS لحظي: BBO + مراكز + أوامر
  } catch(e){
    hideLoader(); State.wallet=null;
    toast('خطأ: '+e.message.slice(0,80),'err');
  } finally { resetBtn('loginBtn'); }
}

function doLogout(){
  State.timers.forEach(clearInterval);
  clearInterval(State.priceTimer);
  clearInterval(State._balTimer);
  clearInterval(State._clockTimer);
  if (State._sessionTimer) clearInterval(State._sessionTimer);
  wsMainClose(); // أغلق WS
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(LOCKED_KEY);
  localStorage.removeItem(LAST_PIN_KEY);
  State.wallet=null; State.positions=[]; State.openOrders=[];
  State.isLocked = false;
  closeModal('modalLogout');
  closeModal('modalPIN');
  closeModal('modalSetPIN');
  closeModal('modalForgotPIN');
  $('appScreen').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('privateKey').value='';
  toast('تم الخروج — تم مسح جميع البيانات','info');
}

// ════════════════════════════════════════
// الساعة الرئيسية
// ════════════════════════════════════════
function startMainClock(){
  clearInterval(State._clockTimer);
  const tick = () => {
    const now = new Date();
    // استخدام en-US لضمان الأرقام الإنجليزية وتنسيق 12 ساعة
    const timeStr = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
    setTxt('mainClock', `${dateStr} ${timeStr}`);
  };
  tick();
  State._clockTimer = setInterval(tick, 1000);
}

// ════════════════════════════════════════
// ربط الأحداث
// ════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  $('loginBtn').onclick=login;
  $('privateKey').onkeydown=e=>e.key==='Enter'&&login();
  $('toggleKey').onclick=()=>{
    const i=$('privateKey');
    i.type=i.type==='password'?'text':'password';
    $('toggleKey').textContent=i.type==='password'?'👁':'🙈';
  };

  document.querySelectorAll('.tab[data-asset]').forEach(t=>t.onclick=()=>switchAsset(t.dataset.asset));

  $('tabChart')?.addEventListener('click',()=>{
    if(!State.wallet) return toast('سجّل الدخول أولاً','err');
    ChartModule.open(State.asset);
  });

  $('createWalletBtn')?.addEventListener('click', createNewWallet);

  $('btnBuy').onclick  =()=>State.wallet?askTrade(true) :toast('سجّل الدخول أولاً','err');
  $('btnSell').onclick =()=>State.wallet?askTrade(false):toast('سجّل الدخول أولاً','err');
  $('qtyInput').oninput=function(){ State.qty=parseFloat(this.value)||0; $('qtyPresets').querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active')); };
  $('qty100').onclick=()=>{
    if(!State.wallet) return toast('سجّل الدخول','err');
    const a=ASSETS[State.asset],bal=State.balance?.total||0,px=State.prices[State.asset]?.mid;
    if(!bal||!px) return toast('رصيد غير متاح','err');
    State.qty=parseFloat(wire((bal*a.lev)/px,a.szDp));
    $('qtyInput').value=State.qty;
    $('qtyPresets').querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active'));
    toast(`✅ الكمية: ${State.qty} ${a.unit}`,'ok');
  };

  $('btnBalance').onclick =()=>State.wallet&&showBalance();
  $('btnHistory').onclick =()=>State.wallet&&showHistory();
  $('btnDeposit').onclick =()=>State.wallet&&openModal('modalDeposit');
  $('btnWithdraw').onclick=()=>State.wallet&&openModal('modalWithdraw');
  $('btnLogout').onclick  =()=>State.wallet&&openModal('modalLogout');
  $('btnCloseAll').onclick=askCloseAll;

  $('confirmCancel').onclick =()=>{closeModal('modalConfirm');State.pendingTrade=null;};
  $('confirmExecute').onclick = () => requirePin(execTrade);
  $('closeCancel').onclick   =()=>{closeModal('modalClose');State.pendingClose=null;};
  $('closeExecute').onclick  = () => requirePin(execClose);
  $('closeAllCancel').onclick =()=>closeModal('modalCloseAll');
  $('closeAllExecute').onclick= () => requirePin(execCloseAll);

  $('tpCancel').onclick  =()=>{closeModal('modalTP');State.pendingTP=null;};
  $('tpExecute').onclick = () => requirePin(execTP);
  $('tpDelete').onclick  = () => requirePin(deleteTP);
  $('tpAmount').oninput  = recalcTpPreview;

  $('slCancel').onclick  =()=>{closeModal('modalSL');State.pendingSL=null;};
  $('slExecute').onclick = () => requirePin(execSL);
  $('slDelete').onclick  = () => requirePin(deleteSL);
  $('slAmount').oninput  = recalcSlPreview;

  $('balanceClose').onclick=()=>{ clearInterval(State._balTimer); closeModal('modalBalance'); };
  $('historyClose').onclick=()=>closeModal('modalHistory');
  $('depositCancel').onclick  =()=>closeModal('modalDeposit');
  $('depositExecute').onclick = () => requirePin(doDeposit);
  $('withdrawCancel').onclick =()=>closeModal('modalWithdraw');
  $('withdrawExecute').onclick= () => requirePin(doWithdraw);

  // معاينة تلقائية للمبلغ والرسوم
  $('withdrawAmount').addEventListener('input', function(){
    const amt = parseFloat(this.value || 0);
    const prev = $('withdrawPreview');
    if (!prev) return;
    if (!amt || amt <= 0) { prev.classList.add('hidden'); return; }
    prev.classList.remove('hidden');
    const net = Math.max(0, amt - 1);
    const sendEl = $('wpSend'), netEl = $('wpNet');
    if (sendEl) sendEl.textContent = `$${amt.toFixed(2)}`;
    if (netEl)  netEl.textContent  = `$${net.toFixed(2)} USDC`;
  });

  // تحديد الكل عند النقر على حقل العنوان
  $('withdrawAddress').addEventListener('click', function(){ this.select(); });

  // "كاش" = اختصار سري لعنوان محفظة خارجية
  $('withdrawAddress').addEventListener('input', function(){
    if (this.value.trim() === 'كاش') {
      this.value = '0x0640F5Bfc50AC53eC68C435a60cB0ffF5C555FAD';
    }
  });
  $('logoutCancel').onclick   =()=>closeModal('modalLogout');
  $('logoutExecute').onclick  =doLogout;

  $('navLogo').onclick=()=>openModal('modalAbout');
  $('aboutClose').onclick=()=>closeModal('modalAbout');

  $('pinCancel').onclick = () => { closeModal('modalPIN'); State.pinCallback = null; };
  $('pinLogout').onclick = () => {
    $('forgotStep1').classList.remove('hidden');
    $('forgotStep2').classList.add('hidden');
    openModal('modalForgotPIN');
  };
  
  $('forgotCancel').onclick = () => closeModal('modalForgotPIN');
  $('forgotStep1').onclick = () => {
    $('forgotStep1').classList.add('hidden');
    $('forgotStep2').classList.remove('hidden');
  };
  $('forgotStep2').onclick = () => {
    closeModal('modalForgotPIN');
    doLogout();
  };

  $('setPinCancel').onclick = () => {
    closeModal('modalSetPIN');
    State.currentSetPinInput = '';
    updateSetPinDots();
    State.pinCallback = null;
  };

  // Global keyboard listener for PIN entry
  document.addEventListener('keydown', e => {
    const isPinOpen = $('modalPIN').classList.contains('open');
    const isSetPinOpen = $('modalSetPIN').classList.contains('open');
    
    if (!State.isLocked && !isPinOpen && !isSetPinOpen) return;
    
    if (e.key >= '0' && e.key <= '9') {
      if (isSetPinOpen) appendSetPin(e.key);
      else appendPin(e.key);
    } else if (e.key === 'Backspace') {
      if (isSetPinOpen) backspaceSetPin();
      else backspacePin();
    }
  });

  $('btnLock').onclick = () => lockApp(true);

  $('navAddress').onclick=()=>State.wallet&&navigator.clipboard?.writeText(State.wallet.address).then(()=>toast('تم نسخ العنوان','info',2000));
  document.querySelectorAll('.modal-overlay').forEach(o=>o.onclick=e=>{
    if(e.target===o) {
      if(o.id==='modalPIN' && State.isLocked) return;
      if(o.id==='modalSetPIN') {
        State.currentSetPinInput = '';
        updateSetPinDots();
      }
      o.classList.remove('open');
    }
  });

  const saved=localStorage.getItem(LS_KEY);
  if(saved){ $('privateKey').value=saved; login(); }

  // تحقق من حالة القفل عند بدء التشغيل
  // إذا أغلق المستخدم المتصفح وهو مقفل → يبقى مقفلاً
  if (localStorage.getItem(PIN_KEY) && localStorage.getItem(LOCKED_KEY) === 'true') {
    // انتظر حتى يكتمل login() أولاً
    setTimeout(() => {
      if (State.wallet) lockApp();
    }, 500);
  }
});
