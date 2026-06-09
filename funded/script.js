/* ╔══════════════════════════════════════════════════════════════╗
   ║  PropRules · script.js                                      ║
   ║  Deep linking: /funded/?firm=X&market=Y&account=Z           ║
   ║  URL syncs on every pill click — shareable at any state     ║
   ╚══════════════════════════════════════════════════════════════╝ */

const App = (() => {

  /* ── State ─────────────────────────────────────────────────── */
  const state = {
    registry: null,   // full registry.json
    firm:     null,   // active firm object
    market:   null,   // active market object
    account:  null,   // active account object
  };

  /* ── DOM refs ───────────────────────────────────────────────── */
  const dom = {
    loading:     document.getElementById('loading'),
    content:     document.getElementById('content'),
    firmPills:   document.getElementById('firm-pills'),
    marketPills: document.getElementById('market-pills'),
    accountPills:document.getElementById('account-pills'),
    firmLink:    document.getElementById('firm-name-link'),
    firmSub:     document.getElementById('firm-subtitle'),
    lastUpdated: document.getElementById('last-updated'),
    protoId:     document.getElementById('proto-id'),
    leftCol:     document.getElementById('left-col'),
    rightCol:    document.getElementById('right-col'),
    footerPath:  document.getElementById('footer-path'),
    dashboard:   document.getElementById('dashboard'),
  };

  /* ── URL helpers ────────────────────────────────────────────── */

  /** Read the 3 params from current URL */
  function readURL() {
    const p = new URLSearchParams(window.location.search);
    return {
      firm:    p.get('firm')    || null,
      market:  p.get('market')  || null,
      account: p.get('account') || null,
    };
  }

  /** Push new URL without reloading — keeps browser history */
  function writeURL(firmId, marketId, accountId) {
    const p = new URLSearchParams();
    if (firmId)    p.set('firm',    firmId);
    if (marketId)  p.set('market',  marketId);
    if (accountId) p.set('account', accountId);

    const base = window.location.pathname;           // e.g. /funded/
    const hash = window.location.hash;               // keep existing hash
    const next = `${base}?${p.toString()}${hash}`;
    if (window.location.href !== window.location.origin + next) {
      history.pushState({ firmId, marketId, accountId }, '', next);
    }
  }

  /* ── Resolve state from URL params or defaults ───────────────── */

  /**
   * Given optional ids, resolve to valid firm/market/account objects.
   * Falls back gracefully to first available if ids are missing or invalid.
   */
  function resolveState({ firm: firmId, market: marketId, account: accountId }) {
    // Firm
    const firm = (firmId && state.registry.firms.find(f => f.id === firmId))
      || state.registry.firms[0];

    // Market
    const market = (marketId && firm.markets.find(m => m.id === marketId))
      || firm.markets[0];

    // Account
    const account = (accountId && market.accounts.find(a => a.id === accountId))
      || market.accounts[0];

    return { firm, market, account };
  }

  /* ── Pill builders ──────────────────────────────────────────── */

  function buildPills(container, items, activeId, onClickId) {
    container.innerHTML = '';
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'pill' + (item.id === activeId ? ' active' : '');
      btn.textContent = item.name;
      btn.dataset.id  = item.id;
      
      btn.setAttribute('aria-pressed', item.id === activeId ? 'true' : 'false');
      btn.addEventListener('click', () => onClickId(item.id));
      container.appendChild(btn);
    });
  }

  function activatePill(container, id) {
    container.querySelectorAll('.pill').forEach(b => {
      const on = b.dataset.id === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* ── Pill click handlers ────────────────────────────────────── */

  function onFirmClick(firmId) {
    const { firm, market, account } = resolveState({ firm: firmId });
    applyState(firm, market, account, true);
  }

  function onMarketClick(marketId) {
    const { market, account } = resolveState({
      firm:    state.firm.id,
      market:  marketId,
    });
    applyState(state.firm, market, account, true);
  }

  function onAccountClick(accountId) {
    const { account } = resolveState({
      firm:    state.firm.id,
      market:  state.market.id,
      account: accountId,
    });
    applyState(state.firm, state.market, account, true);
  }

  /* ── Apply state ────────────────────────────────────────────── */

  /**
   * Central state setter.
   * @param {object}  firm
   * @param {object}  market
   * @param {object}  account
   * @param {boolean} pushHistory — true when user clicks a pill
   */
  function applyState(firm, market, account, pushHistory = false) {
    state.firm    = firm;
    state.market  = market;
    state.account = account;

    /* sync pills */
    activatePill(dom.firmPills, firm.id);

    buildPills(dom.marketPills, firm.markets, market.id, onMarketClick);

    buildPills(dom.accountPills, market.accounts, account.id, onAccountClick);

    /* sync URL */
    if (pushHistory) {
      writeURL(firm.id, market.id, account.id);
    }

    /* render */
    loadAndRender();
  }

  /* ── Load JSON + render ─────────────────────────────────────── */

  async function loadAndRender() {
    if (!state.account) return;
    try {
      const res = await fetch(state.account.path);
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${state.account.path}`);
      const data = await res.json();
      render(data.firm);
      
      // Wait for rendering then jump to hash
      if (window.location.hash) {
        setTimeout(() => {
          const target = document.querySelector(window.location.hash);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      }
    } catch (err) {
      console.error('[PropRules] Failed to load account JSON:', err);
      dom.leftCol.innerHTML = `
        <div class="s-card">
          <p class="item-detail" style="color:var(--c-text)">
            ⚠ Could not load data for <strong>${state.account.id}</strong>.<br>
            Check that the file exists at: <code>${state.account.path}</code>
          </p>
        </div>`;
      dom.rightCol.innerHTML = '';
    }
  }

  /* ── Icons ──────────────────────────────────────────────────── */

  const ICONS = {
    risk_parameters:      ['circle cx="12" cy="12" r="10"','line x1="12" y1="8" x2="12" y2="12"','line x1="12" y1="16" x2="12.01" y2="16"'],
    trading_rules:        ['circle cx="12" cy="12" r="10"','polyline points="12 6 12 12 16 14"'],
    exposure_limits:      ['line x1="12" y1="20" x2="12" y2="10"','line x1="18" y1="20" x2="18" y2="4"','line x1="6" y1="20" x2="6" y2="16"'],
    exposure_violation:   ['path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"','line x1="12" y1="9" x2="12" y2="13"','line x1="12" y1="17" x2="12.01" y2="17"'],
    leverage:             ['polyline points="22 7 13.5 15.5 8.5 10.5 2 17"','polyline points="16 7 22 7 22 13"'],
    payouts:              ['rect x="1" y="4" width="22" height="16" rx="2"','line x1="1" y1="10" x2="23" y2="10"'],
    payout_methods:       ['line x1="12" y1="1" x2="12" y2="23"','path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"'],
    payout_min_days:      ['rect x="3" y="4" width="18" height="18" rx="2"','line x1="16" y1="2" x2="16" y2="6"','line x1="8" y1="2" x2="8" y2="6"','line x1="3" y1="10" x2="21" y2="10"'],
    payout_caps:          ['polyline points="22 12 18 12 15 21 9 3 6 12 2 12"'],
    payout_minimums:      ['circle cx="12" cy="12" r="10"','polyline points="12 6 12 12 16 14"'],
    payout_example:       ['rect x="1" y="4" width="22" height="16" rx="2"','line x1="1" y1="10" x2="23" y2="10"'],
    payout_structure:     ['rect x="1" y="4" width="22" height="16" rx="2"','line x1="1" y1="10" x2="23" y2="10"'],
    fee_refund:           ['polyline points="1 4 1 10 7 10"','path d="M3.51 15a9 9 0 1 0 .49-3.51"'],
    addons:               ['circle cx="12" cy="12" r="10"','line x1="12" y1="8" x2="12" y2="16"','line x1="8" y1="12" x2="16" y2="12"'],
    account_limits:       ['rect x="3" y="11" width="18" height="11" rx="2"','path d="M7 11V7a5 5 0 0 1 10 0v4"'],
    account_sizes:        ['rect x="2" y="3" width="20" height="14" rx="2"','line x1="8" y1="21" x2="16" y2="21"','line x1="12" y1="17" x2="12" y2="21"'],
    platforms:            ['rect x="2" y="3" width="20" height="14" rx="2"','line x1="8" y1="21" x2="16" y2="21"','line x1="12" y1="17" x2="12" y2="21"'],
    challenge_journey:    ['polyline points="22 12 18 12 15 21 9 3 6 12 2 12"'],
    ongoing_requirements: ['path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"'],
    restricted_products:  ['path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"','line x1="12" y1="9" x2="12" y2="13"','line x1="12" y1="17" x2="12.01" y2="17"'],
    breach_rules:         ['path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"'],
    default:              ['circle cx="12" cy="12" r="10"','line x1="12" y1="16" x2="12" y2="12"','line x1="12" y1="8" x2="12.01" y2="8"'],
  };

  function icon(id) {
    const parts = ICONS[id] || ICONS.default;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${parts.map(p => `<${p}/>`).join('')}</svg>`;
  }

  /* ── Render dashboard ───────────────────────────────────────── */

  function render(d) {
    /* header */
    dom.firmLink.textContent    = d.name.toUpperCase();
    dom.firmLink.href           = state.firm.url || '#';
    dom.firmSub.textContent     = `${d.type}  ·  ${d.model}`;
    dom.lastUpdated.textContent = `Updated ${d.last_updated}`;
    dom.protoId.textContent     = `${state.account.id}.json`;
    dom.footerPath.textContent  =
      `kanba.pw/funded/?firm=${state.firm.id}&market=${state.market.id}&account=${state.account.id}`;

    const itemSecs  = d.sections.filter(s => s.items);
    const tableSecs = d.sections.filter(s => s.table);

    /* left — item cards */
    dom.leftCol.innerHTML = itemSecs.map((sec, i) => {
      const sectionId = sec.title.replace(/\s+/g, '');
      return `
      <div class="s-card" id="${sectionId}">
        <div class="s-head">
          <a href="#${sectionId}" style="color:inherit; text-decoration:none; display:flex; align-items:center; gap:10px;">
            ${icon(sec.id)}<h2>${sec.title}</h2>
          </a>
        </div>
        <div class="items">
          ${sec.items.map(item => `
            <div class="item-row">
              <div class="item-top">
                <span class="item-label">${item.label}</span>
                <span class="item-value">${item.value}</span>
              </div>
              ${item.detail ? `<p class="item-detail">${item.detail}</p>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `}).join('');

    /* right — table sections + note */
    dom.rightCol.innerHTML = tableSecs.map((sec, i) => {
      const sectionId = sec.title.replace(/\s+/g, '');
      return `
      <div class="t-section" id="${sectionId}">
        <div class="t-head">
          <a href="#${sectionId}" style="color:inherit; text-decoration:none; display:flex; align-items:center; gap:10px;">
            ${icon(sec.id)}<h2>${sec.title}</h2>
          </a>
        </div>
        <div class="tbl-wrap">
          <table>
            <thead><tr>${sec.table.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${sec.table.rows.map(row =>
              `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`
            ).join('')}</tbody>
          </table>
        </div>
      </div>
    `}).join('') + `
      <div class="r-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <p>Reference for <strong>${d.name}</strong> ${d.type} — ${d.model}.<br>
        Always verify against official documentation before trading.</p>
      </div>`;
  }

  /* ── Browser back/forward support ───────────────────────────── */

  window.addEventListener('popstate', (e) => {
    const ids = e.state || readURL();
    const { firm, market, account } = resolveState(ids);
    // apply without pushing to history (we're navigating existing history)
    state.firm    = firm;
    state.market  = market;
    state.account = account;
    activatePill(dom.firmPills, firm.id);
    buildPills(dom.marketPills, firm.markets, market.id, onMarketClick);
    buildPills(dom.accountPills, market.accounts, account.id, onAccountClick);
    loadAndRender();
  });

  /* ── Theme Toggle ───────────────────────────────────────────── */
  function initTheme() {
    const toggleBtn = document.getElementById('themeToggle');
    if (!toggleBtn) return;
    
    const currentTheme = localStorage.getItem('theme');
    // We start dark by default (since we mapped kanba dark to root)
    if (currentTheme === 'light') {
      document.body.classList.add('light-theme');
    } else if (currentTheme === 'dark') {
      document.body.classList.remove('light-theme');
    }
    
    toggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      if (document.body.classList.contains('light-theme')) {
        localStorage.setItem('theme', 'light');
      } else {
        localStorage.setItem('theme', 'dark');
      }
    });
  }

  /* ── Init ───────────────────────────────────────────────────── */

  async function init() {
    initTheme();
    try {
      const dataUrl = window.location.pathname.includes('/funded/') 
        ? 'data/registry.json' 
        : '/funded/data/registry.json';
        
      const res = await fetch(dataUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.registry = await res.json();

      /* build firm pills first (always all firms) */
      buildPills(dom.firmPills, state.registry.firms, null, onFirmClick);

      /* resolve initial state from URL or defaults */
      const urlIds = readURL();
      const { firm, market, account } = resolveState(urlIds);

      /* write clean URL if params were missing/partial */
      const hasAllParams = urlIds.firm && urlIds.market && urlIds.account;
      if (!hasAllParams) {
        writeURL(firm.id, market.id, account.id);
      }

      /* apply (without pushing history — page just loaded) */
      state.firm    = firm;
      state.market  = market;
      state.account = account;

      activatePill(dom.firmPills, firm.id);
      buildPills(dom.marketPills, firm.markets, market.id, onMarketClick);
      buildPills(dom.accountPills, market.accounts, account.id, onAccountClick);

      await loadAndRender();

      dom.loading.classList.add('hidden');
      dom.content.classList.remove('hidden');

    } catch (err) {
      console.error('[PropRules] Init failed:', err);
      dom.loading.innerHTML =
        `<p style="font-family:monospace;font-size:12px;opacity:.6">
          Error loading registry.json — check console. Did you upload the /data folder?
        </p>`;
    }
  }

  return { init };

})();

document.addEventListener('DOMContentLoaded', App.init);
