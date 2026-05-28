import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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
    args: { country: v.optional(v.string()) },
    handler: async (ctx, args) => {
        let events;
        if (args.country) {
            events = await ctx.db
                .query("events")
                .withIndex("by_country", (q) => q.eq("location.country", args.country!))
                .filter((q) => q.eq(q.field("status"), "published"))
                .order("desc")
                .collect();
        } else {
            events = await ctx.db
                .query("events")
                .withIndex("by_status", (q) => q.eq("status", "published"))
                .order("desc")
                .collect();
        }
        return await enrichEvents(ctx, events);
    },
});

export const searchEvents = query({
    args: { query: v.string() },
    handler: async (ctx, args) => {
        const events = await ctx.db
            .query("events")
            .withSearchIndex("search_text", (q) =>
                q.search("title", args.query).eq("status", "published")
            )
            .collect();
        return await enrichEvents(ctx, events);
    },
});

// Get ALL events for an org (draft + published + cancelled)  -  for organizer dashboard
export const listEventsByOrg = query({
    args: { org_id: v.id("organizations") },
    handler: async (ctx, args) => {
        await assertOrgAccess(ctx, args.org_id);
        const events = await ctx.db
            .query("events")
            .withIndex("by_org", (q) => q.eq("org_id", args.org_id))
            .order("desc")
            .collect();
        return await enrichEvents(ctx, events);
    },
});

// Get upcoming events
export const getUpcomingEvents = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const today = new Date().toISOString();
        const events = await ctx.db
            .query("events")
            .withIndex("by_status", (q) => q.eq("status", "published"))
            .filter((q) => q.gte(q.field("start_date"), today))
            .collect();
        const shown = args.limit ? events.slice(0, args.limit) : events;
        return await enrichEvents(ctx, shown);
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
        const slug = args.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
        return await ctx.db.insert("events", {
            org_id: args.org_id,
            title: args.title,
            slug,
            description: args.description,
            category: args.category,
            start_date: args.start_date,
            end_date: args.end_date,
            cover_image: args.cover_image ?? "",
            currency: args.currency,
            status: "draft",
            location: {
                venue_name: args.venue_name,
                city: args.city,
                country: args.country,
                address: args.address,
            },
            created_at: new Date().toISOString(),
        });
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
        if (fields.title !== undefined) patch.title = fields.title;
        if (fields.description !== undefined) patch.description = fields.description;
        if (fields.category !== undefined) patch.category = fields.category;
        if (fields.start_date !== undefined) patch.start_date = fields.start_date;
        if (fields.end_date !== undefined) patch.end_date = fields.end_date;
        if (fields.cover_image !== undefined) patch.cover_image = fields.cover_image;
        if (fields.currency !== undefined) patch.currency = fields.currency;

        if (venue_name !== undefined || city !== undefined || country !== undefined || address !== undefined) {
            patch.location = {
                venue_name: venue_name ?? existing.location.venue_name,
                city: city ?? existing.location.city,
                country: country ?? existing.location.country,
                address: address ?? existing.location.address,
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
        await assertEventAccess(ctx, args.event_id);
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
        return await ctx.db.insert("ticket_tiers", {
            event_id: args.event_id,
            name: args.name,
            description: args.description,
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
            title: args.title,
            description: args.description,
            start_date: args.start_date,
            end_date: args.end_date,
            status: "draft",
            created_at: new Date().toISOString(),
        });

        for (const option of args.options) {
            await ctx.db.insert("poll_options", {
                poll_id: pollId,
                label: option,
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
        const polls = await ctx.db
            .query("polls")
            .filter((q) => q.neq(q.field("status"), "draft"))
            .order("desc")
            .collect();
        return polls;
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

// â”€â”€ Admin Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const deleteAllEvents = mutation({
    args: {},
    handler: async (ctx) => {
        const events = await ctx.db.query("events").collect();
        for (const event of events) {
            await ctx.db.delete(event._id);
        }
        
        const tiers = await ctx.db.query("ticket_tiers").collect();
        for (const tier of tiers) {
            await ctx.db.delete(tier._id);
        }
        
        return { deleted_events: events.length, deleted_tiers: tiers.length };
    },
});

export const deleteDemoContent = mutation({
    args: {},
    handler: async (ctx) => {
        const demoSlugs = new Set([
            "afrobeats-night-grand-finale",
            "caf-champions-league-qf",
            "accra-creators-summit-2026",
            "lagos-food-culture-weekend",
            "kumasi-highlife-live",
            "cape-town-sevens-fan-zone",
        ]);

        const events = await ctx.db.query("events").collect();
        const demoEvents = events.filter((event) => demoSlugs.has(event.slug));
        const demoEventIds = new Set(demoEvents.map((event) => event._id));

        const tiers = await ctx.db.query("ticket_tiers").collect();
        let deletedTiers = 0;
        for (const tier of tiers) {
            if (demoEventIds.has(tier.event_id)) {
                await ctx.db.delete(tier._id);
                deletedTiers++;
            }
        }

        let deletedEvents = 0;
        for (const event of demoEvents) {
            await ctx.db.delete(event._id);
            deletedEvents++;
        }

        const demoPollTitles = new Set([
            "Artist of the Year 2026",
            "Lagos Carnival: Best Float",
        ]);
        const polls = await ctx.db.query("polls").collect();
        const demoPolls = polls.filter((poll) => demoPollTitles.has(poll.title));
        const demoPollIds = new Set(demoPolls.map((poll) => poll._id));

        const pollOptions = await ctx.db.query("poll_options").collect();
        let deletedPollOptions = 0;
        for (const option of pollOptions) {
            if (demoPollIds.has(option.poll_id)) {
                await ctx.db.delete(option._id);
                deletedPollOptions++;
            }
        }

        let deletedPolls = 0;
        for (const poll of demoPolls) {
            await ctx.db.delete(poll._id);
            deletedPolls++;
        }

        return {
            deleted_events: deletedEvents,
            deleted_tiers: deletedTiers,
            deleted_polls: deletedPolls,
            deleted_poll_options: deletedPollOptions,
        };
    },
});
