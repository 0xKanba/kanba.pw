// Compound Calculator Application
(function () {
  "use strict";

  let chartInstance = null;
  let currentData = null;

  // Initialize when DOM is ready
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);

    initThemeToggle();
    setupEventListeners();
    setupNumericInputs();
  }

  function initThemeToggle() {
    const toggleBtn = document.getElementById("themeToggle");
    if (!toggleBtn) return;

    const currentTheme = localStorage.getItem("theme");
    if (currentTheme === "light") {
      document.body.classList.add("light-theme");
    } else if (currentTheme === "dark") {
      document.body.classList.remove("light-theme");
    } else if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      document.body.classList.add("light-theme");
    }

    toggleBtn.addEventListener("click", () => {
      document.body.classList.toggle("light-theme");
      if (document.body.classList.contains("light-theme")) {
        localStorage.setItem("theme", "light");
      } else {
        localStorage.setItem("theme", "dark");
      }
      if (currentData) {
        setTimeout(() => {
          createChart(currentData);
        }, 50);
      }
    });
  }

  function setupEventListeners() {
    const form = document.getElementById("calcForm");
    const principalRange = document.getElementById("principalRange");
    const interestRange = document.getElementById("interestRange");
    const periodRange = document.getElementById("periodRange");

    if (principalAmount && principalRange) {
      principalRange.addEventListener("input", (e) => {
        principalAmount.value = e.target.value;
      });
      principalAmount.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          if (val > parseFloat(principalRange.max)) {
            principalRange.max = val;
          }
        }
        principalRange.value = e.target.value;
      });
    }

    if (interestRate && interestRange) {
      interestRange.addEventListener("input", (e) => {
        interestRate.value = e.target.value;
      });
      interestRate.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          if (val > parseFloat(interestRange.max)) {
            interestRange.max = val;
          }
        }
        interestRange.value = e.target.value;
      });
    }

    if (numPeriods && periodRange) {
      periodRange.addEventListener("input", (e) => {
        numPeriods.value = e.target.value;
      });
      numPeriods.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          if (val > parseFloat(periodRange.max)) {
            periodRange.max = val;
          }
        }
        periodRange.value = e.target.value;
      });
    }

    if (form) {
      form.addEventListener("submit", handleFormSubmit);
    }

    const toggleBtns = document.querySelectorAll(".calc-toggle-btn");
    toggleBtns.forEach((btn) => {
      btn.addEventListener("click", handleViewToggle);
    });

    const inputs = document.querySelectorAll(".calc-numeric");
    inputs.forEach((input) => {
      input.addEventListener("input", handleInputValidation);
      input.addEventListener("blur", formatInputValue);
    });
  }

  function setupNumericInputs() {
    const numericInputs = document.querySelectorAll(".calc-numeric");
    numericInputs.forEach((input) => {
      input.setAttribute("inputmode", "decimal");

      input.addEventListener("focus", function () {
        this.select();
      });

      input.addEventListener("keypress", function (e) {
        const char = String.fromCharCode(e.which);
        if (!char.match(/[0-9.]/) && e.which !== 8) {
          e.preventDefault();
        }
      });
    });
  }

  function handleInputValidation(e) {
    const input = e.target;
    const value = parseFloat(input.value);
    const errorEl = document.getElementById(
      input.id
        .replace("Amount", "")
        .replace("Rate", "")
        .replace("Periods", "") + "Error",
    );

    if (errorEl) {
      if (isNaN(value) || value <= 0) {
        errorEl.textContent = "Please enter a valid value";
        errorEl.classList.add("show");
        input.style.borderColor = "var(--error)";
      } else {
        errorEl.classList.remove("show");
        input.style.borderColor = "";
      }
    }
  }

  function formatInputValue(e) {
    const input = e.target;
    const value = parseFloat(input.value);

    if (!isNaN(value)) {
      if (input.id === "principalAmount") {
        input.value = value.toFixed(2);
      } else if (input.id === "interestRate") {
        input.value = value.toFixed(2);
      }
    }
  }

  function handleFormSubmit(e) {
    e.preventDefault();

    const principal = parseFloat(
      document.getElementById("principalAmount").value,
    );
    const rate =
      parseFloat(document.getElementById("interestRate").value) / 100;
    const periods = parseInt(document.getElementById("numPeriods").value);

    if (
      isNaN(principal) ||
      principal <= 0 ||
      isNaN(rate) ||
      rate <= 0 ||
      isNaN(periods) ||
      periods <= 0
    ) {
      alert("Please enter all values correctly");
      return;
    }

    const results = calculateCompoundInterest(principal, rate, periods);
    currentData = results.data;

    displayResults(results);

    const resultsArea = document.getElementById("resultsArea");
    resultsArea.classList.remove("hidden");

    // Smooth scroll to results — 10ms delay
    setTimeout(() => {
      resultsArea.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 10);
  }

  function calculateCompoundInterest(principal, rate, periods) {
    const data = [];
    let balance = principal;

    for (let period = 1; period <= periods; period++) {
      const startBalance = balance;
      const interest = balance * rate;
      balance += interest;

      data.push({
        period: period,
        startBalance: startBalance,
        interest: interest,
        endBalance: balance,
      });
    }

    const totalInterest = balance - principal;
    const totalGainPercent = ((balance - principal) / principal) * 100;
    const averageGrowth = totalInterest / periods;

    return {
      principal: principal,
      finalAmount: balance,
      totalInterest: totalInterest,
      totalGainPercent: totalGainPercent,
      averageGrowth: averageGrowth,
      data: data,
    };
  }

  function displayResults(results) {
    // 10ms animation duration = instant display (0.01s)
    animateValue("finalAmountDisplay", 0, results.finalAmount, 10, true);
    animateValue("totalInterestDisplay", 0, results.totalInterest, 10, true);
    animateValue("avgGrowthDisplay", 0, results.averageGrowth, 10, true);

    const percentBadge = document.getElementById("totalGainPercent");
    percentBadge.textContent = `+${results.totalGainPercent.toFixed(2)}%`;

    createChart(results.data);
    createTable(results.data);
  }

  function animateValue(elementId, start, end, duration, isCurrency) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const increment = (end - start) / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
      current += increment;
      if (current >= end) {
        current = end;
        clearInterval(timer);
      }

      if (isCurrency) {
        element.textContent = `$${current.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      } else {
        element.textContent = current.toFixed(2);
      }
    }, 16);
  }

  function showTooltip(dataPoint) {
    const tooltip = document.getElementById("chartTooltip");
    if (!tooltip) return;

    document.getElementById("tooltipPeriod").textContent =
      `Time ${dataPoint.period}`;
    document.getElementById("tooltipBalance").textContent =
      "$" +
      dataPoint.endBalance.toLocaleString("en-US", {
        minimumFractionDigits: 2,
      });
    document.getElementById("tooltipInterest").textContent =
      "$" +
      dataPoint.interest.toLocaleString("en-US", { minimumFractionDigits: 2 });

    tooltip.classList.add("show");
  }

  function hideTooltip() {
    const tooltip = document.getElementById("chartTooltip");
    if (tooltip) {
      tooltip.classList.remove("show");
    }
  }

  function createChart(data) {
    const ctx = document.getElementById("growthChart");
    if (!ctx) return;

    if (chartInstance) {
      chartInstance.destroy();
    }

    const isLight =
      document.body.classList.contains("light-theme") ||
      (window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches &&
        !localStorage.getItem("theme"));
    const primaryColor = isLight ? "#18181b" : "#e4e4e7";
    const primaryBg = isLight
      ? "rgba(0, 0, 0, 0.05)"
      : "rgba(255, 255, 255, 0.05)";
    const secondaryColor = isLight ? "#71717a" : "#a1a1aa";
    const secondaryBg = isLight
      ? "rgba(113, 113, 122, 0.1)"
      : "rgba(161, 161, 170, 0.1)";
    const gridColor = isLight
      ? "rgba(0, 0, 0, 0.05)"
      : "rgba(255, 255, 255, 0.05)";
    const textColor = isLight ? "#64748b" : "#9ca3af";

    chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: data.map((d) => `Time ${d.period}`),
        datasets: [
          {
            label: "Total Balance",
            data: data.map((d) => d.endBalance),
            borderColor: primaryColor,
            backgroundColor: primaryBg,
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: primaryColor,
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
          },
          {
            label: "Interest",
            data: data.map((d) => d.interest),
            borderColor: secondaryColor,
            backgroundColor: secondaryBg,
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: secondaryColor,
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        onHover: (event, activeElements) => {
          if (activeElements.length > 0) {
            const dataIndex = activeElements[0].index;
            showTooltip(data[dataIndex]);
          } else {
            hideTooltip();
          }
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: textColor,
              padding: 15,
              usePointStyle: true,
              font: {
                family: "Inter",
                size: 12,
                weight: "500",
              },
            },
          },
          tooltip: {
            enabled: false,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: textColor,
              callback: function (value) {
                return "$" + value.toLocaleString("en-US");
              },
              font: {
                family: "Inter",
                size: 11,
              },
            },
            grid: {
              color: gridColor,
              drawBorder: false,
            },
          },
          x: {
            ticks: {
              color: textColor,
              font: {
                family: "Inter",
                size: 11,
              },
            },
            grid: {
              display: false,
              drawBorder: false,
            },
          },
        },
      },
    });

    ctx.addEventListener("mouseleave", hideTooltip);
  }

  function createTable(data) {
    const tbody = document.getElementById("dataTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    data.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td>${row.period}</td>
                <td>$${row.startBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                <td>$${row.interest.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                <td><strong>$${row.endBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></td>
            `;
      tbody.appendChild(tr);
    });
  }

  function handleViewToggle(e) {
    const btn = e.target;
    const view = btn.dataset.view;

    document.querySelectorAll(".calc-toggle-btn").forEach((b) => {
      b.classList.remove("active");
    });
    btn.classList.add("active");

    const chartContainer = document.getElementById("chartContainer");
    const tableContainer = document.getElementById("tableContainer");

    if (view === "chart") {
      chartContainer.classList.remove("calc-view-hidden");
      tableContainer.classList.add("calc-view-hidden");
      hideTooltip();
    } else {
      chartContainer.classList.add("calc-view-hidden");
      tableContainer.classList.remove("calc-view-hidden");
      hideTooltip();
    }
  }
})();
