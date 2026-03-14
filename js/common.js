(function() {
    'use strict';
    
    // Create footer element once
    if (!document.getElementById('global-footer')) {
        const nav = ['Kanba', 'Younis', 'Compounding Calc.', 'Analysis', 'Videos'];
        const links = ['/index.html', '/younis.html', '/ccr.html', '/HLsee.html', '/video2026mar.html'];
        
        const footerHTML = `
            <div id="global-footer" class="footer-ready">
                <nav aria-label="Footer Navigation">
                    <ul class="footer-nav">
                        ${nav.map((name, i) => 
                            `<li><a href="${links[i]}" class="footer-nav-link">${name}</a></li>`
                        ).join('')}
                    </ul>
                </nav>
                <p class="footer-copyright">© 2025 Kanba Trader | All Rights Reserved</p>
            </div>
        `;
        
        const container = document.body.lastElementChild;
        if (container && container.tagName !== 'FOOTER') {
            const footerEl = document.createElement('div');
            footerEl.innerHTML = footerHTML.trim();
            document.body.appendChild(footerEl);
        }
        
        // Mark footer as loaded
        document.body.classList.add('footer-ready');
        
        // Highlight current page link
        const currentPage = window.location.pathname.toLowerCase().split('/').pop().replace('.html', '');
        const activeLinks = document.querySelectorAll('.footer-nav-link');
        
        activeLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.includes(currentPage)) {
                link.classList.add('active');
            }
        });
    }
})();
