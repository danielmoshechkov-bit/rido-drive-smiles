-- =====================================================================
-- SMSSHORT1 — krótki public_token dla publicznych linków /r/:token
-- ---------------------------------------------------------------------
-- Cel: link w SMS ma się mieścić w 1 SMS (160 zn. GSM-7). Dziś /r/:token
-- używa workshop_client_bookings.confirmation_token = pełny UUID (36 zn.),
-- co robi link 57 zn. i wypycha treść do 2 SMS.
--
-- Rozwiązanie: nowa kolumna public_token (10 zn., base62 bez znaków
-- mylących 0/O/1/l/I), krypto-losowa (gen_random_bytes + rejection
-- sampling → brak modulo-bias). confirmation_token ZOSTAJE — 4 RPC
-- matchują OBA tokeny, więc już wysłane linki (UUID) działają dalej.
--
-- Bezpieczeństwo (endpoint anonimowy, zwraca PII):
--   • rate limit per-IP (tabela + funkcja, wołane w każdym RPC),
--   • wygaszanie: RPC działają tylko dla wizyt appointment_date >= dziś-7,
--   • długość p_token >= 8 (nowy 10 i stary 36 przechodzą).
--
-- UWAGA WDROŻENIOWA: tę migrację trzeba zastosować PRZED (lub razem z)
-- deployem frontu — front selektuje kolumnę public_token.
-- Migracja jest idempotentna (IF NOT EXISTS / CREATE OR REPLACE).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---- 1) Generator krótkiego tokenu (57-znakowy alfabet, bez 0/O/1/l/I) ----
-- Alfabet: 8 cyfr (23456789) + 24 wielkie (bez I,O) + 25 małych (bez l) = 57.
-- search_path zawiera `extensions`, bo w Supabase pgcrypto (gen_random_bytes)
-- jest w schemacie extensions, nie public.
CREATE OR REPLACE FUNCTION public.gen_public_token(p_len int DEFAULT 10)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $$
DECLARE
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  n        int  := 57;         -- length(alphabet)
  reject   int  := (256 / 57) * 57;  -- = 228; odrzucamy 228..255 → brak modulo-bias
  out      text := '';
  idx      int;
BEGIN
  WHILE length(out) < p_len LOOP
    idx := get_byte(gen_random_bytes(1), 0);
    IF idx < reject THEN
      out := out || substr(alphabet, (idx % n) + 1, 1);
    END IF;
  END LOOP;
  RETURN out;
END;
$$;

-- ---- 2) Kolumna public_token + backfill + unikat + auto-trigger ----------
ALTER TABLE public.workshop_client_bookings
  ADD COLUMN IF NOT EXISTS public_token text;

-- Backfill istniejących rekordów (kolizja przy 57^10 vs kilka tys. wierszy
-- jest pomijalna; gdyby unikat padł, powtórz UPDATE dla pozostałych NULL).
UPDATE public.workshop_client_bookings
SET public_token = public.gen_public_token(10)
WHERE public_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workshop_client_bookings_public_token_key
  ON public.workshop_client_bookings (public_token);

CREATE OR REPLACE FUNCTION public.set_public_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.public_token IS NULL THEN
    NEW.public_token := public.gen_public_token(10);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_public_token ON public.workshop_client_bookings;
CREATE TRIGGER trg_set_public_token
  BEFORE INSERT ON public.workshop_client_bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_public_token();

-- ---- 3) Rate limiting (sliding window per bucket) ------------------------
CREATE TABLE IF NOT EXISTS public.public_token_rate_limit (
  bucket_key   text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts     int         NOT NULL DEFAULT 0
);
ALTER TABLE public.public_token_rate_limit ENABLE ROW LEVEL SECURITY;
-- Brak polityk = brak bezpośredniego dostępu; piszą tylko funkcje SECURITY DEFINER.

-- IP klienta z nagłówka x-forwarded-for (PostgREST wystawia request.headers).
CREATE OR REPLACE FUNCTION public._client_ip()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT btrim(split_part(
    coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
    ',', 1));
$$;

-- Zwiększa licznik dla klucza; RAISE gdy przekroczono p_max w oknie p_window.
CREATE OR REPLACE FUNCTION public._rl_touch(p_key text, p_max int, p_window interval)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cnt int;
BEGIN
  INSERT INTO public.public_token_rate_limit AS r (bucket_key, window_start, attempts)
  VALUES (p_key, now(), 1)
  ON CONFLICT (bucket_key) DO UPDATE
    SET window_start = CASE WHEN r.window_start < now() - p_window THEN now() ELSE r.window_start END,
        attempts     = CASE WHEN r.window_start < now() - p_window THEN 1    ELSE r.attempts + 1 END
  RETURNING attempts INTO v_cnt;

  IF v_cnt > p_max THEN
    RAISE EXCEPTION 'rate_limited' USING errcode = '54000';
  END IF;
END;
$$;

-- ---- 4) Przepisane 4 RPC: dual-token + wygaszanie + rate limit -----------
-- LANGUAGE plpgsql + VOLATILE (rate limit pisze do tabeli).
-- Match: confirmation_token (stare UUID-linki) LUB public_token (nowe).
-- Wygaszanie: tylko wizyty appointment_date >= current_date - 7 dni.

CREATE OR REPLACE FUNCTION public.get_workshop_booking_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RETURN NULL;
  END IF;
  PERFORM public._rl_touch('get:' || coalesce(nullif(public._client_ip(), ''), 'unknown'),
                           60, interval '1 minute');

  SELECT to_jsonb(b) || jsonb_build_object(
    'service_providers',
    (SELECT jsonb_build_object(
        'company_name',        sp.company_name,
        'short_name',          sp.short_name,
        'company_address',     sp.company_address,
        'company_city',        sp.company_city,
        'company_postal_code', sp.company_postal_code,
        'company_phone',       sp.company_phone
     ) FROM service_providers sp WHERE sp.id = b.provider_id)
  )
  INTO v
  FROM workshop_client_bookings b
  WHERE (b.confirmation_token::text = p_token OR b.public_token = p_token)
    AND b.appointment_date >= (current_date - interval '7 days')
  LIMIT 1;

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_workshop_booking_by_token(p_token text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN RETURN; END IF;
  PERFORM public._rl_touch('confirm:' || coalesce(nullif(public._client_ip(), ''), 'unknown'),
                           20, interval '1 minute');

  UPDATE workshop_client_bookings
  SET status = 'confirmed', confirmed_at = now()
  WHERE (confirmation_token::text = p_token OR public_token = p_token)
    AND appointment_date >= (current_date - interval '7 days')
    AND status NOT IN ('cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_workshop_booking_by_token(p_token text, p_reason text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN RETURN; END IF;
  PERFORM public._rl_touch('cancel:' || coalesce(nullif(public._client_ip(), ''), 'unknown'),
                           20, interval '1 minute');

  UPDATE workshop_client_bookings
  SET status = 'cancelled', cancelled_at = now(),
      cancellation_reason = nullif(btrim(coalesce(p_reason, '')), '')
  WHERE (confirmation_token::text = p_token OR public_token = p_token)
    AND appointment_date >= (current_date - interval '7 days');
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_workshop_booking_by_token(p_token text, p_date date, p_time text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN RETURN; END IF;
  PERFORM public._rl_touch('resched:' || coalesce(nullif(public._client_ip(), ''), 'unknown'),
                           20, interval '1 minute');

  UPDATE workshop_client_bookings
  SET status = 'reschedule_requested', reschedule_requested_at = now(),
      proposed_date = p_date, proposed_time = p_time::time
  WHERE (confirmation_token::text = p_token OR public_token = p_token)
    AND appointment_date >= (current_date - interval '7 days');
END;
$$;

-- GRANT-y jak dotąd (CREATE OR REPLACE zachowuje uprawnienia, re-grant defensywnie).
GRANT EXECUTE ON FUNCTION public.get_workshop_booking_by_token(text)                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_workshop_booking_by_token(text)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_workshop_booking_by_token(text, text)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_workshop_booking_by_token(text, date, text)  TO anon, authenticated;
-- Helpery (gen_public_token/_rl_touch/_client_ip/set_public_token) NIE są grantowane
-- dla anon — wołają je tylko funkcje SECURITY DEFINER jako właściciel.
