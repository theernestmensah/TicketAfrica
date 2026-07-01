/* ============================================================
   AbontenTickets — Core Platform JS
   ============================================================ */

(function () {
    'use strict';

    /* ── Toast System ───────────────────────────────────── */
    window.TA = window.TA || {};

    /* ── Auth Attempts Throttler ────────────────────────── */
    TA.checkAuthRateLimit = function (identifier) {
        const key = 'ta_auth_attempts_' + identifier.replace(/[^a-zA-Z0-9]/g, '_');
        const now = Date.now();
        const windowMs = 15 * 60 * 1000; // 15 minutes
        const maxAttempts = 5;

        let attempts = [];
        try {
            attempts = JSON.parse(localStorage.getItem(key) || '[]');
        } catch (e) {
            attempts = [];
        }

        // Clean up attempts older than 15 minutes
        attempts = attempts.filter(t => now - t < windowMs);

        if (attempts.length >= maxAttempts) {
            return false;
        }

        attempts.push(now);
        localStorage.setItem(key, JSON.stringify(attempts));
        return true;
    };

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, function (char) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
        });
    }

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

        type = colorMap[type] ? type : 'info';
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
      <span style="color:${colorMap[type]};width:20px;height:20px;flex-shrink:0;display:flex;align-items:center;">${iconMap[type]}</span>
      <span style="font-size:var(--text-sm);color:var(--color-text-primary);flex:1;">${escapeHtml(message)}</span>
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

    /* ── Internationalization (i18n) ────────────────────── */
    window.TA_LANGUAGES = {
        en: {
            hero_headline_1: "Abonten",
            hero_headline_2: "for every event.",
            hero_headline_accent: "Tickets",
            hero_subtext: "Tickets. Verified. Delivered. Across Ghana, Nigeria, Kenya, South Africa & Rwanda.",
            hero_browse_btn: "Browse Events",
            hero_organizer_btn: "Sell Tickets",
            hero_stat_live: "Live Events",
            hero_stat_countries: "Countries",
            hero_stat_tickets: "Tickets Issued",
            hero_stat_ussd: "USSD Access",
            hero_search_placeholder: "Search events, artists, venues...",
            hero_country_placeholder: "All Countries",
            hero_when_placeholder: "Any Date",
            hero_find_events: "Find Events",
            hero_chip_ussd_sub: "No internet needed",
            voting_hero_title: "Community Power",
            voting_hero_sub: "Cast your vote in ongoing competitions, elections, and decision-making polls across Africa.",
            voting_section_title: "Active Polls",
            voting_fetching_polls: "Fetching active polls...",
            nav_discover: "Discover Events",
            nav_voting: "Voting & Polls",
            nav_organizers: "For Organizers",
            nav_pricing: "Pricing",
            nav_help: "Help",
            nav_signin: "Sign in",
            nav_get_started: "Get Started",
            nav_as_attendee: "As an Attendee",
            nav_as_attendee_desc: "Browse & buy event tickets",
            nav_as_organizer: "As an Organizer",
            nav_as_organizer_desc: "Create & manage events",
            nav_my_tickets: "My tickets",
            nav_org_dashboard: "Organizer dashboard",
            nav_signout: "Sign out",
            nav_signed_in: "Signed in",
            footer_col_platform: "Platform",
            footer_col_solutions: "Solutions",
            footer_col_support: "Support",
            footer_link_browse: "Browse Events",
            footer_link_voting: "Voting Systems",
            footer_link_story: "Our Story",
            footer_link_organizers: "For Organizers",
            footer_link_partner: "Partner with Us",
            footer_link_scanning: "Ticket Scanning",
            footer_link_help: "Help Center",
            footer_link_terms: "Terms of Service",
            footer_link_privacy: "Privacy Policy",
            footer_trust_payments: "Secure Payments",
            footer_trust_partners: "Official Partners",
            footer_brand_desc: "Empowering African events and communities through seamless ticketing and engagement.",
            dash_portal_breadcrumb: "Organizer Portal",
            dash_overview: "Overview",
            dash_new_event: "New Event",
            dash_launch_checklist: "Launch Checklist",
            dash_total_tickets_sold: "Total Tickets Sold",
            dash_gross_revenue: "Gross Revenue",
            dash_active_events: "Active Events",
            dash_ticket_holders: "Ticket Holders",
            dash_available_payout: "Available Payout",
            dash_request_payout: "Request Payout"
        },
        fr: {
            hero_headline_1: "Abonten",
            hero_headline_2: "pour chaque événement.",
            hero_headline_accent: "Tickets",
            hero_subtext: "Billets. Vérifiés. Livrés. À travers le Ghana, le Nigéria, le Kenya, l'Afrique du Sud & le Rwanda.",
            hero_browse_btn: "Parcourir les Événements",
            hero_organizer_btn: "Vendre des Billets",
            hero_stat_live: "Événements en Direct",
            hero_stat_countries: "Pays",
            hero_stat_tickets: "Billets Émis",
            hero_stat_ussd: "Accès USSD",
            hero_search_placeholder: "Rechercher des événements, artistes, lieux...",
            hero_country_placeholder: "Tous les Pays",
            hero_when_placeholder: "N'importe quelle date",
            hero_find_events: "Trouver des Événements",
            hero_chip_ussd_sub: "Sans connexion internet",
            voting_hero_title: "Pouvoir de la Communauté",
            voting_hero_sub: "Votez dans les compétitions, élections et sondages communautaires en cours à travers l'Afrique.",
            voting_section_title: "Sondages Actifs",
            voting_fetching_polls: "Récupération des sondages...",
            nav_discover: "Découvrir les Événements",
            nav_voting: "Vote & Sondages",
            nav_organizers: "Pour les Organisateurs",
            nav_pricing: "Tarifs",
            nav_help: "Aide",
            nav_signin: "Se connecter",
            nav_get_started: "Commencer",
            nav_as_attendee: "En tant que Participant",
            nav_as_attendee_desc: "Parcourir & acheter des billets",
            nav_as_organizer: "En tant qu'Organisateur",
            nav_as_organizer_desc: "Créer & gérer des événements",
            nav_my_tickets: "Mes billets",
            nav_org_dashboard: "Tableau de bord",
            nav_signout: "Se déconnecter",
            nav_signed_in: "Connecté",
            footer_col_platform: "Plateforme",
            footer_col_solutions: "Solutions",
            footer_col_support: "Support",
            footer_link_browse: "Parcourir les Événements",
            footer_link_voting: "Systèmes de Vote",
            footer_link_story: "Notre Histoire",
            footer_link_organizers: "Pour les Organisateurs",
            footer_link_partner: "Devenir Partenaire",
            footer_link_scanning: "Scan de Billets",
            footer_link_help: "Centre d'Aide",
            footer_link_terms: "Conditions d'Utilisation",
            footer_link_privacy: "Politique de Confidentialité",
            footer_trust_payments: "Paiements Sécurisés",
            footer_trust_partners: "Partenaires Officiels",
            footer_brand_desc: "Propulser les événements et les communautés en Afrique avec des solutions de billetterie et d'engagement fluides.",
            dash_portal_breadcrumb: "Portail Organisateur",
            dash_overview: "Aperçu",
            dash_new_event: "Nouvel Événement",
            dash_launch_checklist: "Liste de Lancement",
            dash_total_tickets_sold: "Billets Vendus",
            dash_gross_revenue: "Revenu Brut",
            dash_active_events: "Événements Actifs",
            dash_ticket_holders: "Détenteurs de Billets",
            dash_available_payout: "Paiement Disponible",
            dash_request_payout: "Demander un Paiement"
        },
        sw: {
            hero_headline_1: "Abonten",
            hero_headline_2: "kwa kila tukio.",
            hero_headline_accent: "Tickets",
            hero_subtext: "Tiketi. Zilizothibitishwa. Zilizotumwa. Kote Ghana, Nigeria, Kenya, Afrika Kusini & Rwanda.",
            hero_browse_btn: "Tafuta Matukio",
            hero_organizer_btn: "Uza Tiketi",
            hero_stat_live: "Matukio ya Moja kwa Moja",
            hero_stat_countries: "Nchi",
            hero_stat_tickets: "Tiketi Zilizotolewa",
            hero_stat_ussd: "Njia ya USSD",
            hero_search_placeholder: "Tafuta matukio, wasanii, maeneo...",
            hero_country_placeholder: "Nchi Zote",
            hero_when_placeholder: "Tarehe Yoyote",
            hero_find_events: "Pata Matukio",
            hero_chip_ussd_sub: "Bila mtandao",
            voting_hero_title: "Nguvu ya Jamii",
            voting_hero_sub: "Piga kura yako kwenye mashindano yanayoendelea, uchaguzi, na kura za maoni kote Afrika.",
            voting_section_title: "Kura za Maoni Zinazoendelea",
            voting_fetching_polls: "Inapakia kura za maoni...",
            nav_discover: "Gundua Matukio",
            nav_voting: "Kura & Maoni",
            nav_organizers: "Kwa Waandaaji",
            nav_pricing: "Bei",
            nav_help: "Msaada",
            nav_signin: "Ingia",
            nav_get_started: "Anza Sasa",
            nav_as_attendee: "Kama Mhudhuriaji",
            nav_as_attendee_desc: "Tafuta & nunua tiketi",
            nav_as_organizer: "Kama Mwandaji",
            nav_as_organizer_desc: "Unda & dhibiti matukio",
            nav_my_tickets: "Tiketi zangu",
            nav_org_dashboard: "Dashibodi ya Mwandaji",
            nav_signout: "Ondoka",
            nav_signed_in: "Umeingia kama",
            footer_col_platform: "Jukwaa",
            footer_col_solutions: "Suluhisho",
            footer_col_support: "Msaada",
            footer_link_browse: "Tafuta Matukio",
            footer_link_voting: "Mifumo ya Kura",
            footer_link_story: "Hadithi Yetu",
            footer_link_organizers: "Kwa Waandaaji",
            footer_link_partner: "Shirikiana Nasi",
            footer_link_scanning: "Kuhakiki Tiketi",
            footer_link_help: "Kituo cha Msaada",
            footer_link_terms: "Masharti ya Huduma",
            footer_link_privacy: "Sera ya Faragha",
            footer_trust_payments: "Malipo Salama",
            footer_trust_partners: "Washirika Rasmi",
            footer_brand_desc: "Kuwezesha matukio na jamii za Kiafrika kupitia mifumo ya tiketi na ushirikishwaji rahisi.",
            dash_portal_breadcrumb: "Lango la Mwandaji",
            dash_overview: "Maelezo ya Jumla",
            dash_new_event: "Tukio Jipya",
            dash_launch_checklist: "Orodha ya Kuanzia",
            dash_total_tickets_sold: "Tiketi Zilizouzwa",
            dash_gross_revenue: "Mapato Jumla",
            dash_active_events: "Matukio Yanayoendelea",
            dash_ticket_holders: "Wenye Tiketi",
            dash_available_payout: "Malipo Yanayopatikana",
            dash_request_payout: "Omba Malipo"
        }
    };

    TA.translate = function (key, lang) {
        const currentLang = lang || document.documentElement.getAttribute('lang') || localStorage.getItem('ta-lang') || 'en';
        const dictionary = window.TA_LANGUAGES[currentLang] || window.TA_LANGUAGES['en'];
        return dictionary[key] !== undefined ? dictionary[key] : (window.TA_LANGUAGES['en'][key] !== undefined ? window.TA_LANGUAGES['en'][key] : key);
    };

    TA.initI18n = function () {
        const urlParams = new URLSearchParams(window.location.search);
        const queryLang = urlParams.get('lang');
        const savedLang = localStorage.getItem('ta-lang');
        const browserLang = (navigator.language || 'en').substring(0, 2);
        
        let targetLang = 'en';
        if (queryLang && window.TA_LANGUAGES[queryLang]) {
            targetLang = queryLang;
        } else if (savedLang && window.TA_LANGUAGES[savedLang]) {
            targetLang = savedLang;
        } else if (browserLang && window.TA_LANGUAGES[browserLang]) {
            targetLang = browserLang;
        }

        document.documentElement.setAttribute('lang', targetLang);
        localStorage.setItem('ta-lang', targetLang);
        TA.updateDOMTranslations(targetLang);
    };

    TA.setLanguage = function (lang) {
        if (window.TA_LANGUAGES[lang]) {
            document.documentElement.setAttribute('lang', lang);
            localStorage.setItem('ta-lang', lang);
            TA.updateDOMTranslations(lang);
            
            // Sync to Convex database if user is logged in
            if (window.ConvexDB && window.Clerk && window.Clerk.user) {
                window.ConvexDB.updateLanguagePreference({ preferred_language: lang })
                    .catch(err => console.warn("[TA] Failed to update language in Convex:", err));
            }
            
            window.dispatchEvent(new CustomEvent('ta-lang-change', { detail: { language: lang } }));
        }
    };

    TA.updateDOMTranslations = function (lang) {
        const currentLang = lang || document.documentElement.getAttribute('lang') || 'en';
        
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = TA.translate(key, currentLang);
            if (translation !== key) {
                // If element has iconify-icon or specific child elements, replace only text nodes
                if (el.querySelector('iconify-icon') || el.querySelector('span')) {
                    let textNode = Array.from(el.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
                    if (textNode) {
                        textNode.nodeValue = translation;
                    } else {
                        // Fallback: search for child span text
                        const innerSpan = el.querySelector('span');
                        if (innerSpan) {
                            innerSpan.textContent = translation;
                        } else {
                            el.innerHTML = translation;
                        }
                    }
                } else {
                    el.textContent = translation;
                }
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.setAttribute('placeholder', TA.translate(key, currentLang));
        });

        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.setAttribute('title', TA.translate(key, currentLang));
        });

        const label = document.getElementById('nav-lang-label');
        if (label) {
            label.textContent = currentLang.toUpperCase();
        }
    };

    TA.initI18n();
    /* ── Init ───────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        TA.initTabs();
        TA.initScrollReveal();
        TA.initQuantitySelectors();
        TA.updateDOMTranslations();

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


// Inject Iconify once, even if core.js is included more than once.
if (!document.querySelector('script[data-ta-iconify]') && !window.customElements?.get('iconify-icon')) {
    var iconifyScript = document.createElement('script');
    iconifyScript.src = 'https://code.iconify.design/iconify-icon/1.0.8/iconify-icon.min.js';
    iconifyScript.defer = true;
    iconifyScript.dataset.taIconify = 'true';
    document.head.appendChild(iconifyScript);
}
