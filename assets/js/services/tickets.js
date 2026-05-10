/**
 * @file services/tickets.js
 * @description Ticket wallet, QR codes, transfers, and resale.
 *
 * DATABASE TABLES:
 *   public.tickets            → issued ticket records (one row per ticket)
 *   public.ticket_transfers   → transfer audit log
 *   public.ticket_resales     → resale listings
 *
 * TICKET LIFECYCLE:
 *   issued → (used | transferred | refunded | resold)
 *
 * QR CODE STRATEGY:
 *   - QR content is a signed JWT: { ticket_id, event_id, issued_to, nonce, exp }
 *   - Generated server-side via Edge Function (never client-side)
 *   - Nonce rotates on each valid scan attempt → screenshot attacks fail
 *   - QR image stored in Supabase Storage (private bucket, signed URLs)
 *
 * SECURITY NOTES:
 *   - Clients receive a signed URL (15 min TTL) to display the QR
 *   - The validation endpoint (scanner) calls functions/v1/ticket-validate
 *   - This service file never calls the validation endpoint directly —
 *     that is the scanner's responsibility
 */

import { supabase, sb, TAError } from '../lib/supabase.js';
import { TA_CONFIG } from '../config.js';

const TICKET_COLS = `
  id, order_id, event_id, tier_id, status,
  holder_name, holder_email, holder_phone,
  ticket_number, qr_url, seat,
  issued_at, used_at, transferred_at,
  event:events(id, title, slug, starts_at, cover_image_url, city, country, venue:venues(name, address)),
  tier:ticket_tiers(id, name, price, currency)
`;

export const TicketService = {

    /**
     * Get all tickets in the wallet for the authenticated user.
     * @returns {Promise<import('../types.js').Ticket[]>}
     */
    async getWallet() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new TAError('Not authenticated', 'AUTH_REQUIRED');

        return sb(
            supabase
                .from('tickets')
                .select(TICKET_COLS)
                .eq('holder_id', user.id)
                .order('issued_at', { ascending: false })
        );
    },

    /**
     * Get upcoming tickets only.
     * @returns {Promise<import('../types.js').Ticket[]>}
     */
    async getUpcoming() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new TAError('Not authenticated', 'AUTH_REQUIRED');

        const now = new Date().toISOString();
        return sb(
            supabase
                .from('tickets')
                .select(TICKET_COLS)
                .eq('holder_id', user.id)
                .eq('status', 'issued')
                .gt('event.starts_at', now)
                .order('event.starts_at', { ascending: true })
        );
    },

    /**
     * Get a single ticket by ID.
     * @param {string} ticketId
     * @returns {Promise<import('../types.js').Ticket>}
     */
    async getById(ticketId) {
        return sb(
            supabase
                .from('tickets')
                .select(TICKET_COLS)
                .eq('id', ticketId)
                .single()
        );
    },

    /**
     * Get a signed URL for displaying the QR code (15-minute TTL).
     * QR images are in a private Supabase Storage bucket.
     * @param {string} ticketId
     * @returns {Promise<string>} Signed URL
     */
    async getQRSignedUrl(ticketId) {
        // Fetch the raw storage path from the ticket record
        const { data: ticket } = await supabase
            .from('tickets')
            .select('qr_storage_path')
            .eq('id', ticketId)
            .single();

        if (!ticket?.qr_storage_path) {
            throw new TAError('QR code not found for this ticket', 'QR_NOT_FOUND');
        }

        const { data, error } = await supabase.storage
            .from(TA_CONFIG.STORAGE_BUCKETS.TICKET_ASSETS)
            .createSignedUrl(ticket.qr_storage_path, 900); // 15 min

        if (error) throw new TAError(error.message, 'STORAGE_ERROR', error);
        return data.signedUrl;
    },

    /**
     * Request a ticket regeneration (rotates the QR nonce).
     * Calls the server-side Edge Function — the client cannot regenerate QRs.
     * @param {string} ticketId
     * @returns {Promise<{ newQrUrl: string }>}
     */
    async regenerateQR(ticketId) {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${TA_CONFIG.SUPABASE_URL}${TA_CONFIG.API.QR_SERVICE}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ ticket_id: ticketId, action: 'regenerate' }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new TAError(err.message ?? 'QR regeneration failed', 'QR_REGEN_FAILED');
        }
        return res.json();
    },

    /**
     * Transfer a ticket to another user by phone or email.
     * Server-side: invalidates current QR, issues new QR to recipient.
     * @param {{
     *   ticketId: string,
     *   recipientPhone?: string,
     *   recipientEmail?: string,
     *   message?: string,
     * }} params
     * @returns {Promise<{ transferId: string, message: string }>}
     */
    async transfer({ ticketId, recipientPhone, recipientEmail, message }) {
        if (!recipientPhone && !recipientEmail) {
            throw new TAError('Recipient phone or email required', 'TRANSFER_NO_RECIPIENT');
        }

        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${TA_CONFIG.SUPABASE_URL}/functions/v1/ticket-transfer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                ticket_id: ticketId,
                recipient_phone: recipientPhone,
                recipient_email: recipientEmail,
                message,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new TAError(err.message ?? 'Transfer failed', 'TRANSFER_FAILED');
        }

        // Record transfer locally for audit display
        await sb(
            supabase.from('ticket_transfers').insert({
                ticket_id: ticketId,
                to_phone: recipientPhone,
                to_email: recipientEmail,
                message,
                transferred_at: new Date().toISOString(),
            })
        );

        return res.json();
    },

    /**
     * List the transfer history for a ticket.
     * @param {string} ticketId
     * @returns {Promise<import('../types.js').TicketTransfer[]>}
     */
    async getTransferHistory(ticketId) {
        return sb(
            supabase
                .from('ticket_transfers')
                .select('*')
                .eq('ticket_id', ticketId)
                .order('transferred_at', { ascending: false })
        );
    },

    /**
     * Create a resale listing for a ticket.
     * @param {{ ticketId: string, askingPrice: number, currency: string }} params
     * @returns {Promise<import('../types.js').ResaleListing>}
     */
    async createResaleListing({ ticketId, askingPrice, currency }) {
        return sb(
            supabase
                .from('ticket_resales')
                .insert({
                    ticket_id: ticketId,
                    asking_price: askingPrice,
                    currency,
                    status: 'listed',
                    listed_at: new Date().toISOString(),
                })
                .select()
                .single()
        );
    },
};
