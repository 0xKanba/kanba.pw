/* ═══════════════════════════════════════
   HL Trade · app.js - إصلاحات + ميزات
════════════════════════════════════════ */

/* ── CONSTANTS ── */
const HL_API = 'https://api.hyperliquid.xyz';
const ARB_RPC = 'https://arb1.arbitrum.io/rpc';
const USDC_CA = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const BRDG_CA = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';
const USDC_ABI = ['function approve(address,uint256) returns (bool)','function balanceOf(address) view returns (uint256)'];
const BRDG_ABI = ['function deposit(address,uint64) external'];

const ASSETS = {
  GOLD:   { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:1, unit:'أونصة', pre:[0.1,0.5,1,2,5],   ico:'🟡', ar:'ذهب'    },
  SILVER: { coin:'xyz:SILVER', idx:110026, lev:25, cross:true,  szDp:2, pxDp:3, unit:'أونصة', pre:[1,2,3,5,10,20],   ico:'⚪', ar:'فضة'    },
  CL:     { coin:'xyz:CL',     idx:110029, lev:20, cross:false, szDp:3, pxDp:2, unit:'برميل', pre:[1,2,3,5,10,20],   ico:'🛢', ar:'نفط خام' },
};

/* ── STATE ── */
let wallet=null, sym='GOLD', selQty=0.1, PX={GOLD:{bid:0,ask:0,mid:0},SILVER:{bid:0,ask:0,mid:0},CL:{bid:0,ask:0,mid:0}}, PRV={GOLD:0,SILVER:0,CL:0}, positions=[], timers=[], pendTrade=null, pendClose=null, secCount=0;

/* ── HELPERS ── */
const $=id=>document.getElementById(id), fx=(n,d)=>(+n).toFixed(d);
const om=id=>$(id).classList.add('open'), cm=id=>$(id).classList.remove('open');

function toast(msg,type='if',dur=3500){
  const el=$('tst'); el.textContent=msg; el.className='on '+type;
  clearTimeout(el._t); el._t=setTimeout(()=>el.className='',dur);
}
function ld(msg){ $('ldrt').textContent=msg||'جاري...'; $('ldr').className='on'; }
function ul(){ $('ldr').className=''; }

function setBtnLoading(id,text='⏳'){
  const btn=$(id); btn.disabled=true; btn._origHTML=btn.innerHTML; btn.innerHTML=text;
}
function resetBtn(id){ const btn=$(id); btn.disabled=false; if(btn._origHTML)btn.innerHTML=btn._origHTML; }

/* ── API ── */
async function hlInfo(body){
  const res=await fetch(HL_API+'/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok) throw new Error('HTTP '+res.status); return res.json();
}

async function hlExchange(action){
  if(!wallet) throw new Error('لا توجد محفظة');
  if(typeof MessagePack==='undefined') throw new Error('msgpack غير محمّل');
  const nonce=Date.now(), ab=MessagePack.encode(action), nb=new ArrayBuffer(8);
  new DataView(nb).setBigUint64(0,BigInt(nonce),false);
  const buf=new Uint8Array(ab.length+9); buf.set(ab); buf.set(new Uint8Array(nb),ab.length); buf.set([0x00],ab.length+8);
  const connId=ethers.keccak256(buf);
  const sig=await wallet.signTypedData({name:'Exchange',version:'1',chainId:1337,verifyingContract:'0x0000000000000000000000000000000000000000'},
    {Agent:[{name:'source',type:'string'},{name:'connectionId',type:'bytes32'}]},{source:'a',connectionId:connId});
  const {r,s,v}=ethers.Signature.from(sig);
  const res=await fetch(HL_API+'/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,nonce,signature:{r,s,v},vaultAddress:null})});
  if(!res.ok) throw new Error('Exchange HTTP '+res.status);
  const data=await res.json();
  if(data.status!=='ok'){const msg=data.response?.data?.statuses?.[0]||data.response||JSON.stringify(data).slice(0,250); throw new Error(typeof msg==='string'?msg:JSON.stringify(msg));}
  return data;
}

/* ── PRICES ── */
async function pollPrices(){
  await Promise.all(Object.keys(ASSETS).map(async s=>{
    try{
      const a=ASSETS[s], lb=await hlInfo({type:'l2Book',coin:a.coin});
      const bid=parseFloat(lb.levels?.[0]?.[0]?.px||0), ask=parseFloat(lb.levels?.[1]?.[0]?.px||0), mid=(bid&&ask)?(bid+ask)/2:0;
      PX[s]={bid,ask,mid};
      const tp=$('tp'+s);
      if(mid&&tp){const prev=PRV[s]||0, dir=mid>prev?'up':mid<prev?'dn':''; tp.textContent=fx(mid,a.pxDp); tp.className='tp'+(dir?' '+dir:''); if(dir)setTimeout(()=>{tp.className='tp';},800);}
    }catch{}
  }));
  updatePxDisplay();
}

function updatePxDisplay(){
  const a=ASSETS[sym], p=PX[sym]; if(!p||!p.mid)return;
  const prev=PRV[sym]||p.mid, dir=p.mid>prev?1:p.mid<prev?-1:0, cl=dir>0?'u':dir<0?'d':'n';
  const band=$('pxB'); if(band)band.className='pxband'+(dir>0?' pu':dir<0?' pd':'');
  setText('pxM',fx(p.mid,a.pxDp),'pxn '+cl); setTxt('bBuP',fx(p.mid,a.pxDp)); setTxt('bSeP',fx(p.mid,a.pxDp));
  if(prev&&p.mid!==prev){const diff=p.mid-prev, txt=(diff>0?'+':'')+fx(diff,a.pxDp); setText('pxMd',txt,'pxdel '+cl);}
  PRV[sym]=p.mid; secCount=1; clearInterval(window._pxTimer); setTxt('pxT','↻ 1s');
  window._pxTimer=setInterval(()=>{secCount++;setTxt('pxT','↻ '+secCount+'s');},1000);
}
function setText(id,txt,cls){const el=$(id); if(!el)return; el.textContent=txt; if(cls!==undefined)el.className=cls;}
function setTxt(id,txt){const el=$(id); if(el)el.textContent=txt;}

/* ── ACCOUNT ── */
async function pollAccount(){
  if(!wallet)return;
  try{
    const [perpSt,spotSt]=await Promise.all([hlInfo({type:'clearinghouseState',user:wallet.address,dex:'xyz'}),hlInfo({type:'spotClearinghouseState',user:wallet.address})]);
    const ms=perpSt.marginSummary||{}, perpEquity=parseFloat(ms.accountValue||0), marginUsed=parseFloat(ms.totalMarginUsed||0), withdrawable=parseFloat(perpSt.withdrawable||0);
    let spotUSDC=0; for(const b of spotSt?.balances||[]){if(b.coin==='USDC'||b.coin==='USDC:0')spotUSDC+=parseFloat(b.total||0);}
    const totalEquity=perpEquity+spotUSDC, freeMargin=withdrawable+spotUSDC, floatPnl=(perpSt.assetPositions||[]).reduce((s,p)=>s+parseFloat(p.position?.unrealizedPnl||0),0);
    positions=(perpSt.assetPositions||[]).filter(p=>parseFloat(p.position?.szi||0)!==0);
    window._BAL={totalEquity,perpEquity,spotUSDC,marginUsed,withdrawable,freeMargin,floatPnl}; renderPositions();
  }catch(e){console.warn('[pollAccount]',e.message);}
}

/* ── SWITCH ASSET ── */
function switchSym(s){
  sym=s; document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',t.dataset.s===s));
  const a=ASSETS[s]; setTxt('pxAN',a.ar); setTxt('uLb',a.unit); setTxt('pSym',a.ar); renderPresets(a.pre); PRV[s]=0; updatePxDisplay();
}
function renderPresets(pre){
  $('psets').innerHTML=pre.map((v,i)=>`<button class="ps${i===0?' on':''}" onclick="pickQty(${v},this)">${v}</button>`).join('');
  selQty=pre[0]; $('qI').value=pre[0];
}
window.pickQty=function(v,btn){selQty=v; $('qI').value=v; $('psets').querySelectorAll('.ps').forEach(b=>b.classList.remove('on')); btn.classList.add('on');};

/* ── POSITIONS ── */
function renderPositions(){
  const cnt=$('pCnt'); if(cnt)cnt.textContent=positions.length; const tot=$('pTot');
  if(!positions.length){$('pList').innerHTML='<div class="posmt">📂 لا توجد صفقات مفتوحة</div>'; if(tot)tot.textContent=''; return;}
  let total=0;
  $('pList').innerHTML=positions.map((p,i)=>{
    const pos=p.position, szi=parseFloat(pos.szi), pnl=parseFloat(pos.unrealizedPnl||0); total+=pnl;
    const cs=pos.coin.replace('xyz:',''), a=ASSETS[cs]||{ar:cs,unit:'',ico:'',pxDp:2};
    const sAr=szi>0?'شراء ↑':'بيع ↓', sCl=szi>0?'lo':'sh', pCl=pnl>=0?'po':'ne', sg=pnl>=0?'+':'', ep=parseFloat(pos.entryPx||0), cur=PX[cs]?.mid||0;
    return `<div class="posit"><div class="pil"><div class="pin">${a.ico} ${a.ar}</div><div class="pim"><span class="${sCl}">${sAr}</span> &nbsp;|&nbsp; دخول: ${fx(ep,a.pxDp)} &nbsp;|&nbsp; حالي: ${cur?fx(cur,a.pxDp):'—'}</div><button class="bclr" onclick="askClose(${i})">إغلاق ✕</button><button class="tpbtn" onclick="takeProfit100(${i})">جني ربح 100% ✓</button></div><div class="pir"><div class="pip ${pCl}">${sg}$${fx(pnl,2)}</div><div class="pisz">${Math.abs(szi)} ${a.unit}</div></div></div>`;
  }).join('');
  if(tot){const ts=total>=0?'+':''; tot.textContent=`${ts}$${fx(total,2)}`; tot.style.color=total>=0?'var(--up)':'var(--dn)';}
}

/* ══════════════════════════════════════
   TRADE — CONFIRM FLOW (مُصلح)
══════════════════════════════════════ */
function askTrade(isBuy,e){
  const qty=parseFloat($('qI').value||selQty||0);
  if(!qty||qty<=0){toast('أدخل الكمية أولاً','er');return;}
  const a=ASSETS[sym], p=PX[sym];
  if(!p||!p.mid){toast('لا يوجد سعر — السوق مغلق؟','er');return;}
  const price=p.mid, usd=(price*qty).toFixed(2), mgn=(price*qty/a.lev).toFixed(2), liq=fx(price*(isBuy?1-1/a.lev:1+1/a.lev),a.pxDp), dir=isBuy?'شراء ↑':'بيع ↓';
  setTxt('cfT',`تأكيد — ${a.ico} ${dir}`); setTxt('cfS',`${a.ar} · رافعة ${a.lev}x`);
  $('cfB').innerHTML=`<div class="cr"><div class="ck">الاتجاه</div><div class="cv ${isBuy?'bc':'sc'}">${dir}</div></div><div class="cr"><div class="ck">الكمية</div><div class="cv">${qty} ${a.unit}</div></div><div class="cr"><div class="ck">السعر</div><div class="cv">${fx(price,a.pxDp)} $</div></div><div class="cr"><div class="ck">القيمة</div><div class="cv">≈ $${usd}</div></div><div class="cr"><div class="ck">الهامش</div><div class="cv wc">≈ $${mgn}</div></div><div class="cr"><div class="ck">تصفية تقريبية</div><div class="cv sc">≈ ${liq} $</div></div>`;
  const ok=$('cfOk'); ok.className='sok '+(isBuy?'bok':'sok2'); ok.innerHTML=isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع';
  pendTrade={isBuy,qty,sym}; om('mCf');
}

// زر 100% للكمية
$('q100')?.addEventListener('click',()=>{
  if(!wallet){toast('سجّل الدخول أولاً','er');return;}
  const a=ASSETS[sym], bal=window._BAL?.freeMargin||0;
  if(!bal||bal<=0){toast('لا يوجد رصيد حر','er');return;}
  const price=PX[sym]?.mid; if(!price){toast('لا يوجد سعر','er');return;}
  const maxQty=(bal*a.lev)/price; selQty=parseFloat(fx(maxQty,a.szDp)); $('qI').value=selQty;
  $('psets').querySelectorAll('.ps').forEach(b=>b.classList.remove('on')); toast(`✅ الكمية: ${selQty} ${a.unit}`,'ok',2000);
});

window.execTrade=async function(){
  if(!pendTrade){cm('mCf');return;}
  const {isBuy,qty,sym:s}=pendTrade, a=ASSETS[s], p=PX[s];
  if(!p||!p.mid){toast('لا يوجد سعر','er');cm('mCf');return;}
  setBtnLoading('cfOk','⏳ جاري...'); ld(`${a.ico} ${isBuy?'شراء ↑':'بيع ↓'} ${qty} ${a.unit}`);
  try{
    try{await hlExchange({type:'updateLeverage',asset:a.idx,isCross:a.cross,leverage:a.lev});}catch(e){console.warn('[setLev]',e.message);}
    const limitPx=fx(p.mid*(isBuy?1.02:0.98),a.pxDp), sz=fx(qty,a.szDp);
    await hlExchange({type:'order',orders:[{a:a.idx,b:isBuy,p:limitPx,s:sz,r:false,t:{limit:{tif:'Ioc'}}}],grouping:'na'});
    cm('mCf'); toast(`✅ ${isBuy?'شراء':'بيع'} ${qty} ${a.unit} ${a.ar}`,'ok',5000); setTimeout(pollAccount,2000);
  }catch(err){toast(`❌ ${err.message.slice(0,120)}`,'er',6000);}
  finally{resetBtn('cfOk'); ul();}
};

/* ══════════════════════════════════════
   CLOSE + TAKE PROFIT 100%
══════════════════════════════════════ */
window.askClose=function(i){
  const p=positions[i]; if(!p)return;
  const pos=p.position, szi=parseFloat(pos.szi), cs=pos.coin.replace('xyz:',''), a=ASSETS[cs]||{ar:cs,unit:'',ico:'',pxDp:2}, pnl=parseFloat(pos.unrealizedPnl||0), sg=pnl>=0?'+':'', cur=PX[cs]?.mid||0;
  setTxt('clT',`إغلاق — ${a.ico} ${a.ar}`);
  $('clB').innerHTML=`<div class="cr"><div class="ck">الاتجاه</div><div class="cv">${szi>0?'شراء ↑':'بيع ↓'}</div></div><div class="cr"><div class="ck">الكمية</div><div class="cv">${Math.abs(szi)} ${a.unit}</div></div><div class="cr"><div class="ck">دخول</div><div class="cv">${fx(pos.entryPx||0,a.pxDp)} $</div></div><div class="cr"><div class="ck">حالي</div><div class="cv">${cur?fx(cur,a.pxDp):'—'} $</div></div><div class="cr"><div class="ck">P&L</div><div class="cv" style="color:${pnl>=0?'var(--up)':'var(--dn)'}">${sg}$${fx(pnl,2)}</div></div>`;
  pendClose=i; om('mCl');
};

// جني ربح 100% فوري
window.takeProfit100=async function(i){
  const p=positions[i]; if(!p){toast('الصفقة غير موجودة','er');return;}
  const pos=p.position, szi=parseFloat(pos.szi), cs=pos.coin.replace('xyz:',''), a=ASSETS[cs];
  if(!a){toast('أصل غير معروف','er');return;}
  const mid=PX[cs]?.mid; if(!mid){toast('لا يوجد سعر','er');return;}
  ld(`جني ربح ${a.ico} ${a.ar}...`);
  try{
    const isBuy=szi<0, sz=fx(Math.abs(szi),a.szDp), limitPx=fx(mid*(isBuy?1.02:0.98),a.pxDp);
    await hlExchange({type:'order',orders:[{a:a.idx,b:isBuy,p:limitPx,s:sz,r:true,t:{limit:{tif:'Ioc'}}}],grouping:'na'});
    const pnl=parseFloat(pos.unrealizedPnl||0), sg=pnl>=0?'+':'';
    toast(`✅ أُغلقت ${a.ar} | الربح: ${sg}$${fx(pnl,2)}`,pnl>=0?'ok':'er',5000); setTimeout(pollAccount,2000);
  }catch(err){toast(`❌ ${err.message.slice(0,120)}`,'er',6000);} finally{ul();}
};

window.execClose=async function(){
  if(pendClose===null){cm('mCl');return;}
  const i=pendClose, p=positions[i]; if(!p){cm('mCl');return;}
  const pos=p.position, szi=parseFloat(pos.szi), cs=pos.coin.replace('xyz:',''), a=ASSETS[cs];
  if(!a){toast('أصل غير معروف','er');cm('mCl');return;}
  const mid=PX[cs]?.mid; if(!mid){toast('لا يوجد سعر','er');cm('mCl');return;}
  setBtnLoading('clOk','⏳'); ld(`إغلاق ${a.ico} ${a.ar}...`);
  try{
    const isBuy=szi<0, sz=fx(Math.abs(szi),a.szDp), limitPx=fx(mid*(isBuy?1.02:0.98),a.pxDp);
    await hlExchange({type:'order',orders:[{a:a.idx,b:isBuy,p:limitPx,s:sz,r:true,t:{limit:{tif:'Ioc'}}}],grouping:'na'});
    const pnl=parseFloat(pos.unrealizedPnl||0), sg=pnl>=0?'+':''; cm('mCl');
    toast(`✅ أُغلقت ${a.ar} | P&L: ${sg}$${fx(pnl,2)}`,pnl>=0?'ok':'er',5000); setTimeout(pollAccount,2000);
  }catch(err){toast(`❌ ${err.message.slice(0,120)}`,'er',6000);} finally{resetBtn('clOk'); ul();}
};

/* ══════════════════════════════════════
   BALANCE / DEPOSIT / WITHDRAW / LOGIN
══════════════════════════════════════ */
async function showBalance(){om('mBl');$('blC').innerHTML='<div class="bld">⏳ جاري...</div>';
  try{const [perpSt,spotSt]=await Promise.all([hlInfo({type:'clearinghouseState',user:wallet.address,dex:'xyz'}),hlInfo({type:'spotClearinghouseState',user:wallet.address})]);
  const ms=perpSt.marginSummary||{}, perpEquity=parseFloat(ms.accountValue||0), marginUsed=parseFloat(ms.totalMarginUsed||0), withdrawable=parseFloat(perpSt.withdrawable||0);
  let spotUSDC=0; for(const b of spotSt?.balances||[]){if(b.coin==='USDC'||b.coin==='USDC:0')spotUSDC+=parseFloat(b.total||0);}
  const totalEquity=perpEquity+spotUSDC, freeMargin=(perpEquity-marginUsed)+spotUSDC, floatPnl=positions.reduce((s,p)=>s+parseFloat(p.position?.unrealizedPnl||0),0), ps=floatPnl>=0?'+':'';
  $('blC').innerHTML=`<div class="bg2"><div class="bi fw"><div class="bil">إجمالي الرصيد</div><div class="biv b">$${fx(totalEquity,2)}</div><div class="bis">Perps $${fx(perpEquity,2)} + Spot $${fx(spotUSDC,2)}</div></div><div class="bi"><div class="bil">رصيد حر</div><div class="biv g">$${fx(freeMargin,2)}</div></div><div class="bi"><div class="bil">هامش مستخدم</div><div class="biv w">$${fx(marginUsed,2)}</div></div><div class="bi"><div class="bil">قابل للسحب</div><div class="biv g">$${fx(withdrawable,2)}</div></div><div class="bi"><div class="bil">P&L عائم</div><div class="biv ${floatPnl>=0?'g':'r'}">${ps}$${fx(floatPnl,2)}</div></div></div><button class="bref" onclick="showBalance()">🔄 تحديث</button>`;
  }catch(err){$('blC').innerHTML=`<div class="bld" style="color:var(--dn)">❌ ${err.message.slice(0,180)}</div>`;}}

async function doWithdraw(){const amt=parseFloat($('wA').value||0), dest=$('wD').value.trim();
  if(!amt||amt<=0){toast('أدخل المبلغ','er');return;} if(!/^0x[0-9a-fA-F]{40}$/.test(dest)){toast('عنوان غير صحيح','er');return;}
  setBtnLoading('wOk','⏳'); ld('توقيع السحب...');
  try{const nonce=Date.now(), to=dest.toLowerCase(), action={type:'withdraw3',hyperliquidChain:'Mainnet',signatureChainId:'0xa4b1',destination:to,amount:amt.toFixed(2),time:nonce};
  const sig=await wallet.signTypedData({name:'HyperliquidSignTransaction',version:'1',chainId:42161,verifyingContract:'0x0000000000000000000000000000000000000000'},
    {'HyperliquidTransaction:Withdraw':[{name:'hyperliquidChain',type:'string'},{name:'destination',type:'string'},{name:'amount',type:'string'},{name:'time',type:'uint64'}]},
    {hyperliquidChain:'Mainnet',destination:to,amount:action.amount,time:nonce});
  const {r,s,v}=ethers.Signature.from(sig), res=await fetch(HL_API+'/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,nonce,signature:{r,s,v}})}), data=await res.json();
  if(data.status!=='ok')throw new Error(JSON.stringify(data)); cm('mWd'); toast(`✅ سحب ${amt} USDC قيد المعالجة`,'ok',5000); setTimeout(pollAccount,5000);
  }catch(err){toast(`❌ ${err.message.slice(0,120)}`,'er',5000);} finally{resetBtn('wOk');ul();}}

async function doDeposit(){const amt=parseFloat($('dA').value||0); if(!amt||amt<=0){toast('أدخل المبلغ','er');return;}
  setBtnLoading('dOk','⏳'); ld('موافقة USDC...');
  try{const prov=new ethers.JsonRpcProvider(ARB_RPC), w2=new ethers.Wallet(wallet.privateKey,prov), uc=new ethers.Contract(USDC_CA,USDC_ABI,w2), bc=new ethers.Contract(BRDG_CA,BRDG_ABI,w2), raw=ethers.parseUnits(amt.toString(),6), bal=await uc.balanceOf(w2.address);
  if(bal<raw)throw new Error(`رصيد غير كافٍ: ${ethers.formatUnits(bal,6)}`); const ap=await uc.approve(BRDG_CA,raw); await ap.wait(); ld('إرسال للجسر...'); const dep=await bc.deposit(w2.address,raw), rec=await dep.wait();
  cm('mDp'); toast(`✅ إيداع ${amt} USDC · ${rec.hash.slice(0,10)}...`,'ok',6000); setTimeout(pollAccount,7000);
  }catch(err){toast(`❌ ${err.message.slice(0,120)}`,'er',5000);} finally{resetBtn('dOk');ul();}}

async function login(){let key=$('kI').value.trim(); if(!key){toast('أدخل المفتاح','er');return;} if(!key.startsWith('0x'))key='0x'+key;
  if(!/^0x[0-9a-fA-F]{64}$/.test(key)){toast('المفتاح 64 حرف hex','er');return;} setBtnLoading('lBtn','⏳'); ld('التحقق...');
  try{wallet=new ethers.Wallet(key); sessionStorage.setItem('hl_k',key); const addr=wallet.address; setTxt('nAd',addr.slice(0,6)+'...'+addr.slice(-4)); $('wD').value=addr;
  $('sL').classList.add('off'); $('sA').classList.remove('off'); switchSym('GOLD'); ld('جلب البيانات...'); await Promise.all([pollPrices(),pollAccount()]); ul(); toast('مرحباً · '+addr.slice(0,6)+'...','ok');
  timers.push(setInterval(pollPrices,1000)); timers.push(setInterval(pollAccount,8000));}
  catch(err){ul(); wallet=null; sessionStorage.removeItem('hl_k'); toast('خطأ: '+err.message.slice(0,100),'er',5000);} finally{resetBtn('lBtn');}}

function askLogout(){setTxt('lgT','تسجيل الخروج'); om('mLg');}
window.doLogout=function(){timers.forEach(clearInterval); timers=[]; clearInterval(window._pxTimer); sessionStorage.removeItem('hl_k'); wallet=null; positions=[]; PX={GOLD:{bid:0,ask:0,mid:0},SILVER:{bid:0,ask:0,mid:0},CL:{bid:0,ask:0,mid:0}}; PRV={GOLD:0,SILVER:0,CL:0}; cm('mLg'); $('sA').classList.add('off'); $('sL').classList.remove('off'); $('kI').value=''; toast('تم الخروج بأمان','if');};

/* ── EVENTS ── */
document.addEventListener('DOMContentLoaded',()=>{
  $('lBtn').addEventListener('click',login); $('kI').addEventListener('keydown',e=>e.key==='Enter'&&login());
  $('kE').addEventListener('click',()=>{const inp=$('kI'), show=inp.type==='password'; inp.type=show?'text':'password'; $('kE').textContent=show?'🙈':'👁';});
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>switchSym(t.dataset.s)));
  $('bBu').addEventListener('click',e=>{if(!wallet){toast('سجّل الدخول أولاً','er');return;} askTrade(true);});
  $('bSe').addEventListener('click',e=>{if(!wallet){toast('سجّل الدخول أولاً','er');return;} askTrade(false);});
  $('qI').addEventListener('input',function(){selQty=parseFloat(this.value)||0; $('psets').querySelectorAll('.ps').forEach(b=>b.classList.remove('on'));});
  $('bBal').addEventListener('click',()=>wallet&&showBalance()); $('bDp').addEventListener('click',()=>wallet&&om('mDp')); $('bWd').addEventListener('click',()=>wallet&&om('mWd')); $('bOut').addEventListener('click',()=>wallet&&askLogout());
  $('dOk').addEventListener('click',doDeposit); $('wOk').addEventListener('click',doWithdraw);
  $('cfOk').addEventListener('click',execTrade); $('cfCancel').addEventListener('click',()=>{cm('mCf');pendTrade=null;});
  $('clOk').addEventListener('click',execClose); $('clCancel').addEventListener('click',()=>{cm('mCl');pendClose=null;});
  $('blClose').addEventListener('click',()=>cm('mBl')); $('dpCancel').addEventListener('click',()=>cm('mDp')); $('wdCancel').addEventListener('click',()=>cm('mWd'));
  $('lgCancel').addEventListener('click',()=>cm('mLg')); $('lgOk').addEventListener('click',doLogout);
  $('nAd').addEventListener('click',()=>{if(wallet){navigator.clipboard?.writeText(wallet.address).then(()=>toast('تم النسخ','if',2000)).catch(()=>{});}});
  document.querySelectorAll('.ov').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');}));
  const savedKey=sessionStorage.getItem('hl_k'); if(savedKey){$('kI').value=savedKey; login();}
});
