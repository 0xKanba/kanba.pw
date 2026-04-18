/* ══════════════════════════════════════════════════════════════
   see.js — HLsee v7
   • Theme: dark/light auto from browser + manual toggle
   • Chips: visible on mobile (horizontal scroll)
   • Trade history: 10 per page, arrow navigation
   • Balance chart: SVG line from portfolio allTime data
   • Balance: native + spot only (xyz = margin only)
══════════════════════════════════════════════════════════════ */

'use strict';

var API           = 'https://api.hyperliquid.xyz/info';
var STORAGE_KEY   = 'hlsee_wallets_v2';
var THEME_KEY     = 'hlsee_theme';
var TX_PER        = 30;
var TRADES_PER    = 10;
var CIRCUMFERENCE = 2 * Math.PI * 11;

var ALIASES = {
  'Yasser': '0x6cc7ea5913c3002d53938b8e93da8425ab0bbafa',
  'Younes': '0x751d8d19760907d5d68c5ea758d1984282a0b39d',
  'Allawi': '0x8fb06d076cb42b3480a19bab8f1d7d4170839e0f',
  'Kanba':  '0x0640F5Bfc50AC53eC68C435a60cB0ffF5C555FAD',
};

var currentAddr  = '';
var cdTimer      = null;
var cdRemaining  = 60;
var txAll = [], txFiltered = [], txTab = 'all', txPage = 0;
var tradesAll = [], tradesPage = 0;
var _pendingDelete = null;
var _chartData = {};   // period → [{t, v}]
var _chartPeriod = 'allTime';

/* ══════════════════════════════════════════════════════════════
   THEME
══════════════════════════════════════════════════════════════ */
function initTheme() {
  var saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
  updateThemeIcon();
}

function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme');
  var sys = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  var next;
  if (!current) next = (sys === 'dark') ? 'light' : 'dark';
  else          next = (current === 'dark') ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  updateThemeIcon();
  // redraw chart with new theme colors
  if (_chartData[_chartPeriod]) drawChart(_chartPeriod);
}

function updateThemeIcon() {
  var el = ge('themeBtn'); if (!el) return;
  var isDark = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() !== '#ffffff';
  /* check actual theme */
  var attr = document.documentElement.getAttribute('data-theme');
  var sys  = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  var effective = attr || sys;
  el.innerHTML = effective === 'dark'
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
}

/* ══════════════════════════════════════════════════════════════
   SAVED WALLETS
══════════════════════════════════════════════════════════════ */
function getSaved(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); }catch(e){ return []; } }
function putSaved(list){ try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(list.slice(0,15))); }catch(e){} }
function isSaved(addr){ return getSaved().some(function(w){ return w.addr.toLowerCase()===addr.toLowerCase(); }); }
function getSavedName(addr){ var w=getSaved().find(function(w){ return w.addr.toLowerCase()===addr.toLowerCase(); }); return w?w.name:null; }

function saveWallet(name,addr){
  name=name.trim().slice(0,20); if(!name||!addr) return;
  var list=getSaved().filter(function(w){ return w.addr.toLowerCase()!==addr.toLowerCase(); });
  list.unshift({name:name,addr:addr,ts:Date.now()});
  putSaved(list); buildChips();
}
function doSave(){
  var name=(ge('saveName').value||'').trim(); if(!name){ ge('saveName').focus(); return; }
  saveWallet(name,currentAddr); closeSaveBar(); updateAliasLabel();
}
function showSaveBar(){
  if(!currentAddr||isSaved(currentAddr)){ closeSaveBar(); return; }
  ge('saveName').value=''; ge('saveBar').style.display='flex';
}
function closeSaveBar(){ ge('saveBar').style.display='none'; }
function updateAliasLabel(){
  var el=ge('walletAlias'); if(!el||!currentAddr){ if(el)el.textContent=''; return; }
  var builtin=Object.keys(ALIASES).find(function(n){ return ALIASES[n].toLowerCase()===currentAddr.toLowerCase(); });
  el.textContent=builtin||getSavedName(currentAddr)||'';
}

/* ── Chips ── */
function buildChips(){
  var row=ge('chipsRow'); if(!row) return;
  _pendingDelete=null;
  var chips=[];
  Object.keys(ALIASES).forEach(function(n){
    chips.push('<button class="alias-chip" onclick="quickLoad(\''+escAttr(n)+'\')" title="'+escAttr(ALIASES[n])+'">'+escHtml(n)+'</button>');
  });
  getSaved().forEach(function(w){
    var a=escAttr(w.addr);
    chips.push(
      '<span class="alias-chip sv-chip">'
      +'<button class="sv-name" onclick="quickLoadAddr(\''+a+'\')" title="'+escAttr(w.addr)+'">'+escHtml(w.name)+'</button>'
      +'<button class="sv-del" onclick="askDelete(\''+a+'\',this)">×</button>'
      +'</span>'
    );
  });
  row.innerHTML=chips.join('');
}

function askDelete(addr,btn){
  if(_pendingDelete===addr){ doDelete(addr); return; }
  _pendingDelete=addr;
  document.querySelectorAll('.sv-del').forEach(function(b){ b.classList.remove('del-confirm'); b.textContent='×'; });
  btn.classList.add('del-confirm'); btn.textContent='✓?';
  setTimeout(function(){
    if(_pendingDelete===addr){ _pendingDelete=null; btn.classList.remove('del-confirm'); btn.textContent='×'; }
  },3000);
}
function doDelete(addr){
  _pendingDelete=null;
  putSaved(getSaved().filter(function(w){ return w.addr.toLowerCase()!==addr.toLowerCase(); }));
  buildChips();
  if(currentAddr.toLowerCase()===addr.toLowerCase()) showSaveBar();
  updateAliasLabel();
}
function quickLoad(n){ ge('addrInput').value=n; analyze(); }
function quickLoadAddr(a){ ge('addrInput').value=a; analyze(); }

/* ══════════════════════════════════════════════════════════════
   API
══════════════════════════════════════════════════════════════ */
async function post(body){
  var r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

/* ── Copy address ── */
function copyAddr(){
  if(!currentAddr) return;
  navigator.clipboard&&navigator.clipboard.writeText(currentAddr).then(function(){
    var el=ge('acCopied'); el.classList.add('show');
    setTimeout(function(){ el.classList.remove('show'); },1600);
  });
}

/* ── Countdown ring ── */
function updateRing(sec){ var arc=ge('cdArc'),num=ge('cdNum'); if(!arc||!num) return; arc.style.strokeDashoffset=CIRCUMFERENCE*(1-sec/60); num.textContent=sec; }
function startCountdown(){
  clearInterval(cdTimer); cdRemaining=60; updateRing(60); show('updTime');
  cdTimer=setInterval(function(){ cdRemaining--; updateRing(cdRemaining); if(cdRemaining<=0){ cdRemaining=60; analyze(true); } },1000);
}

/* ══════════════════════════════════════════════════════════════
   MAIN ANALYZE
══════════════════════════════════════════════════════════════ */
async function analyze(isRefresh){
  isRefresh=isRefresh||false;
  var raw=isRefresh?currentAddr:(ge('addrInput').value||'').trim();
  var addr=ALIASES[raw]||raw;
  if(!addr||addr.length<10){ showErr('Enter a valid address or alias'); return; }
  currentAddr=addr;

  var refBtn=ge('refBtn');
  if(refBtn) refBtn.classList.add('spinning');
  if(!isRefresh){ ge('main').style.display='none'; showErr(''); closeSaveBar(); }
  showLoad('Fetching portfolio…',20);

  try {
    var res=await Promise.all([
      post({type:'clearinghouseState',          user:addr}),
      post({type:'clearinghouseState',          user:addr, dex:'xyz'}),
      post({type:'spotClearinghouseState',      user:addr}),
      post({type:'allMids'}),
      post({type:'portfolio',                   user:addr}),
      post({type:'userNonFundingLedgerUpdates', user:addr, startTime:0}),
    ]);
    var perp=res[0], xyzPerp=res[1], spot=res[2], mids=res[3], portfolio=res[4], txData=res[5];

    showLoad('Rendering…',80);

    ge('acAddr').innerHTML=
      '<span class="addr-short">'+addr.slice(0,6)+'…'+addr.slice(-4)+'</span>'
      +'<span class="addr-full">'+addr+'</span>';

    renderBalance(perp,xyzPerp,spot,mids);
    renderPnlBar(portfolio);
    renderPositions(perp,xyzPerp);
    renderTx(txData);
    renderBalanceChart(portfolio);

    show('pnlRow'); show('txCard'); show('posCard'); show('chartCard');
    ge('main').style.display='flex';
    ge('updTimeVal').textContent=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    show('updTime');
    hideLoad(); showErr(''); updateAliasLabel();

    if(!isRefresh){
      startCountdown();
      var isBuiltin=Object.values(ALIASES).some(function(a){ return a.toLowerCase()===addr.toLowerCase(); });
      if(!isBuiltin) showSaveBar();
    } else {
      cdRemaining=60; updateRing(60);
      ge('totalBal').classList.add('flash');
      setTimeout(function(){ ge('totalBal').classList.remove('flash'); },400);
    }
    loadFills(addr);
  } catch(e){ showErr('Error: '+e.message); hideLoad(); console.error(e); }
  finally{ if(refBtn) refBtn.classList.remove('spinning'); }
}

async function loadFills(addr){
  show('fillsCard'); ge('fillsDot').style.display='inline-block';
  try{
    var fills=await post({type:'userFills',user:addr});
    var sorted=Array.isArray(fills)?fills.sort(function(a,b){ return b.time-a.time; }):[];
    tradesAll=buildTrades(sorted);
    tradesPage=0;
    renderTradesPage();
    computeStats(sorted);
    show('statsRow');
  } catch(e){ console.warn('fills:',e.message); }
  finally{ ge('fillsDot').style.display='none'; }
}

/* ══════════════════════════════════════════════════════════════
   RENDER — BALANCE
   Equity = native.accountValue + spot
   Free   = Equity − (nativeMargin + xyzMargin)
══════════════════════════════════════════════════════════════ */
function renderBalance(perp,xyzPerp,spot,mids){
  var nMS=perp.marginSummary||perp.crossMarginSummary||{};
  var perpV=parseFloat(nMS.accountValue||0);
  var nMU=parseFloat(nMS.totalMarginUsed||0);

  var xMS=xyzPerp&&(xyzPerp.marginSummary||xyzPerp.crossMarginSummary)||{};
  var xMU=parseFloat(xMS.totalMarginUsed||0);

  var spotV=0;
  (spot.balances||[]).forEach(function(b){
    var qty=parseFloat(b.total||0); if(!qty) return;
    var coin=(b.coin||b.token||'').toString().replace(/:SPOT$/i,'');
    if(coin==='USDC'){ spotV+=qty; }
    else{ var px=parseFloat(mids[coin]||mids[coin+':SPOT']||0); spotV+=qty*px; }
  });

  var equity=perpV+spotV;
  var totalMU=nMU+xMU;
  var free=Math.max(equity-totalMU,0);

  var upnl=0;
  var allPos=[].concat(perp.assetPositions||[]).concat(xyzPerp&&xyzPerp.assetPositions||[]);
  allPos.forEach(function(p){ upnl+=parseFloat(p.position.unrealizedPnl||0); });

  var openCount=allPos.filter(function(p){ return parseFloat(p.position.szi)!==0; }).length;

  animNum('totalBal',equity,2);
  animNum('perpBal',perpV,2);
  animNum('spotBal',spotV,2);
  animNum('marginUsed',totalMU,2);
  animNum('marginFree',free,2);
  animNum('withdrawable',free,2);
  ge('openCount').textContent=openCount;

  var uEl=ge('aoUpnl');
  if(uEl){ uEl.textContent=fmtSgn(upnl,4)+' $'; uEl.className='ao-upnl '+col(upnl); }
  var pb=ge('aoPnlBlock'); if(pb) pb.style.display='block';
}

/* ── PnL bar ── */
function renderPnlBar(portfolio){
  if(!Array.isArray(portfolio)) return;
  portfolio.forEach(function(item){
    if(!Array.isArray(item)||item.length<2) return;
    var period=item[0], hist=(item[1]||{}).pnlHistory;
    if(!Array.isArray(hist)||!hist.length) return;
    var val=parseFloat(hist[hist.length-1][1]);
    if(period==='allTime') setPnlEl('pnlAllTime',val);
    if(period==='month')   setPnlEl('pnlMonth',val);
    if(period==='week')    setPnlEl('pnlWeek',val);
    if(period==='day')     setPnlEl('pnlDay',val);
  });
}
function setPnlEl(id,val){
  if(val==null||isNaN(val)) return;
  var el=ge(id); if(!el) return;
  el.textContent=fmtSgn(val,2)+' $'; el.className='pr-v '+col(val);
}

/* ══════════════════════════════════════════════════════════════
   RENDER — POSITIONS
══════════════════════════════════════════════════════════════ */
function renderPositions(perp,xyzPerp){
  var allPos=[].concat(perp.assetPositions||[]).concat(xyzPerp&&xyzPerp.assetPositions||[]);
  var active=allPos.filter(function(p){ return parseFloat(p.position.szi)!==0; });
  ge('posBadge').textContent=active.length;
  if(!active.length){ ge('posTbody').innerHTML='<tr class="no-row"><td colspan="11">No open positions</td></tr>'; return; }

  ge('posTbody').innerHTML=active.map(function(p,i){
    var pos=p.position, coin=pos.coin||'';
    var szi=parseFloat(pos.szi), entry=parseFloat(pos.entryPx||0), upnl=parseFloat(pos.unrealizedPnl||0);
    var liqRaw=pos.liquidationPx, liq=(liqRaw!=null&&liqRaw!=='0'&&parseFloat(liqRaw)>0)?parseFloat(liqRaw):null;
    var levObj=pos.leverage||{}, lev=levObj.value?parseFloat(levObj.value):null, levTyp=levObj.type||'';
    var isLong=szi>0, absSz=Math.abs(szi);
    var mark=szi!==0?entry+upnl/szi:entry;
    var notional=absSz*mark, margin=lev&&notional>0?notional/lev:0;
    var pnlPct=entry>0?(mark-entry)/entry*100*(isLong?1:-1):null;
    var roe=margin>0?upnl/margin*100:null;
    var liqDist=liq&&mark>0?Math.abs((liq-mark)/mark*100):null;
    var liqCls=liqDist!=null?(liqDist<5?'red fw6':liqDist<15?'orange':'dim-c'):'dim-c';
    return '<tr class="ra" style="animation-delay:'+(i*0.035)+'s">'
      +td('mono fw6',coinLabel(coin))
      +td('','<span class="tag '+(isLong?'t-long':'t-short')+'">'+(isLong?'↑ Long':'↓ Short')+'</span>')
      +td('mono',fmtSz(absSz))
      +td('mono sub-c',fmtLarge(notional))
      +td('mono dim-c',fmtPx(entry))
      +td('mono '+(upnl>=0?'green':'red'),fmtPx(mark))
      +'<td class="'+liqCls+'"><div class="mono">'+(liq?fmtPx(liq):'—')+'</div>'+(liqDist!=null?'<div class="liq-sub">'+liqDist.toFixed(1)+'% away</div>':'')+'</td>'
      +td('mono sub-c',margin>0?fmtU(margin,2):'—')
      +'<td><div class="mono fw6 '+col(upnl)+'">'+fmtSgn(upnl,4)+'</div>'+(pnlPct!=null?'<div class="liq-sub '+col(upnl)+'">'+fmtSgn(pnlPct,2)+'%</div>':'')+'</td>'
      +td('mono '+col(roe),roe!=null?fmtSgn(roe,2)+'%':'—')
      +td('',lev?'<span class="lev '+(levTyp==='cross'?'lev-crs':'lev-iso')+'">'+lev+'x'+(levTyp==='cross'?' ✕':'')+'</span>':'—')
      +'</tr>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   BALANCE CHART
   Uses portfolio allTime accountValueHistory (or pnlHistory as fallback)
   SVG line chart, responsive, theme-aware
══════════════════════════════════════════════════════════════ */
function renderBalanceChart(portfolio){
  _chartData={};
  if(!Array.isArray(portfolio)) return;

  portfolio.forEach(function(item){
    if(!Array.isArray(item)||item.length<2) return;
    var period=item[0], data=item[1]||{};
    /* prefer accountValueHistory, fallback to pnlHistory */
    var hist=data.accountValueHistory||data.pnlHistory||[];
    if(hist.length>1){
      _chartData[period]=hist.map(function(h){ return {t:h[0],v:parseFloat(h[1])||0}; });
    }
  });

  /* pick best period to show first */
  _chartPeriod=['allTime','month','week','day'].find(function(p){ return _chartData[p]&&_chartData[p].length>1; })||'allTime';

  /* Update tab buttons */
  ['day','week','month','allTime'].forEach(function(p){
    var btn=ge('ct-'+p); if(!btn) return;
    btn.style.display=_chartData[p]?'':'none';
    btn.classList.toggle('active',p===_chartPeriod);
  });

  drawChart(_chartPeriod);
}

function switchChart(period){
  if(!_chartData[period]) return;
  _chartPeriod=period;
  document.querySelectorAll('.ctab').forEach(function(b){ b.classList.remove('active'); });
  var el=ge('ct-'+period); if(el) el.classList.add('active');
  drawChart(period);
}

function drawChart(period){
  var wrap=ge('chartWrap'); if(!wrap) return;
  var pts=_chartData[period]; if(!pts||pts.length<2){ wrap.innerHTML='<div class="chart-empty">No data</div>'; return; }

  var W=wrap.clientWidth||600, H=160;
  var PAD={t:16,r:16,b:28,l:64};
  var gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;

  var vals=pts.map(function(p){ return p.v; });
  var minV=Math.min.apply(null,vals), maxV=Math.max.apply(null,vals);
  if(minV===maxV){ minV-=1; maxV+=1; }
  var span=maxV-minV;

  /* theme colors */
  var st=getComputedStyle(document.documentElement);
  var green=st.getPropertyValue('--green').trim()||'#00c87a';
  var red=st.getPropertyValue('--red').trim()||'#f04a5a';
  var b1=st.getPropertyValue('--b1').trim()||'#1e2a38';
  var sub=st.getPropertyValue('--sub').trim()||'#6e8aa0';
  var bg=st.getPropertyValue('--s1').trim()||'#111820';
  var txt=st.getPropertyValue('--txt').trim()||'#d4dce8';

  /* Determine if chart ends higher → green else red */
  var isUp=vals[vals.length-1]>=vals[0];
  var lineColor=isUp?green:red;
  var fillStart=isUp?'rgba(0,200,122,0.15)':'rgba(240,74,90,0.12)';
  var fillEnd='rgba(0,0,0,0)';

  /* Scale helpers */
  function sx(i){ return PAD.l + (i/(pts.length-1))*gW; }
  function sy(v){ return PAD.t + (1-(v-minV)/span)*gH; }

  /* Line path */
  var linePath=pts.map(function(p,i){ return (i===0?'M':'L')+sx(i).toFixed(1)+','+sy(p.v).toFixed(1); }).join(' ');

  /* Area path */
  var base=PAD.t+gH;
  var areaPath=linePath
    +' L'+(PAD.l+gW).toFixed(1)+','+base
    +' L'+PAD.l.toFixed(1)+','+base+' Z';

  /* Y-axis grid lines */
  var yTicks=4;
  var gridLines='', yLabels='';
  for(var yi=0;yi<=yTicks;yi++){
    var yv=minV+(yi/yTicks)*span;
    var yy=(PAD.t+(1-yi/yTicks)*gH).toFixed(1);
    gridLines+='<line x1="'+PAD.l+'" y1="'+yy+'" x2="'+(PAD.l+gW)+'" y2="'+yy+'" stroke="'+b1+'" stroke-width="0.8" stroke-dasharray="3,3"/>';
    yLabels+='<text x="'+(PAD.l-6)+'" y="'+yy+'" text-anchor="end" dominant-baseline="middle" fill="'+sub+'" font-size="9" font-family="monospace">'+fmtLarge(yv)+'</text>';
  }

  /* X-axis time labels (3 labels) */
  var xLabels='';
  [0, Math.floor(pts.length/2), pts.length-1].forEach(function(idx){
    var xv=sx(idx).toFixed(1);
    var lbl=fmtDate(pts[idx].t);
    xLabels+='<text x="'+xv+'" y="'+(H-6)+'" text-anchor="middle" fill="'+sub+'" font-size="9" font-family="monospace">'+lbl+'</text>';
  });

  /* Gradient id — unique per render */
  var gid='cg'+Date.now();

  wrap.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" style="width:100%;height:'+H+'px;display:block">'
    +'<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1">'
    +'<stop offset="0%" stop-color="'+lineColor+'" stop-opacity="0.18"/>'
    +'<stop offset="100%" stop-color="'+lineColor+'" stop-opacity="0.01"/>'
    +'</linearGradient></defs>'
    +gridLines+yLabels+xLabels
    +'<path d="'+areaPath+'" fill="url(#'+gid+')" />'
    +'<path d="'+linePath+'" fill="none" stroke="'+lineColor+'" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>'
    /* End dot */
    +'<circle cx="'+(PAD.l+gW).toFixed(1)+'" cy="'+sy(vals[vals.length-1]).toFixed(1)+'" r="3" fill="'+lineColor+'"/>'
    +'</svg>';
}

function fmtDate(ts){
  var d=new Date(ts);
  return (d.getMonth()+1)+'/'+(d.getDate())+" "+d.getHours().toString().padStart(2,'0')+':00';
}

/* ══════════════════════════════════════════════════════════════
   TRADE HISTORY — paginated 10/page
══════════════════════════════════════════════════════════════ */
function isOpenFill(f){ var d=(f.dir||'').toLowerCase(); return d.startsWith('open')&&!d.includes('close'); }
function isCloseFill(f){ var d=(f.dir||'').toLowerCase(); return d.startsWith('close')||d.startsWith('flip')||parseFloat(f.closedPnl||0)!==0; }

function buildTrades(fills){
  var asc=fills.slice().sort(function(a,b){ return a.time-b.time; });
  var openState={}, trades=[];
  asc.forEach(function(f){
    var d=(f.dir||'').toLowerCase(), coin=f.coin||'';
    var isLong=d.includes('long')?true:d.includes('short')?false:f.side==='B';
    var posKey=coin+':'+(isLong?'L':'S');
    var sz=parseFloat(f.sz||0), px=parseFloat(f.px||0), fee=Math.abs(parseFloat(f.fee||0));

    if(isOpenFill(f)&&!isCloseFill(f)){
      var ex=openState[posKey];
      if(ex){ var ns=ex.totalSz+sz; ex.avgPx=(ex.avgPx*ex.totalSz+px*sz)/ns; ex.totalSz=ns; ex.totalFee+=fee; }
      else openState[posKey]={totalSz:sz,avgPx:px,totalFee:fee,firstTime:f.time};
    } else if(isCloseFill(f)){
      var oi=openState[posKey]||null;
      var pnl=parseFloat(f.closedPnl||0);
      var oFee=oi?oi.totalFee:0, cFee=fee, tFee=oFee+cFee;
      trades.push({coin:coin,isLong:isLong,openTime:oi?oi.firstTime:null,closeTime:f.time,
        openPx:oi?oi.avgPx:null,closePx:px,sz:sz,notional:sz*px,
        pnl:pnl,openFee:oFee,closeFee:cFee,totalFee:tFee,netPnl:pnl-tFee});
      if(oi){ var rem=oi.totalSz-sz; if(rem<0.0000001) delete openState[posKey]; else{ oi.totalSz=rem; oi.totalFee=0; } }
    }
  });
  return trades.sort(function(a,b){ return b.closeTime-a.closeTime; });
}

function renderTradesPage(){
  var total=tradesAll.length;
  var pages=Math.max(1,Math.ceil(total/TRADES_PER));
  if(tradesPage>=pages) tradesPage=pages-1;
  if(tradesPage<0) tradesPage=0;

  var start=tradesPage*TRADES_PER;
  var slice=tradesAll.slice(start,start+TRADES_PER);

  ge('fillsBadge').textContent=total;

  /* Pager info */
  var pi=ge('tradePageInfo'); if(pi) pi.textContent=(tradesPage+1)+' / '+pages;
  var pp=ge('tradePrev'), pn=ge('tradeNext');
  if(pp){ pp.disabled=tradesPage===0; }
  if(pn){ pn.disabled=tradesPage>=pages-1; }
  var pager=ge('tradePager');
  if(pager) pager.style.display=pages>1?'flex':'none';

  if(!slice.length){
    ge('fillsTbody').innerHTML='<tr class="no-row"><td colspan="9">No closed trades found</td></tr>';
    return;
  }

  ge('fillsTbody').innerHTML=slice.map(function(t,i){
    return '<tr class="ra" style="animation-delay:'+Math.min(i*0.04,0.2)+'s">'
      +td('mono dim-c',
        (t.openTime?'<div style="font-size:10px;color:var(--dim)">'+fmtTime(t.openTime)+'</div>':'<div style="font-size:10px;color:var(--dim)">—</div>')
        +'<div>'+fmtTime(t.closeTime)+'</div>',11)
      +td('mono fw6',coinLabel(t.coin))
      +td('','<span class="tag '+(t.isLong?'t-long':'t-short')+'">'+(t.isLong?'↑ Long':'↓ Short')+'</span>')
      +td('mono',
        '<div class="dim-c">'+(t.openPx?fmtPx(t.openPx):'—')+'</div>'
        +'<div class="sub-c" style="font-size:10px">→ '+fmtPx(t.closePx)+'</div>')
      +td('mono',fmtSz(t.sz))
      +td('mono sub-c',fmtLarge(t.notional))
      +td('mono fw6 '+col(t.pnl),fmtSgn(t.pnl,4))
      +'<td>'
        +'<div class="mono dim-c" style="font-size:10px">O: '+fmtU(t.openFee,4)+'  C: '+fmtU(t.closeFee,4)+'</div>'
        +'<div class="mono orange fw6">-'+fmtU(t.totalFee,4)+'</div>'
      +'</td>'
      +td('mono fw6 '+col(t.netPnl),fmtSgn(t.netPnl,4))
      +'</tr>';
  }).join('');
}

function tradePrev(){ if(tradesPage>0){ tradesPage--; renderTradesPage(); } }
function tradeNext(){ var pages=Math.ceil(tradesAll.length/TRADES_PER); if(tradesPage<pages-1){ tradesPage++; renderTradesPage(); } }

/* ── Stats ── */
function computeStats(fills){
  if(!fills.length) return;
  var trades=buildTrades(fills); if(!trades.length) return;
  var pnls=trades.map(function(t){ return t.pnl; });
  var wins=pnls.filter(function(p){ return p>0; }), losses=pnls.filter(function(p){ return p<0; });
  var wr=pnls.length?wins.length/pnls.length*100:null;
  var avgWin=wins.length?wins.reduce(function(a,b){ return a+b; },0)/wins.length:0;
  var avgLoss=losses.length?Math.abs(losses.reduce(function(a,b){ return a+b; },0)/losses.length):0;
  var pf=avgLoss>0?avgWin/avgLoss:null;
  var best=pnls.length?Math.max.apply(null,pnls):null, worst=pnls.length?Math.min.apply(null,pnls):null;
  var totalFees=fills.reduce(function(s,f){ return s+Math.abs(parseFloat(f.fee||0)); },0);
  var totalVol=fills.reduce(function(s,f){ return s+parseFloat(f.sz||0)*parseFloat(f.px||0); },0);
  ssc('statWr',  wr!=null?wr.toFixed(1)+'%':'—',    wr!=null&&wr>=50?'green':'red');
  ssc('statAvgW',avgWin>0?'+'+fmtU(avgWin,2):'—',   'green');
  ssc('statAvgL',avgLoss>0?'-'+fmtU(avgLoss,2):'—', 'red');
  ssc('statPF',  pf!=null?pf.toFixed(2):'—',        pf!=null&&pf>=1?'green':'red');
  ssc('statBest',best!=null?fmtSgn(best,2):'—',     'green');
  ssc('statWorst',worst!=null?fmtSgn(worst,2):'—',  'red');
  ssc('statFees','-'+fmtU(totalFees,2),              'orange');
  ssc('statVol', fmtLarge(totalVol),                 'blue');
  ssc('statTrades',trades.length.toLocaleString(),   '');
}
function ssc(id,text,cls){ var el=ge(id+'-v'); if(!el) return; el.textContent=text; if(cls) el.className='sc-v '+cls; }

/* ══════════════════════════════════════════════════════════════
   TRANSACTIONS
══════════════════════════════════════════════════════════════ */
function txDir(tx){
  var t=(tx.delta||{}).type||'';
  if(t==='deposit') return 'in';
  if(t==='withdraw'||t==='liquidation') return 'out';
  if(t==='vaultWithdraw') return 'in';
  if(t==='vaultDeposit')  return 'out';
  var d=tx.delta||{}, self=currentAddr.toLowerCase();
  var dest=(d.destination||d.to||'').toLowerCase();
  var from=(d.user||d.from||'').toLowerCase();
  if(dest===self) return 'in';
  if(from===self) return 'out';
  return parseFloat(d.usdc||d.amount||0)>=0?'in':'out';
}
function txAmt(tx){ var d=tx.delta||{}; return Math.abs(parseFloat(d.usdc!=null?d.usdc:d.amount!=null?d.amount:d.usd!=null?d.usd:0)); }
function txToken(tx){ return (tx.delta||{}).feeToken||(tx.delta||{}).token||'USDC'; }
function txLabel(tx){ var t=(tx.delta||{}).type||'?'; return {deposit:'Deposit',withdraw:'Withdrawal',spotTransfer:'Spot Transfer',internalTransfer:'Transfer',subAccountTransfer:'Sub-Account',accountClassTransfer:'Reclassify',vaultDeposit:'Vault Out',vaultWithdraw:'Vault In',liquidation:'Liquidation'}[t]||t; }
function txCp(tx,field){ var a=(tx.delta||{})[field]; return a&&a.toLowerCase()!==currentAddr.toLowerCase()?a:null; }

function renderTx(raw){
  txAll=(Array.isArray(raw)?raw:[]).map(function(t){ return Object.assign({},t,{_d:txDir(t),_a:txAmt(t)}); }).sort(function(a,b){ return b.time-a.time; });
  var inT=txAll.filter(function(t){ return t._d==='in'; }).reduce(function(s,t){ return s+t._a; },0);
  var outT=txAll.filter(function(t){ return t._d==='out'; }).reduce(function(s,t){ return s+t._a; },0);
  var net=inT-outT;
  ge('txBadge').textContent=txAll.length;
  ge('txSumrow').innerHTML=
    tsr('Total Deposits',   '+'+fmtU(inT,2),   'green', 'USDC')
   +tsr('Total Withdrawals','-'+fmtU(outT,2),  'red',   'USDC')
   +tsr('Net Flow',          fmtSgn(net,2),     col(net),'USDC')
   +tsr('Entries',           txAll.length,       'yellow','total');
  txTab='all'; txPage=0;
  document.querySelectorAll('.ttab').forEach(function(b){ b.classList.remove('active'); });
  var el=ge('tt-all'); if(el) el.classList.add('active');
  txApply();
}
function tsr(l,v,c,s){ return '<div class="tsr"><div class="tsr-l">'+l+'</div><div class="tsr-v '+c+'">'+v+'</div><div class="tsr-s">'+s+'</div></div>'; }
function txSwitch(tab){ txTab=tab; txPage=0; document.querySelectorAll('.ttab').forEach(function(b){ b.classList.remove('active'); }); var el=ge('tt-'+tab); if(el) el.classList.add('active'); txApply(); }
function txApply(){ txFiltered=txTab==='all'?txAll:txAll.filter(function(t){ return t._d===txTab; }); txPage=0; txRenderPage(); }
function txPrev(){ if(txPage>0){ txPage--; txRenderPage(); } }
function txNext(){ if(txPage<Math.ceil(txFiltered.length/TX_PER)-1){ txPage++; txRenderPage(); } }
function txRenderPage(){
  var start=txPage*TX_PER, slice=txFiltered.slice(start,start+TX_PER);
  var tbody=ge('txTbody'),empty=ge('txEmpty'),pager=ge('txPager');
  if(!slice.length){ tbody.innerHTML=''; empty.style.display='block'; pager.style.display='none'; return; }
  empty.style.display='none';
  tbody.innerHTML=slice.map(function(tx,i){
    var dir=tx._d,amt=tx._a,sign=dir==='in'?'+':'-',amtC=dir==='in'?'green':'red',tagC=dir==='in'?'t-in':'t-out';
    var from=txCp(tx,'user')||txCp(tx,'from'), to=txCp(tx,'destination')||txCp(tx,'to');
    return '<tr class="ra" style="animation-delay:'+(i*0.012)+'s">'
      +td('','<span class="tag '+tagC+'">'+txLabel(tx)+'</span>')
      +td('mono fw6 '+amtC,sign+fmtU(amt,amt<1?6:2))
      +td('dim-c',escHtml(txToken(tx)),10)
      +td('',from?addrBit(from):youBadge())
      +td('',to?addrBit(to):youBadge())
      +td('mono dim-c',fmtTime(tx.time),11)+'</tr>';
  }).join('');
  var total=txFiltered.length,pages=Math.ceil(total/TX_PER);
  ge('txPageInfo').textContent=(start+1)+'–'+Math.min(start+TX_PER,total)+' of '+total;
  ge('pgPrev').disabled=txPage===0; ge('pgNext').disabled=txPage>=pages-1;
  pager.style.display=pages>1?'flex':'none';
}
function addrBit(a){ return '<span class="mono sub-c addr-bit" title="'+escAttr(a)+'" onclick="navigator.clipboard&&navigator.clipboard.writeText(\''+escAttr(a)+'\')">'+a.slice(0,6)+'…'+a.slice(-4)+'</span>'; }
function youBadge(){ return '<span class="mono green" style="font-size:10px">You</span>'; }

/* ── Coin label ── */
function coinLabel(coin){
  if(!coin) return '—';
  var m=coin.match(/^([^:]+):(.+)$/);
  if(m) return escHtml(m[2])+' <span class="tag t-xyz">'+escHtml(m[1])+'</span>';
  if(coin.startsWith('@')) return '<span class="tag t-spot">SPOT</span> '+escHtml(coin);
  return escHtml(coin);
}

/* ── Animated number ── */
function animNum(id,to,d){
  var el=ge(id); if(!el) return;
  to=parseFloat(to); if(isNaN(to)){ el.textContent='—'; return; }
  var from=parseFloat(el.dataset.v||0); el.dataset.v=to;
  if(Math.abs(from-to)<0.0001){ el.textContent=fmtU(to,d!=null?d:2); return; }
  var t0=Date.now(),dur=650;
  (function tick(){ var p=Math.min((Date.now()-t0)/dur,1),e=p<0.5?2*p*p:-1+(4-2*p)*p; el.textContent=fmtU(from+(to-from)*e,d!=null?d:2); if(p<1) requestAnimationFrame(tick); else el.textContent=fmtU(to,d!=null?d:2); })();
}

/* ── Load/Error ── */
function showLoad(txt,pct){ ge('loadTxt').textContent=txt||'Loading…'; ge('lbFill').style.width=(pct||30)+'%'; show('loadBar'); }
function hideLoad(){ ge('lbFill').style.width='100%'; setTimeout(function(){ hide('loadBar'); ge('lbFill').style.width='0'; },300); }
function showErr(msg){ var el=ge('errBar'); el.textContent=msg; el.style.display=msg?'block':'none'; }

/* ── HTML ── */
function td(cls,content,fs){ return '<td class="'+cls+'"'+(fs?' style="font-size:'+fs+'px"':'')+'>'+content+'</td>'; }
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s){ return String(s).replace(/'/g,'&#39;').replace(/"/g,'&quot;'); }
function ge(id){ return document.getElementById(id); }
function show(id,d){ var e=ge(id); if(e) e.style.display=d||'block'; }
function hide(id){ var e=ge(id); if(e) e.style.display='none'; }

/* ── Format ── */
function fmtU(n,d){ var v=parseFloat(n); if(isNaN(v)) return '—'; d=d!=null?d:2; return v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}); }
function fmtSgn(n,d){ var v=parseFloat(n); if(isNaN(v)) return '—'; return (v>0?'+':'')+fmtU(v,d); }
function fmtPx(v){ v=parseFloat(v); if(!v||isNaN(v)) return '—'; if(v>=100000) return fmtU(v,0); if(v>=10000) return fmtU(v,1); if(v>=1000) return fmtU(v,2); if(v>=100) return fmtU(v,3); if(v>=1) return fmtU(v,4); if(v>=0.01) return fmtU(v,6); return fmtU(v,8); }
function fmtSz(v){ v=parseFloat(v); if(isNaN(v)) return '—'; if(v>=1000) return fmtU(v,2); if(v>=1) return fmtU(v,4); if(v>=0.01) return fmtU(v,6); return fmtU(v,8); }
function fmtLarge(v){ v=parseFloat(v); if(!v||isNaN(v)) return '—'; var a=Math.abs(v); if(a>=1e9) return fmtU(v/1e9,3)+'B'; if(a>=1e6) return fmtU(v/1e6,2)+'M'; if(a>=1e3) return fmtU(v/1e3,1)+'K'; return fmtU(v,2); }
function fmtTime(ts){ return new Date(ts).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
function col(v){ var n=parseFloat(v); return n>0?'green':n<0?'red':''; }
function orderType(f){ if(f.crossed===true) return {label:'Market',cls:'t-taker'}; if(f.crossed===false) return {label:'Limit',cls:'t-maker'}; return parseFloat(f.fee||0)<=0?{label:'Limit',cls:'t-maker'}:{label:'Market',cls:'t-taker'}; }

/* ── Init ── */
document.addEventListener('DOMContentLoaded',function(){
  initTheme();
  buildChips();
  updateRing(60);
  ge('addrInput').addEventListener('keydown',function(e){ if(e.key==='Enter') analyze(); });
  var sn=ge('saveName'); if(sn) sn.addEventListener('keydown',function(e){ if(e.key==='Enter') doSave(); });
  document.addEventListener('click',function(e){
    if(_pendingDelete&&!e.target.closest('.sv-chip')){
      _pendingDelete=null;
      document.querySelectorAll('.sv-del').forEach(function(b){ b.classList.remove('del-confirm'); b.textContent='×'; });
    }
  });
  /* Redraw chart on resize */
  var resizeTimer;
  window.addEventListener('resize',function(){
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(function(){ if(_chartData[_chartPeriod]) drawChart(_chartPeriod); },200);
  });
  /* Watch for OS theme change */
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(){
    if(!localStorage.getItem(THEME_KEY)){ if(_chartData[_chartPeriod]) drawChart(_chartPeriod); updateThemeIcon(); }
  });
});
