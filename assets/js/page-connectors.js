/**
 * page-connectors.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AbontenTickets — Page-level Convex data connectors.
 *
 * Each connector is self-contained and fires only on the relevant page.
 * All connectors wait for 'convex-ready' before querying.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ── Utility: wait for ConvexDB and optionally Clerk user ─────────────────── */
async function waitForConvex() {
    if (window.ConvexDB) return;
    return new Promise(resolve => window.addEventListener('convex-ready', resolve, { once: true }));
}

async function getClerkUser(timeout = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (window.Clerk && window.Clerk.user) return window.Clerk.user;
        await new Promise(r => setTimeout(r, 150));
    }
    return null;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

function moneyFromMinor(amount, currency) {
    const label = currency || 'GHS';
    return `${label} ${((Number(amount) || 0) / 100).toFixed(2)}`;
}

window.downloadTicketFile = function downloadTicketFile(ticketCode, eventTitle, ticketType, eventDate, venue) {
    const lines = [
        'AbontenTickets Ticket',
        '',
        `Event: ${eventTitle || 'Event'}`,
        `Ticket: ${ticketType || 'Ticket'}`,
        `Date: ${eventDate || 'Date TBA'}`,
        `Venue: ${venue || 'Venue TBA'}`,
        `Code: ${ticketCode}`,
        '',
        'Show this code at the gate for validation.',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticketCode || 'abontentickets-ticket'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
};

/* ─────────────────────────────────────────────────────────────────────────────
   1. HOME PAGE  (index.html)
   – Featured events grid
   – Live polls preview
   – Live event count stat
   ───────────────────────────────────────────────────────────────────────────── */
async function initHomePage() {
    if (!document.getElementById('featured-events-grid')) return;
    await waitForConvex();

    /* Featured events */
    const grid = document.getElementById('featured-events-grid');
    try {
        const events = await window.ConvexDB.getUpcomingEvents(6);
        if (events && events.length) {
            grid.innerHTML = events.map(e => window.ConvexDB.renderEventCard(e)).join('');
            if (window.TA && TA.initScrollReveal) TA.initScrollReveal();
        } else {
            grid.innerHTML = `<div style="grid-column:1/-1;padding:60px;text-align:center;background:var(--color-bg-card);border:1px solid var(--color-border);border-radius:var(--radius-xl);">
                <p style="color:var(--color-text-muted);">No upcoming events yet — check back soon.</p>
            </div>`;
        }
    } catch (e) {
        console.warn('[TA] Featured events error:', e);
        grid.innerHTML = `<div style="grid-column:1/-1;padding:60px;text-align:center;">
            <p style="color:var(--color-text-muted);">Could not load events. Please refresh.</p>
        </div>`;
    }

    /* Live stat: total events */
    const statEl = document.getElementById('stat-live-events');
    if (statEl) {
        try {
            const all = await window.ConvexDB.listEvents();
            if (all) statEl.textContent = all.length || '0';
        } catch (e) { /* keep static fallback */ }
    }

    /* Polls preview */
    const pollsGrid = document.getElementById('home-polls-grid');
    if (pollsGrid) {
        try {
            const polls = await window.ConvexDB.listPublicPolls();
            if (polls && polls.length) {
                pollsGrid.innerHTML = polls.slice(0, 3).map(p => `
                    <div style="background:var(--color-bg-card);border:1px solid var(--color-border);border-radius:var(--radius-xl);padding:var(--space-6);">
                        <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--color-secondary);margin-bottom:var(--space-2);">
                            ${p.status === 'active' ? '🟢 Active' : '✅ Ended'}
                        </div>
                        <div style="font-size:var(--text-lg);font-weight:700;color:var(--color-text-primary);margin-bottom:var(--space-3);line-height:1.3;">${escapeHtml(p.title)}</div>
                        <p style="font-size:var(--text-sm);color:var(--color-text-secondary);line-height:1.6;margin-bottom:var(--space-5);">${escapeHtml(p.description)}</p>
                        <a href="voting.html" class="btn btn--primary btn--sm" style="text-decoration:none;">
                            ${p.status === 'active' ? 'Cast Your Vote →' : 'View Results →'}
                        </a>
                    </div>
                `).join('');
            } else {
                pollsGrid.innerHTML = `<div style="grid-column:1/-1;padding:60px;text-align:center;background:var(--color-bg-card);border:1px solid var(--color-border);border-radius:var(--radius-xl);">
                    <p style="color:var(--color-text-muted);">No active polls at the moment. Check back soon!</p>
                </div>`;
            }
        } catch (e) {
            pollsGrid.innerHTML = `<div style="grid-column:1/-1;padding:60px;text-align:center;">
                <p style="color:var(--color-text-muted);">Could not load polls.</p>
            </div>`;
        }
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
   2. EVENTS DISCOVERY PAGE  (events.html)
   – Populate real events from Convex; replace DEMO_EVENTS
   ───────────────────────────────────────────────────────────────────────────── */
async function initEventsPage() {
    if (!document.getElementById('events-grid')) return;
    await waitForConvex();

    const grid = document.getElementById('events-grid');
    const countEl = document.getElementById('results-count');

    try {
        // Read URL params for pre-filtering
        const params = new URLSearchParams(window.location.search);
        const qParam = params.get('q') || '';
        const countryParam = params.get('country') || '';
        const catParam = params.get('cat') || '';
        const cityParam = params.get('city') || '';

        let events;
        if (qParam) {
            events = await window.ConvexDB.searchEvents(qParam);
        } else {
            events = await window.ConvexDB.listEvents();
        }

        if (!events || !events.length) {
            grid.innerHTML = `<div class="empty-state">
                <div class="empty-state__icon"><iconify-icon icon="ph:magnifying-glass"></iconify-icon></div>
                <div class="empty-state__title">No events found</div>
                <p class="empty-state__text">Try adjusting your filters or check back later.</p>
            </div>`;
            if (countEl) countEl.innerHTML = '<strong>0</strong> events found';
            return;
        }

        // Filter by URL params
        let filtered = events.filter(e => e.status === 'published');
        if (countryParam) {
            filtered = filtered.filter(ev => (ev.location?.country || '').toLowerCase().includes(countryParam.toLowerCase()));
        }
        if (catParam) {
            filtered = filtered.filter(ev => (ev.category || '').toLowerCase().includes(catParam.toLowerCase()));
        }
        if (cityParam) {
            filtered = filtered.filter(ev => (ev.location?.city || '').toLowerCase().includes(cityParam.toLowerCase()));
        }

        // Apply active state filter (default: available only)
        const fAvail = document.getElementById('f-avail');
        if (fAvail && fAvail.checked) {
            filtered = filtered.filter(ev => !ev.is_sold_out);
        }

        // Store globally for client-side filter/sort
        window._TA_ALL_EVENTS = filtered;

        renderConvexEvents(filtered);

        // Pre-fill search input if q param set
        const searchInput = document.getElementById('main-search');
        if (searchInput && qParam) searchInput.value = qParam;

    } catch (e) {
        console.error('[TA] Events page error:', e);
        grid.innerHTML = `<div class="empty-state">
            <div class="empty-state__icon"><iconify-icon icon="ph:warning-circle"></iconify-icon></div>
            <div class="empty-state__title">Failed to load events</div>
            <p class="empty-state__text">Please check your connection and refresh the page.</p>
        </div>`;
    }
}

function renderConvexEvents(events) {
    const grid = document.getElementById('events-grid');
    const countEl = document.getElementById('results-count');
    if (!grid) return;

    if (!events || !events.length) {
        grid.innerHTML = `<div class="empty-state">
            <div class="empty-state__icon"><iconify-icon icon="ph:magnifying-glass"></iconify-icon></div>
            <div class="empty-state__title">No events found</div>
            <p class="empty-state__text">Try adjusting your filters or explore another country.</p>
        </div>`;
        if (countEl) countEl.innerHTML = '<strong>0</strong> events found';
        return;
    }
    if (countEl) countEl.innerHTML = `<strong>${events.length}</strong> event${events.length !== 1 ? 's' : ''} found`;
    grid.innerHTML = events.map(ev => window.ConvexDB.renderEventCard(ev)).join('');
    if (window.TA && TA.initScrollReveal) TA.initScrollReveal();
}

/* Wire front-end filters to Convex dataset */
function hookEventsPageFilters() {
    if (!document.getElementById('events-grid')) return;

    function applyClientFilters() {
        if (!window._TA_ALL_EVENTS) return;
        let filtered = [...window._TA_ALL_EVENTS];

        // Search
        const q = (document.getElementById('main-search')?.value || '').trim().toLowerCase();
        if (q) {
            filtered = filtered.filter(ev =>
                (ev.title || '').toLowerCase().includes(q) ||
                (ev.location?.city || '').toLowerCase().includes(q) ||
                (ev.category || '').toLowerCase().includes(q)
            );
        }

        // Quick filter pill
        const activeQF = document.querySelector('.quick-filter.active')?.id?.replace('qf-', '') || 'all';
        if (activeQF === 'free') filtered = filtered.filter(ev => (ev.min_price || 0) === 0);
        else if (activeQF === 'concerts') filtered = filtered.filter(ev => (ev.category || '').toLowerCase().includes('concert'));
        else if (activeQF === 'sports') filtered = filtered.filter(ev => (ev.category || '').toLowerCase().includes('sport'));
        else if (activeQF === 'festivals') filtered = filtered.filter(ev => (ev.category || '').toLowerCase().includes('fest'));
        else if (activeQF === 'conferences') filtered = filtered.filter(ev => (ev.category || '').toLowerCase().includes('conf'));
        else if (activeQF === 'today') {
            const today = new Date(); today.setHours(0,0,0,0);
            const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
            filtered = filtered.filter(ev => {
                const d = new Date(ev.start_date || ev.starts_at || 0);
                return d >= today && d < tomorrow;
            });
        } else if (activeQF === 'weekend') {
            const now = new Date(); const day = now.getDay();
            const toSat = (6 - day + 7) % 7;
            const sat = new Date(now); sat.setDate(now.getDate() + toSat); sat.setHours(0,0,0,0);
            const sun = new Date(sat); sun.setDate(sat.getDate() + 1); sun.setHours(23,59,59,999);
            filtered = filtered.filter(ev => {
                const d = new Date(ev.start_date || ev.starts_at || 0);
                return d >= sat && d <= sun;
            });
        }

        // Availability
        if (document.getElementById('f-avail')?.checked) {
            filtered = filtered.filter(ev => !ev.is_sold_out);
        }
        if (document.getElementById('f-free')?.checked) {
            filtered = filtered.filter(ev => (ev.min_price || 0) === 0);
        }

        // Sort
        const sort = document.getElementById('sort-select')?.value || 'trending';
        if (sort === 'date-asc') filtered.sort((a, b) => new Date(a.start_date || 0) - new Date(b.start_date || 0));
        else if (sort === 'date-desc') filtered.sort((a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0));
        else if (sort === 'price-asc') filtered.sort((a, b) => (a.min_price || 0) - (b.min_price || 0));
        else if (sort === 'price-desc') filtered.sort((a, b) => (b.min_price || 0) - (a.min_price || 0));

        renderConvexEvents(filtered);
    }

    // Override the static filterAndRender with live version
    window.filterAndRender = applyClientFilters;

    // Hook search live
    const searchInput = document.getElementById('main-search');
    let st;
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            clearTimeout(st);
            st = setTimeout(applyClientFilters, 300);
        });
    }

    document.getElementById('sort-select')?.addEventListener('change', applyClientFilters);
    document.getElementById('apply-filters')?.addEventListener('click', function() {
        applyClientFilters();
        if (window.TA) TA.toast('Filters applied', 'success');
    });
}

/* ─────────────────────────────────────────────────────────────────────────────
   3. VOTING PAGE  (voting.html)
   – Fix the polling API calls to use db.js wrappers
   ───────────────────────────────────────────────────────────────────────────── */
async function initVotingPage() {
    if (!document.getElementById('polls-list')) return;
    await waitForConvex();
    // loadAllPolls is defined in voting.js — re-call with corrected ConvexDB
    if (typeof window.loadAllPolls === 'function') {
        window.loadAllPolls();
    }
}

/* Override voting.js's raw .query calls with db.js wrappers */
(function patchVotingJs() {
    if (!document.getElementById('polls-list')) return;

    // Patch loadAllPolls to use wrappers
    window.loadAllPolls = async function () {
        const list = document.getElementById('polls-list');
        if (!list) return;
        await waitForConvex();
        try {
            const polls = await window.ConvexDB.listPublicPolls();
            if (!polls || !polls.length) {
                list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><p class="empty-state__text">No active polls at the moment.</p></div>`;
                return;
            }
            list.innerHTML = polls.map(p => `
                <div class="poll-card">
                    <span class="poll-card__status status--${escapeAttr(p.status)}">${escapeHtml(p.status)}</span>
                    <div class="poll-card__title">${escapeHtml(p.title)}</div>
                    <div class="poll-card__desc">${escapeHtml(p.description || '')}</div>
                    <div class="poll-card__meta">
                        <span><iconify-icon icon="hugeicons:calendar-01"></iconify-icon> ${p.end_date ? 'Ends ' + new Date(p.end_date).toLocaleDateString() : ''}</span>
                    </div>
                    <button class="btn btn--primary" onclick="openVoteModal('${escapeAttr(p._id)}')">
                        ${p.status === 'active' ? 'Cast Your Vote' : 'View Results'}
                    </button>
                </div>
            `).join('');
        } catch (e) {
            console.error('[TA] Polls load error:', e);
            list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><p class="empty-state__text">Error loading polls.</p></div>`;
        }
    };

    // Patch openVoteModal to use wrapper
    window.openVoteModal = async function(pollId) {
        window._currentPollId = pollId;
        window._selectedOption = null;
        const modal = document.getElementById('vote-modal');
        const content = document.getElementById('v-modal-content');
        if (!modal || !content) return;
        modal.classList.add('active');
        content.innerHTML = `<div style="text-align:center;padding:40px;"><iconify-icon icon="hugeicons:loading-03" style="font-size:32px;"></iconify-icon></div>`;
        await waitForConvex();
        try {
            const poll = await window.ConvexDB.getPollDetails(pollId);
            if (typeof window.renderPollDetails === 'function') window.renderPollDetails(poll);
        } catch (e) {
            content.innerHTML = `<p style="color:var(--color-error);">Error loading poll details.</p>`;
        }
    };

    // Patch handleCastVote to use wrapper
    window.handleCastVote = async function () {
        await waitForConvex();
        const clerkUser = await getClerkUser(2000);
        if (!clerkUser) {
            if (window.TA) TA.toast('Please sign in to vote', 'warning');
            else alert('Please sign in to vote.');
            return;
        }
        const btn = document.getElementById('cast-vote-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Voting…'; }
        try {
            const userRecord = await window.ConvexDB.upsertUser({
                clerk_id: clerkUser.id,
                email: clerkUser.primaryEmailAddress?.emailAddress || '',
                first_name: clerkUser.firstName || '',
                last_name: clerkUser.lastName || '',
            });
            await window.ConvexDB.castVote({
                poll_id: window._currentPollId,
                option_id: window._selectedOption,
                user_id: userRecord._id,
            });
            const poll = await window.ConvexDB.getPollDetails(window._currentPollId);
            if (typeof window.renderPollDetails === 'function') window.renderPollDetails({ ...poll, status: 'completed' });
            if (window.TA) TA.toast('Your vote has been counted! 🎉', 'success');
        } catch (e) {
            if (window.TA) TA.toast(e.message || 'Failed to cast vote', 'error');
            else alert(e.message || 'Failed to cast vote');
            if (btn) { btn.disabled = false; btn.textContent = 'Cast Vote'; }
        }
    };
})();

/* ─────────────────────────────────────────────────────────────────────────────
   4. ACCOUNT / TICKET WALLET PAGE  (account.html)
   – Load user's tickets and purchase history from Convex
   ───────────────────────────────────────────────────────────────────────────── */
async function initAccountPage() {
    if (!document.getElementById('wallet-grid')) return;
    await waitForConvex();

    // Wait for Clerk to be ready (it's loaded asynchronously on account.html)
    const clerkUser = await getClerkUser(5000);
    if (!clerkUser) {
        // Redirect handled by Clerk inline script — don't double redirect
        return;
    }

    const email = clerkUser.primaryEmailAddress?.emailAddress || '';
    if (!email) return;

    // Upsert user into Convex to keep records consistent
    try {
        await window.ConvexDB.upsertUser({
            clerk_id: clerkUser.id,
            email,
            first_name: clerkUser.firstName || '',
            last_name: clerkUser.lastName || '',
            role: 'buyer',
        });
    } catch (e) {
        console.warn('[TA] upsertUser error on account:', e);
    }

    await loadWallet(email);
    await loadPurchaseHistory(email);
}

async function loadWallet(email) {
    const walletGrid = document.getElementById('wallet-grid');
    const walletEmpty = document.getElementById('wallet-empty');
    if (!walletGrid) return;

    try {
        const orders = await window.ConvexDB.listOrdersByBuyer(email);
        const ticketCards = (orders || [])
            .filter(order => order.status === 'paid')
            .flatMap(order => (order.tickets || []).map(ticket => ({ order, ticket })));

        if (!ticketCards.length) {
            walletGrid.style.display = 'none';
            if (walletEmpty) walletEmpty.style.display = 'block';
            return;
        }

        if (walletEmpty) walletEmpty.style.display = 'none';
        walletGrid.style.display = '';

        walletGrid.innerHTML = ticketCards.map(({ order, ticket }) => {
            const d = new Date(ticket.purchased_at || order._creationTime || Date.now());
            const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
            const isUsed = ticket.status === 'scanned' || ticket.status === 'used';
            const isUpcoming = ticket.status === 'valid' || order.status === 'paid' || order.status === 'confirmed' || order.status === 'completed';
            const statusBadge = isUsed
                ? `<span class="badge" style="background:rgba(107,114,128,0.2);color:#9CA3AF;">Used</span>`
                : isUpcoming
                    ? `<span class="badge badge--success">Valid</span>`
                    : `<span class="badge badge--primary">${escapeHtml(ticket.status || order.status || 'Active')}</span>`;
            const ticketNumber = ticket.ticket_number || `ABT-${String(order._id).slice(-8).toUpperCase()}`;
            const scanCode = ticket.scan_token || ticket.qr_code || ticketNumber;
            const eventDate = order.event_date ? new Date(order.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : dateStr;
            const eventTitle = escapeHtml(order.event_title || order.event_id || 'Event');
            const eventVenue = escapeHtml([order.event_venue, order.event_city].filter(Boolean).join(', ') || 'Venue TBA');
            const ticketType = escapeHtml(ticket.tier_name || 'Ticket');
            const safeNumber = escapeHtml(ticketNumber);
            const safeScanCode = escapeAttr(scanCode);
            const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(scanCode)}`;
            const downloadTitle = escapeAttr(order.event_title || 'Event');
            const downloadVenue = escapeAttr([order.event_venue, order.event_city].filter(Boolean).join(', ') || 'Venue TBA');

            return `
            <div class="ticket-card ${isUsed ? 'ticket-card--used' : 'ticket-card--upcoming'}" data-ticket-code="${safeScanCode}">
                <div class="ticket-card__top">
                    ${statusBadge && `<div class="ticket-card__status-badge">${statusBadge}</div>`}
                    <div class="ticket-card__event-name">${eventTitle}</div>
                    <div class="ticket-card__venue">${eventVenue} - ${eventDate}</div>
                </div>
                <div class="ticket-card__divider">
                    <div class="ticket-card__divider-dots">
                        <div class="ticket-card__divider-dot"></div>
                        <div class="ticket-card__divider-dot"></div>
                        <div class="ticket-card__divider-dot"></div>
                    </div>
                </div>
                <div class="ticket-card__bottom">
                    <div class="ticket-info-row"><span>Ticket No.</span><span style="font-family:var(--font-mono);font-size:var(--text-xs);">${safeNumber}</span></div>
                    <div class="ticket-info-row"><span>Ticket Type</span><span>${ticketType}</span></div>
                    <div class="ticket-info-row"><span>Order Ref</span><span style="font-family:var(--font-mono);font-size:var(--text-xs);">ABT-${String(order._id).slice(-8).toUpperCase()}</span></div>
                    <div class="ticket-info-row"><span>Total Paid</span><span>${moneyFromMinor(order.total_amount || 0, order.currency || 'GHS')}</span></div>
                </div>
                <div class="ticket-card__qr">
                    <div class="ticket-qr-box" title="${safeNumber}" style="font-size:12px;line-height:1.35;text-align:center;font-family:var(--font-mono);word-break:break-all;">
                        <img src="${qrSrc}" alt="Ticket QR code" width="132" height="132" style="display:block;margin:0 auto 8px;border-radius:8px;background:#fff;padding:6px;">
                        <span style="display:block;margin-top:4px;">${safeNumber}</span>
                    </div>
                </div>
                <div class="ticket-card__actions">
                    <button class="btn btn--secondary btn--sm ticket-copy-btn" style="flex:1;" data-code="${safeNumber}">Copy No.</button>
                    <button class="btn btn--secondary btn--sm ticket-download-btn" style="flex:1;" data-code="${escapeAttr(ticketNumber)}" data-title="${downloadTitle}" data-type="${escapeAttr(ticket.tier_name || 'Ticket')}" data-date="${escapeAttr(eventDate)}" data-venue="${downloadVenue}">Download</button>
                    <button class="btn btn--ghost btn--sm" style="flex:1;" onclick="window.print()">Print</button>
                </div>
            </div>`;
        }).join('');

        walletGrid.querySelectorAll('.ticket-copy-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const code = this.dataset.code || '';
                if (navigator.clipboard) navigator.clipboard.writeText(code);
                if (window.TA) TA.toast('Ticket code copied', 'success');
            });
        });

        walletGrid.querySelectorAll('.ticket-download-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                window.downloadTicketFile(this.dataset.code, this.dataset.title, this.dataset.type, this.dataset.date, this.dataset.venue);
            });
        });

        const transferSelect = document.getElementById('transfer-ticket-select');
        if (transferSelect) {
            transferSelect.innerHTML = ticketCards.map(({ order, ticket }) =>
                `<option value="${escapeAttr(ticket._id)}">${escapeHtml(ticket.tier_name || 'Ticket')} - ${escapeHtml(order.event_title || 'Event')} (${escapeHtml(ticket.ticket_number || ticket.qr_code || 'pending code')})</option>`
            ).join('') || '<option value="">No tickets available</option>';
        }

        const supportSelect = document.getElementById('support-event-select');
        if (supportSelect) {
            const base = '<option value="">None - General enquiry</option>';
            supportSelect.innerHTML = base + (orders || []).map(o =>
                `<option value="${escapeAttr(o._id)}">${escapeHtml(o.event_title || 'Event')} (ABT-${escapeHtml(String(o._id).slice(-8).toUpperCase())})</option>`
            ).join('');
        }

    } catch (e) {
        console.warn('[TA] Wallet load error:', e);
        if (walletEmpty) walletEmpty.style.display = 'block';
        walletGrid.style.display = 'none';
    }
}
async function loadPurchaseHistory(email) {
    const historyPanel = document.getElementById('history-panel');
    const historyEmpty = document.getElementById('history-empty');
    if (!historyPanel) return;

    try {
        const orders = await window.ConvexDB.listOrdersByBuyer(email);
        if (!orders || !orders.length) return; // keep empty state

        if (historyEmpty) historyEmpty.style.display = 'none';

        const rows = orders.map(order => {
            const d = new Date(order._creationTime || Date.now());
            const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const amount = moneyFromMinor(order.total_amount || 0, order.currency || 'GHS');
            const statusColor = (order.status === 'confirmed' || order.status === 'paid') ? 'var(--color-success)' :
                                order.status === 'pending' ? 'var(--color-warning)' : 'var(--color-text-muted)';
            return `
                <div class="order-row">
                    <div class="order-row__img"><iconify-icon icon="hugeicons:ticket-01"></iconify-icon></div>
                    <div style="flex:1;min-width:0;">
                        <div class="order-row__name">${escapeHtml(order.event_title || 'Event Ticket')}</div>
                        <div class="order-row__meta">${escapeHtml(dateStr)} - ${escapeHtml((order.items || []).map(i => `${i.tier_name || 'Ticket'} x${i.quantity || 1}`).join(', ') || '1 ticket')}</div>
                    </div>
                    <div>
                        <div class="order-row__amount">${amount}</div>
                        <div class="order-row__ref" style="color:${statusColor};">${escapeHtml((order.status || 'confirmed').charAt(0).toUpperCase() + (order.status||'confirmed').slice(1))}</div>
                    </div>
                </div>`;
        }).join('');

        // Insert rows before empty state div
        historyPanel.insertAdjacentHTML('afterbegin', rows);

        // Wire export CSV button
        const exportBtn = document.getElementById('download-history-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', function() {
                const csv = ['Date,Event,Tickets,Total,Status',
                    ...orders.map(o => {
                        const d = new Date(o._creationTime || 0).toLocaleDateString();
                        const tickets = (o.items||[]).map(i=>`${i.tier_name}x${i.quantity}`).join('+');
                        const amt = moneyFromMinor(o.total_amount || 0, o.currency || 'GHS');
                        return `"${d}","${o.event_title || ''}","${tickets}","${amt}","${o.status || ''}"`;
                    })
                ].join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'abontentickets-history.csv';
                a.click(); URL.revokeObjectURL(url);
            });
        }
    } catch (e) {
        console.warn('[TA] Purchase history error:', e);
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
   5. SCANNER PAGE  (scanner.html)
   – Wire manual lookup to checkInTicket Convex mutation
   ───────────────────────────────────────────────────────────────────────────── */
async function initScannerPage() {
    if (!document.getElementById('lookup-btn')) return;
    await waitForConvex();

    // Get event_id from URL param for context
    const params = new URLSearchParams(window.location.search);
    const eventIdParam = params.get('event_id') || params.get('event') || '';
    const gateParam = params.get('gate') || 'Gate A';
    let html5QrCode = null;
    let cameraRunning = false;
    let lastScannedCode = '';
    let lastScannedAt = 0;

    // Override the lookup button to use Convex
    const lookupBtn = document.getElementById('lookup-btn');
    const lookupInput = document.getElementById('lookup-input');

    async function handleTicketCode(rawCode, source = 'manual') {
        const code = String(rawCode || '').trim();
        if (!code) return;

        if (lookupBtn) {
            lookupBtn.disabled = true;
            lookupBtn.textContent = 'Checking...';
        }

        if (!eventIdParam) {
            if (lookupBtn) {
                lookupBtn.disabled = false;
                lookupBtn.textContent = 'Look Up';
            }
            if (window.TA) TA.toast('Open scanner from an event dashboard to check in tickets.', 'warning');
            return;
        }

        try {
            const result = await window.ConvexDB.checkInTicket({
                qr_code: code,
                event_id: eventIdParam,
                gate: gateParam,
                source: source,
            });

            const status = result.status === 'valid' ? 'valid' : result.status === 'used' ? 'used' : 'invalid';
            const name = result.owner_name || 'Unknown Attendee';
            const ticketType = result.tier_name || 'General';

            if (typeof window.showResult === 'function') {
                window.showResult(status, name, ticketType, {
                    ticketNumber: result.ticket_number || code,
                    eventTitle: result.event_title || '',
                    scannedAt: result.scanned_at || '',
                });
                if (window.counts) {
                    if (status === 'valid') window.counts.valid++;
                    else window.counts.invalid++;
                    if (typeof window.updateStats === 'function') window.updateStats();
                }
            }

            if (window.TA) {
                const msg = status === 'valid' ? `Valid ticket - ${name}` :
                            status === 'used' ? `Already used - ${name}` : 'Invalid ticket code';
                TA.toast(msg, status === 'valid' ? 'success' : status === 'used' ? 'warning' : 'error');
            }

        } catch (e) {
            console.warn('[TA] Scanner checkIn error:', e);
            if (typeof window.showResult === 'function') window.showResult('invalid', 'Unknown Attendee', 'Unknown Ticket');
            if (window.TA) TA.toast('Could not verify this ticket. Check your connection and try again.', 'error');
        } finally {
            if (lookupBtn) {
                lookupBtn.disabled = false;
                lookupBtn.textContent = 'Look Up';
            }
            if (lookupInput) lookupInput.value = '';
        }
    }

    function getScannerErrorMessage(error) {
        const message = typeof error === 'string'
            ? error
            : error?.message || 'Could not start camera.';
        if (/notallowed|permission|denied/i.test(message)) {
            return 'Camera permission was blocked. Allow camera access, or use manual lookup.';
        }
        if (/notfound|no camera|devices? not found/i.test(message)) {
            return 'No camera was found on this device. Use manual lookup for check-in.';
        }
        if (/secure|https|localhost/i.test(message)) {
            return 'Camera access requires HTTPS or localhost.';
        }
        return message || 'Could not start camera. Use manual lookup or check browser permissions.';
    }

    async function startCameraScanner() {
        const reader = document.getElementById('qr-reader');
        const feed = document.getElementById('camera-feed');
        if (!reader || !feed) return;
        if (!eventIdParam) {
            if (window.TA) TA.toast('Open scanner from an event dashboard before starting the camera.', 'warning');
            return;
        }
        const Html5QrcodeClass = window.Html5Qrcode || window.__Html5QrcodeLibrary__?.Html5Qrcode || null;
        if (!Html5QrcodeClass) {
            if (window.TA) TA.toast('Camera scanner library is still loading. Try again in a moment.', 'info');
            return;
        }
        if (cameraRunning) {
            await html5QrCode.stop().catch(() => {});
            reader.style.display = 'none';
            cameraRunning = false;
            if (window.TA) TA.toast('Camera scanner paused', 'info');
            return;
        }

        html5QrCode = html5QrCode || new Html5QrcodeClass('qr-reader');
        reader.style.display = 'block';
        const intro = feed.querySelector(':scope > div:not(#qr-reader):not(.scan-frame):not(.scan-line)');
        if (intro) intro.style.display = 'none';

        try {
            await html5QrCode.start(
                { facingMode: 'environment' },
                { fps: 8, qrbox: { width: 240, height: 240 } },
                async (decodedText) => {
                    const now = Date.now();
                    if (decodedText === lastScannedCode && now - lastScannedAt < 4000) return;
                    lastScannedCode = decodedText;
                    lastScannedAt = now;
                    await handleTicketCode(decodedText, 'camera');
                }
            );
            cameraRunning = true;
            if (window.TA) TA.toast('Camera scanner active', 'success');
        } catch (e) {
            console.warn('[TA] Camera scanner error:', e);
            reader.style.display = 'none';
            const intro = feed.querySelector(':scope > div:not(#qr-reader):not(.scan-frame):not(.scan-line)');
            if (intro) intro.style.display = '';
            if (window.TA) TA.toast(getScannerErrorMessage(e), 'error');
        }
    }

    window.AbontenTicketsScanner = {
        handleCode: handleTicketCode,
        startCamera: startCameraScanner,
    };

    if (lookupBtn && lookupInput) {
        lookupBtn.addEventListener('click', function() {
            handleTicketCode(lookupInput.value);
        }, { once: false });
    }

    // Show event name if provided in URL
    if (eventIdParam) {
        try {
            const ev = await window.ConvexDB.getEventById(eventIdParam);
            const nameEl = document.getElementById('scanner-event-name');
            if (ev && nameEl) nameEl.textContent = ev.title;
        } catch (e) { /* keep static name */ }
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
   6. VERIFY PAGE  (verify.html)
   – Wire ticket code lookup to Convex
   ───────────────────────────────────────────────────────────────────────────── */
async function initVerifyPage() {
    const verifyBtn = document.getElementById('verify-ticket-btn') || document.getElementById('verify-btn');
    if (!verifyBtn || !document.getElementById('verify-input')) return;
    await waitForConvex();

    verifyBtn.addEventListener('click', async function() {
        const code = document.getElementById('verify-input')?.value?.trim();
        if (!code) {
            if (window.TA) TA.toast('Please enter a ticket code', 'warning');
            return;
        }

        this.disabled = true;
        const originalText = this.textContent;
        this.textContent = 'Verifying…';

        try {
            const result = await window.ConvexDB.verifyTicket(code);
            const resultContainer = document.getElementById('verify-result');
            if (resultContainer) {
                resultContainer.style.display = 'block';
                resultContainer.innerHTML = result.valid
                    ? `<div style="text-align:center;padding:var(--space-6);background:rgba(21,128,61,0.10);border:1px solid rgba(21,128,61,0.30);border-radius:var(--radius-xl);">
                        <iconify-icon icon="ph:check-circle-fill" style="font-size:48px;color:var(--color-success);"></iconify-icon>
                        <h3 style="color:var(--color-success);margin-top:var(--space-3);">Authentic Ticket ✓</h3>
                        <p style="color:var(--color-text-secondary);margin-top:var(--space-2);">Holder: <strong>${escapeHtml(result.attendee_name || 'Valid Holder')}</strong></p>
                        <p style="color:var(--color-text-secondary);">Type: <strong>${escapeHtml(result.ticket_type || 'General')}</strong></p>
                    </div>`
                    : `<div style="text-align:center;padding:var(--space-6);background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:var(--radius-xl);">
                        <iconify-icon icon="ph:x-circle-fill" style="font-size:48px;color:var(--color-error);"></iconify-icon>
                        <h3 style="color:var(--color-error);margin-top:var(--space-3);">Invalid Ticket ✗</h3>
                        <p style="color:var(--color-text-secondary);margin-top:var(--space-2);">${escapeHtml(result.message || 'This ticket code could not be verified.')}</p>
                    </div>`;
            } else {
                if (window.TA) {
                    TA.toast(result.valid ? `✓ Valid ticket - ${result.attendee_name || ''}` : '✗ Invalid ticket code', result.valid ? 'success' : 'error');
                }
            }
        } catch (e) {
            if (window.TA) TA.toast('Could not verify ticket — please try again', 'error');
        }

        this.disabled = false;
        this.textContent = originalText;
    });
}

/* ─────────────────────────────────────────────────────────────────────────────
   7. EVENT DETAIL PAGE  (event-detail.html)
   – Load live event by slug or ?id param from Convex
   ───────────────────────────────────────────────────────────────────────────── */
async function initEventDetailPage() {
    if (!document.getElementById('event-cover')) return;
    await waitForConvex();

    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');
    const id   = params.get('id');
    if (!slug && !id) return; // no param — static demo page

    try {
        let event = null;
        if (slug) {
            event = await window.ConvexDB.getEventBySlug(slug);
        } else {
            // Fallback: fetch all and find by _id
            const all = await window.ConvexDB.listEvents();
            event = (all || []).find(e => e._id === id);
        }
        if (!event) return;

        // Update <title> and meta-description
        document.title = `${event.title} — AbontenTickets`;
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute('content', event.description || event.title);

        // Breadcrumb
        const bcEl = document.getElementById('bc-events');
        if (bcEl) bcEl.textContent = 'Events';

        // Cover image / icon
        const coverEl = document.getElementById('event-cover');
        if (coverEl && event.cover_image) {
            const coverUrl = String(event.cover_image || '').trim();
            if (/^(https?:\/\/|data:image\/)/i.test(coverUrl)) {
                coverEl.style.backgroundImage = `url("${coverUrl.replace(/["\\]/g, '')}")`;
            }
            coverEl.style.backgroundSize = 'cover';
            coverEl.style.backgroundPosition = 'center';
        }

        const location = event.location || {};
        const venue = location.venue_name || 'Venue TBA';
        const city = location.city || '';
        const country = location.country || '';
        const fullPlace = [venue, city, country].filter(Boolean).join(', ');
        const startsAt = new Date(event.start_date || Date.now());
        const shortDate = startsAt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) +
            ', ' + startsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const longDate = startsAt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        const crumbCurrent = document.querySelector('[id="bc-events"] + iconify-icon + span');
        if (crumbCurrent) crumbCurrent.textContent = event.title;

        const coverTitle = document.querySelector('.event-cover__title');
        if (coverTitle) coverTitle.textContent = event.title;

        const coverDetails = document.querySelectorAll('.event-cover__info [style*="rgba(255,255,255,0.75)"]');
        if (coverDetails[0]) coverDetails[0].lastChild.textContent = shortDate;
        if (coverDetails[1]) coverDetails[1].lastChild.textContent = fullPlace;

        const badges = document.querySelectorAll('.event-cover__info .badge');
        if (badges[0]) badges[0].textContent = event.category || 'Event';
        if (badges[1]) badges[1].textContent = event.status === 'published' ? 'Live' : event.status;

        const metaItems = document.querySelectorAll('.event-meta-item');
        if (metaItems[0]) {
            const values = metaItems[0].querySelectorAll('.event-meta-item__value, [style*="font-size:var(--text-xs)"]');
            if (values[0]) values[0].textContent = longDate;
            if (values[1]) values[1].textContent = startsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        if (metaItems[1]) {
            const values = metaItems[1].querySelectorAll('.event-meta-item__value, [style*="font-size:var(--text-xs)"]');
            if (values[0]) values[0].textContent = venue;
            if (values[1]) values[1].textContent = [city, country].filter(Boolean).join(', ');
        }
        if (metaItems[2]) {
            const values = metaItems[2].querySelectorAll('.event-meta-item__value, [style*="font-size:var(--text-xs)"]');
            if (values[0]) values[0].textContent = 'Live inventory';
            if (values[1]) values[1].textContent = 'Availability updates from ticket tiers';
        }
        if (metaItems[3]) {
            const values = metaItems[3].querySelectorAll('.event-meta-item__value, [style*="font-size:var(--text-xs)"]');
            if (values[0]) values[0].textContent = event.category || 'Event';
            if (values[1]) values[1].textContent = event.status === 'published' ? 'Tickets available now' : `Status: ${event.status}`;
        }

        const aboutTitle = Array.from(document.querySelectorAll('.detail-section__title')).find(el => el.textContent.trim() === 'About This Event');
        const aboutBody = aboutTitle?.nextElementSibling;
        if (aboutBody) {
            aboutBody.innerHTML = `<p style="margin-bottom:var(--space-4);">${escapeHtml(event.description || 'Event details will be announced soon.')}</p>`;
        }

        const venueMap = document.getElementById('venue-map');
        if (venueMap) {
            const mapLabel = venueMap.querySelector('span');
            if (mapLabel) mapLabel.textContent = `${fullPlace || venue} - Open in Maps`;
        }

        // Ticket tiers from Convex
        if (id || event._id) {
            const tiers = await window.ConvexDB.getTicketTiers(event._id);
            const tiersContainer = document.querySelector('.ticket-tiers');
            if (tiersContainer && tiers && tiers.length) {
                const firstAvailableIndex = tiers.findIndex(tier => (tier.sold || 0) < (tier.capacity || 999));
                tiersContainer.innerHTML = `<div class="detail-section__title" style="margin-bottom:var(--space-4);">Select Ticket Type</div>` + tiers.map((tier, index) => {
                    const sold = tier.sold || 0;
                    const cap  = tier.capacity || 999;
                    const isSoldOut = sold >= cap;
                    const priceGhc = (tier.price / 100).toFixed(2);
                    const currency = event.currency || 'GHS';
                    return `
                    <div class="ticket-tier ${isSoldOut ? 'sold-out' : ''} ${index === firstAvailableIndex ? 'selected' : ''}" id="tier-${tier._id}"
                         data-price="${tier.price / 100}" data-name="${escapeAttr(tier.name)}" data-tier-id="${escapeAttr(tier._id)}" data-currency="${escapeAttr(currency)}">
                        <div class="ticket-tier__info">
                            <div class="ticket-tier__name">${escapeHtml(tier.name)}</div>
                            <div class="ticket-tier__desc">${escapeHtml(tier.description || '')}</div>
                        </div>
                        <div class="ticket-tier__price">${escapeHtml(currency)} ${priceGhc}</div>
                        ${isSoldOut ? '<div class="sold-out-badge">Sold Out</div>' : `<div class="ticket-tier__avail" style="font-size:11px;color:var(--color-text-muted);">${cap - sold} remaining</div>`}
                    </div>`;
                }).join('');

                // Re-attach tier click handlers
                document.querySelectorAll('.ticket-tier:not(.sold-out)').forEach(t => {
                    t.addEventListener('click', function() {
                        document.querySelectorAll('.ticket-tier').forEach(x => x.classList.remove('selected'));
                        this.classList.add('selected');
                    });
                });
            }
        }

        // Wire "Buy Now" with live event data
        const buyBtn = document.getElementById('buy-now-btn');
        if (buyBtn && event._id) {
            buyBtn.addEventListener('click', function(e) {
                e.preventDefault();
                const selectedTier = document.querySelector('.ticket-tier.selected');
                if (!selectedTier) {
                    if (window.TA) TA.toast('Please select a ticket type', 'warning');
                    return;
                }
                const qty   = parseInt(document.getElementById('qty-display')?.textContent) || 1;
                const price = parseFloat(selectedTier.dataset.price) || 0;
                const currency = (selectedTier.dataset.currency || event.currency || 'GHS').toUpperCase();
                const subtotalMinor = Math.round(price * 100) * qty;
                const serviceFeeMinor = Math.round(subtotalMinor * 0.05);
                const processingFeeMinor = Math.round(subtotalMinor * 0.035);
                const totalMinor = subtotalMinor + serviceFeeMinor + processingFeeMinor + 100;
                const url = `checkout.html?event=${event._id}&tier=${selectedTier.dataset.tierId || ''}&tier_name=${encodeURIComponent(selectedTier.dataset.name)}&qty=${qty}&price=${price}&total=${(totalMinor / 100).toFixed(2)}&currency=${encodeURIComponent(currency)}`;
                window.location.href = url;
            }, { once: true });
        }

    } catch (e) {
        console.warn('[TA] Event detail load error:', e);
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
   ROUTER — detect current page and initialise correct connector
   ───────────────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
    const path = window.location.pathname.replace(/\\/g, '/').split('/').pop() || 'index.html';

    if (path === '' || path === 'index.html') {
        // The shared layout hydrates homepage counts, featured events, and polls from a single Convex pass.
        return;
    } else if (path === 'events.html') {
        initEventsPage();
        hookEventsPageFilters();
    } else if (path === 'voting.html') {
        // voting.js loads first; our patch overrides its functions in patchVotingJs IIFE above
        // initVotingPage just re-triggers loading once ConvexDB is ready
        window.addEventListener('convex-ready', function() {
            if (typeof window.loadAllPolls === 'function') window.loadAllPolls();
        }, { once: true });
        if (window.ConvexDB && typeof window.loadAllPolls === 'function') window.loadAllPolls();
    } else if (path === 'account.html') {
        initAccountPage();
    } else if (path === 'scanner.html') {
        initScannerPage();
    } else if (path === 'ticket-authenticity.html' || path === 'verify.html') {
        initVerifyPage();
    } else if (path === 'event-detail.html') {
        initEventDetailPage();
    }
    // checkout.html is self-contained with inline Convex calls
});
