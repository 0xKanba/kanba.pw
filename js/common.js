document.addEventListener('DOMContentLoaded', function () {

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/styles.css';
  document.head.appendChild(link);

  const headerHTML = `
    <div class="market-traders-header">
      <div class="market-traders-container">
        <div class="market-traders-rectangle">
          <a href="/index.html" class="header-unified-link">
            <img src="/images/btc21.png" alt="Market Traders" class="site-logo">
            <div class="header-content">
              <div class="market-traders-title">Kanba_trader x younis_y24</div>
            </div>
          </a>
        </div>
      </div>
    </div>
  `;

  const footerHTML = `
    <footer class="footer">
      <div class="footer-content">
        <div class="footer-tabs">
          <a href="/index.html"        class="footer-tab" data-page="index">Kanba</a>
          <a href="/younis.html"       class="footer-tab" data-page="younis">Younis</a>
          <a href="/ccr.html"          class="footer-tab" data-page="ccr">Compounding Calc.</a>
          <a href="/HLsee.html"        class="footer-tab" data-page="hlsee">see analysis</a>
          <a href="/video2026mar.html" class="footer-tab" data-page="video2026mar">videosNEWS</a>
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

  // ✅ lowercase للمقارنة — يحل مشكلة HLsee و أي اسم بـ uppercase
  const path = window.location.pathname.toLowerCase().trim();
  let pageKey = path.split('/').pop().replace(/\.html$/, '').trim();

  if (!pageKey) pageKey = 'index';

  document.querySelectorAll('.footer-tab').forEach(tab => {
    // ✅ كلاهما lowercase عند المقارنة
    if (tab.getAttribute('data-page').toLowerCase() === pageKey) {
      tab.classList.add('active');
    }
  });

});
