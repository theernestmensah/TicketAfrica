/**
 * @file services/scanner.js
 * @description Ticket gate scanner — validation and check-in service.
 *
 * VALIDATION FLOW:
 *   1. Scanner reads QR code → extracts signed JWT payload
 *   2. Calls validateTicket() → Edge Function verifies JWT signature
 *   3. Edge Function checks: not expired, not used, not transferred away
 *   4. On valid: marks ticket as used (atomic update with nonce rotation)
 *   5. Returns attendee info for display on scanner screen
 *
 * OFFLINE SUPPORT:
 *   When offline, scanner validates against a local cache of ticket tokens
 *   synced via syncCache() before the event. Cache TTL is 24 hours.
 *   Offline validations are queued → synced when connection restored.
 *
 * STAFF ACCESS:
 *   Scanner sessions require a scanner_token (short-lived, event-scoped).
 *   Issued by the organizer from the dashboard → staff need no main-account login.
 *
 * DATABASE TABLES:
 *   public.scan_events     → log of every scan attempt (audit trail)
 */

import { supabase, sb, TAError } from '../lib/supabase.js';
import { TA_CONFIG } from '../config.js';

const OFFLINE_CACHE_KEY = 'ta_ticket_cache';
const OFFLINE_QUEUE_KEY = 'ta_offline_scan_queue';

export const ScannerService = {

    /** @type {Map<string, { status: string, holder: string, tier: string }>} */
    _cache: new Map(),

    _offlineQueue: [],

    /**
     * Validate a ticket QR code.
     * Online: calls Edge Function for real-time validation.
     * Offline: validates against local cache and queues the check-in.
     *
     * @param {string} qrPayload  Raw string from QR scan
     * @param {{ eventId: string, gate?: string, scannerToken: string }} context
     * @returns {Promise<{
     *   result: 'valid'|'used'|'invalid'|'expired'|'wrong_event',
     *   ticketId?: string,
     *   holderName?: string,
     *   tierName?: string,
     *   seat?: string,
     *   usedAt?: string,
     *   message: string,
     * }>}
     */
    async validateTicket(qrPayload, { eventId, gate = 'Main', scannerToken }) {
        if (!navigator.onLine) {
            return this._validateOffline(qrPayload);
        }

        try {
            const res = await fetch(`${TA_CONFIG.SUPABASE_URL}${TA_CONFIG.API.TICKET_VALIDATE}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${scannerToken}`,
                },
                body: JSON.stringify({
                    qr_payload: qrPayload,
                    event_id: eventId,
                    gate,
                    scanned_at: new Date().toISOString(),
                }),
            });

            const json = await res.json().catch(() => ({}));

            // Log to scan_events regardless of outcome
            this._logScanEvent({ qrPayload, eventId, gate, result: json.result ?? 'error' });

            return json;
        } catch {
            // Network failed — fall back to offline cache
            return this._validateOffline(qrPayload);
        }
    },

    /**
     * Validate against the local offline cache.
     * @private
     */
    _validateOffline(qrPayload) {
        const cached = this._cache.get(qrPayload);
        if (!cached) {
            return { result: 'invalid', message: 'Ticket not in offline cache — sync required' };
        }
        if (cached.status === 'used') {
            return { result: 'used', holderName: cached.holder, tierName: cached.tier, message: 'Already scanned (offline record)' };
        }

        // Mark as used in local cache
        cached.status = 'used';
        this._cache.set(qrPayload, cached);
        this._saveCache();

        // Queue for sync
        this._offlineQueue.push({ qrPayload, scannedAt: new Date().toISOString() });
        this._saveQueue();

        return {
            result: 'valid',
            holderName: cached.holder,
            tierName: cached.tier,
            message: 'Valid (offline mode — will sync on reconnect)',
        };
    },

    /**
     * Sync the offline cache with Supabase before an event.
     * Call this when the device is online and the gate session starts.
     *
     * @param {{ eventId: string, scannerToken: string }} params
     * @returns {Promise<{ ticketsLoaded: number }>}
     */
    async syncCache({ eventId, scannerToken }) {
        const res = await fetch(
            `${TA_CONFIG.SUPABASE_URL}/functions/v1/scanner-cache?event_id=${eventId}`,
            { headers: { Authorization: `Bearer ${scannerToken}` } }
        );
        if (!res.ok) throw new TAError('Cache sync failed', 'SYNC_FAILED');

        const { tickets } = await res.json();
        this._cache.clear();
        tickets.forEach(t => {
            this._cache.set(t.qr_token, {
                status: t.status,
                holder: t.holder_name,
                tier: t.tier_name,
            });
        });
        this._saveCache();
        return { ticketsLoaded: tickets.length };
    },

    /**
     * Flush the offline scan queue to Supabase after reconnecting.
     * @param {string} scannerToken
     * @returns {Promise<{ synced: number, failed: number }>}
     */
    async flushOfflineQueue(scannerToken) {
        if (this._offlineQueue.length === 0) return { synced: 0, failed: 0 };

        const res = await fetch(`${TA_CONFIG.SUPABASE_URL}/functions/v1/scanner-sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${scannerToken}`,
            },
            body: JSON.stringify({ scans: this._offlineQueue }),
        });

        if (res.ok) {
            const result = await res.json();
            this._offlineQueue = [];
            this._saveQueue();
            return result;
        }

        throw new TAError('Queue flush failed', 'FLUSH_FAILED');
    },

    /**
     * Get the live scan stats for an event (used on the scanner panel).
     * @param {string} eventId
     * @returns {Promise<{ scanned: number, valid: number, rejected: number, remaining: number }>}
     */
    async getLiveStats(eventId) {
        const { data, error } = await supabase
            .rpc('event_scan_stats', { p_event_id: eventId });
        if (error) throw new TAError(error.message, error.code);
        return data?.[0] ?? { scanned: 0, valid: 0, rejected: 0, remaining: 0 };
    },

    /**
     * Get recent scan events for the log panel.
     * @param {string} eventId
     * @param {number} limit
     * @returns {Promise<import('../types.js').ScanEvent[]>}
     */
    async getScanLog(eventId, limit = 50) {
        return sb(
            supabase
                .from('scan_events')
                .select('id, result, gate, scanned_at, holder_name, tier_name')
                .eq('event_id', eventId)
                .order('scanned_at', { ascending: false })
                .limit(limit)
        );
    },

    /** @private Log a scan event (fire-and-forget) */
    _logScanEvent({ qrPayload: _, eventId, gate, result }) {
        supabase.from('scan_events').insert({
            event_id: eventId,
            gate,
            result,
            scanned_at: new Date().toISOString(),
        }).then();
    },

    _saveCache() {
        try {
            localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify([...this._cache.entries()]));
        } catch { }
    },

    _saveQueue() {
        try {
            localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this._offlineQueue));
        } catch { }
    },

    /** Load cache and queue from localStorage on startup. */
    loadPersistedState() {
        try {
            const cached = localStorage.getItem(OFFLINE_CACHE_KEY);
            if (cached) this._cache = new Map(JSON.parse(cached));
            const queue = localStorage.getItem(OFFLINE_QUEUE_KEY);
            if (queue) this._offlineQueue = JSON.parse(queue);
        } catch { }
    },
};

// Auto-load on module init
ScannerService.loadPersistedState();
