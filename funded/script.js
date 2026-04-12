/* ╔══════════════════════════════════════════════════╗
   ║  PropRules · script.js                          ║
   ║  Clean state tree — no globals except `App`     ║
   ╚══════════════════════════════════════════════════╝ */

const App = (() => {

  /* ── State ──────────────────────────────────────── */
  const state = {
    registry: null,
    firm:     null,
    market:   null,
    account:  null,
  };

  /* ── DOM ────────────────────────────────────────── */
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
    mainSection: document.getElementById('account-header'),
  };

  /* ── Icons ──────────────────────────────────────── */
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
    const paths = parts.map(p => `<${p}/>`).join('');
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }

  /* ── Pill builder ───────────────────────────────── */
  function buildPills(container, items, activeId, onClick) {
    container.innerHTML = '';
    items.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'pill' + (item.id === activeId ? ' active' : '');
      btn.textContent = item.name;
      btn.dataset.id = item.id;
      btn.setAttribute('aria-pressed', item.id === activeId ? 'true' : 'false');
      btn.addEventListener('click', () => onClick(item.id));
      container.appendChild(btn);
    });
  }

  function setActive(container, id) {
    container.querySelectorAll('.pill').forEach(b => {
      const active = b.dataset.id === id;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  /* ── Selection handlers ─────────────────────────── */
  function selectFirm(id) {
    state.firm   = state.registry.firms.find(f => f.id === id);
    state.market = state.firm.markets[0];
    state.account = state.market.accounts[0];
    setActive(dom.firmPills, id);
    buildPills(dom.marketPills, state.firm.markets, state.market.id, selectMarket);
    buildPills(dom.accountPills, state.market.accounts, state.account.id, selectAccount);
    loadAndRender();
  }

  function selectMarket(id) {
    state.market  = state.firm.markets.find(m => m.id === id);
    state.account = state.market.accounts[0];
    setActive(dom.marketPills, id);
    buildPills(dom.accountPills, state.market.accounts, state.account.id, selectAccount);
    loadAndRender();
  }

  function selectAccount(id) {
    state.account = state.market.accounts.find(a => a.id === id);
    setActive(dom.accountPills, id);
    loadAndRender();
  }

  /* ── Fetch + render ─────────────────────────────── */
  async function loadAndRender() {
    if (!state.account) return;
    try {
      const res  = await fetch(state.account.path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      render(data.firm);
    } catch (err) {
      console.error('[PropRules] Failed to load:', state.account.path, err);
      dom.leftCol.innerHTML  = `<div class="s-card"><p class="item-detail">Failed to load data. Check console.</p></div>`;
      dom.rightCol.innerHTML = '';
    }
  }

  /* ── Render dashboard ───────────────────────────── */
  function render(d) {
    /* fade-in animation */
    const wrap = document.getElementById('dashboard');
    wrap.classList.remove('anim');
    void wrap.offsetWidth;
    wrap.classList.add('anim');

    /* header */
    dom.firmLink.textContent = d.name.toUpperCase();
    dom.firmLink.href        = state.firm.url || '#';
    dom.firmSub.textContent  = `${d.type}  ·  ${d.model}`;
    dom.lastUpdated.textContent = `Updated ${d.last_updated}`;
    dom.protoId.textContent     = `${state.account.id}.json`;
    dom.footerPath.textContent  = `kanba.pw/funded/${state.firm.id}/${state.market.id}/${state.account.id}`;

    /* split sections */
    const itemSections  = d.sections.filter(s => s.items);
    const tableSections = d.sections.filter(s => s.table);

    /* left — item cards */
    dom.leftCol.innerHTML = itemSections.map(sec => `
      <div class="s-card">
        <div class="s-head">${icon(sec.id)}<h2>${sec.title}</h2></div>
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
    `).join('');

    /* right — tables + note */
    dom.rightCol.innerHTML = tableSections.map(sec => `
      <div class="t-section">
        <div class="t-head">${icon(sec.id)}<h2>${sec.title}</h2></div>
        <div class="tbl-wrap">
          <table>
            <thead><tr>${sec.table.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${sec.table.rows.map(row =>
              `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`
            ).join('')}</tbody>
          </table>
        </div>
      </div>
    `).join('') + `
      <div class="r-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <p>Reference data for <strong>${d.name}</strong> ${d.type} — ${d.model}.<br>
        Always verify against official documentation before trading.</p>
      </div>
    `;
  }

  /* ── Init ───────────────────────────────────────── */
  async function init() {
    try {
      const res = await fetch('data/registry.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.registry = await res.json();

      const firms = state.registry.firms;
      state.firm    = firms[0];
      state.market  = state.firm.markets[0];
      state.account = state.market.accounts[0];

      buildPills(dom.firmPills,    firms,                state.firm.id,    selectFirm);
      buildPills(dom.marketPills,  state.firm.markets,   state.market.id,  selectMarket);
      buildPills(dom.accountPills, state.market.accounts,state.account.id, selectAccount);

      await loadAndRender();

      dom.loading.classList.add('hidden');
      dom.content.classList.remove('hidden');
    } catch (err) {
      console.error('[PropRules] Init failed:', err);
      dom.loading.innerHTML = '<p style="font-family:monospace;font-size:12px;color:#888">Error loading data — check console.</p>';
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
