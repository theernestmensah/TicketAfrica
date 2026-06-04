import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

const messageType = v.union(
    v.literal("welcome_buyer"),
    v.literal("welcome_organizer"),
    v.literal("ticket_confirmation"),
    v.literal("event_reminder"),
    v.literal("attendee_update"),
    v.literal("newsletter"),
    v.literal("payout_update")
);

const channel = v.union(v.literal("email"), v.literal("sms"), v.literal("in_app"));

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

        return await ctx.db.insert("message_outbox", {
            ...args,
            status: "queued",
            attempts: 0,
            created_at: new Date().toISOString(),
        });
    },
});

export const markSent = mutation({
    args: { message_id: v.id("message_outbox") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.message_id, {
            status: "sent",
            sent_at: new Date().toISOString(),
        });
        return args.message_id;
    },
});

export const markFailed = mutation({
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

        const messages = await ctx.runQuery(api.messages.listQueued, { limit: args.limit || 25 });
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

                    await ctx.runMutation(api.messages.markSent, { message_id: message._id });
                    sent += 1;
                    continue;
                }

                if (message.channel !== "email") {
                    await ctx.runMutation(api.messages.markFailed, {
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

                await ctx.runMutation(api.messages.markSent, { message_id: message._id });
                sent += 1;
            } catch (error: any) {
                await ctx.runMutation(api.messages.markFailed, {
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
    handler: async (): Promise<{ configured: boolean; accepted: boolean; status?: number; detail: string }> => {
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

function renderHtmlMessage(message: any): string {
    const title = escapeHtml(message.subject);
    const body = escapeHtml(message.body).replace(/\n/g, "<br>");
    const eventTitle = escapeHtml(message.data?.event_title || "Your Ticket Africa event");
    const isAttendeeUpdate = message.type === "attendee_update";
    const recipientName = message.recipient_name
        ? `<p style="margin:0 0 16px;">Hi ${escapeHtml(message.recipient_name)},</p>`
        : "";
    const actionUrl = message.data.wallet_link || message.data.account_link || message.data.events_link;
    const action = actionUrl
        ? `<p style="margin:24px 0;"><a href="${escapeHtml(actionUrl)}" style="background:#111827;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;font-weight:700;">Open Ticket Africa</a></p>`
        : "";

    return `
<!doctype html>
<html>
  <body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;padding:0 18px 32px;">
      <div style="height:6px;background:#111827;margin-bottom:28px;"></div>
      <div style="text-align:center;font-size:24px;font-weight:800;color:#111827;margin-bottom:36px;">Ticket Africa</div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;padding:32px 28px;">
        <h1 style="font-size:26px;line-height:1.25;margin:0 0 28px;color:#111827;text-align:center;">${isAttendeeUpdate ? eventTitle : title}</h1>
        ${recipientName}
        ${isAttendeeUpdate ? `<p style="font-size:16px;line-height:1.6;margin:0 0 18px;color:#111827;font-weight:700;font-style:italic;">Important information about your event!</p>` : ""}
        ${isAttendeeUpdate ? `<h2 style="font-size:16px;line-height:1.4;margin:0 0 14px;color:#111827;">${title}</h2>` : ""}
        <p style="font-size:16px;line-height:1.65;margin:0;color:#374151;">${body}</p>
        ${action}
        <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:32px 0 0;border-top:1px solid #e5e7eb;padding-top:16px;">You are receiving this because you bought or registered for a Ticket Africa event.</p>
      </div>
    </div>
  </body>
</html>`;
}

export const listQueued = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("message_outbox")
            .withIndex("by_status", q => q.eq("status", "queued"))
            .take(args.limit || 50);
    },
});

export const listByRecipient = query({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("message_outbox")
            .withIndex("by_recipient_email", q => q.eq("recipient_email", args.email.trim().toLowerCase()))
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
                name: args.name,
                phone: args.phone,
                source: args.source,
                status: "subscribed",
                consented_at: new Date().toISOString(),
                unsubscribed_at: undefined,
            });
            return existing._id;
        }

        return await ctx.db.insert("newsletter_subscribers", {
            email,
            name: args.name,
            phone: args.phone,
            source: args.source,
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
                subject: args.subject,
                body: args.body,
                template_key: "newsletter",
                data: { source: subscriber.source },
                attempts: 0,
                created_at: now,
            }));
        }
        return { queued: ids.length };
    },
});
