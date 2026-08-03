document.addEventListener("DOMContentLoaded", function () {
  const style = document.createElement("style");
  style.textContent = `
    .footer {
      background: var(--bg-panel, rgba(255, 255, 255, 0.02));
      border-top: 1px solid var(--border-light, rgba(255, 255, 255, 0.05));
      padding: 16px 0 20px 0;
      margin-top: auto;
      direction: ltr;
      width: 100%;
      color: var(--text-dim, #9ca3af);
      backdrop-filter: blur(24px) saturate(160%);
      -webkit-backdrop-filter: blur(24px) saturate(160%);
      transition: background-color 0.4s, color 0.4s, border-color 0.4s;
    }
    body.light-theme .footer {
      background: var(--bg-panel, rgba(255, 255, 255, 0.5));
      border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.05));
      color: var(--text-dim, #64748b);
    }
    .footer-content { max-width: 800px; margin: 0 auto; padding: 0 16px; }
    .footer-tabs { display: flex; justify-content: center; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
    .footer-tab { font-weight: 700; font-size: 0.75rem; padding: 4px 8px; white-space: nowrap; color: inherit; text-decoration: none; position: relative; transition: color 0.3s; }
    .footer-tab::after { content: ''; position: absolute; left: 50%; transform: translateX(-50%); bottom: -2px; width: 0; height: 1.5px; background-color: var(--primary, #ff8800); transition: width 0.3s; border-radius: 99px; }
    .footer-tab.active::after, .footer-tab:hover::after { width: 100%; }
    .footer-tab.active, .footer-tab:hover { color: var(--primary, #ff8800); }
    .footer-tab.active { font-weight: 800; text-shadow: 0 0 6px var(--glow, rgba(255, 136, 0, 0.3)); }
    
    body.light-theme .footer-tab::after { background-color: var(--primary, #0080ff); }
    body.light-theme .footer-tab.active, body.light-theme .footer-tab:hover { color: var(--primary, #0080ff); }
    body.light-theme .footer-tab.active { text-shadow: 0 0 4px var(--glow, rgba(0, 128, 255, 0.2)); }
    
    .copyright { text-align: center; font-size: 0.7rem; font-weight: 700; opacity: 0.8; margin-top: 2px; }
    .footer-welcome { text-align: center; font-size: 0.8rem; font-weight: 800; color: var(--primary, #ff8800); margin-top: 12px; letter-spacing: 0.1em; text-shadow: 0 0 8px var(--glow, rgba(255, 136, 0, 0.3)); }
    body.light-theme .footer-welcome { color: var(--primary, #0ea5e9); text-shadow: 0 0 6px var(--glow, rgba(14, 165, 233, 0.2)); }
  `;
  document.head.appendChild(style);

  const footerHTML = `
    <footer class="footer">
      <div class="footer-content">
        <div class="footer-tabs">
          <a href="/index.html" class="footer-tab" data-page="index">Kanba</a>
          <a href="https://younis.pw" class="footer-tab" target="_blank" data-page="younis">Younis</a>
          <a href="/ccr.html" class="footer-tab"  data-page="ccr">Compounding Calc.</a>
          <a href="/funded" class="footer-tab" data-page="funded">All funded rules</a>
          <a href="/videos.html" class="footer-tab" target="_blank" data-page="videos">my videos</a>
        </div>
        <div class="copyright">
          © 2025-2026 Kanba_trader | All Rights Reserved
        </div>
        <div class="footer-welcome">
          ✨ WELCOME ✨
        </div>
      </div>
    </footer>
  `;

  const footerElement = document.getElementById("footer");
  if (footerElement) footerElement.innerHTML = footerHTML;

  // Active tab logic
  setTimeout(() => {
    const path = window.location.pathname.toLowerCase().trim();
    const segments = path.split("/").filter((p) => p !== "");
    let pageKey = "index";

    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1].replace(/\.html$/, "");
      if (lastSegment === "index" || lastSegment === "") {
        if (segments.length > 1) {
          pageKey = segments[segments.length - 2];
        } else {
          pageKey = "index";
        }
      } else {
        pageKey = lastSegment;
      }
    }

    document.querySelectorAll(".footer-tab").forEach((tab) => {
      const tabPage = tab.getAttribute("data-page");
      if (tabPage === pageKey) {
        tab.classList.add("active");
      }
    });
  }, 150);
});
