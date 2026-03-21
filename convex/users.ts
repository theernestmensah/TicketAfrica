import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get a user by their Clerk ID
export const getByClerkId = query({
    args: { clerk_id: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
            .first();
    },
});

// Upsert user from Clerk (called on every sign-in)
export const upsertUser = mutation({
    args: {
        clerk_id: v.string(),
        email: v.string(),
        first_name: v.string(),
        last_name: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                email: args.email,
                first_name: args.first_name,
                last_name: args.last_name,
            });
            return existing._id;
        }

        return await ctx.db.insert("users", {
            clerk_id: args.clerk_id,
            email: args.email,
            first_name: args.first_name,
            last_name: args.last_name,
            role: "organizer",
            joined_at: new Date().toISOString(),
        });
    },
});

// Get organization owned by a user
export const getOrgByOwner = query({
    args: { owner_id: v.id("users") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("organizations")
            .withIndex("by_owner", (q) => q.eq("owner_id", args.owner_id))
            .first();
    },
});

// Get or create an organization for a user (called after upsertUser)
export const getOrCreateOrg = mutation({
    args: {
        owner_id: v.id("users"),
        name: v.string(),
        email: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("organizations")
            .withIndex("by_owner", (q) => q.eq("owner_id", args.owner_id))
            .first();

        if (existing) return existing;

        // Derive a slug from the name
        const baseSlug = args.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const slug = baseSlug + "-" + Date.now().toString(36);

        const orgId = await ctx.db.insert("organizations", {
            owner_id: args.owner_id,
            name: args.name,
            slug,
            verified: false,
            created_at: new Date().toISOString(),
        });

        return await ctx.db.get(orgId);
    },
});

// Validate a promo code for a given org (called during checkout)
export const validatePromoCode = query({
    args: {
        code: v.string(),
        org_id: v.optional(v.id("organizations")),
    },
    handler: async (ctx, args) => {
        const promo = await ctx.db
            .query("promo_codes")
            .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
            .first();

        if (!promo) return { valid: false, message: "Invalid promo code." };
        if (!promo.active) return { valid: false, message: "This promo code has been deactivated." };
        if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
            return { valid: false, message: "This promo code has expired." };
        }
        if (promo.max_uses && promo.uses >= promo.max_uses) {
            return { valid: false, message: "This promo code has reached its usage limit." };
        }

        return {
            valid: true,
            discount_type: promo.discount_type,
            discount_value: promo.discount_value,
            message: `Code applied: ${promo.discount_type === "percent" ? promo.discount_value + "% off" : "GH₵" + (promo.discount_value / 100).toFixed(2) + " off"}`,
        };
    },
});

// Increment promo code uses after successful order
export const redeemPromoCode = mutation({
    args: { code: v.string() },
    handler: async (ctx, args) => {
        const promo = await ctx.db
            .query("promo_codes")
            .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
            .first();
        if (promo) {
            await ctx.db.patch(promo._id, { uses: promo.uses + 1 });
        }
    },
});
