/**
 * email-service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Ticket Africa — Client-side Email Service
 *
 * Uses EmailJS (https://www.emailjs.com) to send transactional emails without
 * a dedicated backend. Configure your EmailJS account below.
 *
 * Setup:
 *  1. Create a free EmailJS account at https://www.emailjs.com
 *  2. Add an email service (Gmail, Outlook, etc.)
 *  3. Create email templates (see template IDs below)
 *  4. Replace the placeholder IDs with your actual IDs
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── EmailJS Configuration ──────────────────────────────────────────────────
const EMAILJS_CONFIG = {
    publicKey:  window.ENV?.EMAILJS_PUBLIC_KEY  || 'YOUR_EMAILJS_PUBLIC_KEY',
    serviceId:  window.ENV?.EMAILJS_SERVICE_ID  || 'ticket_africa_service',
    templates: {
        ticketConfirmation: window.ENV?.EMAILJS_TEMPLATE_TICKET  || 'template_ticket_confirm',
        attendeeUpdate:     window.ENV?.EMAILJS_TEMPLATE_UPDATE  || 'template_attendee_update',
        eventReminder:      window.ENV?.EMAILJS_TEMPLATE_REMIND  || 'template_event_reminder',
        payoutConfirm:      window.ENV?.EMAILJS_TEMPLATE_PAYOUT  || 'template_payout_confirm',
        welcomeUser:        window.ENV?.EMAILJS_TEMPLATE_WELCOME_USER || 'template_welcome_user',
        welcomeOrganizer:   window.ENV?.EMAILJS_TEMPLATE_WELCOME_ORG  || 'template_welcome_organizer',
    }
};

// ── Load EmailJS SDK lazily ────────────────────────────────────────────────
let _emailJsReady = false;
let _emailJsPromise = null;

function loadEmailJS() {
    if (_emailJsReady) return Promise.resolve();
    if (_emailJsPromise) return _emailJsPromise;

    _emailJsPromise = new Promise((resolve, reject) => {
        if (window.emailjs) {
            window.emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
            _emailJsReady = true;
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
        script.onload = () => {
            try {
                window.emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
                _emailJsReady = true;
                resolve();
            } catch (e) {
                reject(e);
            }
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });

    return _emailJsPromise;
}

// ── Core send function ─────────────────────────────────────────────────────
async function sendEmail(templateId, params) {
    try {
        await loadEmailJS();
        const result = await window.emailjs.send(
            EMAILJS_CONFIG.serviceId,
            templateId,
            params
        );
        console.log('[TA Mail] Sent:', templateId, result.status);
        return { success: true, status: result.status };
    } catch (err) {
        console.warn('[TA Mail] Send failed (will retry via console log):', err);
        // Graceful degradation: log what would have been sent
        console.info('[TA Mail] Would send:', templateId, params);
        return { success: false, error: err?.text || err?.message || String(err) };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────
window.TAMail = {

    /**
     * Send a ticket purchase confirmation email to the buyer.
     * @param {Object} order - The completed order record
     * @param {string} order.buyer_email
     * @param {string} order.buyer_name
     * @param {string} order.event_title
     * @param {string} order.event_date
     * @param {string} order.event_venue
     * @param {Array}  order.items - e.g. [{tier_name, quantity}]
     * @param {number} order.total_amount - in pesewas (divide by 100 for GH₵)
     * @param {string} order._id - order reference
     */
    sendTicketConfirmation: async function(order) {
        const ref = 'TKA-' + String(order._id || '').slice(-8).toUpperCase();
        const tickets = (order.items || [])
            .map(i => `${i.quantity}× ${i.tier_name || 'Ticket'}`)
            .join(', ');
        const totalGhc = 'GH₵ ' + ((order.total_amount || 0) / 100).toFixed(2);

        return sendEmail(EMAILJS_CONFIG.templates.ticketConfirmation, {
            to_email:    order.buyer_email,
            to_name:     order.buyer_name || 'Valued Customer',
            event_name:  order.event_title || 'Your Event',
            event_date:  order.event_date  || '',
            event_venue: order.event_venue || '',
            tickets:     tickets,
            total:       totalGhc,
            order_ref:   ref,
            wallet_link: window.location.origin + '/account.html',
        });
    },

    /**
     * Send an attendee update / broadcast message from an organizer.
     * @param {Object} opts
     * @param {string} opts.to_email
     * @param {string} opts.to_name
     * @param {string} opts.event_name
     * @param {string} opts.subject
     * @param {string} opts.message
     * @param {string} opts.org_name
     */
    sendAttendeeUpdate: async function(opts) {
        return sendEmail(EMAILJS_CONFIG.templates.attendeeUpdate, {
            to_email:   opts.to_email,
            to_name:    opts.to_name    || 'Attendee',
            event_name: opts.event_name || 'your upcoming event',
            subject:    opts.subject,
            message:    opts.message,
            org_name:   opts.org_name   || 'The Organizer',
            year:       new Date().getFullYear(),
        });
    },

    /**
     * Send a 24-hour event reminder email.
     * @param {Object} opts
     * @param {string} opts.to_email
     * @param {string} opts.to_name
     * @param {string} opts.event_name
     * @param {string} opts.event_date
     * @param {string} opts.event_venue
     * @param {string} opts.ticket_type
     * @param {string} opts.qr_link - link to account wallet
     */
    sendEventReminder: async function(opts) {
        return sendEmail(EMAILJS_CONFIG.templates.eventReminder, {
            to_email:    opts.to_email,
            to_name:     opts.to_name     || 'Attendee',
            event_name:  opts.event_name,
            event_date:  opts.event_date,
            event_venue: opts.event_venue || '',
            ticket_type: opts.ticket_type || 'General Admission',
            qr_link:     opts.qr_link || (window.location.origin + '/account.html'),
        });
    },

    /**
     * Notify organizer that a payout request was received.
     * @param {Object} opts
     * @param {string} opts.to_email
     * @param {string} opts.to_name
     * @param {string} opts.amount   - formatted e.g. "GH₵ 500.00"
     * @param {string} opts.method   - "momo" | "bank" | "ussd"
     * @param {string} opts.ref      - payout reference
     */
    sendPayoutConfirmation: async function(opts) {
        return sendEmail(EMAILJS_CONFIG.templates.payoutConfirm, {
            to_email:   opts.to_email,
            to_name:    opts.to_name || 'Organizer',
            amount:     opts.amount,
            method:     opts.method === 'momo'  ? 'Mobile Money'
                      : opts.method === 'bank'  ? 'Bank Transfer' : 'USSD',
            reference:  opts.ref || '',
            eta:        '2 business days',
        });
    },

    /**
     * Send a welcome email to a newly registered attendee (buyer).
     * @param {Object} opts
     * @param {string} opts.to_email
     * @param {string} opts.to_name   - first name
     */
    sendWelcomeUser: async function(opts) {
        return sendEmail(EMAILJS_CONFIG.templates.welcomeUser, {
            to_email:   opts.to_email,
            to_name:    opts.to_name || 'there',
            events_link: window.location.origin + '/events.html',
            account_link: window.location.origin + '/account.html',
            year:       new Date().getFullYear(),
        });
    },

    /**
     * Send a welcome email to a newly registered organizer.
     * @param {Object} opts
     * @param {string} opts.to_email
     * @param {string} opts.to_name   - first name
     * @param {string} [opts.org_name]
     */
    sendWelcomeOrganizer: async function(opts) {
        return sendEmail(EMAILJS_CONFIG.templates.welcomeOrganizer, {
            to_email:    opts.to_email,
            to_name:     opts.to_name || 'there',
            org_name:    opts.org_name || '',
            dashboard_link: window.location.origin + '/organizer-dashboard.html',
            year:        new Date().getFullYear(),
        });
    },

    /**
     * Bulk send attendee update to all email addresses.
     * Used by the organizer "Attendee Updates" section.
     * @param {string[]} emails - array of {email, name} objects
     * @param {Object} messageOpts
     */
    broadcastToAttendees: async function(attendees, messageOpts) {
        const results = [];
        // Send in batches of 5 to avoid rate limits
        for (let i = 0; i < attendees.length; i += 5) {
            const batch = attendees.slice(i, i + 5);
            const batchResults = await Promise.allSettled(
                batch.map(att => window.TAMail.sendAttendeeUpdate({
                    ...messageOpts,
                    to_email: att.email || att.buyer_email,
                    to_name:  att.name  || att.buyer_name || 'Attendee',
                }))
            );
            results.push(...batchResults);
            // Small delay between batches
            if (i + 5 < attendees.length) await new Promise(r => setTimeout(r, 500));
        }
        const sent = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
        return { sent, total: attendees.length };
    },
};

console.log('[TicketAfrica] Email service loaded ✓ — configure EMAILJS keys in env.js to activate delivery');
