/* ============================================================
   ABONTEN TICKETS — Navigation Logic
   ============================================================ */

(function () {
  'use strict';

  function initNav() {
    const nav = document.querySelector('.site-nav');
    const toggle = document.querySelector('.nav-mobile-toggle');
    const drawer = document.querySelector('.nav-mobile-drawer');
    const overlay = document.querySelector('.nav-mobile-overlay');
    const closeBtn = document.querySelector('.nav-mobile-close');

    if (!nav && !toggle && !drawer) return;

    // Scroll behavior
    if (nav && !nav.dataset.navScrollBound) {
      nav.dataset.navScrollBound = 'true';
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
      toggle && toggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }
    function closeDrawer() {
      drawer && drawer.classList.remove('open');
      overlay && overlay.classList.remove('active');
      toggle && toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    if (toggle && !toggle.dataset.navBound) {
      toggle.dataset.navBound = 'true';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', openDrawer);
    }
    if (closeBtn && !closeBtn.dataset.navBound) {
      closeBtn.dataset.navBound = 'true';
      closeBtn.addEventListener('click', closeDrawer);
    }
    if (overlay && !overlay.dataset.navBound) {
      overlay.dataset.navBound = 'true';
      overlay.addEventListener('click', closeDrawer);
    }

    document.querySelectorAll('.nav-mobile-link').forEach((link) => {
      if (link.dataset.navBound) return;
      link.dataset.navBound = 'true';
      link.addEventListener('click', closeDrawer);
    });
  }

  window.AbontenTicketsInitNav = initNav;
  document.addEventListener('DOMContentLoaded', initNav);
  window.addEventListener('abonten:navigation-ready', initNav);
})();
