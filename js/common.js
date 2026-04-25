document.addEventListener('DOMContentLoaded', function() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/styles.css';
  document.head.appendChild(link);

  const headerHTML = ``; // ضع محتوى الهيدر هنا كما هو

  const footerHTML = `
    <footer class="footer">
      <div class="footer-content">
        <div class="footer-tabs">
          <a href="/index.html" class="footer-tab">Kanba</a>
          <a href="/younis.html" class="footer-tab">Younis</a>
          <a href="/ccr.html" class="footer-tab">Compounding Calc.</a>
          <a href="/funded/index.html" class="footer-tab">All funded rules</a>
          <a href="/videos.html" class="footer-tab" target="_blank">my videos</a>
        </div>
        <div class="copyright">
          © 2025-2026 Kanba_trader | All Rights Reserved
        </div>
      </div>
    </footer>
  `;

  const headerElement = document.getElementById('header');
  const footerElement = document.getElementById('footer');

  if (headerElement) headerElement.innerHTML = headerHTML;
  if (footerElement) footerElement.innerHTML = footerHTML;

  setTimeout(() => {
    // جلب المسار الحالي وتحويله لأحرف صغيرة
    let currentPath = window.location.pathname.toLowerCase().trim();
    
    // إذا كان المسار ينتهي بشرطة مائلة (مثل / أو /funded/)، نفترض وجود index.html
    if (currentPath.endsWith('/')) {
        currentPath += 'index.html';
    }

    // مطابقة المسار الحالي مع رابط كل زر
    document.querySelectorAll('.footer-tab').forEach(tab => {
      const tabHref = tab.getAttribute('href').toLowerCase();
      
      // إذا تطابق المسار الحالي مع رابط الزر، أضف كلاس active
      if (currentPath === tabHref) {
        tab.classList.add('active');
      }
    });
  }, 150);
});
