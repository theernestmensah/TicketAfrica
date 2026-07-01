-- =============================================================================
-- AbontenTickets - RLS hardening
-- Applies one standard access model across every public table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Access helper functions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', FALSE)
      OR COALESCE((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin', FALSE);
$$;

CREATE OR REPLACE FUNCTION public.owns_organizer(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.organizers o
        WHERE o.id = org_id
          AND o.owner_id = auth.uid()
      );
$$;

CREATE OR REPLACE FUNCTION public.owns_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.events e
        JOIN public.organizers o ON o.id = e.organizer_id
        WHERE e.id = p_event_id
          AND o.owner_id = auth.uid()
      );
$$;

CREATE OR REPLACE FUNCTION public.can_read_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
        SELECT 1
        FROM public.events e
        WHERE e.id = p_event_id
          AND e.status = 'published'
      )
      OR public.owns_event(p_event_id);
$$;

CREATE OR REPLACE FUNCTION public.event_organizer_matches(p_event_id UUID, org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = p_event_id
      AND e.organizer_id = org_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_ticket_holder(p_ticket_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.tickets t
        WHERE t.id = p_ticket_id
          AND t.holder_id = auth.uid()
      );
$$;

CREATE OR REPLACE FUNCTION public.can_read_ticket(p_ticket_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_ticket_holder(p_ticket_id)
      OR EXISTS (
        SELECT 1
        FROM public.tickets t
        WHERE t.id = p_ticket_id
          AND public.owns_organizer(t.organizer_id)
      );
$$;

CREATE OR REPLACE FUNCTION public.can_create_order(
  p_event_id UUID,
  p_organizer_id UUID,
  p_attendee_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR (
        EXISTS (
          SELECT 1
          FROM public.events e
          WHERE e.id = p_event_id
            AND e.organizer_id = p_organizer_id
            AND e.status = 'published'
        )
        AND (p_attendee_id IS NULL OR p_attendee_id = auth.uid())
      );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owns_organizer(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owns_event(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_event(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_organizer_matches(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_ticket_holder(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_ticket(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_order(UUID, UUID, UUID) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS on every public table
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_resales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.venues FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organizers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_tiers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.event_faqs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_transfers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_resales FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.scan_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_balances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payouts FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Replace older broad policies with command-specific policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_own_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "venues_public_select" ON public.venues;
DROP POLICY IF EXISTS "venues_admin_insert" ON public.venues;
DROP POLICY IF EXISTS "venues_admin_update" ON public.venues;
DROP POLICY IF EXISTS "venues_admin_delete" ON public.venues;

CREATE POLICY "venues_public_select"
  ON public.venues FOR SELECT
  USING (TRUE);

CREATE POLICY "venues_admin_insert"
  ON public.venues FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "venues_admin_update"
  ON public.venues FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "venues_admin_delete"
  ON public.venues FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "organizers_public_read" ON public.organizers;
DROP POLICY IF EXISTS "organizers_owner_update" ON public.organizers;
DROP POLICY IF EXISTS "organizers_public_select" ON public.organizers;
DROP POLICY IF EXISTS "organizers_insert_owner" ON public.organizers;
DROP POLICY IF EXISTS "organizers_update_owner" ON public.organizers;
DROP POLICY IF EXISTS "organizers_delete_owner" ON public.organizers;

CREATE POLICY "organizers_public_select"
  ON public.organizers FOR SELECT
  USING (TRUE);

CREATE POLICY "organizers_insert_owner"
  ON public.organizers FOR INSERT
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "organizers_update_owner"
  ON public.organizers FOR UPDATE
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "organizers_delete_owner"
  ON public.organizers FOR DELETE
  USING (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "events_public_read" ON public.events;
DROP POLICY IF EXISTS "events_organizer_all" ON public.events;
DROP POLICY IF EXISTS "events_select_public_or_owner" ON public.events;
DROP POLICY IF EXISTS "events_insert_owner" ON public.events;
DROP POLICY IF EXISTS "events_update_owner" ON public.events;
DROP POLICY IF EXISTS "events_delete_owner" ON public.events;

CREATE POLICY "events_select_public_or_owner"
  ON public.events FOR SELECT
  USING (status = 'published' OR public.owns_organizer(organizer_id));

CREATE POLICY "events_insert_owner"
  ON public.events FOR INSERT
  WITH CHECK (public.owns_organizer(organizer_id));

CREATE POLICY "events_update_owner"
  ON public.events FOR UPDATE
  USING (public.owns_organizer(organizer_id))
  WITH CHECK (public.owns_organizer(organizer_id));

CREATE POLICY "events_delete_owner"
  ON public.events FOR DELETE
  USING (public.owns_organizer(organizer_id));

DROP POLICY IF EXISTS "tiers_public_read" ON public.ticket_tiers;
DROP POLICY IF EXISTS "tiers_organizer_all" ON public.ticket_tiers;
DROP POLICY IF EXISTS "tiers_select_public_or_owner" ON public.ticket_tiers;
DROP POLICY IF EXISTS "tiers_insert_owner" ON public.ticket_tiers;
DROP POLICY IF EXISTS "tiers_update_owner" ON public.ticket_tiers;
DROP POLICY IF EXISTS "tiers_delete_owner" ON public.ticket_tiers;

CREATE POLICY "tiers_select_public_or_owner"
  ON public.ticket_tiers FOR SELECT
  USING (public.can_read_event(event_id));

CREATE POLICY "tiers_insert_owner"
  ON public.ticket_tiers FOR INSERT
  WITH CHECK (public.owns_event(event_id));

CREATE POLICY "tiers_update_owner"
  ON public.ticket_tiers FOR UPDATE
  USING (public.owns_event(event_id))
  WITH CHECK (public.owns_event(event_id));

CREATE POLICY "tiers_delete_owner"
  ON public.ticket_tiers FOR DELETE
  USING (public.owns_event(event_id));

DROP POLICY IF EXISTS "faqs_select_public_or_owner" ON public.event_faqs;
DROP POLICY IF EXISTS "faqs_insert_owner" ON public.event_faqs;
DROP POLICY IF EXISTS "faqs_update_owner" ON public.event_faqs;
DROP POLICY IF EXISTS "faqs_delete_owner" ON public.event_faqs;

CREATE POLICY "faqs_select_public_or_owner"
  ON public.event_faqs FOR SELECT
  USING (public.can_read_event(event_id));

CREATE POLICY "faqs_insert_owner"
  ON public.event_faqs FOR INSERT
  WITH CHECK (public.owns_event(event_id));

CREATE POLICY "faqs_update_owner"
  ON public.event_faqs FOR UPDATE
  USING (public.owns_event(event_id))
  WITH CHECK (public.owns_event(event_id));

CREATE POLICY "faqs_delete_owner"
  ON public.event_faqs FOR DELETE
  USING (public.owns_event(event_id));

DROP POLICY IF EXISTS "orders_buyer_read" ON public.orders;
DROP POLICY IF EXISTS "orders_organizer_read" ON public.orders;
DROP POLICY IF EXISTS "orders_select_buyer_or_owner" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_checkout" ON public.orders;
DROP POLICY IF EXISTS "orders_update_admin" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_admin" ON public.orders;

CREATE POLICY "orders_select_buyer_or_owner"
  ON public.orders FOR SELECT
  USING (
    attendee_id = auth.uid()
    OR public.owns_organizer(organizer_id)
    OR public.is_admin()
  );

CREATE POLICY "orders_insert_checkout"
  ON public.orders FOR INSERT
  WITH CHECK (
    auth.role() IN ('anon', 'authenticated')
    AND public.can_create_order(event_id, organizer_id, attendee_id)
  );

CREATE POLICY "orders_update_admin"
  ON public.orders FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "orders_delete_admin"
  ON public.orders FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "tickets_holder_read" ON public.tickets;
DROP POLICY IF EXISTS "tickets_organizer_read" ON public.tickets;
DROP POLICY IF EXISTS "tickets_select_holder_or_owner" ON public.tickets;
DROP POLICY IF EXISTS "tickets_insert_owner" ON public.tickets;
DROP POLICY IF EXISTS "tickets_update_owner" ON public.tickets;
DROP POLICY IF EXISTS "tickets_delete_owner" ON public.tickets;

CREATE POLICY "tickets_select_holder_or_owner"
  ON public.tickets FOR SELECT
  USING (
    holder_id = auth.uid()
    OR public.owns_organizer(organizer_id)
    OR public.is_admin()
  );

CREATE POLICY "tickets_insert_owner"
  ON public.tickets FOR INSERT
  WITH CHECK (
    public.owns_organizer(organizer_id)
    AND public.event_organizer_matches(event_id, organizer_id)
    AND public.can_read_event(event_id)
  );

CREATE POLICY "tickets_update_owner"
  ON public.tickets FOR UPDATE
  USING (public.owns_organizer(organizer_id) OR public.is_admin())
  WITH CHECK (
    (public.owns_organizer(organizer_id) OR public.is_admin())
    AND public.event_organizer_matches(event_id, organizer_id)
  );

CREATE POLICY "tickets_delete_owner"
  ON public.tickets FOR DELETE
  USING (public.owns_organizer(organizer_id) OR public.is_admin());

DROP POLICY IF EXISTS "transfers_select_related" ON public.ticket_transfers;
DROP POLICY IF EXISTS "transfers_insert_holder" ON public.ticket_transfers;
DROP POLICY IF EXISTS "transfers_delete_admin" ON public.ticket_transfers;

CREATE POLICY "transfers_select_related"
  ON public.ticket_transfers FOR SELECT
  USING (
    from_user_id = auth.uid()
    OR public.can_read_ticket(ticket_id)
  );

CREATE POLICY "transfers_insert_holder"
  ON public.ticket_transfers FOR INSERT
  WITH CHECK (
    public.is_ticket_holder(ticket_id)
    AND (from_user_id IS NULL OR from_user_id = auth.uid())
  );

CREATE POLICY "transfers_delete_admin"
  ON public.ticket_transfers FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "resales_select_public_or_related" ON public.ticket_resales;
DROP POLICY IF EXISTS "resales_insert_holder" ON public.ticket_resales;
DROP POLICY IF EXISTS "resales_update_holder" ON public.ticket_resales;
DROP POLICY IF EXISTS "resales_delete_holder" ON public.ticket_resales;

CREATE POLICY "resales_select_public_or_related"
  ON public.ticket_resales FOR SELECT
  USING (status = 'listed' OR public.can_read_ticket(ticket_id));

CREATE POLICY "resales_insert_holder"
  ON public.ticket_resales FOR INSERT
  WITH CHECK (public.is_ticket_holder(ticket_id));

CREATE POLICY "resales_update_holder"
  ON public.ticket_resales FOR UPDATE
  USING (public.is_ticket_holder(ticket_id))
  WITH CHECK (public.is_ticket_holder(ticket_id));

CREATE POLICY "resales_delete_holder"
  ON public.ticket_resales FOR DELETE
  USING (public.is_ticket_holder(ticket_id));

DROP POLICY IF EXISTS "promo_codes_select_owner" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_insert_owner" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_update_owner" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_delete_owner" ON public.promo_codes;

CREATE POLICY "promo_codes_select_owner"
  ON public.promo_codes FOR SELECT
  USING (public.owns_organizer(organizer_id));

CREATE POLICY "promo_codes_insert_owner"
  ON public.promo_codes FOR INSERT
  WITH CHECK (
    public.owns_organizer(organizer_id)
    AND (event_id IS NULL OR public.owns_event(event_id))
  );

CREATE POLICY "promo_codes_update_owner"
  ON public.promo_codes FOR UPDATE
  USING (public.owns_organizer(organizer_id))
  WITH CHECK (
    public.owns_organizer(organizer_id)
    AND (event_id IS NULL OR public.owns_event(event_id))
  );

CREATE POLICY "promo_codes_delete_owner"
  ON public.promo_codes FOR DELETE
  USING (public.owns_organizer(organizer_id));

DROP POLICY IF EXISTS "scans_organizer" ON public.scan_events;
DROP POLICY IF EXISTS "scan_events_select_owner" ON public.scan_events;
DROP POLICY IF EXISTS "scan_events_insert_owner" ON public.scan_events;
DROP POLICY IF EXISTS "scan_events_delete_admin" ON public.scan_events;

CREATE POLICY "scan_events_select_owner"
  ON public.scan_events FOR SELECT
  USING (
    public.owns_event(event_id)
    OR public.owns_organizer(organizer_id)
    OR public.is_admin()
  );

CREATE POLICY "scan_events_insert_owner"
  ON public.scan_events FOR INSERT
  WITH CHECK (
    public.owns_event(event_id)
    AND (
      organizer_id IS NULL
      OR (
        public.owns_organizer(organizer_id)
        AND public.event_organizer_matches(event_id, organizer_id)
      )
    )
  );

CREATE POLICY "scan_events_delete_admin"
  ON public.scan_events FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "balances_organizer" ON public.organizer_balances;
DROP POLICY IF EXISTS "balances_select_owner" ON public.organizer_balances;
DROP POLICY IF EXISTS "balances_insert_admin" ON public.organizer_balances;
DROP POLICY IF EXISTS "balances_update_admin" ON public.organizer_balances;
DROP POLICY IF EXISTS "balances_delete_admin" ON public.organizer_balances;

CREATE POLICY "balances_select_owner"
  ON public.organizer_balances FOR SELECT
  USING (public.owns_organizer(organizer_id));

CREATE POLICY "balances_insert_admin"
  ON public.organizer_balances FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "balances_update_admin"
  ON public.organizer_balances FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "balances_delete_admin"
  ON public.organizer_balances FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "payouts_organizer" ON public.payouts;
DROP POLICY IF EXISTS "payouts_select_owner" ON public.payouts;
DROP POLICY IF EXISTS "payouts_insert_owner" ON public.payouts;
DROP POLICY IF EXISTS "payouts_update_admin" ON public.payouts;
DROP POLICY IF EXISTS "payouts_delete_admin" ON public.payouts;

CREATE POLICY "payouts_select_owner"
  ON public.payouts FOR SELECT
  USING (public.owns_organizer(organizer_id));

CREATE POLICY "payouts_insert_owner"
  ON public.payouts FOR INSERT
  WITH CHECK (public.owns_organizer(organizer_id));

CREATE POLICY "payouts_update_admin"
  ON public.payouts FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "payouts_delete_admin"
  ON public.payouts FOR DELETE
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- Views and RPCs with explicit access checks
-- -----------------------------------------------------------------------------
ALTER VIEW public.organizer_event_stats SET (security_invoker = true);
ALTER VIEW public.organizer_daily_sales SET (security_invoker = true);

CREATE OR REPLACE FUNCTION public.increment_event_views(event_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.events
  SET views_count = views_count + 1
  WHERE id = event_id
    AND status = 'published';
$$;

CREATE OR REPLACE FUNCTION public.organizer_overview_stats(org_id UUID)
RETURNS TABLE (
  total_tickets_sold  BIGINT,
  gross_revenue       NUMERIC,
  active_events_count BIGINT,
  avg_sell_through    NUMERIC,
  currency            CHAR(3)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.owns_organizer(org_id) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(e.tickets_sold), 0)::BIGINT AS total_tickets_sold,
    COALESCE(SUM(o.total - o.service_fee), 0) AS gross_revenue,
    COUNT(DISTINCT CASE WHEN e.status = 'published' THEN e.id END)::BIGINT AS active_events_count,
    COALESCE(ROUND(AVG(e.tickets_sold::NUMERIC / NULLIF(e.total_inventory, 0)) * 100, 1), 0) AS avg_sell_through,
    MAX(e.currency) AS currency
  FROM public.events e
  LEFT JOIN public.orders o ON o.event_id = e.id AND o.status = 'completed'
  WHERE e.organizer_id = org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_scan_stats(p_event_id UUID)
RETURNS TABLE (
  scanned   BIGINT,
  valid     BIGINT,
  rejected  BIGINT,
  remaining BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.owns_event(p_event_id) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE result != 'wrong_event')::BIGINT AS scanned,
    COUNT(*) FILTER (WHERE result = 'valid')::BIGINT AS valid,
    COUNT(*) FILTER (WHERE result NOT IN ('valid', 'wrong_event'))::BIGINT AS rejected,
    (SELECT total_inventory - tickets_sold FROM public.events WHERE id = p_event_id)::BIGINT AS remaining
  FROM public.scan_events
  WHERE event_id = p_event_id;
END;
$$;
