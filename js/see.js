/* ══════════════════════════════════════════════════════════════
   see.js — HLsee v5

   BUG FIX (positions not showing):
     clearinghouseState without dex="" returns ONLY native perps.
     xyz/HIP-3 positions require dex:"xyz" (per official HL docs).
     We call BOTH in parallel and merge assetPositions.

   HIP-3 coin format (official docs):
     coin = "xyz:ASSET" e.g. "xyz:GOLD", "xyz:CL", "xyz:SILVER"
     CL = WTI Crude Oil (still "CL" per all sources March 2026)
     userFills already includes HIP-3 fills (no dex param needed).

   TX rule:
     IN  = any $ entering account  (deposit, vaultWithdraw, received transfer)
     OUT = any $ leaving account   (withdraw, vaultDeposit, sent transfer)
     No "Internal" tab. Only: All / Deposits / Withdrawals.

   Fees = ALL fills (open + close):
     Each fill in userFills has a "fee" field = total fee for that fill.
     Summing ALL fills = open fees + close fees. Correct total.

   Stats UI = icon cards (not boring grid).
══════════════════════════════════════════════════════════════ */

'use strict';

var API           = 'https://api.hyperliquid.xyz/info';
var STORAGE_KEY   = 'hlsee_wallets_v2';
var TX_PER        = 30;
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
var txAll        = [];
var txFiltered   = [];
var txTab        = 'all';
var txPage       = 0;

/* ── Saved wallets ── */
function getSaved(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); }catch(e){ return []; } }
function putSaved(list){ try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(list.slice(0,15))); }catch(e){} }
function isSaved(addr){ return getSaved().some(function(w){ return w.addr.toLowerCase()===addr.toLowerCase(); }); }
function getSavedName(addr){ var w=getSaved().find(function(w){ return w.addr.toLowerCase()===addr.toLowerCase(); }); return w?w.name:null; }
function saveWallet(name,addr){ name=name.trim().slice(0,20); if(!name||!addr) return; var list=getSaved().filter(function(w){ return w.addr.toLowerCase()!==addr.toLowerCase(); }); list.unshift({name:name,addr:addr,ts:Date.now()}); putSaved(list); buildChips(); }
function deleteWallet(addr){ putSaved(getSaved().filter(function(w){ return w.addr.toLowerCase()!==addr.toLowerCase(); })); buildChips(); if(currentAddr.toLowerCase()===addr.toLowerCase()) showSaveBar(); updateAliasLabel(); }
function doSave(){ var name=(ge('saveName').value||'').trim(); if(!name){ ge('saveName').focus(); return; } saveWallet(name,currentAddr); closeSaveBar(); updateAliasLabel(); }
function showSaveBar(){ if(!currentAddr||isSaved(currentAddr)){ closeSaveBar(); return; } ge('saveName').value=''; ge('saveBar').style.display='flex'; }
function closeSaveBar(){ ge('saveBar').style.display='none'; }
function updateAliasLabel(){ var el=ge('walletAlias'); if(!el||!currentAddr){ if(el)el.textContent=''; return; } var builtin=Object.keys(ALIASES).find(function(n){ return ALIASES[n].toLowerCase()===currentAddr.toLowerCase(); }); el.textContent=builtin||getSavedName(currentAddr)||''; }

function buildChips(){
  var row=ge('chipsRow'); if(!row) return;
  var chips=[];
  Object.keys(ALIASES).forEach(function(n){ chips.push('<span class="alias-chip" onclick="quickLoad(\''+n+'\')" title="'+ALIASES[n]+'">'+n+'</span>'); });
  getSaved().forEach(function(w){ chips.push('<span class="alias-chip sv-chip" onclick="quickLoadAddr(\''+escAttr(w.addr)+'\')">'+escHtml(w.name)+'<span class="sv-del" onclick="event.stopPropagation();deleteWallet(\''+escAttr(w.addr)+'\')">×</span></span>'); });
  row.innerHTML=chips.join('');
}
function quickLoad(n){ ge('addrInput').value=n; analyze(); }
function quickLoadAddr(a){ ge('addrInput').value=a; analyze(); }

/* ── API ── */
async function post(body){
  var r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

/* ── Copy address ── */
function copyAddr(){ if(!currentAddr) return; if(navigator.clipboard) navigator.clipboard.writeText(currentAddr).then(function(){ var el=ge('acCopied'); el.classList.add('show'); setTimeout(function(){ el.classList.remove('show'); },1600); }); }

/* ── Countdown ring ── */
function updateRing(sec){ var arc=ge('cdArc'),num=ge('cdNum'); if(!arc||!num) return; arc.style.strokeDashoffset=CIRCUMFERENCE*(1-sec/60); num.textContent=sec; }
function startCountdown(){ clearInterval(cdTimer); cdRemaining=60; updateRing(60); show('updTime'); cdTimer=setInterval(function(){ cdRemaining--; updateRing(cdRemaining); if(cdRemaining<=0){ cdRemaining=60; analyze(true); } },1000); }

/* ══════════════════════════════════════════════════════════════
   MAIN ANALYZE
══════════════════════════════════════════════════════════════ */
async function analyze(isRefresh){
  isRefresh=isRefresh||false;
  var raw=isRefresh?currentAddr:(ge('addrInput').value||'').trim();
  var addr=ALIASES[raw]||raw;
  if(!addr||addr.length<10){ showErr('Enter a valid address or alias'); return; }
  currentAddr=addr;
  var refBtn=ge('refBtn'); if(refBtn) refBtn.classList.add('spinning');
  if(!isRefresh){ ge('main').style.display='none'; showErr(''); closeSaveBar(); }
  showLoad('Fetching portfolio…',20);
  try {
    /*
     * CRITICAL: Two clearinghouseState calls.
     * Without dex → native perps only.
     * With dex:'xyz' → xyz HIP-3 positions (GOLD, SILVER, CL etc.)
     * Both responses have assetPositions[] merged below.
     */
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

    ge('acAddr').innerHTML='<span class="addr-short">'+addr.slice(0,6)+'…'+addr.slice(-4)+'</span><span class="addr-full">'+addr+'</span>';

    var merged=mergePerp(perp,xyzPerp);
    renderBalance(merged,spot,mids);
    renderPnlBar(portfolio);
    renderPositions(merged,mids);
    renderTx(txData);

    show('pnlRow'); show('txCard'); show('posCard');
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
  finally { if(refBtn) refBtn.classList.remove('spinning'); }
}

/* Merge native + xyz clearinghouseState */
function mergePerp(native, xyz){
  var m=Object.assign({},native);
  m.assetPositions=(native.assetPositions||[]).concat(xyz&&xyz.assetPositions||[]);
  /* xyz runs separate margin — add its accountValue/marginUsed to totals */
  if(xyz&&xyz.marginSummary){
    m._xyzAccountValue=parseFloat(xyz.marginSummary.accountValue||0);
    m._xyzMarginUsed=parseFloat(xyz.marginSummary.totalMarginUsed||0);
  }
  return m;
}

/* Phase 2: fills */
async function loadFills(addr){
  show('fillsCard'); ge('fillsDot').style.display='inline-block';
  try {
    var fills=await post({type:'userFills',user:addr});
    var sorted=Array.isArray(fills)?fills.sort(function(a,b){ return b.time-a.time; }):[];
    renderTrades(sorted);
    computeStats(sorted);
    show('statsRow');
  } catch(e){ console.warn('fills:',e.message); }
  finally { ge('fillsDot').style.display='none'; }
}

/* ── Render balance (unified) ── */
function renderBalance(perp,spot,mids){
  var ms=perp.marginSummary||perp.crossMarginSummary||{};
  var perpV=parseFloat(ms.accountValue||0);
  var mU=parseFloat(ms.totalMarginUsed||0);
  var wdraw=perp.withdrawable!=null?parseFloat(perp.withdrawable):Math.max(perpV-mU,0);
  var xyzV=perp._xyzAccountValue||0;
  var xyzMU=perp._xyzMarginUsed||0;

  var upnl=0;
  (perp.assetPositions||[]).forEach(function(p){ upnl+=parseFloat(p.position.unrealizedPnl||0); });

  var spotV=0;
  (spot.balances||[]).forEach(function(b){
    var qty=parseFloat(b.total||0); if(!qty) return;
    var coin=(b.coin||b.token||'').toString();
    if(coin==='USDC'){ spotV+=qty; return; }
    var px=parseFloat(mids[coin]||mids[coin.replace(/:SPOT$/i,'')]||mids[coin+':SPOT']||0);
    spotV+=qty*px;
  });

  var total=perpV+xyzV+spotV;
  var openCount=(perp.assetPositions||[]).filter(function(p){ return parseFloat(p.position.szi)!==0; }).length;

  animNum('totalBal',total,2); animNum('perpBal',perpV+xyzV,2); animNum('spotBal',spotV,2);
  animNum('marginUsed',mU+xyzMU,2); animNum('marginFree',wdraw,2); animNum('withdrawable',wdraw,2);
  ge('openCount').textContent=openCount;

  var uEl=ge('aoUpnl');
  if(uEl){ uEl.textContent=fmtSgn(upnl,4)+' $'; uEl.className='ao-upnl '+col(upnl); }
  var pb=ge('aoPnlBlock'); if(pb) pb.style.display='block';
}

/* ── Render PnL bar ── */
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
function setPnlEl(id,val){ if(val==null||isNaN(val)) return; var el=ge(id); if(!el) return; el.textContent=fmtSgn(val,2)+' $'; el.className='pr-v '+col(val); }

/* ── Render positions (native + xyz merged) ── */
function renderPositions(perp,mids){
  var active=(perp.assetPositions||[]).filter(function(p){ return parseFloat(p.position.szi)!==0; });
  ge('posBadge').textContent=active.length;
  if(!active.length){ ge('posTbody').innerHTML='<tr class="no-row"><td colspan="11">No open positions</td></tr>'; return; }
  ge('posTbody').innerHTML=active.map(function(p,i){
    var pos=p.position, coin=pos.coin||'';
    var szi=parseFloat(pos.szi), entry=parseFloat(pos.entryPx||0), upnl=parseFloat(pos.unrealizedPnl||0);
    var liqRaw=pos.liquidationPx, liq=(liqRaw!=null&&liqRaw!=='0')?parseFloat(liqRaw):null;
    var levObj=pos.leverage||{}, lev=levObj.value?parseFloat(levObj.value):null, levTyp=levObj.type||'';
    var isLong=szi>0, absSz=Math.abs(szi);
    /* markPx = entryPx + unrealizedPnl / szi (signed) */
    var mark=szi!==0?entry+upnl/szi:entry;
    var pnlPct=entry>0?(mark-entry)/entry*100*(isLong?1:-1):null;
    var notional=absSz*mark, margin=(lev&&notional>0)?notional/lev:0, roe=margin>0?upnl/margin*100:null;
    var liqDist=(liq&&mark>0)?Math.abs((liq-mark)/mark*100):null;
    var liqCls=liqDist!=null?(liqDist<5?'red fw6':liqDist<15?'orange':'dim-c'):'dim-c';
    return '<tr class="ra" style="animation-delay:'+(i*0.04)+'s">'
      +td('mono fw6',coinLabel(coin))
      +td('','<span class="tag '+(isLong?'t-long':'t-short')+'">'+(isLong?'↑ Long':'↓ Short')+'</span>')
      +td('mono',fmtSz(absSz))+td('mono',fmtPx(entry))+td('mono '+col(upnl),fmtPx(mark))
      +td('mono fw6 '+col(upnl),fmtSgn(upnl,4))
      +td('mono '+col(upnl),pnlPct!=null?fmtSgn(pnlPct,3)+'%':'—')
      +td('mono '+col(roe),roe!=null?fmtSgn(roe,2)+'%':'—')
      +td('',lev?'<span class="lev '+(levTyp==='cross'?'lev-crs':'lev-iso')+'">'+lev+'x'+(levTyp==='cross'?' ✕':'')+'</span>':'—')
      +'<td class="'+liqCls+'"><span class="mono">'+(liq?fmtPx(liq):'—')+'</span>'+(liqDist!=null?'<span class="liq-sub">'+liqDist.toFixed(2)+'% away</span>':'')+'</td>'
      +td('mono sub-c',fmtLarge(notional))+'</tr>';
  }).join('');
}

/* ── Trade history: last 100 closing fills ── */
function isClosingFill(f){ var d=(f.dir||'').toLowerCase(); return d.startsWith('close')||d.startsWith('flip')||parseFloat(f.closedPnl||0)!==0; }

function renderTrades(fills){
  var closing=fills.filter(isClosingFill), top=closing.slice(0,100);
  ge('fillsBadge').textContent=top.length+(closing.length>100?'+':'');
  if(!top.length){ ge('fillsTbody').innerHTML='<tr class="no-row"><td colspan="9">No closed trades found</td></tr>'; return; }
  ge('fillsTbody').innerHTML=top.map(function(f,i){
    var pnl=parseFloat(f.closedPnl||0), fee=parseFloat(f.fee||0), ot=orderType(f);
    var dir=f.dir||(f.side==='B'?'Open Long':'Open Short');
    return '<tr class="ra" style="animation-delay:'+Math.min(i*0.006,0.2)+'s">'
      +td('mono dim-c',fmtTime(f.time),11)+td('mono fw6',coinLabel(f.coin||''))
      +td('',dirTag(dir))+td('','<span class="tag '+ot.cls+'">'+ot.label+'</span>')
      +td('mono',fmtPx(parseFloat(f.px||0)))+td('mono',fmtSz(parseFloat(f.sz||0)))
      +td('mono sub-c',fmtLarge(parseFloat(f.sz||0)*parseFloat(f.px||0)))
      +td('mono fw6 '+col(pnl),pnl!==0?fmtSgn(pnl,4):'—')
      +td('mono orange',fmtU(Math.abs(fee),4),11)+'</tr>';
  }).join('');
}
function dirTag(dir){ var d=dir.toLowerCase(); var cls=d.startsWith('close')?(d.includes('long')?'t-short':'t-long'):d.startsWith('flip')?'t-taker':d.includes('long')||d.includes('buy')?'t-long':'t-short'; return '<span class="tag '+cls+'">'+dir+'</span>'; }

/* ── Trade stats (ALL fills for fees, closing fills for PnL) ── */
function computeStats(fills){
  if(!fills.length) return;
  var closing=fills.filter(isClosingFill);
  var pnls=closing.map(function(f){ return parseFloat(f.closedPnl||0); });
  var wins=pnls.filter(function(p){ return p>0; });
  var losses=pnls.filter(function(p){ return p<0; });
  var winRate=pnls.length?wins.length/pnls.length*100:null;
  var avgWin=wins.length?wins.reduce(function(a,b){ return a+b; },0)/wins.length:0;
  var avgLoss=losses.length?Math.abs(losses.reduce(function(a,b){ return a+b; },0)/losses.length):0;
  var pf=avgLoss>0?avgWin/avgLoss:null;
  var best=pnls.length?Math.max.apply(null,pnls):null, worst=pnls.length?Math.min.apply(null,pnls):null;
  /* ALL fills fees (open + close = total) */
  var totalFees=fills.reduce(function(s,f){ return s+Math.abs(parseFloat(f.fee||0)); },0);
  var totalVol=fills.reduce(function(s,f){ return s+parseFloat(f.sz||0)*parseFloat(f.px||0); },0);
  ssc('statWr',  winRate!=null?winRate.toFixed(1)+'%':'—',    winRate!=null&&winRate>=50?'green':'red');
  ssc('statAvgW',avgWin>0?'+'+fmtU(avgWin,2):'—',            'green');
  ssc('statAvgL',avgLoss>0?'-'+fmtU(avgLoss,2):'—',          'red');
  ssc('statPF',  pf!=null?pf.toFixed(2):'—',                 pf!=null&&pf>=1?'green':'red');
  ssc('statBest',best!=null?fmtSgn(best,2):'—',              'green');
  ssc('statWorst',worst!=null?fmtSgn(worst,2):'—',           'red');
  ssc('statFees','-'+fmtU(totalFees,2),                      'orange');
  ssc('statVol', fmtLarge(totalVol),                         'blue');
  ssc('statTrades',closing.length.toLocaleString(),          '');
}
function ssc(id,text,cls){ var el=ge(id+'-v'); if(!el) return; el.textContent=text; if(cls) el.className='sc-v '+cls; }

/* ── Transactions (IN/OUT only, no INT) ── */
function txDirection(tx){
  var t=(tx.delta||{}).type||'';
  if(t==='deposit')      return 'in';
  if(t==='withdraw')     return 'out';
  if(t==='vaultWithdraw') return 'in';
  if(t==='vaultDeposit')  return 'out';
  if(t==='liquidation')   return 'out';
  /* Transfer: check address direction */
  var d=tx.delta||{}, self=currentAddr.toLowerCase();
  var dest=(d.destination||d.to||'').toLowerCase();
  var from=(d.user||d.from||'').toLowerCase();
  if(dest===self) return 'in';
  if(from===self) return 'out';
  return parseFloat(d.usdc||d.amount||0)>=0?'in':'out';
}
function txAmt(tx){ var d=tx.delta||{}; return Math.abs(parseFloat(d.usdc!=null?d.usdc:d.amount!=null?d.amount:d.usd!=null?d.usd:0)); }
function txToken(tx){ return (tx.delta||{}).feeToken||(tx.delta||{}).token||'USDC'; }
function txLabel(tx){ var t=(tx.delta||{}).type||'?'; return {deposit:'Deposit',withdraw:'Withdrawal',spotTransfer:'Spot Transfer',internalTransfer:'Transfer',subAccountTransfer:'Sub-Account',accountClassTransfer:'Reclassify',vaultDeposit:'Vault Out',vaultWithdraw:'Vault In',liquidation:'Liquidation',funding:'Funding'}[t]||t; }
function txCp(tx,field){ var a=(tx.delta||{})[field]; return a&&a.toLowerCase()!==currentAddr.toLowerCase()?a:null; }

function renderTx(raw){
  txAll=(Array.isArray(raw)?raw:[]).map(function(t){ return Object.assign({},t,{_d:txDirection(t),_a:txAmt(t)}); }).sort(function(a,b){ return b.time-a.time; });
  var depTotal=txAll.filter(function(t){ return t._d==='in'; }).reduce(function(s,t){ return s+t._a; },0);
  var witTotal=txAll.filter(function(t){ return t._d==='out'; }).reduce(function(s,t){ return s+t._a; },0);
  var net=depTotal-witTotal;
  ge('txBadge').textContent=txAll.length;
  ge('txSumrow').innerHTML=tsr('Total Deposits','+'+fmtU(depTotal,2),'green','USDC')+tsr('Total Withdrawals','-'+fmtU(witTotal,2),'red','USDC')+tsr('Net Flow',fmtSgn(net,2),col(net),'USDC')+tsr('Entries',txAll.length,'yellow','total');
  txTab='all'; txPage=0;
  document.querySelectorAll('.ttab').forEach(function(b){ b.classList.remove('active'); });
  var ttAll=ge('tt-all'); if(ttAll) ttAll.classList.add('active');
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
      +td('',from?addrBit(from):youBadge())+td('',to?addrBit(to):youBadge())
      +td('mono dim-c',fmtTime(tx.time),11)+'</tr>';
  }).join('');
  var total=txFiltered.length,pages=Math.ceil(total/TX_PER);
  ge('txPageInfo').textContent=(start+1)+'–'+Math.min(start+TX_PER,total)+' of '+total;
  ge('pgPrev').disabled=txPage===0; ge('pgNext').disabled=txPage>=pages-1;
  pager.style.display=pages>1?'flex':'none';
}
function addrBit(a){ return '<span class="mono sub-c addr-bit" title="'+escAttr(a)+'" onclick="navigator.clipboard&&navigator.clipboard.writeText(\''+escAttr(a)+'\')">'+a.slice(0,6)+'…'+a.slice(-4)+'</span>'; }
function youBadge(){ return '<span class="mono green" style="font-size:10px">You</span>'; }

/* ── Coin label (xyz:CL → "CL [xyz]") ── */
function coinLabel(coin){ if(!coin) return '—'; var m=coin.match(/^([^:]+):(.+)$/); if(m) return escHtml(m[2])+' <span class="tag t-xyz">'+escHtml(m[1])+'</span>'; if(coin.startsWith('@')) return '<span class="tag t-spot">SPOT</span> '+escHtml(coin); return escHtml(coin); }

/* ── Animated number ── */
function animNum(id,to,d){ var el=ge(id); if(!el) return; to=parseFloat(to); if(isNaN(to)){ el.textContent='—'; return; } var from=parseFloat(el.dataset.v||0); el.dataset.v=to; if(Math.abs(from-to)<0.0001){ el.textContent=fmtU(to,d!=null?d:2); return; } var t0=Date.now(),dur=650; (function tick(){ var p=Math.min((Date.now()-t0)/dur,1),e=p<0.5?2*p*p:-1+(4-2*p)*p; el.textContent=fmtU(from+(to-from)*e,d!=null?d:2); if(p<1) requestAnimationFrame(tick); else el.textContent=fmtU(to,d!=null?d:2); })(); }

/* ── Load/Error ── */
function showLoad(txt,pct){ ge('loadTxt').textContent=txt||'Loading…'; ge('lbFill').style.width=(pct||30)+'%'; show('loadBar'); }
function hideLoad(){ ge('lbFill').style.width='100%'; setTimeout(function(){ hide('loadBar'); ge('lbFill').style.width='0'; },300); }
function showErr(msg){ var el=ge('errBar'); el.textContent=msg; el.style.display=msg?'block':'none'; }

/* ── HTML utils ── */
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
  buildChips(); updateRing(60);
  ge('addrInput').addEventListener('keydown',function(e){ if(e.key==='Enter') analyze(); });
  var sn=ge('saveName'); if(sn) sn.addEventListener('keydown',function(e){ if(e.key==='Enter') doSave(); });
});
