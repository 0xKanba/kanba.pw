/* ═══════════════════════════════════════════════════════════════
   HLTrade Paper · sw.js
   Service Worker — يراقب TP/SL في خلفية المتصفح
   ✅ يعمل حتى لو الـ tab مغلق (طالما المتصفح مفتوح)
   ✅ يجلب الأسعار من Hyperliquid كل 2 ثانية
   ✅ يُغلق المراكز ويُحدّث localStorage
   ✅ يُرسل إشعار + postMessage للـ tab
═══════════════════════════════════════════════════════════════ */

const SW_VERSION = 'hlpaper-sw-v2';
const HL_API     = 'https://api.hyperliquid.xyz';
const LS_KEY     = 'hlpaper_v2';
const FEE_RATE   = 0.00009;

const COINS = {
  GOLD:   { coin:'xyz:GOLD',   pxDp:1, szDp:4, lev:25, name:'ذهب',    icon:'🟡' },
  SILVER: { coin:'xyz:SILVER', pxDp:3, szDp:2, lev:25, name:'فضة',    icon:'⚪' },
  CL:     { coin:'xyz:CL',     pxDp:2, szDp:3, lev:20, name:'نفط خام',icon:'🛢' },
};

// حالة SW الداخلية
let _prices    = {};
let _positions = []; // من localStorage
let _username  = null;
let _pollTimer = null;

// ════════════════════════════════════════
// تثبيت وتفعيل
// ════════════════════════════════════════
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

// ════════════════════════════════════════
// استقبال رسائل من الـ tab
// ════════════════════════════════════════
self.addEventListener('message', e => {
  const { type, positions, prices, username } = e.data || {};
  if(type === 'UPDATE_STATE'){
    if(username) _username = username;
    if(positions) _positions = positions;
    startPolling();
  }
  if(type === 'PRICES'){
    if(prices) _prices = prices;
  }
});

// ════════════════════════════════════════
// جلب الأسعار
// ════════════════════════════════════════
async function fetchPrice(coinStr){
  try {
    const r = await fetch(HL_API+'/info',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:'l2Book',coin:coinStr})
    });
    const data = await r.json();
    const bid = parseFloat(data.levels?.[0]?.[0]?.px||0);
    const ask = parseFloat(data.levels?.[1]?.[0]?.px||0);
    return (bid&&ask)?(bid+ask)/2:0;
  } catch{ return 0; }
}

async function refreshPrices(){
  const syms = [...new Set(_positions.map(p=>{
    const c=p.position.coin;
    return c.includes(':')?c.split(':')[1]:c;
  }))];
  if(!syms.length) return;
  await Promise.all(syms.map(async sym=>{
    if(!COINS[sym]) return;
    const mid = await fetchPrice(COINS[sym].coin);
    if(mid) _prices[sym]={mid};
  }));
}

// ════════════════════════════════════════
// فحص TP/SL
// ════════════════════════════════════════
function fmt(n,d){ return (+n).toFixed(d); }
function calcFee(px,qty){ return px*qty*FEE_RATE; }

function checkTpSlInSW(){
  if(!_positions.length || !_username) return;
  let changed = false;

  for(let i=_positions.length-1; i>=0; i--){
    const p = _positions[i];
    const coin = p.position.coin.includes(':') ? p.position.coin.split(':')[1] : p.position.coin;
    const mid  = _prices[coin]?.mid; if(!mid) continue;
    const szi  = parseFloat(p.position.szi), isLong = szi>0;
    const {tp, sl} = p.tpsl||{};

    let hit = false, closePx = mid, reason = '';
    if(tp!=null && ((isLong&&mid>=tp)||(!isLong&&mid<=tp))){ closePx=tp; reason=`🎯 جني الربح`; hit=true; }
    else if(sl!=null && ((isLong&&mid<=sl)||(!isLong&&mid>=sl))){ closePx=sl; reason=`🛡 وقف الخسارة`; hit=true; }

    if(hit){
      const a = COINS[coin]||{lev:10,pxDp:2,name:coin,icon:'📊'};
      const qty = Math.abs(szi);
      const ep  = parseFloat(p.position.entryPx);
      const raw = szi>0?(closePx-ep)*qty:(ep-closePx)*qty;
      const fee = calcFee(closePx, qty);
      const net = raw - fee;

      // حمّل الجلسة الحالية من localStorage
      // ملاحظة: SW لا يملك localStorage مباشرة — يُرسل للـ client ليُنفّذ
      notifyClient({ type:'TPSL_HIT', sym:`${a.icon} ${a.name}`, pnl:net, reason, coin, i });
      sendNotification(reason, a, net, closePx, a.pxDp);
      _positions.splice(i,1);
      changed = true;
    }
  }
  return changed;
}

// ════════════════════════════════════════
// إرسال للـ tab المفتوح
// ════════════════════════════════════════
async function notifyClient(data){
  const clients = await self.clients.matchAll({type:'window'});
  for(const client of clients) client.postMessage(data);
}

// ════════════════════════════════════════
// إشعار Push للمتصفح (حتى لو الـ tab في الخلفية)
// ════════════════════════════════════════
async function sendNotification(reason, a, net, px, pxDp){
  try {
    await self.registration.showNotification(`HLTrade Paper — ${reason}`, {
      body: `${a.icon} ${a.name} @ ${fmt(px,pxDp)} — ${net>=0?'+':''}$${fmt(net,2)}`,
      icon: '/hlpaper/icon.png',
      badge: '/hlpaper/icon.png',
      tag: 'tpsl_'+Date.now(),
      requireInteraction: net<0, // أبقِ SL مرئياً حتى يُغلق المستخدم
    });
  } catch{}
}

// ════════════════════════════════════════
// دورة المراقبة
// ════════════════════════════════════════
async function pollCycle(){
  if(!_positions.length) return;
  await refreshPrices();
  checkTpSlInSW();
}

function startPolling(){
  if(_pollTimer) return; // منع التكرار
  _pollTimer = setInterval(pollCycle, 2000);
}

// فحص فوري عند أول رسالة
self.addEventListener('message', () => {
  if(_positions.length) pollCycle();
});
