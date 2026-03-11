/* ============================================================
   calcr.js — Compound Interest Calculator (kanba.pw)
   ============================================================ */
(function () {
  'use strict';

  let chart = null;

  document.addEventListener('DOMContentLoaded', () => {
    initForm();
    initToggle();
    initInputs();
  });

  /* ── Form ─────────────────────────────────────────────── */
  function initForm() {
    const form = document.getElementById('ccrForm');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!validate()) return;

      const P = parseFloat(document.getElementById('ccrPrincipal').value);
      const R = parseFloat(document.getElementById('ccrRate').value) / 100;
      const N = parseInt(document.getElementById('ccrPeriods').value);

      const result = compute(P, R, N);
      render(result);

      const out = document.getElementById('ccrResults');
      out.classList.remove('hidden');
      setTimeout(() => out.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    });
  }

  /* ── Inputs & Validation ──────────────────────────────── */
  function initInputs() {
    const inputs = document.querySelectorAll('.ccr-num');
    inputs.forEach(inp => {
      inp.setAttribute('inputmode', 'decimal');
      inp.addEventListener('focus', function () { this.select(); });
      inp.addEventListener('keypress', e => {
        if (!/[\d.]/.test(e.key) && e.key !== 'Backspace') e.preventDefault();
      });
      inp.addEventListener('input', () => clearErr(inp));
    });
  }

  function validate() {
    const fields = [
      { id: 'ccrPrincipal', err: 'ccrPrincipalErr', min: 0.01 },
      { id: 'ccrRate',      err: 'ccrRateErr',      min: 0.001 },
      { id: 'ccrPeriods',   err: 'ccrPeriodsErr',   min: 1 },
    ];
    let ok = true;
    fields.forEach(f => {
      const inp = document.getElementById(f.id);
      const v   = parseFloat(inp.value);
      if (isNaN(v) || v < f.min) {
        showErr(inp, f.err, 'Enter a valid value');
        ok = false;
      } else {
        clearErr(inp);
      }
    });
    return ok;
  }

  function showErr(inp, errId, msg) {
    inp.style.borderColor = '#f87171';
    const el = document.getElementById(errId);
    if (el) { el.textContent = msg; el.classList.add('show'); }
  }
  function clearErr(inp) {
    inp.style.borderColor = '';
    const id = inp.id.replace('ccr','').toLowerCase();
    const el = document.getElementById('ccr' + inp.id.replace('ccr','') + 'Err')
            || document.getElementById(inp.id + 'Err');
    if (el) el.classList.remove('show');
  }

  /* ── Compute ──────────────────────────────────────────── */
  function compute(P, R, N) {
    const rows = [];
    let bal = P;
    for (let i = 1; i <= N; i++) {
      const start    = bal;
      const interest = bal * R;
      bal           += interest;
      rows.push({ period: i, start, interest, end: bal });
    }
    return {
      principal:    P,
      final:        bal,
      totalInt:     bal - P,
      gainPct:      (bal - P) / P * 100,
      avgGrowth:    (bal - P) / N,
      rows,
    };
  }

  /* ── Render ───────────────────────────────────────────── */
  function render(r) {
    animNum('ccrFinal',    0, r.final,    1200, true);
    animNum('ccrInterest', 0, r.totalInt, 1200, true);
    animNum('ccrAvg',      0, r.avgGrowth,1200, true);

    const badge = document.getElementById('ccrGainPct');
    if (badge) badge.textContent = `+${r.gainPct.toFixed(2)}%`;

    buildChart(r.rows);
    buildTable(r.rows);
  }

  function animNum(id, from, to, dur, money) {
    const el = document.getElementById(id);
    if (!el) return;
    const step  = (to - from) / (dur / 16);
    let   cur   = from;
    const timer = setInterval(() => {
      cur += step;
      if (cur >= to) { cur = to; clearInterval(timer); }
      el.textContent = money ? fmt(cur) : cur.toFixed(2);
    }, 16);
  }

  const fmt = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ── Chart ────────────────────────────────────────────── */
  function buildChart(rows) {
    const ctx = document.getElementById('ccrChart');
    if (!ctx) return;
    if (chart) { chart.destroy(); chart = null; }

    const dark = document.documentElement.dataset.theme !== 'light';
    const gridCol  = dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)';
    const tickFont = { family: 'DM Sans', size: 11 };

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: rows.map(r => `P${r.period}`),
        datasets: [
          {
            label: 'Balance',
            data:  rows.map(r => r.end),
            borderColor: '#f7931a',
            backgroundColor: 'rgba(247,147,26,.10)',
            borderWidth: 2.5,
            fill: true, tension: .42,
            pointRadius: 4, pointHoverRadius: 6,
            pointBackgroundColor: '#f7931a',
            pointBorderColor: dark ? '#111120' : '#fff',
            pointBorderWidth: 2,
          },
          {
            label: 'Interest / Period',
            data:  rows.map(r => r.interest),
            borderColor: '#00d4aa',
            backgroundColor: 'rgba(0,212,170,.08)',
            borderWidth: 2, fill: true, tension: .42,
            pointRadius: 3, pointHoverRadius: 5,
            pointBackgroundColor: '#00d4aa',
            pointBorderColor: dark ? '#111120' : '#fff',
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onHover: (_, els) => {
          if (els.length) showTooltip(rows[els[0].index]);
          else            hideTooltip();
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 14, usePointStyle: true, font: { family: 'DM Sans', size: 12 } },
          },
          tooltip: { enabled: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: v => '$' + v.toLocaleString('en-US'), font: tickFont },
            grid: { color: gridCol, drawBorder: false },
          },
          x: {
            ticks: { font: tickFont, maxTicksLimit: 12 },
            grid: { display: false, drawBorder: false },
          },
        },
      },
    });

    ctx.addEventListener('mouseleave', hideTooltip);
  }

  function showTooltip(row) {
    const tt = document.getElementById('ccrTooltip');
    if (!tt) return;
    document.getElementById('ttPeriod').textContent   = `Period ${row.period}`;
    document.getElementById('ttBalance').textContent  = fmt(row.end);
    document.getElementById('ttInterest').textContent = fmt(row.interest);
    tt.classList.add('show');
  }
  function hideTooltip() {
    const tt = document.getElementById('ccrTooltip');
    if (tt) tt.classList.remove('show');
  }

  /* ── Table ────────────────────────────────────────────── */
  function buildTable(rows) {
    const tbody = document.getElementById('ccrTbody');
    if (!tbody) return;
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.period}</td>
        <td>${fmt(r.start)}</td>
        <td>${fmt(r.interest)}</td>
        <td>${fmt(r.end)}</td>
      </tr>`).join('');
  }

  /* ── View Toggle ──────────────────────────────────────── */
  function initToggle() {
    document.querySelectorAll('.ccr-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ccr-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const view = btn.dataset.view;
        const chartWrap = document.getElementById('ccrChartWrap');
        const tableWrap = document.getElementById('ccrTableWrap');
        if (view === 'chart') {
          chartWrap?.classList.remove('ccr-view-off');
          tableWrap?.classList.add('ccr-view-off');
        } else {
          tableWrap?.classList.remove('ccr-view-off');
          chartWrap?.classList.add('ccr-view-off');
        }
        hideTooltip();
      });
    });
  }

})();
