document.addEventListener('DOMContentLoaded', function () {

  var f = document.getElementById('footer');
  if (!f) return;

  f.innerHTML =
    '<div class="sitenav">' +
      '<a href="/index.html"        class="sitenav-a" data-p="index">Kanba</a>' +
      '<a href="/younis.html"       class="sitenav-a" data-p="younis">Younis</a>' +
      '<a href="/ccr.html"          class="sitenav-a" data-p="ccr">Compounding Calc.</a>' +
      '<a href="/HLsee.html"        class="sitenav-a" data-p="hlsee"        target="_blank" rel="noopener noreferrer">see analysis</a>' +
      '<a href="/video2026mar.html" class="sitenav-a" data-p="video2026mar" target="_blank" rel="noopener noreferrer">videosNEWS</a>' +
    '</div>' +
    '<p class="sitenav-copy">© 2025-2026 Kanba_trader | All Rights Reserved</p>';

  var pop = window.location.pathname.toLowerCase().split('/').pop();
  var key = pop.replace('.html', '') || 'index';

  var links = f.querySelectorAll('.sitenav-a');
  for (var i = 0; i < links.length; i++) {
    if (links[i].getAttribute('data-p') === key) {
      links[i].className += ' sitenav-on';
    }
  }

});
