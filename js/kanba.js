/* ====== Ultra Clean K.Y.js - Adapted for Flat & Simple UX ====== */

document.addEventListener('DOMContentLoaded', function() {
  initEntranceAnimations();
  initHoverEffects();
  initProfileEffect();
  initBackgroundAnimation();
  initPerformance();
  initThemeToggle();
});

// Theme Toggle functionality
function initThemeToggle() {
  const toggleBtn = document.getElementById('themeToggle');
  if (!toggleBtn) return;
  
  // Check local storage or system preference
  const currentTheme = localStorage.getItem('theme');
  if (currentTheme === 'light') {
    document.body.classList.add('light-theme');
  } else if (currentTheme === 'dark') {
    document.body.classList.remove('light-theme');
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    document.body.classList.add('light-theme');
  }
  
  toggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    
    // Save preference
    if (document.body.classList.contains('light-theme')) {
      localStorage.setItem('theme', 'light');
    } else {
      localStorage.setItem('theme', 'dark');
    }
  });
}

// Entrance Animations Controller
function initEntranceAnimations() {
  const elements = document.querySelectorAll('[data-entrance]');
  
  elements.forEach((element, index) => {
    const baseDelay = parseFloat(window.getComputedStyle(element).animationDelay) || 0;
    const randomDelay = Math.random() * 0.1;
    element.style.animationDelay = `${baseDelay + randomDelay}s`;
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      elements.forEach(el => {
        const animation = window.getComputedStyle(el).animationName;
        if (animation && animation !== 'none') {
          el.style.animation = 'none';
          el.offsetHeight; 
          el.style.animation = '';
        }
      });
    }
  });
}

// Hover Effects adapted for simple inversion
function initHoverEffects() {
  const socialLinks = document.querySelectorAll('.social-link');
  
  socialLinks.forEach(link => {
    // Touch support for mobile
    link.addEventListener('touchstart', function() {
      this.style.transform = 'scale(0.95)';
    });
    
    link.addEventListener('touchend', function() {
      this.style.transform = 'scale(1.05)';
      setTimeout(() => {
        this.style.transform = '';
      }, 120);
    });
  });
}

// Profile Image Effect
function initProfileEffect() {
  const profileImg = document.querySelector('.profile-img-clean');
  if (!profileImg) return;
  
  profileImg.addEventListener('click', function() {
    this.style.transform = 'scale(1.1) rotate(5deg)';
    setTimeout(() => {
      this.style.transform = '';
    }, 400);
  });
}

// Background Mesh Animation
function initBackgroundAnimation() {
  const bgMesh = document.querySelector('.bg-mesh');
  if (!bgMesh) return;
  
  let mouseX = 0;
  let mouseY = 0;
  
  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 10;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 10;
    
    bgMesh.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
  });
  
  // Parallax on scroll
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const speed = scrolled * -0.2;
    
    bgMesh.style.transform = `translateY(${speed}px)`;
    lastScroll = scrolled;
  });
}

// Performance Optimizations
function initPerformance() {
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
