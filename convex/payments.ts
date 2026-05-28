import { action, internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

function isPositiveInteger(value: number) {
    return Number.isInteger(value) && value > 0;
}

function compactId(value: unknown) {
    return String(value || "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(-8)
        .toUpperCase()
        .padStart(8, "0");
}

function randomBlock() {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 8).toUpperCase();
}

function makeTicketNumber(orderId: unknown, sequence: number) {
    return `TKA-${new Date().getFullYear()}-${compactId(orderId)}-${String(sequence).padStart(3, "0")}`;
}

function makeScanToken(orderId: unknown, sequence: number) {
    return `TAQR_${compactId(orderId)}_${String(sequence).padStart(3, "0")}_${randomBlock()}${randomBlock()}`;
}

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
        if (!args.items.length) throw new Error("Your cart is empty.");
        if (!args.buyer_name.trim()) throw new Error("Buyer name is required.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.buyer_email.trim())) {
            throw new Error("A valid buyer email is required.");
        }

        const event = await ctx.db.get(args.event_id);
        if (!event) throw new Error("Event not found");
        if (event.status !== "published") throw new Error("This event is not available for checkout.");

        let expectedSubtotal = 0;
        const validatedItems = [];
        for (const item of args.items) {
            if (!isPositiveInteger(item.quantity) || item.quantity > 10) {
                throw new Error(`Invalid quantity for ${item.tier_name}.`);
            }

            const tier = await ctx.db.get(item.tier_id as any);
            if (!tier || (tier as any).event_id !== args.event_id) {
                throw new Error(`Ticket tier not found: ${item.tier_name}.`);
            }

            const now = new Date();
            if ((tier as any).sales_start && new Date((tier as any).sales_start) > now) {
                throw new Error(`Sales have not started for ${(tier as any).name}.`);
            }
            if ((tier as any).sales_end && new Date((tier as any).sales_end) < now) {
                throw new Error(`Sales have ended for ${(tier as any).name}.`);
            }

            const sold = ((tier as any).sold || 0) as number;
            const capacity = ((tier as any).capacity || 0) as number;
            if (capacity > 0 && sold + item.quantity > capacity) {
                throw new Error(`Not enough tickets left for ${(tier as any).name}.`);
            }

            const price = ((tier as any).price || 0) as number;
            if (item.unit_price !== price) {
                throw new Error(`Price changed for ${(tier as any).name}. Refresh and try again.`);
            }

            expectedSubtotal += price * item.quantity;
            validatedItems.push({
                tier_id: item.tier_id,
                tier_name: (tier as any).name || item.tier_name,
                quantity: item.quantity,
                unit_price: price,
            });
        }

        const serviceFee = Math.round((expectedSubtotal / 100) * 0.05) * 100;
        const smsDeliveryFee = 100;
        const expectedTotal = expectedSubtotal + serviceFee + smsDeliveryFee;

        if (args.total_amount !== expectedTotal) {
            throw new Error("Checkout total does not match current ticket prices.");
        }

        const orderId = await ctx.db.insert("orders", {
            event_id: args.event_id,
            org_id: event.org_id,
            buyer_name: args.buyer_name.trim(),
            buyer_email: normalizeEmail(args.buyer_email),
            buyer_phone: args.buyer_phone.trim() || undefined,
            items: validatedItems,
            total_amount: expectedTotal,
            currency: args.currency,
            status: "pending",
            created_at: new Date().toISOString(),
        });

        return { orderId };
    },
});

export const setPaystackReference = mutation({
    args: {
        order_id: v.id("orders"),
        buyer_email: v.string(),
        reference: v.string(),
    },
    handler: async (ctx, args) => {
        const order = await ctx.db.get(args.order_id);
        if (!order) throw new Error("Order not found.");
        if (order.status !== "pending") throw new Error("This order is no longer pending.");
        if (normalizeEmail(order.buyer_email) !== normalizeEmail(args.buyer_email)) {
            throw new Error("Buyer email does not match this order.");
        }

        const reference = args.reference.trim();
        if (!/^TKA_[A-Za-z0-9_]{8,80}$/.test(reference)) {
            throw new Error("Invalid Paystack reference format.");
        }

        const existingRef = await ctx.db
            .query("orders")
            .withIndex("by_payment_reference", q => q.eq("payment_reference", reference))
            .first();
        if (existingRef && existingRef._id !== args.order_id) {
            throw new Error("This payment reference is already attached to another order.");
        }

        await ctx.db.patch(args.order_id, {
            payment_gateway: "paystack",
            payment_reference: reference,
        });

        return { success: true };
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
        if (!res.ok || !body.status || body.data.status !== "success") {
            throw new Error(body.message || "Payment was not verified by Paystack.");
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

export const verifyPaystackReference = action({
    args: {
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
        if (!res.ok || !body.status || body.data.status !== "success") {
            throw new Error(body?.message || "Payment was not verified by Paystack.");
        }

        await ctx.runMutation(internal.payments.completeVerifiedOrderByReference, {
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

        const buyerEmail = normalizeEmail(order.buyer_email);
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

        // Generate one backend-verifiable ticket per purchased seat.
        let ticketSequence = 1;
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
                const ticketNumber = makeTicketNumber(args.order_id, ticketSequence);
                const scanToken = makeScanToken(args.order_id, ticketSequence);
                ticketSequence += 1;

                await ctx.db.insert("tickets", {
                    event_id: order.event_id,
                    tier_id: tierId,
                    owner_id: owner._id,
                    order_id: args.order_id.toString(),
                    ticket_number: ticketNumber,
                    scan_token: scanToken,
                    qr_code: scanToken,
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
            subject: `Your tickets for ${event.title || "your event"}`,
            body: `Your Ticket Africa order is confirmed. Open your wallet to view your QR tickets.`,
            template_key: "ticket_confirmation",
            data: {
                order_ref: args.order_id.toString(),
                event_title: event.title || "Your Event",
                event_date: event.start_date || null,
                event_venue: event.location.venue_name || "",
                items: order.items,
                total_amount: order.total_amount,
                currency: order.currency,
                wallet_link: "/account.html",
            },
        });

        return { success: true };
    },
});

export const completeVerifiedOrderByReference = internalMutation({
    args: {
        reference: v.string(),
        amount: v.number(),
        currency: v.string(),
        gateway_response: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const order = await ctx.db
            .query("orders")
            .withIndex("by_payment_reference", q => q.eq("payment_reference", args.reference))
            .first();
        if (!order) throw new Error("No pending order found for this Paystack reference.");

        await ctx.runMutation(internal.payments.completeVerifiedOrder, {
            order_id: order._id,
            reference: args.reference,
            amount: args.amount,
            currency: args.currency,
            gateway_response: args.gateway_response,
        });

        return { success: true };
    },
});
