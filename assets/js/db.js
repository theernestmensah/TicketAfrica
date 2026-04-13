/**
 * @file db.js
 * @description Ticket Africa — Convex Backend Layer.
 *
 * This file has been updated to fully ditch Supabase and connect directly
 * to Convex using ConvexHttpClient from npm/esm cache.
 */

import { ConvexHttpClient } from "https://esm.sh/convex@1.32.0/browser";

// ─── Inject Clerk CDN script (once, idempotent) ────────────────────────────
(function injectClerk() {
    if (document.getElementById('clerk-sdk')) return;
    const s = document.createElement('script');
    s.id = 'clerk-sdk';
    s.async = true;
    s.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
    s.setAttribute('data-clerk-publishable-key', 'pk_test_ZGl2aW5lLWZyb2ctMjUuY2xlcmsuYWNjb3VudHMuZGV2JA');
    document.head.appendChild(s);
})();

// ─── Convex Config ────────────────────────────────────────────────────────
const CONVEX_URL = 'https://gallant-greyhound-48.convex.cloud';
const convex = new ConvexHttpClient(CONVEX_URL);

// ─── Event card renderer (kept API-compatible) ─────────────────────────────
function renderEventCard(event) {
    const d = new Date(event.start_date || event.starts_at || Date.now());
    const dateStr =
        d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) +
        ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    let icon = 'hugeicons:music-note-01';
    let bg   = 'linear-gradient(135deg,#1a0540,#3d0f80)';
    const cat = (event.category || '').toLowerCase();
    if (cat.includes('sport'))  { icon = 'hugeicons:football';    bg = 'linear-gradient(135deg,#0a1a30,#0d3060)'; }
    else if (cat.includes('fest'))  { icon = 'hugeicons:tent-01';     bg = 'linear-gradient(135deg,#1a0a20,#3d1060)'; }
    else if (cat.includes('conf'))  { icon = 'hugeicons:briefcase-01'; bg = 'linear-gradient(135deg,#0d1f0d,#1a4020)'; }

    const venueName = event.location?.venue_name || event.venue?.name || '';
    const city      = event.location?.city || event.city || '';
    const minPrice  = event.min_price ?? 0;
    const priceStr  = minPrice > 0 ? `${event.currency || 'GH₵'} ${minPrice}` : 'Free';

    // Using transparent color to support light/dark modes
    const themeBg = 'var(--color-bg-card)';
    const themeShadow = 'box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)';

    return `
    <a href="event-detail.html?slug=${event.slug}" class="event-card" data-reveal style="background:${themeBg}; border-radius: var(--radius-lg); overflow:hidden; border: 1px solid var(--color-border); display:flex; flex-direction:column; text-decoration:none; ${themeShadow}">
      <div class="event-card__image" style="position:relative; width:100%; height:160px;">
        ${event.cover_image 
            ? \`<img src="\${event.cover_image}" alt="\${event.title}" style="width:100%; height:100%; object-fit:cover;" />\`
            : \`<div class="event-card__image-placeholder" style="background:\${bg}; width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
                <iconify-icon icon="\${icon}" style="font-size:3em; color:rgba(255,255,255,0.8);"></iconify-icon>
              </div>\`
        }
        <div class="event-card__badges" style="position:absolute; top:8px; left:8px; display:flex; gap:4px;">
          ${event.status === 'published' ? '<span class="badge badge--success" style="background:rgba(46, 204, 113, 0.9); color:white; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:bold;">Live</span>' : ''}
        </div>
      </div>
      <div class="event-card__body" style="padding:16px; display:flex; flex-direction:column; flex:1;">
        <div class="event-card__category" style="font-size:12px; font-weight:700; color:var(--color-secondary); text-transform:uppercase; margin-bottom:8px;">${event.category}</div>
        <div class="event-card__title" style="font-family:var(--font-display); font-size:16px; font-weight:700; color:var(--color-text-primary); margin-bottom:12px; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${event.title}</div>
        <div class="event-card__details" style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px; flex:1;">
          <div style="font-size:13px; color:var(--color-text-muted); display:flex; align-items:center; gap:6px;">
            <iconify-icon icon="hugeicons:calendar-01"></iconify-icon> ${dateStr}
          </div>
          <div style="font-size:13px; color:var(--color-text-muted); display:flex; align-items:center; gap:6px;">
            <iconify-icon icon="hugeicons:location-01"></iconify-icon> ${venueName ? venueName + ', ' : ''}${city}
          </div>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; padding-top:16px; border-top:1px solid var(--color-border); margin-top:auto;">
          <div>
            <div style="font-size:11px; color:var(--color-text-muted);">From</div>
            <div style="font-family:var(--font-display); font-size:18px; font-weight:700; color:var(--color-text-primary);">${priceStr}</div>
          </div>
          <div style="font-size:12px; font-weight:600; color:var(--color-success);">✓ Available</div>
        </div>
      </div>
    </a>`;
}

// ─── window.ConvexDB ────────────────────────────────────────────────────────
window.ConvexDB = {
    client: convex,

    // Generic wrappers for dynamic requests (used by voting.js etc.)
    query: async (name, args = {}) => {
        if (window.Clerk?.session) {
            const token = await window.Clerk.session.getToken();
            convex.setAuth(token);
        } else {
            convex.clearAuth();
        }
        return convex.query(name, args);
    },
    mutation: async (name, args = {}) => {
        if (window.Clerk?.session) {
            const token = await window.Clerk.session.getToken();
            convex.setAuth(token);
        } else {
            convex.clearAuth();
        }
        return convex.mutation(name, args);
    },

    // ── Events ──
    listEvents: () => window.ConvexDB.query("events:listEvents"),
    listEventsByOrg: (org_id) => window.ConvexDB.query("events:listEventsByOrg", { org_id }),
    getUpcomingEvents: (limit = 10) => window.ConvexDB.query("events:getUpcomingEvents", { limit }),
    getEventBySlug: (slug) => window.ConvexDB.query("events:getEventBySlug", { slug }),
    getTicketTiers: (event_id) => window.ConvexDB.query("events:getTicketTiers", { event_id }),
    searchEvents: (query) => window.ConvexDB.query("events:searchEvents", { query }),

    // ── Profiles/Users ──
    upsertUser: (args) => window.ConvexDB.mutation("users:upsertUser", args),
    getByClerkId: (clerk_id) => window.ConvexDB.query("users:getByClerkId", { clerk_id }),

    // ── Organizers ──
    getOrgByOwner: (owner_id) => window.ConvexDB.query("users:getOrgByOwner", { owner_id }),
    getOrCreateOrg: (args) => window.ConvexDB.mutation("users:getOrCreateOrg", args),

    // ── Promo Codes ──
    validatePromoCode: (code, org_id) => window.ConvexDB.query("users:validatePromoCode", { code, org_id }),
    redeemPromoCode: (code) => window.ConvexDB.mutation("users:redeemPromoCode", { code }),

    // ── Event Mutations ──
    createEvent: (args) => window.ConvexDB.mutation("events:createEvent", args),
    updateEvent: (args) => window.ConvexDB.mutation("events:updateEvent", args),
    publishEvent: (event_id) => window.ConvexDB.mutation("events:publishEvent", { event_id }),
    cancelEvent: (event_id) => window.ConvexDB.mutation("events:cancelEvent", { event_id }),
    deleteEvent: (event_id) => window.ConvexDB.mutation("events:deleteEvent", { event_id }),

    // ── Ticket Tiers ──
    addTicketTier: (args) => window.ConvexDB.mutation("events:addTicketTier", args),
    removeTicketTier: (tier_id) => window.ConvexDB.mutation("events:removeTicketTier", { tier_id }),

    // ── Orders & Payments ──
    listOrdersByOrg: (org_id) => window.ConvexDB.query("organizer:listOrdersByOrg", { org_id }),
    listOrdersByEvent: (event_id) => window.ConvexDB.query("organizer:listOrdersByEvent", { event_id }),
    createOrder: (args) => window.ConvexDB.mutation("organizer:createOrder", args),
    createCheckout: (args) => window.ConvexDB.mutation("payments:createCheckout", args),
    completeOrder: (args) => window.ConvexDB.mutation("payments:completeOrder", args), // note order_id

    // ── Organizer: Promos ──
    listPromosByOrg: (org_id) => window.ConvexDB.query("organizer:listPromosByOrg", { org_id }),
    createPromoCode: (args) => window.ConvexDB.mutation("organizer:createPromoCode", args),
    deactivatePromoCode: (promo_id) => window.ConvexDB.mutation("organizer:deactivatePromoCode", { promo_id }),
    deletePromoCode: (promo_id) => window.ConvexDB.mutation("organizer:deletePromoCode", { promo_id }),

    // ── Staff ──
    listStaffByOrg: (org_id) => window.ConvexDB.query("organizer:listStaffByOrg", { org_id }),
    inviteStaff: (args) => window.ConvexDB.mutation("organizer:inviteStaff", args),
    revokeStaff: (staff_id) => window.ConvexDB.mutation("organizer:revokeStaff", { staff_id }),
    removeStaff: (staff_id) => window.ConvexDB.mutation("organizer:removeStaff", { staff_id }),

    // ── Payouts ──
    listPayoutsByOrg: (org_id) => window.ConvexDB.query("organizer:listPayoutsByOrg", { org_id }),
    requestPayout: (args) => window.ConvexDB.mutation("organizer:requestPayout", args),

    // ── Analytics ──
    getOrgAnalytics: (org_id) => window.ConvexDB.query("organizer:getOrgAnalytics", { org_id }),

    // ── Tickets ──
    checkInTicket: (args) => window.ConvexDB.mutation("organizer:checkInTicket", args),

    // ── Polls ──
    listPollsByOrg: (org_id) => window.ConvexDB.query("events:listPollsByOrg", { org_id }),
    createPoll: (args) => window.ConvexDB.mutation("events:createPoll", args),
    castVote: (args) => window.ConvexDB.mutation("events:castVote", args),
    getPollDetails: (poll_id) => window.ConvexDB.query("events:getPollDetails", { poll_id }),
    listPublicPolls: () => window.ConvexDB.query("events:listPublicPolls", {}),
    updatePollStatus: (args) => window.ConvexDB.mutation("events:updatePollStatus", args),
    deletePoll: (poll_id) => window.ConvexDB.mutation("events:deletePoll", { poll_id }),

    // ── Messages ──
    listMessagesByOrg: (org_id) => window.ConvexDB.query("organizer:listMessagesByOrg", { org_id }),
    sendAttendeeMessage: (args) => window.ConvexDB.mutation("organizer:sendAttendeeMessage", args),

    // ── Render helper ──
    renderEventCard,
};

// Notify the rest of the app that the database layer is ready
window.dispatchEvent(new Event('convex-ready'));
console.log('[TicketAfrica] Convex backend initialised ✓');
