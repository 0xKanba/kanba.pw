/* c.js — تقويم التداول HLTrade v3.0 */
(function(){
'use strict';

/* ── CSS ── */
document.head.insertAdjacentHTML('beforeend',`<style>
#calMod{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.93);
  backdrop-filter:blur(16px);display:none;flex-direction:column;
  font-family:'Cairo',sans-serif;direction:rtl;}
#calMod.open{display:flex;}
.ch{display:flex;align-items:center;justify-content:space-between;
  padding:13px 16px 11px;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;}
.ch-title{font-size:17px;font-weight:900;color:#f0ece4;}
.ch-back{background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.14);
  color:#f0ece4;border-radius:20px;padding:7px 18px;font-size:13px;
  font-weight:800;cursor:pointer;font-family:'Cairo',sans-serif;}
.ch-back:active{transform:scale(.96);}
.cbody{flex:1;overflow-y:auto;padding:12px 10px;-webkit-overflow-scrolling:touch;}
/* Stats */
.cstats{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:13px;}
.cstat{background:#1e1c18;border-radius:10px;padding:9px 3px;text-align:center;
  border:1px solid rgba(255,255,255,.06);}
.cstat-l{font-size:9px;color:#8a8278;display:block;margin-bottom:3px;font-weight:700;}
.cstat-v{font-size:12px;font-weight:900;font-family:'IBM Plex Mono',monospace;}
.cstat-v.up{color:#34c85a;} .cstat-v.dn{color:#f05248;} .cstat-v.dim{color:#8a8278;}
/* Nav */
.cnav{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:9px;}
.cnav-btn{background:rgba(255,255,255,.08);border:none;color:#f0ece4;
  width:30px;height:30px;border-radius:50%;font-size:17px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;}
.cnav-btn:active{transform:scale(.88);}
.cmonth{font-size:15px;font-weight:800;color:#f0ece4;min-width:128px;text-align:center;}
/* Grid header */
.cghdr{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:3px;}
.cghdr span{text-align:center;font-size:9px;font-weight:800;color:#8a8278;
  background:#1e1c18;padding:4px 0;border-radius:4px;}
/* Calendar grid */
.cgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}
.cday{background:#1e1c18;border-radius:6px;aspect-ratio:1/1.2;
  padding:4px 3px;display:flex;flex-direction:column;
  justify-content:space-between;cursor:pointer;
  border:1px solid transparent;transition:border-color .12s;overflow:hidden;}
.cday.dim{opacity:.2;pointer-events:none;}
.cday.profit{background:rgba(52,200,90,.14);border-color:rgba(52,200,90,.35);}
.cday.loss{background:rgba(240,82,72,.14);border-color:rgba(240,82,72,.35);}
.cday.today{border-color:#e07248!important;}
.cday:hover:not(.dim){border-color:#e07248;}
.cdn{font-size:9px;font-weight:700;color:#8a8278;line-height:1;}
.cdv{font-size:clamp(8px,2.2vw,12px);font-weight:900;text-align:center;
  line-height:1.1;font-family:'IBM Plex Mono',monospace;}
.cdv.up{color:#34c85a;} .cdv.dn{color:#f05248;}
/* Loader */
.cload{display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:50px;gap:14px;color:#8a8278;font-size:14px;font-weight:700;}
.cspinner{width:28px;height:28px;border:3px solid rgba(255,255,255,.1);
  border-top-color:#e07248;border-radius:50%;animation:cSpin .8s linear infinite;}
@keyframes cSpin{to{transform:rotate(360deg);}}
/* Day detail */
.cdet{position:absolute;inset:0;z-index:10;background:rgba(19,18,16,.97);
  display:none;flex-direction:column;overflow:hidden;}
.cdet.open{display:flex;}
.cdh{display:flex;align-items:center;justify-content:space-between;
  padding:13px 16px;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;}
.cdh-t{font-size:15px;font-weight:900;color:#f0ece4;}
.cdb{flex:1;overflow-y:auto;padding:12px;}
.ctot{text-align:center;font-family:'IBM Plex Mono',monospace;font-size:20px;
  font-weight:900;margin-bottom:12px;}
.ctcard{background:#1e1c18;border-radius:11px;padding:11px;margin-bottom:9px;
  border:1px solid rgba(255,255,255,.07);}
.ctt{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;}
.ctcoin{font-weight:900;font-size:15px;color:#f0ece4;}
.ctside{font-size:11px;font-weight:800;padding:3px 9px;border-radius:99px;}
.ctside.buy{background:rgba(52,200,90,.2);color:#34c85a;}
.ctside.sell{background:rgba(240,82,72,.2);color:#f05248;}
.ctg{display:grid;grid-template-columns:1fr 1fr;gap:5px;
  background:#131210;border-radius:7px;padding:7px;}
.cti{display:flex;flex-direction:column;gap:2px;}
.ctl{font-size:9px;color:#8a8278;font-weight:800;text-transform:uppercase;}
.ctv{font-size:12px;font-weight:800;font-family:'IBM Plex Mono',monospace;color:#f0ece4;}
.ctpnl{margin-top:7px;font-family:'IBM Plex Mono',monospace;font-size:17px;font-weight:900;}
.ctpnl.up{color:#34c85a;} .ctpnl.dn{color:#f05248;}
.cempty{text-align:center;padding:40px;color:#8a8278;font-size:14px;font-weight:700;}
</style>`);

/* ── HTML ── */
document.body.insertAdjacentHTML('beforeend',`
<div id="calMod">
  <div class="ch">
    <button class="ch-back" id="calBack">← رجوع</button>
    <span class="ch-title">📅 تقويم التداول</span>
    <span style="width:72px"></span>
  </div>
  <div class="cbody" id="calBody">
    <div class="cload" id="calLoad"><div class="cspinner"></div><span>جاري التحميل...</span></div>
    <div id="calCont" style="display:none">
      <div class="cstats" id="calStats"></div>
      <div class="cnav">
        <button class="cnav-btn" id="calPrev">›</button>
        <span class="cmonth" id="calMonth">—</span>
        <button class="cnav-btn" id="calNext">‹</button>
      </div>
      <div class="cghdr">
        <span>إث</span><span>ث</span><span>أر</span><span>خ</span><span>ج</span><span>س</span><span>أح</span>
      </div>
      <div class="cgrid" id="calGrid"></div>
    </div>
  </div>
  <div class="cdet" id="calDet">
    <div class="cdh">
      <span class="cdh-t" id="calDetT">—</span>
      <button class="ch-back" id="calDetClose">✕</button>
    </div>
    <div class="cdb" id="calDetB"></div>
  </div>
</div>`);

/* ── State ── */
const MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
let _fills=[], _fundMap={}, _dayMap={}, _cur=new Date(), _loaded=false;
const $=id=>document.getElementById(id);

/* ── Helpers ── */
function dayKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function addDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function monStart(d){ const r=new Date(d); const day=r.getDay(); r.setDate(r.getDate()-(day===0?6:day-1)); return r; }

/* ── Get wallet address from localStorage ── */
function getWalletAddr(){
  // 1. From hl.js State (if script loaded and logged in)
  if(window.State?.wallet?.address) return window.State.wallet.address;
  // 2. From localStorage private key → derive address via ethers
  const pk = localStorage.getItem('hl_trade_pk');
  if(pk && typeof ethers !== 'undefined'){
    try{ return new ethers.Wallet(pk).address; } catch{}
  }
  return null;
}

/* ── API ── */
async function fetchFills(addr){
  const r=await fetch('https://api.hyperliquid.xyz/info',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({type:'userFills',user:addr})
  });
  if(!r.ok) throw new Error('فشل الاتصال');
  return r.json();
}

// رسوم التمويل: userFundingHistory — delta.type==='funding', delta.usdc = المبلغ
async function fetchFundingHistory(addr){
  const startTime = Date.now() - 365*24*3600*1000; // سنة كاملة
  const r=await fetch('https://api.hyperliquid.xyz/info',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({type:'userFundingHistory',user:addr,startTime})
  });
  if(!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

/* ── Build maps ── */
function buildMaps(fills, fundingHistory){
  // يومي PnL
  const dayMap={};
  fills.forEach(f=>{
    const key=dayKey(new Date(f.time));
    const pnl=parseFloat(f.closedPnl||0)-parseFloat(f.fee||0);
    dayMap[key]=(dayMap[key]||0)+pnl;
  });

  // رسوم التمويل: مجموع delta.usdc لكل يوم
  // usdc موجب = استقبلت / سالب = دفعت
  const fundMap={};
  fundingHistory.forEach(e=>{
    const d=e.delta; if(d?.type!=='funding') return;
    const key=dayKey(new Date(e.time));
    const usd=parseFloat(d.usdc||0);
    fundMap[key]=(fundMap[key]||0)+usd;
  });

  return {dayMap, fundMap};
}

/* ── Stats ── */
function renderStats(){
  const now=Date.now();
  const sum=ms=>_fills.filter(f=>f.time>=now-ms).reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
  const all=_fills.reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
  const f=(v)=>{const s=v>=0?'+':'';const c=v>=0?'up':'dn';return `<span class="cstat-v ${c}">${s}$${Math.abs(v).toFixed(2)}</span>`;};
  $('calStats').innerHTML=`
    <div class="cstat"><span class="cstat-l">24س</span>${f(sum(86400000))}</div>
    <div class="cstat"><span class="cstat-l">7 أيام</span>${f(sum(7*86400000))}</div>
    <div class="cstat"><span class="cstat-l">30 يوم</span>${f(sum(30*86400000))}</div>
    <div class="cstat"><span class="cstat-l">الكل</span>${f(all)}</div>`;
}

/* ── Render calendar ── */
function renderCal(){
  const y=_cur.getFullYear(), m=_cur.getMonth();
  $('calMonth').textContent=MONTHS[m]+' '+y;
  const first=new Date(y,m,1), last=new Date(y,m+1,0);
  const startGrid=monStart(first);
  const lastDay=last.getDay(); const toSun=lastDay===0?0:7-lastDay;
  const endGrid=addDays(last,toSun);
  const todayKey=dayKey(new Date());
  const grid=$('calGrid'); grid.innerHTML='';
  let d=new Date(startGrid);
  while(d<=endGrid){
    const key=dayKey(d);
    const pnl=_dayMap[key]||0;
    const fund=_fundMap[key]||0;
    const inMonth=d.getMonth()===m&&d.getFullYear()===y;
    const isToday=key===todayKey;
    const box=document.createElement('div');
    let cls='cday';
    if(!inMonth) cls+=' dim';
    else if(pnl>0.005) cls+=' profit';
    else if(pnl<-0.005) cls+=' loss';
    if(isToday) cls+=' today';
    box.className=cls;
    let pnlHtml='';
    if(inMonth&&(pnl!==0||fund!==0)){
      const total=pnl+fund;
      const abs=Math.abs(total);
      const txt=abs>=1000?abs.toFixed(0):abs>=100?abs.toFixed(1):abs>=10?abs.toFixed(2):abs.toFixed(2);
      pnlHtml=`<span class="cdv ${total>=0?'up':'dn'}">${total>=0?'':'−'}$${txt}</span>`;
    }
    box.innerHTML=`<span class="cdn">${d.getDate()}</span>${pnlHtml}`;
    if(inMonth){ const snap=new Date(d); box.onclick=()=>showDay(snap); }
    grid.appendChild(box);
    d=addDays(d,1);
  }
}

/* ── Day detail ── */
function showDay(date){
  const key=dayKey(date);
  const fills=_fills.filter(f=>dayKey(new Date(f.time))===key);
  const fund=_fundMap[key]||0;
  $('calDetT').textContent=`${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  const body=$('calDetB'); body.innerHTML='';
  if(!fills.length&&fund===0){
    body.innerHTML='<div class="cempty">📂 لا توجد صفقات هذا اليوم</div>'; $('calDet').classList.add('open'); return;
  }
  const tradePnl=fills.reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
  const total=tradePnl+fund;
  body.insertAdjacentHTML('beforeend',`<div class="ctot" style="color:${total>=0?'#34c85a':'#f05248'}">${total>=0?'+':'-'}$${Math.abs(total).toFixed(2)}</div>`);
  // رسوم التمويل
  if(fund!==0){
    body.insertAdjacentHTML('beforeend',`
      <div class="ctcard" style="border-color:rgba(224,114,72,.3)">
        <div class="ctt"><span class="ctcoin">💰 رسوم التمويل</span></div>
        <div style="font-family:'IBM Plex Mono';font-size:16px;font-weight:900;text-align:left;color:${fund>=0?'#34c85a':'#f05248'}">${fund>=0?'+':'-'}$${Math.abs(fund).toFixed(6)}</div>
      </div>`);
  }
  fills.forEach(f=>{
    const pnl=parseFloat(f.closedPnl||0)-parseFloat(f.fee||0);
    const t=new Date(f.time);
    const time=String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
    const card=document.createElement('div'); card.className='ctcard';
    card.innerHTML=`
      <div class="ctt">
        <span class="ctcoin">${f.coin}</span>
        <span class="ctside ${f.side==='B'?'buy':'sell'}">${f.side==='B'?'▲ شراء':'▼ بيع'}</span>
      </div>
      <div class="ctg">
        <div class="cti"><span class="ctl">السعر</span><span class="ctv">$${parseFloat(f.px).toFixed(2)}</span></div>
        <div class="cti"><span class="ctl">الحجم</span><span class="ctv">${parseFloat(f.sz).toFixed(4)}</span></div>
        <div class="cti"><span class="ctl">الوقت</span><span class="ctv">${time}</span></div>
        <div class="cti"><span class="ctl">رسوم التداول</span><span class="ctv" style="color:#f0be30">$${parseFloat(f.fee||0).toFixed(4)}</span></div>
      </div>
      <div class="ctpnl ${pnl>=0?'up':'dn'}">${pnl>=0?'+':'-'}$${Math.abs(pnl).toFixed(2)}</div>`;
    body.appendChild(card);
  });
  $('calDet').classList.add('open');
}

/* ── Load data ── */
async function load(addr){
  $('calLoad').style.display='flex';
  $('calLoad').innerHTML='<div class="cspinner"></div><span>جاري التحميل...</span>';
  $('calCont').style.display='none';
  try{
    const [fills,funding]=await Promise.all([fetchFills(addr), fetchFundingHistory(addr)]);
    _fills=Array.isArray(fills)?fills:[];
    const maps=buildMaps(_fills,funding);
    _dayMap=maps.dayMap; _fundMap=maps.fundMap;
    _loaded=true;
    renderStats(); renderCal();
    $('calLoad').style.display='none';
    $('calCont').style.display='block';
  }catch(e){
    $('calLoad').innerHTML=`<span style="color:#f05248;font-size:15px">❌ ${e.message}</span>`;
  }
}

/* ── Events ── */
$('calBack').onclick=()=>$('calMod').classList.remove('open');
$('calDetClose').onclick=()=>$('calDet').classList.remove('open');
$('calPrev').onclick=()=>{_cur=new Date(_cur.getFullYear(),_cur.getMonth()-1,1);renderCal();};
$('calNext').onclick=()=>{_cur=new Date(_cur.getFullYear(),_cur.getMonth()+1,1);renderCal();};

/* ── Public ── */
window.openCalendar=function(){
  _cur=new Date();
  $('calMod').classList.add('open');
  $('calDet').classList.remove('open');
  const addr=getWalletAddr();
  if(!addr){
    $('calLoad').style.display='flex';
    $('calLoad').innerHTML='<span style="color:#8a8278;font-size:14px">⚠️ سجّل الدخول أولاً</span>';
    $('calCont').style.display='none'; return;
  }
  if(_loaded){ renderStats(); renderCal(); $('calLoad').style.display='none'; $('calCont').style.display='block'; }
  else load(addr);
};

function bindBtn(){ const b=document.getElementById('btnCalendar'); if(b) b.onclick=()=>window.openCalendar(); }
bindBtn();
document.addEventListener('DOMContentLoaded',bindBtn);
})();
