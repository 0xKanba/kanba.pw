/* ═══════════════════════════════════════════════════════════
   HLTrade Paper · paper.js
   تداول تجريبي 100% — أسعار حقيقية، أموال وهمية
═══════════════════════════════════════════════════════════ */

const HL_API = 'https://api.hyperliquid.xyz';
const LS_SESSION = 'hlpaper_session';

const ASSETS = {
  GOLD:   { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:1, unit:'أونصة', presets:[0.1,0.5,1,2,5],    icon:'🟡', name:'ذهب'    },
  SILVER: { coin:'xyz:SILVER', idx:110026, lev:25, cross:true,  szDp:2, pxDp:3, unit:'أونصة', presets:[1,2,3,5,8,10,20],  icon:'⚪', name:'فضة'    },
  CL:     { coin:'xyz:CL',     idx:110029, lev:20, cross:false, szDp:3, pxDp:2, unit:'برميل', presets:[1,2,3,5,8,10,20],  icon:'🛢', name:'نفط خام' }
};

// ════ الحالة الرئيسية ════
const State = {
  trader: null,
  asset: 'GOLD',
  qty: 0.1,
  prices: { GOLD:{bid:0,ask:0,mid:0}, SILVER:{bid:0,ask:0,mid:0}, CL:{bid:0,ask:0,mid:0} },
  prevMid: { GOLD:0, SILVER:0, CL:0 },
  // Paper data (مخزنة في localStorage)
  balance: 10000,       // رصيد متاح
  positions: [],         // [{id, sym, isBuy, qty, entryPx, tp, sl, openTime}]
  history: [],           // [{...position, closePx, closedPnl, closeTime}]
  timers: [], priceTimer: null, tpslTimer: null,
  pendingTrade: null, pendingClose: null, pendingTP: null, pendingSL: null
};

// ════════════════════════════════════════
// أدوات DOM
// ════════════════════════════════════════
const $ = id => document.getElementById(id);
const openModal  = id => { const el=$(id); if(el){ el.classList.add('open'); el.onclick=e=>{ if(e.target===el) closeModal(id); }; } };
const closeModal = id => $(id)?.classList.remove('open');
function toast(msg, type='info', dur=3500){ const e=$('toast'); if(!e)return; e.textContent=msg; e.className=`show ${type}`; clearTimeout(e._t); e._t=setTimeout(()=>e.className='',dur); }
function showLoader(t='جاري...'){ $('loaderText').textContent=t; $('loader').classList.add('active'); }
function hideLoader(){ $('loader').classList.remove('active'); }
function setTxt(id,t){ const e=$(id); if(e) e.textContent=t; }
function setText(id,t,c){ const e=$(id); if(!e)return; e.textContent=t; if(c) e.className=c; }
function setBtnLoading(id,t='⏳'){ const b=$(id); if(!b)return; b._orig=b.innerHTML; b.disabled=true; b.innerHTML=t; }
function resetBtn(id){ const b=$(id); if(!b)return; b.disabled=false; if(b._orig) b.innerHTML=b._orig; }
const fmt=(n,d)=>(+n).toFixed(d);
function shortCoin(c){ return c.includes(':') ? c.split(':')[1] : c; }
function genId(){ return Date.now()+'_'+Math.random().toString(36).slice(2,7); }

// ════════════════════════════════════════
// LocalStorage
// ════════════════════════════════════════
function saveSession(){
  const data = { trader:State.trader, balance:State.balance, positions:State.positions, history:State.history };
  localStorage.setItem(LS_SESSION, JSON.stringify(data));
}
function loadSession(){
  try { return JSON.parse(localStorage.getItem(LS_SESSION)||'null'); } catch{ return null; }
}
function clearSession(){ localStorage.removeItem(LS_SESSION); }

// ════════════════════════════════════════
// API (قراءة فقط — بدون توقيع)
// ════════════════════════════════════════
async function hlInfo(body){
  const r = await fetch(HL_API+'/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ════════════════════════════════════════
// تحديث الأسعار
// ════════════════════════════════════════
async function pollPrices(){
  await Promise.all(Object.keys(ASSETS).map(async sym=>{
    try {
      const lb = await hlInfo({type:'l2Book', coin:ASSETS[sym].coin});
      const bid = parseFloat(lb.levels?.[0]?.[0]?.px||0);
      const ask = parseFloat(lb.levels?.[1]?.[0]?.px||0);
      const mid = (bid&&ask)?(bid+ask)/2:0;
      State.prices[sym]={bid,ask,mid};
      const el=$(`price${sym}`);
      if(el&&mid){
        const dir = mid>State.prevMid[sym]?'up':mid<State.prevMid[sym]?'dn':'';
        el.textContent = fmt(mid,ASSETS[sym].pxDp);
        el.className = `tab-price${dir?' '+dir:''}`;
        if(dir) setTimeout(()=>el.className='tab-price',800);
      }
    } catch{}
  }));
  updatePriceUI();
  checkTpSl();
}

function updatePriceUI(){
  const a=ASSETS[State.asset], p=State.prices[State.asset];
  if(!p||!p.mid) return;
  const dir = p.mid>State.prevMid[State.asset]?1:p.mid<State.prevMid[State.asset]?-1:0;
  const cls = dir>0?'up':dir<0?'dn':'n';
  $('priceCard').className = `price-card${dir>0?' up':dir<0?' dn':''}`;
  setText('priceValue', fmt(p.mid,a.pxDp), `price-value ${cls}`);
  setTxt('buyPrice',  fmt(p.mid,a.pxDp));
  setTxt('sellPrice', fmt(p.mid,a.pxDp));
  if(State.prevMid[State.asset]&&p.mid!==State.prevMid[State.asset]){
    const d=p.mid-State.prevMid[State.asset];
    setText('priceDelta',(d>0?'+':'')+fmt(d,a.pxDp),`price-delta ${cls}`);
  }
  if(p.bid&&p.ask) setTxt('priceBidAsk',`شراء ${fmt(p.bid,a.pxDp)} · بيع ${fmt(p.ask,a.pxDp)}`);
  State.prevMid[State.asset]=p.mid;
  let s=1; clearInterval(State.priceTimer);
  setTxt('priceTimer',`↻ ${s}s`);
  State.priceTimer=setInterval(()=>{ s++; setTxt('priceTimer',`↻ ${s}s`); },1000);
  updateTradeInfo();
}

function updateTradeInfo(){
  const a=ASSETS[State.asset], p=State.prices[State.asset];
  if(!p?.mid||!State.qty){ setTxt('infoValue','—');setTxt('infoMargin','—');return; }
  const val=(p.mid*State.qty).toFixed(2);
  const mgn=(p.mid*State.qty/a.lev).toFixed(2);
  setTxt('infoValue',`$${val}`);
  setTxt('infoMargin',`$${mgn}`);
}

// ════════════════════════════════════════
// رصيد ومراكز UI
// ════════════════════════════════════════
function updateBalanceUI(){
  // حساب PnL المفتوح من الأسعار الحالية
  let floatPnl=0;
  for(const pos of State.positions){
    const mid=State.prices[pos.sym]?.mid;
    if(!mid) continue;
    const a=ASSETS[pos.sym];
    const sz=pos.qty, ep=pos.entryPx;
    const rawPnl = pos.isBuy ? (mid-ep)*sz : (ep-mid)*sz;
    floatPnl += rawPnl;
  }
  // إجمالي الحساب = رصيد متاح + هامش في المراكز + PnL عائم
  const marginUsed = State.positions.reduce((s,pos)=>{
    const a=ASSETS[pos.sym]; return s+(pos.entryPx*pos.qty/a.lev);
  },0);
  const total = State.balance + marginUsed + floatPnl;

  $('balAvail').textContent = `$${fmt(State.balance,2)}`;
  const totalEl=$('balTotal'); totalEl.textContent=`$${fmt(total,2)}`;
  totalEl.className = `balance-val ${total>=State.balance+marginUsed?'accent':'neg'}`;
  const pnlEl=$('balPnl');
  pnlEl.textContent = `${floatPnl>=0?'+':''}$${fmt(floatPnl,2)}`;
  pnlEl.className = `balance-val ${floatPnl>=0?'pos':'neg'}`;
}

function renderPositions(){
  updateBalanceUI();
  const count=State.positions.length;
  setTxt('positionsCount',count);
  const clsBtn=$('btnCloseAll');
  if(clsBtn) clsBtn.classList.toggle('hidden',count===0);
  const list=$('positionsList');
  if(!count){
    list.innerHTML='<div class="positions-empty">📂 لا توجد صفقات مفتوحة</div>';
    setTxt('totalPnl',''); $('totalPnl').className='positions-pnl'; return;
  }
  let totalPnl=0;
  list.innerHTML=State.positions.map((pos,i)=>{
    const a=ASSETS[pos.sym]||{name:pos.sym,unit:'',icon:'📊',pxDp:2,szDp:2};
    const mid=State.prices[pos.sym]?.mid||pos.entryPx;
    const rawPnl=pos.isBuy?(mid-pos.entryPx)*pos.qty:(pos.entryPx-mid)*pos.qty;
    totalPnl+=rawPnl;
    const pCls=rawPnl>=0?'pos':'neg';
    const sign=rawPnl>=0?'+':'';
    const tpLabel=pos.tp?`$${fmt(pos.tp,a.pxDp)}`:'تعيين';
    const slLabel=pos.sl?`$${fmt(pos.sl,a.pxDp)}`:'تعيين';
    const tpCls=pos.tp?'tp-set':'tp-unset';
    const slCls=pos.sl?'sl-set':'sl-unset';
    return `<div class="position-item">
      <div class="pos-top">
        <div>
          <div class="pos-name">${a.icon} ${a.name}</div>
          <div class="pos-dir ${pos.isBuy?'long':'short'}">${pos.isBuy?'▲ شراء':'▼ بيع'} · رافعة ${a.lev}x</div>
        </div>
        <div class="pos-right">
          <div class="pos-pnl ${pCls}">${sign}$${fmt(rawPnl,2)}</div>
          <div class="pos-size">${pos.qty.toFixed(a.szDp)} ${a.unit}</div>
        </div>
      </div>
      <div class="pos-data-grid">
        <div class="pos-data-item">
          <span class="pos-data-label">سعر الدخول</span>
          <span class="pos-data-value">${fmt(pos.entryPx,a.pxDp)}</span>
        </div>
        <div class="pos-data-item">
          <span class="pos-data-label">السعر الحالي</span>
          <span class="pos-data-value">${fmt(mid,a.pxDp)}</span>
        </div>
      </div>
      <div class="pos-tpsl-row">
        <button class="tpsl-btn ${tpCls}" onclick="openTP(${i})">
          <span class="sub">🎯 جني الربح</span><span class="val">${tpLabel}</span>
        </button>
        <button class="tpsl-btn ${slCls}" onclick="openSL(${i})">
          <span class="sub">🛡 وقف الخسارة</span><span class="val">${slLabel}</span>
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
}

function renderHistory(){
  const hist=[...State.history].reverse();
  setTxt('histCount',hist.length);
  const list=$('historyList');
  if(!hist.length){
    list.innerHTML='<div class="positions-empty">لا توجد صفقات مغلقة بعد</div>'; return;
  }
  list.innerHTML=hist.slice(0,30).map(h=>{
    const a=ASSETS[h.sym]||{name:h.sym,icon:'📊',pxDp:2};
    const pCls=h.closedPnl>=0?'pos':'neg';
    const sign=h.closedPnl>=0?'+':'';
    const time=new Date(h.closeTime).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'});
    return `<div class="history-item">
      <div class="hist-left">
        <div class="hist-name">${a.icon} ${a.name}</div>
        <div class="hist-sub">${h.isBuy?'▲ شراء':'▼ بيع'} · دخول ${fmt(h.entryPx,a.pxDp)} ← ${fmt(h.closePx,a.pxDp)}</div>
      </div>
      <div class="hist-right">
        <div class="hist-pnl ${pCls}">${sign}$${fmt(h.closedPnl,2)}</div>
        <div class="hist-time">${time}</div>
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════
// التبويبات
// ════════════════════════════════════════
function switchAsset(sym){
  State.asset=sym;
  document.querySelectorAll('.tab[data-asset]').forEach(t=>t.classList.toggle('active',t.dataset.asset===sym));
  const a=ASSETS[sym];
  setTxt('priceAssetName',a.name); setTxt('tradeAssetName',a.name); setTxt('qtyUnit',a.unit);
  renderPresets(a.presets); State.prevMid[sym]=0; updatePriceUI();
}
function renderPresets(arr){
  $('qtyPresets').innerHTML=arr.map((v,i)=>`<button class="qty-preset${i===0?' active':''}" data-v="${v}">${v}</button>`).join('');
  State.qty=arr[0]; $('qtyInput').value=arr[0]; updateTradeInfo();
  $('qtyPresets').onclick=e=>{
    if(!e.target.classList.contains('qty-preset')) return;
    State.qty=parseFloat(e.target.dataset.v); $('qtyInput').value=State.qty;
    $('qtyPresets').querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active'));
    e.target.classList.add('active'); updateTradeInfo();
  };
}
function onQtyInput(){
  State.qty=parseFloat($('qtyInput').value||0);
  $('qtyPresets').querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active'));
  updateTradeInfo();
}

// ════════════════════════════════════════
// تنفيذ الصفقة (وهمي)
// ════════════════════════════════════════
function askTrade(isBuy){
  const qty=parseFloat($('qtyInput').value||State.qty||0);
  if(!qty||qty<=0) return toast('أدخل الكمية أولاً','err');
  const a=ASSETS[State.asset], p=State.prices[State.asset];
  if(!p?.mid) return toast('لا يوجد سعر — انتظر لحظة','err');
  const usd=(p.mid*qty).toFixed(2);
  const mgn=(p.mid*qty/a.lev).toFixed(2);
  const liq=fmt(p.mid*(isBuy?1-1/a.lev:1+1/a.lev),a.pxDp);
  if(parseFloat(mgn)>State.balance) return toast(`❌ رصيد غير كافٍ — تحتاج $${mgn} هامش`,'err',4000);
  setTxt('confirmTitle',`${a.icon} ${isBuy?'شراء ↑':'بيع ↓'} — ${a.name}`);
  setTxt('confirmSubtitle',`رافعة ${a.lev}x`);
  $('confirmDetails').innerHTML=`
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${qty} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">سعر الدخول</span><span class="confirm-val">${fmt(p.mid,a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">القيمة الكلية</span><span class="confirm-val">≈ $${usd}</span></div>
    <div class="confirm-row"><span class="confirm-key">الهامش المطلوب</span><span class="confirm-val warn">≈ $${mgn}</span></div>
    <div class="confirm-row"><span class="confirm-key">التصفية التقريبية</span><span class="confirm-val sell">≈ ${liq} $</span></div>`;
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
  await new Promise(r=>setTimeout(r,700)); // تأخير واقعي
  const entryPx = isBuy ? p.ask||p.mid : p.bid||p.mid; // سعر واقعي
  const margin = entryPx*qty/a.lev;
  if(margin>State.balance){ hideLoader();resetBtn('confirmExecute');closeModal('modalConfirm');return toast('❌ رصيد غير كافٍ','err'); }
  State.balance -= margin; // خصم الهامش من الرصيد
  State.positions.push({ id:genId(), sym, isBuy, qty:parseFloat(qty.toFixed(a.szDp)), entryPx:parseFloat(entryPx.toFixed(a.pxDp)), tp:null, sl:null, openTime:Date.now() });
  saveSession(); renderPositions(); renderHistory();
  closeModal('modalConfirm'); State.pendingTrade=null;
  toast(`✅ ${a.icon} ${isBuy?'شراء':'بيع'} ${qty} ${a.unit} @ ${fmt(entryPx,a.pxDp)}`,'ok',5000);
  hideLoader(); resetBtn('confirmExecute');
}

// ════════════════════════════════════════
// إغلاق مركز
// ════════════════════════════════════════
window.askClose=function(i){
  const pos=State.positions[i]; if(!pos)return;
  const a=ASSETS[pos.sym]||{name:pos.sym,unit:'',icon:'📊',pxDp:2,szDp:2};
  const mid=State.prices[pos.sym]?.mid||pos.entryPx;
  const rawPnl=pos.isBuy?(mid-pos.entryPx)*pos.qty:(pos.entryPx-mid)*pos.qty;
  setTxt('closeTitle',`${a.icon} إغلاق — ${a.name}`);
  $('closeDetails').innerHTML=`
    <div class="confirm-row"><span class="confirm-key">الاتجاه</span><span class="confirm-val ${pos.isBuy?'buy':'sell'}">${pos.isBuy?'▲ شراء':'▼ بيع'}</span></div>
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${pos.qty.toFixed(a.szDp)} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">سعر الدخول</span><span class="confirm-val">${fmt(pos.entryPx,a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">السعر الحالي</span><span class="confirm-val">${fmt(mid,a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">الربح / الخسارة</span><span class="confirm-val ${rawPnl>=0?'buy':'sell'}">${rawPnl>=0?'+':''}$${fmt(rawPnl,2)}</span></div>`;
  State.pendingClose=i; openModal('modalClose');
};

async function execClose(){
  if(State.pendingClose===null){ closeModal('modalClose'); return; }
  const i=State.pendingClose;
  const pos=State.positions[i]; if(!pos){closeModal('modalClose');return;}
  const a=ASSETS[pos.sym], mid=State.prices[pos.sym]?.mid;
  if(!a||!mid){ toast('لا يوجد سعر','err'); closeModal('modalClose'); return; }
  setBtnLoading('closeExecute','⏳');
  showLoader(`إغلاق ${a.icon} ${a.name}...`);
  await new Promise(r=>setTimeout(r,600));
  const closePx = pos.isBuy ? (mid*0.9995) : (mid*1.0005); // spread بسيط
  const rawPnl = pos.isBuy?(closePx-pos.entryPx)*pos.qty:(pos.entryPx-closePx)*pos.qty;
  const margin = pos.entryPx*pos.qty/a.lev;
  State.balance += margin + rawPnl; // إعادة الهامش + PnL
  if(State.balance<0) State.balance=0;
  State.history.push({...pos, closePx:parseFloat(closePx.toFixed(a.pxDp)), closedPnl:rawPnl, closeTime:Date.now()});
  State.positions.splice(i,1);
  saveSession(); renderPositions(); renderHistory();
  closeModal('modalClose'); State.pendingClose=null;
  toast(`✅ أُغلقت — ${a.icon} ${a.name} — ${rawPnl>=0?'+':''}$${fmt(rawPnl,2)}`,'ok',5000);
  hideLoader(); resetBtn('closeExecute');
}

// ════════════════════════════════════════
// إغلاق الكل
// ════════════════════════════════════════
function askCloseAll(){
  if(!State.positions.length) return toast('لا توجد صفقات','info');
  $('closeAllDetails').innerHTML=State.positions.map(pos=>{
    const a=ASSETS[pos.sym]||{name:pos.sym,icon:'📊'}; 
    const mid=State.prices[pos.sym]?.mid||pos.entryPx;
    const rawPnl=pos.isBuy?(mid-pos.entryPx)*pos.qty:(pos.entryPx-mid)*pos.qty;
    return `<div class="confirm-row"><span class="confirm-key">${a.icon} ${a.name}</span><span class="confirm-val ${rawPnl>=0?'buy':'sell'}">${rawPnl>=0?'+':''}$${fmt(rawPnl,2)}</span></div>`;
  }).join('');
  openModal('modalCloseAll');
}

async function execCloseAll(){
  if(!State.positions.length){ closeModal('modalCloseAll'); return; }
  setBtnLoading('closeAllExecute','⏳');
  showLoader('إغلاق جميع الصفقات...');
  await new Promise(r=>setTimeout(r,700));
  let totalPnl=0;
  for(const pos of [...State.positions]){
    const a=ASSETS[pos.sym], mid=State.prices[pos.sym]?.mid||pos.entryPx;
    const closePx = pos.isBuy?(mid*0.9995):(mid*1.0005);
    const rawPnl = pos.isBuy?(closePx-pos.entryPx)*pos.qty:(pos.entryPx-closePx)*pos.qty;
    const margin = pos.entryPx*pos.qty/a.lev;
    State.balance += margin+rawPnl;
    totalPnl+=rawPnl;
    State.history.push({...pos, closePx:parseFloat(closePx.toFixed(a.pxDp)), closedPnl:rawPnl, closeTime:Date.now()});
  }
  if(State.balance<0) State.balance=0;
  State.positions=[];
  saveSession(); renderPositions(); renderHistory();
  closeModal('modalCloseAll');
  toast(`✅ أُغلق الكل — ${totalPnl>=0?'+':''}$${fmt(totalPnl,2)}`,'ok',5000);
  hideLoader(); resetBtn('closeAllExecute');
}

// ════════════════════════════════════════
// TP/SL (وهمي — يُراقب محلياً)
// ════════════════════════════════════════
function checkTpSl(){
  let changed=false;
  for(let i=State.positions.length-1;i>=0;i--){
    const pos=State.positions[i];
    const mid=State.prices[pos.sym]?.mid; if(!mid) continue;
    const a=ASSETS[pos.sym];
    // فحص TP
    if(pos.tp!==null){
      const hit = pos.isBuy ? mid>=pos.tp : mid<=pos.tp;
      if(hit){ autoClose(i,'tp',pos.tp,a); changed=true; continue; }
    }
    // فحص SL
    if(pos.sl!==null){
      const hit = pos.isBuy ? mid<=pos.sl : mid>=pos.sl;
      if(hit){ autoClose(i,'sl',pos.sl,a); changed=true; }
    }
  }
  if(changed){ saveSession(); renderPositions(); renderHistory(); }
}

function autoClose(i, reason, closePx, a){
  const pos=State.positions[i];
  const rawPnl = pos.isBuy?(closePx-pos.entryPx)*pos.qty:(pos.entryPx-closePx)*pos.qty;
  const margin = pos.entryPx*pos.qty/a.lev;
  State.balance += margin+rawPnl;
  if(State.balance<0) State.balance=0;
  State.history.push({...pos, closePx:parseFloat(closePx.toFixed(a.pxDp)), closedPnl:rawPnl, closeTime:Date.now()});
  State.positions.splice(i,1);
  const label = reason==='tp'?'🎯 جني الربح':'🛡 وقف الخسارة';
  toast(`${label} — ${a.icon} ${a.name} — ${rawPnl>=0?'+':''}$${fmt(rawPnl,2)}`,'ok',6000);
}

// ── فتح مودال TP ──
window.openTP = function(i){
  const pos=State.positions[i]; if(!pos)return;
  const a=ASSETS[pos.sym]||{name:pos.sym,pxDp:2};
  setTxt('tpTitle',`🎯 جني الربح — ${a.icon||''} ${a.name}`);
  setTxt('tpSubtitle',`${pos.isBuy?'▲ شراء':'▼ بيع'} | دخول: $${fmt(pos.entryPx,a.pxDp)}`);
  $('tpCurrentDetails').innerHTML = pos.tp
    ?`<div class="confirm-row"><span class="confirm-key">الهدف الحالي</span><span class="confirm-val tp">$${fmt(pos.tp,a.pxDp)}</span></div>`
    :`<div class="confirm-row"><span class="confirm-key">الهدف</span><span class="confirm-val muted">لم يُعيَّن</span></div>`;
  $('tpDelete').classList.toggle('hidden',!pos.tp);
  $('tpAmount').value='';
  setTxt('tpPreview','سعر التفعيل: —');
  State.pendingTP={index:i};
  openModal('modalTP');
};

function recalcTpPreview(){
  const tp=State.pendingTP; if(!tp)return;
  const pos=State.positions[tp.index]; if(!pos)return;
  const val=parseFloat($('tpAmount')?.value||0); if(!val||val<=0){setTxt('tpPreview','سعر التفعيل: —');return;}
  const a=ASSETS[pos.sym]||{pxDp:2};
  const tpPx = pos.isBuy ? pos.entryPx+val/pos.qty : pos.entryPx-val/pos.qty;
  setTxt('tpPreview',`سعر التفعيل: $${fmt(tpPx,a.pxDp)}`);
}

function execTP(){
  const tp=State.pendingTP; if(!tp)return closeModal('modalTP');
  const pos=State.positions[tp.index]; if(!pos)return;
  const val=parseFloat($('tpAmount').value||0);
  if(!val||val<=0) return toast('أدخل المبلغ المستهدف','err');
  const a=ASSETS[pos.sym];
  const tpPx = pos.isBuy ? pos.entryPx+val/pos.qty : pos.entryPx-val/pos.qty;
  pos.tp=parseFloat(tpPx.toFixed(a.pxDp));
  saveSession(); renderPositions();
  closeModal('modalTP');
  toast(`✅ هدف الربح: $${fmt(pos.tp,a.pxDp)}`,'ok',4000);
}

function deleteTP(){
  const tp=State.pendingTP; if(!tp)return;
  const pos=State.positions[tp.index]; if(!pos)return;
  pos.tp=null; saveSession(); renderPositions();
  closeModal('modalTP'); toast('✅ تم إلغاء هدف الربح','ok');
}

// ── فتح مودال SL ──
window.openSL = function(i){
  const pos=State.positions[i]; if(!pos)return;
  const a=ASSETS[pos.sym]||{name:pos.sym,pxDp:2};
  setTxt('slTitle',`🛡 وقف الخسارة — ${a.icon||''} ${a.name}`);
  setTxt('slSubtitle',`${pos.isBuy?'▲ شراء':'▼ بيع'} | دخول: $${fmt(pos.entryPx,a.pxDp)}`);
  $('slCurrentDetails').innerHTML = pos.sl
    ?`<div class="confirm-row"><span class="confirm-key">الوقف الحالي</span><span class="confirm-val sl">$${fmt(pos.sl,a.pxDp)}</span></div>`
    :`<div class="confirm-row"><span class="confirm-key">وقف الخسارة</span><span class="confirm-val muted">لم يُعيَّن</span></div>`;
  $('slDelete').classList.toggle('hidden',!pos.sl);
  $('slAmount').value='';
  setTxt('slPreview','سعر التفعيل: —');
  State.pendingSL={index:i};
  openModal('modalSL');
};

function recalcSlPreview(){
  const sl=State.pendingSL; if(!sl)return;
  const pos=State.positions[sl.index]; if(!pos)return;
  const val=parseFloat($('slAmount')?.value||0); if(!val||val<=0){setTxt('slPreview','سعر التفعيل: —');return;}
  const a=ASSETS[pos.sym]||{pxDp:2};
  const slPx = pos.isBuy ? pos.entryPx-val/pos.qty : pos.entryPx+val/pos.qty;
  setTxt('slPreview',`سعر التفعيل: $${fmt(slPx,a.pxDp)}`);
}

function execSL(){
  const sl=State.pendingSL; if(!sl)return closeModal('modalSL');
  const pos=State.positions[sl.index]; if(!pos)return;
  const val=parseFloat($('slAmount').value||0);
  if(!val||val<=0) return toast('أدخل الخسارة المسموح بها','err');
  const a=ASSETS[pos.sym];
  const slPx = pos.isBuy ? pos.entryPx-val/pos.qty : pos.entryPx+val/pos.qty;
  pos.sl=parseFloat(slPx.toFixed(a.pxDp));
  saveSession(); renderPositions();
  closeModal('modalSL');
  toast(`✅ وقف الخسارة: $${fmt(pos.sl,a.pxDp)}`,'ok',4000);
}

function deleteSL(){
  const sl=State.pendingSL; if(!sl)return;
  const pos=State.positions[sl.index]; if(!pos)return;
  pos.sl=null; saveSession(); renderPositions();
  closeModal('modalSL'); toast('✅ تم إلغاء وقف الخسارة','ok');
}

// ════════════════════════════════════════
// الحساب — إيداع / سحب / إعادة ضبط
// ════════════════════════════════════════
function switchAccTab(tab){
  ['deposit','withdraw','reset'].forEach(t=>{
    $(`tabDep${t.charAt(0).toUpperCase()+t.slice(1)}`)||$(`tab${t.charAt(0).toUpperCase()+t.slice(1)}`);
    $(`panel${t.charAt(0).toUpperCase()+t.slice(1)}`).classList.toggle('hidden',t!==tab);
    $(`tab${t.charAt(0).toUpperCase()+t.slice(1)}`).classList.toggle('active',t===tab);
  });
  updateAccountSummary();
}

function updateAccountSummary(){
  const marginUsed=State.positions.reduce((s,pos)=>{const a=ASSETS[pos.sym];return s+(pos.entryPx*pos.qty/a.lev);},0);
  $('accountSummary').innerHTML=`
    <div class="confirm-row"><span class="confirm-key">الرصيد المتاح</span><span class="confirm-val">$${fmt(State.balance,2)}</span></div>
    <div class="confirm-row"><span class="confirm-key">الهامش في المراكز</span><span class="confirm-val warn">$${fmt(marginUsed,2)}</span></div>
    <div class="confirm-row"><span class="confirm-key">عدد المراكز</span><span class="confirm-val">${State.positions.length}</span></div>
    <div class="confirm-row"><span class="confirm-key">المتداول</span><span class="confirm-val">${State.trader}</span></div>`;
}

function doDeposit(){
  const amt=parseFloat($('depositAmt').value||0);
  if(!amt||amt<1) return toast('أدخل مبلغاً صحيحاً','err');
  if(amt>1000000) return toast('الحد الأقصى $1,000,000','err');
  State.balance+=amt;
  saveSession(); renderPositions();
  toast(`✅ تمت إضافة $${fmt(amt,2)} وهمي 🎉`,'ok',4000);
  $('depositAmt').value='';
  updateAccountSummary();
}

function doWithdraw(){
  const amt=parseFloat($('withdrawAmt').value||0);
  if(!amt||amt<1) return toast('أدخل مبلغاً صحيحاً','err');
  if(amt>State.balance) return toast('❌ الرصيد المتاح غير كافٍ','err');
  State.balance-=amt;
  saveSession(); renderPositions();
  toast(`✅ تم سحب $${fmt(amt,2)} وهمي 😄`,'ok',4000);
  $('withdrawAmt').value='';
  updateAccountSummary();
}

function doReset(){
  const startBal=parseFloat($('resetBalance').value||10000);
  if(!confirm(`⚠️ هل أنت متأكد؟ سيتم مسح كل شيء وبدء بـ $${startBal}`)) return;
  State.balance=startBal;
  State.positions=[];
  State.history=[];
  saveSession(); renderPositions(); renderHistory();
  closeModal('modalAccount');
  toast(`🔄 تم إعادة الضبط — رصيدك $${fmt(startBal,2)}`,'ok',5000);
}

function clearHistory(){
  if(!State.history.length) return toast('السجل فارغ أصلاً','info');
  if(!confirm('مسح سجل الصفقات؟')) return;
  State.history=[];
  saveSession(); renderHistory();
  toast('✅ تم مسح السجل','ok');
}

// ════════════════════════════════════════
// دخول / خروج
// ════════════════════════════════════════
async function login(){
  const name = $('traderName').value.trim() || `Trader_${Math.floor(Math.random()*9999)}`;
  const startBal = parseFloat($('startBalance').value||10000);
  setBtnLoading('loginBtn','⏳');
  showLoader('تهيئة الحساب التجريبي...');
  try {
    State.trader=name;
    State.balance=startBal;
    State.positions=[];
    State.history=[];
    saveSession();
    await startApp();
  } catch(e){
    hideLoader(); toast('خطأ: '+e.message.slice(0,80),'err');
  } finally { resetBtn('loginBtn'); }
}

async function continueSession(){
  const saved=loadSession();
  if(!saved||!saved.trader){ return toast('لا توجد جلسة سابقة','info'); }
  showLoader('استعادة الجلسة...');
  State.trader=saved.trader;
  State.balance=saved.balance||0;
  State.positions=saved.positions||[];
  State.history=saved.history||[];
  try { await startApp(); } catch(e){ hideLoader(); toast('خطأ: '+e.message,'err'); }
}

async function startApp(){
  setTxt('navTrader',State.trader);
  $('loginScreen').classList.add('hidden');
  $('appScreen').classList.remove('hidden');
  switchAsset('GOLD');
  showLoader('جلب الأسعار...');
  await pollPrices();
  renderPositions();
  renderHistory();
  hideLoader();
  toast(`مرحباً ${State.trader} 🎓 — رصيدك $${fmt(State.balance,2)} وهمي`,'ok',5000);
  State.timers.push(setInterval(pollPrices,1000));
}

function doLogout(){
  State.timers.forEach(clearInterval);
  clearInterval(State.priceTimer);
  State.timers=[];
  closeModal('modalLogout');
  $('appScreen').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  toast('تم الحفظ والخروج','info');
}

// ════════════════════════════════════════
// عرض مودال الحساب
// ════════════════════════════════════════
const _origOpenModal=openModal;
document.addEventListener('DOMContentLoaded',()=>{
  // إعادة ضبط تبويبات الحساب عند الفتح
  const btn=document.querySelector('[onclick="openModal(\'modalAccount\')"]');
  if(btn) btn.onclick=()=>{ switchAccTab('deposit'); openModal('modalAccount'); };
});
