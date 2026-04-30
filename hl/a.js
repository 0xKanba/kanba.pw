(function() {
    let deferredPrompt;
    const btn = document.createElement('button');
    
    // تنسيق الزر (صغير، فخم، غير مؤثر على المحتوى)
    Object.assign(btn.style, {
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '9999',
        padding: '6px 14px',
        backgroundColor: 'rgba(201, 100, 66, 0.15)',
        backdropFilter: 'blur(8px)',
        color: '#c96442',
        border: '1px solid rgba(201, 100, 66, 0.3)',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: 'bold',
        cursor: 'pointer',
        display: 'none',
        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
        transition: 'all 0.3s ease'
    });

    btn.innerHTML = 'تثبيت المنصة ✅';

    // إظهار الزر عند جاهزية المتصفح للتثبيت
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        btn.style.display = 'block';
    });

    btn.onclick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') btn.style.display = 'none';
            deferredPrompt = null;
        }
    };

    document.body.appendChild(btn);
})();
