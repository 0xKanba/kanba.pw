/* ============================================================
   common.js — kanba.pw shared components
   Header · Footer · Theme · Fullscreen Image · PWA
   ============================================================ */
(function () {
  'use strict';

  /* ── NAV HTML ─────────────────────────────────────────── */
  function navHTML() {
    return `
<nav class="kn-nav" role="navigation" aria-label="main">
  <div class="kn-nav-inner">
    <a class="kn-nav-logo" href="/en/">
      <img src="/images/0x8.png" alt="Kanba" width="30" height="30" loading="eager">
      <span>Kan₿a</span>
    </a>
    <div class="kn-nav-links" role="list">
      <a class="kn-nav-link" href="/en/" role="listitem">Home</a>
      <a class="kn-nav-link" href="/en/younis.html" role="listitem">Younis</a>
      <a class="kn-nav-link" href="/en/ccr.html" role="listitem">Calculator</a>
    </div>
    <button class="kn-theme-btn" id="themeToggle" aria-label="Toggle dark / light mode" title="Toggle theme">
      <svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
      <svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </button>
    <button class="kn-menu-btn" id="menuToggle" aria-label="Open menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
  <div class="kn-mobile-menu" id="mobileMenu" aria-hidden="true">
    <a class="kn-mob-link" href="/en/">Home</a>
    <a class="kn-mob-link" href="/en/younis.html">Younis</a>
    <a class="kn-mob-link" href="/en/ccr.html">Calculator</a>
  </div>
</nav>`;
  }

  /* ── FOOTER HTML ──────────────────────────────────────── */
  function footerHTML() {
    const yr = new Date().getFullYear();
    return `
<footer class="kn-footer" role="contentinfo">
  <div class="kn-footer-inner">
    <div class="kn-footer-brand">
      <a class="kn-footer-logo" href="/en/">Kan₿a</a>
      <p>Crypto trading &amp; analysis · <a href="https://kanba.pw" target="_blank" rel="noopener">kanba.pw</a></p>
    </div>
    <nav class="kn-footer-nav" aria-label="footer">
      <a href="/en/">Home</a>
      <a href="/en/younis.html">Younis</a>
      <a href="/en/ccr.html">Calculator</a>
    </nav>
    <p class="kn-footer-copy">© ${yr} kanba.pw · All rights reserved</p>
  </div>
</footer>`;
  }

  /* ── INJECT ───────────────────────────────────────────── */
  function inject(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  /* ── ACTIVE NAV LINK ──────────────────────────────────── */
  function markActiveLink() {
    const path = location.pathname.replace(/\/$/, '') || '/en';
    document.querySelectorAll('.kn-nav-link, .kn-mob-link').forEach(a => {
      const href = a.getAttribute('href').replace(/\/$/, '') || '/en';
      if (href === path) a.classList.add('active');
    });
  }

  /* ── THEME ────────────────────────────────────────────── */
  function initTheme() {
    const stored = localStorage.getItem('kn-theme');
    const sys    = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(stored || sys);

    document.addEventListener('click', e => {
      if (e.target.closest('#themeToggle')) {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem('kn-theme', next);
      }
    });

    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (!localStorage.getItem('kn-theme')) applyTheme(e.matches ? 'dark' : 'light');
    });
  }

  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', t === 'dark' ? '#0a0a12' : '#f5f5fa');
  }

  /* ── MOBILE MENU ──────────────────────────────────────── */
  function initMobileMenu() {
    const btn  = document.getElementById('menuToggle');
    const menu = document.getElementById('mobileMenu');
    if (!btn || !menu) return;

    btn.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open);
      menu.setAttribute('aria-hidden', !open);
    });

    // Close on outside click
    document.addEventListener('click', e => {
      if (!e.target.closest('.kn-nav')) {
        menu.classList.remove('open');
        btn.classList.remove('open');
        btn.setAttribute('aria-expanded', false);
        menu.setAttribute('aria-hidden', true);
      }
    });
  }

  /* ── FULLSCREEN IMAGE OVERLAY ─────────────────────────── */
  function initImageOverlay() {
    const ov = document.createElement('div');
    ov.id        = 'kn-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Image fullscreen view');
    ov.innerHTML = `
      <div class="kn-ov-backdrop"></div>
      <img class="kn-ov-img" alt="">
      <button class="kn-ov-close" aria-label="Close fullscreen">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
    document.body.appendChild(ov);

    function open(src, alt) {
      const img = ov.querySelector('.kn-ov-img');
      img.src = src; img.alt = alt || '';
      ov.classList.add('active');
      document.body.style.overflow = 'hidden';
      ov.querySelector('.kn-ov-close').focus();
    }
    function close() {
      ov.classList.remove('active');
      document.body.style.overflow = '';
    }

    document.querySelectorAll('.profile-img-clean').forEach(img => {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', e => { e.preventDefault(); open(img.src, img.alt); });
    });

    ov.querySelector('.kn-ov-backdrop').addEventListener('click', close);
    ov.querySelector('.kn-ov-close').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  /* ── PWA ──────────────────────────────────────────────── */
  function initPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  /* ── SCROLL PROGRESS BAR ─────────────────────────────── */
  function initScrollBar() {
    const bar = document.createElement('div');
    bar.id = 'kn-scroll-bar';
    document.body.prepend(bar);
    window.addEventListener('scroll', () => {
      const pct = (scrollY / (document.body.scrollHeight - innerHeight)) * 100;
      bar.style.width = Math.min(pct, 100) + '%';
    }, { passive: true });
  }

  /* ── BOOT ─────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    inject('header', navHTML());
    inject('footer', footerHTML());
    markActiveLink();
    initTheme();
    initMobileMenu();
    initImageOverlay();
    initScrollBar();
    initPWA();
  });

})();
