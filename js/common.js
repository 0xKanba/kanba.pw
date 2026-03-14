(function() {
    'use strict';
    
    // منع التكرار
    if (document.getElementById('global-footer')) return;
    
    const nav = [
        {name: 'Kanba', href: '/index.html'},
        {name: 'Younis', href: '/younis.html'},
        {name: 'Compounding Calc.', href: '/ccr.html'},
        {name: 'Analysis', href: '/HLsee.html'},
        {name: 'Videos', href: '/video2026mar.html'}
    ];
    
    const currentPage = window.location.pathname.toLowerCase().split('/').pop().replace('.html', '') || 'index';
    
    const footer = document.createElement('footer');
    footer.id = 'global-footer';
    footer.innerHTML = `
        <nav class="footer-nav">
            ${nav.map(l => `<a href="${l.href}" ${l.href.includes(currentPage) ? 'class="active"' : ''}>${l.name}</a>`).join('')}
        </nav>
        <p class="footer-copy">© 2025 Kanba Trader | All Rights Reserved</p>
    `;
    
    document.body.appendChild(footer);
    document.body.classList.add('footer-ready');
})();
