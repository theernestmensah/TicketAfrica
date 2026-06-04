import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

function timingSafeEqual(a: string, b: string) {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
        mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
}

function bytesToHex(bytes: ArrayBuffer) {
    return Array.from(new Uint8Array(bytes))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function hmacSha512Hex(secret: string, payload: string) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-512" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    return bytesToHex(signature);
}

http.route({
    path: "/clerk",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        const payloadString = await request.text();
        const headerPayload = request.headers;

        let event;
        try {
            const { Webhook } = await import("svix");
            // @ts-ignore
            const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET || "");
            event = wh.verify(payloadString, {
                "svix-id": headerPayload.get("svix-id")!,
                "svix-timestamp": headerPayload.get("svix-timestamp")!,
                "svix-signature": headerPayload.get("svix-signature")!,
            }) as any;
        } catch (err) {
            console.error("Error verifying webhook:", err);
            return new Response("Error occurred", { status: 400 });
        }

        const eventType = event.type;

        // Sync User creation/updates
        if (eventType === "user.created" || eventType === "user.updated") {
            const { id, email_addresses, first_name, last_name, phone_numbers, unsafe_metadata, public_metadata } = event.data;
            const primaryEmail = email_addresses?.[0].email_address;
            const phone = phone_numbers?.[0].phone_number;
            const unsafeRole = unsafe_metadata.role;
            const publicRole = public_metadata.role;
            const role = publicRole === "admin"
                ? "admin"
                : (unsafeRole === "organizer" || publicRole === "organizer")
                    ? "organizer"
                    : (unsafeRole === "buyer" || publicRole === "buyer")
                        ? "buyer"
                        : undefined;

            if (!primaryEmail) {
                return new Response("Missing Email", { status: 400 });
            }

            await ctx.runMutation(internal.auth.syncClerkUser, {
                clerk_id: id,
                email: primaryEmail,
                first_name: first_name || "Unknown",
                last_name: last_name || "User",
                phone: phone || undefined,
                role,
            });
        }

        return new Response("", { status: 200 });
    }),
});

http.route({
    path: "/paystack/webhook",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret) {
            console.error("[Paystack] Missing PAYSTACK_SECRET_KEY");
            return new Response("Webhook not configured", { status: 500 });
        }

        const payload = await request.text();
        const suppliedSignature = request.headers.get("x-paystack-signature") || "";
        const expectedSignature = await hmacSha512Hex(secret, payload);

        if (!timingSafeEqual(suppliedSignature, expectedSignature)) {
            console.warn("[Paystack] Invalid webhook signature");
            return new Response("Invalid signature", { status: 401 });
        }

        let event;
        try {
            event = JSON.parse(payload);
        } catch {
            return new Response("Invalid JSON", { status: 400 });
        }

        if (event?.event !== "charge.success") {
            return new Response("Ignored", { status: 200 });
        }

        const data = event.data || {};
        const reference = data.reference;
        const amount = data.amount;
        const currency = data.currency;
        if (!reference || typeof amount !== "number" || !currency) {
            return new Response("Missing payment data", { status: 400 });
        }

        try {
            await ctx.runMutation(internal.payments.completeVerifiedOrderByReference, {
                reference,
                amount,
                currency,
                gateway_response: data.gateway_response || data.channel || undefined,
            });
        } catch (error: any) {
            console.error("[Paystack] Webhook completion failed:", error?.message || error);
            return new Response("Completion failed", { status: 500 });
        }

        return new Response("OK", { status: 200 });
    }),
});

http.route({
    path: "/moolre/webhook",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        let event;
        try {
            event = await request.json();
        } catch {
            return new Response("Invalid JSON", { status: 400 });
        }

        const data = event?.data || {};
        const reference = data.externalref || data.reference || event?.externalref || event?.reference;
        if (!reference) {
            return new Response("Missing payment reference", { status: 400 });
        }

        try {
            await ctx.runAction(internal.payments.verifyMoolreReferenceInternal, {
                reference,
            });
        } catch (error: any) {
            console.error("[Moolre] Webhook verification failed:", error?.message || error);
            return new Response("Verification failed", { status: 500 });
        }

        return new Response("OK", { status: 200 });
    }),
});

export default http;
