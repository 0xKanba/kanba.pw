/* ── State ─────────────────────────────────────────── */
let registry = null;
let activeFirm    = null;
let activeMarket  = null;
let activeAccount = null;

/* ── DOM refs ──────────────────────────────────────── */
const $ = id => document.getElementById(id);
const el = {
  loading:    $('loading'),
  content:    $('content'),
  firmBtns:   $('firm-btns'),
  marketBtns: $('market-btns'),
  accountBtns:$('account-btns'),
  firmName:   $('firm-name'),
  firmSub:    $('firm-sub'),
  lastUpdated:$('last-updated'),
  protocolId: $('protocol-id'),
  leftCol:    $('left-column'),
  rightCol:   $('right-column'),
  footerPath: $('footer-path'),
  mainContent:$('main-content'),
};

/* ── Icons ─────────────────────────────────────────── */
const ICONS = {
  risk_parameters:      `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
  trading_rules:        `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
  exposure_limits:      `<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>`,
  exposure_violation:   `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
  leverage:             `<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>`,
  payouts:              `<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>`,
  payout_methods:       `<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>`,
  payout_min_days:      `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
  payout_caps:          `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
  payout_minimums:      `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
  payout_structure:     `<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>`,
  fee_refund:           `<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>`,
  addons:               `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>`,
  account_limits:       `<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
  platforms:            `<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>`,
  challenge_journey:    `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
  ongoing_requirements: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`,
  breach_rules:         `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>`,
  default:              `<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>`,
};

function svgIcon(id) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${ICONS[id] || ICONS.default}</svg>`;
}

/* ── Init ──────────────────────────────────────────── */
async function init() {
  try {
    const res = await fetch('data/registry.json');
    registry = await res.json();
    buildFirmBtns();
    selectFirm(registry.firms[0].id);
    el.loading.classList.add('hidden');
    el.content.classList.remove('hidden');
  } catch (e) {
    console.error(e);
    el.loading.textContent = 'Error — check console.';
  }
}

/* ── Build buttons ─────────────────────────────────── */
function buildFirmBtns() {
  el.firmBtns.innerHTML = registry.firms.map(f =>
    `<button class="btn-sel" data-id="${f.id}">${f.name}</button>`
  ).join('');
  el.firmBtns.querySelectorAll('.btn-sel').forEach(b =>
    b.addEventListener('click', () => selectFirm(b.dataset.id))
  );
}

function buildMarketBtns(firm) {
  el.marketBtns.innerHTML = firm.markets.map(m =>
    `<button class="btn-sel" data-id="${m.id}">${m.name}</button>`
  ).join('');
  el.marketBtns.querySelectorAll('.btn-sel').forEach(b =>
    b.addEventListener('click', () => selectMarket(b.dataset.id))
  );
}

function buildAccountBtns(market) {
  el.accountBtns.innerHTML = market.accounts.map(a =>
    `<button class="btn-sel" data-id="${a.id}">${a.name}</button>`
  ).join('');
  el.accountBtns.querySelectorAll('.btn-sel').forEach(b =>
    b.addEventListener('click', () => selectAccount(b.dataset.id))
  );
}

/* ── Set active ────────────────────────────────────── */
function setActive(container, id) {
  container.querySelectorAll('.btn-sel').forEach(b => {
    b.classList.toggle('active', b.dataset.id === id);
  });
}

/* ── Select helpers ────────────────────────────────── */
function selectFirm(id) {
  activeFirm = registry.firms.find(f => f.id === id);
  setActive(el.firmBtns, id);
  buildMarketBtns(activeFirm);
  selectMarket(activeFirm.markets[0].id);
}

function selectMarket(id) {
  activeMarket = activeFirm.markets.find(m => m.id === id);
  setActive(el.marketBtns, id);
  buildAccountBtns(activeMarket);
  selectAccount(activeMarket.accounts[0].id);
}

function selectAccount(id) {
  activeAccount = activeMarket.accounts.find(a => a.id === id);
  setActive(el.accountBtns, id);
  loadAndRender();
}

/* ── Load JSON + render ────────────────────────────── */
async function loadAndRender() {
  if (!activeAccount) return;
  try {
    const res  = await fetch(activeAccount.path);
    const data = await res.json();
    render(data.firm);
  } catch (e) {
    console.error('Failed to load:', activeAccount.path, e);
  }
}

/* ── Render ────────────────────────────────────────── */
function render(d) {
  /* animation */
  el.mainContent.classList.remove('anim');
  void el.mainContent.offsetWidth;
  el.mainContent.classList.add('anim');

  /* header */
  el.firmName.textContent = d.name.toUpperCase();
  el.firmName.href        = activeFirm.url || '#';
  el.firmSub.textContent  = `${d.type}  ·  ${d.model}`;
  el.lastUpdated.textContent = `Updated ${d.last_updated}`;
  el.protocolId.textContent  = `${activeAccount.id}.json`;
  el.footerPath.textContent  = `kanba.pw/funded/${activeFirm.id}/${activeMarket.id}/${activeAccount.id}`;

  const itemSecs  = d.sections.filter(s => s.items);
  const tableSecs = d.sections.filter(s => s.table);

  /* left — items */
  el.leftCol.innerHTML = itemSecs.map(sec => `
    <div class="section-card">
      <div class="sec-head">
        ${svgIcon(sec.id)}
        <h2>${sec.title}</h2>
      </div>
      <div class="items-list">
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

  /* right — tables */
  el.rightCol.innerHTML = tableSecs.map(sec => `
    <div class="table-section">
      <div class="sec-head-table">
        ${svgIcon(sec.id)}
        <h2>${sec.title}</h2>
      </div>
      <div class="tbl-wrap">
        <table class="rules-table">
          <thead><tr>${sec.table.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${sec.table.rows.map(row =>
            `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`
          ).join('')}</tbody>
        </table>
      </div>
    </div>
  `).join('') + `
    <div class="right-note">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <p>Reference data for <strong>${d.name}</strong> ${d.type} — ${d.model}.<br>
      Verify all rules against official documentation before trading.</p>
    </div>
  `;
}

init();
