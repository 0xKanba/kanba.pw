/* ============================================================
   K_Y.js — Profile Page Interactions (kanba.pw)
   ============================================================ */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    initParallaxBg();
    initSocialMagnetic();
    initProfileTilt();
    initKeyboardNav();
    initKonamiEgg();
    initPWAInstall();
  }

  /* ── Parallax Background Mesh ─────────────────────────── */
  function initParallaxBg() {
    const mesh = document.querySelector('.bg-mesh');
    if (!mesh) return;

    let rx = 0, ry = 0;

    document.addEventListener('mousemove', e => {
      rx = ((e.clientX / innerWidth) - .5) * 18;
      ry = ((e.clientY / innerHeight) - .5) * 18;
    }, { passive: true });

    let ticking = false;
    function tick() {
      mesh.style.transform = `translate(${rx}px, ${ry}px)`;
      ticking = false;
    }
    document.addEventListener('mousemove', () => {
      if (!ticking) { requestAnimationFrame(tick); ticking = true; }
    }, { passive: true });

    // Scroll parallax
    window.addEventListener('scroll', () => {
      mesh.style.transform = `translateY(${scrollY * -0.4}px)`;
    }, { passive: true });
  }

  /* ── Magnetic Social Links ────────────────────────────── */
  function initSocialMagnetic() {
    const links = document.querySelectorAll('.social-link');

    links.forEach(link => {
      let raf;

      link.addEventListener('mousemove', e => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = link.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width  - .5) * 12;
          const y = ((e.clientY - r.top)  / r.height - .5) * 12;
          link.style.transform = `translateY(-4px) scale(1.04) translate(${x}px,${y}px)`;
        });
      });

      link.addEventListener('mouseleave', () => {
        cancelAnimationFrame(raf);
        link.style.transform = '';
      });

      // Touch pulse
      link.addEventListener('touchstart', () => {
        link.style.transform = 'scale(.95)';
      }, { passive: true });
      link.addEventListener('touchend', () => {
        link.style.transform = 'scale(1.06)';
        setTimeout(() => { link.style.transform = ''; }, 250);
      }, { passive: true });
    });
  }

  /* ── Profile Image 3D Tilt ────────────────────────────── */
  function initProfileTilt() {
    const img = document.querySelector('.profile-img-clean');
    if (!img) return;

    let curX = 0, curY = 0, tgtX = 0, tgtY = 0;
    let hover = false, raf;

    img.addEventListener('mouseenter', () => { hover = true; startLoop(); });
    img.addEventListener('mouseleave', () => {
      hover = false; tgtX = 0; tgtY = 0;
    });
    document.addEventListener('mousemove', e => {
      if (!hover) return;
      const r = img.getBoundingClientRect();
      tgtX = ((e.clientX - r.left - r.width  / 2) / r.width)  * 18;
      tgtY = ((e.clientY - r.top  - r.height / 2) / r.height) * 18;
    }, { passive: true });

    // Click spin
    img.addEventListener('click', () => {
      img.style.transition = 'transform .6s cubic-bezier(.34,1.36,.64,1)';
      img.style.transform  = 'scale(1.15) rotate(360deg)';
      setTimeout(() => {
        img.style.transition = '';
        img.style.transform  = '';
      }, 650);
    });

    function startLoop() {
      function loop() {
        curX += (tgtX - curX) * .12;
        curY += (tgtY - curY) * .12;
        img.style.transform = hover
          ? `scale(1.08) perspective(600px) rotateY(${curX}deg) rotateX(${-curY}deg) translateZ(15px)`
          : `scale(1)`;
        if (hover || Math.abs(curX) > .1 || Math.abs(curY) > .1) {
          raf = requestAnimationFrame(loop);
        }
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    }
  }

  /* ── Keyboard Navigation (social grid) ───────────────── */
  function initKeyboardNav() {
    const links = [...document.querySelectorAll('.social-link, .ref-btn')];
    links.forEach((link, i) => {
      link.addEventListener('keydown', e => {
        const map = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 };
        const delta = map[e.key];
        if (delta !== undefined) {
          e.preventDefault();
          const next = links[i + delta];
          if (next) next.focus();
        }
      });
    });
  }

  /* ── Konami Code Easter Egg ───────────────────────────── */
  function initKonamiEgg() {
    const seq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    let idx = 0;
    const style = document.createElement('style');
    style.id = 'kn-rainbow';
    style.textContent = `@keyframes kn-hue{0%{filter:hue-rotate(0deg)}100%{filter:hue-rotate(360deg)}}`;
    document.head.appendChild(style);

    document.addEventListener('keydown', e => {
      idx = e.key === seq[idx] ? idx + 1 : 0;
      if (idx === seq.length) {
        document.body.style.animation = 'kn-hue 2s linear infinite';
        setTimeout(() => { document.body.style.animation = ''; }, 6000);
        idx = 0;
      }
    });
  }

  /* ── PWA Install Prompt ───────────────────────────────── */
  function initPWAInstall() {
    let deferred;
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault(); deferred = e;
    });
    const btn = document.getElementById('installBtn');
    if (btn && deferred) {
      btn.style.display = 'flex';
      btn.addEventListener('click', () => {
        deferred.prompt();
        deferred.userChoice.then(() => { deferred = null; btn.style.display = 'none'; });
      });
    }
  }

  /* ── Visibility: pause animations ────────────────────── */
  document.addEventListener('visibilitychange', () => {
    const state = document.hidden ? 'paused' : 'running';
    document.querySelectorAll('[data-entrance]').forEach(el => {
      el.style.animationPlayState = state;
    });
  });

})();
