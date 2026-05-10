/**
 * @file services/realtime.js
 * @description Supabase Realtime subscriptions — live inventory, scan counts, order status.
 *
 * CHANNELS:
 *   event-inventory:{eventId}   → Ticket tier inventory changes (sold counts)
 *   scanner-stats:{eventId}     → Live scan counters on scanner page
 *   order-status:{orderId}      → Payment status updates for checkout polling
 *
 * USAGE:
 *   const unsub = RealtimeService.watchInventory(eventId, (update) => {
 *     updateUI(update.tierId, update.remaining);
 *   });
 *   // When leaving the page:
 *   unsub();
 *
 * NOTES:
 *   - Realtime requires the `realtime` extension enabled in Supabase
 *   - Enable it in: Supabase Dashboard → Database → Extensions → pg_net / realtime
 *   - Table `ticket_tiers` must be added to the publication:
 *       ALTER PUBLICATION supabase_realtime ADD TABLE ticket_tiers;
 */

import { supabase } from '../lib/supabase.js';

export const RealtimeService = {

    /**
     * Watch live inventory updates for all ticket tiers of an event.
     * Fires whenever a tier's `tickets_sold` or `is_sold_out` changes.
     *
     * @param {string} eventId
     * @param {(update: { tierId: string, ticketsSold: number, isSoldOut: boolean, remaining: number }) => void} onUpdate
     * @returns {() => void} Unsubscribe function
     */
    watchInventory(eventId, onUpdate) {
        const channel = supabase
            .channel(`event-inventory-${eventId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'ticket_tiers',
                    filter: `event_id=eq.${eventId}`,
                },
                (payload) => {
                    const tier = payload.new;
                    onUpdate({
                        tierId: tier.id,
                        ticketsSold: tier.tickets_sold,
                        isSoldOut: tier.is_sold_out,
                        remaining: tier.total_inventory - tier.tickets_sold,
                    });
                }
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    },

    /**
     * Watch live scan counter updates on the scanner page.
     *
     * @param {string} eventId
     * @param {(stats: { valid: number, rejected: number, total: number }) => void} onUpdate
     * @returns {() => void} Unsubscribe function
     */
    watchScanStats(eventId, onUpdate) {
        const channel = supabase
            .channel(`scanner-stats-${eventId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'scan_events',
                    filter: `event_id=eq.${eventId}`,
                },
                (payload) => {
                    const scan = payload.new;
                    // Accumulate locally — the aggregated stats arrive via getLiveStats() RPC
                    onUpdate({ latestScan: scan });
                }
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    },

    /**
     * Watch a specific order's payment status.
     * Used on the checkout page to detect when the MoMo push is approved.
     *
     * @param {string} orderId
     * @param {(order: { status: string, completedAt?: string }) => void} onUpdate
     * @returns {() => void} Unsubscribe function
     */
    watchOrderStatus(orderId, onUpdate) {
        const channel = supabase
            .channel(`order-status-${orderId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'orders',
                    filter: `id=eq.${orderId}`,
                },
                (payload) => {
                    const order = payload.new;
                    onUpdate({
                        status: order.status,
                        completedAt: order.completed_at,
                    });
                }
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    },

    /**
     * Watch the organizer's dashboard stats for live updates.
     * Fires when a new order is placed for any of the organizer's events.
     *
     * @param {string} organizerId
     * @param {() => void} onNewOrder  Callback — re-fetch stats from OrganizerService
     * @returns {() => void} Unsubscribe function
     */
    watchOrganizerOrders(organizerId, onNewOrder) {
        const channel = supabase
            .channel(`organizer-orders-${organizerId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'orders',
                    filter: `organizer_id=eq.${organizerId}`,
                },
                (payload) => {
                    if (payload.new.status === 'completed') {
                        onNewOrder(payload.new);
                    }
                }
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    },
};
