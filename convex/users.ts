import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { sanitizeText, sanitizeEmail, sanitizePhone } from "./sanitize";

async function requireIdentity(ctx: any) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required.");
    return identity;
}

async function getCurrentUser(ctx: any) {
    const identity = await requireIdentity(ctx);
    const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q: any) => q.eq("clerk_id", identity.subject))
        .first();
    if (!user) throw new Error("User profile not found.");
    return { identity, user };
}

function identityEmail(identity: any, fallback?: string) {
    return String(identity.email || identity.emailAddress || fallback || "").trim().toLowerCase();
}

function resolveRole(
    existingRole: "buyer" | "organizer" | "admin" | undefined,
    requestedRole: "buyer" | "organizer"
) {
    if (existingRole === "admin") return "admin";
    if (existingRole === "organizer" || requestedRole === "organizer") return "organizer";
    return "buyer";
}

// Get a user by their Clerk ID
export const getByClerkId = query({
    args: { clerk_id: v.string() },
    handler: async (ctx, args) => {
        const identity = await requireIdentity(ctx);
        let callerRole = null;
        if (identity.subject !== args.clerk_id) {
            const caller = await ctx.db
                .query("users")
                .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
                .first();
            callerRole = caller?.role || null;
        }
        if (identity.subject !== args.clerk_id && callerRole !== "admin") {
            throw new Error("You can only read your own user profile.");
        }
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
        phone: v.optional(v.string()),
        role: v.optional(v.union(v.literal("buyer"), v.literal("organizer"))),
        preferred_language: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await requireIdentity(ctx);
        const clerkId = identity.subject;
        const email = identityEmail(identity, args.email);
        if (!email) throw new Error("Authenticated email is required.");

        const requestedRole = args.role ?? "buyer";
        const existing = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_id", clerkId))
            .first();

        if (existing) {
            const emailOwner = await ctx.db
                .query("users")
                .withIndex("by_email", (q) => q.eq("email", email))
                .first();
            if (emailOwner && emailOwner._id !== existing._id) {
                throw new Error("This email is already registered to another account.");
            }

            const updates: Record<string, any> = {
                email,
                first_name: sanitizeText(args.first_name),
                last_name: sanitizeText(args.last_name),
                role: resolveRole(existing.role, requestedRole),
            };

            if (args.phone !== undefined) updates.phone = sanitizePhone(args.phone);
            if (args.preferred_language !== undefined) updates.preferred_language = args.preferred_language;
            await ctx.db.patch(existing._id, updates);
            return existing._id;
        }

        const existingEmailUser = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();
        if (existingEmailUser?.clerk_id && existingEmailUser.clerk_id !== clerkId) {
            throw new Error("This email is already registered to another account.");
        }
        if (existingEmailUser) {
            await ctx.db.patch(existingEmailUser._id, {
                clerk_id: clerkId,
                first_name: sanitizeText(args.first_name),
                last_name: sanitizeText(args.last_name),
                phone: args.phone !== undefined ? sanitizePhone(args.phone) : undefined,
                preferred_language: args.preferred_language,
                role: resolveRole(existingEmailUser.role, requestedRole),
            });
            return existingEmailUser._id;
        }

        const role = resolveRole(undefined, requestedRole);
        const userId = await ctx.db.insert("users", {
            clerk_id: clerkId,
            email,
            first_name: sanitizeText(args.first_name),
            last_name: sanitizeText(args.last_name),
            phone: args.phone !== undefined ? sanitizePhone(args.phone) : undefined,
            role,
            preferred_language: args.preferred_language,
            joined_at: new Date().toISOString(),
        });

        const isOrganizer = role === "organizer";
        await ctx.runMutation(internal.messages.enqueue, {
            type: isOrganizer ? "welcome_organizer" : "welcome_buyer",
            channel: "email",
            recipient_email: email,
            recipient_phone: args.phone !== undefined ? sanitizePhone(args.phone) : undefined,
            recipient_name: args.first_name,
            user_id: userId,
            subject: isOrganizer ? "Welcome to AbontenTickets for Organizers" : "Welcome to AbontenTickets",
            body: isOrganizer
                ? `Hi ${args.first_name}, welcome to AbontenTickets. Your organizer account is ready. You can create your first event, add ticket tiers, and prepare for your first buyers.`
                : `Hi ${args.first_name}, welcome to AbontenTickets. Your account is ready. When organizers publish events, you can discover them, pay locally, and receive secure QR-code tickets.`,
            template_key: isOrganizer ? "welcome_organizer" : "welcome_buyer",
            data: {
                first_name: sanitizeText(args.first_name),
                last_name: sanitizeText(args.last_name),
                account_link: isOrganizer ? "/organizer-dashboard.html" : "/account.html",
                events_link: "/events.html",
            },
        });

        return userId;
    },
});

// Get organization owned by a user
export const getOrgByOwner = query({
    args: { owner_id: v.id("users") },
    handler: async (ctx, args) => {
        const { user } = await getCurrentUser(ctx);
        if (user._id !== args.owner_id && user.role !== "admin") {
            throw new Error("You can only read your own organization.");
        }
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
        const { user } = await getCurrentUser(ctx);
        if (user._id !== args.owner_id && user.role !== "admin") {
            throw new Error("You can only create an organization for your own account.");
        }
        if (user.role !== "organizer" && user.role !== "admin") {
            throw new Error("Organizer account required.");
        }

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
        if (args.org_id && promo.org_id !== args.org_id) return { valid: false, message: "Invalid promo code." };
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
            message: `Code applied: ${promo.discount_type === "percent" ? promo.discount_value + "% off" : "GHS " + (promo.discount_value / 100).toFixed(2) + " off"}`,
        };
    },
});


// Update language preference for the current user
export const updateLanguagePreference = mutation({
    args: { preferred_language: v.string() },
    handler: async (ctx, args) => {
        const { user } = await getCurrentUser(ctx);
        await ctx.db.patch(user._id, {
            preferred_language: args.preferred_language
        });
        return user._id;
    }
});
