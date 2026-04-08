/* ═══════════════════════════════════════════════════════════════
   HLTrade Paper · paper.js v2.0
   ✅ رسوم 0.009% لكل جانب
   ✅ Netting: بيع يغلق شراء لا يفتح معاكس
   ✅ TP/SL في Service Worker (خلفية المتصفح)
   ✅ إشعارات عند تفعيل TP/SL
   ✅ حفظ تلقائي كل 3 ثواني
═══════════════════════════════════════════════════════════════ */

const HL_API   = 'https://api.hyperliquid.xyz';
const LS_KEY   = 'hlpaper_v2';
const FEE_RATE = 0.00009; // 0.009% لكل جانب

const ASSETS = {
  GOLD:   { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:1, unit:'أونصة', presets:[0.1,0.5,1,2,5],   icon:'🟡', name:'ذهب'    },
  SILVER: { coin:'xyz:SILVER', idx:110026, lev:25, cross:true,  szDp:2, pxDp:3, unit:'أونصة', presets:[1,2,3,5,8,10,20], icon:'⚪', name:'فضة'    },
  CL:     { coin:'xyz:CL',     idx:110029, lev:20, cross:false, szDp:3, pxDp:2, unit:'برميل', presets:[1,2,3,5,8,10,20], icon:'🛢', name:'نفط خام' }
};

const State = {
  wallet: null,
  asset: 'GOLD', qty: 0.1,
  prices:  { GOLD:{bid:0,ask:0,mid:0}, SILVER:{bid:0,ask:0,mid:0}, CL:{bid:0,ask:0,mid:0} },
  prevMid: { GOLD:0, SILVER:0, CL:0 },
  _paperBalance: 0,
  _paperHistory: [],
  positions: [],
  openOrders: [],
  balance: null,
  timers: [], priceTimer: null, _balTimer: null, _clockTimer: null,
  pendingTrade: null, pendingClose: null, pendingTP: null, pendingSL: null,
};

// ════════════════════════════════════════
// DOM Utils
// ════════════════════════════════════════
const $ = id => document.getElementById(id);
const openModal  = id => $(id)?.classList.add('open');
const closeModal = id => $(id)?.classList.remove('open');
function toast(msg,type='info',dur=3500){
  const e=$('toast'); if(!e)return;
  e.textContent=msg; e.className=`show ${type}`;
  clearTimeout(e._t); e._t=setTimeout(()=>e.className='',dur);
}
function showLoader(t='جاري...'){ $('loaderText').textContent=t; $('loader').classList.add('active'); }
function hideLoader(){ $('loader').classList.remove('active'); }
function setTxt(id,t){ const e=$(id); if(e) e.textContent=t; }
function setText(id,t,c){ const e=$(id); if(!e)return; e.textContent=t; if(c) e.className=c; }
function setBtnLoading(id,t='⏳'){ const b=$(id); if(!b)return; b._orig=b.innerHTML; b.disabled=true; b.innerHTML=t; }
function resetBtn(id){ const b=$(id); if(!b)return; b.disabled=false; if(b._orig) b.innerHTML=b._orig; }
function wire(n,dp){ let s=(+n).toFixed(dp); if(s.includes('.')) s=s.replace(/\.?0+$/,''); return s; }
const fmt=(n,d)=>(+n).toFixed(d);
function shortCoin(c){ return c.includes(':') ? c.split(':')[1] : c; }
const calcFee = (px,qty) => px * qty * FEE_RATE;

// ════════════════════════════════════════
// localStorage
// ════════════════════════════════════════
function saveSession(){
  if(!State.wallet?._paper) return;
  const data={ balance:State._paperBalance, positions:State.positions, history:State._paperHistory };
  try {
    localStorage.setItem(LS_KEY+'_'+State.wallet.address, JSON.stringify(data));
    localStorage.setItem(LS_KEY+'_last', State.wallet.address);
    // أخبر SW
    navigator.serviceWorker?.controller?.postMessage({
      type:'UPDATE_STATE',
      username: State.wallet.address,
      positions: State.positions,
    });
  } catch{}
}
function loadSession(u){ try{ return JSON.parse(localStorage.getItem(LS_KEY+'_'+u)||'null'); }catch{return null;} }

// ════════════════════════════════════════
// Service Worker
// ════════════════════════════════════════
async function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('sw.js',{scope:'./'});
    navigator.serviceWorker.addEventListener('message', e => {
      const {type,sym,pnl,reason} = e.data||{};
      if(type!=='TPSL_HIT') return;
      const saved=loadSession(State.wallet?.address);
      if(!saved) return;
      State._paperBalance=saved.balance;
      State.positions=saved.positions;
      State._paperHistory=saved.history;
      pollAccount();
      toast(`${reason} — ${sym}  ${pnl>=0?'+':''}$${fmt(pnl,2)}`, pnl>=0?'ok':'err', 7000);
    });
  } catch(e){ console.warn('[SW]',e.message); }
}

// ════════════════════════════════════════
// API
// ════════════════════════════════════════
async function hlInfo(body){
  const r=await fetch(HL_API+'/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function hlExchange(action){
  if(!State.wallet?._paper) throw new Error('لا توجد جلسة');
  await new Promise(r=>setTimeout(r,200+Math.random()*150));
  return {status:'ok',response:{data:{statuses:[{resting:{oid:Math.floor(Math.random()*9999999)}}]}}};
}
function tradeErr(msg){
  const m=(msg||'').toLowerCase();
  if(m.includes('رصيد')||m.includes('كافٍ')) return '❌ '+msg;
  if(m.includes('insufficient')||m.includes('margin')) return '❌ رصيد غير كافٍ';
  if(m.includes('halted')||m.includes('no fill'))      return '❌ السوق مغلق الآن';
  return `❌ ${(msg||'').slice(0,150)}`;
}

// ════════════════════════════════════════
// الأسعار
// ════════════════════════════════════════
async function pollPrices(){
  await Promise.all(Object.keys(ASSETS).map(async sym=>{
    try {
      const lb=await hlInfo({type:'l2Book',coin:ASSETS[sym].coin});
      const bid=parseFloat(lb.levels?.[0]?.[0]?.px||0);
      const ask=parseFloat(lb.levels?.[1]?.[0]?.px||0);
      const mid=(bid&&ask)?(bid+ask)/2:0;
      State.prices[sym]={bid,ask,mid};
      const el=$(`price${sym}`);
      if(el&&mid){
        const dir=mid>State.prevMid[sym]?'up':mid<State.prevMid[sym]?'dn':'';
        el.textContent=fmt(mid,ASSETS[sym].pxDp);
        el.className=`tab-price${dir?' '+dir:''}`;
        if(dir) setTimeout(()=>el.className='tab-price',800);
      }
    } catch{}
  }));
  updatePriceUI(); checkTpSl();
  navigator.serviceWorker?.controller?.postMessage({type:'PRICES',prices:State.prices});
}

function updatePriceUI(){
  const a=ASSETS[State.asset], p=State.prices[State.asset];
  if(!p?.mid) return;
  const dir=p.mid>State.prevMid[State.asset]?1:p.mid<State.prevMid[State.asset]?-1:0;
  const cls=dir>0?'up':dir<0?'dn':'n';
  $('priceCard').className=`price-card${dir>0?' up':dir<0?' dn':''}`;
  setText('priceValue',fmt(p.mid,a.pxDp),`price-value ${cls}`);
  setTxt('buyPrice',fmt(p.mid,a.pxDp)); setTxt('sellPrice',fmt(p.mid,a.pxDp));
  if(State.prevMid[State.asset]&&p.mid!==State.prevMid[State.asset]){
    const d=p.mid-State.prevMid[State.asset];
    setText('priceDelta',(d>0?'+':'')+fmt(d,a.pxDp),`price-delta ${cls}`);
  }
  if(p.bid&&p.ask) setTxt('priceBidAsk',`شراء ${fmt(p.bid,a.pxDp)} · بيع ${fmt(p.ask,a.pxDp)}`);
  State.prevMid[State.asset]=p.mid;
  let s=1; clearInterval(State.priceTimer);
  setTxt('priceTimer',`↻ ${s}s`);
  State.priceTimer=setInterval(()=>{ s++; setTxt('priceTimer',`↻ ${s}s`); },1000);
}

// ════════════════════════════════════════
// pollAccount
// ════════════════════════════════════════
function pollAccount(){
  if(!State.wallet?._paper) return;
  let floatPnl=0, totalMargin=0;
  for(const p of State.positions){
    const coin=shortCoin(p.position.coin);
    const a=ASSETS[coin]||{lev:10};
    const szi=parseFloat(p.position.szi);
    const ep=parseFloat(p.position.entryPx);
    const mid=State.prices[coin]?.mid||ep;
    const raw=szi>0?(mid-ep)*Math.abs(szi):(ep-mid)*Math.abs(szi);
    floatPnl+=raw; totalMargin+=ep*Math.abs(szi)/a.lev;
    p.position.unrealizedPnl=raw.toFixed(2);
  }
  State.balance={total:State._paperBalance+totalMargin+floatPnl,margin:totalMargin,floatPnl};
  renderPositions();
}

// ════════════════════════════════════════
// TP/SL فحص محلي
// ════════════════════════════════════════
function checkTpSl(){
  if(!State.positions.length) return;
  let changed=false;
  for(let i=State.positions.length-1;i>=0;i--){
    const p=State.positions[i];
    const coin=shortCoin(p.position.coin);
    const mid=State.prices[coin]?.mid; if(!mid) continue;
    const szi=parseFloat(p.position.szi), isLong=szi>0;
    const {tp,sl}=p.tpsl||{};
    if(tp!=null){ if((isLong&&mid>=tp)||(!isLong&&mid<=tp)){ paperCloseAt(i,tp,'🎯 جني الربح'); changed=true; continue; } }
    if(sl!=null){ if((isLong&&mid<=sl)||(!isLong&&mid>=sl)){ paperCloseAt(i,sl,'🛡 وقف الخسارة'); changed=true; } }
  }
  if(changed){ saveSession(); pollAccount(); }
}

// ════════════════════════════════════════
// إغلاق داخلي
// ════════════════════════════════════════
function paperCloseAt(i, closePx, reason){
  if(i<0||i>=State.positions.length) return;
  const p=State.positions[i];
  const coin=shortCoin(p.position.coin);
  const a=ASSETS[coin]||{lev:10,pxDp:2,szDp:2,name:coin,icon:'📊'};
  const szi=parseFloat(p.position.szi), qty=Math.abs(szi);
  const ep=parseFloat(p.position.entryPx);
  const raw=szi>0?(closePx-ep)*qty:(ep-closePx)*qty;
  const fee=calcFee(closePx,qty);
  const margin=ep*qty/a.lev;
  State._paperBalance+=margin+raw-fee;
  if(State._paperBalance<0) State._paperBalance=0;
  State._paperHistory.push({
    coin:p.position.coin, szi:p.position.szi,
    entryPx:p.position.entryPx, closePx:closePx.toFixed(a.pxDp),
    closedPnl:raw, fee, closeTime:Date.now(), reason, side:szi>0?'B':'A',
  });
  State.positions.splice(i,1);
  toast(`${reason} — ${a.icon} ${a.name}  ${raw>=0?'+':''}$${fmt(raw-fee,2)}`, raw-fee>=0?'ok':'err', 6000);
}

// ════════════════════════════════════════
// NETTING
// ════════════════════════════════════════
function findOpposite(sym, isBuy){
  for(let i=0;i<State.positions.length;i++){
    const p=State.positions[i];
    if(shortCoin(p.position.coin)!==sym) continue;
    const szi=parseFloat(p.position.szi);
    if(isBuy&&szi<0) return i;
    if(!isBuy&&szi>0) return i;
  }
  return -1;
}

// ════════════════════════════════════════
// Tabs
// ════════════════════════════════════════
function switchAsset(sym){
  State.asset=sym;
  document.querySelectorAll('.tab[data-asset]').forEach(t=>t.classList.toggle('active',t.dataset.asset===sym));
  const a=ASSETS[sym];
  setTxt('priceAssetName',a.name); setTxt('tradeAssetName',a.name); setTxt('qtyUnit',a.unit);
  renderPresets(a.presets); State.prevMid[sym]=0; updatePriceUI();
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
// renderPositions
// ════════════════════════════════════════
function parseTpslFromOrders(){ return {tp:null,sl:null,tpOid:null,slOid:null}; }
function calcTpPrice(ep,szi,pnl){ const sz=parseFloat(szi),e=parseFloat(ep); return sz>0?e+pnl/Math.abs(sz):e-pnl/Math.abs(sz); }
function calcSlPrice(ep,szi,sl){  const sz=parseFloat(szi),e=parseFloat(ep); return sz>0?e-sl/Math.abs(sz):e+sl/Math.abs(sz); }

function renderPositions(){
  const count=State.positions.length;
  setTxt('positionsCount',count);
  $('btnCloseAll')?.classList.toggle('hidden',count===0);
  const list=$('positionsList');
  if(!count){
    list.innerHTML='<div class="positions-empty">📂 لا توجد صفقات مفتوحة</div>';
    const t=$('totalPnl'); if(t){t.textContent='';t.className='positions-pnl';} return;
  }
  let totalPnl=0;
  list.innerHTML=State.positions.map((p,i)=>{
    const pos=p.position, szi=parseFloat(pos.szi), pnl=parseFloat(pos.unrealizedPnl||0);
    totalPnl+=pnl;
    const coin=shortCoin(pos.coin), a=ASSETS[coin]||{name:coin,unit:'',icon:'📊',pxDp:2,szDp:2,lev:10};
    const isLong=szi>0, pCls=pnl>=0?'pos':'neg', sign=pnl>=0?'+':'';
    const cur=State.prices[coin]?.mid, curStr=cur?fmt(cur,a.pxDp):'—';
    const tpsl=p.tpsl||{};
    return `<div class="position-item">
      <div class="pos-top">
        <div>
          <div class="pos-name">${a.icon} ${a.name}</div>
          <div class="pos-dir ${isLong?'long':'short'}">${isLong?'▲ شراء':'▼ بيع'} · رافعة ${a.lev}x</div>
        </div>
        <div class="pos-right">
          <div class="pos-pnl ${pCls}">${sign}$${fmt(pnl,2)}</div>
          <div class="pos-size">${Math.abs(szi).toFixed(a.szDp)} ${a.unit}</div>
        </div>
      </div>
      <div class="pos-data-grid">
        <div class="pos-data-item"><span class="pos-data-label">سعر الدخول</span><span class="pos-data-value">${fmt(pos.entryPx||0,a.pxDp)}</span></div>
        <div class="pos-data-item"><span class="pos-data-label">السعر الحالي</span><span class="pos-data-value">${curStr}</span></div>
      </div>
      <div class="pos-tpsl-row">
        <button class="tpsl-btn ${tpsl.tp!=null?'tp-set':'tp-unset'}" onclick="openTP(${i})">
          <span class="sub">🎯 جني الربح</span>
          <span class="val">${tpsl.tp!=null?'$'+fmt(tpsl.tp,a.pxDp):'تعيين'}</span>
        </button>
        <button class="tpsl-btn ${tpsl.sl!=null?'sl-set':'sl-unset'}" onclick="openSL(${i})">
          <span class="sub">🛡 وقف الخسارة</span>
          <span class="val">${tpsl.sl!=null?'$'+fmt(tpsl.sl,a.pxDp):'تعيين'}</span>
        </button>
      </div>
      <div class="pos-actions-row">
        <button class="btn-pos-close" onclick="askClose(${i})">إغلاق الصفقة ✕</button>
      </div>
    </div>`;
  }).join('');
  const t=$('totalPnl');
  if(t){ t.textContent=`${totalPnl>=0?'+':''}$${fmt(totalPnl,2)}`; t.className=`positions-pnl ${totalPnl>=0?'pos':'neg'}`; }
  if(typeof ChartModule!=='undefined') ChartModule.refreshLines();
}

// ════════════════════════════════════════
// askTrade + Netting + Fees
// ════════════════════════════════════════
function askTrade(isBuy){
  const qty=parseFloat($('qtyInput').value||State.qty||0);
  if(!qty||qty<=0) return toast('أدخل الكمية أولاً','err');
  const a=ASSETS[State.asset], p=State.prices[State.asset];
  if(!p?.mid) return toast('لا يوجد سعر','err');
  const px=isBuy?(p.ask||p.mid*1.00045):(p.bid||p.mid*0.99955);
  const fee=calcFee(px,qty);
  const mgn=(px*qty/a.lev).toFixed(2);
  const liq=fmt(px*(isBuy?1-1/a.lev:1+1/a.lev),a.pxDp);
  const oppIdx=findOpposite(State.asset,isBuy);
  let netNote='';
  if(oppIdx>=0){
    const oq=Math.abs(parseFloat(State.positions[oppIdx].position.szi));
    netNote=`<div class="confirm-row" style="background:rgba(212,167,44,.15)">
      <span class="confirm-key">⚡ Netting</span>
      <span class="confirm-val" style="color:var(--warn)">${qty<=oq?`يُغلق ${fmt(qty,a.szDp)} من المعاكس`:`يُغلق الكل + يفتح ${fmt(qty-oq,a.szDp)} جديد`}</span>
    </div>`;
  }
  setTxt('confirmTitle',`${a.icon} ${isBuy?'شراء ↑':'بيع ↓'} — ${a.name}`);
  setTxt('confirmSubtitle',`رافعة ${a.lev}x · وهمي`);
  $('confirmDetails').innerHTML=`${netNote}
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${qty} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">السعر</span><span class="confirm-val">${fmt(px,a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">الهامش</span><span class="confirm-val warn">≈ $${mgn}</span></div>
    <div class="confirm-row"><span class="confirm-key">رسوم الفتح (0.009%)</span><span class="confirm-val warn">$${fmt(fee,4)}</span></div>
    <div class="confirm-row"><span class="confirm-key">رصيدك المتاح</span><span class="confirm-val">$${fmt(State._paperBalance,2)}</span></div>
    <div class="confirm-row"><span class="confirm-key">التصفية التقريبية</span><span class="confirm-val sell">≈ ${liq} $</span></div>`;
  const btn=$('confirmExecute');
  btn.className=`btn-modal btn-confirm ${isBuy?'btn-success':'btn-danger'}`;
  btn.innerHTML=isBuy?'✅ تأكيد الشراء الوهمي':'✅ تأكيد البيع الوهمي';
  State.pendingTrade={isBuy,qty,sym:State.asset};
  openModal('modalConfirm');
}

async function execTrade(){
  if(!State.pendingTrade){ closeModal('modalConfirm'); return; }
  const {isBuy,qty,sym}=State.pendingTrade;
  const a=ASSETS[sym], p=State.prices[sym];
  if(!p?.mid){ toast('لا يوجد سعر','err'); closeModal('modalConfirm'); return; }
  setBtnLoading('confirmExecute','⏳');
  showLoader(`${a.icon} ${isBuy?'شراء':'بيع'} وهمي...`);
  try {
    const px=isBuy?(p.ask||p.mid*1.00045):(p.bid||p.mid*0.99955);
    const openFee=calcFee(px,qty);
    let remainQty=qty;

    // ── NETTING ──
    const oppIdx=findOpposite(sym,isBuy);
    if(oppIdx>=0){
      const opp=State.positions[oppIdx];
      const oppSzi=parseFloat(opp.position.szi), oppQty=Math.abs(oppSzi);
      const oppEp=parseFloat(opp.position.entryPx);
      const closeQty=Math.min(qty,oppQty);
      const closeFee=calcFee(px,closeQty);
      const rawPnl=oppSzi>0?(px-oppEp)*closeQty:(oppEp-px)*closeQty;
      const margin=oppEp*closeQty/a.lev;

      if(closeQty<oppQty){
        // أغلق جزء
        opp.position.szi=wire(oppSzi>0?(oppQty-closeQty):(-(oppQty-closeQty)),a.szDp);
        State._paperBalance+=margin+rawPnl-closeFee;
        State._paperHistory.push({coin:opp.position.coin,szi:wire(oppSzi>0?closeQty:-closeQty,a.szDp),entryPx:opp.position.entryPx,closePx:px.toFixed(a.pxDp),closedPnl:rawPnl,fee:closeFee,closeTime:Date.now(),reason:'Netting',side:oppSzi>0?'B':'A'});
        remainQty=0;
      } else {
        // أغلق كل المعاكس
        const fm=oppEp*oppQty/a.lev, fp2=oppSzi>0?(px-oppEp)*oppQty:(oppEp-px)*oppQty, ff=calcFee(px,oppQty);
        State._paperBalance+=fm+fp2-ff;
        State._paperHistory.push({coin:opp.position.coin,szi:opp.position.szi,entryPx:opp.position.entryPx,closePx:px.toFixed(a.pxDp),closedPnl:fp2,fee:ff,closeTime:Date.now(),reason:'Netting',side:oppSzi>0?'B':'A'});
        State.positions.splice(oppIdx,1);
        remainQty=qty-oppQty;
      }
    }

    // افتح جديد بالمتبقي
    if(remainQty>0.000001){
      const newMargin=px*remainQty/a.lev;
      const cost=newMargin+calcFee(px,remainQty);
      if(cost>State._paperBalance) throw new Error(`رصيد غير كافٍ — تحتاج $${fmt(cost,2)} · رصيدك $${fmt(State._paperBalance,2)}`);
      await new Promise(r=>setTimeout(r,250+Math.random()*200));
      State._paperBalance-=newMargin+calcFee(px,remainQty);
      State.positions.push({
        position:{coin:a.coin,szi:wire((isBuy?1:-1)*remainQty,a.szDp),entryPx:px.toFixed(a.pxDp),unrealizedPnl:'0.00'},
        tpsl:{tp:null,sl:null,tpOid:null,slOid:null},
      });
    }

    saveSession(); pollAccount();
    closeModal('modalConfirm'); State.pendingTrade=null;
    toast(`✅ ${a.icon} ${isBuy?'شراء':'بيع'} ${qty} ${a.unit} @ ${fmt(px,a.pxDp)} · رسوم $${fmt(openFee,4)}`,'ok',5000);
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
  const fee=calcFee(cur||parseFloat(pos.entryPx),Math.abs(szi));
  setTxt('closeTitle',`${a.icon} إغلاق — ${a.name}`);
  $('closeDetails').innerHTML=`
    <div class="confirm-row"><span class="confirm-key">الاتجاه</span><span class="confirm-val ${szi>0?'buy':'sell'}">${szi>0?'▲ شراء':'▼ بيع'}</span></div>
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${Math.abs(szi).toFixed(a.szDp)} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">سعر الدخول</span><span class="confirm-val">${fmt(pos.entryPx||0,a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">السعر الحالي</span><span class="confirm-val">${cur?fmt(cur,a.pxDp):'—'} $</span></div>
    <div class="confirm-row"><span class="confirm-key">رسوم الإغلاق (0.009%)</span><span class="confirm-val warn">$${fmt(fee,4)}</span></div>
    <div class="confirm-row"><span class="confirm-key">الصافي بعد الرسوم</span><span class="confirm-val ${(pnl-fee)>=0?'buy':'sell'}">${(pnl-fee)>=0?'+':''}$${fmt(pnl-fee,2)}</span></div>`;
  State.pendingClose=i; openModal('modalClose');
};

async function execClose(){
  if(State.pendingClose===null){ closeModal('modalClose'); return; }
  const i=State.pendingClose;
  const p=State.positions[i]; if(!p){closeModal('modalClose');return;}
  const pos=p.position, szi=parseFloat(pos.szi), coin=shortCoin(pos.coin);
  const a=ASSETS[coin], mid=State.prices[coin]?.mid;
  if(!a||!mid){ toast('بيانات ناقصة','err'); closeModal('modalClose'); return; }
  setBtnLoading('closeExecute','⏳');
  showLoader(`إغلاق ${a.icon} ${a.name}...`);
  try {
    await new Promise(r=>setTimeout(r,250));
    const closePx=szi>0?mid*0.99955:mid*1.00045;
    paperCloseAt(i,closePx,'إغلاق يدوي');
    saveSession(); pollAccount();
    closeModal('modalClose'); State.pendingClose=null;
  } catch(e){ toast(tradeErr(e.message),'err',5000); }
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
    const cur=State.prices[coin]?.mid||parseFloat(pos.entryPx);
    const net=pnl-calcFee(cur,Math.abs(parseFloat(pos.szi)));
    return `<div class="confirm-row"><span class="confirm-key">${a.icon} ${a.name}</span><span class="confirm-val ${net>=0?'buy':'sell'}">${net>=0?'+':''}$${fmt(net,2)}</span></div>`;
  }).join('');
  openModal('modalCloseAll');
}

async function execCloseAll(){
  if(!State.positions.length){ closeModal('modalCloseAll'); return; }
  setBtnLoading('closeAllExecute','⏳');
  showLoader('إغلاق جميع الصفقات...');
  await new Promise(r=>setTimeout(r,350));
  try {
    let ok=0;
    for(let i=State.positions.length-1;i>=0;i--){
      const p=State.positions[i], szi=parseFloat(p.position.szi);
      const coin=shortCoin(p.position.coin);
      const mid=State.prices[coin]?.mid||parseFloat(p.position.entryPx);
      paperCloseAt(i, szi>0?mid*0.99955:mid*1.00045, 'إغلاق الكل'); ok++;
    }
    saveSession(); pollAccount();
    closeModal('modalCloseAll'); toast(`✅ أُغلق ${ok} مركز`,'ok',4000);
  } finally { resetBtn('closeAllExecute'); hideLoader(); }
}

// ════════════════════════════════════════
// TP
// ════════════════════════════════════════
window.openTP=function(i){
  const p=State.positions[i]; if(!p)return;
  const pos=p.position, coin=shortCoin(pos.coin), a=ASSETS[coin]||{name:coin,pxDp:2};
  const isLong=parseFloat(pos.szi)>0, tpsl=p.tpsl||{};
  setTxt('tpTitle',`🎯 جني الربح — ${a.icon||''} ${a.name}`);
  setTxt('tpSubtitle',`${isLong?'▲ شراء':'▼ بيع'} | دخول: $${fmt(pos.entryPx||0,a.pxDp)}`);
  $('tpCurrentDetails').innerHTML=tpsl.tp!=null
    ?`<div class="confirm-row"><span class="confirm-key">الهدف الحالي</span><span class="confirm-val tp">$${fmt(tpsl.tp,a.pxDp)}</span></div>`
    :`<div class="confirm-row"><span class="confirm-key">الهدف</span><span class="confirm-val" style="color:var(--text-muted)">لم يُعيَّن بعد</span></div>`;
  $('tpDeleteRow').classList.toggle('hidden',tpsl.tp==null);
  $('tpAmount').value=''; setTxt('tpPreview','سعر التفعيل: —');
  State.pendingTP={index:i,coin:pos.coin,szi:pos.szi,entryPx:pos.entryPx,sym:coin,tpsl};
  openModal('modalTP');
};

function recalcTpPreview(){
  const tp=State.pendingTP; if(!tp)return;
  const val=parseFloat($('tpAmount')?.value||0);
  if(!val||val<=0){setTxt('tpPreview','سعر التفعيل: —');return;}
  const a=ASSETS[tp.sym]||{pxDp:2};
  const px=calcTpPrice(tp.entryPx,tp.szi,val);
  const fee=calcFee(px,Math.abs(parseFloat(tp.szi)));
  setTxt('tpPreview',`سعر: $${fmt(px,a.pxDp)}  ·  صافي: +$${fmt(val-fee,2)}`);
}

async function execTP(){
  const tp=State.pendingTP; if(!tp)return closeModal('modalTP');
  const val=parseFloat($('tpAmount').value||0);
  if(!val||val<=0) return toast('أدخل مبلغ الربح المستهدف','err');
  const a=ASSETS[tp.sym]; if(!a)return;
  const tpPx=calcTpPrice(tp.entryPx,tp.szi,val);
  const isLong=parseFloat(tp.szi)>0, cur=State.prices[tp.sym]?.mid;
  if(cur){
    if(isLong&&tpPx<=cur) return toast('❌ TP يجب أعلى من السعر الحالي لـ Long','err',4000);
    if(!isLong&&tpPx>=cur) return toast('❌ TP يجب أقل من السعر الحالي لـ Short','err',4000);
  }
  const idx=tp.index;
  if(idx<0||idx>=State.positions.length) return closeModal('modalTP');
  State.positions[idx].tpsl.tp=parseFloat(tpPx.toFixed(a.pxDp));
  State.positions[idx].tpsl.tpOid='tp_'+Date.now();
  saveSession(); pollAccount(); closeModal('modalTP');
  toast(`✅ جني الربح: $${fmt(tpPx,a.pxDp)} — يعمل في الخلفية 🎯`,'ok',4000);
}

async function deleteTP(){
  const tp=State.pendingTP; if(!tp)return;
  const idx=tp.index;
  if(idx<0||idx>=State.positions.length) return closeModal('modalTP');
  State.positions[idx].tpsl.tp=null; State.positions[idx].tpsl.tpOid=null;
  saveSession(); pollAccount(); closeModal('modalTP');
  toast('✅ تم إلغاء هدف الربح','ok',3000);
}

// ════════════════════════════════════════
// SL
// ════════════════════════════════════════
window.openSL=function(i){
  const p=State.positions[i]; if(!p)return;
  const pos=p.position, coin=shortCoin(pos.coin), a=ASSETS[coin]||{name:coin,pxDp:2};
  const isLong=parseFloat(pos.szi)>0, tpsl=p.tpsl||{};
  setTxt('slTitle',`🛡 وقف الخسارة — ${a.icon||''} ${a.name}`);
  setTxt('slSubtitle',`${isLong?'▲ شراء':'▼ بيع'} | دخول: $${fmt(pos.entryPx||0,a.pxDp)}`);
  $('slCurrentDetails').innerHTML=tpsl.sl!=null
    ?`<div class="confirm-row"><span class="confirm-key">الوقف الحالي</span><span class="confirm-val sl">$${fmt(tpsl.sl,a.pxDp)}</span></div>`
    :`<div class="confirm-row"><span class="confirm-key">وقف الخسارة</span><span class="confirm-val" style="color:var(--text-muted)">لم يُعيَّن بعد</span></div>`;
  $('slDeleteRow').classList.toggle('hidden',tpsl.sl==null);
  $('slAmount').value=''; setTxt('slPreview','سعر التفعيل: —');
  State.pendingSL={index:i,coin:pos.coin,szi:pos.szi,entryPx:pos.entryPx,sym:coin,tpsl};
  openModal('modalSL');
};

function recalcSlPreview(){
  const sl=State.pendingSL; if(!sl)return;
  const val=parseFloat($('slAmount')?.value||0);
  if(!val||val<=0){setTxt('slPreview','سعر التفعيل: —');return;}
  const a=ASSETS[sl.sym]||{pxDp:2};
  const px=calcSlPrice(sl.entryPx,sl.szi,val);
  setTxt('slPreview',`سعر: $${fmt(px,a.pxDp)}  ·  خسارة: -$${fmt(val,2)}`);
}

async function execSL(){
  const sl=State.pendingSL; if(!sl)return closeModal('modalSL');
  const val=parseFloat($('slAmount').value||0);
  if(!val||val<=0) return toast('أدخل الخسارة المسموح بها','err');
  const a=ASSETS[sl.sym]; if(!a)return;
  const slPx=calcSlPrice(sl.entryPx,sl.szi,val);
  const isLong=parseFloat(sl.szi)>0, cur=State.prices[sl.sym]?.mid;
  if(cur){
    if(isLong&&slPx>=cur) return toast('❌ SL يجب أقل من السعر الحالي لـ Long','err',4000);
    if(!isLong&&slPx<=cur) return toast('❌ SL يجب أعلى من السعر الحالي لـ Short','err',4000);
  }
  const idx=sl.index;
  if(idx<0||idx>=State.positions.length) return closeModal('modalSL');
  State.positions[idx].tpsl.sl=parseFloat(slPx.toFixed(a.pxDp));
  State.positions[idx].tpsl.slOid='sl_'+Date.now();
  saveSession(); pollAccount(); closeModal('modalSL');
  toast(`✅ وقف الخسارة: $${fmt(slPx,a.pxDp)} — يعمل في الخلفية 🛡`,'ok',4000);
}

async function deleteSL(){
  const sl=State.pendingSL; if(!sl)return;
  const idx=sl.index;
  if(idx<0||idx>=State.positions.length) return closeModal('modalSL');
  State.positions[idx].tpsl.sl=null; State.positions[idx].tpsl.slOid=null;
  saveSession(); pollAccount(); closeModal('modalSL');
  toast('✅ تم إلغاء وقف الخسارة','ok',3000);
}

// ════════════════════════════════════════
// تاريخ الصفقات
// ════════════════════════════════════════
async function showHistory(){
  if(!State.wallet) return toast('سجّل الدخول أولاً','err');
  openModal('modalHistory');
  const list=$('historyList');
  const hist=[...State._paperHistory].reverse().slice(0,10);
  if(!hist.length){ list.innerHTML='<div class="positions-empty">📂 لا يوجد تاريخ بعد</div>'; return; }
  list.innerHTML=hist.map(h=>{
    const coin=shortCoin(h.coin), a=ASSETS[coin]||{name:coin,icon:'📊',pxDp:2,szDp:2,unit:''};
    const isBuy=parseFloat(h.szi)>0, pnl=parseFloat(h.closedPnl||0), fee=parseFloat(h.fee||0), net=pnl-fee;
    const d=new Date(h.closeTime);
    const ds=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
    const ts=d.toLocaleTimeString('en-US',{hour12:true,hour:'2-digit',minute:'2-digit'});
    const pCls=net>0?'pos':net<0?'neg':'';
    return `<div class="history-item">
      <div class="hist-top">
        <div class="hist-asset">${a.icon} ${a.name}</div>
        <div class="hist-type ${isBuy?'buy':'sell'}">${isBuy?'شراء ↑':'بيع ↓'}</div>
        <div class="hist-pnl ${pCls}">${net!==0?(net>0?'+':'')+'$'+fmt(net,2):'—'}</div>
      </div>
      <div class="hist-grid">
        <div class="hist-cell"><span class="hist-lbl">الحجم</span><span class="hist-val">${Math.abs(parseFloat(h.szi)).toFixed(a.szDp)} ${a.unit}</span></div>
        <div class="hist-cell"><span class="hist-lbl">دخول ← خروج</span><span class="hist-val">${fmt(h.entryPx,a.pxDp)} ← ${fmt(h.closePx,a.pxDp)}</span></div>
        <div class="hist-cell"><span class="hist-lbl">الرسوم</span><span class="hist-val">$${fmt(fee,4)}</span></div>
        <div class="hist-cell"><span class="hist-lbl">التاريخ</span><span class="hist-val" style="font-size:9px">${ds} ${ts}</span></div>
      </div>
      ${h.reason?`<div style="font-size:9px;color:var(--text-muted);padding-top:3px">${h.reason}</div>`:''}
    </div>`;
  }).join('');
}

// ════════════════════════════════════════
// الرصيد
// ════════════════════════════════════════
async function showBalance(){
  openModal('modalBalance'); await _renderBalance();
  clearInterval(State._balTimer);
  State._balTimer=setInterval(async()=>{
    if(!$('modalBalance')?.classList.contains('open')){ clearInterval(State._balTimer); return; }
    await _renderBalance();
  },4000);
}

async function _renderBalance(){
  if(!State.wallet) return;
  const el=$('balanceContent'); if(!el) return;
  pollAccount();
  const b=State.balance||{total:State._paperBalance,margin:0,floatPnl:0};
  const pCls=(b.floatPnl||0)>=0?'green':'red';
  const tf=State._paperHistory.reduce((s,h)=>s+parseFloat(h.fee||0),0);
  el.innerHTML=`
    <div class="balance-grid">
      <div class="balance-item"><span class="balance-label">💰 الرصيد الكلي (وهمي)</span><span class="balance-value blue">$${fmt(b.total||0,2)}</span></div>
      <div class="balance-item"><span class="balance-label">💵 الرصيد المتاح</span><span class="balance-value">$${fmt(State._paperBalance,2)}</span></div>
      <div class="balance-item"><span class="balance-label">🔒 الهامش المستخدم</span><span class="balance-value warn">$${fmt(b.margin||0,2)}</span></div>
      <div class="balance-item"><span class="balance-label">📊 الربح العائم</span><span class="balance-value ${pCls}">${(b.floatPnl||0)>=0?'+':''}$${fmt(b.floatPnl||0,2)}</span></div>
      <div class="balance-item"><span class="balance-label">💸 إجمالي الرسوم</span><span class="balance-value warn">$${fmt(tf,4)}</span></div>
    </div>
    <div class="balance-auto-note">↻ كل 4 ثوانٍ · رصيد وهمي · رسوم 0.009% كل جانب</div>`;
}

// ════════════════════════════════════════
// إيداع / سحب وهمي
// ════════════════════════════════════════
async function doDeposit(){
  const amt=parseFloat($('depositAmount').value||0);
  if(!amt||amt<1) return toast('الحد الأدنى $1','err');
  setBtnLoading('depositExecute','⏳'); showLoader('جاري الإيداع الوهمي...');
  await new Promise(r=>setTimeout(r,900));
  State._paperBalance+=amt; saveSession(); pollAccount();
  closeModal('modalDeposit'); $('depositAmount').value='';
  toast(`✅ تمت إضافة $${fmt(amt,2)} وهمي 💵`,'ok',5000);
  hideLoader(); resetBtn('depositExecute');
}

async function doWithdraw(){
  const amt=parseFloat($('withdrawAmount').value||0);
  if(!amt||amt<=0) return toast('أدخل المبلغ','err');
  if(amt>State._paperBalance) return toast(`❌ رصيدك $${fmt(State._paperBalance,2)} فقط`,'err');
  setBtnLoading('withdrawExecute','⏳'); showLoader('جاري السحب الوهمي... 😄');
  await new Promise(r=>setTimeout(r,900));
  State._paperBalance-=amt; saveSession(); pollAccount();
  closeModal('modalWithdraw'); $('withdrawAmount').value='';
  toast(`✅ تم سحب $${fmt(amt,2)} وهمي 😂`,'ok',5000);
  hideLoader(); resetBtn('withdrawExecute');
}

// ════════════════════════════════════════
// دخول
// ════════════════════════════════════════
function createNewWallet(){
  const a=['ذكي','سريع','حكيم','جريء','بارع','ماهر'];
  const n=['متداول','مستثمر','محلل','ترايدر'];
  $('traderName').value=`${a[Math.floor(Math.random()*a.length)]}_${n[Math.floor(Math.random()*n.length)]}_${Math.floor(Math.random()*9999)}`;
  toast('✅ اسم عشوائي جاهز!','ok',2000);
}

async function login(){
  let name=($('traderName').value||'').trim();
  if(!name) return toast('أدخل اسم المتداول','err');
  if(name.length<2) return toast('الاسم قصير جداً','err');
  name=name.slice(0,25);
  setBtnLoading('loginBtn','⏳'); showLoader('تحميل الحساب التجريبي...');
  try {
    State.wallet={address:name,_paper:true};
    const saved=loadSession(name);
    if(saved){
      State._paperBalance=typeof saved.balance==='number'?saved.balance:0;
      State.positions=Array.isArray(saved.positions)?saved.positions:[];
      State._paperHistory=Array.isArray(saved.history)?saved.history:[];
    } else {
      State._paperBalance=0; State.positions=[]; State._paperHistory=[];
    }
    localStorage.setItem(LS_KEY,name);
    setTxt('navAddress',name);
    $('loginScreen').classList.add('hidden');
    $('appScreen').classList.remove('hidden');
    switchAsset('CL');
    showLoader('جلب الأسعار...');
    await pollPrices(); pollAccount(); hideLoader();
    if(saved) toast(`مرحباً مجدداً ${name} 📄`,'ok',4000);
    else toast(`مرحباً ${name} — رصيدك $0 · ابدأ بالإيداع 💵`,'ok',5000);
    State.timers.push(
      setInterval(pollPrices,1000),
      setInterval(()=>{ pollAccount(); saveSession(); },3000),
    );
    startMainClock();
    await registerSW();
    if('Notification' in window && Notification.permission==='default') Notification.requestPermission();
  } catch(e){
    hideLoader(); State.wallet=null; toast('خطأ: '+e.message.slice(0,80),'err');
  } finally { resetBtn('loginBtn'); }
}

function doLogout(){
  saveSession();
  State.timers.forEach(clearInterval);
  clearInterval(State.priceTimer); clearInterval(State._balTimer); clearInterval(State._clockTimer);
  State.wallet=null; State.positions=[]; State.openOrders=[];
  closeModal('modalLogout');
  $('appScreen').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('traderName').value='';
  toast('تم الحفظ والخروج 📄','info');
}

// ════════════════════════════════════════
// الساعة
// ════════════════════════════════════════
function startMainClock(){
  clearInterval(State._clockTimer);
  const tick=()=>{
    const now=new Date();
    const ts=now.toLocaleTimeString('en-US',{hour12:true,hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const ds=`${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
    setTxt('mainClock',`${ds} ${ts}`);
  };
  tick(); State._clockTimer=setInterval(tick,1000);
}

// ════════════════════════════════════════
// ربط الأحداث
// ════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  $('loginBtn').onclick=login;
  $('traderName').onkeydown=e=>e.key==='Enter'&&login();
  $('createWalletBtn')?.addEventListener('click',createNewWallet);
  document.querySelectorAll('.tab[data-asset]').forEach(t=>t.onclick=()=>switchAsset(t.dataset.asset));
  $('tabChart')?.addEventListener('click',()=>{ if(!State.wallet) return toast('سجّل الدخول أولاً','err'); ChartModule.open(State.asset); });
  $('btnBuy').onclick  =()=>State.wallet?askTrade(true) :toast('سجّل الدخول أولاً','err');
  $('btnSell').onclick =()=>State.wallet?askTrade(false):toast('سجّل الدخول أولاً','err');
  $('qtyInput').oninput=function(){ State.qty=parseFloat(this.value)||0; $('qtyPresets').querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active')); };
  $('qty100').onclick=()=>{
    if(!State.wallet) return toast('سجّل الدخول','err');
    const a=ASSETS[State.asset],bal=State._paperBalance||0,px=State.prices[State.asset]?.mid;
    if(!bal||!px) return toast('لا يوجد رصيد','err');
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
  $('confirmExecute').onclick=execTrade;
  $('closeCancel').onclick   =()=>{closeModal('modalClose');State.pendingClose=null;};
  $('closeExecute').onclick  =execClose;
  $('closeAllCancel').onclick =()=>closeModal('modalCloseAll');
  $('closeAllExecute').onclick=execCloseAll;
  $('tpCancel').onclick=()=>{closeModal('modalTP');State.pendingTP=null;};
  $('tpExecute').onclick=execTP; $('tpDelete').onclick=deleteTP; $('tpAmount').oninput=recalcTpPreview;
  $('slCancel').onclick=()=>{closeModal('modalSL');State.pendingSL=null;};
  $('slExecute').onclick=execSL; $('slDelete').onclick=deleteSL; $('slAmount').oninput=recalcSlPreview;
  $('balanceClose').onclick=()=>{ clearInterval(State._balTimer); closeModal('modalBalance'); };
  $('historyClose').onclick=()=>closeModal('modalHistory');
  $('depositCancel').onclick  =()=>closeModal('modalDeposit');
  $('depositExecute').onclick =doDeposit;
  $('withdrawCancel').onclick =()=>closeModal('modalWithdraw');
  $('withdrawExecute').onclick=doWithdraw;
  $('logoutCancel').onclick   =()=>closeModal('modalLogout');
  $('logoutExecute').onclick  =doLogout;
  $('navLogo').onclick=()=>openModal('modalAbout');
  $('aboutClose').onclick=()=>closeModal('modalAbout');
  $('navAddress').onclick=()=>{ if(!State.wallet) return; navigator.clipboard?.writeText(State.wallet.address).then(()=>toast('تم نسخ الاسم','info',2000)); };
  document.querySelectorAll('.modal-overlay').forEach(o=>o.onclick=e=>{if(e.target===o)o.classList.remove('open');});
  const saved=localStorage.getItem(LS_KEY);
  if(saved){ $('traderName').value=saved; login(); }
});
