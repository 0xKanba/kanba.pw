const API_URL = 'https://api.hyperliquid.xyz/info';
let currentMonth = new Date();
let allFills = [];
let dailyPnLMap = {};

// Elements
const searchForm = document.getElementById('searchForm');
const walletInput = document.getElementById('walletInput');
const searchBtn = document.getElementById('searchBtn');
const dashboard = document.getElementById('dashboard');
const emptyState = document.getElementById('emptyState');
const calendarDays = document.getElementById('calendarDays');
const monthYearText = document.getElementById('currentMonthYear');
const modal = document.getElementById('modalOverlay');

// Auto-select on focus
walletInput.onfocus = () => walletInput.select();

// Initialize
(function init() {
    const query = window.location.search.substring(1);
    const potentialAddr = query.split('&')[0]; // Handle cases with extra params
    if (potentialAddr && potentialAddr.startsWith('0x') && potentialAddr.length === 42) {
        walletInput.value = potentialAddr;
        performAnalysis(potentialAddr);
    }
})();

searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const addr = walletInput.value.trim();
    if (addr) performAnalysis(addr);
});

async function performAnalysis(addr) {
    if (addr.length !== 42) return alert('يرجى إدخال عنوان صحيح');
    
    toggleLoading(true);
    updateURL(addr);
    
    try {
        allFills = await fetchUserFills(addr);
        dailyPnLMap = aggregatePnL(allFills);
        
        renderCalendar();
        renderStats();
        
        dashboard.classList.remove('hidden');
        emptyState.classList.add('hidden');
    } catch (err) {
        showError(err.message);
    } finally {
        toggleLoading(false);
    }
}

async function fetchUserFills(user) {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'userFills', user })
    });
    if (!res.ok) throw new Error('فشل جلب البيانات');
    return await res.json();
}

function aggregatePnL(fills) {
    const map = {};
    fills.forEach(f => {
        const date = new Date(f.time).toISOString().split('T')[0];
        const pnl = parseFloat(f.closedPnl) - parseFloat(f.fee);
        map[date] = (map[date] || 0) + pnl;
    });
    return map;
}

function renderStats() {
    const now = Date.now();
    const calc = (days) => {
        const threshold = now - (days * 24 * 60 * 60 * 1000);
        return allFills
            .filter(f => f.time >= threshold)
            .reduce((acc, f) => acc + (parseFloat(f.closedPnl) - parseFloat(f.fee)), 0);
    };

    const allTime = allFills.reduce((acc, f) => acc + (parseFloat(f.closedPnl) - parseFloat(f.fee)), 0);

    const updateEl = (id, val) => {
        const el = document.getElementById(id);
        el.innerText = (val >= 0 ? '+' : '-') + '$' + Math.abs(val).toFixed(2); // Two decimals
        el.className = 'stat-value ' + (val >= 0 ? 'profit' : 'loss');
    };

    updateEl('stats24h', calc(1));
    updateEl('stats7d', calc(7));
    updateEl('stats30d', calc(30));
    updateEl('statsAll', allTime);
}

function renderCalendar() {
    calendarDays.innerHTML = '';
    const start = dateFns.startOfMonth(currentMonth);
    const end = dateFns.endOfMonth(start);
    const startWeek = dateFns.startOfWeek(start, { weekStartsOn: 1 }); // Monday start
    const endWeek = dateFns.endOfWeek(end, { weekStartsOn: 1 });

    monthYearText.innerText = dateFns.format(currentMonth, 'MMMM yyyy');

    const days = dateFns.eachDayOfInterval({ start: startWeek, end: endWeek });

    days.forEach(day => {
        const dateKey = dateFns.format(day, 'yyyy-MM-dd');
        const pnl = dailyPnLMap[dateKey] || 0;
        const isCurrentMonth = dateFns.isSameMonth(day, start);
        
        const box = document.createElement('div');
        box.className = `day-box ${!isCurrentMonth ? 'not-current' : ''}`;
        
        // Coloring based on profit/loss
        if (pnl > 0.01) box.classList.add('box-profit');
        if (pnl < -0.01) box.classList.add('box-loss');

        box.innerHTML = `
            <span class="day-num">${dateFns.format(day, 'd')}</span>
            <div class="day-val">${pnl !== 0 ? (pnl > 0 ? '$' : '-$') + Math.abs(pnl).toFixed(2) : ''}</div>
        `;

        if (isCurrentMonth) {
            box.onclick = () => showDailyAudit(day);
        }

        calendarDays.appendChild(box);
    });
}

function showDailyAudit(date) {
    const dateKey = dateFns.format(date, 'yyyy-MM-dd');
    const dayFills = allFills.filter(f => new Date(f.time).toISOString().split('T')[0] === dateKey);
    
    document.getElementById('tradeSubtitle').innerText = `تفاصيل الصفقات ليوم ${dateFns.format(date, 'd MMMM yyyy')}`;
    const container = document.getElementById('dayFills');
    container.innerHTML = '';

    if (dayFills.length === 0) {
        container.innerHTML = '<p style="text-align:center; opacity:0.3; padding: 2rem;">لا توجد صفقات مغلقة هذا اليوم</p>';
    } else {
        dayFills.forEach(f => {
            const pnl = parseFloat(f.closedPnl) - parseFloat(f.fee);
            const card = document.createElement('div');
            card.className = 'trade-card';
            card.innerHTML = `
                <div class="trade-card-top">
                    <div class="coin-name">${f.coin}</div>
                    <div class="trade-side ${f.side === 'B' ? 'side-buy' : 'side-sell'}">
                        ${f.side === 'B' ? '▲ شراء' : '▼ بيع'}
                    </div>
                </div>
                <div class="trade-card-details">
                    <div class="detail-item">
                        <span class="detail-label">السعر</span>
                        <span class="detail-value">$ ${parseFloat(f.px).toFixed(2)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">الحجم</span>
                        <span class="detail-value">${parseFloat(f.sz).toFixed(3)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">التوقيت</span>
                        <span class="detail-value">${dateFns.format(new Date(f.time), 'HH:mm:ss')}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">الرسوم</span>
                        <span class="detail-value text-error">$ ${parseFloat(f.fee).toFixed(4)}</span>
                    </div>
                </div>
                <div style="margin-top:0.8rem; text-align:left">
                    <span class="pnl-badge ${pnl >= 0 ? 'text-success' : 'text-error'}">
                        ${pnl >= 0 ? '+' : '-'}$ ${Math.abs(pnl).toFixed(2)}
                    </span>
                </div>
            `;
            container.appendChild(card);
        });
    }
    
    modal.classList.remove('hidden');
}

// Controls
document.getElementById('prevMonth').onclick = () => { currentMonth = dateFns.subMonths(currentMonth, 1); renderCalendar(); };
document.getElementById('nextMonth').onclick = () => { currentMonth = dateFns.addMonths(currentMonth, 1); renderCalendar(); };
document.getElementById('closeModal').onclick = () => modal.classList.add('hidden');
window.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };

function toggleLoading(isLoading) {
    const loader = document.getElementById('loader');
    const btnText = document.getElementById('btnText');
    if (isLoading) {
        loader.classList.remove('hidden');
        btnText.classList.add('hidden');
        searchBtn.disabled = true;
    } else {
        loader.classList.add('hidden');
        btnText.classList.remove('hidden');
        searchBtn.disabled = false;
    }
}

function updateURL(addr) {
    const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?${addr}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
}

function showError(msg) {
    const err = document.getElementById('errorMessage');
    err.innerText = msg;
    err.classList.remove('hidden');
    setTimeout(() => err.classList.add('hidden'), 5000);
}
