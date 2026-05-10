import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

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
            const { id, email_addresses, first_name, last_name, phone_numbers } = event.data;
            const primaryEmail = email_addresses?.[0]?.email_address;
            const phone = phone_numbers?.[0]?.phone_number;

            if (!primaryEmail) {
                return new Response("Missing Email", { status: 400 });
            }

            await ctx.runMutation(internal.auth.syncClerkUser, {
                clerk_id: id,
                email: primaryEmail,
                first_name: first_name || "Unknown",
                last_name: last_name || "User",
                phone: phone || undefined,
            });
        }

        return new Response("", { status: 200 });
    }),
});

export default http;
