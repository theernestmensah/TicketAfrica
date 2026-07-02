/* ============================================================
   AbontenTickets — Shared Navigation & Footer Renderer
   This script injects the nav and footer into every page.
   ============================================================ */

(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  const NAV_HTML = `
  <nav class="site-nav nav--transparent" data-transparent="true" id="site-nav">
    <div class="container">
      <div class="nav-inner">
        <a href="/index.html" class="nav-logo" id="nav-logo" aria-label="AbontenTickets home">
          <span class="nav-logo__mark" aria-hidden="true">
            <img src="/assets/img/abonten-mark.jpeg" alt="" loading="eager" />
          </span>
          <span class="nav-logo__wordmark">Abonten<span>Tickets</span></span>
        </a>

        <div class="nav-menu" id="nav-menu">
          <a href="/events.html" class="nav-link" id="nav-events">Discover Events</a>
          <a href="/voting.html" class="nav-link" id="nav-voting">Voting & Polls</a>
          <a href="/for-organizers.html" class="nav-link" id="nav-organizers">For Organizers</a>
          <a href="/for-organizers.html#pricing" class="nav-link" id="nav-pricing">Pricing</a>
          <a href="/help.html" class="nav-link" id="nav-help">Help</a>
        </div>

        <div class="nav-actions">
          <div class="nav-dropdown" id="nav-dd-currency" style="margin-right: 8px;">
            <button class="nav-country-selector nav-dropdown__trigger" style="cursor:pointer; display: flex; align-items: center; gap: 4px; padding: 6px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-full); background: var(--color-bg-input); color: var(--color-text-primary);">
              <span id="nav-currency-label" style="font-weight: 600; font-size: 13px;">GH₵</span>
              <iconify-icon icon="hugeicons:arrow-down-01" style="width:12px;font-size:12px;"></iconify-icon>
            </button>
            <div class="nav-dropdown__panel" style="min-width: 140px; right: 0; left: auto; padding: 8px;">
              <div class="nav-dropdown__item" style="cursor:pointer;" onclick="document.getElementById('nav-currency-label').innerText='GH₵';"><div class="nav-dropdown__item-content"><span class="nav-dropdown__item-title">GH₵ (GHS)</span></div></div>
              <div class="nav-dropdown__item" style="cursor:pointer;" onclick="document.getElementById('nav-currency-label').innerText='₦';"><div class="nav-dropdown__item-content"><span class="nav-dropdown__item-title">₦ (NGN)</span></div></div>
              <div class="nav-dropdown__item" style="cursor:pointer;" onclick="document.getElementById('nav-currency-label').innerText='R';"><div class="nav-dropdown__item-content"><span class="nav-dropdown__item-title">R (ZAR)</span></div></div>
              <div class="nav-dropdown__item" style="cursor:pointer;" onclick="document.getElementById('nav-currency-label').innerText='KSh';"><div class="nav-dropdown__item-content"><span class="nav-dropdown__item-title">KSh (KES)</span></div></div>
              <div class="nav-dropdown__item" style="cursor:pointer;" onclick="document.getElementById('nav-currency-label').innerText='$';"><div class="nav-dropdown__item-content"><span class="nav-dropdown__item-title">$ (USD)</span></div></div>
            </div>
          </div>
          <a href="/login.html" class="btn btn--secondary btn--sm" id="nav-login">Sign in</a>
          <div class="nav-dropdown" id="nav-signup-dd">
            <button class="btn btn--primary btn--sm nav-dropdown__trigger" id="nav-signup" style="display:inline-flex;align-items:center;gap:6px;">
              Get Started
              <iconify-icon icon="hugeicons:arrow-down-01" style="font-size:12px;"></iconify-icon>
            </button>
            <div class="nav-dropdown__panel" style="min-width:220px;right:0;left:auto;padding:8px;">
              <a href="/signup.html" class="nav-dropdown__item" id="nav-signup-attendee">
                <div class="nav-dropdown__item-icon">
                  <iconify-icon icon="hugeicons:user-circle"></iconify-icon>
                </div>
                <div class="nav-dropdown__item-content">
                  <span class="nav-dropdown__item-title">As an Attendee</span>
                  <span class="nav-dropdown__item-desc">Browse & buy event tickets</span>
                </div>
              </a>
              <a href="/organizer-signup.html" class="nav-dropdown__item" id="nav-signup-organizer">
                <div class="nav-dropdown__item-icon">
                  <iconify-icon icon="hugeicons:calendar-add-02"></iconify-icon>
                </div>
                <div class="nav-dropdown__item-content">
                  <span class="nav-dropdown__item-title">As an Organizer</span>
                  <span class="nav-dropdown__item-desc">Create & manage events</span>
                </div>
              </a>
            </div>
          </div>
          <div class="nav-user" id="nav-user" hidden>
            <button class="nav-user__button" id="nav-user-toggle" type="button" aria-haspopup="menu" aria-expanded="false">
              <span class="nav-user__avatar" id="nav-user-avatar" aria-hidden="true">AT</span>
              <span class="nav-user__meta">
                <span class="nav-user__status">Signed in</span>
                <span class="nav-user__name" id="nav-user-name">Account</span>
              </span>
              <iconify-icon icon="hugeicons:arrow-down-01" class="nav-user__chevron"></iconify-icon>
            </button>
            <div class="nav-user__menu" id="nav-user-menu" role="menu">
              <a href="/account.html" class="nav-user__menu-item" role="menuitem">
                <iconify-icon icon="hugeicons:ticket-01"></iconify-icon>
                My tickets
              </a>
              <a href="/organizer-dashboard.html" class="nav-user__menu-item" role="menuitem">
                <iconify-icon icon="hugeicons:dashboard-square-01"></iconify-icon>
                Organizer dashboard
              </a>
              <button class="nav-user__menu-item nav-user__menu-item--button" id="nav-signout" type="button" role="menuitem">
                <iconify-icon icon="hugeicons:logout-03"></iconify-icon>
                Sign out
              </button>
            </div>
          </div>
          <div id="clerk-user-button" hidden></div>
          <button class="nav-mobile-toggle" id="nav-mobile-toggle" type="button" aria-label="Open menu">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
    </div>
  </nav>

  <div class="nav-mobile-overlay" id="nav-mobile-overlay"></div>
  <div class="nav-mobile-drawer" id="nav-mobile-drawer">
    <div class="nav-mobile-header">
      <a href="/index.html" class="nav-logo" aria-label="AbontenTickets home">
        <span class="nav-logo__mark" aria-hidden="true">
          <img src="/assets/img/abonten-mark.jpeg" alt="" loading="eager" />
        </span>
        <span class="nav-logo__wordmark">Abonten<span>Tickets</span></span>
      </a>
      <button class="nav-mobile-close" id="nav-mobile-close" aria-label="Close menu">
        <iconify-icon icon="hugeicons:cancel-01" style="width:18px;height:18px;"></iconify-icon>
      </button>
    </div>
    <div class="nav-mobile-links">
      <a href="/events.html" class="nav-mobile-link" id="mob-events">
        <iconify-icon icon="hugeicons:calendar-01"></iconify-icon>
        Discover Events
      </a>
      <a href="/voting.html" class="nav-mobile-link" id="mob-voting">
        <iconify-icon icon="hugeicons:star"></iconify-icon>
        Voting & Polls
      </a>
      <a href="/for-organizers.html" class="nav-mobile-link" id="mob-organizers">
        <iconify-icon icon="hugeicons:user-add-01"></iconify-icon>
        For Organizers
      </a>
      <a href="/for-organizers.html#pricing" class="nav-mobile-link" id="mob-pricing">
        <iconify-icon icon="hugeicons:star"></iconify-icon>
        Pricing
      </a>
      <a href="/help.html" class="nav-mobile-link" id="mob-help">
        <iconify-icon icon="hugeicons:help-circle"></iconify-icon>
        Help Center
      </a>
    </div>
    <div class="nav-mobile-actions">
      <div class="nav-mobile-account" id="mob-user-card" hidden>
        <span class="nav-user__avatar" id="mob-user-avatar" aria-hidden="true">AT</span>
        <span class="nav-mobile-account__meta">
          <span class="nav-mobile-account__status">Signed in</span>
          <span class="nav-mobile-account__name" id="mob-user-name">Account</span>
        </span>
      </div>
      <div class="nav-mobile-account-links" id="mob-user-links" hidden>
        <a href="/account.html" class="btn btn--secondary btn--full">
          <iconify-icon icon="hugeicons:ticket-01"></iconify-icon> My tickets
        </a>
        <a href="/organizer-dashboard.html" class="btn btn--secondary btn--full">
          <iconify-icon icon="hugeicons:dashboard-square-01"></iconify-icon> Dashboard
        </a>
        <button class="btn btn--ghost btn--full" id="mob-signout" type="button">
          <iconify-icon icon="hugeicons:logout-03"></iconify-icon> Sign out
        </button>
      </div>
      <a href="/login.html" class="btn btn--secondary btn--full" id="mob-login">Sign in</a>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <a href="/signup.html" class="btn btn--primary btn--full" id="mob-signup-attendee" style="display:flex;align-items:center;justify-content:center;gap:8px;">
          <iconify-icon icon="hugeicons:user-circle"></iconify-icon> Attendee Sign Up
        </a>
        <a href="/organizer-signup.html" class="btn btn--secondary btn--full" id="mob-signup-organizer" style="display:flex;align-items:center;justify-content:center;gap:8px;">
          <iconify-icon icon="hugeicons:calendar-add-02"></iconify-icon> Organizer Sign Up
        </a>
      </div>
    </div>
  </div>`;

  const FOOTER_HTML = `
  <footer class="site-footer" id="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="/index.html" class="nav-logo" style="margin-bottom:var(--space-2);" aria-label="AbontenTickets home">
            <span class="nav-logo__mark" aria-hidden="true">
              <img src="/assets/img/abonten-mark.jpeg" alt="" loading="lazy" />
            </span>
            <span class="nav-logo__wordmark">Abonten<span>Tickets</span></span>
          </a>
          <p class="footer-brand__desc">Africa's leading event ticketing infrastructure. Powering millions of ticket transactions across the continent with trust, speed, and security.</p>
          <div class="footer-trust-marks">
            <div class="footer-trust-mark">
              <iconify-icon icon="hugeicons:shield-01"></iconify-icon>
              SSL Secured
            </div>
            <div class="footer-trust-mark">
              <iconify-icon icon="hugeicons:tick-01"></iconify-icon>
              PCI DSS Compliant
            </div>
          </div>
          <div class="footer-markets" style="margin-top:var(--space-4);">
            <span class="footer-market-tag"><iconify-icon icon="hugeicons:flag-01" style="vertical-align:middle;"></iconify-icon> Ghana</span>
            <span class="footer-market-tag"><iconify-icon icon="hugeicons:flag-01" style="vertical-align:middle;"></iconify-icon> Nigeria</span>
            <span class="footer-market-tag"><iconify-icon icon="hugeicons:flag-01" style="vertical-align:middle;"></iconify-icon> Kenya</span>
            <span class="footer-market-tag"><iconify-icon icon="hugeicons:flag-01" style="vertical-align:middle;"></iconify-icon> South Africa</span>
            <span class="footer-market-tag"><iconify-icon icon="hugeicons:flag-01" style="vertical-align:middle;"></iconify-icon> Rwanda</span>
          </div>
        </div>

        <div class="footer-col">
          <p class="footer-col__title">Platform</p>
          <div class="footer-col__links">
            <a href="/events.html" class="footer-col__link">Discover Events</a>
            <a href="/voting.html" class="footer-col__link">Voting & Polls</a>
            <a href="/events.html?cat=concerts" class="footer-col__link">Concerts</a>
            <a href="/events.html?cat=sports" class="footer-col__link">Sports</a>
            <a href="/events.html?cat=festivals" class="footer-col__link">Festivals</a>
            <a href="/events.html?cat=conferences" class="footer-col__link">Conferences</a>
            <a href="/resale.html" class="footer-col__link">Ticket Resale</a>
          </div>
        </div>

        <div class="footer-col">
          <p class="footer-col__title">Organizers</p>
          <div class="footer-col__links">
            <a href="/for-organizers.html" class="footer-col__link">For Organizers</a>
            <a href="/for-organizers.html#pricing" class="footer-col__link">Pricing & Fees</a>
            <a href="/organizer-dashboard.html" class="footer-col__link">Dashboard Login</a>
            <a href="/help.html#organizer" class="footer-col__link">Organizer Help</a>
          </div>
        </div>

        <div class="footer-col">
          <p class="footer-col__title">Company</p>
          <div class="footer-col__links">
            <a href="/about.html" class="footer-col__link">About Us</a>
            <a href="/ticket-authenticity.html" class="footer-col__link">Ticket Authenticity</a>
            <a href="/help.html" class="footer-col__link">Help Center</a>
            <a href="/contact.html" class="footer-col__link">Contact</a>
            <a href="/careers.html" class="footer-col__link">Careers</a>
          </div>
        </div>

        <div class="footer-col">
          <p class="footer-col__title">Access</p>
          <div class="footer-col__links">
            <a href="/login.html" class="footer-col__link">Sign In</a>
            <a href="/signup.html" class="footer-col__link">Create Account</a>
            <a href="/account.html" class="footer-col__link">My Tickets</a>
            <a href="#ussd" class="footer-col__link">Buy via USSD (*123*88#)</a>
          </div>
          <div style="margin-top:var(--space-5);">
            <p class="footer-col__title">Follow Us</p>
            <div class="footer-social" style="margin-top:var(--space-3);">
              <a href="#" class="footer-social__link" aria-label="Twitter" id="footer-twitter">
                <iconify-icon icon="hugeicons:star"></iconify-icon>
              </a>
              <a href="#" class="footer-social__link" aria-label="Instagram" id="footer-instagram">
                <iconify-icon icon="hugeicons:star"></iconify-icon>
              </a>
              <a href="#" class="footer-social__link" aria-label="Facebook" id="footer-facebook">
                <iconify-icon icon="hugeicons:star"></iconify-icon>
              </a>
              <a href="#" class="footer-social__link" aria-label="LinkedIn" id="footer-linkedin">
                <iconify-icon icon="hugeicons:building-01"></iconify-icon>
              </a>
            </div>
          </div>
        </div>
      </div>

      <div class="footer-bottom">
        <p class="footer-bottom__copy">© 2026 AbontenTickets Ltd. All rights reserved.</p>
        <div class="footer-bottom__links">
          <a href="/terms.html" class="footer-bottom__link">Terms of Service</a>
          <a href="/privacy.html" class="footer-bottom__link">Privacy Policy</a>
          <a href="/refund-policy.html" class="footer-bottom__link">Refund Policy</a>
          <a href="/insurance-policy.html" class="footer-bottom__link">Insurance Policy</a>
          <a href="/ticket-authenticity.html" class="footer-bottom__link">Ticket Authenticity</a>
        </div>
      </div>
    </div>
  </footer>`;

  function inject() {
    // Nav
    const navTarget = document.getElementById('nav-root');
    if (navTarget) navTarget.innerHTML = NAV_HTML;

    // Footer
    const footerTarget = document.getElementById('footer-root');
    if (footerTarget) footerTarget.innerHTML = FOOTER_HTML;

    if (typeof window.AbontenTicketsInitNav === 'function') window.AbontenTicketsInitNav();
    window.dispatchEvent(new Event('abonten:navigation-ready'));

    // Highlight active nav link
    const path = window.location.pathname.replace(/\/$/, '');
    document.querySelectorAll('.nav-link, .nav-mobile-link, .footer-col__link').forEach(function (a) {
      if (a.getAttribute('href') && a.getAttribute('href') !== '#') {
        const href = a.getAttribute('href').split('?')[0].split('#')[0];
        if (path.endsWith(href) || (path === '' && href === '/index.html')) {
          a.classList.add('active');
        }
      }
    });

    // Inject Live Chat Bot Widget
    if (!document.getElementById('live-chat-bot')) {
      const chatHtml = `
            <div id="live-chat-bot" style="position: fixed; bottom: 24px; right: 24px; z-index: 9999;">
                <button style="width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, var(--color-primary), var(--color-accent)); border: none; color: white; box-shadow: 0 8px 32px rgba(139, 92, 246, 0.4); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" onclick="alert('Live Chat Initializing... This would connect to an AI bot like Crisp, Intercom, or a custom Convex/WebSocket backend!')">
                    <iconify-icon icon="hugeicons:message-multiple-01" style="font-size: 24px;"></iconify-icon>
                </button>
            </div>`;
      document.body.insertAdjacentHTML('beforeend', chatHtml);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  // Hook up Backend & Auto-seed
  window.addEventListener('convex-ready', async () => {
    try {
      const needsEventData = Boolean(
        document.getElementById('featured-events-grid') ||
        document.getElementById('events-grid') ||
        document.getElementById('stat-live-events') ||
        document.getElementById('cat-count-concerts') ||
        document.getElementById('city-count-accra') ||
        document.getElementById('fc-concerts') ||
        document.getElementById('discovery-subtitle')
      );
      const needsPollData = Boolean(document.getElementById('home-polls-grid'));

      if (!needsEventData && !needsPollData) return;

      const events = needsEventData ? await window.ConvexDB.listEvents() : [];

      if (events && events.length > 0) {
        // ── Update category counts from real data ──
        const catMap = { concerts: 0, sports: 0, festivals: 0, church: 0, conferences: 0, nightlife: 0, culture: 0 };
        const cityMap = { accra: 0, lagos: 0, nairobi: 0, johannesburg: 0, kigali: 0, abuja: 0, kumasi: 0 };

        events.forEach(ev => {
          const cat = (ev.category || '').toLowerCase();
          if (catMap.hasOwnProperty(cat)) catMap[cat]++;
          const city = (ev.city || ev.location?.city || '').toLowerCase();
          Object.keys(cityMap).forEach(c => { if (city.includes(c)) cityMap[c]++; });
        });

        // ── index.html: category card counts ──
        Object.entries(catMap).forEach(([cat, count]) => {
          const el = document.getElementById('cat-count-' + cat);
          if (el) el.textContent = count > 0 ? count + ' events' : 'Browse →';
        });
        // ── index.html: city card counts ──
        Object.entries(cityMap).forEach(([city, count]) => {
          const el = document.getElementById('city-count-' + city);
          if (el) el.textContent = count > 0 ? count + ' events →' : 'Explore →';
        });

        // ── events.html: filter sidebar category counts ──
        Object.entries(catMap).forEach(([cat, count]) => {
          const el = document.getElementById('fc-' + cat);
          if (el) el.textContent = count > 0 ? count : '';
        });
        // ── events.html: filter sidebar city counts ──
        Object.entries(cityMap).forEach(([city, count]) => {
          const el = document.getElementById('fc-' + city);
          if (el) el.textContent = count > 0 ? count : '';
        });
        // ── events.html: discovery hero subtitle ──
        const subtitle = document.getElementById('discovery-subtitle');
        if (subtitle) subtitle.textContent = events.length + ' events across 5 countries — Africa';

        // ── index.html: live events hero stat ──
        const heroStatEl = document.getElementById('stat-live-events');
        if (heroStatEl) heroStatEl.textContent = events.length + '+';

        // ── Render to index.html featured grid ──
        const featuredGrid = document.getElementById('featured-events-grid');
        if (featuredGrid) {
          featuredGrid.innerHTML = events.slice(0, 3).map(ev => window.ConvexDB.renderEventCard(ev)).join('');
          if (window.TA?.initScrollReveal) setTimeout(() => window.TA.initScrollReveal(), 100);
        }

        // ── Render to events.html discovery grid ──
        const discoveryGrid = document.getElementById('events-grid');
        if (discoveryGrid && window.location.pathname.includes('events.html')) {
          discoveryGrid.innerHTML = events.map(ev => window.ConvexDB.renderEventCard(ev)).join('');
          if (window.TA?.initScrollReveal) setTimeout(() => window.TA.initScrollReveal(), 100);

          const resultsCount = document.getElementById('results-count');
          if (resultsCount) {
            resultsCount.innerHTML = `Showing <strong>${events.length}</strong> events`;
          }
        }

        // ── index.html: Home Polls ──
        const homePollsGrid = document.getElementById('home-polls-grid');
        if (homePollsGrid) {
          try {
            const polls = await window.ConvexDB.listPublicPolls();
            if (polls && polls.length > 0) {
              homePollsGrid.innerHTML = polls.slice(0, 3).map(poll => {
                const totalVotes = poll.options?.reduce((sum, opt) => sum + (opt.voteCount || 0), 0) || 0;
                return `
                  <div class="poll-card" style="background:var(--color-bg-card);border:1px solid var(--color-border);border-radius:var(--radius-xl);padding:var(--space-6);display:flex;flex-direction:column;gap:var(--space-4);" data-reveal>
                    <div style="font-size:var(--text-xs);font-weight:700;color:var(--color-secondary);text-transform:uppercase;letter-spacing:0.06em;">Active Poll</div>
                    <h3 style="font-family:var(--font-display);font-size:var(--text-lg);font-weight:700;">${escapeHtml(poll.title)}</h3>
                    <p style="font-size:var(--text-sm);color:var(--color-text-muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1;">${escapeHtml(poll.description)}</p>
                    <div style="display:flex;align-items:center;justify-content:space-between;padding-top:var(--space-4);border-top:1px solid var(--color-border);">
                      <div style="font-size:var(--text-sm);color:var(--color-text-muted);font-weight:600;">
                        <iconify-icon icon="hugeicons:star" style="vertical-align:middle;margin-right:4px;"></iconify-icon> ${totalVotes} votes cast
                      </div>
                      <a href="voting.html" class="btn btn--secondary btn--sm">Vote Now</a>
                    </div>
                  </div>
                `;
              }).join('');
              if (window.TA?.initScrollReveal) setTimeout(() => window.TA.initScrollReveal(), 100);
            } else {
              homePollsGrid.innerHTML = `
                <div style="grid-column:1/-1;padding:60px;text-align:center;background:var(--color-bg-card);border:1px solid var(--color-border);border-radius:var(--radius-xl);">
                  <iconify-icon icon="hugeicons:star" style="font-size:48px;color:var(--color-text-muted);opacity:0.2;margin-bottom:var(--space-4);"></iconify-icon>
                  <p style="color:var(--color-text-muted);">No active competitions at the moment. Check back soon!</p>
                </div>
              `;
            }
          } catch (e) { console.warn("Error loading home polls:", e); }
        }
      }
    } catch (err) {
      console.error("Convex Connection Error", err);
    }
  });

  // Hook up Auth UI
  const initAuthUI = () => {
    const clerk = window.Clerk;
    if (!clerk) return; // Wait for clerk-ready

    const loginBtn = document.getElementById('nav-login');
    const mobileLoginBtn = document.getElementById('mob-login');
    const signupBtn = document.getElementById('nav-signup');
    const userBtnDiv = document.getElementById('clerk-user-button');

    if (!loginBtn && !mobileLoginBtn && !userBtnDiv) return; // Wait for DOM inject

    const openSignIn = (e) => {
      e?.preventDefault?.();
      const drawer = document.getElementById('nav-mobile-drawer');
      const overlay = document.getElementById('nav-mobile-overlay');
      if (drawer) drawer.classList.remove('open');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
      window.location.href = '/login.html';
    };

    // Update UI based on auth state
    const updateAuthUI = () => {
      if (clerk.user) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (mobileLoginBtn) mobileLoginBtn.style.display = 'none';
        if (signupBtn) signupBtn.style.display = 'none';
        if (userBtnDiv) {
          userBtnDiv.style.display = 'block';
          clerk.mountUserButton(userBtnDiv);
        }
      } else {
        if (loginBtn) {
          loginBtn.style.display = 'inline-flex';
          loginBtn.onclick = openSignIn;
        }
        if (mobileLoginBtn) {
          mobileLoginBtn.style.display = 'flex';
          mobileLoginBtn.onclick = openSignIn;
        }
        if (signupBtn) {
          signupBtn.style.display = 'inline-flex';
          // Dropdown trigger — no clerk modal hijack; links handle navigation
        }
        if (userBtnDiv) userBtnDiv.style.display = 'none';
      }
    };

    // Run initially
    updateAuthUI();

    // Listen for auth state changes
    clerk.addListener((state) => {
      updateAuthUI();

      // Pass the session token into Convex automatically so queries identify the User
      if (state.user && window.ConvexDB?.client) {
        window.ConvexDB.client.setAuth(async () => {
          try {
            if (typeof window.AbontenTicketsGetConvexToken === 'function') {
              return await window.AbontenTicketsGetConvexToken(clerk.session);
            }
            return await clerk.session?.getToken({ template: 'convex' });
          } catch (e) {
            console.warn('[AbontenTickets] Convex auth token unavailable.', e);
            return null;
          }
        });

        // Sync language preference from/to Convex
        window.ConvexDB.getByClerkId(state.user.id)
          .then(user => {
            if (user && user.preferred_language) {
              window.TA && window.TA.setLanguage(user.preferred_language);
            } else if (user) {
              const currentLang = localStorage.getItem('ta-lang') || 'en';
              window.ConvexDB.updateLanguagePreference({ preferred_language: currentLang })
                .catch(err => console.warn("[TA] Failed to seed user language in Convex:", err));
            }
          })
          .catch(err => console.warn("[TA] getByClerkId error for language sync:", err));
      } else if (window.ConvexDB?.client) {
        window.ConvexDB.client.clearAuth();
      }
    });
  };

  window.addEventListener('clerk-ready', initAuthUI);
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(initAuthUI, 500); // Give inject a moment
  });

  const initAbontenTicketsAuthUI = () => {
    const loginBtn = document.getElementById('nav-login');
    const mobileLoginBtn = document.getElementById('mob-login');
    const signupBtn = document.getElementById('nav-signup');
    const signupDropdown = document.getElementById('nav-signup-dd');
    const mobileSignupAttendee = document.getElementById('mob-signup-attendee');
    const mobileSignupOrganizer = document.getElementById('mob-signup-organizer');
    const navUser = document.getElementById('nav-user');
    const navUserToggle = document.getElementById('nav-user-toggle');
    const navUserName = document.getElementById('nav-user-name');
    const navUserAvatar = document.getElementById('nav-user-avatar');
    const navSignout = document.getElementById('nav-signout');
    const mobileUserCard = document.getElementById('mob-user-card');
    const mobileUserLinks = document.getElementById('mob-user-links');
    const mobileUserName = document.getElementById('mob-user-name');
    const mobileUserAvatar = document.getElementById('mob-user-avatar');
    const mobileSignout = document.getElementById('mob-signout');

    if (!loginBtn && !mobileLoginBtn && !navUser) return;

    const closeDrawer = () => {
      const drawer = document.getElementById('nav-mobile-drawer');
      const overlay = document.getElementById('nav-mobile-overlay');
      if (drawer) drawer.classList.remove('open');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
    };

    const openSignIn = (e) => {
      e?.preventDefault?.();
      closeDrawer();
      window.location.href = '/login.html';
    };

    const setVisible = (el, visible, displayValue) => {
      if (!el) return;
      el.hidden = !visible;
      el.style.display = visible ? (displayValue || '') : 'none';
    };

    const getDisplayName = (user) => {
      return user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.primaryEmailAddress?.emailAddress || 'Account';
    };

    const getInitials = (name) => {
      const parts = String(name || 'AT').trim().split(/\s+/).filter(Boolean);
      return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) || 'AT').toUpperCase();
    };

    const setAvatar = (el, user, name) => {
      if (!el) return;
      if (user?.imageUrl) {
        el.innerHTML = '<img src="' + escapeHtml(user.imageUrl) + '" alt="">';
      } else {
        el.textContent = getInitials(name);
      }
    };

    const update = () => {
      const user = window.Clerk?.user || null;
      const signedIn = Boolean(user);
      const name = getDisplayName(user);

      setVisible(loginBtn, !signedIn, 'inline-flex');
      setVisible(mobileLoginBtn, !signedIn, 'flex');
      setVisible(signupBtn, !signedIn, 'inline-flex');
      setVisible(signupDropdown, !signedIn);
      setVisible(mobileSignupAttendee, !signedIn, 'flex');
      setVisible(mobileSignupOrganizer, !signedIn, 'flex');
      setVisible(navUser, signedIn, 'flex');
      setVisible(mobileUserCard, signedIn, 'flex');
      setVisible(mobileUserLinks, signedIn, 'flex');

      if (signedIn) {
        if (navUserName) navUserName.textContent = name;
        if (mobileUserName) mobileUserName.textContent = name;
        setAvatar(navUserAvatar, user, name);
        setAvatar(mobileUserAvatar, user, name);
      }

      if (loginBtn) loginBtn.onclick = openSignIn;
      if (mobileLoginBtn) mobileLoginBtn.onclick = openSignIn;
    };

    if (navUserToggle && !navUserToggle.dataset.taBound) {
      navUserToggle.dataset.taBound = 'true';
      navUserToggle.addEventListener('click', () => {
        const isOpen = navUser?.classList.toggle('is-open');
        navUserToggle.setAttribute('aria-expanded', String(Boolean(isOpen)));
      });
      document.addEventListener('click', (event) => {
        if (navUser && !navUser.contains(event.target)) {
          navUser.classList.remove('is-open');
          navUserToggle.setAttribute('aria-expanded', 'false');
        }
      });
    }

    const signOut = async () => {
      try {
        await window.Clerk?.signOut?.();
      } finally {
        window.location.href = '/index.html';
      }
    };

    if (navSignout && !navSignout.dataset.taBound) {
      navSignout.dataset.taBound = 'true';
      navSignout.addEventListener('click', signOut);
    }

    if (mobileSignout && !mobileSignout.dataset.taBound) {
      mobileSignout.dataset.taBound = 'true';
      mobileSignout.addEventListener('click', signOut);
    }

    update();

    if (window.Clerk?.addListener && !window.Clerk.__taVisibleAuthBound) {
      window.Clerk.__taVisibleAuthBound = true;
      window.Clerk.addListener(update);
    }
  };

  const waitForAbontenTicketsAuthUI = (attemptsLeft = 30) => {
    initAbontenTicketsAuthUI();
    if (window.Clerk) {
      Promise.resolve(window.Clerk.load?.()).catch(() => {}).finally(initAbontenTicketsAuthUI);
      return;
    }
    if (attemptsLeft > 0) setTimeout(() => waitForAbontenTicketsAuthUI(attemptsLeft - 1), 200);
  };

  window.addEventListener('clerk-ready', initAbontenTicketsAuthUI);
  window.addEventListener('load', () => waitForAbontenTicketsAuthUI());
  window.addEventListener('DOMContentLoaded', () => setTimeout(waitForAbontenTicketsAuthUI, 250));

})();
