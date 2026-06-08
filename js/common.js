document.addEventListener('DOMContentLoaded',function(){
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/css/style.css';
  document.head.appendChild(link);
  
  const footerHTML=`
    <footer class="footer">
      <div class="footer-content">
        <div class="footer-tabs">
          <a href="/index.html" class="footer-tab" data-page="index">Kanba</a>
          <a href="https://younis.pw" class="footer-tab" data-page="younis">Younis</a>
          <a href="/ccr.html" class="footer-tab"  data-page="ccr">Compounding Calc.</a>
          <a href="/funded/index.html" class="footer-tab" data-page="funded">All funded rules</a>
          <a href="/videos.html" class="footer-tab" target="_blank" data-page="videos">my videos</a>
        </div>
        <div class="copyright">
          © 2025-2026 Kanba_trader | All Rights Reserved
        </div>
      </div>
    </footer>
  `;
  
  const footerElement=document.getElementById('footer');
  if(footerElement)footerElement.innerHTML=footerHTML;

  // Active tab logic
  setTimeout(()=>{
    const path=window.location.pathname.toLowerCase().trim();
    const segments = path.split('/').filter(p => p !== '');
    let pageKey = 'index'; 

    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1].replace(/\.html$/, '');
      if (lastSegment === 'index' || lastSegment === '') {
        if (segments.length > 1) {
          pageKey = segments[segments.length - 2];
        } else {
          pageKey = 'index';
        }
      } else {
        pageKey = lastSegment;
      }
    }

    document.querySelectorAll('.footer-tab').forEach(tab=>{
      const tabPage=tab.getAttribute('data-page');
      if(tabPage===pageKey){tab.classList.add('active')}
    });
  }, 150);
});
