document.addEventListener('DOMContentLoaded',function(){const link=document.createElement('link');link.rel='stylesheet';link.href='/css/styles.css';document.head.appendChild(link);const headerHTML=`
    
  `;const footerHTML=`
    <footer class="footer">
      <div class="footer-content">
        <div class="footer-tabs">
          <a href="/index.html" class="footer-tab" data-page="index">Kanba</a>
          <a href="/younis.html" class="footer-tab" data-page="younis">Younis</a>
          <a href="/ccr.html" class="footer-tab"  data-page="ccr">Compounding Calc.</a>
          <a href="/HLsee.html" class="footer-tab" data-page="hlsee">see analysis</a>
          <a href="/videos.html" class="footer-tab" target="_blank" data-page="videos">my videos</a>

        </div>
        <div class="copyright">
          © 2025-2026 Kanba_trader | All Rights Reserved
        </div>
      </div>
    </footer>
  `;const headerElement=document.getElementById('header');const footerElement=document.getElementById('footer');if(headerElement)headerElement.innerHTML=headerHTML;if(footerElement)footerElement.innerHTML=footerHTML;setTimeout(()=>{const path=window.location.pathname.toLowerCase().trim();let pageKey=path.split('/').pop().replace(/\.html$/,'').replace(/\/$/,'').trim();if(!pageKey||pageKey==='index.html'){pageKey='index'}
document.querySelectorAll('.footer-tab').forEach(tab=>{const tabPage=tab.getAttribute('data-page');if(tabPage===pageKey){tab.classList.add('active')}})},150)})
