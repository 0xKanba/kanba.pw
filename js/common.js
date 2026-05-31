document.addEventListener('DOMContentLoaded',function(){
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/css/styles.css';
  document.head.appendChild(link);
  
  const headerHTML=``;
  const footerHTML=`
    <footer class="footer">
      <div class="footer-content">
        <div class="footer-tabs">
          <a href="/index.html" class="footer-tab" data-page="index">Kanba</a>
          <a href="https://younis.pw" class="footer-tab" data-page="younis">Younis</a>
          <a href="/ccr.html" class="footer-tab"  data-page="ccr">Compounding Calc.</a>
          <a href="/funded/index.html" class="footer-tab" data-page="funded">All funded rules</a>
          <a href="/videos.html" class="footer-tab" target="_blank" data-page="videos">my videos</a>
        </div>
        <div class="copyright">
          © 2025-2026 Kanba_trader | All Rights Reserved
        </div>
      </div>
    </footer>
  `;
  
  const headerElement=document.getElementById('header');
  const footerElement=document.getElementById('footer');
  if(headerElement)headerElement.innerHTML=headerHTML;
  if(footerElement)footerElement.innerHTML=footerHTML;
  
  setTimeout(()=>{
    const path=window.location.pathname.toLowerCase().trim();
    // تقسيم المسار وإزالة العناصر الفارغة الناتجة عن الشرطات المائلة
    const segments = path.split('/').filter(p => p !== '');
    let pageKey = 'index'; // القيمة الافتراضية للجذر الرئيسي

    if (segments.length > 0) {
      // الحصول على آخر جزء من الرابط وإزالة .html
      const lastSegment = segments[segments.length - 1].replace(/\.html$/, '');
      
      if (lastSegment === 'index' || lastSegment === '') {
        // إذا كان الملف index، نتحقق هل هو داخل مجلد فرعي أم لا
        if (segments.length > 1) {
          // إذا كان هناك مجلد قبله (مثل funded)، نأخذ اسم المجلد
          pageKey = segments[segments.length - 2];
        } else {
          // إذا كان في الجذر مباشرة
          pageKey = 'index';
        }
      } else {
        // إذا كان الملف ليس index (مثل younis.html)
        pageKey = lastSegment;
      }
    }

    document.querySelectorAll('.footer-tab').forEach(tab=>{
      const tabPage=tab.getAttribute('data-page');
      if(tabPage===pageKey){tab.classList.add('active')}
    });
  }, 150);
});
