import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

const DEFAULT_TTL_SECONDS = 90;
const LONG_TTL_SECONDS = 300;

function redisConfig() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    return {
        url: url.replace(/\/$/, ""),
        token,
    };
}

async function redisCommand(command: unknown[]) {
    const config = redisConfig();
    if (!config) return null;

    const res = await fetch(config.url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${config.token}`,
            "content-type": "application/json",
        },
        body: JSON.stringify(command),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
}

async function getJson(key: string) {
    const body = await redisCommand(["GET", key]);
    if (!body?.result) return null;
    try {
        return JSON.parse(String(body.result));
    } catch {
        return null;
    }
}

async function setJson(key: string, value: unknown, ttlSeconds = DEFAULT_TTL_SECONDS) {
    await redisCommand(["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
}

export const getPublicEvents = action({
    args: {
        country: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<any[]> => {
        const limit = Math.min(Math.max(args.limit || 200, 1), 500);
        const key = `ta:v1:events:public:${args.country || "all"}:${limit}`;
        const cached = await getJson(key);
        if (cached) return cached;

        const events = await ctx.runQuery(api.events.listEvents, {
            country: args.country,
            limit,
        });
        await setJson(key, events, DEFAULT_TTL_SECONDS);
        return events;
    },
});

export const getUpcomingEvents = action({
    args: {
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<any[]> => {
        const limit = Math.min(Math.max(args.limit || 10, 1), 100);
        const key = `ta:v1:events:upcoming:${limit}`;
        const cached = await getJson(key);
        if (cached) return cached;

        const events = await ctx.runQuery(api.events.getUpcomingEvents, { limit });
        await setJson(key, events, DEFAULT_TTL_SECONDS);
        return events;
    },
});

export const getEventBySlug = action({
    args: {
        slug: v.string(),
    },
    handler: async (ctx, args): Promise<any | null> => {
        const slug = args.slug.trim().toLowerCase();
        const key = `ta:v1:event:slug:${slug}`;
        const cached = await getJson(key);
        if (cached) return cached;

        const event = await ctx.runQuery(api.events.getEventBySlug, { slug });
        if (event) await setJson(key, event, DEFAULT_TTL_SECONDS);
        return event;
    },
});

export const getPublicPolls = action({
    args: {},
    handler: async (ctx): Promise<any[]> => {
        const key = "ta:v1:polls:public";
        const cached = await getJson(key);
        if (cached) return cached;

        const polls = await ctx.runQuery(api.events.listPublicPolls, {});
        await setJson(key, polls, DEFAULT_TTL_SECONDS);
        return polls;
    },
});

export const warmPublicCache = action({
    args: {},
    handler: async (ctx): Promise<{ warmed: string[] }> => {
        const [events, upcoming, polls] = await Promise.all([
            ctx.runQuery(api.events.listEvents, { limit: 200 }),
            ctx.runQuery(api.events.getUpcomingEvents, { limit: 10 }),
            ctx.runQuery(api.events.listPublicPolls, {}),
        ]);

        await Promise.all([
            setJson("ta:v1:events:public:all:200", events, LONG_TTL_SECONDS),
            setJson("ta:v1:events:upcoming:10", upcoming, LONG_TTL_SECONDS),
            setJson("ta:v1:polls:public", polls, LONG_TTL_SECONDS),
        ]);

        return {
            warmed: ["public events", "upcoming events", "public polls"],
        };
    },
});
