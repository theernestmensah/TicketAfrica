/* ============================================================
   TICKET AFRICA — Core Platform JS
   ============================================================ */

(function () {
    'use strict';

    /* ── Toast System ───────────────────────────────────── */
    window.TA = window.TA || {};

    TA.toast = function (message, type = 'info', duration = 4000) {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const iconMap = {
            success: `<iconify-icon icon="hugeicons:tick-01"></iconify-icon>`,
            error: `<iconify-icon icon="hugeicons:cancel-circle"></iconify-icon>`,
            warning: `<iconify-icon icon="hugeicons:alert-01"></iconify-icon>`,
            info: `<iconify-icon icon="hugeicons:alert-02"></iconify-icon>`
        };

        const colorMap = {
            success: 'var(--color-success)',
            error: 'var(--color-error)',
            warning: 'var(--color-warning)',
            info: 'var(--color-info)'
        };

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
      <span style="color:${colorMap[type]};width:20px;height:20px;flex-shrink:0;display:flex;align-items:center;">${iconMap[type]}</span>
      <span style="font-size:var(--text-sm);color:var(--color-text-primary);flex:1;">${message}</span>
      <button style="color:var(--color-text-muted);width:16px;height:16px;flex-shrink:0;display:flex;align-items:center;cursor:pointer;background:none;border:none;" onclick="this.closest('.toast').remove()">
        <iconify-icon icon="hugeicons:cancel-01"></iconify-icon>
      </button>`;

        container.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    };

    /* ── Modal System ───────────────────────────────────── */
    TA.modal = {
        open: function (id) {
            const modal = document.getElementById(id);
            if (modal) {
                modal.style.display = 'flex';
                document.body.style.overflow = 'hidden';
                modal.querySelector('.modal') && modal.querySelector('.modal').focus && modal.querySelector('.modal').focus();
            }
        },
        close: function (id) {
            const modal = document.getElementById(id);
            if (modal) {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        }
    };

    document.addEventListener('click', function (e) {
        if (e.target.matches('.modal-overlay')) {
            e.target.style.display = 'none';
            document.body.style.overflow = '';
        }
        if (e.target.matches('[data-modal-close]')) {
            const modal = e.target.closest('.modal-overlay');
            if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
        }
    });

    /* ── Tab System ─────────────────────────────────────── */
    TA.initTabs = function (containerSelector) {
        document.querySelectorAll(containerSelector || '[data-tabs]').forEach(function (container) {
            const tabs = container.querySelectorAll('[data-tab]');
            const panels = container.querySelectorAll('[data-panel]');
            tabs.forEach(function (tab) {
                tab.addEventListener('click', function () {
                    const target = this.dataset.tab;
                    tabs.forEach(t => t.classList.remove('active'));
                    panels.forEach(p => p.classList.remove('active'));
                    this.classList.add('active');
                    const panel = container.querySelector(`[data-panel="${target}"]`);
                    if (panel) panel.classList.add('active');
                });
            });
        });
    };

    /* ── Countdown Timer ────────────────────────────────── */
    TA.countdown = function (el, targetDate) {
        function update() {
            const now = new Date();
            const diff = new Date(targetDate) - now;
            if (diff <= 0) { el.textContent = 'Event started'; return; }
            const d = Math.floor(diff / 86400000);
            const h = Math.floor((diff % 86400000) / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            el.innerHTML = `
        <span class="countdown-unit"><strong>${d}</strong><small>d</small></span>
        <span class="countdown-sep">:</span>
        <span class="countdown-unit"><strong>${String(h).padStart(2, '0')}</strong><small>h</small></span>
        <span class="countdown-sep">:</span>
        <span class="countdown-unit"><strong>${String(m).padStart(2, '0')}</strong><small>m</small></span>
        <span class="countdown-sep">:</span>
        <span class="countdown-unit"><strong>${String(s).padStart(2, '0')}</strong><small>s</small></span>`;
        }
        update();
        return setInterval(update, 1000);
    };

    /* ── Scroll Animations ──────────────────────────────── */
    TA.initScrollReveal = function () {
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

        document.querySelectorAll('[data-reveal]').forEach(function (el) {
            observer.observe(el);
        });
    };

    /* ── Counter Animation ──────────────────────────────── */
    TA.animateCounter = function (el, target, duration, suffix) {
        const start = 0;
        const increment = target / (duration / 16);
        let current = start;
        const timer = setInterval(function () {
            current += increment;
            if (current >= target) { current = target; clearInterval(timer); }
            el.textContent = Math.floor(current).toLocaleString() + (suffix || '');
        }, 16);
    };

    /* ── Quantity Selector ──────────────────────────────── */
    TA.initQuantitySelectors = function () {
        document.querySelectorAll('.qty-selector').forEach(function (sel) {
            const minus = sel.querySelector('[data-qty-minus]');
            const plus = sel.querySelector('[data-qty-plus]');
            const input = sel.querySelector('input');
            if (!input) return;
            const min = parseInt(input.min || 0);
            const max = parseInt(input.max || 10);
            minus && minus.addEventListener('click', function () {
                const val = parseInt(input.value);
                if (val > min) input.value = val - 1;
                input.dispatchEvent(new Event('change'));
            });
            plus && plus.addEventListener('click', function () {
                const val = parseInt(input.value);
                if (val < max) input.value = val + 1;
                input.dispatchEvent(new Event('change'));
            });
        });
    };

    /* ── Format Currency ────────────────────────────────── */
    TA.formatCurrency = function (amount, currency) {
        const symbols = { GHS: 'GH₵', NGN: '₦', KES: 'KSh', ZAR: 'R', RWF: 'RWF' };
        const sym = symbols[currency] || currency || 'GH₵';
        return `${sym} ${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    /* ── Date Formatting ────────────────────────────────── */
    TA.formatDate = function (dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    };

    /* ── Init ───────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        TA.initTabs();
        TA.initScrollReveal();
        TA.initQuantitySelectors();

        // Animate stat counters when visible
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const target = parseFloat(el.dataset.count);
                    const suffix = el.dataset.suffix || '';
                    TA.animateCounter(el, target, 1500, suffix);
                    observer.unobserve(el);
                }
            });
        }, { threshold: 0.5 });
        document.querySelectorAll('[data-count]').forEach(el => observer.observe(el));
    });

})();


// Inject Iconify globally
const _ik = document.createElement('script');
_ik.src = 'https://code.iconify.design/iconify-icon/1.0.8/iconify-icon.min.js';
document.head.appendChild(_ik);
