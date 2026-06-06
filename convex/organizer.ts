import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";

async function getCurrentUser(ctx: any) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required.");

    const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q: any) => q.eq("clerk_id", identity.subject))
        .first();
    if (!user) throw new Error("User profile not found.");
    return user;
}

async function assertOrgAccess(ctx: any, orgId: any) {
    const user = await getCurrentUser(ctx);
    if (user.role === "admin") return;

    const org = await ctx.db.get(orgId);
    if (!org || org.owner_id !== user._id) {
        throw new Error("You do not have access to this organization.");
    }
}

async function assertEventOrgAccess(ctx: any, eventId: any) {
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found.");
    await assertOrgAccess(ctx, event.org_id);
    return event;
}

function scanResponse(
    status: "valid" | "used" | "invalid",
    message: string,
    details: {
        owner?: any;
        tier?: any;
        event?: any;
        ticket?: any;
        scannedAt?: string;
    } = {}
) {
    return {
        status,
        message,
        owner_name: details.owner ? `${details.owner.first_name} ${details.owner.last_name}` : "Guest",
        tier_name: details.tier?.name || "General Admission",
        ticket_number: details.ticket?.ticket_number || details.ticket?.qr_code,
        event_title: details.event?.title || "Unknown Event",
        scanned_at: details.scannedAt ?? details.ticket?.scanned_at,
    };
}

function signedLedgerAmount(entry: any) {
    return entry.direction === "credit" ? entry.amount : -entry.amount;
}

function toMajorAmount(minorAmount: number) {
    return (minorAmount / 100).toFixed(2);
}

function moolreChannelForPayout(method: string, provider?: string) {
    const normalized = (provider || "").toLowerCase();
    if (method === "bank") return "2";
    if (normalized.includes("telecel") || normalized.includes("vodafone")) return "6";
    if (normalized.includes("airtel") || normalized.includes("tigo") || normalized === "at") return "7";
    return "1";
}

async function getOrganizerBalance(ctx: any, orgId: any) {
    const entries = await ctx.db
        .query("ledger_entries")
        .withIndex("by_org_account", (q: any) => q.eq("org_id", orgId).eq("account", "organizer"))
        .collect();

    const pendingPayouts = await ctx.db
        .query("payouts")
        .withIndex("by_org", (q: any) => q.eq("org_id", orgId))
        .collect();

    const ledgerNet = entries.reduce((sum: number, entry: any) => sum + signedLedgerAmount(entry), 0);
    const reserved = pendingPayouts
        .filter((p: any) => p.status === "pending" || p.status === "processing")
        .reduce((sum: number, p: any) => sum + (p.gross_amount || p.amount || 0), 0);

    return {
        ledger_net: ledgerNet,
        reserved,
        available: Math.max(0, ledgerNet),
        currency: entries[0]?.currency || "GHS",
    };
}

async function logScanEvent(ctx: any, args: {
    eventId: any;
    ticketId?: any;
    scannerId?: any;
    gate?: string;
    source?: "camera" | "manual" | "unknown";
    submittedCode: string;
    result: "valid" | "used" | "invalid" | "wrong_event" | "refunded";
    message: string;
    scannedAt: string;
}) {
    await ctx.db.insert("scan_events", {
        event_id: args.eventId,
        ticket_id: args.ticketId,
        scanner_id: args.scannerId,
        gate: args.gate?.trim() || undefined,
        source: args.source || "unknown",
        submitted_code: args.submittedCode.slice(0, 160),
        result: args.result,
        message: args.message,
        scanned_at: args.scannedAt,
    });
}

async function findTicketByCode(ctx: any, code: string) {
    const normalized = code.trim();
    if (!normalized) return null;

    const byScanToken = await ctx.db
        .query("tickets")
        .withIndex("by_scan_token", (q: any) => q.eq("scan_token", normalized))
        .first();
    if (byScanToken) return byScanToken;

    const byQr = await ctx.db
        .query("tickets")
        .withIndex("by_qr", (q: any) => q.eq("qr_code", normalized))
        .first();
    if (byQr) return byQr;

    return await ctx.db
        .query("tickets")
        .withIndex("by_ticket_number", (q: any) => q.eq("ticket_number", normalized.toUpperCase()))
        .first();
}

// â”€â”€ Orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const listOrdersByOrg = query({
    args: { org_id: v.id("organizations"), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        const limit = Math.min(Math.max(args.limit || 200, 1), 500);
        const orders = await ctx.db
            .query("orders")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .order("desc")
            .take(limit);

        // Enrich with event title
        const enriched = await Promise.all(orders.map(async (o) => {
            const event = await ctx.db.get(o.event_id);
            return { ...o, event_title: event.title ?? "Unknown Event", event_city: event.location.city };
        }));
        return enriched;
    },
});

export const listOrdersByEvent = query({
    args: { event_id: v.id("events"), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        await assertEventOrgAccess(ctx, args.event_id);
        return await ctx.db
            .query("orders")
            .withIndex("by_event", (q) => q.eq("event_id", args.event_id))
            .order("desc")
            .take(Math.min(Math.max(args.limit || 200, 1), 500));
    },
});

export const createOrder = mutation({
    args: {
        event_id: v.id("events"),
        org_id: v.optional(v.id("organizations")),
        buyer_name: v.string(),
        buyer_email: v.string(),
        buyer_phone: v.optional(v.string()),
        items: v.array(v.object({
            tier_id: v.string(),
            tier_name: v.string(),
            quantity: v.number(),
            unit_price: v.number(),
        })),
        total_amount: v.number(),
        currency: v.string(),
        payment_method: v.optional(v.string()),
        promo_code: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Auto-resolve org_id from event if not provided
        let orgId = args.org_id;
        if (!orgId) {
            const event = await ctx.db.get(args.event_id);
            if (!event) throw new Error("Event not found");
            orgId = event.org_id;
        }
        await assertOrgAccess(ctx, orgId);
        const { org_id: _, ...rest } = args;
        return await ctx.db.insert("orders", {
            ...rest,
            org_id: orgId,
            status: "paid",
            created_at: new Date().toISOString(),
        });
    },
});


// â”€â”€ Promo Codes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const listPromosByOrg = query({
    args: { org_id: v.id("organizations") },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        const promos = await ctx.db
            .query("promo_codes")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .order("desc")
            .collect();

        const enriched = await Promise.all(promos.map(async (p) => {
            const event = p.event_id ? await ctx.db.get(p.event_id) : null;
            return { ...p, event_title: event.title ?? "All Events" };
        }));
        return enriched;
    },
});

export const createPromoCode = mutation({
    args: {
        org_id: v.id("organizations"),
        event_id: v.optional(v.id("events")),
        code: v.string(),
        description: v.optional(v.string()),
        discount_type: v.union(v.literal("percent"), v.literal("fixed")),
        discount_value: v.number(),
        max_uses: v.optional(v.number()),
        expires_at: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        // Check code isn't already taken
        const existing = await ctx.db
            .query("promo_codes")
            .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
            .first();
        if (existing) throw new Error("Code already exists. Choose a different code.");

        return await ctx.db.insert("promo_codes", {
            ...args,
            code: args.code.toUpperCase(),
            uses: 0,
            active: true,
            created_at: new Date().toISOString(),
        });
    },
});

export const deactivatePromoCode = mutation({
    args: { promo_id: v.id("promo_codes") },
    handler: async (ctx, args) => {
        const promo = await ctx.db.get(args.promo_id);
        if (!promo) throw new Error("Promo code not found.");
        await assertOrgAccess(ctx, promo.org_id);
        await ctx.db.patch(args.promo_id, { active: false });
        return args.promo_id;
    },
});

export const deletePromoCode = mutation({
    args: { promo_id: v.id("promo_codes") },
    handler: async (ctx, args) => {
        const promo = await ctx.db.get(args.promo_id);
        if (!promo) throw new Error("Promo code not found.");
        await assertOrgAccess(ctx, promo.org_id);
        await ctx.db.delete(args.promo_id);
        return args.promo_id;
    },
});

// â”€â”€ Staff Members â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const listStaffByOrg = query({
    args: { org_id: v.id("organizations") },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        const staff = await ctx.db
            .query("staff_members")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .collect();

        const enriched = await Promise.all(staff.map(async (s) => {
            const event = s.event_id ? await ctx.db.get(s.event_id) : null;
            return { ...s, event_title: event.title ?? "All Events" };
        }));
        return enriched;
    },
});

export const inviteStaff = mutation({
    args: {
        org_id: v.id("organizations"),
        event_id: v.optional(v.id("events")),
        invited_email: v.string(),
        name: v.string(),
        role: v.union(v.literal("scanner"), v.literal("co_organizer"), v.literal("support")),
    },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        return await ctx.db.insert("staff_members", {
            ...args,
            status: "pending",
            invited_at: new Date().toISOString(),
        });
    },
});

export const revokeStaff = mutation({
    args: { staff_id: v.id("staff_members") },
    handler: async (ctx, args) => {
        const staff = await ctx.db.get(args.staff_id);
        if (!staff) throw new Error("Staff member not found.");
        await assertOrgAccess(ctx, staff.org_id);
        await ctx.db.patch(args.staff_id, { status: "revoked" });
        return args.staff_id;
    },
});

export const removeStaff = mutation({
    args: { staff_id: v.id("staff_members") },
    handler: async (ctx, args) => {
        const staff = await ctx.db.get(args.staff_id);
        if (!staff) throw new Error("Staff member not found.");
        await assertOrgAccess(ctx, staff.org_id);
        await ctx.db.delete(args.staff_id);
        return args.staff_id;
    },
});

// â”€â”€ Payouts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const listPayoutsByOrg = query({
    args: { org_id: v.id("organizations") },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        return await ctx.db
            .query("payouts")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .order("desc")
            .collect();
    },
});

export const getPayoutBalance = query({
    args: { org_id: v.id("organizations") },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        return await getOrganizerBalance(ctx, args.org_id);
    },
});

export const listLedgerByOrg = query({
    args: { org_id: v.id("organizations"), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        return await ctx.db
            .query("ledger_entries")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .order("desc")
            .take(args.limit || 50);
    },
});

export const requestPayout = mutation({
    args: {
        org_id: v.id("organizations"),
        amount: v.number(),
        currency: v.string(),
        method: v.union(v.literal("momo"), v.literal("bank"), v.literal("ussd")),
        account_details: v.object({
            provider: v.optional(v.string()),
            number: v.string(),
            name: v.string(),
        }),
    },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        const balance = await getOrganizerBalance(ctx, args.org_id);
        const payoutFee = Number(process.env.MOOLRE_PAYOUT_FEE_MINOR || 0);
        const grossAmount = args.amount + payoutFee;
        if (args.amount < 100) throw new Error("Payout amount is too small.");
        if (grossAmount > balance.available) {
            throw new Error("Payout amount exceeds your available balance after fees.");
        }

        const ref = "TA-PAY-" + Date.now().toString(36).toUpperCase();
        const payoutId = await ctx.db.insert("payouts", {
            ...args,
            gross_amount: grossAmount,
            payout_fee: payoutFee,
            status: "pending",
            reference: ref,
            requested_at: new Date().toISOString(),
        });

        const ledgerBase = {
            org_id: args.org_id,
            payout_id: payoutId,
            currency: args.currency,
            reference: ref,
            created_at: new Date().toISOString(),
        };
        await ctx.db.insert("ledger_entries", {
            ...ledgerBase,
            type: "payout_reserve",
            account: "organizer",
            direction: "debit",
            amount: args.amount,
            description: "Organizer payout reserved",
        });
        if (payoutFee > 0) {
            await ctx.db.insert("ledger_entries", {
                ...ledgerBase,
                type: "payout_fee",
                account: "organizer",
                direction: "debit",
                amount: payoutFee,
                description: "Moolre payout fee deducted from organizer balance",
            });
        }

        if (process.env.MOOLRE_AUTO_PROCESS_PAYOUTS === "true") {
            await ctx.scheduler.runAfter(0, api.organizer.processMoolrePayout, {
                payout_id: payoutId,
            });
        }

        return payoutId;
    },
});

// â”€â”€ Attendee Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const getPayoutForProcessing = internalQuery({
    args: { payout_id: v.id("payouts") },
    handler: async (ctx, args) => {
        const payout = await ctx.db.get(args.payout_id);
        if (!payout) throw new Error("Payout not found.");
        return payout;
    },
});

export const markPayoutProcessing = internalMutation({
    args: { payout_id: v.id("payouts"), reference: v.string() },
    handler: async (ctx, args) => {
        const payout = await ctx.db.get(args.payout_id);
        if (!payout) throw new Error("Payout not found.");
        await ctx.db.patch(args.payout_id, {
            status: "processing",
            reference: args.reference,
        });
        return { success: true };
    },
});

export const markPayoutCompleted = internalMutation({
    args: {
        payout_id: v.id("payouts"),
        reference: v.string(),
    },
    handler: async (ctx, args) => {
        const payout = await ctx.db.get(args.payout_id);
        if (!payout) throw new Error("Payout not found.");
        await ctx.db.patch(args.payout_id, {
            status: "completed",
            reference: args.reference,
            processed_at: new Date().toISOString(),
        });
        return { success: true };
    },
});

export const markPayoutFailed = internalMutation({
    args: {
        payout_id: v.id("payouts"),
        reference: v.string(),
    },
    handler: async (ctx, args) => {
        const payout = await ctx.db.get(args.payout_id);
        if (!payout) throw new Error("Payout not found.");
        await ctx.db.patch(args.payout_id, {
            status: "failed",
            reference: args.reference,
            processed_at: new Date().toISOString(),
        });
        const ledgerBase = {
            org_id: payout.org_id,
            payout_id: args.payout_id,
            currency: payout.currency,
            reference: args.reference,
            created_at: new Date().toISOString(),
        };
        await ctx.db.insert("ledger_entries", {
            ...ledgerBase,
            type: "payout_reserve",
            account: "organizer",
            direction: "credit",
            amount: payout.amount,
            description: "Failed payout reserve released",
        });
        if ((payout.payout_fee || 0) > 0) {
            await ctx.db.insert("ledger_entries", {
                ...ledgerBase,
                type: "payout_fee",
                account: "organizer",
                direction: "credit",
                amount: payout.payout_fee,
                description: "Failed payout fee released",
            });
        }
        return { success: true };
    },
});

export const processMoolrePayout = action({
    args: { payout_id: v.id("payouts") },
    handler: async (ctx, args): Promise<{ success: boolean; reference: string; message: string }> => {
        const apiUser = process.env.MOOLRE_API_USER;
        const apiKey = process.env.MOOLRE_API_KEY;
        const accountNumber = process.env.MOOLRE_ACCOUNT_NUMBER;
        const baseUrl = process.env.MOOLRE_BASE_URL || "https://api.moolre.com";
        if (!apiUser) throw new Error("MOOLRE_API_USER is not configured.");
        if (!apiKey) throw new Error("MOOLRE_API_KEY is not configured.");
        if (!accountNumber) throw new Error("MOOLRE_ACCOUNT_NUMBER is not configured.");

        const payout = await ctx.runQuery(internal.organizer.getPayoutForProcessing, {
            payout_id: args.payout_id,
        });
        if (payout.status !== "pending") {
            return {
                success: payout.status === "completed",
                reference: payout.reference || "",
                message: `Payout is already ${payout.status}.`,
            };
        }

        const reference = payout.reference || `TA-PAY-${Date.now().toString(36).toUpperCase()}`;
        await ctx.runMutation(internal.organizer.markPayoutProcessing, {
            payout_id: args.payout_id,
            reference,
        });

        const res = await fetch(`${baseUrl}/open/transact/transfer`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "X-API-USER": apiUser,
                "X-API-KEY": apiKey,
            },
            body: JSON.stringify({
                type: 1,
                channel: moolreChannelForPayout(payout.method, payout.account_details.provider),
                currency: payout.currency,
                amount: toMajorAmount(payout.amount),
                receiver: payout.account_details.number,
                sublistid: payout.method === "bank" ? payout.account_details.provider : undefined,
                externalref: reference,
                reference: `Ticket Africa payout ${reference}`,
                accountnumber: accountNumber,
            }),
        });
        const body = await res.json().catch(() => null);
        const successful = res.ok && String(body?.status) === "1";
        if (!successful) {
            await ctx.runMutation(internal.organizer.markPayoutFailed, {
                payout_id: args.payout_id,
                reference,
            });
            throw new Error(body?.message || `Moolre transfer failed with ${res.status}`);
        }

        await ctx.runMutation(internal.organizer.markPayoutCompleted, {
            payout_id: args.payout_id,
            reference,
        });

        return {
            success: true,
            reference,
            message: Array.isArray(body?.message) ? body.message.join(" ") : body?.message || "Payout sent.",
        };
    },
});

export const listMessagesByOrg = query({
    args: { org_id: v.id("organizations"), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        const messages = await ctx.db
            .query("attendee_messages")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .order("desc")
            .take(Math.min(Math.max(args.limit || 100, 1), 300));

        const enriched = await Promise.all(messages.map(async (m) => {
            const event = m.event_id ? await ctx.db.get(m.event_id) : null;
            return { ...m, event_title: event.title ?? "All Events" };
        }));
        return enriched;
    },
});

export const sendAttendeeMessage = mutation({
    args: {
        org_id: v.id("organizations"),
        event_id: v.optional(v.id("events")),
        subject: v.string(),
        body: v.string(),
        channel: v.union(v.literal("email"), v.literal("sms"), v.literal("both")),
        sent_to: v.number(),
    },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        const orders = args.event_id
            ? await ctx.db
                .query("orders")
                .withIndex("by_event", q => q.eq("event_id", args.event_id!))
                .collect()
            : await ctx.db
                .query("orders")
                .withIndex("by_org", q => q.eq("org_id", args.org_id))
                .collect();

        const paidRecipients = new Map<string, typeof orders[number]>();
        for (const order of orders.filter(o => o.status === "paid")) {
            paidRecipients.set(order.buyer_email.trim().toLowerCase(), order);
        }

        const messageId = await ctx.db.insert("attendee_messages", {
            ...args,
            sent_to: paidRecipients.size,
            status: "sent",
            sent_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
        });

        const event = args.event_id ? await ctx.db.get(args.event_id) : null;
        for (const order of paidRecipients.values()) {
            await ctx.runMutation(internal.messages.enqueue, {
                type: "attendee_update",
                channel: args.channel === "sms" ? "sms" : "email",
                recipient_email: order.buyer_email.trim().toLowerCase(),
                recipient_phone: order.buyer_phone,
                recipient_name: order.buyer_name,
                org_id: args.org_id,
                event_id: args.event_id,
                order_id: order._id.toString(),
                subject: args.subject,
                body: args.body,
                template_key: "attendee_update",
                data: {
                    attendee_message_id: messageId.toString(),
                    event_title: event?.title || "your event",
                    channel: args.channel,
                },
            });
        }

        if (paidRecipients.size > 0) {
            await ctx.scheduler.runAfter(0, api.messages.deliverQueued, { limit: 25 });
        }

        return {
            message_id: messageId,
            sent_to: paidRecipients.size,
            queued_email: args.channel === "email" || args.channel === "both" ? paidRecipients.size : 0,
            queued_sms: args.channel === "sms" ? paidRecipients.size : 0,
        };
    },
});

// â”€â”€ Analytics query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const getOrgAnalytics = query({
    args: { org_id: v.id("organizations") },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        const events = await ctx.db
            .query("events")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .collect();

        const orders = await ctx.db
            .query("orders")
            .withIndex("by_org_status", (q) => q.eq("org_id", args.org_id).eq("status", "paid"))
            .collect();

        const totalRevenue = orders
            .reduce((s, o) => s + o.total_amount, 0);

        const totalOrders = orders.length;
        const totalTickets = orders
            .reduce((s, o) => s + o.items.reduce((is, i) => is + i.quantity, 0), 0);

        // Revenue per event
        const revenueByEvent: Record<string, { title: string; revenue: number; orders: number }> = {};
        for (const ev of events) {
            revenueByEvent[ev._id] = { title: ev.title, revenue: 0, orders: 0 };
        }
        for (const o of orders) {
            if (revenueByEvent[o.event_id]) {
                revenueByEvent[o.event_id].revenue += o.total_amount;
                revenueByEvent[o.event_id].orders += 1;
            }
        }

        // Last 7 days: daily revenue
        type DailyEntry = { date: string; revenue: number; orders: number };
        const dailyMap: Record<string, DailyEntry> = {};
        const now = Date.now();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now - i * 86400000);
            const key = d.toISOString().split("T")[0];
            dailyMap[key] = { date: key, revenue: 0, orders: 0 };
        }
        for (const o of orders) {
            const key = o.created_at.split("T")[0];
            if (dailyMap[key]) {
                dailyMap[key].revenue += o.total_amount;
                dailyMap[key].orders += 1;
            }
        }

        return {
            totalRevenue,
            totalOrders,
            totalTickets,
            totalEvents: events.length,
            activeEvents: events.filter(e => e.status === "published").length,
            revenueByEvent: Object.values(revenueByEvent),
            dailyRevenue: Object.values(dailyMap),
        };
    },
});
export const checkInTicket = mutation({
    args: {
        qr_code: v.string(),
        event_id: v.id("events"),
        gate: v.optional(v.string()),
        source: v.optional(v.union(v.literal("camera"), v.literal("manual"), v.literal("unknown"))),
    },
    handler: async (ctx, args) => {
        await assertEventOrgAccess(ctx, args.event_id);
        const scanner = await getCurrentUser(ctx);
        const submittedCode = args.qr_code.trim();
        const now = new Date().toISOString();
        const ticket = await findTicketByCode(ctx, submittedCode);

        if (!ticket || ticket.event_id !== args.event_id) {
            const message = ticket ? "Ticket belongs to a different event." : "Ticket not found for this event.";
            await logScanEvent(ctx, {
                eventId: args.event_id,
                ticketId: ticket?._id,
                scannerId: scanner._id,
                gate: args.gate,
                source: args.source,
                submittedCode,
                result: ticket ? "wrong_event" : "invalid",
                message,
                scannedAt: now,
            });
            return { status: "invalid", message };
        }

        const owner = ticket.owner_id ? await ctx.db.get(ticket.owner_id) : null;
        const tier = await ctx.db.get(ticket.tier_id);
        const event = await ctx.db.get(ticket.event_id);

        if (ticket.status === "scanned") {
            const message = "This ticket has already been used.";
            await logScanEvent(ctx, {
                eventId: args.event_id,
                ticketId: ticket._id,
                scannerId: scanner._id,
                gate: args.gate,
                source: args.source,
                submittedCode,
                result: "used",
                message,
                scannedAt: now,
            });
            return scanResponse("used", message, { owner, tier, event, ticket });
        }

        if (ticket.status !== "valid") {
            const message = "Ticket is no longer valid.";
            await logScanEvent(ctx, {
                eventId: args.event_id,
                ticketId: ticket._id,
                scannerId: scanner._id,
                gate: args.gate,
                source: args.source,
                submittedCode,
                result: ticket.status === "refunded" ? "refunded" : "invalid",
                message,
                scannedAt: now,
            });
            return scanResponse("invalid", message, { owner, tier, event, ticket });
        }

        await ctx.db.patch(ticket._id, {
            status: "scanned",
            scanned_at: now,
            scanned_by: scanner._id,
        });

        const message = "Ticket verified successfully.";
        await logScanEvent(ctx, {
            eventId: args.event_id,
            ticketId: ticket._id,
            scannerId: scanner._id,
            gate: args.gate,
            source: args.source,
            submittedCode,
            result: "valid",
            message,
            scannedAt: now,
        });

        if (owner?.email) {
            await ctx.runMutation(internal.messages.enqueue, {
                type: "ticket_scanned",
                channel: "email",
                recipient_email: owner.email,
                recipient_phone: owner.phone,
                recipient_name: owner.first_name,
                user_id: owner._id,
                org_id: event?.org_id,
                event_id: ticket.event_id,
                order_id: ticket.order_id,
                subject: `Your ticket was scanned for ${event?.title || "your event"}`,
                body: "Your Ticket Africa QR ticket was successfully scanned at entry.",
                template_key: "ticket_scanned",
                data: {
                    event_title: event?.title || "Your Event",
                    ticket_number: ticket.ticket_number,
                    scanned_at: now,
                    gate: args.gate,
                    wallet_link: "/account.html",
                },
            });
        }

        return scanResponse("valid", message, { owner, tier, event, ticket, scannedAt: now });
    },
});

export const listScanEventsByEvent = query({
    args: {
        event_id: v.id("events"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        await assertEventOrgAccess(ctx, args.event_id);
        const limit = Math.min(Math.max(args.limit || 50, 1), 200);
        const scans = await ctx.db
            .query("scan_events")
            .withIndex("by_event", (q) => q.eq("event_id", args.event_id))
            .order("desc")
            .take(limit);

        return await Promise.all(scans.map(async (scan) => {
            const ticket = scan.ticket_id ? await ctx.db.get(scan.ticket_id) : null;
            const scanner = scan.scanner_id ? await ctx.db.get(scan.scanner_id) : null;
            return {
                ...scan,
                ticket_number: ticket?.ticket_number || null,
                scanner_name: scanner ? `${scanner.first_name} ${scanner.last_name}` : null,
            };
        }));
    },
});

// â”€â”€ Buyer-facing: Orders for a specific email (used by account.html) â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const listOrdersByBuyer = query({
    args: { buyer_email: v.string() },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Authentication required.");
        const requestedEmail = args.buyer_email.trim().toLowerCase();
        const identityEmail = (((identity as any).email || "") as string).trim().toLowerCase();
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
            .first();
        const userEmail = (user.email || "").trim().toLowerCase();
        if (requestedEmail !== identityEmail && requestedEmail !== userEmail) {
            throw new Error("You can only view your own orders.");
        }

        const orders = await ctx.db
            .query("orders")
            .withIndex("by_email", (q) => q.eq("buyer_email", args.buyer_email))
            .order("desc")
            .collect();

        const enriched = await Promise.all(orders.map(async (o) => {
            const event = await ctx.db.get(o.event_id);
            const tickets = await ctx.db
                .query("tickets")
                .withIndex("by_order", (q) => q.eq("order_id", o._id.toString()))
                .collect();
            const enrichedTickets = await Promise.all(tickets.map(async (ticket) => {
                const tier = await ctx.db.get(ticket.tier_id);
                return {
                    ...ticket,
                    tier_name: (tier as any).name || "Ticket",
                    event_title: event.title ?? "Unknown Event",
                    event_date: event.start_date ?? null,
                    event_city: event.location.city ?? "",
                    event_venue: event.location.venue_name ?? "",
                };
            }));
            return {
                ...o,
                event_title: event.title ?? "Unknown Event",
                event_city: event.location.city ?? "",
                event_date: event.start_date ?? null,
                event_venue: event.location.venue_name ?? "",
                tickets: enrichedTickets,
            };
        }));
        return enriched;
    },
});

// â”€â”€ Read-only ticket verification (used by verify.html) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const verifyTicket = query({
    args: { qr_code: v.string() },
    handler: async (ctx, args) => {
        const ticket = await findTicketByCode(ctx, args.qr_code);

        if (!ticket) {
            return { valid: false, message: "No ticket found with that code." };
        }

        const owner = ticket.owner_id ? await ctx.db.get(ticket.owner_id) : null;
        const tier  = await ctx.db.get(ticket.tier_id);
        const event = await ctx.db.get(ticket.event_id);

        return {
            valid: ticket.status === "valid" || ticket.status === "scanned",
            already_used: ticket.status === "scanned",
            status: ticket.status,
            ticket_number: ticket.ticket_number || ticket.qr_code,
            attendee_name: owner ? `${owner.first_name} ${owner.last_name}` : "Guest",
            ticket_type: (tier as any).name || "General Admission",
            event_title: event.title ?? "Unknown Event",
            event_date: event.start_date ?? null,
            event_venue: event.location.venue_name ?? "",
            event_city: event.location.city ?? "",
            scanned_at: ticket.scanned_at ?? null,
            message: ticket.status === "scanned"
                ? "Ticket has already been used."
                : ticket.status === "valid"
                    ? "Ticket is authentic and valid."
                    : "Ticket is not in a valid state.",
        };
    },
});
