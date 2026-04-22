/* ══════════════════════════════════════════════════════
   c.js — تقويم التداول | HLTrade Calendar v1.0
   ملف مستقل: CSS + HTML + Logic كلها هنا
   يُفتح عبر btnCalendar في الفوتر
   يستخدم عنوان المحفظة من State.wallet.address
══════════════════════════════════════════════════════ */

(function CalendarModule() {
  'use strict';

  /* ─── CSS ─── */
  const CSS = `
  #calModal {
    position:fixed; inset:0; z-index:500;
    background:rgba(0,0,0,.88);
    backdrop-filter:blur(14px);
    display:none; flex-direction:column;
    overflow:hidden;
  }
  #calModal.open { display:flex; }

  .cal-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:16px 18px 12px;
    border-bottom:1px solid rgba(255,255,255,.07);
    flex-shrink:0;
  }
  .cal-title { font-size:18px; font-weight:900; color:#f0ece4; }
  .cal-close {
    background:rgba(255,255,255,.08); border:none; color:#f0ece4;
    width:34px; height:34px; border-radius:50%; font-size:18px;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
  }

  .cal-body {
    flex:1; overflow-y:auto; padding:14px 12px;
    -webkit-overflow-scrolling:touch;
  }

  /* search */
  .cal-search {
    display:flex; gap:8px; margin-bottom:14px;
  }
  .cal-input {
    flex:1; background:#1e1c18; border:1.5px solid #48443c;
    border-radius:10px; padding:10px 14px; color:#f0ece4;
    font-family:'IBM Plex Mono',monospace; font-size:12px;
    outline:none;
  }
  .cal-input:focus { border-color:#e07248; }
  .cal-search-btn {
    background:#e07248; color:#fff; border:none;
    border-radius:10px; padding:10px 16px;
    font-weight:800; font-size:13px; cursor:pointer;
    white-space:nowrap;
  }
  .cal-search-btn:disabled { opacity:.5; cursor:not-allowed; }

  /* nav */
  .cal-nav {
    display:flex; align-items:center; justify-content:center;
    gap:20px; margin-bottom:12px;
  }
  .cal-nav-btn {
    background:rgba(255,255,255,.08); border:none; color:#f0ece4;
    width:32px; height:32px; border-radius:50%; font-size:16px;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
  }
  .cal-month-lbl { font-size:16px; font-weight:700; color:#f0ece4; min-width:140px; text-align:center; }

  /* grid */
  .cal-grid-hdr {
    display:grid; grid-template-columns:repeat(7,1fr); gap:3px;
    margin-bottom:4px;
  }
  .cal-grid-hdr span {
    text-align:center; font-size:10px; font-weight:800;
    color:#8a8278; padding:4px 0;
    background:#1e1c18; border-radius:4px;
  }
  .cal-grid {
    display:grid; grid-template-columns:repeat(7,1fr); gap:3px;
  }
  .cal-day {
    background:#1e1c18; border-radius:8px;
    aspect-ratio:1/1.15; padding:5px 4px;
    display:flex; flex-direction:column;
    justify-content:space-between;
    cursor:pointer; border:1px solid transparent;
    transition:border-color .15s;
  }
  .cal-day.dim { opacity:.2; pointer-events:none; }
  .cal-day.profit { background:rgba(52,200,90,.13); border-color:rgba(52,200,90,.3); }
  .cal-day.loss   { background:rgba(240,82,72,.13); border-color:rgba(240,82,72,.3); }
  .cal-day:hover  { border-color:#e07248; }
  .cal-dn  { font-size:9px; font-weight:700; opacity:.5; color:#f0ece4; }
  .cal-dv  { font-size:9px; font-weight:800; text-align:center; }
  .cal-dv.profit-txt { color:#34c85a; }
  .cal-dv.loss-txt   { color:#f05248; }

  /* stats */
  .cal-stats {
    display:grid; grid-template-columns:repeat(4,1fr); gap:6px;
    margin-bottom:14px;
  }
  .cal-stat {
    background:#1e1c18; border-radius:10px;
    padding:10px 4px; text-align:center;
    border:1px solid rgba(255,255,255,.05);
  }
  .cal-stat-lbl { font-size:9px; color:#8a8278; display:block; margin-bottom:3px; }
  .cal-stat-val { font-size:13px; font-weight:800; font-family:'IBM Plex Mono',monospace; }
  .cal-stat-val.up  { color:#34c85a; }
  .cal-stat-val.dn  { color:#f05248; }

  /* day detail modal */
  .cal-detail {
    position:absolute; inset:0; z-index:10;
    background:rgba(0,0,0,.9); backdrop-filter:blur(10px);
    display:none; flex-direction:column;
  }
  .cal-detail.open { display:flex; }
  .cal-detail-hdr {
    display:flex; align-items:center; justify-content:space-between;
    padding:16px 18px; border-bottom:1px solid rgba(255,255,255,.07);
    flex-shrink:0;
  }
  .cal-detail-title { font-size:16px; font-weight:900; color:#f0ece4; }
  .cal-detail-body { flex:1; overflow-y:auto; padding:12px; }
  .cal-trade-card {
    background:#1e1c18; border-radius:12px;
    padding:12px; margin-bottom:10px;
    border:1px solid rgba(255,255,255,.07);
  }
  .cal-tc-top {
    display:flex; justify-content:space-between; align-items:center;
    margin-bottom:8px;
  }
  .cal-tc-coin { font-weight:900; font-size:15px; color:#f0ece4; }
  .cal-tc-side {
    font-size:11px; font-weight:800; padding:3px 10px; border-radius:99px;
  }
  .cal-tc-side.buy  { background:rgba(52,200,90,.2); color:#34c85a; }
  .cal-tc-side.sell { background:rgba(240,82,72,.2); color:#f05248; }
  .cal-tc-grid {
    display:grid; grid-template-columns:1fr 1fr; gap:6px;
    background:#131210; border-radius:8px; padding:8px;
  }
  .cal-tc-item { display:flex; flex-direction:column; gap:2px; }
  .cal-tc-lbl { font-size:9px; color:#8a8278; font-weight:700; text-transform:uppercase; }
  .cal-tc-val { font-size:12px; font-weight:800; font-family:'IBM Plex Mono',monospace; color:#f0ece4; }
  .cal-tc-pnl {
    margin-top:8px; text-align:left;
    font-family:'IBM Plex Mono',monospace; font-size:16px; font-weight:900;
  }
  .cal-tc-pnl.up { color:#34c85a; }
  .cal-tc-pnl.dn { color:#f05248; }
  .cal-no-trades { text-align:center; padding:40px; color:#8a8278; font-size:14px; }
  `;

  /* ─── Inject CSS ─── */
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  /* ─── HTML ─── */
  const html = `
  <div id="calModal">
    <div class="cal-header">
      <span class="cal-title">📅 تقويم التداول</span>
      <button class="cal-close" id="calCloseBtn">✕</button>
    </div>
    <div class="cal-body">
      <!-- Search -->
      <div class="cal-search">
        <input class="cal-input" id="calWalletInput" placeholder="عنوان المحفظة 0x..." dir="ltr">
        <button class="cal-search-btn" id="calSearchBtn">تحليل</button>
      </div>

      <!-- Stats -->
      <div class="cal-stats" id="calStats" style="display:none">
        <div class="cal-stat"><span class="cal-stat-lbl">24س</span><span class="cal-stat-val" id="cStat24">—</span></div>
        <div class="cal-stat"><span class="cal-stat-lbl">7 أيام</span><span class="cal-stat-val" id="cStat7">—</span></div>
        <div class="cal-stat"><span class="cal-stat-lbl">30 يوم</span><span class="cal-stat-val" id="cStat30">—</span></div>
        <div class="cal-stat"><span class="cal-stat-lbl">الكل</span><span class="cal-stat-val" id="cStatAll">—</span></div>
      </div>

      <!-- Nav -->
      <div class="cal-nav" id="calNav" style="display:none">
        <button class="cal-nav-btn" id="calPrev">›</button>
        <span class="cal-month-lbl" id="calMonthLbl">—</span>
        <button class="cal-nav-btn" id="calNext">‹</button>
      </div>

      <!-- Grid header -->
      <div class="cal-grid-hdr" id="calGridHdr" style="display:none">
        <span>الاث</span><span>الث</span><span>الأر</span><span>الخ</span><span>الج</span><span>الس</span><span>الأح</span>
      </div>
      <div class="cal-grid" id="calGrid"></div>
    </div>

    <!-- Day detail panel -->
    <div class="cal-detail" id="calDetail">
      <div class="cal-detail-hdr">
        <span class="cal-detail-title" id="calDetailTitle">صفقات اليوم</span>
        <button class="cal-close" id="calDetailClose">✕</button>
      </div>
      <div class="cal-detail-body" id="calDetailBody"></div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  /* ─── State ─── */
  let _fills = [];
  let _dailyMap = {};
  let _curMonth = new Date();

  /* ─── Helpers ─── */
  const $ = id => document.getElementById(id);
  function fmtDate(d) {
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function startOfMonth(d){ return new Date(d.getFullYear(),d.getMonth(),1); }
  function endOfMonth(d){ return new Date(d.getFullYear(),d.getMonth()+1,0); }
  function startOfWeek(d){ const day=d.getDay(); const diff=day===0?-6:1-day; const r=new Date(d); r.setDate(d.getDate()+diff); return r; }
  function addDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
  function isSameMonth(d,ref){ return d.getMonth()===ref.getMonth()&&d.getFullYear()===ref.getFullYear(); }
  const MONTHS_AR=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  /* ─── API ─── */
  async function fetchFills(addr){
    const r = await fetch('https://api.hyperliquid.xyz/info',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({type:'userFills', user:addr})
    });
    if(!r.ok) throw new Error('فشل جلب البيانات');
    return r.json();
  }

  function aggregatePnL(fills){
    const map={};
    fills.forEach(f=>{
      const d=new Date(f.time);
      const key=fmtDate(d);
      const pnl=parseFloat(f.closedPnl||0)-parseFloat(f.fee||0);
      map[key]=(map[key]||0)+pnl;
    });
    return map;
  }

  /* ─── Render Calendar ─── */
  function renderCal(){
    const grid=$('calGrid'); grid.innerHTML='';
    const start=startOfMonth(_curMonth);
    const end=endOfMonth(_curMonth);
    const sw=startOfWeek(start);

    $('calMonthLbl').textContent=MONTHS_AR[_curMonth.getMonth()]+' '+_curMonth.getFullYear();

    let d=new Date(sw);
    // Fill until end of week that contains end of month
    const endWeekDay=end.getDay(); const daysToAdd=endWeekDay===0?0:7-endWeekDay;
    const gridEnd=addDays(end,daysToAdd);

    while(d<=gridEnd){
      const key=fmtDate(d);
      const pnl=_dailyMap[key]||0;
      const same=isSameMonth(d,_curMonth);
      const box=document.createElement('div');
      box.className='cal-day'+(same?'':' dim')+(pnl>0.01?' profit':pnl<-0.01?' loss':'');

      const valCls=pnl>0?'profit-txt':pnl<0?'loss-txt':'';
      const valTxt=pnl!==0?((pnl>0?'$':'-$')+Math.abs(pnl).toFixed(2)):'';
      box.innerHTML=`<span class="cal-dn">${d.getDate()}</span><span class="cal-dv ${valCls}">${valTxt}</span>`;

      if(same){
        const day=new Date(d);
        box.onclick=()=>showDayDetail(day);
      }
      grid.appendChild(box);
      d=addDays(d,1);
    }
  }

  /* ─── Render Stats ─── */
  function renderStats(){
    const now=Date.now();
    const calc=ms=>_fills.filter(f=>f.time>=now-ms).reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
    const all=_fills.reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
    const set=(id,v)=>{
      const el=$(id); if(!el)return;
      el.textContent=(v>=0?'+':'')+' $'+Math.abs(v).toFixed(2);
      el.className='cal-stat-val '+(v>=0?'up':'dn');
    };
    set('cStat24',calc(86400000));
    set('cStat7',calc(7*86400000));
    set('cStat30',calc(30*86400000));
    set('cStatAll',all);
  }

  /* ─── Day Detail ─── */
  function showDayDetail(date){
    const key=fmtDate(date);
    const fills=_fills.filter(f=>fmtDate(new Date(f.time))===key);
    $('calDetailTitle').textContent=`صفقات ${date.getDate()} ${MONTHS_AR[date.getMonth()]} ${date.getFullYear()}`;
    const body=$('calDetailBody');
    body.innerHTML='';
    if(!fills.length){
      body.innerHTML='<div class="cal-no-trades">📂 لا توجد صفقات هذا اليوم</div>';
    } else {
      fills.forEach(f=>{
        const pnl=parseFloat(f.closedPnl||0)-parseFloat(f.fee||0);
        const t=new Date(f.time);
        const timeStr=String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
        const card=document.createElement('div');
        card.className='cal-trade-card';
        card.innerHTML=`
          <div class="cal-tc-top">
            <span class="cal-tc-coin">${f.coin}</span>
            <span class="cal-tc-side ${f.side==='B'?'buy':'sell'}">${f.side==='B'?'▲ شراء':'▼ بيع'}</span>
          </div>
          <div class="cal-tc-grid">
            <div class="cal-tc-item"><span class="cal-tc-lbl">السعر</span><span class="cal-tc-val">$${parseFloat(f.px).toFixed(2)}</span></div>
            <div class="cal-tc-item"><span class="cal-tc-lbl">الحجم</span><span class="cal-tc-val">${parseFloat(f.sz).toFixed(4)}</span></div>
            <div class="cal-tc-item"><span class="cal-tc-lbl">الوقت</span><span class="cal-tc-val">${timeStr}</span></div>
            <div class="cal-tc-item"><span class="cal-tc-lbl">الرسوم</span><span class="cal-tc-val" style="color:#f0be30">$${parseFloat(f.fee||0).toFixed(4)}</span></div>
          </div>
          <div class="cal-tc-pnl ${pnl>=0?'up':'dn'}">${pnl>=0?'+':'-'}$${Math.abs(pnl).toFixed(2)}</div>`;
        body.appendChild(card);
      });
    }
    $('calDetail').classList.add('open');
  }

  /* ─── Analyze ─── */
  async function analyze(addr){
    if(!addr||addr.length!==42){alert('عنوان غير صحيح');return;}
    const btn=$('calSearchBtn');
    btn.disabled=true; btn.textContent='⏳';
    try {
      _fills=await fetchFills(addr);
      _dailyMap=aggregatePnL(_fills);
      renderCal();
      renderStats();
      $('calStats').style.display='grid';
      $('calNav').style.display='flex';
      $('calGridHdr').style.display='grid';
    } catch(e){ alert('خطأ: '+e.message); }
    finally { btn.disabled=false; btn.textContent='تحليل'; }
  }

  /* ─── Events ─── */
  $('calCloseBtn').onclick=()=>{ $('calModal').classList.remove('open'); };
  $('calDetailClose').onclick=()=>{ $('calDetail').classList.remove('open'); };
  $('calPrev').onclick=()=>{ _curMonth=new Date(_curMonth.getFullYear(),_curMonth.getMonth()-1,1); renderCal(); };
  $('calNext').onclick=()=>{ _curMonth=new Date(_curMonth.getFullYear(),_curMonth.getMonth()+1,1); renderCal(); };
  $('calSearchBtn').onclick=()=>{ const v=$('calWalletInput').value.trim(); if(v) analyze(v); };
  $('calWalletInput').addEventListener('keydown',e=>{ if(e.key==='Enter'){ const v=e.target.value.trim(); if(v) analyze(v); }});
  $('calWalletInput').onfocus=()=>$('calWalletInput').select();

  /* ─── Open from footer ─── */
  window.openCalendar = function(){
    const modal=$('calModal');
    modal.classList.add('open');
    // استخدام عنوان المحفظة الحالية تلقائياً
    const addr=window.State?.wallet?.address||'';
    if(addr){
      const inp=$('calWalletInput');
      inp.value=addr;
      if(!_fills.length) analyze(addr);
    }
  };

  // ربط الزر من index.html
  document.addEventListener('DOMContentLoaded',()=>{
    const btn=document.getElementById('btnCalendar');
    if(btn) btn.onclick=()=>window.openCalendar();
  });
  // ربط فوري إذا الزر موجود قبل DOMContentLoaded
  const btn=document.getElementById('btnCalendar');
  if(btn) btn.onclick=()=>window.openCalendar();

})();
