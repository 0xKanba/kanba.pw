/* ═══════════════════════════════════════════════════════════════
   HLTrade Paper · paper.js
   نفس hl.js بالكامل — التداول وهمي 100% · أسعار حقيقية
   ✅ Username بدل Private Key
   ✅ hlExchange وهمي — لا blockchain
   ✅ pollAccount محلي — من localStorage
   ✅ TP/SL يُراقب تلقائياً بالأسعار الحقيقية
   ✅ إيداع/سحب وهمي — يعدّل الرصيد المحلي فقط
═══════════════════════════════════════════════════════════════ */

const HL_API  = 'https://api.hyperliquid.xyz';
const LS_KEY  = 'hlpaper_v1';

const ASSETS = {
  GOLD:   { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:1, unit:'أونصة', presets:[0.1,0.5,1,2,5],   icon:'🟡', name:'ذهب'    },
  SILVER: { coin:'xyz:SILVER', idx:110026, lev:25, cross:true,  szDp:2, pxDp:3, unit:'أونصة', presets:[1,2,3,5,8,10,20], icon:'⚪', name:'فضة'    },
  CL:     { coin:'xyz:CL',     idx:110029, lev:20, cross:false, szDp:3, pxDp:2, unit:'برميل', presets:[1,2,3,5,8,10,20], icon:'🛢', name:'نفط خام' }
};

const State = {
  wallet: null,          // {address: username, _paper: true}
  asset: 'GOLD', qty: 0.1,
  prices:  { GOLD:{bid:0,ask:0,mid:0}, SILVER:{bid:0,ask:0,mid:0}, CL:{bid:0,ask:0,mid:0} },
  prevMid: { GOLD:0, SILVER:0, CL:0 },
  // paper data
  _paperBalance: 0,      // رصيد USDC المتاح
  _paperHistory: [],     // سجل الصفقات المغلقة
  positions: [],         // نفس هيكل الحقيقي: [{position:{coin,szi,entryPx,unrealizedPnl}, tpsl:{tp,sl,tpOid,slOid}, _paperId}]
  openOrders: [],        // دائماً فارغ في Paper
  balance: null,         // {total, margin, floatPnl}
  timers: [], priceTimer: null, _balTimer: null, _clockTimer: null,
  pendingTrade: null, pendingClose: null, pendingTP: null, pendingSL: null,
};

// ════════════════════════════════════════
// أدوات DOM — نفس hl.js
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
function genPaperId(){ return 'P'+Date.now().toString(36).toUpperCase(); }

// ════════════════════════════════════════
// localStorage — حفظ وتحميل الجلسة
// ════════════════════════════════════════
function saveSession(){
  if(!State.wallet?._paper) return;
  const data={
    balance: State._paperBalance,
    positions: State.positions,
    history: State._paperHistory,
  };
  localStorage.setItem(LS_KEY+'_'+State.wallet.address, JSON.stringify(data));
  localStorage.setItem(LS_KEY+'_last', State.wallet.address);
}
function loadSession(username){
  try{ return JSON.parse(localStorage.getItem(LS_KEY+'_'+username)||'null'); }catch{ return null; }
}

// ════════════════════════════════════════
// API — hlInfo حقيقي · hlExchange وهمي
// ════════════════════════════════════════
async function hlInfo(body){
  const r=await fetch(HL_API+'/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// hlExchange وهمي — يُعيد نجاح فوري بعد تأخير واقعي
async function hlExchange(action){
  if(!State.wallet?._paper) throw new Error('لا توجد جلسة');
  await new Promise(r=>setTimeout(r,250+Math.random()*200));
  return {status:'ok',response:{data:{statuses:[{resting:{oid:Math.floor(Math.random()*9999999)}}]}}};
}

function tradeErr(msg){
  const m=msg.toLowerCase();
  if(m.includes('رصيد') || m.includes('كافٍ'))             return '❌ '+msg;
  if(m.includes('does not exist')||m.includes('not found')) return '⚠️ الحساب غير مفعّل — أودع رصيداً وهمياً أولاً';
  if(m.includes('insufficient')||m.includes('margin'))      return '❌ رصيد غير كافٍ';
  if(m.includes('halted')||m.includes('no fill'))           return '❌ السوق مغلق الآن — خارج أوقات التداول';
  if(m.includes('reduce'))                                   return '❌ لا يوجد مركز مفتوح';
  return `❌ ${msg.slice(0,150)}`;
}

// ════════════════════════════════════════
// تحديث الأسعار — نفس hl.js + checkTpSl
// ════════════════════════════════════════
async function pollPrices(){
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
  checkTpSl(); // مراقبة TP/SL من الأسعار الحقيقية
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
// pollAccount — محلي من State بدل API
// ════════════════════════════════════════
function pollAccount(){
  if(!State.wallet?._paper) return;
  let floatPnl=0, totalMargin=0;
  for(const p of State.positions){
    const coin=shortCoin(p.position.coin);
    const a=ASSETS[coin]||{lev:10,pxDp:2};
    const szi=parseFloat(p.position.szi);
    const entryPx=parseFloat(p.position.entryPx);
    const mid=State.prices[coin]?.mid||entryPx;
    const rawPnl=szi>0?(mid-entryPx)*Math.abs(szi):(entryPx-mid)*Math.abs(szi);
    floatPnl+=rawPnl;
    totalMargin+=entryPx*Math.abs(szi)/a.lev;
    p.position.unrealizedPnl=rawPnl.toFixed(2); // تحديث مستمر
  }
  const total=State._paperBalance+totalMargin+floatPnl;
  State.balance={total,margin:totalMargin,floatPnl};
  renderPositions();
}

// ════════════════════════════════════════
// checkTpSl — مراقبة TP/SL بالأسعار الحقيقية
// ════════════════════════════════════════
function checkTpSl(){
  if(!State.positions.length) return;
  let changed=false;
  for(let i=State.positions.length-1;i>=0;i--){
    const p=State.positions[i];
    const coin=shortCoin(p.position.coin);
    const mid=State.prices[coin]?.mid; if(!mid) continue;
    const szi=parseFloat(p.position.szi);
    const isLong=szi>0;
    const {tp,sl}=p.tpsl||{};
    if(tp!==null&&tp!==undefined){
      if((isLong&&mid>=tp)||(!isLong&&mid<=tp)){
        paperCloseAt(i,tp,'🎯 جني الربح تلقائي'); changed=true; continue;
      }
    }
    if(sl!==null&&sl!==undefined){
      if((isLong&&mid<=sl)||(!isLong&&mid>=sl)){
        paperCloseAt(i,sl,'🛡 وقف الخسارة تلقائي'); changed=true;
      }
    }
  }
  if(changed){ saveSession(); pollAccount(); }
}

function paperCloseAt(i, closePx, reason){
  const p=State.positions[i];
  const coin=shortCoin(p.position.coin);
  const a=ASSETS[coin]||{lev:10,pxDp:2,szDp:2,name:coin,icon:'📊'};
  const szi=parseFloat(p.position.szi);
  const entryPx=parseFloat(p.position.entryPx);
  const rawPnl=szi>0?(closePx-entryPx)*Math.abs(szi):(entryPx-closePx)*Math.abs(szi);
  const margin=entryPx*Math.abs(szi)/a.lev;
  State._paperBalance+=margin+rawPnl;
  if(State._paperBalance<0) State._paperBalance=0;
  State._paperHistory.push({
    coin:p.position.coin, szi:p.position.szi, entryPx:p.position.entryPx,
    closePx:closePx.toFixed(a.pxDp), closedPnl:rawPnl, closeTime:Date.now(), fee:0,
    side:szi>0?'B':'A', reason,
  });
  State.positions.splice(i,1);
  const sign=rawPnl>=0?'+':'';
  toast(`${reason} — ${a.icon} ${a.name}  ${sign}$${fmt(rawPnl,2)}`,rawPnl>=0?'ok':'err',6000);
}

// ════════════════════════════════════════
// تبويب الأصول — نفس hl.js
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
// renderPositions — نفس hl.js (الهيكل متطابق)
// ════════════════════════════════════════
function parseTpslFromOrders(orders,coin){
  // في Paper يكون openOrders دائماً فارغ — tpsl مخزون في pos.tpsl مباشرة
  return {tp:null,sl:null,tpOid:null,slOid:null};
}
function calcTpPrice(entryPx,szi,pnlTarget){ const sz=parseFloat(szi),ep=parseFloat(entryPx); return sz>0?ep+pnlTarget/Math.abs(sz):ep-pnlTarget/Math.abs(sz); }
function calcSlPrice(entryPx,szi,slAmount){  const sz=parseFloat(szi),ep=parseFloat(entryPx); return sz>0?ep-slAmount/Math.abs(sz):ep+slAmount/Math.abs(sz); }

function renderPositions(){
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
  list.innerHTML=State.positions.map((p,i)=>{
    const pos=p.position, szi=parseFloat(pos.szi), pnl=parseFloat(pos.unrealizedPnl||0);
    totalPnl+=pnl;
    const coin=shortCoin(pos.coin), a=ASSETS[coin]||{name:coin,unit:'',icon:'📊',pxDp:2,szDp:2,lev:10};
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
          <div class="pos-pnl ${pCls}">${sign}$${fmt(pnl,2)}</div>
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
// التداول — وهمي
// ════════════════════════════════════════
function askTrade(isBuy){
  const qty=parseFloat($('qtyInput').value||State.qty||0);
  if(!qty||qty<=0) return toast('أدخل الكمية أولاً','err');
  const a=ASSETS[State.asset], p=State.prices[State.asset];
  if(!p?.mid) return toast('لا يوجد سعر — انتظر لحظة','err');
  const entryPx=isBuy?(p.ask||p.mid*1.0005):(p.bid||p.mid*0.9995);
  const usd=(entryPx*qty).toFixed(2), mgn=(entryPx*qty/a.lev).toFixed(2);
  const liq=fmt(entryPx*(isBuy?1-1/a.lev:1+1/a.lev),a.pxDp);
  setTxt('confirmTitle',`${a.icon} ${isBuy?'شراء ↑':'بيع ↓'} — ${a.name}`);
  setTxt('confirmSubtitle',`رافعة ${a.lev}x · وهمي 100%`);
  $('confirmDetails').innerHTML=`
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${qty} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">السعر</span><span class="confirm-val">${fmt(entryPx,a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">القيمة الكلية</span><span class="confirm-val">≈ $${usd}</span></div>
    <div class="confirm-row"><span class="confirm-key">الهامش المطلوب</span><span class="confirm-val warn">≈ $${mgn}</span></div>
    <div class="confirm-row"><span class="confirm-key">الرصيد المتاح</span><span class="confirm-val">${fmt(State._paperBalance,2)} $</span></div>
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
  showLoader(`${a.icon} ${isBuy?'شراء':'بيع'} وهمي ${qty} ${a.unit}...`);
  try {
    const entryPx=isBuy?(p.ask||p.mid*1.0005):(p.bid||p.mid*0.9995);
    const margin=entryPx*qty/a.lev;
    if(margin>State._paperBalance) throw new Error(`رصيد غير كافٍ — تحتاج $${fmt(margin,2)} هامش · رصيدك $${fmt(State._paperBalance,2)}`);
    await new Promise(r=>setTimeout(r,400+Math.random()*300)); // تأخير واقعي
    State._paperBalance-=margin;
    const paperId=genPaperId();
    const sziStr=wire((isBuy?1:-1)*qty,a.szDp);
    State.positions.push({
      position:{
        coin:a.coin,
        szi:sziStr,
        entryPx:entryPx.toFixed(a.pxDp),
        unrealizedPnl:'0.00',
        returnOnEquity:'0.00',
      },
      tpsl:{tp:null,sl:null,tpOid:null,slOid:null},
      _paperId:paperId,
    });
    saveSession();
    closeModal('modalConfirm');
    toast(`✅ ${a.icon} ${isBuy?'شراء':'بيع'} ${qty} ${a.unit} @ ${fmt(entryPx,a.pxDp)}`,'ok',5000);
    State.pendingTrade=null;
    pollAccount();
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
  $('closeDetails').innerHTML=`
    <div class="confirm-row"><span class="confirm-key">الاتجاه</span><span class="confirm-val ${szi>0?'buy':'sell'}">${szi>0?'▲ شراء':'▼ بيع'}</span></div>
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${Math.abs(szi).toFixed(a.szDp)} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">سعر الدخول</span><span class="confirm-val">${fmt(pos.entryPx||0,a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">السعر الحالي</span><span class="confirm-val">${cur?fmt(cur,a.pxDp):'—'} $</span></div>
    <div class="confirm-row"><span class="confirm-key">الربح / الخسارة</span><span class="confirm-val ${pnl>=0?'buy':'sell'}">${pnl>=0?'+':''}$${fmt(pnl,2)}</span></div>`;
  State.pendingClose=i; openModal('modalClose');
};

async function execClose(){
  if(State.pendingClose===null){ closeModal('modalClose'); return; }
  const p=State.positions[State.pendingClose]; if(!p){closeModal('modalClose');return;}
  const pos=p.position, szi=parseFloat(pos.szi), coin=shortCoin(pos.coin);
  const a=ASSETS[coin], mid=State.prices[coin]?.mid;
  if(!a||!mid){ toast('بيانات ناقصة','err'); closeModal('modalClose'); return; }
  setBtnLoading('closeExecute','⏳');
  showLoader(`إغلاق وهمي ${a.icon} ${a.name}...`);
  try {
    await new Promise(r=>setTimeout(r,400));
    const closePx=szi>0?mid*0.9995:mid*1.0005; // spread واقعي صغير
    paperCloseAt(State.pendingClose, closePx, 'إغلاق يدوي');
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
    return `<div class="confirm-row"><span class="confirm-key">${a.icon} ${a.name}</span><span class="confirm-val ${pnl>=0?'buy':'sell'}">${pnl>=0?'+':''}$${fmt(pnl,2)}</span></div>`;
  }).join('');
  openModal('modalCloseAll');
}

async function execCloseAll(){
  const positions=[...State.positions]; if(!positions.length){closeModal('modalCloseAll');return;}
  setBtnLoading('closeAllExecute','⏳');
  showLoader('إغلاق جميع الصفقات الوهمية...');
  await new Promise(r=>setTimeout(r,500));
  let ok=0;
  try {
    for(let i=State.positions.length-1;i>=0;i--){
      const p=State.positions[i];
      const coin=shortCoin(p.position.coin);
      const szi=parseFloat(p.position.szi);
      const mid=State.prices[coin]?.mid||parseFloat(p.position.entryPx);
      const closePx=szi>0?mid*0.9995:mid*1.0005;
      paperCloseAt(i,closePx,'إغلاق الكل'); ok++;
    }
    saveSession(); pollAccount();
    closeModal('modalCloseAll');
    toast(`✅ أُغلق ${ok} مركز`,'ok',4000);
  } finally { resetBtn('closeAllExecute'); hideLoader(); }
}

// ════════════════════════════════════════
// TP/SL — وهمي مخزون في pos.tpsl مباشرة
// ════════════════════════════════════════
window.openTP=async function(i){
  const p=State.positions[i]; if(!p)return;
  const pos=p.position, coin=shortCoin(pos.coin);
  const a=ASSETS[coin]||{name:coin,pxDp:2};
  const isLong=parseFloat(pos.szi)>0;
  setTxt('tpTitle',`🎯 تحديد حجم الربح — ${a.icon||''} ${a.name}`);
  setTxt('tpSubtitle',`${isLong?'▲ شراء':'▼ بيع'} | دخول: $${fmt(pos.entryPx||0,a.pxDp)}`);
  const freshTpsl=p.tpsl||{tp:null,sl:null,tpOid:null,slOid:null};
  $('tpCurrentDetails').innerHTML=freshTpsl.tp
    ?`<div class="confirm-row"><span class="confirm-key">الربح المعين حالياً</span><span class="confirm-val tp">$${fmt(freshTpsl.tp,a.pxDp)}</span></div>`
    :`<div class="confirm-row"><span class="confirm-key">الربح المعين</span><span class="confirm-val" style="color:var(--text-muted)">لم يُعيَّن بعد</span></div>`;
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
  setTxt('tpPreview',`سعر التفعيل: $${fmt(calcTpPrice(tp.entryPx,tp.szi,val),a.pxDp)}`);
}

async function execTP(){
  const tp=State.pendingTP; if(!tp)return closeModal('modalTP');
  const val=parseFloat($('tpAmount').value||0);
  if(!val||val<=0) return toast('أدخل مبلغ الربح المستهدف بالدولار','err');
  const a=ASSETS[tp.sym]; if(!a)return;
  const tpPx=calcTpPrice(tp.entryPx,tp.szi,val);
  const idx=tp.index;
  if(idx>=0&&idx<State.positions.length){
    State.positions[idx].tpsl.tp=parseFloat(tpPx.toFixed(a.pxDp));
    State.positions[idx].tpsl.tpOid='paper_tp_'+Date.now();
  }
  saveSession(); pollAccount();
  closeModal('modalTP');
  toast(`✅ هدف الربح = $${fmt(tpPx,a.pxDp)}`,'ok',4000);
}

async function deleteTP(){
  const tp=State.pendingTP; if(!tp)return;
  const idx=tp.index;
  if(idx>=0&&idx<State.positions.length){
    State.positions[idx].tpsl.tp=null;
    State.positions[idx].tpsl.tpOid=null;
  }
  saveSession(); pollAccount();
  closeModal('modalTP');
  toast('✅ تم إلغاء هدف الربح','ok',3000);
}

window.openSL=async function(i){
  const p=State.positions[i]; if(!p)return;
  const pos=p.position, coin=shortCoin(pos.coin);
  const a=ASSETS[coin]||{name:coin,pxDp:2};
  const isLong=parseFloat(pos.szi)>0;
  setTxt('slTitle',`🛡 تحديد حجم الخسارة — ${a.icon||''} ${a.name}`);
  setTxt('slSubtitle',`${isLong?'▲ شراء':'▼ بيع'} | دخول: $${fmt(pos.entryPx||0,a.pxDp)}`);
  const freshTpsl=p.tpsl||{tp:null,sl:null,tpOid:null,slOid:null};
  $('slCurrentDetails').innerHTML=freshTpsl.sl
    ?`<div class="confirm-row"><span class="confirm-key">الخسارة المعينة حالياً</span><span class="confirm-val sl">$${fmt(freshTpsl.sl,a.pxDp)}</span></div>`
    :`<div class="confirm-row"><span class="confirm-key">وقف الخسارة</span><span class="confirm-val" style="color:var(--text-muted)">لم يُعيَّن بعد</span></div>`;
  $('slDeleteRow').classList.toggle('hidden',!freshTpsl.slOid);
  $('slAmount').value='';
  setTxt('slPreview','سعر التفعيل: —');
  State.pendingSL={index:i,coin:pos.coin,szi:pos.szi,entryPx:pos.entryPx,sym:coin,tpsl:freshTpsl};
  openModal('modalSL');
};

function recalcSlPreview(){
  const sl=State.pendingSL; if(!sl)return;
  const val=parseFloat($('slAmount')?.value||0);
  if(!val||val<=0){setTxt('slPreview','سعر التفعيل: —');return;}
  const a=ASSETS[sl.sym]||{pxDp:2};
  setTxt('slPreview',`سعر التفعيل: $${fmt(calcSlPrice(sl.entryPx,sl.szi,val),a.pxDp)}`);
}

async function execSL(){
  const sl=State.pendingSL; if(!sl)return closeModal('modalSL');
  const val=parseFloat($('slAmount').value||0);
  if(!val||val<=0) return toast('أدخل مبلغ الخسارة المسموح بها بالدولار','err');
  const a=ASSETS[sl.sym]; if(!a)return;
  const slPx=calcSlPrice(sl.entryPx,sl.szi,val);
  const idx=sl.index;
  if(idx>=0&&idx<State.positions.length){
    State.positions[idx].tpsl.sl=parseFloat(slPx.toFixed(a.pxDp));
    State.positions[idx].tpsl.slOid='paper_sl_'+Date.now();
  }
  saveSession(); pollAccount();
  closeModal('modalSL');
  toast(`✅ وقف الخسارة = $${fmt(slPx,a.pxDp)}`,'ok',4000);
}

async function deleteSL(){
  const sl=State.pendingSL; if(!sl)return;
  const idx=sl.index;
  if(idx>=0&&idx<State.positions.length){
    State.positions[idx].tpsl.sl=null;
    State.positions[idx].tpsl.slOid=null;
  }
  saveSession(); pollAccount();
  closeModal('modalSL');
  toast('✅ تم إلغاء وقف الخسارة','ok',3000);
}

// ════════════════════════════════════════
// تاريخ الصفقات — من _paperHistory
// ════════════════════════════════════════
async function showHistory(){
  if(!State.wallet) return toast('سجّل الدخول أولاً','err');
  openModal('modalHistory');
  const list=$('historyList');
  const hist=[...State._paperHistory].reverse().slice(0,10);
  if(!hist.length){
    list.innerHTML='<div class="positions-empty">📂 لا يوجد تاريخ صفقات بعد</div>'; return;
  }
  list.innerHTML=hist.map(h=>{
    const coin=shortCoin(h.coin), a=ASSETS[coin]||{name:coin,icon:'📊',pxDp:2,szDp:2,unit:''};
    const isBuy=parseFloat(h.szi)>0;
    const pnl=parseFloat(h.closedPnl||0);
    const d=new Date(h.closeTime);
    const dateStr=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
    const timeStr=d.toLocaleTimeString('en-US',{hour12:true,hour:'2-digit',minute:'2-digit'});
    const pCls=pnl>0?'pos':pnl<0?'neg':'';
    return `<div class="history-item">
      <div class="hist-top">
        <div class="hist-asset">${a.icon} ${a.name}</div>
        <div class="hist-type ${isBuy?'buy':'sell'}">${isBuy?'شراء ↑':'بيع ↓'}</div>
        <div class="hist-pnl ${pCls}">${pnl!==0?(pnl>0?'+':'')+'$'+fmt(pnl,2):'—'}</div>
      </div>
      <div class="hist-grid">
        <div class="hist-cell"><span class="hist-lbl">الحجم</span><span class="hist-val">${Math.abs(parseFloat(h.szi)).toFixed(a.szDp)} ${a.unit}</span></div>
        <div class="hist-cell"><span class="hist-lbl">الدخول</span><span class="hist-val">${fmt(h.entryPx,a.pxDp)} $</span></div>
        <div class="hist-cell"><span class="hist-lbl">الخروج</span><span class="hist-val">${fmt(h.closePx,a.pxDp)} $</span></div>
        <div class="hist-cell"><span class="hist-lbl">التاريخ</span><span class="hist-val" style="font-size:9px">${dateStr} ${timeStr}</span></div>
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════
// الرصيد — من State المحلي
// ════════════════════════════════════════
async function showBalance(){
  openModal('modalBalance');
  await _renderBalance();
  clearInterval(State._balTimer);
  State._balTimer=setInterval(async()=>{
    if(!document.getElementById('modalBalance')?.classList.contains('open')){
      clearInterval(State._balTimer); return;
    }
    await _renderBalance();
  },4000);
}

async function _renderBalance(){
  if(!State.wallet) return;
  const el=$('balanceContent'); if(!el) return;
  pollAccount(); // تحديث الحسابات
  const b=State.balance||{total:State._paperBalance,margin:0,floatPnl:0};
  const pCls=b.floatPnl>=0?'green':'red';
  el.innerHTML=`
    <div class="balance-grid">
      <div class="balance-item">
        <span class="balance-label">💰 الرصيد الكلي (وهمي)</span>
        <span class="balance-value blue">$${fmt(b.total||0,2)}</span>
      </div>
      <div class="balance-item">
        <span class="balance-label">💵 الرصيد المتاح</span>
        <span class="balance-value">$${fmt(State._paperBalance,2)}</span>
      </div>
      <div class="balance-item">
        <span class="balance-label">🔒 الهامش المستخدم</span>
        <span class="balance-value warn">$${fmt(b.margin||0,2)}</span>
      </div>
      <div class="balance-item">
        <span class="balance-label">📊 الربح العائم</span>
        <span class="balance-value ${pCls}">${(b.floatPnl||0)>=0?'+':''}$${fmt(b.floatPnl||0,2)}</span>
      </div>
    </div>
    <div class="balance-auto-note">↻ تحديث تلقائي كل 4 ثوانٍ · هذا رصيد وهمي تجريبي 📄</div>`;
}

// ════════════════════════════════════════
// إيداع وهمي
// ════════════════════════════════════════
async function doDeposit(){
  const amt=parseFloat($('depositAmount').value||0);
  if(!amt||amt<1) return toast('أدخل مبلغاً أكبر من $1','err');
  if(amt>10000000) return toast('الحد الأقصى $10,000,000','err');
  setBtnLoading('depositExecute','⏳');
  showLoader('جاري الإيداع الوهمي...');
  await new Promise(r=>setTimeout(r,800)); // تأخير واقعي 😄
  State._paperBalance+=amt;
  saveSession(); pollAccount();
  closeModal('modalDeposit');
  $('depositAmount').value='';
  toast(`✅ تمت إضافة $${fmt(amt,2)} وهمي لرصيدك 💵`,'ok',5000);
  hideLoader(); resetBtn('depositExecute');
}

// ════════════════════════════════════════
// سحب وهمي
// ════════════════════════════════════════
async function doWithdraw(){
  const amt=parseFloat($('withdrawAmount').value||0);
  if(!amt||amt<=0) return toast('أدخل المبلغ','err');
  if(amt>State._paperBalance) return toast(`❌ رصيدك المتاح $${fmt(State._paperBalance,2)} فقط`,'err');
  setBtnLoading('withdrawExecute','⏳');
  showLoader('جاري السحب الوهمي... 😄');
  await new Promise(r=>setTimeout(r,800));
  State._paperBalance-=amt;
  saveSession(); pollAccount();
  closeModal('modalWithdraw');
  $('withdrawAmount').value='';
  toast(`✅ تم سحب $${fmt(amt,2)} وهمي — يا حظك! 😂`,'ok',5000);
  hideLoader(); resetBtn('withdrawExecute');
}

// ════════════════════════════════════════
// دخول — Username بدل Private Key
// ════════════════════════════════════════
function createNewWallet(){
  // بدل إنشاء محفظة → اسم عشوائي
  const adj=['ذكي','سريع','حكيم','جريء','ثابت','بارع','ماهر'];
  const noun=['متداول','مستثمر','محلل','ترايدر','محترف'];
  const a=adj[Math.floor(Math.random()*adj.length)];
  const n=noun[Math.floor(Math.random()*noun.length)];
  const num=Math.floor(Math.random()*9999);
  $('traderName').value=`${a}_${n}_${num}`;
  toast('✅ اسم عشوائي جاهز!','ok',2000);
}

async function login(){
  let name=($('traderName').value||'').trim();
  if(!name) return toast('أدخل اسم المتداول','err');
  if(name.length<2) return toast('الاسم قصير جداً — حرفان على الأقل','err');
  name=name.slice(0,25);
  setBtnLoading('loginBtn','⏳');
  showLoader('تحميل الحساب التجريبي...');
  try {
    State.wallet={address:name, _paper:true};
    // تحميل جلسة محفوظة
    const saved=loadSession(name);
    if(saved){
      State._paperBalance=typeof saved.balance==='number'?saved.balance:0;
      State.positions=Array.isArray(saved.positions)?saved.positions:[];
      State._paperHistory=Array.isArray(saved.history)?saved.history:[];
      toast(`مرحباً مجدداً ${name} 📄`,'ok',4000);
    } else {
      State._paperBalance=0;
      State.positions=[];
      State._paperHistory=[];
      toast(`مرحباً ${name} — رصيدك $0 ابدأ بالإيداع الوهمي 💵`,'ok',5000);
    }
    localStorage.setItem(LS_KEY,name);
    setTxt('navAddress',name);
    $('loginScreen').classList.add('hidden');
    $('appScreen').classList.remove('hidden');
    switchAsset('CL');
    showLoader('جلب الأسعار والحساب...');
    await pollPrices();
    pollAccount();
    hideLoader();
    State.timers.push(
      setInterval(pollPrices,1000),
      setInterval(()=>{ pollAccount(); saveSession(); },5000),
    );
    startMainClock();
  } catch(e){
    hideLoader(); State.wallet=null;
    toast('خطأ: '+e.message.slice(0,80),'err');
  } finally { resetBtn('loginBtn'); }
}

function doLogout(){
  saveSession(); // حفظ قبل الخروج
  State.timers.forEach(clearInterval);
  clearInterval(State.priceTimer);
  clearInterval(State._balTimer);
  clearInterval(State._clockTimer);
  State.wallet=null; State.positions=[]; State.openOrders=[];
  closeModal('modalLogout');
  $('appScreen').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('traderName').value='';
  toast('تم الحفظ والخروج 📄','info');
}

// ════════════════════════════════════════
// الساعة — نفس hl.js
// ════════════════════════════════════════
function startMainClock(){
  clearInterval(State._clockTimer);
  const tick=()=>{
    const now=new Date();
    const timeStr=now.toLocaleTimeString('en-US',{hour12:true,hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const dateStr=`${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
    setTxt('mainClock',`${dateStr} ${timeStr}`);
  };
  tick();
  State._clockTimer=setInterval(tick,1000);
}

// ════════════════════════════════════════
// ربط الأحداث — نفس hl.js مع تعديلات Paper
// ════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  $('loginBtn').onclick=login;
  $('traderName').onkeydown=e=>e.key==='Enter'&&login();
  $('createWalletBtn')?.addEventListener('click',createNewWallet);

  document.querySelectorAll('.tab[data-asset]').forEach(t=>t.onclick=()=>switchAsset(t.dataset.asset));

  $('tabChart')?.addEventListener('click',()=>{
    if(!State.wallet) return toast('سجّل الدخول أولاً','err');
    ChartModule.open(State.asset);
  });

  $('btnBuy').onclick  =()=>State.wallet?askTrade(true) :toast('سجّل الدخول أولاً','err');
  $('btnSell').onclick =()=>State.wallet?askTrade(false):toast('سجّل الدخول أولاً','err');
  $('qtyInput').oninput=function(){ State.qty=parseFloat(this.value)||0; $('qtyPresets').querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active')); };
  $('qty100').onclick=()=>{
    if(!State.wallet) return toast('سجّل الدخول','err');
    const a=ASSETS[State.asset],bal=State._paperBalance||0,px=State.prices[State.asset]?.mid;
    if(!bal||!px) return toast('لا يوجد رصيد — أودع أولاً','err');
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

  $('tpCancel').onclick  =()=>{closeModal('modalTP');State.pendingTP=null;};
  $('tpExecute').onclick =execTP;
  $('tpDelete').onclick  =deleteTP;
  $('tpAmount').oninput  =recalcTpPreview;

  $('slCancel').onclick  =()=>{closeModal('modalSL');State.pendingSL=null;};
  $('slExecute').onclick =execSL;
  $('slDelete').onclick  =deleteSL;
  $('slAmount').oninput  =recalcSlPreview;

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

  $('navAddress').onclick=()=>{
    if(!State.wallet) return;
    navigator.clipboard?.writeText(State.wallet.address).then(()=>toast('تم نسخ اسم المتداول','info',2000));
  };

  document.querySelectorAll('.modal-overlay').forEach(o=>o.onclick=e=>{if(e.target===o)o.classList.remove('open');});

  // autologin — استعادة آخر اسم
  const saved=localStorage.getItem(LS_KEY);
  if(saved){ $('traderName').value=saved; login(); }
});
