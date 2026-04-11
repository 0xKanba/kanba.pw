/* ── State ─────────────────────────────────────────── */
let registryData = null;

const el = {
  loading:      document.getElementById('loading'),
  content:      document.getElementById('content'),
  firmSelect:   document.getElementById('firm-select'),
  marketSelect: document.getElementById('market-select'),
  accountSelect:document.getElementById('account-select'),
  firmName:     document.getElementById('firm-name'),
  firmTypeModel:document.getElementById('firm-type-model'),
  lastUpdated:  document.getElementById('last-updated'),
  protocolId:   document.getElementById('protocol-id'),
  leftColumn:   document.getElementById('left-column'),
  rightColumn:  document.getElementById('right-column'),
  footerPath:   document.getElementById('footer-path'),
  mainContent:  document.getElementById('main-content'),
};

/* ── Icon map ──────────────────────────────────────── */
const ICONS = {
  risk_parameters:    `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
  trading_rules:      `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
  exposure_limits:    `<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>`,
  exposure_violation: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
  leverage:           `<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>`,
  payouts:            `<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>`,
  payout_methods:     `<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>`,
  fee_refund:         `<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>`,
  addons:             `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>`,
  account_limits:     `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
  platforms:          `<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>`,
  challenge_journey:  `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
  default:            `<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>`,
};

function icon(id) {
  const path = ICONS[id] || ICONS.default;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    ${path}</svg>`;
}

/* ── Init ──────────────────────────────────────────── */
async function init() {
  try {
    const res = await fetch('data/registry.json');
    registryData = await res.json();
    setupSelectors();
    await loadAccount();
    el.loading.classList.add('hidden');
    el.content.classList.remove('hidden');
  } catch (err) {
    console.error(err);
    el.loading.textContent = 'Failed to load data. Check console.';
  }
}

/* ── Selectors ─────────────────────────────────────── */
function setupSelectors() {
  el.firmSelect.innerHTML = registryData.firms
    .map(f => `<option value="${f.id}">${f.name}</option>`).join('');

  el.firmSelect.addEventListener('change', () => {
    const firm = getFirm();
    updateMarkets(firm);
  });

  el.marketSelect.addEventListener('change', () => {
    const market = getMarket();
    updateAccounts(market);
  });

  el.accountSelect.addEventListener('change', loadAccount);

  updateMarkets(registryData.firms[0]);
}

function updateMarkets(firm) {
  el.marketSelect.innerHTML = firm.markets
    .map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  updateAccounts(firm.markets[0]);
}

function updateAccounts(market) {
  el.accountSelect.innerHTML = market.accounts
    .map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  loadAccount();
}

/* ── Helpers ───────────────────────────────────────── */
function getFirm()    { return registryData.firms.find(f => f.id === el.firmSelect.value); }
function getMarket()  { const f = getFirm(); return f.markets.find(m => m.id === el.marketSelect.value); }
function getAccount() { const m = getMarket(); return m.accounts.find(a => a.id === el.accountSelect.value); }

/* ── Load account JSON ─────────────────────────────── */
async function loadAccount() {
  const firm    = getFirm();
  const account = getAccount();
  if (!firm || !account) return;
  try {
    const res  = await fetch(account.path);
    const data = await res.json();
    render(data.firm, firm, account);
  } catch (err) {
    console.error('Failed to load account JSON:', err);
  }
}

/* ── Render ────────────────────────────────────────── */
function render(firmData, firmMeta, account) {
  /* animate */
  el.mainContent.style.animation = 'none';
  void el.mainContent.offsetWidth;
  el.mainContent.classList.add('animate-in');
  el.mainContent.style.animation = '';

  /* header */
  el.firmName.textContent = firmData.name.toUpperCase();
  el.firmName.href = firmMeta.url || '#';
  el.firmTypeModel.textContent = `${firmData.type} — ${firmData.model}`;
  el.lastUpdated.textContent   = `Updated: ${firmData.last_updated}`;
  el.protocolId.textContent    = `${account.id}.json`;
  el.footerPath.textContent    = `kanba.pw/funded/${firmMeta.id}/${el.marketSelect.value}/${account.id}`;

  /* split sections */
  const itemSections  = firmData.sections.filter(s => s.items);
  const tableSections = firmData.sections.filter(s => s.table);

  /* left column — item sections */
  el.leftColumn.innerHTML = itemSections.map(section => `
    <div class="section-card">
      <div class="section-title">
        ${icon(section.id)}
        <h2>${section.title}</h2>
      </div>
      <div class="items-list">
        ${section.items.map(item => `
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

  /* right column — table sections + footer note */
  el.rightColumn.innerHTML = tableSections.map(section => `
    <div class="table-section">
      <div class="section-title">
        ${icon(section.id)}
        <h2>${section.title}</h2>
      </div>
      <div style="overflow-x:auto;">
        <table class="rules-table">
          <thead>
            <tr>${section.table.headers.map(h => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${section.table.rows.map(row => `
              <tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('') + `
    <div class="right-footer">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <p>Reference for ${firmData.name} ${firmData.type} — ${firmData.model}.<br>
      Verify against official documentation before trading.</p>
    </div>
  `;
}

/* ── Start ─────────────────────────────────────────── */
init();
