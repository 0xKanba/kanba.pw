document.addEventListener('DOMContentLoaded', function () {

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/style.css';
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
          <a href="/index.html" class="footer-tab" data-page="index">Kanba</a>
          <a href="/younis.html" class="footer-tab" data-page="younis">Younis</a>
          <a href="/ccr.html" class="footer-tab" data-page="ccr">Compounding Calc.</a>
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

  const path = window.location.pathname.toLowerCase().trim();
  let pageKey = path.split('/').pop().replace(/\.html$/, '').trim();

  if (!pageKey) pageKey = 'index';

  document.querySelectorAll('.footer-tab').forEach(tab => {
    if (tab.getAttribute('data-page') === pageKey) {
      tab.classList.add('active');
    }
  });

});
