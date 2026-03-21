/**
 * @file config.js
 * @description Configuration for Ticket Africa.
 *
 * ENVIRONMENT STRUCTURE:
 *   We support three environments:
 *   - local     → local Supabase instance via `supabase start`
 *   - staging   → Supabase staging project
 *   - production → Supabase production project + additional microservices
 *
 * ADDITIONAL BACKENDS (see services/ directory):
 *   Supabase is the primary backend for auth, database, storage, and realtime.
 *   You may plug in additional services by extending services/index.js:
 *   - Paystack / Flutterwave for payment processing
 *   - Africa's Talking for USSD + SMS
 *   - SendGrid / Brevo for email delivery
 *   - Cloudflare Workers for QR generation / fraud detection edge functions
 *   - Custom REST APIs (queue service, analytics engine, etc.)
 */

export const TA_CONFIG = {
    // ─── App ──────────────────────────────────────────────────────────────────
    APP_VERSION: '1.0.0',
    APP_ENV: 'development', // 'development' | 'staging' | 'production'
    APP_NAME: 'Ticket Africa',

    // ─── Supabase (Primary Backend) ───────────────────────────────────────────
    SUPABASE_URL: 'https://hnigxmplgkzfrjooyvzk.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhuaWd4bXBsZ2t6ZnJqb295dnprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDY2NTAsImV4cCI6MjA4ODM4MjY1MH0.urabrx2lAHeQw1BjATwKckJ_GcY00rWn5yFB3jeWKOE',

    // ─── Payment Gateways ─────────────────────────────────────────────────────
    // Paystack — used for GH₵ (Ghana), ₦ (Nigeria)
    PAYSTACK_PUBLIC_KEY: 'pk_test_YOUR_PAYSTACK_KEY',

    // Flutterwave — used for KSh (Kenya), R (South Africa), RWF (Rwanda)
    FLUTTERWAVE_PUBLIC_KEY: 'FLWPUBK_TEST-YOUR_FLUTTERWAVE_KEY',

    // ─── SMS / USSD ───────────────────────────────────────────────────────────
    // Africa's Talking — SMS delivery and USSD session handling
    AFRICASTALKING_API_KEY: 'YOUR_AFRICASTALKING_KEY',
    AFRICASTALKING_USERNAME: 'sandbox', // 'sandbox' or your AT username
    USSD_SHORT_CODE: '*123*88#',

    // ─── Email ────────────────────────────────────────────────────────────────
    // Email is sent via Supabase Edge Functions → SendGrid/Brevo
    // No client-side key needed — all email goes through server functions

    // ─── Storage ──────────────────────────────────────────────────────────────
    // Supabase Storage bucket names
    STORAGE_BUCKETS: {
        EVENT_IMAGES: 'event-images',
        TICKET_ASSETS: 'ticket-assets',
        ORGANIZER_LOGOS: 'organizer-logos',
    },

    // ─── Feature flags ────────────────────────────────────────────────────────
    FEATURES: {
        REALTIME_INVENTORY: true,   // Live ticket count updates via Supabase Realtime
        USSD_PURCHASING: true,   // USSD purchase flow (requires AT integration)
        RESALE_MARKET: false,  // Peer-to-peer ticket resale (coming soon)
        AGENT_NETWORK: false,  // Physical agent POS network (coming soon)
        SEATED_EVENTS: true,   // Reserved seating map support
        QUEUE_SYSTEM: true,   // Virtual queue for high-demand events
    },

    // ─── API Endpoints (non-Supabase microservices) ───────────────────────────
    // These route through Supabase Edge Functions by default.
    // Override with external URLs in production if you have standalone services.
    API: {
        QR_SERVICE: '/functions/v1/qr-generate',
        FRAUD_CHECK: '/functions/v1/fraud-check',
        TICKET_VALIDATE: '/functions/v1/ticket-validate',
        QUEUE_JOIN: '/functions/v1/queue-join',
        PAYOUT_REQUEST: '/functions/v1/payout-request',
        USSD_WEBHOOK: '/functions/v1/ussd-session',
        PAYMENT_VERIFY: '/functions/v1/payment-verify',
    },
};
