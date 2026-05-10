import { action, internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

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

export const verifyPaystackPayment = action({
    args: {
        order_id: v.id("orders"),
        reference: v.string(),
    },
    handler: async (ctx, args): Promise<{ success: true }> => {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret) throw new Error("Paystack secret key is not configured.");

        const encodedRef = encodeURIComponent(args.reference);
        const res = await fetch(`https://api.paystack.co/transaction/verify/${encodedRef}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${secret}`,
            },
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.status || body?.data?.status !== "success") {
            throw new Error(body?.message || "Payment was not verified by Paystack.");
        }

        await ctx.runMutation(internal.payments.completeVerifiedOrder, {
            order_id: args.order_id,
            reference: args.reference,
            amount: body.data.amount,
            currency: body.data.currency,
            gateway_response: body.data.gateway_response || undefined,
        });

        return { success: true };
    },
});

export const completeVerifiedOrder = internalMutation({
    args: {
        order_id: v.id("orders"),
        reference: v.string(),
        amount: v.number(),
        currency: v.string(),
        gateway_response: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const order = await ctx.db.get(args.order_id);
        if (!order) throw new Error("Order not found");
        if (order.status === "paid") return { success: true }; // Already processed
        if (order.total_amount !== args.amount) throw new Error("Verified payment amount does not match this order.");
        if (order.currency.toUpperCase() !== args.currency.toUpperCase()) throw new Error("Verified payment currency does not match this order.");

        const existingRef = await ctx.db
            .query("orders")
            .withIndex("by_payment_reference", q => q.eq("payment_reference", args.reference))
            .first();
        if (existingRef && existingRef._id !== args.order_id) {
            throw new Error("This payment reference has already been used.");
        }

        const buyerEmail = order.buyer_email.trim().toLowerCase();
        const [firstName = "Guest", ...lastParts] = order.buyer_name.trim().split(/\s+/);
        let owner = await ctx.db
            .query("users")
            .withIndex("by_email", q => q.eq("email", buyerEmail))
            .first();

        if (!owner) {
            const ownerId = await ctx.db.insert("users", {
                email: buyerEmail,
                first_name: firstName || "Guest",
                last_name: lastParts.join(" ") || "Attendee",
                phone: order.buyer_phone,
                role: "buyer",
                joined_at: new Date().toISOString(),
            });
            owner = await ctx.db.get(ownerId);
        }

        if (!owner) throw new Error("Could not create buyer profile");

        // Generate tickets for each item
        for (const item of order.items) {
            const tierId = item.tier_id as any;
            const tier = await ctx.db.get(tierId);
            if (!tier) throw new Error(`Ticket tier not found: ${item.tier_name}`);

            const sold = (tier as any).sold as number || 0;
            const capacity = (tier as any).capacity as number || 0;
            if (capacity > 0 && sold + item.quantity > capacity) {
                throw new Error(`Not enough tickets left for ${item.tier_name}`);
            }

            for (let i = 0; i < item.quantity; i++) {
                const qrCode = `TA-${order.event_id.substring(0,4)}-${Math.random().toString(36).substring(2,10).toUpperCase()}`;
                await ctx.db.insert("tickets", {
                    event_id: order.event_id,
                    tier_id: tierId,
                    owner_id: owner._id,
                    order_id: args.order_id.toString(),
                    qr_code: qrCode,
                    status: "valid",
                    purchased_at: new Date().toISOString(),
                });
            }

            await ctx.db.patch(tierId, { sold: sold + item.quantity });
        }

        await ctx.db.patch(args.order_id, {
            status: "paid",
            payment_gateway: "paystack",
            payment_reference: args.reference,
            payment_method: args.gateway_response,
            paid_at: new Date().toISOString(),
        });

        const event = await ctx.db.get(order.event_id);
        await ctx.runMutation(internal.messages.enqueue, {
            type: "ticket_confirmation",
            channel: "email",
            recipient_email: buyerEmail,
            recipient_phone: order.buyer_phone,
            recipient_name: order.buyer_name,
            user_id: owner._id,
            org_id: order.org_id,
            event_id: order.event_id,
            order_id: args.order_id.toString(),
            subject: `Your tickets for ${event?.title || "your event"}`,
            body: `Your Ticket Africa order is confirmed. Open your wallet to view your QR tickets.`,
            template_key: "ticket_confirmation",
            data: {
                order_ref: args.order_id.toString(),
                event_title: event?.title || "Your Event",
                event_date: event?.start_date || null,
                event_venue: event?.location?.venue_name || "",
                items: order.items,
                total_amount: order.total_amount,
                currency: order.currency,
                wallet_link: "/account.html",
            },
        });

        return { success: true };
    },
});
