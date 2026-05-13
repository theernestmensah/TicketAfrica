import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Returns the currently authenticated user
 */
export const currentUser = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            return null;
        }

        return await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
            .unique();
    },
});

/**
 * Syncs users from Clerk webhook
 */
export const syncClerkUser = internalMutation({
    args: {
        clerk_id: v.string(),
        email: v.string(),
        first_name: v.string(),
        last_name: v.string(),
        phone: v.optional(v.string()),
        role: v.optional(v.union(v.literal("buyer"), v.literal("organizer"), v.literal("admin"))),
    },
    handler: async (ctx, args) => {
        const role = args.role ?? "buyer";
        const existingUser = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
            .unique();

        if (existingUser) {
            const updates: {
                email: string;
                first_name: string;
                last_name: string;
                phone?: string;
                role?: "buyer" | "organizer" | "admin";
            } = {
                email: args.email,
                first_name: args.first_name,
                last_name: args.last_name,
            };

            if (args.phone !== undefined) updates.phone = args.phone;
            if (args.role && existingUser.role !== "admin") updates.role = args.role;

            await ctx.db.patch(existingUser._id, updates);
            return existingUser._id;
        }

        const userId = await ctx.db.insert("users", {
            clerk_id: args.clerk_id,
            email: args.email,
            first_name: args.first_name,
            last_name: args.last_name,
            phone: args.phone,
            role,
            joined_at: new Date().toISOString()
        });

        await ctx.runMutation(internal.messages.enqueue, {
            type: "welcome_buyer",
            channel: "email",
            recipient_email: args.email.trim().toLowerCase(),
            recipient_phone: args.phone,
            recipient_name: args.first_name,
            user_id: userId,
            subject: "Welcome to Ticket Africa",
            body: `Hi ${args.first_name}, welcome to Ticket Africa. Your account is ready.`,
            template_key: "welcome_buyer",
            data: {
                first_name: args.first_name,
                last_name: args.last_name,
                account_link: "/account.html",
                events_link: "/events.html",
            },
        });

        return userId;
    },
});
