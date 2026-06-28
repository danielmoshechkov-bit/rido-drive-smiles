-- =====================================================================
-- WYN2 — Warstwa zdarzeń (OUTBOX): domain_events + event_handler_runs
-- Paczka 1 (fundament modularności). Migracja ADDYTYWNA.
-- Dokument: docs/wynajem-mvp-projekt.md (pkt 1.2 / 1.3)
-- Wzorzec: trwały outbox (źródło prawdy) + pg_cron poller (WYN6) +
--          pg_notify jako opcjonalny akcelerator.
-- =====================================================================

-- ---- 1) OUTBOX: trwałe zdarzenia ------------------------------------
CREATE TABLE IF NOT EXISTS public.domain_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_key    text NOT NULL,                  -- 'rezerwacja_potwierdzona'|'auto_wydane'|'auto_zwrocone'|'platnosc_oplacona'|...
  source_type  text,                           -- 'booking'|'payment'|...
  source_id    uuid,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'pending', -- pending|processing|done|failed
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  locked_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT domain_events_status_chk
    CHECK (status IN ('pending','processing','done','failed'))
);

-- Indeks pod poller: szybkie wybieranie najstarszych do przetworzenia.
CREATE INDEX IF NOT EXISTS domain_events_pending_idx
  ON public.domain_events(created_at)
  WHERE status IN ('pending','processing');

CREATE INDEX IF NOT EXISTS domain_events_company_idx
  ON public.domain_events(company_id);

-- ---- 2) Gwarancja idempotencji: jeden handler raz na event ----------
CREATE TABLE IF NOT EXISTS public.event_handler_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES public.domain_events(id) ON DELETE CASCADE,
  handler_key text NOT NULL,
  status      text NOT NULL,                    -- done|failed|skipped
  result      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_handler_runs_status_chk
    CHECK (status IN ('done','failed','skipped')),
  CONSTRAINT event_handler_runs_unique UNIQUE (event_id, handler_key)  -- run-guard
);

CREATE INDEX IF NOT EXISTS event_handler_runs_event_idx
  ON public.event_handler_runs(event_id);

-- ---- 3) Atomowy claim (FOR UPDATE SKIP LOCKED) ----------------------
-- Dwa równoległe pollery nie wezmą tego samego eventu.
-- Wywoływane przez dispatcher (service-role) jako RPC.
CREATE OR REPLACE FUNCTION public.claim_domain_events(p_limit integer DEFAULT 20)
RETURNS SETOF public.domain_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.domain_events e
     SET status = 'processing',
         locked_at = now(),
         attempts = e.attempts + 1
   WHERE e.id IN (
     SELECT id FROM public.domain_events
      WHERE status = 'pending'
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit
   )
  RETURNING e.*;
$$;

-- ---- 4) pg_notify jako AKCELERATOR (opcjonalny) ---------------------
-- Budzi dispatcher natychmiast po INSERT; poller (WYN6) i tak gwarantuje
-- dostarczenie, gdyby NOTIFY przepadł (brak listenera).
CREATE OR REPLACE FUNCTION public.notify_domain_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('domain_events', NEW.id::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_domain_events_notify
  AFTER INSERT ON public.domain_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_domain_event();

-- ---- 5) RLS: członek firmy czyta swoje zdarzenia; zapis = service-role
-- (dispatcher i producenci eventów działają jako service-role i omijają RLS;
--  brak polityk INSERT/UPDATE/DELETE dla 'authenticated' = klient nie pisze).
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_handler_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "domain_events_select" ON public.domain_events
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "event_handler_runs_select" ON public.event_handler_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.domain_events de
      WHERE de.id = event_handler_runs.event_id
        AND (
          public.is_company_member(de.company_id)
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
        )
    )
  );

-- =====================================================================
-- WERYFIKACJA:
--   SELECT proname FROM pg_proc WHERE proname IN ('claim_domain_events','notify_domain_event');
--   SELECT conname FROM pg_constraint WHERE conname='event_handler_runs_unique';
-- =====================================================================
