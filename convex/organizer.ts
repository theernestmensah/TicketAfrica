import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ── Orders ────────────────────────────────────────────────────

export const listOrdersByOrg = query({
    args: { org_id: v.id("organizations") },
    handler: async (ctx, args) => {
        const orders = await ctx.db
            .query("orders")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .order("desc")
            .collect();

        // Enrich with event title
        const enriched = await Promise.all(orders.map(async (o) => {
            const event = await ctx.db.get(o.event_id);
            return { ...o, event_title: event?.title ?? "Unknown Event", event_city: event?.location?.city };
        }));
        return enriched;
    },
});

export const listOrdersByEvent = query({
    args: { event_id: v.id("events") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("orders")
            .withIndex("by_event", (q) => q.eq("event_id", args.event_id))
            .order("desc")
            .collect();
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
        const { org_id: _, ...rest } = args;
        return await ctx.db.insert("orders", {
            ...rest,
            org_id: orgId,
            status: "paid",
            created_at: new Date().toISOString(),
        });
    },
});


// ── Promo Codes ───────────────────────────────────────────────

export const listPromosByOrg = query({
    args: { org_id: v.id("organizations") },
    handler: async (ctx, args) => {
        const promos = await ctx.db
            .query("promo_codes")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .order("desc")
            .collect();

        const enriched = await Promise.all(promos.map(async (p) => {
            const event = p.event_id ? await ctx.db.get(p.event_id) : null;
            return { ...p, event_title: event?.title ?? "All Events" };
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
        await ctx.db.patch(args.promo_id, { active: false });
        return args.promo_id;
    },
});

export const deletePromoCode = mutation({
    args: { promo_id: v.id("promo_codes") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.promo_id);
        return args.promo_id;
    },
});

// ── Staff Members ─────────────────────────────────────────────

export const listStaffByOrg = query({
    args: { org_id: v.id("organizations") },
    handler: async (ctx, args) => {
        const staff = await ctx.db
            .query("staff_members")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .collect();

        const enriched = await Promise.all(staff.map(async (s) => {
            const event = s.event_id ? await ctx.db.get(s.event_id) : null;
            return { ...s, event_title: event?.title ?? "All Events" };
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
        await ctx.db.patch(args.staff_id, { status: "revoked" });
        return args.staff_id;
    },
});

export const removeStaff = mutation({
    args: { staff_id: v.id("staff_members") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.staff_id);
        return args.staff_id;
    },
});

// ── Payouts ───────────────────────────────────────────────────

export const listPayoutsByOrg = query({
    args: { org_id: v.id("organizations") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("payouts")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .order("desc")
            .collect();
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
        const ref = "TA-PAY-" + Date.now().toString(36).toUpperCase();
        return await ctx.db.insert("payouts", {
            ...args,
            status: "pending",
            reference: ref,
            requested_at: new Date().toISOString(),
        });
    },
});

// ── Attendee Messages ─────────────────────────────────────────

export const listMessagesByOrg = query({
    args: { org_id: v.id("organizations") },
    handler: async (ctx, args) => {
        const messages = await ctx.db
            .query("attendee_messages")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .order("desc")
            .collect();

        const enriched = await Promise.all(messages.map(async (m) => {
            const event = m.event_id ? await ctx.db.get(m.event_id) : null;
            return { ...m, event_title: event?.title ?? "All Events" };
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
        return await ctx.db.insert("attendee_messages", {
            ...args,
            status: "sent",
            sent_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
        });
    },
});

// ── Analytics query ───────────────────────────────────────────

export const getOrgAnalytics = query({
    args: { org_id: v.id("organizations") },
    handler: async (ctx, args) => {
        const events = await ctx.db
            .query("events")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .collect();

        const orders = await ctx.db
            .query("orders")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .collect();

        const totalRevenue = orders
            .filter(o => o.status === "paid")
            .reduce((s, o) => s + o.total_amount, 0);

        const totalOrders = orders.filter(o => o.status === "paid").length;
        const totalTickets = orders
            .filter(o => o.status === "paid")
            .reduce((s, o) => s + o.items.reduce((is, i) => is + i.quantity, 0), 0);

        // Revenue per event
        const revenueByEvent: Record<string, { title: string; revenue: number; orders: number }> = {};
        for (const ev of events) {
            revenueByEvent[ev._id] = { title: ev.title, revenue: 0, orders: 0 };
        }
        for (const o of orders.filter(ord => ord.status === "paid")) {
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
        for (const o of orders.filter(ord => ord.status === "paid")) {
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
    args: { qr_code: v.string(), event_id: v.id("events") },
    handler: async (ctx, args) => {
        const ticket = await ctx.db
            .query("tickets")
            .withIndex("by_event", (q) => q.eq("event_id", args.event_id))
            .filter((q) => q.eq(q.field("qr_code"), args.qr_code))
            .first();

        if (!ticket) {
            return { status: "invalid", message: "Ticket not found for this event." };
        }

        if (ticket.status === "scanned") {
            return { 
                status: "used", 
                message: "This ticket has already been used.",
                scanned_at: ticket.scanned_at 
            };
        }

        if (ticket.status !== "valid") {
            return { status: "invalid", message: "Ticket is no longer valid." };
        }

        const now = new Date().toISOString();
        await ctx.db.patch(ticket._id, { status: "scanned", scanned_at: now });

        // Get owner details
        const owner = ticket.owner_id ? await ctx.db.get(ticket.owner_id) : null;
        const tier = await ctx.db.get(ticket.tier_id);

        return { 
            status: "valid", 
            message: "Ticket verified successfully.",
            owner_name: owner ? `${owner.first_name} ${owner.last_name}` : "Guest",
            tier_name: (tier as any)?.name || "General Admission",
            scanned_at: now
        };
    },
});

// ── Buyer-facing: Orders for a specific email (used by account.html) ─────────

export const listOrdersByBuyer = query({
    args: { buyer_email: v.string() },
    handler: async (ctx, args) => {
        const orders = await ctx.db
            .query("orders")
            .withIndex("by_email", (q) => q.eq("buyer_email", args.buyer_email))
            .order("desc")
            .collect();

        const enriched = await Promise.all(orders.map(async (o) => {
            const event = await ctx.db.get(o.event_id);
            return {
                ...o,
                event_title: event?.title ?? "Unknown Event",
                event_city: event?.location?.city ?? "",
                event_date: event?.start_date ?? null,
            };
        }));
        return enriched;
    },
});

// ── Read-only ticket verification (used by verify.html) ──────────────────────

export const verifyTicket = query({
    args: { qr_code: v.string() },
    handler: async (ctx, args) => {
        const ticket = await ctx.db
            .query("tickets")
            .withIndex("by_qr", (q) => q.eq("qr_code", args.qr_code))
            .first();

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
            attendee_name: owner ? `${owner.first_name} ${owner.last_name}` : "Guest",
            ticket_type: (tier as any)?.name || "General Admission",
            event_title: event?.title ?? "Unknown Event",
            event_date: event?.start_date ?? null,
            scanned_at: ticket.scanned_at ?? null,
            message: ticket.status === "scanned"
                ? "Ticket has already been used."
                : ticket.status === "valid"
                    ? "Ticket is authentic and valid."
                    : "Ticket is not in a valid state.",
        };
    },
});
