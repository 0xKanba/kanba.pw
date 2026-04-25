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
    // دالة لتجريد المسار من الزوائد وتوحيد شكله
    const normalizePath = (path) => {
      let p = path.toLowerCase().trim();
      // إزالة الشرطة المائلة النهائية وامتداد html
      p = p.replace(/\/$/, '').replace(/\.html$/, ''); 
      
      // معالجة مسار الجذر الرئيسي
      if (p === '' || p === '/index') return '/index'; 
      // معالجة الجذور الفرعية (مثل /funded/index)
      if (p.endsWith('/index')) return p.replace('/index', ''); 
      
      return p;
    };

    const currentPath = normalizePath(window.location.pathname);

    document.querySelectorAll('.footer-tab').forEach(tab => {
      const tabPath = normalizePath(tab.getAttribute('href'));
      
      if (currentPath === tabPath) {
        tab.classList.add('active');
      }
    });
  }, 150);
