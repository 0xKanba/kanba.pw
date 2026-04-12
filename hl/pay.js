/* ═══════════════════════════════════════════════════════════
   pay.js v3 — Kanba Exchange
   ✅ Confirmation fullscreen overlay (Button 1)
   ✅ Timed reveal — data hides after 30min (max 60min)
   ✅ Email via EmailJS with full details
   ✅ Buy: recipient name + phone + secret code
   ✅ Sell: name + phone + proof wallet + method → wallet reveal
   ✅ "دولار أمريكي" everywhere (no USDC jargon)
═══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   ⚙️  CONFIG — عدّل هذه القيم فقط
══════════════════════════════════════════════════════════ */
const CFG = {
  // أسعار الصرف
  BUY_RATE:  1600,
  SELL_RATE: 1500,

  // حدود المبلغ (دينار)
  MIN_IQD: 15_000,
  MAX_IQD: 1_000_000,

  // بياناتك الشخصية (تُظهر بعد تأكيد + لمدة محدودة فقط)
  KANBA_NAME:    'حيدر كاظم',       // الاسم الذي يظهر للمستخدم
  KANBA_PHONE:   '07877382834',      // رقمك للاستلام
  KANBA_SECRET:  '4721',             // رقم سري للتأكيد (أذكره عند التواصل)
  KANBA_WALLET:  '0x121B845Cb550dD5B01B9eAc5BD65f79d84c6Ee99', // محفظتك

  // مدة ظهور بياناتك (بالثواني)
  REVEAL_SECS: 30 * 60,   // 30 دقيقة — مبدئي
  REVEAL_MAX:  60 * 60,   // ساعة واحدة — أقصى

  // EmailJS — اتبع التعليمات أدناه لملء هذه
  EJ_PUBLIC_KEY:  'YOUR_PUBLIC_KEY',
  EJ_SERVICE_ID:  'YOUR_SERVICE_ID',
  EJ_TEMPLATE_ID: 'YOUR_TEMPLATE_ID',
  EMAIL_TO:       'me@kanba.pw',

  // T&C
  TERMS_KEY: 'kanba_terms_v1',
};

/* ══════════════════════════════════════════════════════════
   حالة التطبيق
══════════════════════════════════════════════════════════ */
const S = {
  mode:   null,   // 'buy' | 'sell'
  method: null,   // 'zain' | 'super'
  step:   0,
  revealTimer: null,
  revealStart: null,
};

/* ══════════════════════════════════════════════════════════
   أدوات DOM
══════════════════════════════════════════════════════════ */
const $  = id => document.getElementById(id);
const sh = (id, d='')    => { const e=$(id); if(e) e.style.display = d||''; };
const hi = id            => { const e=$(id); if(e) e.style.display = 'none'; };
const cls = (id, add, ...c) => $(id)?.classList[add?'add':'remove'](...c);
const fmtIQD = n  => Number(n).toLocaleString('ar-IQ') + ' د.ع';
const fmtUSD = n  => (+n).toFixed(2) + ' دولار أمريكي';

/* ══════════════════════════════════════════════════════════
   IP CHECK
══════════════════════════════════════════════════════════ */
async function checkIP() {
  try {
    let country = null;
    try {
      const r = await fetch('https://api.country.is/', { signal: AbortSignal.timeout(5000) });
      country = (await r.json()).country;
    } catch {
      const r2 = await fetch('https://ipapi.co/country/');
      country  = (await r2.text()).trim();
    }
    if (country && country !== 'IQ') {
      cls('ipOverlay', false, 'hidden');
      cls('mainPage',  true,  'hidden');
    }
  } catch { /* proceed */ }
}

/* ══════════════════════════════════════════════════════════
   T&C
══════════════════════════════════════════════════════════ */
function isTermsOk() { return !!localStorage.getItem(CFG.TERMS_KEY); }

function updateTermsBadge() {
  const ok = isTermsOk();
  const b  = $('tBadge');
  if (!b) return;
  b.textContent = ok ? 'موافَق ✓' : 'غير موافَق';
  b.className   = ok ? 't-badge ok' : 't-badge pend';
  validate();
}

function watchTerms() {
  const cb = () => { updateTermsBadge(); window.removeEventListener('focus', cb); };
  window.addEventListener('focus', cb);
}

/* ══════════════════════════════════════════════════════════
   MODE
══════════════════════════════════════════════════════════ */
function setMode(mode) {
  S.mode   = mode;
  S.method = null;
  S.step   = 0;

  // buttons
  $('btnBuy').className  = 'mode-btn' + (mode==='buy'  ? ' buy-active'  : ' dimmed');
  $('btnSell').className = 'mode-btn' + (mode==='sell' ? ' sell-active' : ' dimmed');

  // fields
  mode==='buy' ? sh('buyFields') : hi('buyFields');
  mode==='sell'? sh('sellFields'): hi('sellFields');

  // rate
  const rate = mode==='buy' ? CFG.BUY_RATE : CFG.SELL_RATE;
  $('rateLbl').textContent = '1 دولار أمريكي =';
  $('rateVal').textContent = `${rate.toLocaleString('en')} د.ع`;

  // button 1
  $('btn1').className   = `btn ${mode==='buy'?'btn-buy':'btn-sell'}`;
  $('btn1').textContent = 'مراجعة وتأكيد الطلب ←';

  // hide later steps
  hi('revealSection'); hi('successSection');
  cls('formCard', false, 'dimmed');
  $('formBadge').textContent = '1';
  cls('formBadge', false, 'done');

  sh('cardsCol', 'flex');
  $('cardsCol').style.flexDirection = 'column';

  updateTermsBadge();
  validate();
}

/* ══════════════════════════════════════════════════════════
   CALCULATION
══════════════════════════════════════════════════════════ */
function calcBuy() {
  const iqd = parseFloat($('buyIQD').value) || 0;
  $('buyUSD').textContent = iqd > 0 ? fmtUSD(iqd / CFG.BUY_RATE) : '— دولار أمريكي';
  validate();
}

function calcSell() {
  const usd = parseFloat($('sellUSDC').value) || 0;
  $('sellIQD').textContent = usd > 0 ? fmtIQD(Math.floor(usd * CFG.SELL_RATE)) : '— د.ع';
  validate();
}

/* ══════════════════════════════════════════════════════════
   VALIDATION
══════════════════════════════════════════════════════════ */
function validate() {
  const btn = $('btn1');
  if (!btn || !S.mode) return;
  if (!isTermsOk()) { btn.disabled = true; return; }

  let ok = false;
  if (S.mode === 'buy') {
    const iqd    = parseFloat($('buyIQD')?.value)    || 0;
    const wallet = $('buyWallet')?.value.trim()       || '';
    ok = iqd >= CFG.MIN_IQD && iqd <= CFG.MAX_IQD
      && wallet.startsWith('0x') && wallet.length >= 42
      && S.method !== null;
  } else {
    const minU  = CFG.MIN_IQD / CFG.SELL_RATE;
    const maxU  = CFG.MAX_IQD / CFG.SELL_RATE;
    const usd   = parseFloat($('sellUSDC')?.value)   || 0;
    const name  = $('sellName')?.value.trim()         || '';
    const phone = $('sellPhone')?.value.trim()        || '';
    const proof = $('sellProofWallet')?.value.trim()  || '';
    ok = usd >= minU && usd <= maxU
      && name.length >= 3
      && /^07\d{9}$/.test(phone)
      && proof.startsWith('0x') && proof.length >= 42
      && S.method !== null;
  }
  btn.disabled = !ok;
}

function pickMethod(mode, m) {
  if (S.mode !== mode) return;
  S.method = m;
  if (mode === 'buy') {
    cls('optZainB',  m==='zain',  'sel');
    cls('optSuperB', m==='super', 'sel');
  } else {
    cls('optZainS',  m==='zain',  'sel');
    cls('optSuperS', m==='super', 'sel');
  }
  validate();
}

/* ══════════════════════════════════════════════════════════
   CONFIRMATION OVERLAY (Button 1)
══════════════════════════════════════════════════════════ */
function openConfirm() {
  const rows = $('covRows');
  rows.innerHTML = '';

  const addRow = (lbl, val, mono=false) => {
    const r = document.createElement('div');
    r.className = 'cov-row';
    r.innerHTML = `<div class="cov-lbl">${lbl}</div>
                   <div class="cov-val${mono?' mono':''}">${val}</div>`;
    rows.appendChild(r);
  };

  if (S.mode === 'buy') {
    const iqd    = parseFloat($('buyIQD').value);
    const usd    = (iqd / CFG.BUY_RATE).toFixed(2);
    const wallet = $('buyWallet').value.trim();
    const method = S.method === 'zain' ? 'زين كاش 📱' : 'سوبر كي 💳';
    const note   = $('buyNote').value.trim() || '—';
    $('covIco').textContent = '💵';
    addRow('نوع العملية', '🟢 شراء دولار أمريكي');
    addRow('المبلغ بالدينار', fmtIQD(iqd));
    addRow('ستستلم تقريباً', usd + ' دولار أمريكي');
    addRow('عنوان محفظتك', wallet, true);
    addRow('طريقة الإرسال', method);
    addRow('ملاحظة', note);
  } else {
    const usd   = parseFloat($('sellUSDC').value);
    const iqd   = Math.floor(usd * CFG.SELL_RATE);
    const name  = $('sellName').value.trim();
    const phone = $('sellPhone').value.trim();
    const proof = $('sellProofWallet').value.trim();
    const method= S.method === 'zain' ? 'زين كاش 📱' : 'سوبر كي 💳';
    const note  = $('sellNote').value.trim() || '—';
    $('covIco').textContent = '🏦';
    addRow('نوع العملية', '🔴 بيع دولار أمريكي');
    addRow('المبلغ بالدولار', usd + ' دولار أمريكي');
    addRow('ستستلم تقريباً', fmtIQD(iqd));
    addRow('اسمك الكامل', name);
    addRow('رقم هاتفك', phone, true);
    addRow('عنوان محفظتك (إثبات)', proof, true);
    addRow('طريقة الاستلام', method);
    addRow('ملاحظة', note);
  }

  cls('confirmOverlay', false, 'hidden');
  document.body.style.overflow = 'hidden';
}

function closeConfirm() {
  cls('confirmOverlay', true, 'hidden');
  document.body.style.overflow = '';
}

/* ══════════════════════════════════════════════════════════
   CONFIRM SEND → reveal data + send email
══════════════════════════════════════════════════════════ */
async function confirmSend() {
  const btn = $('covSendBtn');
  btn.disabled  = true;
  btn.innerHTML = 'جاري الإرسال… <span class="spin"></span>';

  // جمع البيانات للبريد
  const now  = new Date().toLocaleString('ar-IQ', { dateStyle:'short', timeStyle:'short', timeZone:'Asia/Baghdad' });
  const note = S.mode==='buy' ? ($('buyNote').value.trim()||'—') : ($('sellNote').value.trim()||'—');
  let params = { time: now, note, type: '' };

  if (S.mode === 'buy') {
    const iqd    = parseFloat($('buyIQD').value);
    const usd    = (iqd / CFG.BUY_RATE).toFixed(2);
    const wallet = $('buyWallet').value.trim();
    const method = S.method==='zain' ? 'زين كاش' : 'سوبر كي';
    params = { ...params,
      type:       '🟢 شراء دولار أمريكي',
      amount_iqd: `${Number(iqd).toLocaleString('en')} د.ع`,
      amount_usd: `${usd} دولار أمريكي`,
      wallet,
      phone:      '—',
      sell_name:  '—',
      proof_wallet:'—',
      method,
    };
  } else {
    const usd   = parseFloat($('sellUSDC').value);
    const iqd   = Math.floor(usd * CFG.SELL_RATE);
    const name  = $('sellName').value.trim();
    const phone = $('sellPhone').value.trim();
    const proof = $('sellProofWallet').value.trim();
    const method= S.method==='zain' ? 'زين كاش' : 'سوبر كي';
    params = { ...params,
      type:        '🔴 بيع دولار أمريكي',
      amount_iqd:  `${Number(iqd).toLocaleString('en')} د.ع`,
      amount_usd:  `${usd} دولار أمريكي`,
      wallet:      CFG.KANBA_WALLET,
      phone,
      sell_name:   name,
      proof_wallet: proof,
      method,
    };
  }

  const ok = await sendEmail(params);
  closeConfirm();

  if (ok) {
    revealPaymentInfo();
  } else {
    btn.disabled = false;
    btn.textContent = '⚠️ فشل — حاول مجدداً';
    cls('confirmOverlay', true, 'hidden');
    document.body.style.overflow = '';
  }
}

/* ══════════════════════════════════════════════════════════
   REVEAL PAYMENT INFO + TIMER
══════════════════════════════════════════════════════════ */
function revealPaymentInfo() {
  // تعتيم فورم
  cls('formCard', true, 'dimmed');
  $('formBadge').textContent = '✓';
  cls('formBadge', true, 'done');

  // ملء البيانات
  $('revName').textContent = CFG.KANBA_NAME;

  if (S.mode === 'buy') {
    const iqd    = parseFloat($('buyIQD').value);
    const method = S.method==='zain' ? 'زين كاش 📱' : 'سوبر كي 💳';
    $('revIco').textContent        = '💵';
    $('revTitle').textContent      = 'أرسل الدينار إلى';
    $('revSub').textContent        = 'انسخ الرقم وأرسل المبلغ';
    $('revContactLbl').textContent = 'رقم استلام الدينار';
    $('revContact').textContent    = CFG.KANBA_PHONE;
    $('revSecret').textContent     = CFG.KANBA_SECRET;
    $('revAmountLbl').textContent  = 'المبلغ المطلوب';
    $('revAmount').textContent     = fmtIQD(iqd);
    $('revMethod').textContent     = method;
    sh('rowSecret'); sh('rowMethod'); hi('rowNetwork');
  } else {
    const usd  = parseFloat($('sellUSDC').value);
    $('revIco').textContent        = '🔐';
    $('revTitle').textContent      = 'أرسل الدولار إلى محفظة كانبا';
    $('revSub').textContent        = 'على شبكة Arbitrum One فقط';
    $('revContactLbl').textContent = 'عنوان المحفظة';
    $('revContact').textContent    = CFG.KANBA_WALLET;
    $('revAmountLbl').textContent  = 'المبلغ المطلوب';
    $('revAmount').textContent     = usd + ' دولار أمريكي';
    hi('rowSecret'); hi('rowMethod'); sh('rowNetwork');
  }

  sh('revealSection');
  setTimeout(() => $('revealCard')?.scrollIntoView({ behavior:'smooth', block:'center' }), 120);

  // تشغيل المؤقت
  startRevealTimer();
}

function startRevealTimer() {
  S.revealStart = Date.now();
  const totalSecs = CFG.REVEAL_SECS;

  function tick() {
    const elapsed = Math.floor((Date.now() - S.revealStart) / 1000);
    const left    = totalSecs - elapsed;

    if (left <= 0) {
      clearInterval(S.revealTimer);
      wipeReveal();
      return;
    }

    const m = String(Math.floor(left / 60)).padStart(2, '0');
    const s = String(left % 60).padStart(2, '0');
    const tv = $('timerVal');
    if (tv) tv.textContent = `${m}:${s}`;

    // لون أحمر آخر دقيقة
    const tb = $('timerBar');
    if (tb) tb.style.borderColor = left <= 60 ? 'var(--sell-brd)' : '';
    if (tv) tv.style.color = left <= 60 ? 'var(--sell)' : '';
  }

  tick();
  S.revealTimer = setInterval(tick, 1000);
}

function wipeReveal() {
  // محو بياناتي من DOM تماماً
  ['revName','revContact','revSecret'].forEach(id => {
    const e = $(id);
    if (e) e.textContent = '🔒 انتهت مدة العرض';
  });
  const rb = $('timerBar');
  if (rb) rb.innerHTML = '<span style="color:var(--sell)">🔒 انتهت صلاحية عرض البيانات — تواصل معنا مباشرة</span>';

  // منع النسخ
  document.querySelectorAll('.btn-copy').forEach(b => b.disabled = true);
}

/* ══════════════════════════════════════════════════════════
   BUTTON 2 — تم الإرسال (فقط إشعار للمستخدم)
══════════════════════════════════════════════════════════ */
function step2() {
  clearInterval(S.revealTimer);
  wipeReveal();
  cls('revealCard', true, 'dimmed');
  sh('successSection');
  setTimeout(() => $('successSection')?.scrollIntoView({ behavior:'smooth', block:'center' }), 100);
}

/* ══════════════════════════════════════════════════════════
   EMAIL — EmailJS REST API
   ─────────────────────────────────────────────────────────
   إعداد سريع:
   1. emailjs.com → أنشئ حساباً
   2. Email Services → Add Service → Gmail/SMTP
   3. Email Templates → أنشئ template بالمتغيرات:
        {{type}} {{amount_iqd}} {{amount_usd}} {{wallet}}
        {{phone}} {{sell_name}} {{proof_wallet}} {{method}}
        {{note}} {{time}}
      To Email = me@kanba.pw
   4. Account → API Keys → Public Key
   5. ضع الثلاثة في CFG أعلاه
══════════════════════════════════════════════════════════ */
async function sendEmail(params) {
  if (CFG.EJ_PUBLIC_KEY === 'YOUR_PUBLIC_KEY') {
    console.warn('[Kanba] EmailJS not configured — skipping email in dev mode');
    return true;
  }
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:      CFG.EJ_SERVICE_ID,
        template_id:     CFG.EJ_TEMPLATE_ID,
        user_id:         CFG.EJ_PUBLIC_KEY,
        template_params: params,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('[Kanba] Email error:', e);
    return false;
  }
}

/* ══════════════════════════════════════════════════════════
   COPY
══════════════════════════════════════════════════════════ */
function copyEl(id, btn) {
  const text = $(id)?.textContent?.trim();
  if (!text || text.includes('🔒')) return;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✅ تم';
    btn.classList.add('ok');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('ok'); }, 2000);
  }).catch(() => {
    const ta = Object.assign(document.createElement('textarea'),
      { value: text, style: 'position:fixed;opacity:0' });
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  });
}

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  $('rBuy').textContent  = CFG.BUY_RATE.toLocaleString('en');
  $('rSell').textContent = CFG.SELL_RATE.toLocaleString('en');

  // حدود بيع ديناميكية
  const minU = (CFG.MIN_IQD / CFG.SELL_RATE).toFixed(0);
  const maxU = (CFG.MAX_IQD / CFG.SELL_RATE).toFixed(0);
  if ($('sellMinLbl')) $('sellMinLbl').textContent = `أدنى: ${minU} دولار`;
  if ($('sellMaxLbl')) $('sellMaxLbl').textContent = `أقصى: ${maxU} دولار`;

  checkIP();

  window.addEventListener('focus', updateTermsBadge);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateTermsBadge();
  });

  updateTermsBadge();
});
