import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { sanitizeText, sanitizeHtml } from "./sanitize";

function normalizeCurrency(value: string) {
    return sanitizeText(value).trim().toUpperCase();
}

function supportedCheckoutCurrencies() {
    const raw = process.env.SUPPORTED_CHECKOUT_CURRENCIES || "GHS";
    return new Set(raw.split(",").map((currency) => currency.trim().toUpperCase()).filter(Boolean));
}

function assertDateRange(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error("Event dates must be valid.");
    }
    if (end <= start) {
        throw new Error("Event end date must be after the start date.");
    }
}

function assertTierWindow(salesStart: string, salesEnd: string) {
    const start = new Date(salesStart);
    const end = new Date(salesEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error("Ticket sale dates must be valid.");
    }
    if (end <= start) {
        throw new Error("Ticket sales end date must be after the sales start date.");
    }
}

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

async function assertEventAccess(ctx: any, eventId: any) {
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found.");
    await assertOrgAccess(ctx, event.org_id);
    return event;
}

async function enrichEvent(ctx: any, event: any) {
    const tiers = await ctx.db
        .query("ticket_tiers")
        .withIndex("by_event", (q: any) => q.eq("event_id", event._id))
        .collect();

    const activeTiers = tiers.filter((tier: any) => tier.capacity > 0);
    const minPriceMinor = activeTiers.length
        ? Math.min(...activeTiers.map((tier: any) => tier.price || 0))
        : 0;
    const ticketsSold = tiers.reduce((sum: number, tier: any) => sum + (tier.sold || 0), 0);
    const ticketCapacity = tiers.reduce((sum: number, tier: any) => sum + (tier.capacity || 0), 0);
    const grossRevenue = tiers.reduce((sum: number, tier: any) => sum + ((tier.sold || 0) * (tier.price || 0)), 0);

    return {
        ...event,
        ticket_tiers_count: tiers.length,
        ticket_capacity: ticketCapacity,
        capacity: ticketCapacity,
        tickets_sold: ticketsSold,
        gross_revenue: grossRevenue,
        base_price: minPriceMinor,
        min_price_minor: minPriceMinor,
        min_price: minPriceMinor / 100,
        is_sold_out: ticketCapacity > 0 && ticketsSold >= ticketCapacity,
    };
}

async function enrichEvents(ctx: any, events: any[]) {
    return await Promise.all(events.map((event) => enrichEvent(ctx, event)));
}

// â”€â”€ Queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Get all published events (public browse)
export const listEvents = query({
    args: { country: v.optional(v.string()), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const limit = Math.min(Math.max(args.limit || 200, 1), 500);
        let events;
        if (args.country) {
            events = await ctx.db
                .query("events")
                .withIndex("by_country_status", (q) => q.eq("location.country", args.country!).eq("status", "published"))
                .order("desc")
                .take(limit);
        } else {
            events = await ctx.db
                .query("events")
                .withIndex("by_status", (q) => q.eq("status", "published"))
                .order("desc")
                .take(limit);
        }
        return await enrichEvents(ctx, events);
    },
});

export const searchEvents = query({
    args: { query: v.string(), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const events = await ctx.db
            .query("events")
            .withSearchIndex("search_text", (q) =>
                q.search("title", args.query).eq("status", "published")
            )
            .take(Math.min(Math.max(args.limit || 100, 1), 200));
        return await enrichEvents(ctx, events);
    },
});

// Get ALL events for an org (draft + published + cancelled)  -  for organizer dashboard
export const listEventsByOrg = query({
    args: { org_id: v.id("organizations"), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        const events = await ctx.db
            .query("events")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .order("desc")
            .take(Math.min(Math.max(args.limit || 200, 1), 500));
        return await enrichEvents(ctx, events);
    },
});

// Get upcoming events
export const getUpcomingEvents = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const today = new Date().toISOString();
        const limit = Math.min(Math.max(args.limit || 10, 1), 100);
        const events = await ctx.db
            .query("events")
            .withIndex("by_status_start_date", (q) => q.eq("status", "published").gte("start_date", today))
            .take(limit);
        return await enrichEvents(ctx, events);
    },
});

// Get a single event by slug
export const getEventBySlug = query({
    args: { slug: v.string() },
    handler: async (ctx, args) => {
        const event = await ctx.db
            .query("events")
            .withIndex("by_slug", (q) => q.eq("slug", args.slug))
            .first();
        return event ? await enrichEvent(ctx, event) : null;
    },
});

export const getEventById = query({
    args: { event_id: v.id("events") },
    handler: async (ctx, args) => {
        const event = await ctx.db.get(args.event_id);
        return event ? await enrichEvent(ctx, event) : null;
    },
});

// Get ticket tiers for an event
export const getTicketTiers = query({
    args: { event_id: v.id("events") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("ticket_tiers")
            .withIndex("by_event", (q) => q.eq("event_id", args.event_id))
            .collect();
    },
});

// â”€â”€ Mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Create a new event (starts as draft)
export const createEvent = mutation({
    args: {
        org_id: v.id("organizations"),
        title: v.string(),
        description: v.string(),
        category: v.string(),
        start_date: v.string(),
        end_date: v.string(),
        cover_image: v.optional(v.string()),
        currency: v.string(),
        venue_name: v.string(),
        city: v.string(),
        country: v.string(),
        address: v.string(),
    },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        const user = await getCurrentUser(ctx);
        const sanitizedTitle = sanitizeText(args.title);
        const currency = normalizeCurrency(args.currency);
        assertDateRange(args.start_date, args.end_date);
        if (!currency) throw new Error("Currency is required.");

        const slug = sanitizedTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
        const eventId = await ctx.db.insert("events", {
            org_id: args.org_id,
            title: sanitizedTitle,
            slug,
            description: sanitizeHtml(args.description),
            category: sanitizeText(args.category),
            start_date: args.start_date,
            end_date: args.end_date,
            cover_image: args.cover_image ?? "",
            currency,
            status: "draft",
            location: {
                venue_name: sanitizeText(args.venue_name),
                city: sanitizeText(args.city),
                country: sanitizeText(args.country),
                address: sanitizeText(args.address),
            },
            created_at: new Date().toISOString(),
        });

        await ctx.runMutation(internal.messages.enqueue, {
            type: "event_created",
            channel: "email",
            recipient_email: user.email,
            recipient_phone: user.phone,
            recipient_name: user.first_name,
            user_id: user._id,
            org_id: args.org_id,
            event_id: eventId,
            subject: `Event draft created: ${sanitizedTitle}`,
            body: `${sanitizedTitle} has been created as a draft. Add ticket tiers and review the details before publishing.`,
            template_key: "event_created",
            data: {
                event_title: sanitizedTitle,
                event_date: args.start_date,
                event_venue: sanitizeText(args.venue_name),
                dashboard_link: "/organizer-dashboard.html",
            },
        });

        return eventId;
    },
});

// Create a draft event and its ticket tiers in one transaction.
export const createEventWithTiers = mutation({
    args: {
        org_id: v.id("organizations"),
        title: v.string(),
        description: v.string(),
        category: v.string(),
        start_date: v.string(),
        end_date: v.string(),
        cover_image: v.optional(v.string()),
        currency: v.string(),
        venue_name: v.string(),
        city: v.string(),
        country: v.string(),
        address: v.string(),
        tiers: v.array(v.object({
            name: v.string(),
            description: v.optional(v.string()),
            price: v.number(),
            capacity: v.number(),
        })),
    },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        const user = await getCurrentUser(ctx);
        const sanitizedTitle = sanitizeText(args.title);
        const currency = normalizeCurrency(args.currency);
        assertDateRange(args.start_date, args.end_date);
        if (!currency) throw new Error("Currency is required.");
        if (!sanitizedTitle) throw new Error("Event title is required.");
        if (!args.tiers.length) throw new Error("Add at least one ticket tier.");

        const sanitizedTiers = args.tiers.map((tier) => ({
            name: sanitizeText(tier.name),
            description: tier.description !== undefined ? sanitizeText(tier.description) : undefined,
            price: tier.price,
            capacity: tier.capacity,
        }));

        for (const tier of sanitizedTiers) {
            if (!tier.name) throw new Error("Ticket tier name is required.");
            if (!Number.isInteger(tier.price) || tier.price < 0) {
                throw new Error("Ticket price must be a non-negative amount.");
            }
            if (!Number.isInteger(tier.capacity) || tier.capacity <= 0) {
                throw new Error("Ticket capacity must be at least 1.");
            }
        }

        const slug = sanitizedTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
        const eventId = await ctx.db.insert("events", {
            org_id: args.org_id,
            title: sanitizedTitle,
            slug,
            description: sanitizeHtml(args.description),
            category: sanitizeText(args.category),
            start_date: args.start_date,
            end_date: args.end_date,
            cover_image: args.cover_image ?? "",
            currency,
            status: "draft",
            location: {
                venue_name: sanitizeText(args.venue_name),
                city: sanitizeText(args.city),
                country: sanitizeText(args.country),
                address: sanitizeText(args.address),
            },
            created_at: new Date().toISOString(),
        });

        for (const tier of sanitizedTiers) {
            await ctx.db.insert("ticket_tiers", {
                event_id: eventId,
                name: tier.name,
                description: tier.description,
                price: tier.price,
                capacity: tier.capacity,
                sold: 0,
                sales_start: args.start_date,
                sales_end: args.end_date,
            });
        }

        await ctx.runMutation(internal.messages.enqueue, {
            type: "event_created",
            channel: "email",
            recipient_email: user.email,
            recipient_phone: user.phone,
            recipient_name: user.first_name,
            user_id: user._id,
            org_id: args.org_id,
            event_id: eventId,
            subject: `Event draft created: ${sanitizedTitle}`,
            body: `${sanitizedTitle} has been created as a draft. Review the details before publishing.`,
            template_key: "event_created",
            data: {
                event_title: sanitizedTitle,
                event_date: args.start_date,
                event_venue: sanitizeText(args.venue_name),
                dashboard_link: "/organizer-dashboard.html",
            },
        });

        return eventId;
    },
});

// Update event details
export const updateEvent = mutation({
    args: {
        event_id: v.id("events"),
        title: v.optional(v.string()),
        description: v.optional(v.string()),
        category: v.optional(v.string()),
        start_date: v.optional(v.string()),
        end_date: v.optional(v.string()),
        cover_image: v.optional(v.string()),
        currency: v.optional(v.string()),
        venue_name: v.optional(v.string()),
        city: v.optional(v.string()),
        country: v.optional(v.string()),
        address: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { event_id, venue_name, city, country, address, ...fields } = args;
        const existing = await assertEventAccess(ctx, event_id);

        const patch: Record<string, any> = {};
        if (fields.title !== undefined) patch.title = sanitizeText(fields.title);
        if (fields.description !== undefined) patch.description = sanitizeHtml(fields.description);
        if (fields.category !== undefined) patch.category = sanitizeText(fields.category);
        if (fields.start_date !== undefined) patch.start_date = fields.start_date;
        if (fields.end_date !== undefined) patch.end_date = fields.end_date;
        if (fields.cover_image !== undefined) patch.cover_image = fields.cover_image;
        if (fields.currency !== undefined) patch.currency = normalizeCurrency(fields.currency);
        if (fields.start_date !== undefined || fields.end_date !== undefined) {
            assertDateRange(patch.start_date || existing.start_date, patch.end_date || existing.end_date);
        }

        if (venue_name !== undefined || city !== undefined || country !== undefined || address !== undefined) {
            patch.location = {
                venue_name: venue_name !== undefined ? sanitizeText(venue_name) : existing.location.venue_name,
                city: city !== undefined ? sanitizeText(city) : existing.location.city,
                country: country !== undefined ? sanitizeText(country) : existing.location.country,
                address: address !== undefined ? sanitizeText(address) : existing.location.address,
                coordinates: existing.location.coordinates,
            };
        }

        await ctx.db.patch(event_id, patch);
        return event_id;
    },
});

// Publish a draft event
export const publishEvent = mutation({
    args: { event_id: v.id("events") },
    handler: async (ctx, args) => {
        const event = await assertEventAccess(ctx, args.event_id);
        assertDateRange(event.start_date, event.end_date);

        const supportedCurrencies = supportedCheckoutCurrencies();
        const eventCurrency = normalizeCurrency(event.currency || "");
        if (!supportedCurrencies.has(eventCurrency)) {
            throw new Error(`Checkout is not enabled for ${eventCurrency}. Supported currencies: ${Array.from(supportedCurrencies).join(", ")}.`);
        }

        const tiers = await ctx.db
            .query("ticket_tiers")
            .withIndex("by_event", (q) => q.eq("event_id", args.event_id))
            .collect();
        if (!tiers.length) {
            throw new Error("Add at least one ticket tier before publishing.");
        }

        const now = Date.now();
        const saleableTier = tiers.find((tier: any) => {
            assertTierWindow(tier.sales_start, tier.sales_end);
            if (!Number.isInteger(tier.price) || tier.price < 0) {
                throw new Error(`Invalid price for ${tier.name}.`);
            }
            if (!Number.isInteger(tier.capacity) || tier.capacity <= 0) {
                throw new Error(`Invalid capacity for ${tier.name}.`);
            }
            return (tier.sold || 0) < tier.capacity && new Date(tier.sales_end).getTime() > now;
        });
        if (!saleableTier) {
            throw new Error("At least one ticket tier must be available for sale before publishing.");
        }

        await ctx.db.patch(args.event_id, { status: "published" });
        return args.event_id;
    },
});

// Cancel/unpublish an event
export const cancelEvent = mutation({
    args: { event_id: v.id("events") },
    handler: async (ctx, args) => {
        await assertEventAccess(ctx, args.event_id);
        await ctx.db.patch(args.event_id, { status: "cancelled" });
        return args.event_id;
    },
});

// Delete an event (and its ticket tiers)
export const deleteEvent = mutation({
    args: { event_id: v.id("events") },
    handler: async (ctx, args) => {
        await assertEventAccess(ctx, args.event_id);
        const tiers = await ctx.db
            .query("ticket_tiers")
            .withIndex("by_event", (q) => q.eq("event_id", args.event_id))
            .collect();
        for (const tier of tiers) {
            await ctx.db.delete(tier._id);
        }
        await ctx.db.delete(args.event_id);
        return args.event_id;
    },
});

// Add a ticket tier to an event
export const addTicketTier = mutation({
    args: {
        event_id: v.id("events"),
        name: v.string(),
        description: v.optional(v.string()),
        price: v.number(),
        capacity: v.number(),
        sales_start: v.string(),
        sales_end: v.string(),
    },
    handler: async (ctx, args) => {
        await assertEventAccess(ctx, args.event_id);
        if (!Number.isInteger(args.price) || args.price < 0) {
            throw new Error("Ticket price must be a non-negative amount.");
        }
        if (!Number.isInteger(args.capacity) || args.capacity <= 0) {
            throw new Error("Ticket capacity must be at least 1.");
        }
        assertTierWindow(args.sales_start, args.sales_end);

        return await ctx.db.insert("ticket_tiers", {
            event_id: args.event_id,
            name: sanitizeText(args.name),
            description: args.description !== undefined ? sanitizeText(args.description) : undefined,
            price: args.price,
            capacity: args.capacity,
            sold: 0,
            sales_start: args.sales_start,
            sales_end: args.sales_end,
        });
    },
});

// Remove a ticket tier
export const removeTicketTier = mutation({
    args: { tier_id: v.id("ticket_tiers") },
    handler: async (ctx, args) => {
        const tier = await ctx.db.get(args.tier_id);
        if (!tier) throw new Error("Ticket tier not found.");
        await assertEventAccess(ctx, tier.event_id);
        await ctx.db.delete(args.tier_id);
        return args.tier_id;
    },
});

// â”€â”€ Voting System Mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const createPoll = mutation({
    args: {
        org_id: v.id("organizations"),
        title: v.string(),
        description: v.string(),
        start_date: v.string(),
        end_date: v.string(),
        options: v.array(v.string()),
    },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        const pollId = await ctx.db.insert("polls", {
            org_id: args.org_id,
            title: sanitizeText(args.title),
            description: sanitizeText(args.description),
            start_date: args.start_date,
            end_date: args.end_date,
            status: "draft",
            created_at: new Date().toISOString(),
        });

        for (const option of args.options) {
            await ctx.db.insert("poll_options", {
                poll_id: pollId,
                label: sanitizeText(option),
                votes_count: 0,
            });
        }
        return pollId;
    },
});

export const castVote = mutation({
    args: {
        poll_id: v.id("polls"),
        option_id: v.id("poll_options"),
        user_id: v.id("users"),
    },
    handler: async (ctx, args) => {
        const user = await getCurrentUser(ctx);
        if (user._id !== args.user_id) {
            throw new Error("You can only vote as yourself.");
        }

        // Check if user already voted
        const existing = await ctx.db
            .query("votes")
            .withIndex("by_poll_user", (q) => q.eq("poll_id", args.poll_id).eq("user_id", args.user_id))
            .first();
        if (existing) throw new Error("You have already voted in this poll.");

        // Check if poll is active
        const poll = await ctx.db.get(args.poll_id);
        if (poll.status !== "active") throw new Error("This poll is not active.");

        // Insert vote
        await ctx.db.insert("votes", {
            poll_id: args.poll_id,
            option_id: args.option_id,
            user_id: args.user_id,
            voted_at: new Date().toISOString(),
        });

        // Increment count
        const option = await ctx.db.get(args.option_id);
        if (option) {
            await ctx.db.patch(args.option_id, { votes_count: option.votes_count + 1 });
        }
    },
});

export const listPollsByOrg = query({
    args: { org_id: v.id("organizations") },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        const polls = await ctx.db
            .query("polls")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .order("desc")
            .collect();
        return polls;
    },
});

export const getPollDetails = query({
    args: { poll_id: v.id("polls") },
    handler: async (ctx, args) => {
        const poll = await ctx.db.get(args.poll_id);
        if (!poll) return null;
        const options = await ctx.db
            .query("poll_options")
            .withIndex("by_poll", (q) => q.eq("poll_id", args.poll_id))
            .collect();
        return { ...poll, options };
    },
});

export const listPublicPolls = query({
    args: {},
    handler: async (ctx) => {
        const active = await ctx.db
            .query("polls")
            .withIndex("by_status", (q) => q.eq("status", "active"))
            .order("desc")
            .take(100);
        const completed = await ctx.db
            .query("polls")
            .withIndex("by_status", (q) => q.eq("status", "completed"))
            .order("desc")
            .take(100);
        return [...active, ...completed]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 100);
    },
});

export const updatePollStatus = mutation({
    args: {
        poll_id: v.id("polls"),
        status: v.union(v.literal("draft"), v.literal("active"), v.literal("completed")),
    },
    handler: async (ctx, args) => {
        const poll = await ctx.db.get(args.poll_id);
        if (!poll) throw new Error("Poll not found.");
        await assertOrgAccess(ctx, poll.org_id);
        await ctx.db.patch(args.poll_id, { status: args.status });
        return args.poll_id;
    },
});

export const deletePoll = mutation({
    args: { poll_id: v.id("polls") },
    handler: async (ctx, args) => {
        const poll = await ctx.db.get(args.poll_id);
        if (!poll) throw new Error("Poll not found.");
        await assertOrgAccess(ctx, poll.org_id);
        const options = await ctx.db
            .query("poll_options")
            .withIndex("by_poll", (q) => q.eq("poll_id", args.poll_id))
            .collect();
        for (const opt of options) {
            await ctx.db.delete(opt._id);
        }
        await ctx.db.delete(args.poll_id);
        return args.poll_id;
    },
});

// â”€â”€ Seed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const seed = mutation({
    args: {},
    handler: async () => {
        return "Demo seeding is disabled for launch.";
    },
});

export const addRealDemoEvents = mutation({
    args: {},
    handler: async () => {
        return { inserted: 0, disabled: true };
    },
});

