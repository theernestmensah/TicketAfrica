/**
 * AbontenTickets client-side email helpers.
 *
 * Email delivery is optional. Configure EmailJS values in env.js to enable it:
 * EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, and the relevant template IDs.
 */

const EMAILJS_CONFIG = {
    publicKey: window.ENV?.EMAILJS_PUBLIC_KEY || '',
    serviceId: window.ENV?.EMAILJS_SERVICE_ID || '',
    templates: {
        ticketConfirmation: window.ENV?.EMAILJS_TEMPLATE_TICKET || '',
        attendeeUpdate: window.ENV?.EMAILJS_TEMPLATE_UPDATE || '',
        eventReminder: window.ENV?.EMAILJS_TEMPLATE_REMIND || '',
        payoutConfirm: window.ENV?.EMAILJS_TEMPLATE_PAYOUT || '',
        welcomeUser: window.ENV?.EMAILJS_TEMPLATE_WELCOME_USER || '',
        welcomeOrganizer: window.ENV?.EMAILJS_TEMPLATE_WELCOME_ORG || '',
    }
};
const BRAND_NAME = 'AbontenTickets';

let _emailJsReady = false;
let _emailJsPromise = null;

function isEmailConfigured(templateId) {
    return Boolean(EMAILJS_CONFIG.publicKey && EMAILJS_CONFIG.serviceId && templateId);
}

function loadEmailJS() {
    if (_emailJsReady) return Promise.resolve();
    if (_emailJsPromise) return _emailJsPromise;
    if (!EMAILJS_CONFIG.publicKey) {
        return Promise.reject(new Error('Email delivery is not configured.'));
    }

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
        script.onerror = () => reject(new Error('EmailJS SDK failed to load.'));
        document.head.appendChild(script);
    });

    return _emailJsPromise;
}

async function sendEmail(templateId, params) {
    if (!isEmailConfigured(templateId)) {
        return {
            success: false,
            skipped: true,
            error: 'Email delivery is not configured.',
        };
    }

    try {
        await loadEmailJS();
        const result = await window.emailjs.send(
            EMAILJS_CONFIG.serviceId,
            templateId,
            params
        );
        return { success: true, status: result.status };
    } catch (err) {
        return { success: false, error: err?.text || err?.message || String(err) };
    }
}

window.TAMail = {
    sendTicketConfirmation: async function(order) {
        const ref = 'ABT-' + String(order._id || '').slice(-8).toUpperCase();
        const tickets = (order.items || [])
            .map(i => `${i.quantity} x ${i.tier_name || 'Ticket'}`)
            .join(', ');
        const totalGhc = 'GHS ' + ((order.total_amount || 0) / 100).toFixed(2);

        return sendEmail(EMAILJS_CONFIG.templates.ticketConfirmation, {
            to_email: order.buyer_email,
            to_name: order.buyer_name || 'Valued Customer',
            event_name: order.event_title || 'Your Event',
            event_date: order.event_date || '',
            event_venue: order.event_venue || '',
            tickets,
            total: totalGhc,
            order_ref: ref,
            wallet_link: window.location.origin + '/account.html',
            brand_name: BRAND_NAME,
        });
    },

    sendAttendeeUpdate: async function(opts) {
        return sendEmail(EMAILJS_CONFIG.templates.attendeeUpdate, {
            to_email: opts.to_email,
            to_name: opts.to_name || 'Attendee',
            event_name: opts.event_name || 'your upcoming event',
            subject: opts.subject,
            message: opts.message,
            org_name: opts.org_name || 'The Organizer',
            year: new Date().getFullYear(),
            brand_name: BRAND_NAME,
        });
    },

    sendEventReminder: async function(opts) {
        return sendEmail(EMAILJS_CONFIG.templates.eventReminder, {
            to_email: opts.to_email,
            to_name: opts.to_name || 'Attendee',
            event_name: opts.event_name,
            event_date: opts.event_date,
            event_venue: opts.event_venue || '',
            ticket_type: opts.ticket_type || 'General Admission',
            qr_link: opts.qr_link || (window.location.origin + '/account.html'),
            brand_name: BRAND_NAME,
        });
    },

    sendPayoutConfirmation: async function(opts) {
        return sendEmail(EMAILJS_CONFIG.templates.payoutConfirm, {
            to_email: opts.to_email,
            to_name: opts.to_name || 'Organizer',
            amount: opts.amount,
            method: opts.method === 'momo'
                ? 'Mobile Money'
                : opts.method === 'bank'
                    ? 'Bank Transfer'
                    : 'USSD',
            reference: opts.ref || '',
            eta: '2 business days',
            brand_name: BRAND_NAME,
        });
    },

    sendWelcomeUser: async function(opts) {
        return sendEmail(EMAILJS_CONFIG.templates.welcomeUser, {
            to_email: opts.to_email,
            to_name: opts.to_name || 'there',
            events_link: window.location.origin + '/events.html',
            account_link: window.location.origin + '/account.html',
            year: new Date().getFullYear(),
            brand_name: BRAND_NAME,
        });
    },

    sendWelcomeOrganizer: async function(opts) {
        return sendEmail(EMAILJS_CONFIG.templates.welcomeOrganizer, {
            to_email: opts.to_email,
            to_name: opts.to_name || 'there',
            org_name: opts.org_name || '',
            dashboard_link: window.location.origin + '/organizer-dashboard.html',
            year: new Date().getFullYear(),
            brand_name: BRAND_NAME,
        });
    },

    broadcastToAttendees: async function(attendees, messageOpts) {
        const results = [];
        for (let i = 0; i < attendees.length; i += 5) {
            const batch = attendees.slice(i, i + 5);
            const batchResults = await Promise.allSettled(
                batch.map(att => window.TAMail.sendAttendeeUpdate({
                    ...messageOpts,
                    to_email: att.email || att.buyer_email,
                    to_name: att.name || att.buyer_name || 'Attendee',
                }))
            );
            results.push(...batchResults);
            if (i + 5 < attendees.length) await new Promise(r => setTimeout(r, 500));
        }

        const sent = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
        const skipped = results.filter(r => r.status === 'fulfilled' && r.value?.skipped).length;
        return { sent, skipped, total: attendees.length };
    },
};
