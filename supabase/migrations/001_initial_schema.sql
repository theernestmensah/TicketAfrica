-- =============================================================================
-- Ticket Africa — Supabase Database Schema
-- Migration: 001_initial_schema.sql
--
-- Run this in Supabase SQL Editor or via `supabase db push`
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- Full text search on event titles
CREATE EXTENSION IF NOT EXISTS "unaccent";  -- Handle accented characters in search

-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TYPE event_status      AS ENUM ('draft', 'published', 'cancelled', 'ended');
CREATE TYPE ticket_status     AS ENUM ('issued', 'used', 'transferred', 'refunded', 'cancelled');
CREATE TYPE order_status      AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE payment_method    AS ENUM ('mobile_money', 'card', 'bank_transfer', 'wallet', 'ussd', 'cash');
CREATE TYPE payout_status     AS ENUM ('requested', 'processing', 'completed', 'failed');
CREATE TYPE scan_result       AS ENUM ('valid', 'used', 'invalid', 'expired', 'wrong_event');
CREATE TYPE resale_status     AS ENUM ('listed', 'sold', 'cancelled');
CREATE TYPE transfer_method   AS ENUM ('phone', 'email');

-- =============================================================================
-- PROFILES (extends auth.users)
-- =============================================================================
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  phone         TEXT,                          -- E.164 format
  country       CHAR(3),                       -- ISO 3166-1 alpha-3
  avatar_url    TEXT,
  is_organizer  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ
);

-- Auto-create profile on first sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, country)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'country'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- VENUES
-- =============================================================================
CREATE TABLE public.venues (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  address     TEXT NOT NULL,
  city        TEXT NOT NULL,
  country     CHAR(3) NOT NULL,
  latitude    NUMERIC(9,6),
  longitude   NUMERIC(9,6),
  capacity    INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_venues_city ON public.venues (city);

-- =============================================================================
-- ORGANIZERS
-- =============================================================================
CREATE TABLE public.organizers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  logo_url      TEXT,
  website_url   TEXT,
  email         TEXT,
  phone         TEXT,
  country       CHAR(3),
  verified      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ,
  UNIQUE (owner_id)
);

CREATE INDEX idx_organizers_owner ON public.organizers (owner_id);

-- =============================================================================
-- EVENTS
-- =============================================================================
CREATE TABLE public.events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id      UUID NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  venue_id          UUID REFERENCES public.venues(id),
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  subtitle          TEXT,
  description       TEXT,
  lineup            TEXT[],
  status            event_status NOT NULL DEFAULT 'draft',
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ,
  doors_at          TIMESTAMPTZ,
  cover_image_url   TEXT,
  category          TEXT NOT NULL,            -- concert, festival, sports, church, etc.
  tags              TEXT[],
  city              TEXT NOT NULL,
  country           CHAR(3) NOT NULL,
  latitude          NUMERIC(9,6),
  longitude         NUMERIC(9,6),
  min_price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency          CHAR(3) NOT NULL DEFAULT 'GHS',
  total_inventory   INTEGER NOT NULL DEFAULT 0,
  tickets_sold      INTEGER NOT NULL DEFAULT 0,
  is_sold_out       BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured       BOOLEAN NOT NULL DEFAULT FALSE,
  age_restriction   INTEGER,
  dress_code        TEXT,
  notes             TEXT,
  views_count       INTEGER NOT NULL DEFAULT 0,
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ,
  -- Full-text search vector
  search_vector     TSVECTOR
    GENERATED ALWAYS AS (
      to_tsvector('english',
        unaccent(title) || ' ' ||
        unaccent(COALESCE(subtitle, '')) || ' ' ||
        unaccent(city) || ' ' ||
        COALESCE(array_to_string(tags, ' '), '')
      )
    ) STORED
);

CREATE INDEX idx_events_status      ON public.events (status);
CREATE INDEX idx_events_starts_at   ON public.events (starts_at);
CREATE INDEX idx_events_city        ON public.events (city);
CREATE INDEX idx_events_category    ON public.events (category);
CREATE INDEX idx_events_organizer   ON public.events (organizer_id);
CREATE INDEX idx_events_featured    ON public.events (is_featured) WHERE is_featured = TRUE;
CREATE INDEX idx_events_search      ON public.events USING GIN (search_vector);

-- Increment view counter (called from client via RPC — no auth needed)
CREATE OR REPLACE FUNCTION public.increment_event_views(event_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.events SET views_count = views_count + 1 WHERE id = event_id;
$$;

-- =============================================================================
-- TICKET TIERS
-- =============================================================================
CREATE TABLE public.ticket_tiers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id          UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  price             NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency          CHAR(3) NOT NULL DEFAULT 'GHS',
  total_inventory   INTEGER NOT NULL,
  tickets_sold      INTEGER NOT NULL DEFAULT 0,
  is_sold_out       BOOLEAN NOT NULL DEFAULT FALSE,
  max_per_order     INTEGER NOT NULL DEFAULT 6,
  sale_starts_at    TIMESTAMPTZ,
  sale_ends_at      TIMESTAMPTZ,
  includes          TEXT[],
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tiers_event ON public.ticket_tiers (event_id);

-- Add ticket_tiers to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_tiers;

-- =============================================================================
-- EVENT FAQS
-- =============================================================================
CREATE TABLE public.event_faqs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- =============================================================================
-- ORDERS
-- =============================================================================
CREATE TABLE public.orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id          UUID NOT NULL REFERENCES public.events(id),
  organizer_id      UUID NOT NULL REFERENCES public.organizers(id),
  attendee_id       UUID REFERENCES auth.users(id),   -- NULL for guest checkout
  reference         TEXT NOT NULL UNIQUE,             -- Gateway payment reference
  status            order_status NOT NULL DEFAULT 'pending',
  total             NUMERIC(12,2) NOT NULL,
  currency          CHAR(3) NOT NULL,
  payment_method    payment_method NOT NULL,
  gateway           TEXT,                             -- paystack | flutterwave
  promo_code        TEXT,
  promo_discount    NUMERIC(12,2) DEFAULT 0,
  service_fee       NUMERIC(12,2) DEFAULT 0,
  attendee_name     TEXT NOT NULL,
  attendee_email    TEXT NOT NULL,
  attendee_phone    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  metadata          JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_orders_attendee   ON public.orders (attendee_id);
CREATE INDEX idx_orders_organizer  ON public.orders (organizer_id);
CREATE INDEX idx_orders_event      ON public.orders (event_id);
CREATE INDEX idx_orders_reference  ON public.orders (reference);
CREATE INDEX idx_orders_status     ON public.orders (status);

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- =============================================================================
-- TICKETS (one row per issued ticket seat)
-- =============================================================================
CREATE TABLE public.tickets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_id          UUID NOT NULL REFERENCES public.events(id),
  tier_id           UUID NOT NULL REFERENCES public.ticket_tiers(id),
  organizer_id      UUID NOT NULL REFERENCES public.organizers(id),
  holder_id         UUID REFERENCES auth.users(id),
  holder_name       TEXT NOT NULL,
  holder_email      TEXT NOT NULL,
  holder_phone      TEXT,
  ticket_number     TEXT NOT NULL UNIQUE,   -- TKA-YYYY-NNNNN
  qr_storage_path   TEXT,                   -- Path in ticket-assets bucket (private)
  qr_nonce          UUID DEFAULT uuid_generate_v4(),  -- Rotates on every valid scan
  seat              TEXT,                   -- e.g. "Block C, Row 12, Seat 7"
  status            ticket_status NOT NULL DEFAULT 'issued',
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at           TIMESTAMPTZ,
  transferred_at    TIMESTAMPTZ
);

CREATE INDEX idx_tickets_holder    ON public.tickets (holder_id);
CREATE INDEX idx_tickets_event     ON public.tickets (event_id);
CREATE INDEX idx_tickets_order     ON public.tickets (order_id);
CREATE INDEX idx_tickets_number    ON public.tickets (ticket_number);
CREATE INDEX idx_tickets_nonce     ON public.tickets (qr_nonce);

-- =============================================================================
-- TICKET TRANSFERS (audit log)
-- =============================================================================
CREATE TABLE public.ticket_transfers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id        UUID NOT NULL REFERENCES public.tickets(id),
  from_user_id     UUID REFERENCES auth.users(id),
  to_phone         TEXT,
  to_email         TEXT,
  message          TEXT,
  transferred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TICKET RESALES
-- =============================================================================
CREATE TABLE public.ticket_resales (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id      UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  asking_price   NUMERIC(12,2) NOT NULL,
  currency       CHAR(3) NOT NULL,
  status         resale_status NOT NULL DEFAULT 'listed',
  listed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sold_at        TIMESTAMPTZ
);

-- =============================================================================
-- PROMO CODES
-- =============================================================================
CREATE TABLE public.promo_codes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id    UUID NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  event_id        UUID REFERENCES public.events(id) ON DELETE CASCADE,  -- NULL = all events
  code            TEXT NOT NULL,
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value  NUMERIC(12,2) NOT NULL,
  max_uses        INTEGER,
  times_used      INTEGER NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  tier_ids        UUID[],   -- NULL = applies to all tiers
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organizer_id, code)
);

-- =============================================================================
-- SCAN EVENTS (gate check-in audit log)
-- =============================================================================
CREATE TABLE public.scan_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id    UUID REFERENCES public.tickets(id),
  event_id     UUID NOT NULL REFERENCES public.events(id),
  organizer_id UUID REFERENCES public.organizers(id),
  result       scan_result NOT NULL,
  gate         TEXT,
  scanned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  holder_name  TEXT,
  tier_name    TEXT,
  device_id    TEXT   -- For fraud correlation across gates
);

CREATE INDEX idx_scan_event_id  ON public.scan_events (event_id);
CREATE INDEX idx_scan_ticket_id ON public.scan_events (ticket_id);
CREATE INDEX idx_scan_result    ON public.scan_events (result);

-- =============================================================================
-- ORGANIZER BALANCES (tracks available payout funds)
-- =============================================================================
CREATE TABLE public.organizer_balances (
  organizer_id       UUID PRIMARY KEY REFERENCES public.organizers(id),
  available_balance  NUMERIC(12,2) NOT NULL DEFAULT 0,
  pending_balance    NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency           CHAR(3) NOT NULL DEFAULT 'GHS',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- PAYOUTS
-- =============================================================================
CREATE TABLE public.payouts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id     UUID NOT NULL REFERENCES public.organizers(id),
  amount           NUMERIC(12,2) NOT NULL,
  currency         CHAR(3) NOT NULL,
  status           payout_status NOT NULL DEFAULT 'requested',
  bank_name        TEXT,
  account_number   TEXT,
  momo_number      TEXT,
  reference        TEXT,
  notes            TEXT,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ
);

-- =============================================================================
-- ANALYTICS VIEWS (used by OrganizerService)
-- =============================================================================

-- Per-event stats view
CREATE OR REPLACE VIEW public.organizer_event_stats AS
SELECT
  e.id,
  e.organizer_id,
  e.title,
  e.slug,
  e.starts_at,
  e.city,
  e.status,
  e.cover_image_url,
  v.name AS venue_name,
  e.total_inventory,
  e.tickets_sold,
  ROUND((e.tickets_sold::NUMERIC / NULLIF(e.total_inventory, 0)) * 100, 1) AS sell_through_pct,
  COALESCE(SUM(o.total - o.service_fee), 0) AS gross_revenue,
  e.currency
FROM public.events e
LEFT JOIN public.venues v ON v.id = e.venue_id
LEFT JOIN public.orders o ON o.event_id = e.id AND o.status = 'completed'
GROUP BY e.id, v.name;

-- Daily sales timeseries view
CREATE OR REPLACE VIEW public.organizer_daily_sales AS
SELECT
  e.organizer_id,
  o.event_id,
  DATE(o.completed_at) AS date,
  COUNT(t.id) AS tickets_sold,
  SUM(o.total - o.service_fee) AS revenue,
  o.currency
FROM public.orders o
JOIN public.events e ON e.id = o.event_id
JOIN public.tickets t ON t.order_id = o.id
WHERE o.status = 'completed'
GROUP BY e.organizer_id, o.event_id, DATE(o.completed_at), o.currency;

-- =============================================================================
-- RPC: Organizer overview stats
-- =============================================================================
CREATE OR REPLACE FUNCTION public.organizer_overview_stats(org_id UUID)
RETURNS TABLE (
  total_tickets_sold  BIGINT,
  gross_revenue       NUMERIC,
  active_events_count BIGINT,
  avg_sell_through    NUMERIC,
  currency            CHAR(3)
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(SUM(e.tickets_sold), 0)                                            AS total_tickets_sold,
    COALESCE(SUM(o.total - o.service_fee), 0)                                   AS gross_revenue,
    COUNT(DISTINCT CASE WHEN e.status = 'published' THEN e.id END)              AS active_events_count,
    COALESCE(ROUND(AVG(e.tickets_sold::NUMERIC / NULLIF(e.total_inventory,0)) * 100, 1), 0) AS avg_sell_through,
    MAX(e.currency)                                                              AS currency
  FROM public.events e
  LEFT JOIN public.orders o ON o.event_id = e.id AND o.status = 'completed'
  WHERE e.organizer_id = org_id;
$$;

-- =============================================================================
-- RPC: Event scan stats (for scanner UI)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.event_scan_stats(p_event_id UUID)
RETURNS TABLE (
  scanned   BIGINT,
  valid     BIGINT,
  rejected  BIGINT,
  remaining BIGINT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COUNT(*) FILTER (WHERE result != 'wrong_event')                AS scanned,
    COUNT(*) FILTER (WHERE result = 'valid')                       AS valid,
    COUNT(*) FILTER (WHERE result NOT IN ('valid', 'wrong_event')) AS rejected,
    (SELECT total_inventory - tickets_sold FROM public.events WHERE id = p_event_id) AS remaining
  FROM public.scan_events
  WHERE event_id = p_event_id;
$$;

-- Ticket number generator: TKA-YYYY-NNNNN
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 10000 INCREMENT 1;
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TEXT LANGUAGE sql AS $$
  SELECT 'TKA-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('ticket_number_seq')::TEXT, 5, '0');
$$;

-- =============================================================================
-- ROW-LEVEL SECURITY (RLS)
-- =============================================================================
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_tiers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_resales   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts          ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own row
CREATE POLICY "profiles_own_read"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_own_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Events: published events are readable by all; organizer manages own events
CREATE POLICY "events_public_read"     ON public.events FOR SELECT USING (status = 'published');
CREATE POLICY "events_organizer_all"   ON public.events USING (
  organizer_id IN (SELECT id FROM public.organizers WHERE owner_id = auth.uid())
);

-- Ticket tiers: inherit event visibility
CREATE POLICY "tiers_public_read"  ON public.ticket_tiers FOR SELECT USING (
  event_id IN (SELECT id FROM public.events WHERE status = 'published')
);
CREATE POLICY "tiers_organizer_all" ON public.ticket_tiers USING (
  event_id IN (SELECT id FROM public.events WHERE organizer_id IN (
    SELECT id FROM public.organizers WHERE owner_id = auth.uid()
  ))
);

-- Orders: buyer sees own orders, organizer sees orders for their events
CREATE POLICY "orders_buyer_read"     ON public.orders FOR SELECT USING (attendee_id = auth.uid());
CREATE POLICY "orders_organizer_read" ON public.orders FOR SELECT USING (
  organizer_id IN (SELECT id FROM public.organizers WHERE owner_id = auth.uid())
);

-- Tickets: holder sees own tickets, organizer sees tickets for their events
CREATE POLICY "tickets_holder_read"    ON public.tickets FOR SELECT USING (holder_id = auth.uid());
CREATE POLICY "tickets_organizer_read" ON public.tickets FOR SELECT USING (
  organizer_id IN (SELECT id FROM public.organizers WHERE owner_id = auth.uid())
);

-- Organizers: owner manages own organizer profile
CREATE POLICY "organizers_public_read"  ON public.organizers FOR SELECT USING (TRUE);
CREATE POLICY "organizers_owner_update" ON public.organizers FOR UPDATE USING (owner_id = auth.uid());

-- Payouts: organizer sees own payouts
CREATE POLICY "payouts_organizer" ON public.payouts USING (
  organizer_id IN (SELECT id FROM public.organizers WHERE owner_id = auth.uid())
);

-- Organizer balances: organizer sees own balance
CREATE POLICY "balances_organizer" ON public.organizer_balances USING (
  organizer_id IN (SELECT id FROM public.organizers WHERE owner_id = auth.uid())
);

-- Scan events: organizer sees scans for their events
CREATE POLICY "scans_organizer" ON public.scan_events FOR SELECT USING (
  organizer_id IN (SELECT id FROM public.organizers WHERE owner_id = auth.uid())
);
