// Compound Calculator Application
(function() {
    'use strict';
    
    let chartInstance = null;
    let currentData = null;
    
    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', init);
    
    function init() {
        setupEventListeners();
        setupNumericInputs();
    }
    
    function setupEventListeners() {
        // Form submission
        const form = document.getElementById('calcForm');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }
        
        // View toggle buttons
        const toggleBtns = document.querySelectorAll('.calc-toggle-btn');
        toggleBtns.forEach(btn => {
            btn.addEventListener('click', handleViewToggle);
        });
        
        // Input validation
        const inputs = document.querySelectorAll('.calc-numeric');
        inputs.forEach(input => {
            input.addEventListener('input', handleInputValidation);
            input.addEventListener('blur', formatInputValue);
        });
    }
    
    function setupNumericInputs() {
        const numericInputs = document.querySelectorAll('.calc-numeric');
        numericInputs.forEach(input => {
            // Force numeric keyboard on mobile
            input.setAttribute('inputmode', 'decimal');
            
            // Select all text on focus
            input.addEventListener('focus', function() {
                this.select();
            });
            
            // Prevent non-numeric input
            input.addEventListener('keypress', function(e) {
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
        const errorEl = document.getElementById(input.id.replace('Amount', '').replace('Rate', '').replace('Periods', '') + 'Error');
        
        if (errorEl) {
            if (isNaN(value) || value <= 0) {
                errorEl.textContent = 'Please enter a valid value';
                errorEl.classList.add('show');
                input.style.borderColor = '#ef4444';
            } else {
                errorEl.classList.remove('show');
                input.style.borderColor = '';
            }
        }
    }
    
    function formatInputValue(e) {
        const input = e.target;
        const value = parseFloat(input.value);
        
        if (!isNaN(value)) {
            if (input.id === 'principalAmount') {
                input.value = value.toFixed(2);
            } else if (input.id === 'interestRate') {
                input.value = value.toFixed(2);
            }
        }
    }
    
    function handleFormSubmit(e) {
        e.preventDefault();
        
        // Get input values
        const principal = parseFloat(document.getElementById('principalAmount').value);
        const rate = parseFloat(document.getElementById('interestRate').value) / 100;
        const periods = parseInt(document.getElementById('numPeriods').value);
        
        // Validate inputs
        if (isNaN(principal) || principal <= 0 ||
            isNaN(rate) || rate <= 0 ||
            isNaN(periods) || periods <= 0) {
            alert('Please enter all values correctly');
            return;
        }
        
        // Calculate compound interest
        const results = calculateCompoundInterest(principal, rate, periods);
        currentData = results.data;
        
        // Display results
        displayResults(results);
        
        // Show results section
        const resultsArea = document.getElementById('resultsArea');
        resultsArea.classList.remove('hidden');
        
        // Smooth scroll to results
        setTimeout(() => {
            resultsArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
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
                endBalance: balance
            });
        }
        
        const totalInterest = balance - principal;
        const totalGainPercent = ((balance - principal) / principal * 100);
        const averageGrowth = totalInterest / periods;
        
        return {
            principal: principal,
            finalAmount: balance,
            totalInterest: totalInterest,
            totalGainPercent: totalGainPercent,
            averageGrowth: averageGrowth,
            data: data
        };
    }
    
    function displayResults(results) {
        // Update summary cards
        animateValue('finalAmountDisplay', 0, results.finalAmount, 1000, true);
        animateValue('totalInterestDisplay', 0, results.totalInterest, 1000, true);
        animateValue('avgGrowthDisplay', 0, results.averageGrowth, 1000, true);
        
        // Update percentage badge
        const percentBadge = document.getElementById('totalGainPercent');
        percentBadge.textContent = `+${results.totalGainPercent.toFixed(2)}%`;
        
        // Create chart
        createChart(results.data);
        
        // Create table
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
                element.textContent = `$${current.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })}`;
            } else {
                element.textContent = current.toFixed(2);
            }
        }, 16);
    }
    
    function showTooltip(dataPoint) {
        const tooltip = document.getElementById('chartTooltip');
        if (!tooltip) return;
        
        // Update tooltip content
        document.getElementById('tooltipPeriod').textContent = `Time ${dataPoint.period}`;
        document.getElementById('tooltipBalance').textContent = 
            '$' + dataPoint.endBalance.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('tooltipInterest').textContent = 
            '$' + dataPoint.interest.toLocaleString('en-US', { minimumFractionDigits: 2 });
        
        // Show tooltip
        tooltip.classList.add('show');
    }
    
    function hideTooltip() {
        const tooltip = document.getElementById('chartTooltip');
        if (tooltip) {
            tooltip.classList.remove('show');
        }
    }
    
    function createChart(data) {
        const ctx = document.getElementById('growthChart');
        if (!ctx) return;
        
        // Destroy existing chart
        if (chartInstance) {
            chartInstance.destroy();
        }
        
        // Create new chart
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => `Time ${d.period}`),
                datasets: [
                    {
                        label: 'Total Balance',
                        data: data.map(d => d.endBalance),
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#6366f1',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Interest',
                        data: data.map(d => d.interest),
                        borderColor: '#ec4899',
                        backgroundColor: 'rgba(236, 72, 153, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#ec4899',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
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
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            usePointStyle: true,
                            font: {
                                family: 'Inter',
                                size: 12,
                                weight: '500'
                            }
                        }
                    },
                    tooltip: {
                        enabled: false // Disable default tooltip
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString('en-US');
                            },
                            font: {
                                family: 'Inter',
                                size: 11
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                family: 'Inter',
                                size: 11
                            }
                        },
                        grid: {
                            display: false,
                            drawBorder: false
                        }
                    }
                }
            }
        });
        
        // Hide tooltip when mouse leaves chart
        ctx.addEventListener('mouseleave', hideTooltip);
    }
    
    function createTable(data) {
        const tbody = document.getElementById('dataTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.period}</td>
                <td>$${row.startBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td>$${row.interest.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td><strong>$${row.endBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    function handleViewToggle(e) {
        const btn = e.target;
        const view = btn.dataset.view;
        
        // Update active button
        document.querySelectorAll('.calc-toggle-btn').forEach(b => {
            b.classList.remove('active');
        });
        btn.classList.add('active');
        
        // Toggle views
        const chartContainer = document.getElementById('chartContainer');
        const tableContainer = document.getElementById('tableContainer');
        
        if (view === 'chart') {
            chartContainer.classList.remove('calc-view-hidden');
            tableContainer.classList.add('calc-view-hidden');
            // Hide tooltip when switching to chart
            hideTooltip();
        } else {
            chartContainer.classList.add('calc-view-hidden');
            tableContainer.classList.remove('calc-view-hidden');
            // Hide tooltip when switching to table
            hideTooltip();
        }
    }
})();
