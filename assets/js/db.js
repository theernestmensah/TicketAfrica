import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import "./auth.js";

// Initialize the Convex HTTP client
const client = new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL);

// Expose a global database wrapper so vanilla JS scripts can query easily
window.ConvexDB = {
    client,
    api,

    // Core Event Queries
    listEvents: async () => await client.query(api.events.listEvents),
    listEventsByOrg: async (org_id) => await client.query(api.events.listEventsByOrg, { org_id }),
    getUpcomingEvents: async (limit) => await client.query(api.events.getUpcomingEvents, { limit }),
    getEventBySlug: async (slug) => await client.query(api.events.getEventBySlug, { slug }),
    getTicketTiers: async (event_id) => await client.query(api.events.getTicketTiers, { event_id }),
    searchEvents: async (query) => await client.query(api.events.searchEvents, { query }),

    // User / Auth
    upsertUser: async (args) => await client.mutation(api.users.upsertUser, args),
    getByClerkId: async (clerk_id) => await client.query(api.users.getByClerkId, { clerk_id }),
    getOrgByOwner: async (owner_id) => await client.query(api.users.getOrgByOwner, { owner_id }),
    getOrCreateOrg: async (args) => await client.mutation(api.users.getOrCreateOrg, args),

    // Promo code validation (for checkout)
    validatePromoCode: async (code, org_id) => await client.query(api.users.validatePromoCode, { code, org_id }),
    redeemPromoCode: async (code) => await client.mutation(api.users.redeemPromoCode, { code }),

    // Core Event Mutations
    createEvent: async (args) => await client.mutation(api.events.createEvent, args),
    updateEvent: async (args) => await client.mutation(api.events.updateEvent, args),
    publishEvent: async (event_id) => await client.mutation(api.events.publishEvent, { event_id }),
    cancelEvent: async (event_id) => await client.mutation(api.events.cancelEvent, { event_id }),
    deleteEvent: async (event_id) => await client.mutation(api.events.deleteEvent, { event_id }),

    // Ticket Tier Mutations
    addTicketTier: async (args) => await client.mutation(api.events.addTicketTier, args),
    removeTicketTier: async (tier_id) => await client.mutation(api.events.removeTicketTier, { tier_id }),

    // Orders & Payments
    listOrdersByOrg: async (org_id) => await client.query(api.organizer.listOrdersByOrg, { org_id }),
    listOrdersByEvent: async (event_id) => await client.query(api.organizer.listOrdersByEvent, { event_id }),
    createOrder: async (args) => await client.mutation(api.organizer.createOrder, args),
    createCheckout: async (args) => await client.mutation(api.payments.createCheckout, args),
    completeOrder: async (args) => await client.mutation(api.payments.completeOrder, args),

    // Promo Codes
    listPromosByOrg: async (org_id) => await client.query(api.organizer.listPromosByOrg, { org_id }),
    createPromoCode: async (args) => await client.mutation(api.organizer.createPromoCode, args),
    deactivatePromoCode: async (promo_id) => await client.mutation(api.organizer.deactivatePromoCode, { promo_id }),
    deletePromoCode: async (promo_id) => await client.mutation(api.organizer.deletePromoCode, { promo_id }),

    // Staff
    listStaffByOrg: async (org_id) => await client.query(api.organizer.listStaffByOrg, { org_id }),
    inviteStaff: async (args) => await client.mutation(api.organizer.inviteStaff, args),
    revokeStaff: async (staff_id) => await client.mutation(api.organizer.revokeStaff, { staff_id }),
    removeStaff: async (staff_id) => await client.mutation(api.organizer.removeStaff, { staff_id }),

    // Payouts
    listPayoutsByOrg: async (org_id) => await client.query(api.organizer.listPayoutsByOrg, { org_id }),
    requestPayout: async (args) => await client.mutation(api.organizer.requestPayout, args),

    // Attendee Messages
    listMessagesByOrg: async (org_id) => await client.query(api.organizer.listMessagesByOrg, { org_id }),
    sendAttendeeMessage: async (args) => await client.mutation(api.organizer.sendAttendeeMessage, args),

    // Analytics
    getOrgAnalytics: async (org_id) => await client.query(api.organizer.getOrgAnalytics, { org_id }),

    // Tickets
    checkInTicket: async (args) => await client.mutation(api.organizer.checkInTicket, args),

    // Voting
    listPollsByOrg: async (org_id) => await client.query(api.events.listPollsByOrg, { org_id }),
    createPoll: async (args) => await client.mutation(api.events.createPoll, args),
    castVote: async (args) => await client.mutation(api.events.castVote, args),
    getPollDetails: async (poll_id) => await client.query(api.events.getPollDetails, { poll_id }),
    listPublicPolls: async () => await client.query(api.events.listPublicPolls),
    updatePollStatus: async (args) => await client.mutation(api.events.updatePollStatus, args),
    deletePoll: async (poll_id) => await client.mutation(api.events.deletePoll, { poll_id }),

    // Utility to render an event card into an HTML string
    renderEventCard: (event) => {
        // Format date: "Sat 15 Mar 2026, 8:00 PM"
        const d = new Date(event.start_date);
        const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        // Pick an icon/color based on category
        let icon = "hugeicons:music-note-01";
        let bg = "linear-gradient(135deg,#1a0540,#3d0f80)";

        if (event.category.toLowerCase().includes('sport')) {
            icon = "hugeicons:football";
            bg = "linear-gradient(135deg,#0a1a30,#0d3060)";
        } else if (event.category.toLowerCase().includes('fest')) {
            icon = "hugeicons:tent-01";
            bg = "linear-gradient(135deg,#1a0a20,#3d1060)";
        } else if (event.category.toLowerCase().includes('conf')) {
            icon = "hugeicons:briefcase-01";
            bg = "linear-gradient(135deg,#0d1f0d,#1a4020)";
        }

        return `
        <a href="event-detail.html?slug=${event.slug}" class="event-card" data-reveal>
            <div class="event-card__image">
                <div class="event-card__image-placeholder" style="background:${bg};">
                    <iconify-icon icon="${icon}" style="vertical-align:middle; font-size: 2em; color: rgba(255,255,255,0.8);"></iconify-icon>
                </div>
                <div class="event-card__badges">
                    ${event.status === 'published' ? '<span class="badge badge--success">Live</span>' : ''}
                </div>
                <button class="event-card__save" aria-label="Save event">
                    <iconify-icon icon="hugeicons:favourite"></iconify-icon>
                </button>
            </div>
            <div class="event-card__body">
                <div class="event-card__category" style="font-size:12px;font-weight:700;color:var(--color-primary);text-transform:uppercase;margin-bottom:8px;">${event.category}</div>
                <div class="event-card__title" style="font-family:var(--font-display);font-size:16px;font-weight:700;color:white;margin-bottom:12px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${event.title}</div>
                <div class="event-card__details" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;flex:1;">
                    <div style="font-size:13px;color:rgba(255,255,255,0.6);display:flex;align-items:center;gap:6px;">
                        <iconify-icon icon="hugeicons:calendar-01"></iconify-icon> ${dateStr}
                    </div>
                    <div style="font-size:13px;color:rgba(255,255,255,0.6);display:flex;align-items:center;gap:6px;">
                        <iconify-icon icon="hugeicons:location-01"></iconify-icon> ${event.location.venue_name}, ${event.location.city}
                    </div>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);margin-top:auto;">
                    <div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.5);">From</div>
                        <div style="font-family:var(--font-display);font-size:18px;font-weight:700;">${event.currency || 'GH₵'} 150 <span style="font-size:12px;font-weight:400;color:rgba(255,255,255,0.5);">/ ticket</span></div>
                    </div>
                    <div style="font-size:12px;font-weight:600;color:var(--color-success);">✓ Available</div>
                </div>
            </div>
        </a>
        `;
    }
};

// Dispatch an event so other scripts know Convex is ready
window.dispatchEvent(new Event('convex-ready'));
