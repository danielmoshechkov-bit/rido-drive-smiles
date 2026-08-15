-- G0 — koniec cichego dostępu administratora do danych warsztatów.
--
-- Stan zastany: sześć polityk „Admin full access …" na tabelach warsztatowych,
-- każda `FOR ALL USING (has_role(auth.uid(),'admin'))`. Administrator mógł
-- czytać, zmieniać i USUWAĆ dane dowolnego warsztatu — cudze zlecenia, cudzych
-- klientów, cudze pojazdy — i nie zostawało po tym żadnego śladu.
--
-- Dwie osobne szkody:
--  1. Wobec klientów: dostęp do cudzych danych osobowych bez powodu i bez logu.
--  2. Wobec testów G7: admin przechodzi każdą bramkę, więc test „RLS odmawia
--     zapisu" wykonany na koncie admina zawsze wypadnie pozytywnie — nawet
--     gdyby bramka nie działała w ogóle.
--
-- Rozwiązanie: podgląd zostaje (obsługa zgłoszeń go potrzebuje), zapis wymaga
-- OTWARCIA OKNA SERWISOWEGO z podaniem powodu. Okno wygasa samo, dotyczy
-- jednego warsztatu i jednego administratora, a jego wiersz JEST wpisem
-- audytowym — nie ma zapisu bez śladu, bo nie ma zapisu bez okna.

-- ---------------------------------------------------------------------------
-- 1. Rejestr okien serwisowych = dziennik audytu
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_okna_serwisowe (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id   uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  -- Powód jest obowiązkowy i sprawdzany co do długości. „ok", „fix" i pusty
  -- łańcuch nie są powodami; wpis, którego nie da się zrozumieć po miesiącu,
  -- nie jest audytem.
  powod         text NOT NULL CHECK (length(btrim(powod)) >= 10),
  otwarte_at    timestamptz NOT NULL DEFAULT now(),
  wygasa_at     timestamptz NOT NULL,
  zamkniete_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_admin_okna_aktywne
  ON public.admin_okna_serwisowe (provider_id, admin_user_id, wygasa_at)
  WHERE zamkniete_at IS NULL;

ALTER TABLE public.admin_okna_serwisowe ENABLE ROW LEVEL SECURITY;

-- Dziennika audytu nie wolno pisać ręcznie ani poprawiać po fakcie. Wpisy
-- powstają WYŁĄCZNIE przez funkcję poniżej; RLS daje tylko odczyt adminom.
DROP POLICY IF EXISTS "Admin czyta dziennik okien" ON public.admin_okna_serwisowe;
CREATE POLICY "Admin czyta dziennik okien"
  ON public.admin_okna_serwisowe FOR SELECT TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'admin')));

-- ---------------------------------------------------------------------------
-- 2. Otwarcie i zamknięcie okna
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_otworz_okno_serwisowe(
  p_provider uuid,
  p_powod    text,
  p_minuty   integer DEFAULT 30
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Tylko administrator może otworzyć okno serwisowe';
  END IF;
  IF p_minuty < 1 OR p_minuty > 240 THEN
    RAISE EXCEPTION 'Okno serwisowe: dozwolone 1–240 minut';
  END IF;

  INSERT INTO public.admin_okna_serwisowe (admin_user_id, provider_id, powod, wygasa_at)
  VALUES (auth.uid(), p_provider, p_powod, now() + make_interval(mins => p_minuty))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_zamknij_okno_serwisowe(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_okna_serwisowe
  SET zamkniete_at = now()
  WHERE id = p_id AND admin_user_id = auth.uid() AND zamkniete_at IS NULL;
END;
$$;

-- Czy WOŁAJĄCY ma teraz otwarte okno do tego warsztatu.
--
-- Sprawdzamy `admin_user_id = auth.uid()`, nie samo istnienie okna. Gdyby
-- wystarczyło, że ktokolwiek je otworzył, otwarcie okna przez obsługę
-- odblokowałoby przy okazji samego klienta — a to jest bramka płatności,
-- nie przełącznik obsługi.
CREATE OR REPLACE FUNCTION public.ma_okno_serwisowe(p_provider uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_okna_serwisowe
    WHERE provider_id   = p_provider
      AND admin_user_id = auth.uid()
      AND zamkniete_at IS NULL
      AND wygasa_at > now()
  );
$$;

REVOKE ALL ON FUNCTION public.admin_otworz_okno_serwisowe(uuid, text, integer) FROM public;
REVOKE ALL ON FUNCTION public.admin_zamknij_okno_serwisowe(uuid) FROM public;
REVOKE ALL ON FUNCTION public.ma_okno_serwisowe(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_otworz_okno_serwisowe(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_zamknij_okno_serwisowe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ma_okno_serwisowe(uuid) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 3. Sześć polityk admina: z „wszystko" na „podgląd"
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tabele text[] := ARRAY[
    'workshop_orders', 'workshop_clients', 'workshop_vehicles',
    'workshop_order_statuses', 'workshop_order_items',
    'workshop_order_status_history'
  ];
BEGIN
  FOREACH t IN ARRAY tabele LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admin full access ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.has_role(auth.uid(), ''admin'')))',
      'Admin podglad ' || t, t);
    RAISE NOTICE 'admin -> tylko podglad: %', t;
  END LOOP;
END $$;

-- Zapis administratora wraca, ale wyłącznie na czas otwartego okna. Warunek
-- właściciela zapisujemy tak samo jak w G4: wprost albo przez zlecenie.
DO $$
DECLARE
  t text; wyrazenie text;
  wprost text[] := ARRAY[
    'workshop_orders', 'workshop_clients', 'workshop_vehicles', 'workshop_order_statuses'
  ];
  przez_zlecenie text[] := ARRAY['workshop_order_items', 'workshop_order_status_history'];
BEGIN
  FOREACH t IN ARRAY wprost || przez_zlecenie LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    IF t = ANY (przez_zlecenie) THEN
      wyrazenie := 'public.ma_okno_serwisowe('
                || '(SELECT o.provider_id FROM public.workshop_orders o WHERE o.id = order_id))';
    ELSE
      wyrazenie := 'public.ma_okno_serwisowe(provider_id)';
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admin serwis insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admin serwis update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admin serwis delete', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
      'Admin serwis insert', t, wyrazenie);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      'Admin serwis update', t, wyrazenie, wyrazenie);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
      'Admin serwis delete', t, wyrazenie);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Furtka serwisowa w bramce zapisu z G4
-- ---------------------------------------------------------------------------
--
-- Bez tego okno serwisowe byłoby bezużyteczne przy warsztacie, który nie
-- zapłacił — czyli dokładnie tam, gdzie obsługa bywa najbardziej potrzebna:
-- polityki RESTRICTIVE z G4 łączą się przez AND i odcięłyby także admina.
--
-- Lista tabel pochodzi z funkcji założonych w G4, więc nie ma tu jej drugiej
-- kopii do rozjechania.
CALL public.warsztat_zaloz_bramke('public.ma_okno_serwisowe(%KOLUMNA%)');

NOTIFY pgrst, 'reload schema';
