let registryData = null;
let currentFirm = null;
let currentMarket = null;
let currentAccount = null;

const elements = {
    loading: document.getElementById('loading'),
    content: document.getElementById('content'),
    firmSelect: document.getElementById('firm-select'),
    marketSelect: document.getElementById('market-select'),
    accountSelect: document.getElementById('account-select'),
    firmName: document.getElementById('firm-name'),
    firmTypeModel: document.getElementById('firm-type-model'),
    lastUpdated: document.getElementById('last-updated'),
    protocolId: document.getElementById('protocol-id'),
    leftColumn: document.getElementById('left-column'),
    rightColumn: document.getElementById('right-column'),
    footerPath: document.getElementById('footer-path'),
    mainContent: document.getElementById('main-content')
};

async function init() {
    try {
        const response = await fetch('data/registry.json');
        registryData = await response.json();
        
        setupSelectors();
        await loadAccountData();
        
        elements.loading.classList.add('hidden');
        elements.content.classList.remove('hidden');
        lucide.createIcons();
    } catch (error) {
        console.error('Initialization failed:', error);
        elements.loading.textContent = 'Error loading protocol data.';
    }
}

function setupSelectors() {
    // Populate Firms
    elements.firmSelect.innerHTML = registryData.firms.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    
    elements.firmSelect.addEventListener('change', (e) => {
        const firm = registryData.firms.find(f => f.id === e.target.value);
        updateMarkets(firm);
    });

    elements.marketSelect.addEventListener('change', (e) => {
        const firm = registryData.firms.find(f => f.id === elements.firmSelect.value);
        const market = firm.markets.find(m => m.id === e.target.value);
        updateAccounts(market);
    });

    elements.accountSelect.addEventListener('change', loadAccountData);

    // Initial population
    updateMarkets(registryData.firms[0]);
}

function updateMarkets(firm) {
    elements.marketSelect.innerHTML = firm.markets.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    updateAccounts(firm.markets[0]);
}

function updateAccounts(market) {
    elements.accountSelect.innerHTML = market.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    loadAccountData();
}

async function loadAccountData() {
    const firmId = elements.firmSelect.value;
    const marketId = elements.marketSelect.value;
    const accountId = elements.accountSelect.value;

    const firm = registryData.firms.find(f => f.id === firmId);
    const market = firm.markets.find(m => m.id === marketId);
    const account = market.accounts.find(a => a.id === accountId);

    try {
        const response = await fetch(account.path);
        const data = await response.json();
        renderDashboard(data.firm, account, firmId, marketId);
    } catch (error) {
        console.error('Failed to load account data:', error);
    }
}

function renderDashboard(firmData, account, firmId, marketId) {
    // Animation trigger
    elements.mainContent.classList.remove('animate-slide');
    void elements.mainContent.offsetWidth; // trigger reflow
    elements.mainContent.classList.add('animate-slide');

    elements.firmName.textContent = firmData.name.toUpperCase();
    elements.firmTypeModel.textContent = `${firmData.type} — ${firmData.model}`;
    elements.lastUpdated.textContent = `Last Updated: ${firmData.last_updated}`;
    elements.protocolId.textContent = `${account.id}.json`;
    elements.footerPath.textContent = `kanba.pw/funded/${firmId}/${marketId}/${account.id}.json`;

    // Render Left Column (Items)
    const itemSections = firmData.sections.filter(s => s.items);
    elements.leftColumn.innerHTML = itemSections.map((section, idx) => `
        <section class="p-6 md:p-8 border-foreground/10 ${idx % 2 !== 0 ? 'md:border-l' : ''} ${idx > 1 ? 'border-t' : ''}">
            <div class="flex items-center gap-2 mb-6 md:mb-8 opacity-40">
                <i data-lucide="${getIconName(section.id)}" class="w-4 h-4"></i>
                <h2 class="text-[9px] md:text-[10px] font-mono uppercase tracking-[0.3em] italic">
                    ${section.title}
                </h2>
            </div>
            <div class="space-y-6">
                ${section.items.map(item => `
                    <div class="group">
                        <div class="flex justify-between items-baseline mb-1">
                            <span class="text-[10px] md:text-xs font-medium opacity-60 uppercase tracking-wider">${item.label}</span>
                            <span class="font-mono text-base md:text-lg font-bold">${item.value}</span>
                        </div>
                        <p class="text-[10px] md:text-[11px] leading-relaxed opacity-40 max-w-[90%] md:max-w-[80%]">
                            ${item.detail}
                        </p>
                    </div>
                `).join('')}
            </div>
        </section>
    `).join('');

    // Render Right Column (Tables)
    const tableSections = firmData.sections.filter(s => s.table);
    elements.rightColumn.innerHTML = tableSections.map(section => `
        <section class="p-6 md:p-8">
            <div class="flex items-center gap-2 mb-6 md:mb-8 opacity-40">
                <i data-lucide="${getIconName(section.id)}" class="w-4 h-4"></i>
                <h2 class="text-[9px] md:text-[10px] font-mono uppercase tracking-[0.3em] italic">
                    ${section.title}
                </h2>
            </div>
            <div class="border border-foreground/10 overflow-x-auto">
                <table class="w-full text-left border-collapse min-w-[200px]">
                    <thead>
                        <tr class="bg-foreground/5">
                            ${section.table.headers.map(h => `
                                <th class="p-2 md:p-3 text-[9px] md:text-[10px] font-mono uppercase tracking-widest opacity-60 border-b border-foreground/10">
                                    ${h}
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${section.table.rows.map(row => `
                            <tr class="hover:bg-foreground/[0.03] transition-colors">
                                ${row.map(cell => `
                                    <td class="p-2 md:p-3 text-[10px] md:text-xs font-mono border-b border-foreground/5 last:border-b-0">
                                        ${cell}
                                    </td>
                                `).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </section>
    `).join('') + `
        <div class="p-6 md:p-8 mt-auto border-t border-foreground/10">
            <div class="flex items-start gap-3 opacity-30">
                <i data-lucide="shield" class="w-4 h-4 mt-1 shrink-0"></i>
                <p class="text-[9px] md:text-[10px] leading-relaxed">
                    Technical reference for ${firmData.name} ${firmData.type} protocol. 
                    Data integrity verified against official documentation.
                </p>
            </div>
        </div>
    `;

    lucide.createIcons();
}

function getIconName(id) {
    switch (id) {
        case "challenge_journey": return "activity";
        case "risk_parameters": return "target";
        case "trading_rules": return "clock";
        case "exposure_limits": return "scale";
        case "payout_structure": return "credit-card";
        default: return "info";
    }
}

init();
