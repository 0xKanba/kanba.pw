/* ══════════════════════════════════════════════════════
   c.js — تقويم التداول | HLTrade Calendar v2.0
   ملف مستقل: CSS + HTML + Logic
   يُفتح عبر btnCalendar — يقرأ المحفظة تلقائياً
══════════════════════════════════════════════════════ */
(function CalendarModule() {
  'use strict';

  /* ─── CSS ─── */
  const style = document.createElement('style');
  style.textContent = `
  #calModal {
    position:fixed; inset:0; z-index:500;
    background:rgba(0,0,0,.92);
    backdrop-filter:blur(16px);
    display:none; flex-direction:column;
    font-family:'Cairo',sans-serif;
  }
  #calModal.open { display:flex; }

  .cal-hdr {
    display:flex; align-items:center; justify-content:space-between;
    padding:14px 16px 12px;
    border-bottom:1px solid rgba(255,255,255,.08);
    flex-shrink:0;
  }
  .cal-title { font-size:17px; font-weight:900; color:#f0ece4; }
  .cal-back {
    background:rgba(255,255,255,.1); border:1.5px solid rgba(255,255,255,.15);
    color:#f0ece4; border-radius:20px; padding:7px 18px;
    font-size:13px; font-weight:800; cursor:pointer; font-family:'Cairo',sans-serif;
  }
  .cal-back:active { transform:scale(.96); }

  .cal-body { flex:1; overflow-y:auto; padding:12px 10px; -webkit-overflow-scrolling:touch; }

  /* Stats */
  .cal-stats {
    display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:14px;
  }
  .cal-stat {
    background:#1e1c18; border-radius:10px; padding:10px 4px; text-align:center;
    border:1px solid rgba(255,255,255,.06);
  }
  .cal-stat-lbl { font-size:9px; color:#8a8278; display:block; margin-bottom:3px; font-weight:700; }
  .cal-stat-val { font-size:13px; font-weight:900; font-family:'IBM Plex Mono',monospace; }
  .cal-stat-val.up  { color:#34c85a; }
  .cal-stat-val.dn  { color:#f05248; }
  .cal-stat-val.dim { color:#8a8278; }

  /* Nav */
  .cal-nav {
    display:flex; align-items:center; justify-content:center;
    gap:16px; margin-bottom:10px;
  }
  .cal-nav-btn {
    background:rgba(255,255,255,.08); border:none; color:#f0ece4;
    width:32px; height:32px; border-radius:50%; font-size:18px;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
  }
  .cal-nav-btn:active { transform:scale(.9); }
  .cal-month { font-size:15px; font-weight:800; color:#f0ece4; min-width:130px; text-align:center; }

  /* Grid header */
  .cal-ghdr {
    display:grid; grid-template-columns:repeat(7,1fr); gap:2px; margin-bottom:3px;
  }
  .cal-ghdr span {
    text-align:center; font-size:9px; font-weight:800; color:#8a8278;
    background:#1e1c18; padding:4px 0; border-radius:4px;
  }

  /* Calendar grid */
  .cal-grid {
    display:grid; grid-template-columns:repeat(7,1fr); gap:2px;
  }
  .cal-day {
    background:#1e1c18; border-radius:6px;
    aspect-ratio:1/1.25; padding:4px 3px;
    display:flex; flex-direction:column; justify-content:space-between;
    cursor:pointer; border:1px solid transparent;
    transition:border-color .12s;
    min-height:0; overflow:hidden;
  }
  .cal-day.dim { opacity:.2; pointer-events:none; }
  .cal-day.profit { background:rgba(52,200,90,.14); border-color:rgba(52,200,90,.35); }
  .cal-day.loss   { background:rgba(240,82,72,.14); border-color:rgba(240,82,72,.35); }
  .cal-day.today  { border-color:#e07248 !important; }
  .cal-day:hover:not(.dim)  { border-color:#e07248; }
  .cal-dnum { font-size:9px; font-weight:700; color:#8a8278; line-height:1; }
  .cal-dpnl {
    font-size:clamp(8px,2.2vw,12px); font-weight:900;
    text-align:center; line-height:1.1;
    font-family:'IBM Plex Mono',monospace;
  }
  .cal-dpnl.up { color:#34c85a; }
  .cal-dpnl.dn { color:#f05248; }

  /* Loader */
  .cal-loader {
    display:flex; flex-direction:column; align-items:center;
    justify-content:center; padding:40px; gap:12px; color:#8a8278;
    font-size:14px; font-weight:700;
  }
  .cal-spinner {
    width:28px; height:28px; border:3px solid rgba(255,255,255,.1);
    border-top-color:#e07248; border-radius:50%;
    animation:calSpin .8s linear infinite;
  }
  @keyframes calSpin { to { transform:rotate(360deg); } }

  /* Day detail panel */
  .cal-detail {
    position:absolute; inset:0; z-index:10;
    background:rgba(19,18,16,.97); backdrop-filter:blur(10px);
    display:none; flex-direction:column; overflow:hidden;
  }
  .cal-detail.open { display:flex; }
  .cal-dhdr {
    display:flex; align-items:center; justify-content:space-between;
    padding:14px 16px; border-bottom:1px solid rgba(255,255,255,.08); flex-shrink:0;
  }
  .cal-dtitle { font-size:15px; font-weight:900; color:#f0ece4; }
  .cal-dbody { flex:1; overflow-y:auto; padding:12px; }
  .cal-tcard {
    background:#1e1c18; border-radius:12px; padding:12px; margin-bottom:10px;
    border:1px solid rgba(255,255,255,.07);
  }
  .cal-ttop {
    display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;
  }
  .cal-tcoin { font-weight:900; font-size:15px; color:#f0ece4; }
  .cal-tside {
    font-size:11px; font-weight:800; padding:3px 10px; border-radius:99px;
  }
  .cal-tside.buy  { background:rgba(52,200,90,.2); color:#34c85a; }
  .cal-tside.sell { background:rgba(240,82,72,.2); color:#f05248; }
  .cal-tgrid {
    display:grid; grid-template-columns:1fr 1fr; gap:6px;
    background:#131210; border-radius:8px; padding:8px;
  }
  .cal-titem { display:flex; flex-direction:column; gap:2px; }
  .cal-tlbl { font-size:9px; color:#8a8278; font-weight:800; text-transform:uppercase; }
  .cal-tval { font-size:13px; font-weight:800; font-family:'IBM Plex Mono',monospace; color:#f0ece4; }
  .cal-tpnl {
    margin-top:8px; font-family:'IBM Plex Mono',monospace;
    font-size:18px; font-weight:900; text-align:left;
  }
  .cal-tpnl.up { color:#34c85a; }
  .cal-tpnl.dn { color:#f05248; }
  .cal-empty { text-align:center; padding:40px; color:#8a8278; font-size:14px; font-weight:700; }
  `;
  document.head.appendChild(style);

  /* ─── HTML ─── */
  document.body.insertAdjacentHTML('beforeend', `
  <div id="calModal">
    <div class="cal-hdr">
      <button class="cal-back" id="calBack">← رجوع</button>
      <span class="cal-title">📅 تقويم التداول</span>
      <span style="width:72px"></span>
    </div>
    <div class="cal-body" id="calBody">
      <div class="cal-loader" id="calLoader">
        <div class="cal-spinner"></div>
        <span>جاري تحميل البيانات...</span>
      </div>
      <div id="calContent" style="display:none">
        <div class="cal-stats" id="calStats"></div>
        <div class="cal-nav">
          <button class="cal-nav-btn" id="calPrev">›</button>
          <span class="cal-month" id="calMonth">—</span>
          <button class="cal-nav-btn" id="calNext">‹</button>
        </div>
        <div class="cal-ghdr">
          <span>إث</span><span>ث</span><span>أر</span><span>خ</span><span>ج</span><span>س</span><span>أح</span>
        </div>
        <div class="cal-grid" id="calGrid"></div>
      </div>
    </div>
    <div class="cal-detail" id="calDetail">
      <div class="cal-dhdr">
        <span class="cal-dtitle" id="calDTitle">—</span>
        <button class="cal-back" id="calDClose">✕</button>
      </div>
      <div class="cal-dbody" id="calDBody"></div>
    </div>
  </div>`);

  /* ─── State ─── */
  let _fills = [], _dailyMap = {}, _curMonth = new Date(), _loaded = false;

  /* ─── Helpers ─── */
  const $ = id => document.getElementById(id);
  const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  function fmtKey(d) {
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function addDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
  function mondayOfWeek(d){
    const r=new Date(d);
    const day=r.getDay(); // 0=Sun
    const diff=day===0?-6:1-day;
    r.setDate(r.getDate()+diff);
    return r;
  }

  /* ─── API ─── */
  async function fetchFills(addr){
    const r=await fetch('https://api.hyperliquid.xyz/info',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:'userFills',user:addr})
    });
    if(!r.ok) throw new Error('فشل الاتصال');
    return r.json();
  }

  function buildDailyMap(fills){
    const map={};
    fills.forEach(f=>{
      const key=fmtKey(new Date(f.time));
      const pnl=parseFloat(f.closedPnl||0)-parseFloat(f.fee||0);
      map[key]=(map[key]||0)+pnl;
    });
    return map;
  }

  /* ─── Render Stats ─── */
  function renderStats(){
    const now=Date.now();
    const sum=ms=>_fills.filter(f=>f.time>=now-ms).reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
    const all=_fills.reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
    const fmt=(v)=>{
      const s=v>=0?'+':''; const cls=v>=0?'up':'dn';
      return `<span class="cal-stat-val ${cls}">${s}$${Math.abs(v).toFixed(2)}</span>`;
    };
    $('calStats').innerHTML=`
      <div class="cal-stat"><span class="cal-stat-lbl">24س</span>${fmt(sum(86400000))}</div>
      <div class="cal-stat"><span class="cal-stat-lbl">7 أيام</span>${fmt(sum(7*86400000))}</div>
      <div class="cal-stat"><span class="cal-stat-lbl">30 يوم</span>${fmt(sum(30*86400000))}</div>
      <div class="cal-stat"><span class="cal-stat-lbl">الكل</span>${fmt(all)}</div>`;
  }

  /* ─── Render Calendar ─── */
  function renderCal(){
    const y=_curMonth.getFullYear(), m=_curMonth.getMonth();
    $('calMonth').textContent=MONTHS[m]+' '+y;

    const firstDay=new Date(y,m,1);
    const lastDay=new Date(y,m+1,0);
    const startGrid=mondayOfWeek(firstDay);
    // End: last Sunday >= lastDay
    const lastWeekDay=lastDay.getDay();
    const daysToSun=lastWeekDay===0?0:7-lastWeekDay;
    const endGrid=addDays(lastDay,daysToSun);

    const today=fmtKey(new Date());
    const grid=$('calGrid');
    grid.innerHTML='';

    let d=new Date(startGrid);
    while(d<=endGrid){
      const key=fmtKey(d);
      const pnl=_dailyMap[key]||0;
      const inMonth=d.getMonth()===m&&d.getFullYear()===y;
      const isToday=key===today;

      const box=document.createElement('div');
      let cls='cal-day';
      if(!inMonth) cls+=' dim';
      else if(pnl>0.005) cls+=' profit';
      else if(pnl<-0.005) cls+=' loss';
      if(isToday) cls+=' today';
      box.className=cls;

      let pnlTxt='';
      if(inMonth&&pnl!==0){
        const sign=pnl>0?'+':'';
        const pnlCls=pnl>0?'up':'dn';
        // Format: show $X.XX or -$X.XX
        const abs=Math.abs(pnl);
        const txt=abs>=100?abs.toFixed(0):abs>=10?abs.toFixed(1):abs.toFixed(2);
        pnlTxt=`<span class="cal-dpnl ${pnlCls}">${sign==='+'?'$':'-$'}${txt}</span>`;
      }

      box.innerHTML=`<span class="cal-dnum">${d.getDate()}</span>${pnlTxt}`;

      if(inMonth){
        const daySnap=new Date(d);
        box.onclick=()=>showDayDetail(daySnap);
      }
      grid.appendChild(box);
      d=addDays(d,1);
    }
  }

  /* ─── Day Detail ─── */
  function showDayDetail(date){
    const key=fmtKey(date);
    const fills=_fills.filter(f=>fmtKey(new Date(f.time))===key);
    $('calDTitle').textContent=`${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    const body=$('calDBody');
    body.innerHTML='';

    if(!fills.length){
      body.innerHTML='<div class="cal-empty">📂 لا توجد صفقات هذا اليوم</div>';
    } else {
      // Summary
      const total=fills.reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
      const sumCls=total>=0?'up':'dn';
      body.insertAdjacentHTML('beforeend',`<div style="text-align:center;margin-bottom:12px;font-family:'IBM Plex Mono';font-size:20px;font-weight:900;color:${total>=0?'#34c85a':'#f05248'}">${total>=0?'+':'-'}$${Math.abs(total).toFixed(2)}</div>`);

      fills.forEach(f=>{
        const pnl=parseFloat(f.closedPnl||0)-parseFloat(f.fee||0);
        const t=new Date(f.time);
        const time=String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
        const card=document.createElement('div');
        card.className='cal-tcard';
        card.innerHTML=`
          <div class="cal-ttop">
            <span class="cal-tcoin">${f.coin}</span>
            <span class="cal-tside ${f.side==='B'?'buy':'sell'}">${f.side==='B'?'▲ شراء':'▼ بيع'}</span>
          </div>
          <div class="cal-tgrid">
            <div class="cal-titem"><span class="cal-tlbl">السعر</span><span class="cal-tval">$${parseFloat(f.px).toFixed(2)}</span></div>
            <div class="cal-titem"><span class="cal-tlbl">الحجم</span><span class="cal-tval">${parseFloat(f.sz).toFixed(4)}</span></div>
            <div class="cal-titem"><span class="cal-tlbl">الوقت</span><span class="cal-tval">${time}</span></div>
            <div class="cal-titem"><span class="cal-tlbl">الرسوم</span><span class="cal-tval" style="color:#f0be30">$${parseFloat(f.fee||0).toFixed(4)}</span></div>
          </div>
          <div class="cal-tpnl ${pnl>=0?'up':'dn'}">${pnl>=0?'+':'-'}$${Math.abs(pnl).toFixed(2)}</div>`;
        body.appendChild(card);
      });
    }
    $('calDetail').classList.add('open');
  }

  /* ─── Load Data ─── */
  async function load(addr){
    $('calLoader').style.display='flex';
    $('calContent').style.display='none';
    try {
      _fills=await fetchFills(addr);
      _dailyMap=buildDailyMap(_fills);
      _loaded=true;
      renderStats();
      renderCal();
      $('calLoader').style.display='none';
      $('calContent').style.display='block';
    } catch(e){
      $('calLoader').innerHTML=`<span style="color:#f05248">❌ ${e.message}</span>`;
    }
  }

  /* ─── Events ─── */
  $('calBack').onclick=()=>$('calModal').classList.remove('open');
  $('calDClose').onclick=()=>$('calDetail').classList.remove('open');
  $('calPrev').onclick=()=>{ _curMonth=new Date(_curMonth.getFullYear(),_curMonth.getMonth()-1,1); renderCal(); };
  $('calNext').onclick=()=>{ _curMonth=new Date(_curMonth.getFullYear(),_curMonth.getMonth()+1,1); renderCal(); };

  /* ─── Public API ─── */
  window.openCalendar=function(){
    _curMonth=new Date();
    $('calModal').classList.add('open');
    $('calDetail').classList.remove('open');
    const addr=window.State?.wallet?.address||'';
    if(!addr){ $('calLoader').innerHTML='<span style="color:#8a8278">لا توجد محفظة متصلة</span>'; return; }
    if(_loaded){ renderStats(); renderCal(); $('calLoader').style.display='none'; $('calContent').style.display='block'; }
    else load(addr);
  };

  // ربط الزر فوراً وعند DOMContentLoaded
  function bindBtn(){
    const b=document.getElementById('btnCalendar');
    if(b) b.onclick=()=>window.openCalendar();
  }
  bindBtn();
  document.addEventListener('DOMContentLoaded', bindBtn);

})();
