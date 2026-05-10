/**
 * @file db.js
 * @description Ticket Africa -- Convex Backend Layer.
 *
 * This file connects directly to Convex using ConvexHttpClient from esm.sh.
 */

import { ConvexHttpClient } from "https://esm.sh/convex@1.32.0/browser";

// -- Inject Clerk CDN script (once, idempotent) ----------------------------
(function injectClerk() {
    if (document.getElementById('clerk-sdk')) return;
    const s = document.createElement('script');
    s.id = 'clerk-sdk';
    s.async = true;
    s.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
    s.setAttribute('data-clerk-publishable-key', 'pk_test_ZGl2aW5lLWZyb2ctMjUuY2xlcmsuYWNjb3VudHMuZGV2JA');
    document.head.appendChild(s);
})();

// -- Convex Config ---------------------------------------------------------
const CONVEX_URL = 'https://gallant-greyhound-48.convex.cloud';
const convex = new ConvexHttpClient(CONVEX_URL);

// -- Event card renderer ---------------------------------------------------
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

    const venueName = event.location && event.location.venue_name ? event.location.venue_name : (event.venue && event.venue.name ? event.venue.name : '');
    const city      = event.location && event.location.city ? event.location.city : (event.city || '');
    const minPrice  = event.min_price != null ? Number(event.min_price) : 0;
    const currency  = event.currency || 'GHS';
    const priceStr  = minPrice > 0 ? (currency + ' ' + minPrice.toFixed(2)) : 'Free';
    const remaining = Math.max(0, (event.ticket_capacity || event.capacity || 0) - (event.tickets_sold || 0));
    const availability = event.is_sold_out ? 'Sold Out' : (remaining ? remaining.toLocaleString() + ' left' : 'Available');

    const themeBg     = 'var(--color-bg-card)';
    const themeShadow = 'box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)';

    const imgHtml = event.cover_image
        ? '<img src="' + event.cover_image + '" alt="' + event.title + '" style="width:100%; height:100%; object-fit:cover;" />'
        : '<div class="event-card__image-placeholder" style="background:' + bg + '; width:100%; height:100%; display:flex; align-items:center; justify-content:center;"><iconify-icon icon="' + icon + '" style="font-size:3em; color:rgba(255,255,255,0.8);"></iconify-icon></div>';

    const liveBadge = event.status === 'published'
        ? '<span class="badge badge--success" style="background:rgba(46,204,113,0.9); color:white; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:bold;">Live</span>'
        : '';

    return '<a href="event-detail.html?slug=' + event.slug + '" class="event-card" data-reveal style="background:' + themeBg + '; border-radius:var(--radius-lg); overflow:hidden; border:1px solid var(--color-border); display:flex; flex-direction:column; text-decoration:none; ' + themeShadow + '">'
        + '<div class="event-card__image" style="position:relative; width:100%; height:160px;">'
        + imgHtml
        + '<div class="event-card__badges" style="position:absolute; top:8px; left:8px; display:flex; gap:4px;">' + liveBadge + '</div>'
        + '</div>'
        + '<div class="event-card__body" style="padding:16px; display:flex; flex-direction:column; flex:1;">'
        + '<div class="event-card__category" style="font-size:12px; font-weight:700; color:var(--color-secondary); text-transform:uppercase; margin-bottom:8px;">' + (event.category || '') + '</div>'
        + '<div class="event-card__title" style="font-family:var(--font-display); font-size:16px; font-weight:700; color:var(--color-text-primary); margin-bottom:12px; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">' + event.title + '</div>'
        + '<div class="event-card__details" style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px; flex:1;">'
        + '<div style="font-size:13px; color:var(--color-text-muted); display:flex; align-items:center; gap:6px;"><iconify-icon icon="hugeicons:calendar-01"></iconify-icon> ' + dateStr + '</div>'
        + '<div style="font-size:13px; color:var(--color-text-muted); display:flex; align-items:center; gap:6px;"><iconify-icon icon="hugeicons:location-01"></iconify-icon> ' + (venueName ? venueName + ', ' : '') + city + '</div>'
        + '</div>'
        + '<div style="display:flex; align-items:center; justify-content:space-between; padding-top:16px; border-top:1px solid var(--color-border); margin-top:auto;">'
        + '<div><div style="font-size:11px; color:var(--color-text-muted);">From</div><div style="font-family:var(--font-display); font-size:18px; font-weight:700; color:var(--color-text-primary);">' + priceStr + '</div></div>'
        + '<div style="font-size:12px; font-weight:600; color:' + (event.is_sold_out ? 'var(--color-error)' : 'var(--color-success)') + ';">' + availability + '</div>'
        + '</div>'
        + '</div>'
        + '</a>';
}

// -- window.ConvexDB -------------------------------------------------------
window.ConvexDB = {
    client: convex,

    // Generic wrappers (used by voting.js etc.)
    query: async function(name, args) {
        args = args || {};
        if (window.Clerk && window.Clerk.session) {
            const token = await window.Clerk.session.getToken();
            convex.setAuth(token);
        } else {
            convex.clearAuth();
        }
        return convex.query(name, args);
    },
    mutation: async function(name, args) {
        args = args || {};
        if (window.Clerk && window.Clerk.session) {
            const token = await window.Clerk.session.getToken();
            convex.setAuth(token);
        } else {
            convex.clearAuth();
        }
        return convex.mutation(name, args);
    },
    action: async function(name, args) {
        args = args || {};
        if (window.Clerk && window.Clerk.session) {
            const token = await window.Clerk.session.getToken();
            convex.setAuth(token);
        } else {
            convex.clearAuth();
        }
        return convex.action(name, args);
    },

    // -- Events --
    listEvents: function() { return window.ConvexDB.query("events:listEvents"); },
    listEventsByOrg: function(org_id) { return window.ConvexDB.query("events:listEventsByOrg", { org_id: org_id }); },
    getUpcomingEvents: function(limit) { return window.ConvexDB.query("events:getUpcomingEvents", { limit: limit || 10 }); },
    getEventById: function(event_id) { return window.ConvexDB.query("events:getEventById", { event_id: event_id }); },
    getEventBySlug: function(slug) { return window.ConvexDB.query("events:getEventBySlug", { slug: slug }); },
    getTicketTiers: function(event_id) { return window.ConvexDB.query("events:getTicketTiers", { event_id: event_id }); },
    searchEvents: function(query) { return window.ConvexDB.query("events:searchEvents", { query: query }); },

    // -- Profiles/Users --
    upsertUser: function(args) { return window.ConvexDB.mutation("users:upsertUser", args); },
    getByClerkId: function(clerk_id) { return window.ConvexDB.query("users:getByClerkId", { clerk_id: clerk_id }); },

    // -- Organizers --
    getOrgByOwner: function(owner_id) { return window.ConvexDB.query("users:getOrgByOwner", { owner_id: owner_id }); },
    getOrCreateOrg: function(args) { return window.ConvexDB.mutation("users:getOrCreateOrg", args); },

    // -- Promo Codes --
    validatePromoCode: function(code) { return window.ConvexDB.query("users:validatePromoCode", { code: code }); },
    redeemPromoCode: function(code) { return window.ConvexDB.mutation("users:redeemPromoCode", { code: code }); },

    // -- Event Mutations --
    createEvent: function(args) { return window.ConvexDB.mutation("events:createEvent", args); },
    updateEvent: function(args) { return window.ConvexDB.mutation("events:updateEvent", args); },
    publishEvent: function(event_id) { return window.ConvexDB.mutation("events:publishEvent", { event_id: event_id }); },
    cancelEvent: function(event_id) { return window.ConvexDB.mutation("events:cancelEvent", { event_id: event_id }); },
    deleteEvent: function(event_id) { return window.ConvexDB.mutation("events:deleteEvent", { event_id: event_id }); },

    // -- Ticket Tiers --
    addTicketTier: function(args) { return window.ConvexDB.mutation("events:addTicketTier", args); },
    removeTicketTier: function(tier_id) { return window.ConvexDB.mutation("events:removeTicketTier", { tier_id: tier_id }); },

    // -- Orders & Payments --
    listOrdersByOrg: function(org_id) { return window.ConvexDB.query("organizer:listOrdersByOrg", { org_id: org_id }); },
    listOrdersByEvent: function(event_id) { return window.ConvexDB.query("organizer:listOrdersByEvent", { event_id: event_id }); },
    listOrdersByBuyer: function(buyer_email) { return window.ConvexDB.query("organizer:listOrdersByBuyer", { buyer_email: buyer_email }); },
    createOrder: function(args) { return window.ConvexDB.mutation("organizer:createOrder", args); },
    createCheckout: function(args) { return window.ConvexDB.mutation("payments:createCheckout", args); },
    verifyPaystackPayment: function(args) { return window.ConvexDB.action("payments:verifyPaystackPayment", args); },

    // -- Organizer: Promos --
    listPromosByOrg: function(org_id) { return window.ConvexDB.query("organizer:listPromosByOrg", { org_id: org_id }); },
    createPromoCode: function(args) { return window.ConvexDB.mutation("organizer:createPromoCode", args); },
    deactivatePromoCode: function(promo_id) { return window.ConvexDB.mutation("organizer:deactivatePromoCode", { promo_id: promo_id }); },
    deletePromoCode: function(promo_id) { return window.ConvexDB.mutation("organizer:deletePromoCode", { promo_id: promo_id }); },

    // -- Staff --
    listStaffByOrg: function(org_id) { return window.ConvexDB.query("organizer:listStaffByOrg", { org_id: org_id }); },
    inviteStaff: function(args) { return window.ConvexDB.mutation("organizer:inviteStaff", args); },
    revokeStaff: function(staff_id) { return window.ConvexDB.mutation("organizer:revokeStaff", { staff_id: staff_id }); },
    removeStaff: function(staff_id) { return window.ConvexDB.mutation("organizer:removeStaff", { staff_id: staff_id }); },

    // -- Payouts --
    listPayoutsByOrg: function(org_id) { return window.ConvexDB.query("organizer:listPayoutsByOrg", { org_id: org_id }); },
    requestPayout: function(args) { return window.ConvexDB.mutation("organizer:requestPayout", args); },

    // -- Analytics --
    getOrgAnalytics: function(org_id) { return window.ConvexDB.query("organizer:getOrgAnalytics", { org_id: org_id }); },

    // -- Tickets --
    checkInTicket: function(args) { return window.ConvexDB.mutation("organizer:checkInTicket", args); },
    verifyTicket: function(qr_code) { return window.ConvexDB.query("organizer:verifyTicket", { qr_code: qr_code }); },

    // -- Polls --
    listPollsByOrg: function(org_id) { return window.ConvexDB.query("events:listPollsByOrg", { org_id: org_id }); },
    createPoll: function(args) { return window.ConvexDB.mutation("events:createPoll", args); },
    castVote: function(args) { return window.ConvexDB.mutation("events:castVote", args); },
    getPollDetails: function(poll_id) { return window.ConvexDB.query("events:getPollDetails", { poll_id: poll_id }); },
    listPublicPolls: function() { return window.ConvexDB.query("events:listPublicPolls", {}); },
    updatePollStatus: function(args) { return window.ConvexDB.mutation("events:updatePollStatus", args); },
    deletePoll: function(args) {
        var pollArgs = (typeof args === 'string') ? { poll_id: args } : args;
        return window.ConvexDB.mutation("events:deletePoll", pollArgs);
    },

    // -- Messages --
    listMessagesByOrg: function(org_id) { return window.ConvexDB.query("organizer:listMessagesByOrg", { org_id: org_id }); },
    sendAttendeeMessage: function(args) { return window.ConvexDB.mutation("organizer:sendAttendeeMessage", args); },
    listQueuedMessages: function(limit) { return window.ConvexDB.query("messages:listQueued", { limit: limit || 50 }); },
    listMessagesByRecipient: function(email) { return window.ConvexDB.query("messages:listByRecipient", { email: email }); },
    subscribeNewsletter: function(args) { return window.ConvexDB.mutation("messages:subscribeNewsletter", args); },
    enqueueNewsletter: function(args) { return window.ConvexDB.mutation("messages:enqueueNewsletter", args); },
    deliverQueuedMessages: function(limit) { return window.ConvexDB.action("messages:deliverQueued", { limit: limit || 25 }); },
    markMessageSent: function(message_id) { return window.ConvexDB.mutation("messages:markSent", { message_id: message_id }); },
    markMessageFailed: function(message_id, error) { return window.ConvexDB.mutation("messages:markFailed", { message_id: message_id, error: error }); },

    // -- Render helper --
    renderEventCard: renderEventCard,
};

// Notify the rest of the app that the database layer is ready
window.dispatchEvent(new Event('convex-ready'));
console.log('[TicketAfrica] Convex backend initialised');
