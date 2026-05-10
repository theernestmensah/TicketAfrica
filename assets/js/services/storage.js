/**
 * @file services/storage.js
 * @description Supabase Storage — event images, ticket assets, organizer logos.
 *
 * BUCKET STRUCTURE:
 *   event-images/
 *     {organizerId}/{eventId}/cover.{ext}
 *     {organizerId}/{eventId}/gallery/{n}.{ext}
 *
 *   ticket-assets/        (PRIVATE)
 *     {organizerId}/{eventId}/{ticketId}/qr.png
 *     {organizerId}/{eventId}/{ticketId}/ticket.pdf
 *
 *   organizer-logos/
 *     {organizerId}/logo.{ext}
 *
 * POLICIES:
 *   event-images:    Public read, authenticated organizer write (own folder only)
 *   ticket-assets:   No public access. Signed URLs only (15 min TTL)
 *   organizer-logos: Public read, owner write
 */

import { supabase, TAError } from '../lib/supabase.js';
import { TA_CONFIG } from '../config.js';

const BUCKETS = TA_CONFIG.STORAGE_BUCKETS;

export const StorageService = {

    /**
     * Upload an event cover image. Returns the public URL.
     * @param {string} organizerId
     * @param {string} eventId
     * @param {File} file
     * @returns {Promise<string>} Public URL
     */
    async uploadEventCover(organizerId, eventId, file) {
        const ext = file.name.split('.').pop();
        const path = `${organizerId}/${eventId}/cover.${ext}`;
        const { error } = await supabase.storage
            .from(BUCKETS.EVENT_IMAGES)
            .upload(path, file, { upsert: true, contentType: file.type });
        if (error) throw new TAError(error.message, 'UPLOAD_FAILED', error);

        const { data } = supabase.storage.from(BUCKETS.EVENT_IMAGES).getPublicUrl(path);
        return data.publicUrl;
    },

    /**
     * Upload an organizer logo. Returns the public URL.
     * @param {string} organizerId
     * @param {File} file
     * @returns {Promise<string>} Public URL
     */
    async uploadOrganizerLogo(organizerId, file) {
        const ext = file.name.split('.').pop();
        const path = `${organizerId}/logo.${ext}`;
        const { error } = await supabase.storage
            .from(BUCKETS.ORGANIZER_LOGOS)
            .upload(path, file, { upsert: true, contentType: file.type });
        if (error) throw new TAError(error.message, 'UPLOAD_FAILED', error);

        const { data } = supabase.storage.from(BUCKETS.ORGANIZER_LOGOS).getPublicUrl(path);
        return data.publicUrl;
    },

    /**
     * Get a signed URL for a private ticket asset (QR image or PDF).
     * @param {string} path  Storage path within ticket-assets bucket
     * @param {number} expiresIn  Seconds (default 900 = 15 min)
     * @returns {Promise<string>} Signed URL
     */
    async getTicketAssetUrl(path, expiresIn = 900) {
        const { data, error } = await supabase.storage
            .from(BUCKETS.TICKET_ASSETS)
            .createSignedUrl(path, expiresIn);
        if (error) throw new TAError(error.message, 'SIGN_FAILED', error);
        return data.signedUrl;
    },

    /**
     * Delete an event's cover image (e.g., when republishing).
     * @param {string} organizerId
     * @param {string} eventId
     */
    async deleteEventCover(organizerId, eventId) {
        await supabase.storage
            .from(BUCKETS.EVENT_IMAGES)
            .remove([`${organizerId}/${eventId}/cover.*`]);
    },
};
