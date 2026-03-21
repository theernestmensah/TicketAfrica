import { mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

/**
 * createCheckout: Initiates a payment process
 */
export const createCheckout = mutation({
    args: {
        event_id: v.id("events"),
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
    },
    handler: async (ctx, args) => {
        const event = await ctx.db.get(args.event_id);
        if (!event) throw new Error("Event not found");

        // Create a pending order
        const orderId = await ctx.db.insert("orders", {
            ...args,
            org_id: event.org_id,
            status: "pending",
            created_at: new Date().toISOString(),
        });

        // In a real app, you'd call Paystack/Flutterwave API here to get a checkout URL
        // or just return the orderId to be used with Paystack Inline (popup)
        return { orderId };
    },
});

/**
 * completeOrder: Called when payment succeeds (via webhook or client success)
 * In production, this should ONLY be called by a verified webhook.
 */
export const completeOrder = mutation({
    args: { order_id: v.id("orders") },
    handler: async (ctx, args) => {
        const order = await ctx.db.get(args.order_id);
        if (!order) throw new Error("Order not found");
        if (order.status === "paid") return; // Already processed

        // Update status
        await ctx.db.patch(args.order_id, { status: "paid" });

        // Generate tickets for each item
        for (const item of order.items) {
            for (let i = 0; i < item.quantity; i++) {
                const qrCode = `TA-${order.event_id.substring(0,4)}-${Math.random().toString(36).substring(2,10).toUpperCase()}`;
                await ctx.db.insert("tickets", {
                    event_id: order.event_id,
                    tier_id: item.tier_id as any, // Cast as we know it's a valid ID
                    owner_id: (await ctx.db.query("users").withIndex("by_email", q => q.eq("email", order.buyer_email)).first())?._id as any,
                    order_id: args.order_id,
                    qr_code: qrCode,
                    status: "valid",
                    purchased_at: new Date().toISOString(),
                });
            }

            // Increment sold count in tier
            const tier = await ctx.db.get(item.tier_id as any);
            if (tier && "sold" in tier) {
                await ctx.db.patch(item.tier_id as any, { sold: (tier.sold as number || 0) + item.quantity });
            }
        }

        return { success: true };
    },
});
