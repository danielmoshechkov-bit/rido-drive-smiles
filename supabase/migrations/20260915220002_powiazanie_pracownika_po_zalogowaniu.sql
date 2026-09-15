-- ═══════════════════════════════════════════════════════════════════════════
-- PRACOWNIK PO ZALOGOWANIU MA ZOSTAĆ POWIĄZANY ZE SWOIM WARSZTATEM (15.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CO JEST ZEPSUTE
--
-- `workshop_employees.user_id` wypełnia JEDNO miejsce w całym systemie:
-- funkcja brzegowa `workshop-accept-employee-invitation`, w chwili przyjęcia
-- zaproszenia, dopasowując po ADRESIE E-MAIL. Wszystko inne — kafelek „Moja
-- praca" i każda polityka RLS warsztatu — pyta o `user_id = auth.uid()`.
--
-- Stan zastany (15.09.2026):
--   9 wierszy pracowników: 7 bez `user_id`, 2 z `user_id`
--   10 zaproszeń, wszystkie `accepted`: 8 e-mailem, 2 telefonem
--   Dwóch pracowników w całym systemie widzi dziś swój moduł.
--
-- Zaproszenie SMS-em nie ma adresu (`invited_email IS NULL`), więc nie ma
-- czego dopasować — a funkcja i tak kończy się powodzeniem i zamyka
-- zaproszenie. Kto kliknie link przed założeniem konta, nie zostanie
-- powiązany NIGDY: skan po zalogowaniu ponawia wyłącznie zaproszenia
-- `pending`, a sama funkcja przy `accepted` wychodzi bez powiązania.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CZEGO TA MIGRACJA NIE ROBI — I DLACZEGO
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 NIE dopasowuje po numerze telefonu WPISANYM PRZEZ PRACOWNIKA.
--
-- Numer w `workshop_employees.phone` podaje pracodawca i temu numerowi ufamy.
-- Numer, który przy rejestracji wpisuje sam zakładający konto, jest jego
-- WŁASNYM OŚWIADCZENIEM — nikt go nie sprawdza. Dopasowanie po nim znaczyłoby,
-- że kto zna numer kolegi zaproszonego do warsztatu, wchodzi do tego warsztatu
-- razem z kartoteką klientów. Dlatego bierzemy tylko to, co potwierdzone:
--   • adres e-mail konta (Supabase potwierdza go linkiem aktywacyjnym),
--   • `auth.users.phone` (potwierdzony kodem SMS przy logowaniu numerem).
-- Dla zaproszeń SMS-owych dowodem jest SAM LINK z wiadomości — obsługuje to
-- funkcja brzegowa, po żetonie zaproszenia, nie ta funkcja.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NORMALIZACJA NUMERU — JEDNO MIEJSCE
-- ═══════════════════════════════════════════════════════════════════════════
-- `530890466`, `+48530890466` i `530 890 466` to ten sam numer i trzy różne
-- ciągi znaków. Postać porównywalną liczy `numer_do_porownania` i tylko ona;
-- kolumny `telefon_norm` są GENEROWANE, więc nie da się zapisać wiersza
-- z pominięciem tej reguły ani „poprawić" jej w drugim miejscu.
-- Reguła jest ta sama, co w `supabase/functions/_shared/numerTelefonu.ts`
-- (tam potrzebna po stronie funkcji brzegowej); oba mają test na tym samym
-- zestawie przypadków.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. POSTAĆ PORÓWNYWALNA NUMERU ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.numer_do_porownania(p_numer text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_numer IS NULL THEN NULL
    -- dziewięć cyfr = numer krajowy, dokładamy kierunkowy
    WHEN length(regexp_replace(p_numer, '\D', '', 'g')) = 9
      THEN '48' || regexp_replace(p_numer, '\D', '', 'g')
    -- jedenaście cyfr zaczynających się od 48 = już z kierunkowym
    WHEN length(regexp_replace(p_numer, '\D', '', 'g')) = 11
         AND left(regexp_replace(p_numer, '\D', '', 'g'), 2) = '48'
      THEN regexp_replace(p_numer, '\D', '', 'g')
    -- zapis międzynarodowy z plusem — bierzemy, jak jest
    WHEN left(btrim(p_numer), 1) = '+'
         AND length(regexp_replace(p_numer, '\D', '', 'g')) >= 8
      THEN regexp_replace(p_numer, '\D', '', 'g')
    -- cokolwiek innego NIE jest numerem, którym wolno kogokolwiek dopasować
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION public.numer_do_porownania(text) IS
  'Postać porównywalna numeru telefonu (48XXXXXXXXX). JEDYNE miejsce tej reguły '
  'po stronie bazy. Odpowiednik dla funkcji brzegowych: _shared/numerTelefonu.ts.';

-- ── 2. KOLUMNY GENEROWANE ─────────────────────────────────────────────────
ALTER TABLE public.workshop_employees
  ADD COLUMN IF NOT EXISTS telefon_norm text
  GENERATED ALWAYS AS (public.numer_do_porownania(phone)) STORED;

ALTER TABLE public.workshop_employee_invitations
  ADD COLUMN IF NOT EXISTS telefon_norm text
  GENERATED ALWAYS AS (public.numer_do_porownania(invited_phone)) STORED;

CREATE INDEX IF NOT EXISTS workshop_employees_telefon_norm_idx
  ON public.workshop_employees (telefon_norm) WHERE telefon_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS workshop_employees_email_lower_idx
  ON public.workshop_employees (lower(email)) WHERE email IS NOT NULL;

-- ── 3. DOWIĄZANIE PO ZALOGOWANIU ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.powiaz_pracownika_po_zalogowaniu()
RETURNS TABLE (provider_id uuid, warsztat text, dopasowano text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_email text;
  v_tel   text;
BEGIN
  -- Funkcja działa WYŁĄCZNIE na tożsamości wołającego. Nie przyjmuje żadnego
  -- parametru — nie ma więc czego podstawić, żeby dowiązać się do cudzego
  -- wiersza.
  IF v_user IS NULL THEN
    RETURN;
  END IF;

  SELECT lower(u.email), public.numer_do_porownania(u.phone)
    INTO v_email, v_tel
  FROM auth.users u
  WHERE u.id = v_user;

  IF v_email IS NULL AND v_tel IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH wybrane AS (
    -- 🔴 NAJWYŻEJ JEDEN WIERSZ NA WARSZTAT. Na tabeli stoi unikalny indeks
    -- `idx_workshop_employees_provider_user_unique (provider_id, user_id)`:
    -- gdyby w jednym warsztacie pasowały dwa wiersze (jeden adresem, drugi
    -- numerem — a takie duplikaty już w bazie są), przypisanie obu wywróciłoby
    -- CAŁĄ funkcję na naruszeniu klucza i pracownik nie dostałby dostępu
    -- nigdzie. Bierzemy najstarszy: ten, który założył pracodawca.
    SELECT DISTINCT ON (k.provider_id) k.id, k.provider_id,
           CASE WHEN v_email IS NOT NULL AND lower(k.email) = v_email
                THEN 'e-mail' ELSE 'numer potwierdzony' END AS skad
    FROM public.workshop_employees k
    WHERE k.user_id IS NULL
      AND k.status <> 'removed'
      AND (
            (v_email IS NOT NULL AND lower(k.email) = v_email)
         OR (v_tel   IS NOT NULL AND k.telefon_norm = v_tel)
          )
      -- ...i pomijamy warsztaty, w których to konto JUŻ jest pracownikiem.
      AND NOT EXISTS (
        SELECT 1 FROM public.workshop_employees x
        WHERE x.provider_id = k.provider_id AND x.user_id = v_user
      )
    ORDER BY k.provider_id, k.created_at
  ), dopasowane AS (
    UPDATE public.workshop_employees we
       SET user_id    = v_user,
           status     = 'active',
           is_active  = true,
           removed_at = NULL,
           -- Adres uzupełniamy przy okazji: pracownik dodany ręcznie przez
           -- pracodawcę ma zwykle sam numer, a bez adresu nie da się do niego
           -- napisać.
           email      = COALESCE(we.email, v_email)
      FROM wybrane w
     WHERE we.id = w.id
    RETURNING we.provider_id, w.skad AS skad
  )
  SELECT d.provider_id, sp.company_name, d.skad
  FROM dopasowane d
  JOIN public.service_providers sp ON sp.id = d.provider_id;

  -- Zaproszenia tej samej osoby domykamy, żeby nie wisiały w nieskończoność.
  UPDATE public.workshop_employee_invitations i
     SET status = 'accepted',
         accepted_at = COALESCE(i.accepted_at, now()),
         invited_user_id = v_user
   WHERE i.invited_user_id IS NULL
     AND i.status IN ('pending', 'accepted')
     AND (
           (v_email IS NOT NULL AND lower(i.invited_email) = v_email)
        OR (v_tel   IS NOT NULL AND i.telefon_norm = v_tel)
         );
END $$;

-- Rola `anon` nie ma tu czego szukać: funkcja opiera się na `auth.uid()`.
REVOKE ALL ON FUNCTION public.powiaz_pracownika_po_zalogowaniu() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.powiaz_pracownika_po_zalogowaniu() TO authenticated, service_role;

-- ── KONTROLA ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n integer;
  v_provider uuid;
  v_emp uuid;
  v_user uuid;
  v_email_przed text;
BEGIN
  -- Normalizacja: trzy zapisy tego samego numeru mają dać jedną wartość.
  IF public.numer_do_porownania('530890466')   IS DISTINCT FROM '48530890466'
  OR public.numer_do_porownania('+48530890466') IS DISTINCT FROM '48530890466'
  OR public.numer_do_porownania('530 890 466')  IS DISTINCT FROM '48530890466'
  OR public.numer_do_porownania('48530890466')  IS DISTINCT FROM '48530890466' THEN
    RAISE EXCEPTION 'Normalizacja numeru nie zwraca jednej wartości dla tego samego numeru.';
  END IF;
  -- Kontrola odwrotna: śmieć NIE MA być numerem, bo dopasowałby przypadkowe wiersze.
  IF public.numer_do_porownania('123')  IS NOT NULL
  OR public.numer_do_porownania('')     IS NOT NULL
  OR public.numer_do_porownania('brak') IS NOT NULL THEN
    RAISE EXCEPTION 'Normalizacja uznaje śmieć za numer — dopasowanie łapałoby przypadkowe wiersze.';
  END IF;

  -- Kolumny generowane liczą się na danych, które JUŻ są w tabeli.
  SELECT count(*) INTO v_n FROM workshop_employees WHERE phone IS NOT NULL AND telefon_norm IS NULL;
  IF v_n > 0 THEN
    RAISE WARNING 'Uwaga: % pracowników ma numer, którego nie da się znormalizować.', v_n;
  END IF;

  -- ── KONTROLA POZYTYWNA I ODWROTNA NA ŻYWYM WIERSZU ──────────────────────
  -- Zapisy tej kontroli siedzą w bloku zakończonym wyjątkiem, więc wycofują
  -- się SAME — migracja nie zostawia po sobie podmienionego adresu ani
  -- dowiązania. Wyjątek o innej treści niż umówiona leci dalej i przewraca
  -- całą migrację; to jest właśnie ten przypadek, w którym ma ją przewrócić.
  SELECT we.id, we.provider_id INTO v_emp, v_provider
  FROM workshop_employees we WHERE we.user_id IS NULL LIMIT 1;
  SELECT email INTO v_email_przed FROM workshop_employees WHERE id = v_emp;
  SELECT id INTO v_user FROM auth.users LIMIT 1;
  IF v_emp IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'Brak danych do kontroli — nie ma pracownika bez user_id albo nie ma użytkowników.';
  END IF;

  BEGIN
    UPDATE workshop_employees SET email = (SELECT email FROM auth.users WHERE id = v_user) WHERE id = v_emp;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
    PERFORM public.powiaz_pracownika_po_zalogowaniu();

    SELECT count(*) INTO v_n FROM workshop_employees WHERE id = v_emp AND user_id = v_user;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'KONTROLA POZYTYWNA PADŁA: funkcja nie dowiązała pracownika o pasującym adresie.';
    END IF;

    -- Kontrola odwrotna: obcy użytkownik NIE dowiązuje się do tego wiersza.
    UPDATE workshop_employees SET user_id = NULL WHERE id = v_emp;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-0000-0000-000000000000', 'role','authenticated')::text, true);
    PERFORM public.powiaz_pracownika_po_zalogowaniu();
    SELECT count(*) INTO v_n FROM workshop_employees WHERE id = v_emp AND user_id IS NOT NULL;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'KONTROLA ODWROTNA PADŁA: dowiązał się ktoś, kto nie pasuje ani adresem, ani numerem.';
    END IF;

    RAISE EXCEPTION 'KONTROLA_OK';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'KONTROLA_OK' THEN
      RAISE;
    END IF;
  END;

  -- Po wycofaniu: wiersz ma być taki, jaki był.
  SELECT count(*) INTO v_n FROM workshop_employees
   WHERE id = v_emp AND (user_id IS NOT NULL OR email IS DISTINCT FROM v_email_przed);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Kontrola zostawiła ślad w wierszu pracownika — zatrzymuję.';
  END IF;

  RAISE NOTICE '✅ Dowiązanie działa w obie strony (pasujący wchodzi, obcy nie), bez śladu po kontroli.';
END $$;

COMMIT;
