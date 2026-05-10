/**
 * @file services/payments.js
 * @description Payment processing — multi-gateway abstraction.
 *
 * GATEWAY ROUTING:
 *   The gateway is selected automatically based on currency or the user's country.
 *
 *   Currency → Gateway:
 *     GH₵  (Ghana Cedi)       → Paystack
 *     ₦    (Nigerian Naira)   → Paystack
 *     KSh  (Kenyan Shilling)  → Flutterwave
 *     R    (South African Rand) → Flutterwave
 *     RWF  (Rwandan Franc)    → Flutterwave
 *
 * PAYMENT FLOW (server-side — initiated by Edge Function):
 *   1. Client calls initiate() → server creates order + payment session
 *   2. Client redirects / shows popup to gateway payment page
 *   3. Gateway redirects to /payment-callback.html?ref=xxx
 *   4. Client calls verify() → Edge Function confirms with gateway
 *   5. On success: tickets are issued, notifications sent
 *
 * MOBILE MONEY (MoMo):
 *   MoMo uses a direct-charge flow (no redirect needed):
 *   1. Client calls initiateMoMo() → gateway sends USSD push to phone
 *   2. User approves on their phone
 *   3. Webhook (server-side) receives confirmation → issues tickets
 *   4. Client polls status via pollMoMoStatus()
 *
 * SECURITY:
 *   - Payment initialization happens server-side (Edge Function) to keep secret keys safe
 *   - Client only handles redirect and status polling
 *   - All amounts are verified server-side; never trust client-submitted totals
 */

import { supabase, TAError } from '../lib/supabase.js';
import { TA_CONFIG } from '../config.js';

/** Map of currency codes to gateway names */
const CURRENCY_GATEWAY_MAP = {
    GHS: 'paystack',  // Ghana Cedi
    NGN: 'paystack',  // Nigerian Naira
    KES: 'flutterwave',
    ZAR: 'flutterwave',
    RWF: 'flutterwave',
    UGX: 'flutterwave',
    TZS: 'flutterwave',
};

function gatewayForCurrency(currency) {
    return CURRENCY_GATEWAY_MAP[currency?.toUpperCase()] ?? 'paystack';
}

async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new TAError('Authentication required to purchase', 'AUTH_REQUIRED');
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
    };
}

async function callEdgeFunction(path, body) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${TA_CONFIG.SUPABASE_URL}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new TAError(json.message ?? 'Payment service error', json.code ?? 'PAYMENT_ERROR');
    return json;
}

export const PaymentService = {

    /**
     * Initiate a card / bank payment session.
     * Returns a URL to redirect the user to, or a Paystack/Flutterwave popup URL.
     *
     * @param {{
     *   eventId: string,
     *   tierSelections: Array<{ tierId: string, quantity: number }>,
     *   promoCode?: string,
     *   attendee: { name: string, email: string, phone: string },
     *   currency: string,
     * }} params
     * @returns {Promise<{ orderId: string, gateway: string, paymentUrl: string, reference: string }>}
     */
    async initiate(params) {
        return callEdgeFunction(TA_CONFIG.API.PAYMENT_VERIFY.replace('verify', 'initiate'), {
            ...params,
            gateway: gatewayForCurrency(params.currency),
        });
    },

    /**
     * Initiate a Mobile Money direct-charge.
     * Sends a USSD push request to the user's phone.
     *
     * @param {{
     *   eventId: string,
     *   tierSelections: Array<{ tierId: string, quantity: number }>,
     *   momoNumber: string,    E.164 format
     *   momoNetwork: 'mtn'|'vodafone'|'airteltigo'|'mpesa',
     *   currency: string,
     *   attendee: { name: string, email: string, phone: string },
     *   promoCode?: string,
     * }} params
     * @returns {Promise<{ orderId: string, reference: string, message: string }>}
     */
    async initiateMoMo(params) {
        return callEdgeFunction('/functions/v1/momo-charge', params);
    },

    /**
     * Poll the status of a pending MoMo payment.
     * Call every 3 seconds until status is 'success' or 'failed'.
     *
     * @param {string} orderId
     * @returns {Promise<{ status: 'pending'|'success'|'failed', message: string }>}
     */
    async pollMoMoStatus(orderId) {
        const headers = await getAuthHeaders();
        const res = await fetch(
            `${TA_CONFIG.SUPABASE_URL}/functions/v1/momo-status?order_id=${orderId}`,
            { headers }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new TAError(json.message ?? 'Status check failed', 'POLL_ERROR');
        return json;
    },

    /**
     * Verify a completed payment by reference (called from /payment-callback.html).
     * Server-side: confirms with gateway, issues tickets, sends notifications.
     *
     * @param {{ reference: string, gateway: string }} params
     * @returns {Promise<{ orderId: string, status: 'success'|'failed', ticketIds: string[] }>}
     */
    async verify({ reference, gateway }) {
        return callEdgeFunction(TA_CONFIG.API.PAYMENT_VERIFY, { reference, gateway });
    },

    /**
     * Apply a promo code and get the discounted totals.
     * @param {{ code: string, eventId: string, tierSelections: Array<{ tierId: string, quantity: number }> }} params
     * @returns {Promise<{ valid: boolean, discount: number, discountType: 'percent'|'fixed', newTotal: number }>}
     */
    async applyPromo({ code, eventId, tierSelections }) {
        return callEdgeFunction('/functions/v1/promo-apply', { code, event_id: eventId, tier_selections: tierSelections });
    },

    /**
     * Get the full order object (used on confirmation/account pages).
     * @param {string} orderId
     * @returns {Promise<import('../types.js').Order>}
     */
    async getOrder(orderId) {
        const { data, error } = await supabase
            .from('orders')
            .select(`
        id, reference, status, total, currency, payment_method, gateway,
        created_at, completed_at, promo_code,
        attendee_name, attendee_email, attendee_phone,
        event:events(id, title, starts_at, cover_image_url),
        tickets(id, ticket_number, status, tier:ticket_tiers(name))
      `)
            .eq('id', orderId)
            .single();
        if (error) throw new TAError(error.message, error.code);
        return data;
    },
};
