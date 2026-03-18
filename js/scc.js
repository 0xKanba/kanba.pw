/* ============================================================
   CCR — Compound Calculator JS
   Instant calc on input change + detailed period table
   ============================================================ */
(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────
  let debounceTimer = null;

  // ── Init ─────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    const btn    = document.getElementById('calcBtn');
    const inputs = document.querySelectorAll('.calc-numeric');

    // Button click
    if (btn) btn.addEventListener('click', runCalc);

    // Instant calc on input change (debounced 80ms for feel of 0.01s)
    inputs.forEach(function (inp) {
      inp.setAttribute('inputmode', 'decimal');

      inp.addEventListener('focus', function () { this.select(); });

      inp.addEventListener('keypress', function (e) {
        var ch = String.fromCharCode(e.which);
        if (!/[0-9.]/.test(ch) && e.which !== 8) e.preventDefault();
      });

      inp.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runCalc, 80);
      });

      // Also calc on Enter
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') runCalc();
      });
    });
  });

  // ── Run Calculation ───────────────────────────────────────
  function runCalc() {
    var principal = parseFloat(document.getElementById('principalAmount').value);
    var rate      = parseFloat(document.getElementById('gainRate').value) / 100;
    var periods   = parseInt(document.getElementById('numPeriods').value, 10);
    var errBar    = document.getElementById('calcError');

    // Validate
    if (isNaN(principal) || principal <= 0 ||
        isNaN(rate)      || rate <= 0      ||
        isNaN(periods)   || periods <= 0   || periods > 1000) {
      if (errBar) errBar.classList.remove('hidden');
      return;
    }

    if (errBar) errBar.classList.add('hidden');

    var results = compute(principal, rate, periods);
    render(results);

    var area = document.getElementById('resultsArea');
    if (area && area.classList.contains('hidden')) {
      area.classList.remove('hidden');
      // Small delay to let display:none switch before scrolling
      setTimeout(function () {
        area.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  }

  // ── Compute ───────────────────────────────────────────────
  function compute(principal, rate, periods) {
    var rows = [];
    var balance = principal;

    for (var i = 1; i <= periods; i++) {
      var start    = balance;
      var profit   = balance * rate;
      balance     += profit;
      var cumProfit = balance - principal;
      var gainPct   = (cumProfit / principal) * 100;

      rows.push({
        period:    i,
        start:     start,
        profit:    profit,
        balance:   balance,
        cumProfit: cumProfit,
        gainPct:   gainPct
      });
    }

    var totalProfit = balance - principal;
    var avgProfit   = totalProfit / periods;
    var totalGain   = (totalProfit / principal) * 100;

    return {
      principal:   principal,
      final:       balance,
      totalProfit: totalProfit,
      avgProfit:   avgProfit,
      totalGain:   totalGain,
      periods:     periods,
      rows:        rows
    };
  }

  // ── Render ────────────────────────────────────────────────
  function render(r) {
    // Summary cards
    setText('finalAmountDisplay',  fmt(r.final));
    setText('totalProfitDisplay',  fmt(r.totalProfit));
    setText('avgProfitDisplay',    fmt(r.avgProfit));
    setText('principalDisplay',    fmt(r.principal));
    setText('totalGainPct',        '+' + r.totalGain.toFixed(2) + '%');
    setText('profitVsPrincipal',   'x' + (r.final / r.principal).toFixed(2) + ' multiplier');
    setText('periodCountLabel',    'over ' + r.periods + ' period' + (r.periods > 1 ? 's' : ''));
    setText('tableRowCount',       r.periods + ' period' + (r.periods > 1 ? 's' : ''));

    // Table
    buildTable(r.rows, r.periods);
  }

  // ── Build Table ───────────────────────────────────────────
  function buildTable(rows, total) {
    var tbody = document.getElementById('tableBody');
    if (!tbody) return;

    // Use DocumentFragment for speed
    var frag = document.createDocumentFragment();

    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      if (row.period === total) tr.classList.add('row-final');

      tr.innerHTML =
        '<td>' + row.period + '</td>' +
        '<td>' + fmt(row.start) + '</td>' +
        '<td class="td-profit">' + fmt(row.profit) + '</td>' +
        '<td class="td-balance">' + fmt(row.balance) + '</td>' +
        '<td class="td-profit">' + fmt(row.cumProfit) + '</td>' +
        '<td class="td-pct">+' + row.gainPct.toFixed(2) + '%</td>';

      frag.appendChild(tr);
    });

    tbody.innerHTML = '';
    tbody.appendChild(frag);
  }

  // ── Helpers ───────────────────────────────────────────────
  function fmt(val) {
    return '$' + val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

})();
