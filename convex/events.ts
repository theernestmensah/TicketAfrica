import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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

// ── Queries ──────────────────────────────────────────────────

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

// Get ALL events for an org (draft + published + cancelled) — for organizer dashboard
export const listEventsByOrg = query({
    args: { org_id: v.id("organizations") },
    handler: async (ctx, args) => {
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

// ── Mutations ─────────────────────────────────────────────────

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
        const existing = await ctx.db.get(event_id);
        if (!existing) throw new Error("Event not found");

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
        await ctx.db.patch(args.event_id, { status: "published" });
        return args.event_id;
    },
});

// Cancel/unpublish an event
export const cancelEvent = mutation({
    args: { event_id: v.id("events") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.event_id, { status: "cancelled" });
        return args.event_id;
    },
});

// Delete an event (and its ticket tiers)
export const deleteEvent = mutation({
    args: { event_id: v.id("events") },
    handler: async (ctx, args) => {
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
        await ctx.db.delete(args.tier_id);
        return args.tier_id;
    },
});

// ── Voting System Mutations ───────────────────────────────

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
        // Check if user already voted
        const existing = await ctx.db
            .query("votes")
            .withIndex("by_poll_user", (q) => q.eq("poll_id", args.poll_id).eq("user_id", args.user_id))
            .first();
        if (existing) throw new Error("You have already voted in this poll.");

        // Check if poll is active
        const poll = await ctx.db.get(args.poll_id);
        if (poll?.status !== "active") throw new Error("This poll is not active.");

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
        await ctx.db.patch(args.poll_id, { status: args.status });
        return args.poll_id;
    },
});

export const deletePoll = mutation({
    args: { poll_id: v.id("polls") },
    handler: async (ctx, args) => {
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

// ── Seed ─────────────────────────────────────────────────────

export const seed = mutation({
    args: {},
    handler: async (ctx) => {
        const anyEvent = await ctx.db.query("events").first();
        if (anyEvent) return "Already seeded";

        const userId = await ctx.db.insert("users", {
            email: "admin@ticketafrica.com",
            first_name: "Admin",
            last_name: "User",
            role: "admin",
            joined_at: new Date().toISOString()
        });

        const orgId = await ctx.db.insert("organizations", {
            owner_id: userId,
            name: "Ticket Africa Official",
            slug: "ta-official",
            verified: true,
            created_at: new Date().toISOString()
        });

        const e1 = await ctx.db.insert("events", {
            org_id: orgId,
            title: "Afrobeats Night: Grand Finale",
            slug: "afrobeats-night-grand-finale",
            description: "The ultimate music experience.",
            category: "concerts",
            start_date: new Date(Date.now() + 86400000 * 2).toISOString(),
            end_date: new Date(Date.now() + 86400000 * 2).toISOString(),
            cover_image: "",
            currency: "GHS",
            status: "published",
            location: { venue_name: "Accra Sports Stadium", city: "Accra", country: "Ghana", address: "Osu" },
            created_at: new Date().toISOString()
        });

        await ctx.db.insert("ticket_tiers", {
            event_id: e1,
            name: "General Admission",
            price: 5000,
            capacity: 2000,
            sold: 847,
            sales_start: new Date().toISOString(),
            sales_end: new Date(Date.now() + 86400000 * 2).toISOString(),
        });

        await ctx.db.insert("ticket_tiers", {
            event_id: e1,
            name: "VIP",
            price: 15000,
            capacity: 200,
            sold: 143,
            sales_start: new Date().toISOString(),
            sales_end: new Date(Date.now() + 86400000 * 2).toISOString(),
        });

        const e2 = await ctx.db.insert("events", {
            org_id: orgId,
            title: "CAF Champions League Q-Final",
            slug: "caf-champions-league-qf",
            description: "Football action live.",
            category: "sports",
            start_date: new Date(Date.now() + 86400000 * 10).toISOString(),
            end_date: new Date(Date.now() + 86400000 * 10).toISOString(),
            cover_image: "",
            currency: "GHS",
            status: "published",
            location: { venue_name: "FNB Stadium", city: "Johannesburg", country: "South Africa", address: "" },
            created_at: new Date().toISOString()
        });

        await ctx.db.insert("ticket_tiers", {
            event_id: e2,
            name: "General Admission",
            price: 30000,
            capacity: 5000,
            sold: 1200,
            sales_start: new Date().toISOString(),
            sales_end: new Date(Date.now() + 86400000 * 10).toISOString(),
        });

        // Seed Polls
        const now = new Date().toISOString();
        const nextMonth = new Date(Date.now() + 86400000 * 30).toISOString();
        
        const pollId = await ctx.db.insert("polls", {
            title: "Artist of the Year 2026",
            description: "Vote for your favorite artist in the upcoming Ashanti Music Awards. Finalists have been selected based on performance and impact.",
            org_id: orgId,
            status: "active",
            start_date: now,
            end_date: nextMonth,
            created_at: now
        });
        await ctx.db.insert("poll_options", { poll_id: pollId, label: "Sarkodie", votes_count: 1250 });
        await ctx.db.insert("poll_options", { poll_id: pollId, label: "Stonebwoy", votes_count: 1320 });
        await ctx.db.insert("poll_options", { poll_id: pollId, label: "Black Sherif", votes_count: 980 });

        const pollId2 = await ctx.db.insert("polls", {
            title: "Lagos Carnival: Best Float",
            description: "Who had the most creative and colorful display at this years carnival? Your vote determines the winner of the $10,000 grand prize.",
            org_id: orgId,
            status: "active",
            start_date: now,
            end_date: nextMonth,
            created_at: now
        });
        await ctx.db.insert("poll_options", { poll_id: pollId2, label: "Eko Atlantic", votes_count: 450 });
        await ctx.db.insert("poll_options", { poll_id: pollId2, label: "Victoria Island Crew", votes_count: 380 });
        await ctx.db.insert("poll_options", { poll_id: pollId2, label: "Surulere Stars", votes_count: 520 });

        return "Seeded successfully";
    }
});

export const addRealDemoEvents = mutation({
    args: {},
    handler: async (ctx) => {
        const admin = await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("email"), "admin@ticketafrica.com"))
            .first();
        const userId = admin?._id ?? (await ctx.db.insert("users", {
            email: "admin@ticketafrica.com",
            first_name: "Admin",
            last_name: "User",
            role: "admin",
            joined_at: new Date().toISOString(),
        }));

        const org = await ctx.db
            .query("organizations")
            .filter((q) => q.eq(q.field("slug"), "ta-official"))
            .first();
        const orgId = org?._id ?? (await ctx.db.insert("organizations", {
            owner_id: userId,
            name: "Ticket Africa Official",
            slug: "ta-official",
            verified: true,
            created_at: new Date().toISOString(),
        }));

        const demoEvents = [
            {
                title: "Accra Creators Summit 2026",
                slug: "accra-creators-summit-2026",
                description: "A full-day gathering for creators, founders, designers, and media teams building modern African brands.",
                category: "conferences",
                days: 18,
                venue: "Accra International Conference Centre",
                city: "Accra",
                country: "Ghana",
                address: "Osu, Accra",
                tiers: [
                    { name: "Standard Pass", description: "Main-stage access and networking lounge.", price: 12000, capacity: 800, sold: 214 },
                    { name: "Founder Pass", description: "Priority seating, workshop access, and private mixer.", price: 35000, capacity: 180, sold: 64 },
                ],
            },
            {
                title: "Lagos Food & Culture Weekend",
                slug: "lagos-food-culture-weekend",
                description: "Street food, live chefs, fashion pop-ups, and evening performances from Lagos culture makers.",
                category: "festivals",
                days: 26,
                venue: "Muri Okunola Park",
                city: "Lagos",
                country: "Nigeria",
                address: "Victoria Island, Lagos",
                tiers: [
                    { name: "Day Pass", description: "Entry for one festival day.", price: 8000, capacity: 3000, sold: 982 },
                    { name: "Weekend Pass", description: "Two-day access with priority entry.", price: 14000, capacity: 1200, sold: 401 },
                ],
            },
            {
                title: "Kumasi Highlife Live",
                slug: "kumasi-highlife-live",
                description: "A live highlife concert celebrating classic bands, new voices, and dance-floor nostalgia.",
                category: "concerts",
                days: 34,
                venue: "Rattray Park",
                city: "Kumasi",
                country: "Ghana",
                address: "Nhyiaeso, Kumasi",
                tiers: [
                    { name: "General Admission", description: "Standing access close to the main stage.", price: 6000, capacity: 2500, sold: 1304 },
                    { name: "VIP Lounge", description: "Dedicated lounge access and premium viewing.", price: 18000, capacity: 300, sold: 118 },
                ],
            },
            {
                title: "Cape Town Sevens Fan Zone",
                slug: "cape-town-sevens-fan-zone",
                description: "A match-day fan zone with big screens, games, music, and food vendors for rugby weekend.",
                category: "sports",
                days: 42,
                venue: "Green Point Urban Park",
                city: "Cape Town",
                country: "South Africa",
                address: "Green Point, Cape Town",
                tiers: [
                    { name: "Fan Zone Entry", description: "General entry with access to all screens.", price: 9000, capacity: 4000, sold: 1507 },
                    { name: "Family Pack", description: "Entry for four guests with reserved picnic area.", price: 30000, capacity: 500, sold: 132 },
                ],
            },
        ];

        let inserted = 0;
        for (const demo of demoEvents) {
            const existing = await ctx.db
                .query("events")
                .withIndex("by_slug", (q) => q.eq("slug", demo.slug))
                .first();
            if (existing) continue;

            const start = new Date(Date.now() + 86400000 * demo.days);
            const eventId = await ctx.db.insert("events", {
                org_id: orgId,
                title: demo.title,
                slug: demo.slug,
                description: demo.description,
                category: demo.category,
                start_date: start.toISOString(),
                end_date: new Date(start.getTime() + 1000 * 60 * 60 * 6).toISOString(),
                cover_image: "",
                currency: "GHS",
                status: "published",
                location: {
                    venue_name: demo.venue,
                    city: demo.city,
                    country: demo.country,
                    address: demo.address,
                },
                created_at: new Date().toISOString(),
            });

            for (const tier of demo.tiers) {
                await ctx.db.insert("ticket_tiers", {
                    event_id: eventId,
                    name: tier.name,
                    description: tier.description,
                    price: tier.price,
                    capacity: tier.capacity,
                    sold: tier.sold,
                    sales_start: new Date().toISOString(),
                    sales_end: start.toISOString(),
                });
            }
            inserted++;
        }

        return { inserted };
    },
});

// ── Admin Utilities ─────────────────────────────────────────

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
