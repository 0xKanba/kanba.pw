/* common.js — footer injector only */

document.addEventListener('DOMContentLoaded', function () {

  var f = document.getElementById('footer');
  if (!f) return;

  /* ── links ── */
  var links = [
    { href: '/index.html',        key: 'index',       label: 'Kanba'             },
    { href: '/younis.html',       key: 'younis',      label: 'Younis'            },
    { href: '/ccr.html',          key: 'ccr',         label: 'Compounding Calc.' },
    { href: '/HLsee.html',        key: 'hlsee',       label: 'see analysis',  blank: true },
    { href: '/video2026mar.html', key: 'video2026mar',label: 'videosNEWS',    blank: true },
  ];

  /* ── active key ── */
  var page = window.location.pathname.toLowerCase().split('/').pop().replace('.html', '') || 'index';

  /* ── build nav ── */
  var nav = '<div class="sitenav">';
  links.forEach(function (l) {
    var on  = page === l.key ? ' sitenav-on' : '';
    var ext = l.blank ? ' target="_blank" rel="noopener noreferrer"' : '';
    nav += '<a href="' + l.href + '" class="sitenav-a' + on + '" data-p="' + l.key + '"' + ext + '>' + l.label + '</a>';
  });
  nav += '</div>';

  f.innerHTML = nav + '<p class="sitenav-copy">© 2025-2026 Kanba_trader | All Rights Reserved</p>';
});
