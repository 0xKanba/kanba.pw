/* c.js — تقويم التداول v4 — ديناميكي، بلا scroll خارجي */
(function(){
'use strict';

document.head.insertAdjacentHTML('beforeend',`<style>
#calMod{
  position:fixed;inset:0;z-index:500;
  background:var(--bg-app,#131210);
  display:none;flex-direction:column;overflow:hidden;
  font-family:'Cairo',sans-serif;direction:rtl;
}
#calMod.open{display:flex;}

/* Header */
.cal-hdr{
  display:flex;align-items:center;justify-content:space-between;
  padding:12px 14px 10px;
  border-bottom:1px solid rgba(255,255,255,.08);
  flex-shrink:0;background:var(--bg-card,#1e1c18);
}
.cal-title{font-size:16px;font-weight:900;color:var(--text-primary,#f0ece4);}
.cal-back{
  background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.15);
  color:var(--text-primary,#f0ece4);border-radius:20px;padding:6px 16px;
  font-size:13px;font-weight:800;cursor:pointer;font-family:'Cairo',sans-serif;
}

/* Stats — ثابتة أعلى */
.cal-stats{
  display:grid;grid-template-columns:repeat(4,1fr);gap:4px;
  padding:8px 10px 0;flex-shrink:0;
  background:var(--bg-app,#131210);
}
.cal-stat{
  background:var(--bg-card,#1e1c18);border-radius:8px;
  padding:8px 3px;text-align:center;
  border:1px solid rgba(255,255,255,.06);
}
.cal-stat-l{font-size:9px;color:#8a8278;display:block;margin-bottom:2px;font-weight:700;}
.cal-stat-v{font-size:11px;font-weight:900;font-family:'IBM Plex Mono',monospace;}
.cal-stat-v.up{color:#34c85a;} .cal-stat-v.dn{color:#f05248;} .cal-stat-v.dim{color:#8a8278;}

/* Nav */
.cal-nav{
  display:flex;align-items:center;justify-content:center;
  gap:12px;padding:8px 10px 4px;flex-shrink:0;
}
.cal-nav-btn{
  background:rgba(255,255,255,.08);border:none;
  color:var(--text-primary,#f0ece4);
  width:28px;height:28px;border-radius:50%;font-size:16px;
  cursor:pointer;display:flex;align-items:center;justify-content:center;
}
.cal-month{font-size:14px;font-weight:800;color:var(--text-primary,#f0ece4);
  min-width:120px;text-align:center;}

/* Grid header */
.cal-ghdr{
  display:grid;grid-template-columns:repeat(7,1fr);gap:2px;
  padding:0 10px 3px;flex-shrink:0;
}
.cal-ghdr span{
  text-align:center;font-size:9px;font-weight:800;color:#8a8278;
  background:var(--bg-card,#1e1c18);padding:3px 0;border-radius:3px;
}

/* Calendar grid — يملأ المساحة المتبقية */
.cal-grid-wrap{
  flex:1;overflow-y:auto;padding:0 10px 10px;
  -webkit-overflow-scrolling:touch;
}
.cal-grid{
  display:grid;grid-template-columns:repeat(7,1fr);
  gap:2px;
}
.cal-day{
  background:var(--bg-card,#1e1c18);border-radius:5px;
  aspect-ratio:1/1.1;
  display:flex;flex-direction:column;
  justify-content:space-between;padding:3px;
  cursor:pointer;border:1px solid transparent;
  overflow:hidden;
}
.cal-day.dim{opacity:.2;pointer-events:none;}
.cal-day.profit{background:rgba(52,200,90,.15);border-color:rgba(52,200,90,.4);}
.cal-day.loss{background:rgba(240,82,72,.15);border-color:rgba(240,82,72,.4);}
.cal-day.today{border-color:#e07248!important;}
.cal-day:hover:not(.dim){border-color:#e07248;}
.cal-dn{font-size:8px;font-weight:700;color:#8a8278;line-height:1;}
.cal-dv{
  font-size:clamp(8px,1.9vw,11px);
  font-weight:900;text-align:center;line-height:1;
  font-family:'IBM Plex Mono',monospace;
}
.cal-dv.up{color:#34c85a;} .cal-dv.dn{color:#f05248;}

/* Loader */
.cal-load{
  flex:1;display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  gap:12px;color:#8a8278;font-size:14px;font-weight:700;
}
.cal-spin{
  width:26px;height:26px;border:3px solid rgba(255,255,255,.1);
  border-top-color:#e07248;border-radius:50%;
  animation:cSpin .8s linear infinite;
}
@keyframes cSpin{to{transform:rotate(360deg);}}

/* Day detail */
.cal-det{
  position:absolute;inset:0;z-index:10;
  background:var(--bg-app,#131210);
  display:none;flex-direction:column;
}
.cal-det.open{display:flex;}
.cal-det-hdr{
  display:flex;align-items:center;justify-content:space-between;
  padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08);
  flex-shrink:0;background:var(--bg-card,#1e1c18);
}
.cal-det-body{flex:1;overflow-y:auto;padding:10px;}
.cal-tot{
  text-align:center;font-family:'IBM Plex Mono',monospace;
  font-size:22px;font-weight:900;margin-bottom:10px;
}
.cal-tcard{
  background:var(--bg-card,#1e1c18);border-radius:10px;
  padding:10px;margin-bottom:8px;
  border:1px solid rgba(255,255,255,.07);
}
.cal-tt{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
.cal-tc{font-weight:900;font-size:14px;color:var(--text-primary,#f0ece4);}
.cal-ts{font-size:11px;font-weight:800;padding:3px 9px;border-radius:99px;}
.cal-ts.buy{background:rgba(52,200,90,.2);color:#34c85a;}
.cal-ts.sell{background:rgba(240,82,72,.2);color:#f05248;}
.cal-tg{
  display:grid;grid-template-columns:1fr 1fr;gap:5px;
  background:rgba(0,0,0,.25);border-radius:6px;padding:7px;
}
.cal-ti{display:flex;flex-direction:column;gap:1px;}
.cal-tl{font-size:9px;color:#8a8278;font-weight:700;text-transform:uppercase;}
.cal-tv{font-size:12px;font-weight:800;font-family:'IBM Plex Mono',monospace;
  color:var(--text-primary,#f0ece4);}
.cal-tp{
  margin-top:7px;font-family:'IBM Plex Mono',monospace;
  font-size:16px;font-weight:900;
}
.cal-tp.up{color:#34c85a;} .cal-tp.dn{color:#f05248;}
.cal-empty{text-align:center;padding:40px;color:#8a8278;font-size:14px;font-weight:700;}
.cal-fund-card{
  background:rgba(224,114,72,.1);border:1px solid rgba(224,114,72,.3);
  border-radius:10px;padding:10px;margin-bottom:8px;
}
</style>`);

document.body.insertAdjacentHTML('beforeend',`
<div id="calMod">
  <div class="cal-hdr">
    <button class="cal-back" id="calBack">← رجوع</button>
    <span class="cal-title">📅 تقويم التداول</span>
    <span style="width:70px"></span>
  </div>

  <div class="cal-load" id="calLoad">
    <div class="cal-spin"></div><span>جاري التحميل...</span>
  </div>

  <div id="calMain" style="display:none;flex:1;flex-direction:column;overflow:hidden;display:none;">
    <div class="cal-stats" id="calStats"></div>
    <div class="cal-nav">
      <button class="cal-nav-btn" id="calPrev">›</button>
      <span class="cal-month" id="calMonth">—</span>
      <button class="cal-nav-btn" id="calNext">‹</button>
    </div>
    <div class="cal-ghdr">
      <span>إث</span><span>ث</span><span>أر</span><span>خ</span>
      <span>ج</span><span>س</span><span>أح</span>
    </div>
    <div class="cal-grid-wrap">
      <div class="cal-grid" id="calGrid"></div>
    </div>
  </div>

  <div class="cal-det" id="calDet">
    <div class="cal-det-hdr">
      <span id="calDetT" style="font-size:15px;font-weight:900;">—</span>
      <button class="cal-back" id="calDetClose">✕</button>
    </div>
    <div class="cal-det-body" id="calDetB"></div>
  </div>
</div>`);

const MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو',
              'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
let _fills=[], _fundMap={}, _dayMap={}, _cur=new Date(), _ready=false;
const $=id=>document.getElementById(id);

function dayKey(d){
  return d.getFullYear()+'-'+
    String(d.getMonth()+1).padStart(2,'0')+'-'+
    String(d.getDate()).padStart(2,'0');
}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function monStart(d){
  const r=new Date(d);
  const day=r.getDay();
  r.setDate(r.getDate()-(day===0?6:day-1));
  return r;
}

function getAddr(){
  if(window.State?.wallet?.address) return window.State.wallet.address;
  const pk=localStorage.getItem('hl_trade_pk');
  if(pk){
    try{
      if(typeof ethers!=='undefined') return new ethers.Wallet(pk).address;
    }catch{}
  }
  return null;
}

async function api(body){
  const r=await fetch('https://api.hyperliquid.xyz/info',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  return r.json();
}

function buildMaps(fills,funding){
  const dayMap={}, fundMap={};
  fills.forEach(f=>{
    const k=dayKey(new Date(f.time));
    const pnl=parseFloat(f.closedPnl||0)-parseFloat(f.fee||0);
    dayMap[k]=(dayMap[k]||0)+pnl;
  });
  (funding||[]).forEach(e=>{
    if(e.delta?.type!=='funding') return;
    const k=dayKey(new Date(e.time));
    const usd=parseFloat(e.delta.usdc||0);
    fundMap[k]=(fundMap[k]||0)+usd;
  });
  return {dayMap,fundMap};
}

function showStats(){
  const now=Date.now();
  const pnl=ms=>_fills.filter(f=>f.time>=now-ms)
    .reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
  const all=_fills.reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
  const row=(lbl,v)=>`<div class="cal-stat">
    <span class="cal-stat-l">${lbl}</span>
    <span class="cal-stat-v ${v>=0?'up':'dn'}">${v>=0?'+':''}$${Math.abs(v).toFixed(2)}</span>
  </div>`;
  $('calStats').innerHTML=
    row('24 س',pnl(86400000))+
    row('7 أيام',pnl(604800000))+
    row('30 يوم',pnl(2592000000))+
    row('الكل',all);
}

function showCal(){
  const y=_cur.getFullYear(),m=_cur.getMonth();
  $('calMonth').textContent=MONTHS[m]+' '+y;
  const first=new Date(y,m,1), last=new Date(y,m+1,0);
  const start=monStart(first);
  const end=addDays(last, last.getDay()===0?0:7-last.getDay());
  const todayK=dayKey(new Date());
  const grid=$('calGrid'); grid.innerHTML='';
  let d=new Date(start);
  while(d<=end){
    const k=dayKey(d);
    const trad=_dayMap[k]||0, fund=_fundMap[k]||0;
    const total=trad+fund;
    const inM=d.getMonth()===m&&d.getFullYear()===y;
    const box=document.createElement('div');
    let cls='cal-day';
    if(!inM) cls+=' dim';
    else if(total>0.005) cls+=' profit';
    else if(total<-0.005) cls+=' loss';
    if(k===todayK) cls+=' today';
    box.className=cls;
    let pHtml='';
    if(inM&&total!==0){
      const abs=Math.abs(total);
      const txt=abs>=1000?abs.toFixed(0):abs>=10?abs.toFixed(1):abs.toFixed(2);
      pHtml=`<span class="cal-dv ${total>0?'up':'dn'}">${total>0?'':'-'}$${txt}</span>`;
    } else {
      pHtml='<span></span>';
    }
    box.innerHTML=`<span class="cal-dn">${d.getDate()}</span>${pHtml}`;
    if(inM){const snap=new Date(d);box.onclick=()=>showDay(snap);}
    grid.appendChild(box);
    d=addDays(d,1);
  }
}

function showDay(date){
  const k=dayKey(date);
  const fills=_fills.filter(f=>dayKey(new Date(f.time))===k);
  const fund=_fundMap[k]||0;
  $('calDetT').textContent=`${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  const body=$('calDetB'); body.innerHTML='';
  const trad=fills.reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
  const total=trad+fund;
  if(fills.length===0&&fund===0){
    body.innerHTML='<div class="cal-empty">📂 لا توجد صفقات هذا اليوم</div>';
    $('calDet').classList.add('open'); return;
  }
  body.insertAdjacentHTML('beforeend',
    `<div class="cal-tot" style="color:${total>=0?'#34c85a':'#f05248'}">
      ${total>=0?'+':'-'}$${Math.abs(total).toFixed(2)}
    </div>`);
  if(fund!==0){
    body.insertAdjacentHTML('beforeend',`
      <div class="cal-fund-card">
        <div style="font-size:12px;font-weight:700;color:#e07248;margin-bottom:4px;">💰 رسوم التمويل</div>
        <div style="font-family:'IBM Plex Mono';font-size:17px;font-weight:900;
          color:${fund>=0?'#34c85a':'#f05248'}">
          ${fund>=0?'+':'-'}$${Math.abs(fund).toFixed(6)}
        </div>
      </div>`);
  }
  fills.forEach(f=>{
    const pnl=parseFloat(f.closedPnl||0)-parseFloat(f.fee||0);
    const t=new Date(f.time);
    const tm=String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
    const c=document.createElement('div'); c.className='cal-tcard';
    c.innerHTML=`
      <div class="cal-tt">
        <span class="cal-tc">${f.coin}</span>
        <span class="cal-ts ${f.side==='B'?'buy':'sell'}">${f.side==='B'?'▲ شراء':'▼ بيع'}</span>
      </div>
      <div class="cal-tg">
        <div class="cal-ti"><span class="cal-tl">السعر</span><span class="cal-tv">$${parseFloat(f.px).toFixed(2)}</span></div>
        <div class="cal-ti"><span class="cal-tl">الحجم</span><span class="cal-tv">${parseFloat(f.sz).toFixed(4)}</span></div>
        <div class="cal-ti"><span class="cal-tl">الوقت</span><span class="cal-tv">${tm}</span></div>
        <div class="cal-ti"><span class="cal-tl">رسوم التداول</span><span class="cal-tv" style="color:#f0be30">$${parseFloat(f.fee||0).toFixed(4)}</span></div>
      </div>
      <div class="cal-tp ${pnl>=0?'up':'dn'}">${pnl>=0?'+':'-'}$${Math.abs(pnl).toFixed(2)}</div>`;
    body.appendChild(c);
  });
  $('calDet').classList.add('open');
}

function showMain(){
  $('calLoad').style.display='none';
  const main=$('calMain');
  main.style.display='flex';
  main.style.flexDirection='column';
  main.style.overflow='hidden';
  main.style.flex='1';
}

async function load(addr){
  $('calLoad').style.display='flex';
  $('calLoad').innerHTML='<div class="cal-spin"></div><span>جاري التحميل...</span>';
  $('calMain').style.display='none';
  try{
    const [fills,funding]=await Promise.all([
      api({type:'userFills',user:addr}),
      api({type:'userFundingHistory',user:addr,startTime:Date.now()-365*86400000}).catch(()=>[])
    ]);
    _fills=Array.isArray(fills)?fills:[];
    const maps=buildMaps(_fills,Array.isArray(funding)?funding:[]);
    _dayMap=maps.dayMap; _fundMap=maps.fundMap;
    _ready=true;
    showStats(); showCal(); showMain();
  }catch(e){
    $('calLoad').innerHTML=`<span style="color:#f05248;font-size:14px">❌ ${e.message}</span>`;
  }
}

$('calBack').onclick=()=>$('calMod').classList.remove('open');
$('calDetClose').onclick=()=>$('calDet').classList.remove('open');
$('calPrev').onclick=()=>{_cur=new Date(_cur.getFullYear(),_cur.getMonth()-1,1);showCal();};
$('calNext').onclick=()=>{_cur=new Date(_cur.getFullYear(),_cur.getMonth()+1,1);showCal();};

window.openCalendar=function(){
  _cur=new Date();
  $('calMod').classList.add('open');
  $('calDet').classList.remove('open');
  const addr=getAddr();
  if(!addr){
    $('calLoad').style.display='flex';
    $('calLoad').innerHTML='<span style="color:#8a8278;font-size:14px">⚠️ سجّل الدخول أولاً</span>';
    $('calMain').style.display='none';
    return;
  }
  if(_ready){showStats();showCal();showMain();}
  else load(addr);
};

function bind(){
  const b=document.getElementById('btnCalendar');
  if(b) b.onclick=()=>window.openCalendar();
}
bind();
document.addEventListener('DOMContentLoaded',bind);
})();
