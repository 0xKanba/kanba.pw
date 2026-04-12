/* ═══════════════════════════════════════════════════════════
   pay.js — Kanba Exchange · كانبا للصرافة
   ✅ IP Check (Iraq only)
   ✅ T&C gate (localStorage)
   ✅ Live rate calculator
   ✅ Telegram bot notification
   ✅ Sensitive data hidden until T&C + submit
═══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   ⚙️  الإعدادات — عدّلها حسب الحاجة
══════════════════════════════════════════════════════════ */
const CFG = {
  // أسعار الصرف (قابلة للتغيير يدوياً)
  BUY_RATE:  1600,          // IQD لكل دولار عند الشراء
  SELL_RATE: 1500,          // IQD لكل دولار عند البيع

  // حدود المبالغ
  MIN_IQD:   15_000,        // حد أدنى بالدينار
  MAX_IQD:   1_000_000,     // حد أقصى بالدينار

  // بيانات الاستلام (تُظهر بعد T&C + submit فقط)
  KANBA_NAME:   'حيدر كاظم - للتأكد فقط',
  KANBA_PHONE:  '7847859054',   // للاستلام عبر زين كاش / سوبر كي
  KANBA_WALLET: '0x121B845Cb550dD5B01B9eAc5BD65f79d84c6Ee99', // لاستلام USDC

  // تيليغرام بوت — ضع بياناتك هنا
  TG_TOKEN:   '7959023285:AAFUsH6OwUDsBcQOUPBedzXgdKroLfE6_yw',   // مثال: 7123456789:AAH...
  TG_CHAT_ID: '6038843849',     // مثال: -100123456789

  // localStorage key للشروط
  TERMS_KEY: 'kanba_terms_v1',
};

/* ══════════════════════════════════════════════════════════
   حالة التطبيق
══════════════════════════════════════════════════════════ */
const State = {
  mode: null,
  buyMethod: null,
  termsAccepted: false,
  ipChecked: false,
};

/* ══════════════════════════════════════════════════════════
   أدوات مساعدة
══════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const fmtIQD  = n => Number(n).toLocaleString('ar-IQ') + ' د.ع';
const fmtUSDC = n => Number(n).toFixed(2) + ' USDC';

function showEl(id)  { $(id)?.classList.remove('hidden'); }
function hideEl(id)  { $(id)?.classList.add('hidden'); }

/* ══════════════════════════════════════════════════════════
   1. فحص IP — العراق فقط
══════════════════════════════════════════════════════════ */
async function checkIP() {
  try {
    // نستخدم خدمتين كاحتياط
    let country = null;

    try {
      const r = await fetch('https://api.country.is/', { signal: AbortSignal.timeout(5000) });
      const d = await r.json();
      country = d.country;
    } catch {
      // احتياط
      const r2 = await fetch('https://ipapi.co/country/', { signal: AbortSignal.timeout(5000) });
      country = (await r2.text()).trim();
    }

    if (country && country !== 'IQ') {
      showEl('ipOverlay');
      hideEl('app');
    }
  } catch {
    // في حالة فشل الفحص نكمل بشكل طبيعي (لا نحجب المستخدم بسبب خطأ شبكة)
    console.warn('[Kanba] IP check failed — proceeding anyway');
  }
}

/* ══════════════════════════════════════════════════════════
   2. الشروط والأحكام
══════════════════════════════════════════════════════════ */
function checkTermsAccepted() {
  const val = localStorage.getItem(CFG.TERMS_KEY);
  State.termsAccepted = !!val;
  return State.termsAccepted;
}

function updateTermsUI() {
  const accepted = checkTermsAccepted();

  ['buy', 'sell'].forEach(mode => {
    const badge = $(`${mode}TermsBadge`);
    const btn   = $(`${mode}Submit`);
    if (!badge || !btn) return;

    if (accepted) {
      badge.textContent = 'موافَق عليها ✓';
      badge.classList.remove('pending');
      validateForm(mode);
    } else {
      badge.textContent = 'لم يُوافَق بعد';
      badge.classList.add('pending');
      btn.disabled = true;
    }
  });
}

function openTerms() {
  // نفتح rules.html ونراقب رجوع المستخدم
  const listener = () => {
    updateTermsUI();
    window.removeEventListener('focus', listener);
  };
  window.addEventListener('focus', listener);
}

/* ══════════════════════════════════════════════════════════
   3. وضع العرض (شراء / بيع)
══════════════════════════════════════════════════════════ */
function setMode(mode) {
  State.mode = mode;

  // أزرار الوضع
  $('btnModeBuy').classList.toggle('active-buy',   mode === 'buy');
  $('btnModeSell').classList.toggle('active-sell', mode === 'sell');
  $('btnModeBuy').classList.toggle('active-sell',  false);
  $('btnModeSell').classList.toggle('active-buy',  false);

  // إظهار القسم الصحيح
  if (mode === 'buy') {
    showEl('buySection');
    hideEl('sellSection');
  } else {
    showEl('sellSection');
    hideEl('buySection');
  }

  updateTermsUI();
}

/* ══════════════════════════════════════════════════════════
   4. اختيار طريقة الدفع (شراء)
══════════════════════════════════════════════════════════ */
function selectMethod(mode, method) {
  if (mode !== 'buy') return;
  State.buyMethod = method;
  $('pm-zain').classList.toggle('selected',  method === 'zain');
  $('pm-super').classList.toggle('selected', method === 'super');
  validateForm('buy');
}

/* ══════════════════════════════════════════════════════════
   5. الحسابات الحية
══════════════════════════════════════════════════════════ */
function calcBuy() {
  const iqd = parseFloat($('buyAmountIQD').value) || 0;
  const usd = iqd / CFG.BUY_RATE;
  $('buyCalcUSD').textContent = iqd > 0 ? fmtUSDC(usd) : '— USDC';
  validateForm('buy');
}

function calcSell() {
  const usdc = parseFloat($('sellAmountUSDC').value) || 0;
  const iqd  = usdc * CFG.SELL_RATE;
  $('sellCalcIQD').textContent = usdc > 0 ? fmtIQD(Math.floor(iqd)) : '— د.ع';
  validateForm('sell');
}

/* ══════════════════════════════════════════════════════════
   6. التحقق من الحقول وتفعيل زر الإرسال
══════════════════════════════════════════════════════════ */
function validateForm(mode) {
  if (!checkTermsAccepted()) return;

  if (mode === 'buy') {
    const iqd    = parseFloat($('buyAmountIQD').value) || 0;
    const wallet = $('buyWallet').value.trim();
    const valid  = iqd >= CFG.MIN_IQD && iqd <= CFG.MAX_IQD
                && wallet.startsWith('0x') && wallet.length >= 42
                && State.buyMethod !== null;
    $('buySubmit').disabled = !valid;

  } else if (mode === 'sell') {
    const usdc  = parseFloat($('sellAmountUSDC').value) || 0;
    const phone = $('sellPhone').value.trim();
    const minUSDC = CFG.MIN_IQD / CFG.SELL_RATE;
    const maxUSDC = CFG.MAX_IQD / CFG.SELL_RATE;
    const valid = usdc >= minUSDC && usdc <= maxUSDC
               && /^07\d{9}$/.test(phone);
    $('sellSubmit').disabled = !valid;
  }
}

/* ══════════════════════════════════════════════════════════
   7. إرسال رسالة تيليغرام
══════════════════════════════════════════════════════════ */
async function sendTelegram(text) {
  if (CFG.TG_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    console.warn('[Kanba] Telegram token not configured');
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${CFG.TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:    CFG.TG_CHAT_ID,
        text:       text,
        parse_mode: 'HTML',
      }),
    });
  } catch (e) {
    console.error('[Kanba] Telegram error:', e);
  }
}

function buildTime() {
  return new Date().toLocaleString('ar-IQ', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad'
  });
}

/* ══════════════════════════════════════════════════════════
   8. إرسال طلب الشراء
══════════════════════════════════════════════════════════ */
async function submitBuy() {
  const btn    = $('buySubmit');
  const iqd    = parseFloat($('buyAmountIQD').value);
  const usd    = (iqd / CFG.BUY_RATE).toFixed(2);
  const wallet = $('buyWallet').value.trim();
  const method = State.buyMethod === 'zain' ? 'زين كاش' : 'سوبر كي';
  const note   = $('buyNote').value.trim() || '—';

  btn.disabled = true;
  btn.innerHTML = 'جاري الإرسال… <span class="spinner"></span>';

  // إرسال تيليغرام
  const msg = `
🟢 <b>طلب شراء دولار جديد</b>
━━━━━━━━━━━━━━━━━━━━
💰 <b>المبلغ بالدينار:</b> ${Number(iqd).toLocaleString('en')} د.ع
💵 <b>المبلغ بالدولار:</b> ${usd} USDC
🏦 <b>طريقة الدفع:</b> ${method}
👛 <b>عنوان المحفظة:</b>
<code>${wallet}</code>
📝 <b>ملاحظة:</b> ${note}
⏰ <b>الوقت:</b> ${buildTime()}
`.trim();

  await sendTelegram(msg);

  // عرض بيانات الاستلام
  $('buyConfirmNumber').textContent = CFG.KANBA_PHONE;
  $('buyConfirmAmount').textContent = `${Number(iqd).toLocaleString('ar-IQ')} د.ع`;
  $('buyConfirmMethod').textContent = method;

  btn.textContent = '✅ تم الإرسال';
  showEl('buyConfirm');

  // scroll للتأكيد
  $('buyConfirm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ══════════════════════════════════════════════════════════
   9. إرسال طلب البيع
══════════════════════════════════════════════════════════ */
async function submitSell() {
  const btn   = $('sellSubmit');
  const usdc  = parseFloat($('sellAmountUSDC').value);
  const iqd   = Math.floor(usdc * CFG.SELL_RATE);
  const phone = $('sellPhone').value.trim();
  const note  = $('sellNote').value.trim() || '—';

  btn.disabled = true;
  btn.innerHTML = 'جاري الإرسال… <span class="spinner"></span>';

  // إرسال تيليغرام
  const msg = `
🔴 <b>طلب بيع دولار جديد</b>
━━━━━━━━━━━━━━━━━━━━
💵 <b>المبلغ بالدولار:</b> ${usdc} USDC
💰 <b>المبلغ بالدينار:</b> ${Number(iqd).toLocaleString('en')} د.ع
📱 <b>رقم الهاتف:</b> <code>${phone}</code>
📝 <b>ملاحظة:</b> ${note}
⏰ <b>الوقت:</b> ${buildTime()}
`.trim();

  await sendTelegram(msg);

  // عرض عنوان المحفظة
  $('sellConfirmWallet').textContent = CFG.KANBA_WALLET;
  $('sellConfirmAmount').textContent = `${usdc} USDC`;
  $('sellConfirmIQD').textContent    = fmtIQD(iqd);

  // إخفاء teaser وإظهار التأكيد
  hideEl('walletTeaser');
  btn.textContent = '✅ تم الإرسال';
  showEl('sellConfirm');

  $('sellConfirm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ══════════════════════════════════════════════════════════
   10. نسخ النص
══════════════════════════════════════════════════════════ */
function copyText(elementId) {
  const el = $(elementId);
  if (!el) return;
  const text = el.textContent.trim();
  navigator.clipboard.writeText(text).then(() => {
    const btn = el.parentElement?.querySelector('.btn-copy');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✅ تم النسخ';
      setTimeout(() => btn.textContent = orig, 2000);
    }
  }).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

/* ══════════════════════════════════════════════════════════
   11. عرض الأسعار في الواجهة
══════════════════════════════════════════════════════════ */
function initRates() {
  const buyFmt  = CFG.BUY_RATE.toLocaleString('en');
  const sellFmt = CFG.SELL_RATE.toLocaleString('en');
  $('buyRateDisplay').textContent  = buyFmt;
  $('sellRateDisplay').textContent = sellFmt;
  $('buyRateCard').textContent  = `${buyFmt} د.ع`;
  $('sellRateCard').textContent = `${sellFmt} د.ع`;

  // حدود USDC ديناميكية
  const minUSDC = (CFG.MIN_IQD / CFG.SELL_RATE).toFixed(0);
  const maxUSDC = (CFG.MAX_IQD / CFG.SELL_RATE).toFixed(0);
  $('sellAmountUSDC').min = minUSDC;
  $('sellAmountUSDC').max = maxUSDC;
}

/* ══════════════════════════════════════════════════════════
   12. التحقق من الحقول عند الكتابة
══════════════════════════════════════════════════════════ */
function bindValidation() {
  ['buyWallet', 'buyAmountIQD', 'sellPhone', 'sellAmountUSDC'].forEach(id => {
    $(id)?.addEventListener('input', () => {
      validateForm(State.mode);
    });
  });
}

/* ══════════════════════════════════════════════════════════
   🚀 التهيئة
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initRates();
  checkIP();
  updateTermsUI();
  bindValidation();

  // إعادة فحص الشروط عند العودة للنافذة
  window.addEventListener('focus', updateTermsUI);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateTermsUI();
  });
});
