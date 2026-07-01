import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    users: defineTable({
        clerk_id: v.optional(v.string()),
        email: v.string(),
        first_name: v.string(),
        last_name: v.string(),
        phone: v.optional(v.string()),
        role: v.union(v.literal("buyer"), v.literal("organizer"), v.literal("admin")),
        preferred_language: v.optional(v.string()),
        joined_at: v.string(),
    }).index("by_email", ["email"]).index("by_clerk_id", ["clerk_id"]),

    organizations: defineTable({
        owner_id: v.id("users"),
        name: v.string(),
        slug: v.string(),
        description: v.optional(v.string()),
        logo_url: v.optional(v.string()),
        verified: v.boolean(),
        created_at: v.string(),
    }).index("by_owner", ["owner_id"]).index("by_slug", ["slug"]),

    events: defineTable({
        org_id: v.id("organizations"),
        title: v.string(),
        slug: v.string(),
        description: v.string(),
        cover_image: v.string(),
        category: v.string(),
        start_date: v.string(),
        end_date: v.string(),
        location: v.object({
            venue_name: v.string(),
            address: v.string(),
            city: v.string(),
            country: v.string(),
            coordinates: v.optional(v.object({ lat: v.number(), lng: v.number() })),
        }),
        status: v.union(v.literal("draft"), v.literal("published"), v.literal("cancelled"), v.literal("completed")),
        currency: v.string(),
        created_at: v.string(),
    })
    .index("by_org", ["org_id"])
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_status_start_date", ["status", "start_date"])
    .index("by_country", ["location.country"])
    .index("by_country_status", ["location.country", "status"])
    .searchIndex("search_text", {
        searchField: "title",
        filterFields: ["status"],
    }),

    ticket_tiers: defineTable({
        event_id: v.id("events"),
        name: v.string(),
        description: v.optional(v.string()),
        price: v.number(),       // in currency minor units
        capacity: v.number(),
        sold: v.number(),
        sales_start: v.string(),
        sales_end: v.string(),
    }).index("by_event", ["event_id"]),

    tickets: defineTable({
        event_id: v.id("events"),
        tier_id: v.id("ticket_tiers"),
        owner_id: v.id("users"),
        order_id: v.string(),
        ticket_number: v.optional(v.string()),
        scan_token: v.optional(v.string()),
        qr_code: v.string(),
        status: v.union(v.literal("valid"), v.literal("scanned"), v.literal("refunded")),
        scanned_at: v.optional(v.string()),
        scanned_by: v.optional(v.id("users")),
        purchased_at: v.string(),
    })
    .index("by_owner", ["owner_id"])
    .index("by_event", ["event_id"])
    .index("by_qr", ["qr_code"])
    .index("by_scan_token", ["scan_token"])
    .index("by_ticket_number", ["ticket_number"])
    .index("by_order", ["order_id"]),

    scan_events: defineTable({
        event_id: v.id("events"),
        ticket_id: v.optional(v.id("tickets")),
        scanner_id: v.optional(v.id("users")),
        gate: v.optional(v.string()),
        source: v.union(v.literal("camera"), v.literal("manual"), v.literal("unknown")),
        submitted_code: v.string(),
        result: v.union(
            v.literal("valid"),
            v.literal("used"),
            v.literal("invalid"),
            v.literal("wrong_event"),
            v.literal("refunded")
        ),
        message: v.string(),
        scanned_at: v.string(),
    })
    .index("by_event", ["event_id"])
    .index("by_ticket", ["ticket_id"])
    .index("by_scanner", ["scanner_id"])
    .index("by_event_result", ["event_id", "result"]),

    // â”€â”€ Orders (each purchase transaction) â”€â”€
    orders: defineTable({
        event_id: v.id("events"),
        org_id: v.id("organizations"),
        buyer_name: v.string(),
        buyer_email: v.string(),
        buyer_phone: v.optional(v.string()),
        items: v.array(v.object({
            tier_id: v.string(),
            tier_name: v.string(),
            quantity: v.number(),
            unit_price: v.number(),
        })),
        total_amount: v.number(),   // minor units
        currency: v.string(),
        payment_method: v.optional(v.string()),
        payment_gateway: v.optional(v.string()),
        payment_reference: v.optional(v.string()),
        promo_code: v.optional(v.string()),
        status: v.union(v.literal("pending"), v.literal("paid"), v.literal("refunded"), v.literal("failed")),
        created_at: v.string(),
        paid_at: v.optional(v.string()),
    })
    .index("by_event", ["event_id"])
    .index("by_event_status", ["event_id", "status"])
    .index("by_org", ["org_id"])
    .index("by_org_status", ["org_id", "status"])
    .index("by_email", ["buyer_email"])
    .index("by_payment_reference", ["payment_reference"]),

    // â”€â”€ Promo Codes â”€â”€
    promo_codes: defineTable({
        org_id: v.id("organizations"),
        event_id: v.optional(v.id("events")),  // null = applies to all org events
        code: v.string(),
        description: v.optional(v.string()),
        discount_type: v.union(v.literal("percent"), v.literal("fixed")),
        discount_value: v.number(),             // percent (0-100) or minor units
        max_uses: v.optional(v.number()),       // null = unlimited
        uses: v.number(),
        expires_at: v.optional(v.string()),
        active: v.boolean(),
        created_at: v.string(),
    }).index("by_org", ["org_id"]).index("by_code", ["code"]),

    // â”€â”€ Staff Members â”€â”€
    staff_members: defineTable({
        org_id: v.id("organizations"),
        event_id: v.optional(v.id("events")),  // null = org-wide access
        invited_email: v.string(),
        name: v.string(),
        role: v.union(v.literal("scanner"), v.literal("co_organizer"), v.literal("support")),
        status: v.union(v.literal("pending"), v.literal("active"), v.literal("revoked")),
        invited_at: v.string(),
    }).index("by_org", ["org_id"]).index("by_email", ["invited_email"]),

    // â”€â”€ Payouts â”€â”€
    payouts: defineTable({
        org_id: v.id("organizations"),
        amount: v.number(),         // minor units
        currency: v.string(),
        gross_amount: v.optional(v.number()),
        payout_fee: v.optional(v.number()),
        method: v.union(v.literal("momo"), v.literal("bank"), v.literal("ussd")),
        account_details: v.object({
            provider: v.optional(v.string()),  // e.g. "MTN", "Vodafone", "GCB"
            number: v.string(),
            name: v.string(),
        }),
        status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
        reference: v.optional(v.string()),
        requested_at: v.string(),
        processed_at: v.optional(v.string()),
    }).index("by_org", ["org_id"]),

    ledger_entries: defineTable({
        org_id: v.optional(v.id("organizations")),
        event_id: v.optional(v.id("events")),
        order_id: v.optional(v.string()),
        payout_id: v.optional(v.id("payouts")),
        type: v.union(
            v.literal("ticket_sale"),
            v.literal("abonten_tickets_fee"),
            v.literal("ticket_africa_fee"),
            v.literal("sms_delivery_fee"),
            v.literal("gateway_buyer_fee"),
            v.literal("gateway_collection_fee"),
            v.literal("payout_reserve"),
            v.literal("payout_fee"),
            v.literal("refund")
        ),
        account: v.union(
            v.literal("organizer"),
            v.literal("abonten_tickets"),
            v.literal("ticket_africa"),
            v.literal("payment_processor"),
            v.literal("buyer")
        ),
        direction: v.union(v.literal("credit"), v.literal("debit")),
        amount: v.number(),
        currency: v.string(),
        reference: v.optional(v.string()),
        description: v.string(),
        created_at: v.string(),
    })
    .index("by_org", ["org_id"])
    .index("by_order", ["order_id"])
    .index("by_payout", ["payout_id"])
    .index("by_org_account", ["org_id", "account"])
    .index("by_type", ["type"]),

    // â”€â”€ Attendee Messages (broadcast) â”€â”€
    attendee_messages: defineTable({
        org_id: v.id("organizations"),
        event_id: v.optional(v.id("events")),
        subject: v.string(),
        body: v.string(),
        channel: v.union(v.literal("email"), v.literal("sms"), v.literal("both")),
        sent_to: v.number(),        // count of recipients
        status: v.union(v.literal("draft"), v.literal("sent"), v.literal("failed")),
        sent_at: v.optional(v.string()),
        created_at: v.string(),
    }).index("by_org", ["org_id"]),

    message_outbox: defineTable({
        type: v.union(
            v.literal("welcome_buyer"),
            v.literal("welcome_organizer"),
            v.literal("ticket_confirmation"),
            v.literal("event_created"),
            v.literal("ticket_scanned"),
            v.literal("event_reminder"),
            v.literal("attendee_update"),
            v.literal("newsletter"),
            v.literal("payout_update")
        ),
        channel: v.union(v.literal("email"), v.literal("sms"), v.literal("in_app")),
        status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed"), v.literal("skipped")),
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
        attempts: v.number(),
        scheduled_for: v.optional(v.string()),
        sent_at: v.optional(v.string()),
        last_error: v.optional(v.string()),
        created_at: v.string(),
    })
    .index("by_status", ["status"])
    .index("by_status_created", ["status", "created_at"])
    .index("by_type", ["type"])
    .index("by_recipient_email", ["recipient_email"])
    .index("by_org", ["org_id"])
    .index("by_event", ["event_id"]),

    newsletter_subscribers: defineTable({
        email: v.string(),
        name: v.optional(v.string()),
        phone: v.optional(v.string()),
        source: v.optional(v.string()),
        status: v.union(v.literal("subscribed"), v.literal("unsubscribed")),
        consented_at: v.string(),
        unsubscribed_at: v.optional(v.string()),
    }).index("by_email", ["email"]).index("by_status", ["status"]),

    // â”€â”€ Voting System â”€â”€
    polls: defineTable({
        org_id: v.id("organizations"),
        title: v.string(),
        description: v.string(),
        start_date: v.string(),
        end_date: v.string(),
        status: v.union(v.literal("draft"), v.literal("active"), v.literal("completed")),
        created_at: v.string(),
    }).index("by_org", ["org_id"]).index("by_status", ["status"]),

    poll_options: defineTable({
        poll_id: v.id("polls"),
        label: v.string(),
        image_url: v.optional(v.string()),
        votes_count: v.number(),
    }).index("by_poll", ["poll_id"]),

    votes: defineTable({
        poll_id: v.id("polls"),
        option_id: v.id("poll_options"),
        user_id: v.id("users"),
        voted_at: v.string(),
    }).index("by_poll_user", ["poll_id", "user_id"]),
});
