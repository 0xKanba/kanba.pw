document.addEventListener('DOMContentLoaded', function () {
  var f = document.getElementById('footer');
  if (!f) return;

  // حقن التذييل داخل حاوية عزل فريدة
  f.innerHTML =
    '<div id="k-unified-footer">' +
      '<div class="k-nav">' +
        '<a href="/index.html" class="k-nav-a" data-p="index">Kanba</a>' +
        '<a href="/younis.html" class="k-nav-a" data-p="younis">Younis</a>' +
        '<a href="/ccr.html" class="k-nav-a" data-p="ccr">Compounding Calc.</a>' +
        '<a href="/HLsee.html" class="k-nav-a" data-p="hlsee" target="_blank" rel="noopener noreferrer">see analysis</a>' +
        '<a href="/video2026mar.html" class="k-nav-a" data-p="video2026mar" target="_blank" rel="noopener noreferrer">videosNEWS</a>' +
      '</div>' +
      '<p class="k-copy">© 2025-2026 Kanba_trader | All Rights Reserved</p>' +
    '</div>';

  var pop = window.location.pathname.toLowerCase().split('/').pop();
  var key = pop.replace('.html', '') || 'index';

  var links = f.querySelectorAll('.k-nav-a');
  for (var i = 0; i < links.length; i++) {
    if (links[i].getAttribute('data-p') === key) {
      links[i].classList.add('k-nav-on');
    }
  }
});
