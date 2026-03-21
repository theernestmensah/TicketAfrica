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
        phone: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const existingUser = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
            .unique();

        if (existingUser) {
            await ctx.db.patch(existingUser._id, {
                email: args.email,
                first_name: args.first_name,
                last_name: args.last_name,
                phone: args.phone
            });
            return existingUser._id;
        }

        return await ctx.db.insert("users", {
            clerk_id: args.clerk_id,
            email: args.email,
            first_name: args.first_name,
            last_name: args.last_name,
            phone: args.phone,
            role: "buyer", // default role
            joined_at: new Date().toISOString()
        });
    },
});
