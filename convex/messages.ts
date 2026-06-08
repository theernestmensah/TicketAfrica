import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { sanitizeText, sanitizeEmail, sanitizePhone, sanitizeHtml } from "./sanitize";

const messageType = v.union(
    v.literal("welcome_buyer"),
    v.literal("welcome_organizer"),
    v.literal("ticket_confirmation"),
    v.literal("event_created"),
    v.literal("ticket_scanned"),
    v.literal("event_reminder"),
    v.literal("attendee_update"),
    v.literal("newsletter"),
    v.literal("payout_update")
);

const channel = v.union(v.literal("email"), v.literal("sms"), v.literal("in_app"));

async function assertAdmin(ctx: any) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required.");
    const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q: any) => q.eq("clerk_id", identity.subject))
        .first();
    if (!user || user.role !== "admin") throw new Error("Admin access required.");
    return user;
}

export const getUserRoleByClerkId = internalQuery({
    args: { clerk_id: v.string() },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
            .first();
        return user?.role || null;
    },
});

async function assertAdminAction(ctx: any) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required.");
    const role = await ctx.runQuery(internal.messages.getUserRoleByClerkId, {
        clerk_id: identity.subject,
    });
    if (role !== "admin") throw new Error("Admin access required.");
}

export const enqueue = internalMutation({
    args: {
        type: messageType,
        channel,
        recipient_email: v.optional(v.string()),
        recipient_phone: v.optional(v.string()),
        recipient_name: v.optional(v.string()),
        user_id: v.optional(v.id("users")),
        org_id: v.optional(v.id("organizations")),
        event_id: v.optional(v.id("events")),
        order_id: v.optional(v.string()),
        subject: v.string(),
        body: v.string(),
        template_key: v.string(),
        data: v.any(),
        scheduled_for: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        if (args.channel === "email" && !args.recipient_email) {
            return null;
        }
        if (args.channel === "sms" && !args.recipient_phone) {
            return null;
        }

        const messageId = await ctx.db.insert("message_outbox", {
            ...args,
            status: "queued",
            attempts: 0,
            created_at: new Date().toISOString(),
        });
        await ctx.scheduler.runAfter(0, api.messages.deliverQueued, { limit: 25 });
        return messageId;
    },
});

export const markSent = internalMutation({
    args: { message_id: v.id("message_outbox") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.message_id, {
            status: "sent",
            sent_at: new Date().toISOString(),
        });
        return args.message_id;
    },
});

export const markFailed = internalMutation({
    args: { message_id: v.id("message_outbox"), error: v.string() },
    handler: async (ctx, args) => {
        const message = await ctx.db.get(args.message_id);
        await ctx.db.patch(args.message_id, {
            status: "failed",
            attempts: (message.attempts || 0) + 1,
            last_error: args.error,
        });
        return args.message_id;
    },
});

export const deliverQueued = action({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args): Promise<{ processed: number; sent: number; failed: number }> => {
        const brevoApiKey = process.env.BREVO_API_KEY;
        const senderEmail = process.env.BREVO_SENDER_EMAIL;
        const senderName = process.env.BREVO_SENDER_NAME || "Ticket Africa";
        const moolreSmsVasKey = process.env.MOOLRE_SMS_VAS_KEY;
        const moolreSmsSenderId = process.env.MOOLRE_SMS_SENDER_ID || "TicketAfrica";
        const moolreBaseUrl = process.env.MOOLRE_BASE_URL || "https://api.moolre.com";

        const messages = await ctx.runQuery(internal.messages.listQueued, { limit: args.limit || 25 });
        let sent = 0;
        let failed = 0;

        for (const message of messages) {
            try {
                if (message.channel === "sms") {
                    if (!moolreSmsVasKey) throw new Error("MOOLRE_SMS_VAS_KEY is not configured.");
                    if (!message.recipient_phone) throw new Error("SMS recipient phone is missing.");

                    const res = await fetch(`${moolreBaseUrl}/open/sms/send`, {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            "X-API-VASKEY": moolreSmsVasKey,
                        },
                        body: JSON.stringify({
                            type: 1,
                            senderid: moolreSmsSenderId,
                            messages: [{
                                recipient: normalizePhoneForMoolre(message.recipient_phone),
                                message: message.body.slice(0, 160),
                                ref: message._id,
                            }],
                        }),
                    });
                    const body = await res.json().catch(() => null);
                    if (!res.ok || String(body?.status) !== "1") {
                        throw new Error(body?.message || `Moolre SMS returned ${res.status}`);
                    }

                    await ctx.runMutation(internal.messages.markSent, { message_id: message._id });
                    sent += 1;
                    continue;
                }

                if (message.channel !== "email") {
                    await ctx.runMutation(internal.messages.markFailed, {
                        message_id: message._id,
                        error: `No delivery provider configured for ${message.channel}`,
                    });
                    failed += 1;
                    continue;
                }

                if (!brevoApiKey) throw new Error("BREVO_API_KEY is not configured.");
                if (!senderEmail) throw new Error("BREVO_SENDER_EMAIL is not configured.");

                const res = await fetch("https://api.brevo.com/v3/smtp/email", {
                    method: "POST",
                    headers: {
                        accept: "application/json",
                        "api-key": brevoApiKey,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        sender: {
                            name: senderName,
                            email: senderEmail,
                        },
                        to: [{
                            email: message.recipient_email,
                            name: message.recipient_name || undefined,
                        }],
                        subject: message.subject,
                        htmlContent: renderHtmlMessage(message),
                        textContent: message.body,
                        tags: ["ticket-africa", message.type],
                        params: message.data,
                    }),
                });

                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new Error(text || `Brevo returned ${res.status}`);
                }

                await ctx.runMutation(internal.messages.markSent, { message_id: message._id });
                sent += 1;
            } catch (error: any) {
                await ctx.runMutation(internal.messages.markFailed, {
                    message_id: message._id,
                    error: error.message || String(error),
                });
                failed += 1;
            }
        }

        return { processed: messages.length, sent, failed };
    },
});

export const checkBrevoConfig = action({
    args: {},
    handler: async (ctx): Promise<{ configured: boolean; accepted: boolean; status?: number; detail: string }> => {
        await assertAdminAction(ctx);
        const brevoApiKey = process.env.BREVO_API_KEY;
        const senderEmail = process.env.BREVO_SENDER_EMAIL;
        if (!brevoApiKey || !senderEmail) {
            return {
                configured: false,
                accepted: false,
                detail: "BREVO_API_KEY and BREVO_SENDER_EMAIL must both be configured.",
            };
        }

        const res = await fetch("https://api.brevo.com/v3/account", {
            headers: {
                accept: "application/json",
                "api-key": brevoApiKey,
            },
        });

        return {
            configured: true,
            accepted: res.ok,
            status: res.status,
            detail: res.ok ? "Brevo accepted the configured API key." : "Brevo rejected the configured API key.",
        };
    },
});

function normalizePhoneForMoolre(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("0")) return `233${digits.slice(1)}`;
    return digits;
}

function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatMoney(minorAmount: unknown, currency: unknown): string {
    const amount = Number(minorAmount || 0) / 100;
    return `${escapeHtml(currency || "GHS")} ${amount.toLocaleString("en-GH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function formatDate(value: unknown): string {
    if (!value) return "";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

function messageContent(message: any) {
    const data = message.data || {};
    const eventTitle = escapeHtml(data.event_title || "your event");
    const eventDate = formatDate(data.event_date);
    const eventVenue = escapeHtml(data.event_venue || "");
    const ticketNumber = escapeHtml(data.ticket_number || "");
    const scannedAt = formatDate(data.scanned_at);

    switch (message.type) {
        case "welcome_organizer":
            return {
                heading: "Your organizer account is ready",
                intro: "You can now create your first real event, add ticket tiers, and prepare your launch.",
                details: [
                    "Start with the event name, date, venue, and description.",
                    "Add ticket tiers before publishing.",
                    "Use the scanner on event day to verify QR tickets.",
                ],
                actionLabel: "Open Organizer Dashboard",
                actionUrl: data.account_link || "/organizer-dashboard.html",
                footer: "You are receiving this because you created a Ticket Africa organizer account.",
            };
        case "welcome_buyer":
            return {
                heading: "Your Ticket Africa account is ready",
                intro: "When organizers publish events, you can discover them, pay locally, and receive secure QR-code tickets.",
                details: [
                    "Browse events when they go live.",
                    "Keep purchased tickets in your wallet.",
                    "Show your QR code at the gate for verification.",
                ],
                actionLabel: "Browse Events",
                actionUrl: data.events_link || "/events.html",
                footer: "You are receiving this because you created a Ticket Africa attendee account.",
            };
        case "ticket_confirmation":
            return {
                heading: `Your tickets for ${eventTitle}`,
                intro: "Your order is confirmed. Your QR tickets are now available in your Ticket Africa wallet.",
                details: [
                    eventDate ? `Event date: ${eventDate}` : "",
                    eventVenue ? `Venue: ${eventVenue}` : "",
                    `Total paid: ${formatMoney(data.total_amount, data.currency)}`,
                ].filter(Boolean),
                actionLabel: "Open My Tickets",
                actionUrl: data.wallet_link || "/account.html",
                footer: "You are receiving this because you bought a Ticket Africa event ticket.",
            };
        case "event_created":
            return {
                heading: "Event draft created",
                intro: `${eventTitle} has been created as a draft. Add ticket tiers and review the details before publishing.`,
                details: [
                    eventDate ? `Event date: ${eventDate}` : "",
                    eventVenue ? `Venue: ${eventVenue}` : "",
                    "Status: Draft",
                ].filter(Boolean),
                actionLabel: "Manage Event",
                actionUrl: data.dashboard_link || "/organizer-dashboard.html",
                footer: "You are receiving this because you created an event on Ticket Africa.",
            };
        case "ticket_scanned":
            return {
                heading: "Your ticket was scanned",
                intro: `Your ticket for ${eventTitle} was successfully scanned at entry.`,
                details: [
                    ticketNumber ? `Ticket: ${ticketNumber}` : "",
                    scannedAt ? `Scanned at: ${scannedAt}` : "",
                    data.gate ? `Gate: ${escapeHtml(data.gate)}` : "",
                ].filter(Boolean),
                actionLabel: "Open My Tickets",
                actionUrl: data.wallet_link || "/account.html",
                footer: "You are receiving this because a Ticket Africa QR ticket assigned to you was scanned.",
            };
        case "attendee_update":
            return {
                heading: eventTitle,
                intro: escapeHtml(message.subject),
                details: [escapeHtml(message.body)],
                actionLabel: "Open Ticket Africa",
                actionUrl: data.account_link || data.events_link || "/account.html",
                footer: "You are receiving this because you bought or registered for this event.",
            };
        default:
            return {
                heading: escapeHtml(message.subject),
                intro: escapeHtml(message.body),
                details: [],
                actionLabel: "Open Ticket Africa",
                actionUrl: data.wallet_link || data.account_link || data.events_link,
                footer: "You are receiving this because you use Ticket Africa.",
            };
    }
}

function renderHtmlMessage(message: any): string {
    const content = messageContent(message);
    const recipientName = message.recipient_name ? `Hi ${escapeHtml(message.recipient_name)},` : "Hi,";
    const details = content.details.length
        ? `<div style="margin:22px 0;border:1px solid #e5e7eb;background:#f9fafb;padding:16px 18px;">
            ${content.details.map((detail: string) => `<p style="font-size:14px;line-height:1.55;color:#374151;margin:0 0 8px;">${detail}</p>`).join("")}
          </div>`
        : "";
    const action = content.actionUrl
        ? `<p style="margin:24px 0;"><a href="${escapeHtml(content.actionUrl)}" style="background:#111827;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;font-weight:700;">${escapeHtml(content.actionLabel)}</a></p>`
        : "";

    return `
<!doctype html>
<html>
  <body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;padding:0 18px 32px;">
      <div style="height:6px;background:#111827;margin-bottom:28px;"></div>
      <div style="text-align:center;font-size:24px;font-weight:800;color:#111827;margin-bottom:36px;">Ticket Africa</div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;padding:32px 28px;">
        <h1 style="font-size:26px;line-height:1.25;margin:0 0 28px;color:#111827;text-align:center;">${content.heading}</h1>
        <p style="margin:0 0 16px;">${recipientName}</p>
        <p style="font-size:16px;line-height:1.65;margin:0;color:#374151;">${content.intro}</p>
        ${details}
        ${action}
        <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:32px 0 0;border-top:1px solid #e5e7eb;padding-top:16px;">${escapeHtml(content.footer)}</p>
      </div>
    </div>
  </body>
</html>`;
}

export const listQueued = internalQuery({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("message_outbox")
            .withIndex("by_status_created", q => q.eq("status", "queued"))
            .take(args.limit || 50);
    },
});

export const listByRecipient = query({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Authentication required.");
        const requestedEmail = args.email.trim().toLowerCase();
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q: any) => q.eq("clerk_id", identity.subject))
            .first();
        const identityEmail = String((identity as any).email || "").trim().toLowerCase();
        const userEmail = String(user?.email || "").trim().toLowerCase();
        if (requestedEmail !== identityEmail && requestedEmail !== userEmail && user?.role !== "admin") {
            throw new Error("You can only read your own messages.");
        }
        return await ctx.db
            .query("message_outbox")
            .withIndex("by_recipient_email", q => q.eq("recipient_email", requestedEmail))
            .order("desc")
            .collect();
    },
});

export const subscribeNewsletter = mutation({
    args: {
        email: v.string(),
        name: v.optional(v.string()),
        phone: v.optional(v.string()),
        source: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const email = args.email.trim().toLowerCase();
        const existing = await ctx.db
            .query("newsletter_subscribers")
            .withIndex("by_email", q => q.eq("email", email))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                name: args.name !== undefined ? sanitizeText(args.name) : undefined,
                phone: args.phone !== undefined ? sanitizePhone(args.phone) : undefined,
                source: args.source !== undefined ? sanitizeText(args.source) : undefined,
                status: "subscribed",
                consented_at: new Date().toISOString(),
                unsubscribed_at: undefined,
            });
            return existing._id;
        }

        return await ctx.db.insert("newsletter_subscribers", {
            email,
            name: args.name !== undefined ? sanitizeText(args.name) : undefined,
            phone: args.phone !== undefined ? sanitizePhone(args.phone) : undefined,
            source: args.source !== undefined ? sanitizeText(args.source) : undefined,
            status: "subscribed",
            consented_at: new Date().toISOString(),
        });
    },
});

export const enqueueNewsletter = mutation({
    args: {
        subject: v.string(),
        body: v.string(),
    },
    handler: async (ctx, args) => {
        await assertAdmin(ctx);
        const subscribers = await ctx.db
            .query("newsletter_subscribers")
            .withIndex("by_status", q => q.eq("status", "subscribed"))
            .collect();

        const now = new Date().toISOString();
        const ids = [];
        for (const subscriber of subscribers) {
            ids.push(await ctx.db.insert("message_outbox", {
                type: "newsletter",
                channel: "email",
                status: "queued",
                recipient_email: subscriber.email,
                recipient_phone: subscriber.phone,
                recipient_name: subscriber.name,
                subject: sanitizeText(args.subject),
                body: sanitizeHtml(args.body),
                template_key: "newsletter",
                data: { source: subscriber.source },
                attempts: 0,
                created_at: now,
            }));
        }
        if (ids.length > 0) {
            await ctx.scheduler.runAfter(0, api.messages.deliverQueued, { limit: 25 });
        }
        return { queued: ids.length };
    },
});
