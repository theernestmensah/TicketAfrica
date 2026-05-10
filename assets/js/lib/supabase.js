/**
 * @file supabase.js
 * @description Supabase client singleton for Ticket Africa.
 *
 * SETUP:
 *   Replace the placeholder values in /assets/js/config.js with your
 *   Supabase project URL and anon key. Never commit your service_role key
 *   to client-side code — that lives only on your backend functions.
 *
 * ARCHITECTURE:
 *   All app code imports from services/, never directly from here.
 *   This file is the only place the Supabase SDK is referenced.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { TA_CONFIG } from '../config.js';

if (!TA_CONFIG.SUPABASE_URL || !TA_CONFIG.SUPABASE_ANON_KEY) {
    console.error(
        '[TicketAfrica] Supabase credentials missing. ' +
        'Copy assets/js/config.example.js → assets/js/config.js and fill in your project values.'
    );
}

/** @type {import('@supabase/supabase-js').SupabaseClient} */
export const supabase = createClient(
    TA_CONFIG.SUPABASE_URL,
    TA_CONFIG.SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
        realtime: {
            params: {
                eventsPerSecond: 10,
            },
        },
        global: {
            headers: {
                'x-app-name': 'ticket-africa-web',
                'x-app-version': TA_CONFIG.APP_VERSION,
            },
        },
    }
);

/**
 * Helper: unwrap a Supabase response, throwing a typed error on failure.
 * Usage: const data = await sb(supabase.from('events').select('*'));
 *
 * @template T
 * @param {Promise<{data: T|null, error: import('@supabase/supabase-js').PostgrestError|null}>} promise
 * @returns {Promise<T>}
 */
export async function sb(promise) {
    const { data, error } = await promise;
    if (error) throw new TAError(error.message, error.code, error);
    return data;
}

/**
 * Typed error class — gives service layer consistent error shapes.
 */
export class TAError extends Error {
    /** @param {string} message @param {string} code @param {unknown} cause */
    constructor(message, code = 'UNKNOWN', cause = null) {
        super(message);
        this.name = 'TAError';
        this.code = code;
        this.cause = cause;
    }
}
