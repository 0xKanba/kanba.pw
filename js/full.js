(function () {
    'use strict';

    var FS_KEY = 'fs_active';

    var btn = document.createElement('button');
    btn.id = 'fs-btn';
    btn.setAttribute('aria-label', 'Toggle fullscreen');

    var style = document.createElement('style');
    style.textContent = [
        '#fs-btn {',
        '    position: fixed;',
        '    top: 18px;',
        '    left: 18px;',
        '    z-index: 99999;',
        '    width: 36px;',
        '    height: 36px;',
        '    padding: 0;',
        '    border: none;',
        '    border-radius: 8px;',
        '    background: rgba(15,23,42,0.75);',
        '    color: #fff;',
        '    cursor: pointer;',
        '    display: flex;',
        '    align-items: center;',
        '    justify-content: center;',
        '    backdrop-filter: blur(6px);',
        '    -webkit-backdrop-filter: blur(6px);',
        '    box-shadow: 0 2px 8px rgba(0,0,0,0.3);',
        '    transition: background 0.2s, transform 0.15s, opacity 0.2s;',
        '    opacity: 0.7;',
        '}',
        '#fs-btn:hover {',
        '    background: rgba(99,102,241,0.9);',
        '    transform: scale(1.08);',
        '    opacity: 1;',
        '}',
        '#fs-btn:active { transform: scale(0.95); }',
        '#fs-btn svg { width: 16px; height: 16px; display: block; }'
    ].join('\n');

    document.head.appendChild(style);
    document.body.appendChild(btn);

    function iconEnter() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
            + '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>'
            + '<line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>'
            + '</svg>';
    }

    function iconExit() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
            + '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>'
            + '<line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>'
            + '</svg>';
    }

    function isFs() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
    }

    function updateIcon() {
        btn.innerHTML = isFs() ? iconExit() : iconEnter();
        btn.title     = isFs() ? 'Exit Fullscreen' : 'Fullscreen';
    }

    function enterFullscreen() {
        var el = document.documentElement;
        var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
        if (fn) {
            fn.call(el).catch(function () {
                sessionStorage.removeItem(FS_KEY);
            });
        }
    }

    function exitFullscreen() {
        var fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
        if (fn) fn.call(document);
    }

    function toggleFullscreen() {
        if (!isFs()) {
            sessionStorage.setItem(FS_KEY, '1');
            enterFullscreen();
        } else {
            sessionStorage.removeItem(FS_KEY);
            exitFullscreen();
        }
    }

    function onFsChange() {
        if (!isFs()) sessionStorage.removeItem(FS_KEY);
        updateIcon();
    }

    document.addEventListener('fullscreenchange',       onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('mozfullscreenchange',    onFsChange);
    btn.addEventListener('click', toggleFullscreen);

    // Auto-restore fullscreen on page navigation within same session/tab
    if (sessionStorage.getItem(FS_KEY) === '1') {
        setTimeout(function () {
            if (!isFs()) enterFullscreen();
        }, 80);
    }

    updateIcon();
})();
