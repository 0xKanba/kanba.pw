const MONTHS = [
  { m:'April 2024',     t:99,   wr:48, to:1333.24,    pnl:-173.00   },
  { m:'June 2024',      t:48,   wr:50, to:1154.43,    pnl:-112.50   },
  { m:'August 2024',    t:159,  wr:57, to:156083.50,  pnl:22946.00  },
  { m:'September 2024', t:556,  wr:54, to:927012.95,  pnl:-6240.42  },
  { m:'October 2024',   t:1235, wr:52, to:161900.63,  pnl:-9218.62  },
  { m:'November 2024',  t:607,  wr:52, to:168581.86,  pnl:2286.70   },
  { m:'December 2024',  t:755,  wr:50, to:86496.27,   pnl:-4073.23  },
  { m:'January 2025',   t:348,  wr:48, to:14085.25,   pnl:-2553.21  },
  { m:'February 2025',  t:18,   wr:22, to:112.93,     pnl:-51.49    },
  { m:'March 2025',     t:1031, wr:50, to:55466.06,   pnl:-2233.47  },
  { m:'April 2025',     t:372,  wr:46, to:10565.18,   pnl:-1020.14  },
  { m:'May 2025',       t:548,  wr:51, to:11166.73,   pnl:-2197.54  },
  { m:'June 2025',      t:578,  wr:52, to:81653.15,   pnl:-3003.99  },
  { m:'July 2025',      t:261,  wr:47, to:6902.40,    pnl:-1299.12  },
  { m:'August 2025',    t:138,  wr:45, to:5852.98,    pnl:-904.85   },
  { m:'September 2025', t:654,  wr:52, to:25918.58,   pnl:-368.93   },
  { m:'October 2025',   t:338,  wr:52, to:16589.09,   pnl:-2780.58  },
  { m:'November 2025',  t:394,  wr:50, to:10742.46,   pnl:-539.33   },
  { m:'December 2025',  t:393,  wr:46, to:8804.13,    pnl:-754.50   },
  { m:'January 2026',   t:93,   wr:45, to:1836.55,    pnl:-413.01   },
  { m:'February 2026',  t:1,    wr:100,to:1.72,       pnl:1.58      },
];

const $ = id => document.getElementById(id);

const usd = (v, sign=false) => {
  if (v === 0) return '—';
  const f = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const s = sign ? (v >= 0 ? '+' : '−') : (v < 0 ? '−' : '');
  return s + '$' + f;
};

const compact = v => {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '+';
  if (a >= 1000) return s + '$' + (a/1000).toFixed(0) + 'k';
  return s + '$' + a.toFixed(0);
};

/* ── KPI ── */
function buildKPI() {
  $('kpi-strip').innerHTML = [
    { val:'8,626',     lbl:'Total Trades',     cls:'neu' },
    { val:'50%',       lbl:'Overall Win Rate', cls:'neu' },
    { val:'$1.75M',    lbl:'Trading Volume',   cls:'neu' },
    { val:'−$12,703',  lbl:'Net P&L',          cls:'neg' },
    { val:'$3,000',    lbl:'Largest Trade',    cls:'neu' },
    { val:'$2,640',    lbl:'Best Single Win',  cls:'pos' },
    { val:'+$22,946',  lbl:'Best Month',       cls:'pos' },
    { val:'−$9,218',   lbl:'Worst Month',      cls:'neg' },
  ].map(k =>
    `<div class="kpi">
       <span class="kpi-val ${k.cls}">${k.val}</span>
       <div class="kpi-lbl">${k.lbl}</div>
     </div>`
  ).join('');
}

/* ── TABLE ── */
function buildTable() {
  let totT=0, totTO=0, totPNL=0;
  $('tbl-body').innerHTML = MONTHS.map(m => {
    totT += m.t; totTO += m.to; totPNL += m.pnl;
    const pc = m.pnl > 0 ? 'td-pos' : m.pnl < 0 ? 'td-neg' : '';
    const wc = m.wr >= 55 ? 'wr-high' : m.wr <= 44 ? 'wr-low' : 'wr-mid';
    return `<tr>
      <td class="td-month">${m.m}</td>
      <td>${m.t.toLocaleString()}</td>
      <td><span class="wr-pill ${wc}">${m.wr}%</span></td>
      <td>${usd(m.to)}</td>
      <td class="${pc}">${usd(m.pnl, true)}</td>
    </tr>`;
  }).join('');

  const pfc = totPNL >= 0 ? 'td-pos' : 'td-neg';
  $('tbl-foot').innerHTML = `<tr>
    <td>Total</td>
    <td>${totT.toLocaleString()}</td>
    <td>—</td>
    <td>${usd(totTO)}</td>
    <td class="${pfc}">${usd(totPNL, true)}</td>
  </tr>`;
}

/* ── FLOW GRID ── */
function buildFlow() {
  $('flow-grid').innerHTML = [
    { period:'22 Aug 2024',           title:'Initial Deposit',          amount:'+$1,900',   cls:'pos', note:'First capital · 159 trades in August' },
    { period:'Aug – Sep 2024',        title:'Peak Profits',             amount:'+$94,000',  cls:'pos', note:'Best 31 days · 57% win rate' },
    { period:'September 2024',        title:'Partial Withdrawal',       amount:'−$32,735',  cls:'neg', note:'Partial exit from peak' },
    { period:'September 2024',        title:'Re-deposit (1)',           amount:'+$16,000',  cls:'pos', note:'Half of withdrawal returned to account' },
    { period:'Sep 2024 😂',           title:'Withdraw & Re-deposit',    amount:'$5,000',    cls:'neu', note:'Withdrew $5,000 then deposited it back 😂' },
    { period:'22 Sep – 1 Oct 2024',   title:'Capital Collapse',         amount:'−$77,836',  cls:'neg', note:'9 days · all profits wiped out' },
    { period:'October 2024',          title:'Re-deposit (2)',           amount:'+$16,000',  cls:'pos', note:'Second half returned to account' },
    { period:'Late 2024',             title:'External Funding',         amount:'+$12,705',  cls:'pos', note:'Capital from external source' },
    { period:'Full Year 2025',        title:'External Funding Loss',    amount:'−$12,705',  cls:'neg', note:'Fully drained over 14 months' },
  ].map(f =>
    `<div class="flow-cell">
       <div class="flow-period">${f.period}</div>
       <div class="flow-title">${f.title}</div>
       <span class="flow-amount ${f.cls}">${f.amount}</span>
       <div class="flow-note">${f.note}</div>
     </div>`
  ).join('');
}

/* ── CHART ── */
function drawChart() {
  const container = $('chart-container');
  const W  = container.offsetWidth || 1000;
  const H  = 210;
  const P  = { t:14, r:14, b:34, l:68 };
  const cW = W - P.l - P.r;
  const cH = H - P.t - P.b;

  const vals = MONTHS.map(m => m.pnl);
  const maxV = Math.max(...vals) + 1000;
  const minV = Math.min(...vals) - 500;
  const range = maxV - minV;

  const sc   = v => P.t + cH - ((v - minV) / range) * cH;
  const zY   = sc(0);
  const step = cW / MONTHS.length;
  const bW   = Math.max(4, step * 0.6);

  const posC  = '#00d48c';
  const negC  = '#f04e6a';
  const gridC = 'rgba(255,255,255,0.05)';
  const zeroC = 'rgba(255,255,255,0.12)';
  const axisC = 'rgba(232,236,242,0.32)';

  const ticks = [-10000,-5000,0,5000,10000,15000,20000,25000]
    .filter(t => t >= minV-200 && t <= maxV+200);

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

  ticks.forEach(t => {
    const y = sc(t).toFixed(1);
    s += `<line stroke="${gridC}" stroke-width="1" x1="${P.l}" y1="${y}" x2="${W-P.r}" y2="${y}"/>`;
    s += `<text font-family="Geist Mono,monospace" font-size="10" fill="${axisC}" x="${P.l-6}" y="${(+y+3.5).toFixed(1)}" text-anchor="end">${compact(t)}</text>`;
  });

  s += `<line stroke="${zeroC}" stroke-width="1.5" x1="${P.l}" y1="${zY.toFixed(1)}" x2="${W-P.r}" y2="${zY.toFixed(1)}"/>`;

  const labeled = [0,2,4,6,8,10,12,14,16,18,20];
  MONTHS.forEach((m, i) => {
    const x  = P.l + i * step + step / 2;
    const y  = m.pnl >= 0 ? sc(m.pnl) : zY;
    const bh = Math.max(2, Math.abs(sc(m.pnl) - zY));
    const col = m.pnl >= 0 ? posC : negC;

    s += `<rect fill="${col}" fill-opacity="0.85" x="${(x-bW/2).toFixed(1)}" y="${y.toFixed(1)}" width="${bW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3"/>`;

    if (labeled.includes(i)) {
      const lbl = m.m.replace(' 2024',"'24").replace(' 2025',"'25").replace(' 2026',"'26");
      s += `<text font-family="Geist Mono,monospace" font-size="9.5" fill="${axisC}" x="${x.toFixed(1)}" y="${H-5}" text-anchor="middle">${lbl}</text>`;
    }
  });

  s += `</svg>`;
  container.innerHTML = s;
}

/* ── INIT ── */
window.addEventListener('load', () => {
  buildKPI();
  buildTable();
  buildFlow();
  setTimeout(drawChart, 80);
});
window.addEventListener('resize', drawChart);
