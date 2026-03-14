// ===== Universal Footer Injector =====
(function() {
    'use strict';
    
    // منع التكرار: إذا وجدنا التذييل بالفعل نتوقف
    if (document.getElementById('universal-footer')) return;

    const siteLinks = [
        { name: 'Kanba', href: '/index.html' },
        { name: 'Younis', href: '/younis.html' },
        { name: 'Compounding Calc.', href: '/ccr.html' },
        { name: 'Analysis', href: '/HLsee.html' },
        { name: 'Videos', href: '/video2026mar.html' }
    ];

    // تحديد الصفحة الحالية
    const currentPath = window.location.pathname.toLowerCase().split('/').pop() || 'index.html';
    const currentPageName = currentPath.replace('.html', '') || 'index';

    // بناء عناصر التذييل برمجياً (أنظف وأسرع)
    const footer = document.createElement('footer');
    footer.id = 'universal-footer';

    const navList = document.createElement('ul');
    navList.className = 'footer-nav-list';

    siteLinks.forEach(link => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        
        a.href = link.href;
        a.textContent = link.name;
        a.className = 'footer-link';
        
        // تفعيل الرابط الحالي تلقائياً
        if (link.href.includes(currentPageName) || 
            (currentPageName === '' && link.href === '/index.html')) {
            a.classList.add('active');
        }

        li.appendChild(a);
        navList.appendChild(li);
    });

    const copyP = document.createElement('p');
    copyP.className = 'footer-copy';
    copyP.textContent = '© 2025 Kanba Trader | All Rights Reserved';

    footer.appendChild(navList);
    footer.appendChild(copyP);

    // إضافة التذييل في نهاية الصفحة مباشرة
    document.body.appendChild(footer);

})();
