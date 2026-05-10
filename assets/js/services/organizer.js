/**
 * @file services/organizer.js
 * @description Organizer dashboard data — events, analytics, orders, payouts.
 *
 * DATABASE VIEWS (created in Supabase):
 *   organizer_event_stats     → aggregated per-event metrics (sold, revenue, etc.)
 *   organizer_daily_sales     → daily sales timeseries for charts
 *   organizer_order_summary   → recent orders with attendee details
 *
 * RLS POLICY:
 *   All queries here are scoped to the authenticated organizer's own data.
 *   The `organizer_id` column is matched against auth.uid() in RLS policies.
 *
 * PAYOUT FLOW:
 *   1. Organizer calls requestPayout()
 *   2. Edge Function validates balance, creates payout record
 *   3. Payout is processed by finance team or automated bank API
 *   4. Status updates via webhook → Supabase → Realtime → dashboard
 */

import { supabase, sb, TAError } from '../lib/supabase.js';
import { TA_CONFIG } from '../config.js';

async function getOrganizerIdOrThrow() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new TAError('Not authenticated', 'AUTH_REQUIRED');

    const { data: org } = await supabase
        .from('organizers')
        .select('id')
        .eq('owner_id', user.id)
        .single();

    if (!org) throw new TAError('No organizer profile found for this account', 'NOT_ORGANIZER');
    return org.id;
}

async function callEdgeFunction(path, body = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${TA_CONFIG.SUPABASE_URL}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new TAError(json.message ?? 'Server error', json.code ?? 'SERVER_ERROR');
    return json;
}

export const OrganizerService = {

    /**
     * Get the overview stats for the dashboard header cards.
     * @returns {Promise<{
     *   totalTicketsSold: number,
     *   grossRevenue: number,
     *   activeEventsCount: number,
     *   avgSellThrough: number,
     *   currency: string,
     * }>}
     */
    async getOverviewStats() {
        const orgId = await getOrganizerIdOrThrow();
        const { data, error } = await supabase
            .rpc('organizer_overview_stats', { org_id: orgId });
        if (error) throw new TAError(error.message, error.code);
        return data?.[0] ?? {};
    },

    /**
     * Get per-event stats for the events table.
     * @returns {Promise<import('../types.js').OrganizerEventStat[]>}
     */
    async getEventStats() {
        const orgId = await getOrganizerIdOrThrow();
        return sb(
            supabase
                .from('organizer_event_stats')
                .select('*')
                .eq('organizer_id', orgId)
                .order('starts_at', { ascending: false })
        );
    },

    /**
     * Get daily sales timeseries for the chart.
     * @param {string} eventId  Pass null for all events
     * @param {number} days  Number of days back
     * @returns {Promise<Array<{ date: string, tickets_sold: number, revenue: number }>>}
     */
    async getDailySales(eventId = null, days = 7) {
        const orgId = await getOrganizerIdOrThrow();
        const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
        let query = supabase
            .from('organizer_daily_sales')
            .select('date, tickets_sold, revenue, currency')
            .eq('organizer_id', orgId)
            .gte('date', since)
            .order('date', { ascending: true });

        if (eventId) query = query.eq('event_id', eventId);
        return sb(query);
    },

    /**
     * Get the recent orders list.
     * @param {{ limit?: number, eventId?: string, status?: string }} options
     * @returns {Promise<import('../types.js').Order[]>}
     */
    async getRecentOrders({ limit = 20, eventId, status } = {}) {
        const orgId = await getOrganizerIdOrThrow();
        let query = supabase
            .from('orders')
            .select(`
        id, reference, status, total, currency, payment_method, created_at,
        attendee_name, attendee_email, attendee_phone,
        tickets(id, ticket_number, tier:ticket_tiers(name)),
        event:events(id, title, starts_at)
      `)
            .eq('organizer_id', orgId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (eventId) query = query.eq('event_id', eventId);
        if (status) query = query.eq('status', status);
        return sb(query);
    },

    /**
     * Get the attendee list for an event (for export / check-in).
     * @param {string} eventId
     * @returns {Promise<import('../types.js').Attendee[]>}
     */
    async getAttendees(eventId) {
        const orgId = await getOrganizerIdOrThrow();
        return sb(
            supabase
                .from('tickets')
                .select(`
          id, ticket_number, status, seat, issued_at, used_at,
          holder_name, holder_email, holder_phone,
          tier:ticket_tiers(name, price)
        `)
                .eq('event_id', eventId)
                .eq('organizer_id', orgId)
                .order('issued_at', { ascending: true })
        );
    },

    /**
     * Get the payout balance and payout history.
     * @returns {Promise<{ availableBalance: number, currency: string, payouts: object[] }>}
     */
    async getPayoutInfo() {
        const orgId = await getOrganizerIdOrThrow();
        const [balance, payouts] = await Promise.all([
            sb(supabase.from('organizer_balances').select('*').eq('organizer_id', orgId).single()),
            sb(supabase.from('payouts').select('*').eq('organizer_id', orgId).order('created_at', { ascending: false }).limit(10)),
        ]);
        return { availableBalance: balance?.available_balance ?? 0, currency: balance?.currency ?? 'GHS', payouts: payouts ?? [] };
    },

    /**
     * Request a payout of available funds.
     * @param {{ amount?: number, bankDetails?: object, momoNumber?: string }} options
     * @returns {Promise<{ payoutId: string, message: string, expectedDate: string }>}
     */
    async requestPayout(options = {}) {
        return callEdgeFunction(TA_CONFIG.API.PAYOUT_REQUEST, options);
    },

    /**
     * Create or update a promo code for an event.
     * @param {{
     *   eventId: string,
     *   code: string,
     *   discountType: 'percent'|'fixed',
     *   discountValue: number,
     *   maxUses?: number,
     *   expiresAt?: string,
     *   tierIds?: string[],  null = applies to all tiers
     * }} params
     * @returns {Promise<object>}
     */
    async upsertPromoCode(params) {
        const orgId = await getOrganizerIdOrThrow();
        return sb(
            supabase
                .from('promo_codes')
                .upsert({ ...params, organizer_id: orgId, code: params.code.toUpperCase() })
                .select()
                .single()
        );
    },

    /**
     * Send an update message to all attendees of an event.
     * Delivers via SMS (Africa's Talking) + email (Edge Function).
     * @param {{ eventId: string, subject: string, body: string, channels: ('sms'|'email')[] }} params
     * @returns {Promise<{ sent: number, failed: number }>}
     */
    async sendAttendeeUpdate({ eventId, subject, body, channels = ['sms', 'email'] }) {
        return callEdgeFunction('/functions/v1/send-attendee-update', {
            event_id: eventId,
            subject,
            body,
            channels,
        });
    },
};
