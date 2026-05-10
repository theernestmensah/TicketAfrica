/**
 * @file services/events.js
 * @description Event discovery, detail, and management service.
 *
 * DATABASE TABLES (Supabase / PostgreSQL):
 *   public.events             → core event record
 *   public.ticket_tiers       → ticket types per event (GA, VIP, etc.)
 *   public.event_categories   → category taxonomy
 *   public.venues             → venue records
 *   public.organizers         → organizer profiles
 *
 * ROW-LEVEL SECURITY (Supabase RLS):
 *   - Published events: readable by all (anon + authenticated)
 *   - Draft / private events: readable only by owning organizer
 *   - Insert / update / delete: restricted to organizer owner + admin role
 *
 * REALTIME:
 *   Ticket inventory counts update via Supabase Realtime channels.
 *   See services/realtime.js for subscription helpers.
 */

import { supabase, sb, TAError } from '../lib/supabase.js';

/** Default columns for list queries — avoids over-fetching */
const EVENT_LIST_COLS = `
  id, slug, title, subtitle, status,
  starts_at, ends_at, doors_at,
  cover_image_url, category, tags,
  city, country, venue:venues(id, name, address),
  organizer:organizers(id, name, logo_url, verified),
  min_price, max_price, currency,
  total_inventory, tickets_sold, is_sold_out, is_featured
`;

/** Full columns for detail queries */
const EVENT_DETAIL_COLS = `
  ${EVENT_LIST_COLS},
  description, lineup, agenda,
  age_restriction, dress_code, notes,
  latitude, longitude,
  ticket_tiers(
    id, name, description, price, currency,
    total_inventory, tickets_sold, is_sold_out,
    sale_starts_at, sale_ends_at, max_per_order,
    includes, sort_order
  ),
  faqs(question, answer, sort_order)
`;

export const EventService = {

    /**
     * List published events with optional filters and pagination.
     *
     * @param {{
     *   category?: string,
     *   city?: string,
     *   country?: string,
     *   dateFrom?: string,    ISO date string
     *   dateTo?: string,
     *   priceMin?: number,
     *   priceMax?: number,
     *   search?: string,
     *   isFree?: boolean,
     *   isAvailable?: boolean,
     *   sort?: 'trending'|'date_asc'|'date_desc'|'price_asc'|'price_desc',
     *   page?: number,
     *   limit?: number,
     * }} filters
     * @returns {Promise<{ events: import('../types.js').Event[], total: number, page: number, totalPages: number }>}
     */
    async list(filters = {}) {
        const {
            category,
            city,
            country,
            dateFrom,
            dateTo,
            priceMin,
            priceMax,
            search,
            isFree,
            isAvailable,
            sort = 'trending',
            page = 1,
            limit = 12,
        } = filters;

        let query = supabase
            .from('events')
            .select(EVENT_LIST_COLS, { count: 'exact' })
            .eq('status', 'published');

        if (category) query = query.eq('category', category);
        if (city) query = query.ilike('city', `%${city}%`);
        if (country) query = query.eq('country', country);
        if (dateFrom) query = query.gte('starts_at', dateFrom);
        if (dateTo) query = query.lte('starts_at', dateTo);
        if (priceMin != null) query = query.gte('min_price', priceMin);
        if (priceMax != null) query = query.lte('min_price', priceMax);
        if (isFree) query = query.eq('min_price', 0);
        if (isAvailable) query = query.eq('is_sold_out', false);
        if (search) {
            query = query.or(
                `title.ilike.%${search}%,city.ilike.%${search}%,tags.cs.{${search}}`
            );
        }

        // Sorting
        const sortMap = {
            trending: { col: 'tickets_sold', asc: false },
            date_asc: { col: 'starts_at', asc: true },
            date_desc: { col: 'starts_at', asc: false },
            price_asc: { col: 'min_price', asc: true },
            price_desc: { col: 'min_price', asc: false },
        };
        const { col, asc } = sortMap[sort] ?? sortMap.trending;
        query = query.order(col, { ascending: asc });

        // Pagination
        const from = (page - 1) * limit;
        query = query.range(from, from + limit - 1);

        const { data, error, count } = await query;
        if (error) throw new TAError(error.message, error.code, error);

        return {
            events: data ?? [],
            total: count ?? 0,
            page,
            totalPages: Math.ceil((count ?? 0) / limit),
        };
    },

    /**
     * Get a single event by ID or slug.
     * @param {string} idOrSlug
     * @returns {Promise<import('../types.js').EventDetail>}
     */
    async getByIdOrSlug(idOrSlug) {
        // Try slug first (SEO-friendly URLs), fall back to UUID
        const isUUID = /^[0-9a-f-]{36}$/.test(idOrSlug);
        const query = supabase
            .from('events')
            .select(EVENT_DETAIL_COLS)
            .eq(isUUID ? 'id' : 'slug', idOrSlug)
            .eq('status', 'published')
            .single();

        const data = await sb(query);
        if (!data) throw new TAError('Event not found', 'EVENT_NOT_FOUND');
        return data;
    },

    /**
     * Get featured/promoted events for the homepage.
     * @param {number} limit
     * @returns {Promise<import('../types.js').Event[]>}
     */
    async getFeatured(limit = 6) {
        return sb(
            supabase
                .from('events')
                .select(EVENT_LIST_COLS)
                .eq('status', 'published')
                .eq('is_featured', true)
                .order('starts_at', { ascending: true })
                .limit(limit)
        );
    },

    /**
     * Get events happening in a city within the next N days.
     * @param {string} city
     * @param {number} days
     * @returns {Promise<import('../types.js').Event[]>}
     */
    async getByCity(city, days = 30) {
        const now = new Date().toISOString();
        const future = new Date(Date.now() + days * 86400000).toISOString();
        return sb(
            supabase
                .from('events')
                .select(EVENT_LIST_COLS)
                .eq('status', 'published')
                .ilike('city', `%${city}%`)
                .gte('starts_at', now)
                .lte('starts_at', future)
                .order('starts_at', { ascending: true })
                .limit(8)
        );
    },

    /**
     * Record a "view" impression for analytics.
     * Fire-and-forget — does not throw.
     * @param {string} eventId
     */
    async recordView(eventId) {
        supabase.rpc('increment_event_views', { event_id: eventId }).then();
    },

    // ──────────────────────────────────────────────────────────────────────────
    // Organizer methods (require authenticated organizer session)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Create a new event draft.
     * @param {Partial<import('../types.js').EventInput>} eventData
     * @returns {Promise<import('../types.js').Event>}
     */
    async create(eventData) {
        return sb(
            supabase
                .from('events')
                .insert({ ...eventData, status: 'draft' })
                .select()
                .single()
        );
    },

    /**
     * Update an existing event.
     * @param {string} eventId
     * @param {Partial<import('../types.js').EventInput>} updates
     * @returns {Promise<import('../types.js').Event>}
     */
    async update(eventId, updates) {
        return sb(
            supabase
                .from('events')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', eventId)
                .select()
                .single()
        );
    },

    /**
     * Publish an event (changes status from draft → published).
     * @param {string} eventId
     * @returns {Promise<import('../types.js').Event>}
     */
    async publish(eventId) {
        return this.update(eventId, { status: 'published', published_at: new Date().toISOString() });
    },

    /**
     * List events belonging to the calling organizer.
     * @param {string} organizerId
     * @returns {Promise<import('../types.js').Event[]>}
     */
    async listByOrganizer(organizerId) {
        return sb(
            supabase
                .from('events')
                .select(`${EVENT_LIST_COLS}, status, created_at`)
                .eq('organizer_id', organizerId)
                .order('starts_at', { ascending: false })
        );
    },
};
