/* ═══════════════════════════════════════════════════════════
   pay.js v4 — Kanba Exchange — FINAL
   ✅ FormSubmit → me@kanba.pw  (مجاني 100% بلا حساب)
   ✅ أرقام إنجليزية في كل مكان
   ✅ Overlay تأكيد fullscreen
   ✅ كشف بيانات مؤقت (30 دقيقة)
   ✅ Buy / Sell flow كامل ومصحح
   ✅ تحقق صارم من الحقول
═══════════════════════════════════════════════════════════ */

/* ╔══════════════════════════════════════════════════════════╗
   ║  ⚙️  CONFIG — عدّل هذه القيم فقط                        ║
   ╚══════════════════════════════════════════════════════════╝ */
const CFG = {
  BUY_RATE:     1600,          // IQD لكل دولار عند الشراء
  SELL_RATE:    1500,          // IQD لكل دولار عند البيع
  MIN_IQD:      15_000,
  MAX_IQD:      1_000_000,

  KANBA_NAME:   'حيدر كاظم',
  KANBA_PHONE:  '7847859054',
  KANBA_SECRET: '3987',        // رقم سري للتأكيد — يُذكر عند التواصل
  KANBA_WALLET: '0x121B845Cb550dD5B01B9eAc5BD65f79d84c6Ee99',

  REVEAL_SECS:  30 * 60,       // ثواني قبل مسح بياناتك

  // FormSubmit — لا يحتاج حساباً
  // أول إرسال سيصلك تأكيد على me@kanba.pw — اقبله مرة واحدة فقط
  EMAIL: 'me@kanba.pw',

  TERMS_KEY: 'kanba_terms_v1',
};

/* ╔══════════════════════════════════════════════════════════╗
   ║  State                                                   ║
   ╚══════════════════════════════════════════════════════════╝ */
const S = {
  mode:        null,   // 'buy' | 'sell'
  method:      null,   // 'zain' | 'super'
  revealTimer: null,
  revealStart: null,
  sending:     false,
};

/* ╔══════════════════════════════════════════════════════════╗
   ║  DOM Helpers                                             ║
   ╚══════════════════════════════════════════════════════════╝ */
const $    = id => document.getElementById(id);
const show = id => { const e=$(id); if(e) e.style.display=''; };
const hide = id => { const e=$(id); if(e) e.style.display='none'; };
const cls  = (id, add, ...c) => $(id)?.classList[add?'add':'remove'](...c);

/* ╔══════════════════════════════════════════════════════════╗
   ║  Formatters — English numerals only                      ║
   ╚══════════════════════════════════════════════════════════╝ */
const enN   = n => Number(n).toLocaleString('en-US');          // 30,000
const enIQD = n => enN(n) + ' IQD';                            // 30,000 IQD
const enUSD = n => (+n).toFixed(2) + ' USD';                   // 20.00 USD
const arIQD = n => Number(n).toLocaleString('ar-IQ') + ' د.ع';// للعرض فقط
const arUSD = n => (+n).toFixed(2) + ' دولار أمريكي';

const enTime = () => {
  const d = new Date();
  return d.toLocaleString('en-GB', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit',
    hour12: true, timeZone: 'Asia/Baghdad',
  }) + ' (Iraq/Baghdad)';
};

/* ╔══════════════════════════════════════════════════════════╗
   ║  IP Check — Iraq only                                    ║
   ╚══════════════════════════════════════════════════════════╝ */
async function checkIP() {
  try {
    let country = null;
    try {
      const ctl = typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(5000) : undefined;
      const r   = await fetch('https://api.country.is/', { signal: ctl });
      country   = (await r.json()).country;
    } catch {
      const r2 = await fetch('https://ipapi.co/country/');
      country   = (await r2.text()).trim();
    }
    if (country && country !== 'IQ') {
      cls('ipOverlay', false, 'hidden');
      cls('mainPage',  true,  'hidden');
    }
  } catch { /* network error → proceed */ }
}

/* ╔══════════════════════════════════════════════════════════╗
   ║  Terms & Conditions                                      ║
   ╚══════════════════════════════════════════════════════════╝ */
const isTermsOk = () => !!localStorage.getItem(CFG.TERMS_KEY);

function updateTermsBadge() {
  const ok = isTermsOk();
  const b  = $('tBadge');
  if (!b) return;
  b.textContent = ok ? 'موافَق ✓' : 'غير موافَق';
  b.className   = ok ? 't-badge ok' : 't-badge pend';
  validate();
}

function watchTerms() {
  const cb = () => {
    updateTermsBadge();
    window.removeEventListener('focus', cb);
  };
  window.addEventListener('focus', cb);
}

/* ╔══════════════════════════════════════════════════════════╗
   ║  Mode Selection                                          ║
   ╚══════════════════════════════════════════════════════════╝ */
function setMode(mode) {
  S.mode   = mode;
  S.method = null;

  // mode buttons
  $('btnBuy').className  = 'mode-btn' + (mode==='buy'  ? ' buy-active'  : ' dimmed');
  $('btnSell').className = 'mode-btn' + (mode==='sell' ? ' sell-active' : ' dimmed');

  // show/hide field groups
  mode==='buy' ? show('buyFields') : hide('buyFields');
  mode==='sell'? show('sellFields'): hide('sellFields');

  // rate display
  const rate = mode==='buy' ? CFG.BUY_RATE : CFG.SELL_RATE;
  $('rateLbl').textContent = '1 دولار أمريكي =';
  $('rateVal').textContent = enN(rate) + ' د.ع';

  // btn1
  const b1 = $('btn1');
  b1.className   = 'btn ' + (mode==='buy' ? 'btn-buy' : 'btn-sell');
  b1.textContent = 'مراجعة وتأكيد الطلب ←';
  b1.disabled    = true;

  // payment method badges reset
  ['optZainB','optSuperB','optZainS','optSuperS'].forEach(id => cls(id, false, 'sel'));

  // reset later steps
  hide('revealSection');
  hide('successSection');
  cls('formCard', false, 'dimmed');
  const fb = $('formBadge');
  if (fb) { fb.textContent='1'; fb.className='step-badge gold'; }

  const cc = $('cardsCol');
  if (cc) { cc.style.display='flex'; cc.style.flexDirection='column'; }

  updateTermsBadge();
}

/* ╔══════════════════════════════════════════════════════════╗
   ║  Payment Method Picker                                   ║
   ╚══════════════════════════════════════════════════════════╝ */
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

/* ╔══════════════════════════════════════════════════════════╗
   ║  Live Calculators                                        ║
   ╚══════════════════════════════════════════════════════════╝ */
function calcBuy() {
  const iqd  = parseFloat($('buyIQD').value) || 0;
  const disp = iqd > 0 ? arUSD(iqd / CFG.BUY_RATE) : '— دولار أمريكي';
  $('buyUSD').textContent = disp;
  validate();
}

function calcSell() {
  const usd  = parseFloat($('sellUSDC').value) || 0;
  const disp = usd > 0 ? arIQD(Math.floor(usd * CFG.SELL_RATE)) : '— د.ع';
  $('sellIQD').textContent = disp;
  validate();
}

/* ╔══════════════════════════════════════════════════════════╗
   ║  Validation                                              ║
   ╚══════════════════════════════════════════════════════════╝ */
function validate() {
  const btn = $('btn1');
  if (!btn || !S.mode) return;

  if (!isTermsOk()) { btn.disabled = true; return; }

  let ok = false;

  if (S.mode === 'buy') {
    const iqd    = parseFloat($('buyIQD')?.value)  || 0;
    const wallet = ($('buyWallet')?.value || '').trim();
    ok = iqd >= CFG.MIN_IQD
      && iqd <= CFG.MAX_IQD
      && /^0x[0-9a-fA-F]{40,}$/.test(wallet)
      && S.method !== null;
  } else {
    const minU  = CFG.MIN_IQD / CFG.SELL_RATE;
    const maxU  = CFG.MAX_IQD / CFG.SELL_RATE;
    const usd   = parseFloat($('sellUSDC')?.value) || 0;
    const name  = ($('sellName')?.value   || '').trim();
    const phone = ($('sellPhone')?.value  || '').trim();
    const proof = ($('sellProofWallet')?.value || '').trim();
    ok = usd >= minU
      && usd <= maxU
      && name.length >= 3
      && /^07\d{9}$/.test(phone)
      && /^0x[0-9a-fA-F]{40,}$/.test(proof)
      && S.method !== null;
  }

  btn.disabled = !ok;
}

/* ╔══════════════════════════════════════════════════════════╗
   ║  Confirmation Overlay — Button 1                         ║
   ╚══════════════════════════════════════════════════════════╝ */
function openConfirm() {
  const rows = $('covRows');
  if (!rows) return;
  rows.innerHTML = '';

  const row = (lbl, val, mono=false) => {
    const d = document.createElement('div');
    d.className = 'cov-row';
    d.innerHTML = `<div class="cov-lbl">${lbl}</div>
                   <div class="cov-val${mono?' mono':''}">${escHtml(String(val))}</div>`;
    rows.appendChild(d);
  };

  if (S.mode === 'buy') {
    const iqd    = parseFloat($('buyIQD').value);
    const usd    = (iqd / CFG.BUY_RATE).toFixed(2);
    const wallet = $('buyWallet').value.trim();
    const method = S.method==='zain' ? 'زين كاش 📱' : 'سوبر كي 💳';
    const note   = $('buyNote').value.trim() || '—';
    $('covIco').textContent = '💵';
    row('نوع العملية',    '🟢 شراء دولار أمريكي');
    row('المبلغ بالدينار', arIQD(iqd));
    row('ستستلم تقريباً', usd + ' دولار أمريكي');
    row('عنوان محفظتك',  wallet, true);
    row('طريقة الإرسال', method);
    if (note !== '—') row('ملاحظة', note);
  } else {
    const usd   = parseFloat($('sellUSDC').value);
    const iqd   = Math.floor(usd * CFG.SELL_RATE);
    const name  = $('sellName').value.trim();
    const phone = $('sellPhone').value.trim();
    const proof = $('sellProofWallet').value.trim();
    const method= S.method==='zain' ? 'زين كاش 📱' : 'سوبر كي 💳';
    const note  = $('sellNote').value.trim() || '—';
    $('covIco').textContent = '🏦';
    row('نوع العملية',    '🔴 بيع دولار أمريكي');
    row('المبلغ بالدولار', usd + ' دولار أمريكي');
    row('ستستلم تقريباً', arIQD(iqd));
    row('اسمك الكامل',   name);
    row('رقم هاتفك',     phone, true);
    row('محفظة الإثبات', proof, true);
    row('طريقة الاستلام',method);
    if (note !== '—') row('ملاحظة', note);
  }

  cls('confirmOverlay', false, 'hidden');
  document.body.style.overflow = 'hidden';
}

function closeConfirm() {
  cls('confirmOverlay', true, 'hidden');
  document.body.style.overflow = '';
  // reset send button
  const b = $('covSendBtn');
  if (b) { b.disabled=false; b.textContent='إرسال الطلب الآن ✓'; }
}

/* ╔══════════════════════════════════════════════════════════╗
   ║  Confirm → Send Email → Reveal                           ║
   ╚══════════════════════════════════════════════════════════╝ */
async function confirmSend() {
  if (S.sending) return;
  S.sending = true;

  const btn = $('covSendBtn');
  btn.disabled  = true;
  btn.innerHTML = 'جاري الإرسال… <span class="spin"></span>';

  // ── Build email body ──────────────────────────────────
  let subject, body;
  const time = enTime();

  if (S.mode === 'buy') {
    const iqd    = parseFloat($('buyIQD').value);
    const usd    = parseFloat((iqd / CFG.BUY_RATE).toFixed(2));
    const wallet = $('buyWallet').value.trim();
    const method = S.method==='zain' ? 'ZainCash' : 'SuperKey';
    const note   = $('buyNote').value.trim() || 'None';

    subject = `[Kanba BUY] ${enUSD(usd)} — ${enIQD(iqd)}`;
    body    = buildEmailBody({
      type:    'BUY — شراء دولار أمريكي 🟢',
      iqd:     enIQD(iqd),
      usd:     enUSD(usd),
      rate:    enN(CFG.BUY_RATE) + ' IQD/USD',
      method,
      wallet,
      phone:   '—',
      name:    '—',
      proof:   '—',
      note,
      time,
    });
  } else {
    const usd   = parseFloat($('sellUSDC').value);
    const iqd   = Math.floor(usd * CFG.SELL_RATE);
    const name  = $('sellName').value.trim();
    const phone = $('sellPhone').value.trim();
    const proof = $('sellProofWallet').value.trim();
    const method= S.method==='zain' ? 'ZainCash' : 'SuperKey';
    const note  = $('sellNote').value.trim() || 'None';

    subject = `[Kanba SELL] ${enUSD(usd)} — ${enIQD(iqd)}`;
    body    = buildEmailBody({
      type:   'SELL — بيع دولار أمريكي 🔴',
      iqd:    enIQD(iqd),
      usd:    enUSD(usd),
      rate:   enN(CFG.SELL_RATE) + ' IQD/USD',
      method,
      wallet: CFG.KANBA_WALLET,
      phone,
      name,
      proof,
      note,
      time,
    });
  }

  const ok = await sendViaFormSubmit(subject, body);
  S.sending = false;
  closeConfirm();

  if (ok) {
    revealPaymentInfo();
  } else {
    // خطأ → أعد الزر
    btn.disabled  = false;
    btn.textContent = '⚠️ فشل الإرسال — حاول مجدداً';
    cls('confirmOverlay', false, 'hidden'); // أبقِ الـ overlay مفتوحاً
    document.body.style.overflow = 'hidden';
    S.sending = false;
  }
}

/* ╔══════════════════════════════════════════════════════════╗
   ║  FormSubmit Sender — Zero config, 100% Free              ║
   ╚══════════════════════════════════════════════════════════╝ */
async function sendViaFormSubmit(subject, message) {
  try {
    const fd = new FormData();
    fd.append('_subject',      subject);
    fd.append('_captcha',      'false');
    fd.append('_template',     'table');
    fd.append('_replyto',      'no-reply@kanba.pw');
    fd.append('message',       message);

    const res = await fetch(`https://formsubmit.co/${CFG.EMAIL}`, {
      method: 'POST',
      body:   fd,
    });

    // FormSubmit يعيد HTML في أول طلب — نعتبره نجاحاً
    return res.ok || res.status === 200;
  } catch (err) {
    console.error('[Kanba] FormSubmit error:', err);
    return false;
  }
}

/* ╔══════════════════════════════════════════════════════════╗
   ║  Email Body Builder — plain text, clean                  ║
   ╚══════════════════════════════════════════════════════════╝ */
function buildEmailBody({ type, iqd, usd, rate, method, wallet, phone, name, proof, note, time }) {
  return [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'KANBA EXCHANGE — New Order',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `Type          : ${type}`,
    `Time          : ${time}`,
    '',
    '── AMOUNTS ─────────────────────────',
    `Iraqi Dinar   : ${iqd}`,
    `US Dollar     : ${usd}`,
    `Exchange Rate : ${rate}`,
    '',
    '── PAYMENT ─────────────────────────',
    `Method        : ${method}`,
    `Wallet        : ${wallet}`,
    `Phone         : ${phone}`,
    `Full Name     : ${name}`,
    `Proof Wallet  : ${proof}`,
    '',
    '── NOTE ────────────────────────────',
    `Note          : ${note}`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'kanba.pw — Iraq P2P Exchange',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

/* ╔══════════════════════════════════════════════════════════╗
   ║  Reveal Payment Info + Timer                             ║
   ╚══════════════════════════════════════════════════════════╝ */
function revealPaymentInfo() {
  // تعتيم فورم
  cls('formCard', true, 'dimmed');
  const fb = $('formBadge');
  if (fb) { fb.textContent='✓'; fb.className='step-badge done'; }

  // ملء البيانات
  if ($('revName')) $('revName').textContent = CFG.KANBA_NAME;

  if (S.mode === 'buy') {
    const iqd    = parseFloat($('buyIQD').value);
    const method = S.method==='zain' ? 'زين كاش 📱' : 'سوبر كي 💳';
    set('revIco',        '💵');
    set('revTitle',      'أرسل الدينار إلى');
    set('revSub',        'انسخ الرقم وأرسل المبلغ عبر الطريقة المختارة');
    set('revContactLbl', 'رقم استلام الدينار');
    set('revContact',    CFG.KANBA_PHONE);
    set('revSecret',     CFG.KANBA_SECRET);
    set('revAmountLbl',  'المبلغ المطلوب');
    set('revAmount',     arIQD(iqd));
    set('revMethod',     method);
    show('rowSecret'); show('rowMethod'); hide('rowNetwork');
  } else {
    const usd = parseFloat($('sellUSDC').value);
    set('revIco',        '🔐');
    set('revTitle',      'أرسل الدولار إلى محفظة كانبا');
    set('revSub',        '⚠️ على شبكة Arbitrum One فقط');
    set('revContactLbl', 'عنوان المحفظة');
    set('revContact',    CFG.KANBA_WALLET);
    set('revAmountLbl',  'المبلغ المطلوب');
    set('revAmount',     usd + ' دولار أمريكي');
    hide('rowSecret'); hide('rowMethod'); show('rowNetwork');
  }

  show('revealSection');
  setTimeout(() => $('revealCard')?.scrollIntoView({ behavior:'smooth', block:'center' }), 150);

  startRevealTimer();
}

const set = (id, txt) => { const e=$(id); if(e) e.textContent=txt; };

/* ╔══════════════════════════════════════════════════════════╗
   ║  Countdown Timer                                         ║
   ╚══════════════════════════════════════════════════════════╝ */
function startRevealTimer() {
  if (S.revealTimer) clearInterval(S.revealTimer);
  S.revealStart = Date.now();

  const tick = () => {
    const left = CFG.REVEAL_SECS - Math.floor((Date.now() - S.revealStart) / 1000);
    if (left <= 0) { clearInterval(S.revealTimer); wipeReveal(); return; }

    const mm  = String(Math.floor(left / 60)).padStart(2, '0');
    const ss  = String(left % 60).padStart(2, '0');
    const tv  = $('timerVal');
    const tb  = $('timerBar');
    const red = left <= 60;
    if (tv) { tv.textContent = `${mm}:${ss}`; tv.style.color = red ? 'var(--sell)' : ''; }
    if (tb) tb.style.borderColor = red ? 'var(--sell-brd)' : '';
  };

  tick();
  S.revealTimer = setInterval(tick, 1000);
}

function wipeReveal() {
  clearInterval(S.revealTimer);
  ['revName','revContact','revSecret'].forEach(id => set(id, '🔒 انتهت مدة العرض'));
  const tb = $('timerBar');
  if (tb) {
    tb.style.cssText = 'border-color:var(--sell-brd);color:var(--sell)';
    tb.innerHTML = '<span>🔒 انتهت صلاحية عرض البيانات — تواصل معنا مباشرة</span>';
  }
  document.querySelectorAll('.btn-copy').forEach(b => b.disabled = true);
}

/* ╔══════════════════════════════════════════════════════════╗
   ║  Button 2 — Done                                         ║
   ╚══════════════════════════════════════════════════════════╝ */
function step2() {
  wipeReveal();
  cls('revealCard', true, 'dimmed');
  show('successSection');
  setTimeout(() => $('successSection')?.scrollIntoView({ behavior:'smooth', block:'center' }), 120);
}

/* ╔══════════════════════════════════════════════════════════╗
   ║  Copy to Clipboard                                       ║
   ╚══════════════════════════════════════════════════════════╝ */
function copyEl(id, btn) {
  const text = $(id)?.textContent?.trim() || '';
  if (!text || text.includes('🔒')) return;

  const done = () => {
    const orig = btn.textContent;
    btn.textContent = '✅ تم النسخ';
    btn.classList.add('ok');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('ok'); }, 2000);
  };

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  Object.assign(ta.style, { position:'fixed', top:'0', left:'0', opacity:'0' });
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); cb(); } catch {}
  document.body.removeChild(ta);
}

/* ╔══════════════════════════════════════════════════════════╗
   ║  Escape HTML                                             ║
   ╚══════════════════════════════════════════════════════════╝ */
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ╔══════════════════════════════════════════════════════════╗
   ║  Init                                                    ║
   ╚══════════════════════════════════════════════════════════╝ */
document.addEventListener('DOMContentLoaded', () => {

  // أسعار الهيدر
  set('rBuy',  enN(CFG.BUY_RATE));
  set('rSell', enN(CFG.SELL_RATE));

  // حدود البيع ديناميكية
  const minU = Math.ceil(CFG.MIN_IQD / CFG.SELL_RATE);
  const maxU = Math.floor(CFG.MAX_IQD / CFG.SELL_RATE);
  set('sellMinLbl', `أدنى: ${enN(minU)} دولار`);
  set('sellMaxLbl', `أقصى: ${enN(maxU)} دولار`);

  // input listeners
  $('buyIQD')?.addEventListener('input', calcBuy);
  $('buyWallet')?.addEventListener('input', validate);
  $('sellUSDC')?.addEventListener('input', calcSell);
  $('sellName')?.addEventListener('input', validate);
  $('sellPhone')?.addEventListener('input', validate);
  $('sellProofWallet')?.addEventListener('input', validate);

  // IP + T&C
  checkIP();
  updateTermsBadge();

  window.addEventListener('focus', updateTermsBadge);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateTermsBadge();
  });

  // ESC يغلق الـ overlay
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeConfirm();
  });

  // النقر خارج panel يغلقه
  $('confirmOverlay')?.addEventListener('click', e => {
    if (e.target === $('confirmOverlay')) closeConfirm();
  });
});
