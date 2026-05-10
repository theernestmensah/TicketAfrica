/**
 * @file services/orders.js
 * @description Order history and management for the buyer account.
 *
 * DATABASE TABLES:
 *   public.orders    → one row per purchase transaction
 *   public.tickets   → individual ticket records, FK → orders.id
 */

import { supabase, sb, TAError } from '../lib/supabase.js';

const ORDER_COLS = `
  id, reference, status, total, currency, payment_method, gateway,
  promo_code, promo_discount,
  attendee_name, attendee_email, attendee_phone,
  created_at, completed_at,
  event:events(id, title, slug, starts_at, cover_image_url, city, country),
  tickets(
    id, ticket_number, status, seat, used_at, qr_url,
    tier:ticket_tiers(id, name, price, currency)
  )
`;

export const OrderService = {

    /**
     * Get all orders for the authenticated user.
     * @returns {Promise<import('../types.js').Order[]>}
     */
    async getMyOrders() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new TAError('Not authenticated', 'AUTH_REQUIRED');

        return sb(
            supabase
                .from('orders')
                .select(ORDER_COLS)
                .eq('attendee_id', user.id)
                .order('created_at', { ascending: false })
        );
    },

    /**
     * Get a single order by ID (buyer must own it).
     * @param {string} orderId
     * @returns {Promise<import('../types.js').Order>}
     */
    async getById(orderId) {
        return sb(
            supabase
                .from('orders')
                .select(ORDER_COLS)
                .eq('id', orderId)
                .single()
        );
    },

    /**
     * Get a single order by payment reference (post-checkout redirect).
     * @param {string} reference
     * @returns {Promise<import('../types.js').Order>}
     */
    async getByReference(reference) {
        return sb(
            supabase
                .from('orders')
                .select(ORDER_COLS)
                .eq('reference', reference)
                .single()
        );
    },
};
