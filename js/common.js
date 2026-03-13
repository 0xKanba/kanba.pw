document.addEventListener('DOMContentLoaded', function () {

  /* ── Header ── */
  const headerHTML = `
    <div class="mt-header">
      <a href="/index.html" class="mt-header-link">
        <img src="/images/btc21.png" alt="logo" class="mt-logo">
        <span class="mt-title">Kanba_trader x younis_y24</span>
      </a>
    </div>
  `;

  /* ── Footer ── */
  const footerHTML = `
    <div class="mt-footer">
      <nav class="mt-nav">
        <a href="/index.html"        class="mt-nav-link" data-p="index">Kanba</a>
        <a href="/younis.html"       class="mt-nav-link" data-p="younis">Younis</a>
        <a href="/ccr.html"          class="mt-nav-link" data-p="ccr">Compounding Calc.</a>
        <a href="/HLsee.html"        class="mt-nav-link" data-p="hlsee"        target="_blank" rel="noopener noreferrer">see analysis</a>
        <a href="/video2026mar.html" class="mt-nav-link" data-p="video2026mar" target="_blank" rel="noopener noreferrer">videosNEWS</a>
      </nav>
      <p class="mt-copy">© 2025-2026 Kanba_trader | All Rights Reserved</p>
    </div>
  `;

  const h = document.getElementById('header');
  const f = document.getElementById('footer');

  if (h) h.innerHTML = headerHTML;
  if (f) f.innerHTML = footerHTML;

  /* ── Active tab ── */
  const pop = window.location.pathname.toLowerCase().split('/').pop();
  const key = pop.replace(/\.html$/, '') || 'index';

  document.querySelectorAll('.mt-nav-link').forEach(function (a) {
    if (a.getAttribute('data-p').toLowerCase() === key) {
      a.classList.add('mt-active');
    }
  });

});
