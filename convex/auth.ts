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
        const email = args.email.trim().toLowerCase();
        const existingUser = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
            .unique();

        if (existingUser) {
            const emailOwner = await ctx.db
                .query("users")
                .withIndex("by_email", (q) => q.eq("email", email))
                .first();
            if (emailOwner && emailOwner._id !== existingUser._id) {
                throw new Error("This email is already registered to another account.");
            }

            const updates: {
                email: string;
                first_name: string;
                last_name: string;
                phone?: string;
                role?: "buyer" | "organizer" | "admin";
            } = {
                email,
                first_name: args.first_name,
                last_name: args.last_name,
            };

            if (args.phone !== undefined) updates.phone = args.phone;
            if (args.role && existingUser.role !== "admin") updates.role = args.role;

            await ctx.db.patch(existingUser._id, updates);
            return existingUser._id;
        }

        const existingEmailUser = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();

        if (existingEmailUser?.clerk_id && existingEmailUser.clerk_id !== args.clerk_id) {
            throw new Error("This email is already registered to another account.");
        }

        if (existingEmailUser) {
            await ctx.db.patch(existingEmailUser._id, {
                clerk_id: args.clerk_id,
                first_name: args.first_name,
                last_name: args.last_name,
                phone: args.phone,
                role: existingEmailUser.role === "admin" ? "admin" : role,
            });
            return existingEmailUser._id;
        }

        const userId = await ctx.db.insert("users", {
            clerk_id: args.clerk_id,
            email,
            first_name: args.first_name,
            last_name: args.last_name,
            phone: args.phone,
            role,
            joined_at: new Date().toISOString()
        });

        const isOrganizer = role === "organizer";
        await ctx.runMutation(internal.messages.enqueue, {
            type: isOrganizer ? "welcome_organizer" : "welcome_buyer",
            channel: "email",
            recipient_email: email,
            recipient_phone: args.phone,
            recipient_name: args.first_name,
            user_id: userId,
            subject: isOrganizer ? "Welcome to Ticket Africa for Organizers" : "Welcome to Ticket Africa",
            body: isOrganizer
                ? `Hi ${args.first_name}, welcome to Ticket Africa. Your organizer account is ready. You can create your first event, add ticket tiers, and prepare for your first buyers.`
                : `Hi ${args.first_name}, welcome to Ticket Africa. Your account is ready. When organizers publish events, you can discover them, pay locally, and receive secure QR-code tickets.`,
            template_key: isOrganizer ? "welcome_organizer" : "welcome_buyer",
            data: {
                first_name: args.first_name,
                last_name: args.last_name,
                account_link: isOrganizer ? "/organizer-dashboard.html" : "/account.html",
                events_link: "/events.html",
            },
        });

        return userId;
    },
});
