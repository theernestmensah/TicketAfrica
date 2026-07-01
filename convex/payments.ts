import { action, internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import { sanitizeText, sanitizeEmail, sanitizePhone } from "./sanitize";

function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

function normalizeCurrency(value: string) {
    return String(value || "").trim().toUpperCase();
}

function supportedCheckoutCurrencies() {
    const raw = process.env.SUPPORTED_CHECKOUT_CURRENCIES || "GHS";
    return new Set(raw.split(",").map((currency) => normalizeCurrency(currency)).filter(Boolean));
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

function randomToken(bytes = 32) {
    const values = new Uint8Array(bytes);
    crypto.getRandomValues(values);
    return Array.from(values, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function makeTicketNumber(orderId: unknown, sequence: number) {
    return `ABT-${new Date().getFullYear()}-${compactId(orderId)}-${String(sequence).padStart(3, "0")}`;
}

function makeScanToken(_orderId: unknown, _sequence: number) {
    return `TAQR_${new Date().getFullYear()}_${randomToken(32)}`;
}

function calculateOrderSplit(order: any, verifiedAmount: number) {
    const organizerGross = order.items.reduce((sum: number, item: any) => {
        return sum + (item.unit_price * item.quantity);
    }, 0);
    const ticketAfricaFee = Math.round((organizerGross / 100) * 0.05) * 100;
    const smsDeliveryFee = Math.max(0, order.total_amount - organizerGross - ticketAfricaFee);
    const buyerGatewayFee = Math.max(0, verifiedAmount - order.total_amount);
    return {
        organizerGross,
        ticketAfricaFee,
        smsDeliveryFee,
        buyerGatewayFee,
    };
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
        const sanitizedBuyerName = sanitizeText(args.buyer_name);
        const sanitizedBuyerEmail = sanitizeEmail(args.buyer_email);
        const sanitizedBuyerPhone = args.buyer_phone !== undefined ? sanitizePhone(args.buyer_phone) : undefined;

        if (!args.items.length) throw new Error("Your cart is empty.");
        if (!sanitizedBuyerName) throw new Error("Buyer name is required.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedBuyerEmail)) {
            throw new Error("A valid buyer email is required.");
        }

        const event = await ctx.db.get(args.event_id);
        if (!event) throw new Error("Event not found");
        if (event.status !== "published") throw new Error("This event is not available for checkout.");
        const currency = normalizeCurrency(args.currency);
        if (!supportedCheckoutCurrencies().has(currency)) {
            throw new Error(`Checkout is not enabled for ${currency}.`);
        }
        if (normalizeCurrency(event.currency) !== currency) {
            throw new Error("Checkout currency does not match this event.");
        }

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
            buyer_name: sanitizedBuyerName,
            buyer_email: sanitizedBuyerEmail,
            buyer_phone: sanitizedBuyerPhone || undefined,
            items: validatedItems,
            total_amount: expectedTotal,
            currency,
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
        const sanitizedBuyerEmail = sanitizeEmail(args.buyer_email);
        const sanitizedReference = sanitizeText(args.reference);

        const order = await ctx.db.get(args.order_id);
        if (!order) throw new Error("Order not found.");
        if (order.status !== "pending") throw new Error("This order is no longer pending.");
        if (normalizeEmail(order.buyer_email) !== normalizeEmail(sanitizedBuyerEmail)) {
            throw new Error("Buyer email does not match this order.");
        }

        if (!/^(ABT|TKA)_[A-Za-z0-9_]{8,80}$/.test(sanitizedReference)) {
            throw new Error("Invalid Paystack reference format.");
        }

        const existingRef = await ctx.db
            .query("orders")
            .withIndex("by_payment_reference", q => q.eq("payment_reference", sanitizedReference))
            .first();
        if (existingRef && existingRef._id !== args.order_id) {
            throw new Error("This payment reference is already attached to another order.");
        }

        await ctx.db.patch(args.order_id, {
            payment_gateway: "paystack",
            payment_reference: sanitizedReference,
        });

        return { success: true };
    },
});

export const getOrderForPayment = internalQuery({
    args: {
        order_id: v.id("orders"),
        buyer_email: v.string(),
    },
    handler: async (ctx, args) => {
        const order = await ctx.db.get(args.order_id);
        if (!order) throw new Error("Order not found.");
        if (order.status !== "pending") throw new Error("This order is no longer pending.");
        if (normalizeEmail(order.buyer_email) !== normalizeEmail(args.buyer_email)) {
            throw new Error("Buyer email does not match this order.");
        }
        return {
            _id: order._id,
            buyer_email: order.buyer_email,
            buyer_name: order.buyer_name,
            total_amount: order.total_amount,
            currency: order.currency,
            payment_reference: order.payment_reference,
        };
    },
});

export const getPaymentReference = query({
    args: {
        order_id: v.id("orders"),
    },
    handler: async (ctx, args) => {
        const order = await ctx.db.get(args.order_id);
        if (!order) throw new Error("Order not found.");
        return {
            reference: order.payment_reference,
            gateway: order.payment_gateway,
            status: order.status,
        };
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
        gateway: v.optional(v.string()),
        gateway_response: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const order = await ctx.db.get(args.order_id);
        if (!order) throw new Error("Order not found");
        if (order.status === "paid") return { success: true }; // Already processed
        if (args.amount < order.total_amount) throw new Error("Verified payment amount is less than this order total.");
        if (normalizeCurrency(order.currency) !== normalizeCurrency(args.currency)) throw new Error("Verified payment currency does not match this order.");

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
            payment_gateway: args.gateway || "paystack",
            payment_reference: args.reference,
            payment_method: args.gateway_response,
            paid_at: new Date().toISOString(),
        });

        const split = calculateOrderSplit(order, args.amount);
        const ledgerBase = {
            org_id: order.org_id,
            event_id: order.event_id,
            order_id: args.order_id.toString(),
            currency: order.currency,
            reference: args.reference,
            created_at: new Date().toISOString(),
        };

        await ctx.db.insert("ledger_entries", {
            ...ledgerBase,
            type: "ticket_sale",
            account: "organizer",
            direction: "credit",
            amount: split.organizerGross,
            description: "Organizer gross ticket revenue",
        });
        await ctx.db.insert("ledger_entries", {
            ...ledgerBase,
            type: "ticket_africa_fee",
            account: "ticket_africa",
            direction: "credit",
            amount: split.ticketAfricaFee,
            description: "Abonten Tickets service fee collected from buyer",
        });
        if (split.smsDeliveryFee > 0) {
            await ctx.db.insert("ledger_entries", {
                ...ledgerBase,
                type: "sms_delivery_fee",
                account: "ticket_africa",
                direction: "credit",
                amount: split.smsDeliveryFee,
                description: "SMS and ticket delivery fee collected from buyer",
            });
        }
        if (split.buyerGatewayFee > 0) {
            await ctx.db.insert("ledger_entries", {
                ...ledgerBase,
                type: "gateway_buyer_fee",
                account: "payment_processor",
                direction: "credit",
                amount: split.buyerGatewayFee,
                description: "Payment processor charge borne by buyer",
            });
        }

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
            body: `Your Abonten Tickets order is confirmed. Open your wallet to view your QR tickets.`,
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
        gateway: v.optional(v.string()),
        gateway_response: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const order = await ctx.db
            .query("orders")
            .withIndex("by_payment_reference", q => q.eq("payment_reference", args.reference))
            .first();
        if (!order) throw new Error("No pending order found for this payment reference.");

        await ctx.runMutation(internal.payments.completeVerifiedOrder, {
            order_id: order._id,
            reference: args.reference,
            amount: args.amount,
            currency: args.currency,
            gateway: args.gateway,
            gateway_response: args.gateway_response,
        });

        return { success: true };
    },
});
