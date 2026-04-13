/* ═══════════════════════════════════════════════════════════
   pay.js v5 — Kanba Exchange — FINAL CLEAN
   ✅ FormSubmit → me@kanba.pw  (100% مجاني، بلا حساب)
   ✅ Mode buttons NEVER disabled — always switchable
   ✅ Phone: 07XXXXXXXXX OR 7XXXXXXXXX (both accepted)
   ✅ Full name in BOTH buy & sell
   ✅ All EN numerals in email
   ✅ Fullscreen stacked confirm overlay
   ✅ Timed data reveal (30 min countdown)
   ✅ Desktop two-column aware
═══════════════════════════════════════════════════════════ */

/* ╔══════════════════════════════════════════╗
   ║  ⚙️  CONFIG                              ║
   ╚══════════════════════════════════════════╝ */
const CFG = {
  BUY_RATE:     1600,
  SELL_RATE:    1500,
  MIN_IQD:      15_000,
  MAX_IQD:      1_000_000,

  KANBA_NAME:   'حيدر كاظم',
  KANBA_PHONE:  '7847859054',
  KANBA_SECRET: '3987',
  KANBA_WALLET: '0x121B845Cb550dD5B01B9eAc5BD65f79d84c6Ee99',

  REVEAL_SECS:  30 * 60,   // 30 minutes countdown

  // FormSubmit — no account needed. First submission triggers
  // a one-time confirmation email to activate. Accept it once.
  EMAIL: 'me@kanba.pw',

  TERMS_KEY: 'kanba_terms_v1',
};

/* ╔══════════════════════════════════════════╗
   ║  State                                   ║
   ╚══════════════════════════════════════════╝ */
const S = {
  mode:        null,
  method:      null,
  revealTimer: null,
  revealStart: null,
  sending:     false,
};

/* ╔══════════════════════════════════════════╗
   ║  DOM Helpers                             ║
   ╚══════════════════════════════════════════╝ */
const $    = id => document.getElementById(id);
const show = id => { const e = $(id); if (e) e.style.display = ''; };
const hide = id => { const e = $(id); if (e) e.style.display = 'none'; };
const addC = (id, ...c) => $(id)?.classList.add(...c);
const remC = (id, ...c) => $(id)?.classList.remove(...c);
const setT = (id, t)   => { const e = $(id); if (e) e.textContent = t; };
const togC = (id, add, ...c) => $(id)?.classList[add ? 'add' : 'remove'](...c);

/* ╔══════════════════════════════════════════╗
   ║  Formatters — EN numerals only           ║
   ╚══════════════════════════════════════════╝ */
const enN   = n  => Number(n).toLocaleString('en-US');
const enIQD = n  => enN(n) + ' IQD';
const enUSD = n  => (+n).toFixed(2) + ' USD';
const arIQD = n  => Number(n).toLocaleString('ar-IQ') + ' د.ع';
const arUSD = n  => (+n).toFixed(2) + ' دولار أمريكي';

const enTime = () => new Date().toLocaleString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: true, timeZone: 'Asia/Baghdad',
}) + ' (Iraq/Baghdad)';

/* ╔══════════════════════════════════════════╗
   ║  Phone validation                        ║
   ║  Accept: 07XXXXXXXXX (11) or             ║
   ║          7XXXXXXXXX  (10)                ║
   ╚══════════════════════════════════════════╝ */
const validPhone = p => /^(07\d{9}|7\d{9})$/.test(p.trim());

/* normalize to 07XXXXXXXXX for email */
const normPhone = p => {
  const t = p.trim();
  return t.startsWith('7') && t.length === 10 ? '0' + t : t;
};

/* ╔══════════════════════════════════════════╗
   ║  IP Check — Iraq only                    ║
   ╚══════════════════════════════════════════╝ */
async function checkIP() {
  try {
    let country = null;
    try {
      const ctl = typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(5000) : undefined;
      country = (await (await fetch('https://api.country.is/', { signal: ctl })).json()).country;
    } catch {
      country = (await (await fetch('https://ipapi.co/country/')).text()).trim();
    }
    if (country && country !== 'IQ') {
      remC('ipOverlay', 'hidden');
      addC('mainPage', 'hidden');
    }
  } catch { /* network fail → allow */ }
}

/* ╔══════════════════════════════════════════╗
   ║  Terms                                   ║
   ╚══════════════════════════════════════════╝ */
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
  const cb = () => { updateTermsBadge(); window.removeEventListener('focus', cb); };
  window.addEventListener('focus', cb);
}

/* ╔══════════════════════════════════════════╗
   ║  Mode Selection                          ║
   ║  ── Mode buttons are NEVER disabled ──   ║
   ╚══════════════════════════════════════════╝ */
function setMode(mode) {
  S.mode   = mode;
  S.method = null;

  /* Mode button styles — both always clickable */
  $('btnBuy').className  = 'mode-btn' + (mode === 'buy'  ? ' buy-active'  : '');
  $('btnSell').className = 'mode-btn' + (mode === 'sell' ? ' sell-active' : '');

  /* Show correct field group */
  mode === 'buy'  ? show('buyFields')  : hide('buyFields');
  mode === 'sell' ? show('sellFields') : hide('sellFields');

  /* Rate display */
  const rate = mode === 'buy' ? CFG.BUY_RATE : CFG.SELL_RATE;
  setT('rateLbl', '1 دولار أمريكي =');
  setT('rateVal', enN(rate) + ' د.ع');

  /* btn1 style */
  const b1 = $('btn1');
  b1.className   = 'btn ' + (mode === 'buy' ? 'btn-buy' : 'btn-sell');
  b1.textContent = 'مراجعة وتأكيد الطلب ←';
  b1.disabled    = true;

  /* Reset method badges */
  ['optZainB','optSuperB','optZainS','optSuperS'].forEach(id => remC(id, 'sel'));

  /* Reset later steps */
  hide('revealSection');
  hide('successSection');
  remC('formCard', 'dimmed');
  const fb = $('formBadge');
  if (fb) { fb.textContent = '1'; fb.className = 'step-badge gold'; }

  /* Show content columns */
  show('contentLeft');
  show('contentRight');

  /* Reset calc displays */
  setT('buyUSD', '— دولار أمريكي');
  setT('sellIQD', '— د.ع');

  updateTermsBadge();
}

/* ╔══════════════════════════════════════════╗
   ║  Payment Method                          ║
   ╚══════════════════════════════════════════╝ */
function pickMethod(mode, m) {
  if (S.mode !== mode) return;
  S.method = m;
  if (mode === 'buy') {
    togC('optZainB',  m === 'zain',  'sel');
    togC('optSuperB', m === 'super', 'sel');
  } else {
    togC('optZainS',  m === 'zain',  'sel');
    togC('optSuperS', m === 'super', 'sel');
  }
  validate();
}

/* ╔══════════════════════════════════════════╗
   ║  Live Calculators                        ║
   ╚══════════════════════════════════════════╝ */
function calcBuy() {
  const iqd = parseFloat($('buyIQD')?.value) || 0;
  setT('buyUSD', iqd > 0 ? arUSD(iqd / CFG.BUY_RATE) : '— دولار أمريكي');
  validate();
}

function calcSell() {
  const usd = parseFloat($('sellUSDC')?.value) || 0;
  setT('sellIQD', usd > 0 ? arIQD(Math.floor(usd * CFG.SELL_RATE)) : '— د.ع');
  validate();
}

/* ╔══════════════════════════════════════════╗
   ║  Validation                              ║
   ╚══════════════════════════════════════════╝ */
function validate() {
  const btn = $('btn1');
  if (!btn || !S.mode) return;
  if (!isTermsOk()) { btn.disabled = true; return; }

  let ok = false;
  if (S.mode === 'buy') {
    const name   = ($('buyName')?.value   || '').trim();
    const phone  = ($('buyPhone')?.value  || '').trim();
    const iqd    = parseFloat($('buyIQD')?.value) || 0;
    const wallet = ($('buyWallet')?.value || '').trim();
    ok = name.length >= 3
      && validPhone(phone)
      && iqd >= CFG.MIN_IQD && iqd <= CFG.MAX_IQD
      && /^0x[0-9a-fA-F]{40,}$/.test(wallet)
      && S.method !== null;
  } else {
    const name  = ($('sellName')?.value         || '').trim();
    const phone = ($('sellPhone')?.value        || '').trim();
    const usd   = parseFloat($('sellUSDC')?.value) || 0;
    const proof = ($('sellProofWallet')?.value  || '').trim();
    const minU  = CFG.MIN_IQD / CFG.SELL_RATE;
    const maxU  = CFG.MAX_IQD / CFG.SELL_RATE;
    ok = name.length >= 3
      && validPhone(phone)
      && usd >= minU && usd <= maxU
      && /^0x[0-9a-fA-F]{40,}$/.test(proof)
      && S.method !== null;
  }
  btn.disabled = !ok;
}

/* ╔══════════════════════════════════════════╗
   ║  Confirmation Overlay — Button 1         ║
   ╚══════════════════════════════════════════╝ */
function openConfirm() {
  const rows = $('covRows');
  if (!rows) return;
  rows.innerHTML = '';

  const row = (lbl, val, mono = false) => {
    const d = document.createElement('div');
    d.className = 'cov-row';
    d.innerHTML = `<div class="cov-lbl">${esc(lbl)}</div>
                   <div class="cov-val${mono ? ' mono' : ''}">${esc(String(val))}</div>`;
    rows.appendChild(d);
  };

  if (S.mode === 'buy') {
    const name   = $('buyName').value.trim();
    const phone  = normPhone($('buyPhone').value);
    const iqd    = parseFloat($('buyIQD').value);
    const usd    = (iqd / CFG.BUY_RATE).toFixed(2);
    const wallet = $('buyWallet').value.trim();
    const method = S.method === 'zain' ? 'زين كاش 📱' : 'سوبر كي 💳';
    const note   = $('buyNote').value.trim() || '—';
    setT('covIco', '💵');
    row('نوع العملية',     '🟢 شراء دولار أمريكي');
    row('الاسم الكامل',    name);
    row('رقم الهاتف',      phone,  true);
    row('المبلغ بالدينار', arIQD(iqd));
    row('ستستلم تقريباً',  usd + ' دولار أمريكي');
    row('عنوان المحفظة',   wallet, true);
    row('طريقة الإرسال',   method);
    if (note !== '—') row('ملاحظة', note);
  } else {
    const name  = $('sellName').value.trim();
    const phone = normPhone($('sellPhone').value);
    const usd   = parseFloat($('sellUSDC').value);
    const iqd   = Math.floor(usd * CFG.SELL_RATE);
    const proof = $('sellProofWallet').value.trim();
    const method= S.method === 'zain' ? 'زين كاش 📱' : 'سوبر كي 💳';
    const note  = $('sellNote').value.trim() || '—';
    setT('covIco', '🏦');
    row('نوع العملية',      '🔴 بيع دولار أمريكي');
    row('الاسم الكامل',     name);
    row('رقم الهاتف',       phone,  true);
    row('المبلغ بالدولار',  usd + ' دولار أمريكي');
    row('ستستلم تقريباً',   arIQD(iqd));
    row('محفظة الإثبات',    proof,  true);
    row('طريقة الاستلام',   method);
    if (note !== '—') row('ملاحظة', note);
  }

  remC('confirmOverlay', 'hidden');
  document.body.style.overflow = 'hidden';
  // Reset send button in case of retry
  const sb = $('covSendBtn');
  if (sb) { sb.disabled = false; sb.textContent = 'إرسال الطلب ✓'; }
}

function closeConfirm() {
  addC('confirmOverlay', 'hidden');
  document.body.style.overflow = '';
}

/* ╔══════════════════════════════════════════╗
   ║  Confirm → Send → Reveal                 ║
   ╚══════════════════════════════════════════╝ */
async function confirmSend() {
  if (S.sending) return;
  S.sending = true;

  const btn = $('covSendBtn');
  btn.disabled  = true;
  btn.innerHTML = 'جاري الإرسال… <span class="spin"></span>';

  const time = enTime();
  let subject, body;

  if (S.mode === 'buy') {
    const name   = $('buyName').value.trim();
    const phone  = normPhone($('buyPhone').value);
    const iqd    = parseFloat($('buyIQD').value);
    const usd    = parseFloat((iqd / CFG.BUY_RATE).toFixed(2));
    const wallet = $('buyWallet').value.trim();
    const method = S.method === 'zain' ? 'ZainCash' : 'SuperKey';
    const note   = $('buyNote').value.trim() || 'None';

    subject = `[Kanba BUY] ${enUSD(usd)} | ${enIQD(iqd)} | ${name}`;
    body = buildBody({
      type: 'BUY — شراء دولار أمريكي 🟢',
      name, phone,
      iqd: enIQD(iqd),
      usd: enUSD(usd),
      rate: enN(CFG.BUY_RATE) + ' IQD/USD',
      method, wallet,
      phone2: '—', proof: '—',
      note, time,
    });
  } else {
    const name  = $('sellName').value.trim();
    const phone = normPhone($('sellPhone').value);
    const usd   = parseFloat($('sellUSDC').value);
    const iqd   = Math.floor(usd * CFG.SELL_RATE);
    const proof = $('sellProofWallet').value.trim();
    const method= S.method === 'zain' ? 'ZainCash' : 'SuperKey';
    const note  = $('sellNote').value.trim() || 'None';

    subject = `[Kanba SELL] ${enUSD(usd)} | ${enIQD(iqd)} | ${name}`;
    body = buildBody({
      type: 'SELL — بيع دولار أمريكي 🔴',
      name, phone,
      iqd: enIQD(iqd),
      usd: enUSD(usd),
      rate: enN(CFG.SELL_RATE) + ' IQD/USD',
      method,
      wallet: CFG.KANBA_WALLET,
      proof,
      note, time,
    });
  }

  const ok = await sendFormSubmit(subject, body);
  S.sending = false;
  closeConfirm();

  if (ok) {
    revealPaymentInfo();
  } else {
    /* Retry — reopen overlay with error message */
    const sb = $('covSendBtn');
    if (sb) {
      sb.disabled = false;
      sb.textContent = '⚠️ فشل — حاول مجدداً';
    }
    remC('confirmOverlay', 'hidden');
    document.body.style.overflow = 'hidden';
  }
}

/* ╔══════════════════════════════════════════╗
   ║  FormSubmit — zero-config, 100% free     ║
   ║  First send: confirm email arrives once  ║
   ╚══════════════════════════════════════════╝ */
async function sendFormSubmit(subject, message) {
  try {
    const fd = new FormData();
    fd.append('_subject',  subject);
    fd.append('_captcha',  'false');
    fd.append('_template', 'table');
    fd.append('message',   message);

    const res = await fetch(`https://formsubmit.co/${CFG.EMAIL}`, {
      method: 'POST',
      body:   fd,
    });
    // FormSubmit returns 200 even on first-time activation email
    return res.status === 200 || res.ok;
  } catch (err) {
    console.error('[Kanba] FormSubmit error:', err);
    return false;
  }
}

/* ╔══════════════════════════════════════════╗
   ║  Email Body — clean table text           ║
   ╚══════════════════════════════════════════╝ */
function buildBody({ type, name, phone, iqd, usd, rate, method, wallet, proof, note, time }) {
  return [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'KANBA EXCHANGE — New Order',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `Type          : ${type}`,
    `Time          : ${time}`,
    '',
    '── CLIENT ───────────────────────',
    `Full Name     : ${name}`,
    `Phone         : ${phone}`,
    '',
    '── AMOUNTS ──────────────────────',
    `Iraqi Dinar   : ${iqd}`,
    `US Dollar     : ${usd}`,
    `Exchange Rate : ${rate}`,
    '',
    '── PAYMENT ──────────────────────',
    `Method        : ${method}`,
    `Wallet        : ${wallet}`,
    `Proof Wallet  : ${proof || '—'}`,
    '',
    '── NOTE ─────────────────────────',
    `Note          : ${note}`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'kanba.pw — Iraq P2P Exchange',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

/* ╔══════════════════════════════════════════╗
   ║  Reveal Payment Info + Timer             ║
   ╚══════════════════════════════════════════╝ */
function revealPaymentInfo() {
  /* Dim form */
  addC('formCard', 'dimmed');
  const fb = $('formBadge');
  if (fb) { fb.textContent = '✓'; fb.className = 'step-badge done'; }

  setT('revName', CFG.KANBA_NAME);

  if (S.mode === 'buy') {
    const iqd    = parseFloat($('buyIQD').value);
    const method = S.method === 'zain' ? 'زين كاش 📱' : 'سوبر كي 💳';
    setT('revIco',        '💵');
    setT('revTitle',      'أرسل الدينار إلى');
    setT('revSub',        'انسخ الرقم وأرسل عبر الطريقة المختارة');
    setT('revContactLbl', 'رقم الاستلام');
    setT('revContact',    CFG.KANBA_PHONE);
    setT('revSecret',     CFG.KANBA_SECRET);
    setT('revAmountLbl',  'المبلغ المطلوب');
    setT('revAmount',     arIQD(iqd));
    setT('revMethod',     method);
    show('rowSecret'); show('rowMethod'); hide('rowNetwork');
  } else {
    const usd = parseFloat($('sellUSDC').value);
    setT('revIco',        '🔐');
    setT('revTitle',      'أرسل الدولار إلى محفظة كانبا');
    setT('revSub',        '⚠️ Arbitrum One فقط');
    setT('revContactLbl', 'عنوان المحفظة');
    setT('revContact',    CFG.KANBA_WALLET);
    setT('revAmountLbl',  'المبلغ المطلوب');
    setT('revAmount',     usd + ' دولار أمريكي');
    hide('rowSecret'); hide('rowMethod'); show('rowNetwork');
  }

  show('revealSection');
  setTimeout(() =>
    $('revealCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150
  );
  startRevealTimer();
}

/* ╔══════════════════════════════════════════╗
   ║  Countdown Timer                         ║
   ╚══════════════════════════════════════════╝ */
function startRevealTimer() {
  if (S.revealTimer) clearInterval(S.revealTimer);
  S.revealStart = Date.now();

  const tick = () => {
    const left = CFG.REVEAL_SECS - Math.floor((Date.now() - S.revealStart) / 1000);
    if (left <= 0) { clearInterval(S.revealTimer); wipeReveal(); return; }
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    const tv = $('timerVal'), tb = $('timerBar');
    const red = left <= 60;
    if (tv) { tv.textContent = `${mm}:${ss}`; tv.style.color = red ? 'var(--sell)' : ''; }
    if (tb) tb.style.borderColor = red ? 'var(--sell-brd)' : '';
  };

  tick();
  S.revealTimer = setInterval(tick, 1000);
}

function wipeReveal() {
  clearInterval(S.revealTimer);
  ['revName','revContact','revSecret'].forEach(id => setT(id, '🔒 انتهت مدة العرض'));
  const tb = $('timerBar');
  if (tb) {
    tb.style.cssText = 'border-color:var(--sell-brd);color:var(--sell)';
    tb.innerHTML = '<span style="font-weight:900">🔒 انتهت صلاحية البيانات — تواصل مباشرة</span>';
  }
  document.querySelectorAll('.btn-copy').forEach(b => b.disabled = true);
}

/* ╔══════════════════════════════════════════╗
   ║  Button 2 — Done                         ║
   ╚══════════════════════════════════════════╝ */
function step2() {
  wipeReveal();
  addC('revealCard', 'dimmed');
  show('successSection');
  setTimeout(() =>
    $('successSection')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120
  );
}

/* ╔══════════════════════════════════════════╗
   ║  Copy to Clipboard                       ║
   ╚══════════════════════════════════════════╝ */
function copyEl(id, btn) {
  const text = $(id)?.textContent?.trim() || '';
  if (!text || text.includes('🔒')) return;
  const done = () => {
    const o = btn.textContent;
    btn.textContent = '✅ تم';
    btn.classList.add('ok');
    setTimeout(() => { btn.textContent = o; btn.classList.remove('ok'); }, 2000);
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(done).catch(() => fbCopy(text, done));
  } else fbCopy(text, done);
}
function fbCopy(text, cb) {
  const ta = Object.assign(document.createElement('textarea'),
    { value: text, style: 'position:fixed;top:0;left:0;opacity:0' });
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); cb(); } catch {}
  ta.remove();
}

/* ╔══════════════════════════════════════════╗
   ║  Escape HTML                             ║
   ╚══════════════════════════════════════════╝ */
const esc = s => String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ╔══════════════════════════════════════════╗
   ║  Init                                    ║
   ╚══════════════════════════════════════════╝ */
document.addEventListener('DOMContentLoaded', () => {
  /* Header rates */
  setT('rBuy',  enN(CFG.BUY_RATE));
  setT('rSell', enN(CFG.SELL_RATE));

  /* Dynamic sell limits */
  setT('sellMinLbl', `أدنى: ${enN(Math.ceil(CFG.MIN_IQD / CFG.SELL_RATE))} دولار`);
  setT('sellMaxLbl', `أقصى: ${enN(Math.floor(CFG.MAX_IQD / CFG.SELL_RATE))} دولار`);

  /* Input listeners */
  const wire = (id, fn) => $(id)?.addEventListener('input', fn);
  wire('buyName',         validate);
  wire('buyPhone',        validate);
  wire('buyIQD',          calcBuy);
  wire('buyWallet',       validate);
  wire('sellName',        validate);
  wire('sellPhone',       validate);
  wire('sellUSDC',        calcSell);
  wire('sellProofWallet', validate);

  /* IP check */
  checkIP();

  /* T&C re-check on tab return */
  window.addEventListener('focus', updateTermsBadge);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateTermsBadge();
  });

  /* ESC closes overlay */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeConfirm();
  });

  /* Click outside panel closes overlay */
  $('confirmOverlay')?.addEventListener('click', e => {
    if (e.target === $('confirmOverlay')) closeConfirm();
  });

  updateTermsBadge();
});
