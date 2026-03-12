/* ====== Ultra Clean K.Y.js ====== */

document.addEventListener('DOMContentLoaded', function() {
  initEntranceAnimations();
  initHoverEffects();
  initProfileEffect();
  initBackgroundAnimation();
  initPerformance();
});

// Entrance Animations Controller
function initEntranceAnimations() {
  // Stagger animations for visual pleasure
  const elements = document.querySelectorAll('[data-entrance]');
  
  elements.forEach((element, index) => {
    // Add slight random delay for organic feel
    const baseDelay = parseFloat(window.getComputedStyle(element).animationDelay) || 0;
    const randomDelay = Math.random() * 0.1;
    element.style.animationDelay = `${baseDelay + randomDelay}s`;
  });

  // Re-trigger animations on page visibility
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      elements.forEach(el => {
        const animation = window.getComputedStyle(el).animationName;
        if (animation && animation !== 'none') {
          el.style.animation = 'none';
          el.offsetHeight; // Trigger reflow
          el.style.animation = '';
        }
      });
    }
  });
}

// Enhanced Hover Effects
function initHoverEffects() {
  const socialLinks = document.querySelectorAll('.social-link');
  
  socialLinks.forEach(link => {
    let timeout;
    
    link.addEventListener('mouseenter', function(e) {
      // Clear any existing timeout
      clearTimeout(timeout);
      
      // Add magnetic effect
      const rect = this.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      
      this.style.transform = `
        translateY(-10px) 
        scale(1.1) 
        rotateX(${-y / 5}deg) 
        rotateY(${x / 5}deg)
      `;
    });
    
    link.addEventListener('mousemove', function(e) {
      const rect = this.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      
      this.style.transform = `
        translateY(-10px) 
        scale(1.1) 
        rotateX(${-y / 5}deg) 
        rotateY(${x / 5}deg)
      `;
    });
    
    link.addEventListener('mouseleave', function() {
      this.style.transform = '';
      
      // Add bounce effect on leave
      timeout = setTimeout(() => {
        this.style.transform = 'scale(0.95)';
        setTimeout(() => {
          this.style.transform = '';
        }, 150);
      }, 100);
    });

    // Touch support for mobile
    link.addEventListener('touchstart', function() {
      this.style.transform = 'scale(0.95)';
    });
    
    link.addEventListener('touchend', function() {
      this.style.transform = 'scale(1.1)';
      setTimeout(() => {
        this.style.transform = '';
      }, 300);
    });
  });
}

// Profile Image 3D Effect
function initProfileEffect() {
  const profileImg = document.querySelector('.profile-img-clean');
  if (!profileImg) return;
  
  let currentX = 0;
  let currentY = 0;
  let targetX = 0;
  let targetY = 0;
  let isHovering = false;
  
  profileImg.addEventListener('mouseenter', () => {
    isHovering = true;
  });
  
  profileImg.addEventListener('mouseleave', () => {
    isHovering = false;
    targetX = 0;
    targetY = 0;
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isHovering) return;
    
    const rect = profileImg.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    targetX = (e.clientX - centerX) / 10;
    targetY = (e.clientY - centerY) / 10;
  });
  
  function animate() {
    currentX += (targetX - currentX) * 0.1;
    currentY += (targetY - currentY) * 0.1;
    
    if (isHovering) {
      profileImg.style.transform = `
        scale(1.1)
        perspective(1000px)
        rotateY(${currentX}deg)
        rotateX(${-currentY}deg)
        translateZ(20px)
      `;
    }
    
    requestAnimationFrame(animate);
  }
  
  animate();
  
  // Click effect
  profileImg.addEventListener('click', function() {
    this.style.transform = 'scale(1.2) rotate(360deg)';
    setTimeout(() => {
      this.style.transform = '';
    }, 600);
  });
}

// Background Mesh Animation
function initBackgroundAnimation() {
  const bgMesh = document.querySelector('.bg-mesh');
  if (!bgMesh) return;
  
  let mouseX = 0;
  let mouseY = 0;
  
  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 20;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 20;
    
    bgMesh.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
  });
  
  // Parallax on scroll
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const speed = scrolled * -0.5;
    
    bgMesh.style.transform = `translateY(${speed}px)`;
    lastScroll = scrolled;
  });
}

// Performance Optimizations
function initPerformance() {
  // Lazy load images
  const images = document.querySelectorAll('img');
  
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          imageObserver.unobserve(img);
        }
      });
    });
    
    images.forEach(img => imageObserver.observe(img));
  }
  
  // Reduce animations for low-power mode
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('[data-entrance]').forEach(el => {
      el.style.animation = 'none';
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  }
  
  // Pause animations when tab is not visible
  document.addEventListener('visibilitychange', () => {
    const isPaused = document.hidden;
    document.querySelectorAll('[data-entrance]').forEach(el => {
      el.style.animationPlayState = isPaused ? 'paused' : 'running';
    });
  });
}

// Keyboard Navigation
document.addEventListener('keydown', (e) => {
  const socialLinks = document.querySelectorAll('.social-link');
  const currentIndex = Array.from(socialLinks).findIndex(link => link === document.activeElement);
  
  switch(e.key) {
    case 'ArrowRight':
      if (currentIndex < socialLinks.length - 1) {
        socialLinks[currentIndex + 1].focus();
      }
      break;
    case 'ArrowLeft':
      if (currentIndex > 0) {
        socialLinks[currentIndex - 1].focus();
      }
      break;
    case 'Enter':
      if (document.activeElement.classList.contains('social-link')) {
        document.activeElement.click();
      }
      break;
  }
});

// PWA Support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error);
}

// Add install prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

// Network Status
window.addEventListener('online', () => {
  console.log('Back online');
});

window.addEventListener('offline', () => {
  console.log('Gone offline');
});

// Easter Egg: Konami Code
const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiIndex = 0;

document.addEventListener('keydown', (e) => {
  if (e.key === konamiCode[konamiIndex]) {
    konamiIndex++;
    if (konamiIndex === konamiCode.length) {
      document.body.style.animation = 'rainbow 2s linear infinite';
      setTimeout(() => {
        document.body.style.animation = '';
      }, 5000);
      konamiIndex = 0;
    }
  } else {
    konamiIndex = 0;
  }
});

// Add rainbow animation
const style = document.createElement('style');
style.textContent = `
  @keyframes rainbow {
    0% { filter: hue-rotate(0deg); }
    100% { filter: hue-rotate(360deg); }
  }
`;
document.head.appendChild(style);