/* ============================================================
   TICKET AFRICA — Navigation Logic
   ============================================================ */

(function () {
  'use strict';

  function initNav() {
    const nav = document.querySelector('.site-nav');
    const toggle = document.querySelector('.nav-mobile-toggle');
    const drawer = document.querySelector('.nav-mobile-drawer');
    const overlay = document.querySelector('.nav-mobile-overlay');
    const closeBtn = document.querySelector('.nav-mobile-close');

    // Scroll behavior
    if (nav) {
      const onScroll = () => {
        if (window.scrollY > 20) {
          nav.classList.add('scrolled');
          nav.classList.remove('nav--transparent');
        } else {
          nav.classList.remove('scrolled');
          if (nav.dataset.transparent === 'true') {
            nav.classList.add('nav--transparent');
          }
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    // Mobile drawer
    function openDrawer() {
      drawer && drawer.classList.add('open');
      overlay && overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
    function closeDrawer() {
      drawer && drawer.classList.remove('open');
      overlay && overlay.classList.remove('active');
      document.body.style.overflow = '';
    }

    toggle && toggle.addEventListener('click', openDrawer);
    closeBtn && closeBtn.addEventListener('click', closeDrawer);
    overlay && overlay.addEventListener('click', closeDrawer);
  }

  document.addEventListener('DOMContentLoaded', initNav);
})();
