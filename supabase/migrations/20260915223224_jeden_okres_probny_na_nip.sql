-- ═══════════════════════════════════════════════════════════════════════════
-- JEDEN OKRES PRÓBNY NA NIP (15.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Do dziś okres próbny był liczony NA KONTO: kto go wykorzystał, zakładał
-- drugie konto i brał następny. W danych ten wzorzec już jest — dwa NIP-y
-- (5272884984 i 5272922561) występują po dwa razy, na dwóch różnych kontach.
--
-- Adres e-mail mnoży się w nieskończoność, NIP nie. Dlatego licznik wiesza
-- się na NIP-ie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO OSOBNA TABELA, A NIE ZAPYTANIE PO `service_providers`
-- ═══════════════════════════════════════════════════════════════════════════
-- „Czy ten NIP już brał okres próbny" musi zostać prawdą także wtedy, gdy
-- warsztat zostanie skasowany, a NIP zmieniony. Wyliczanie tego z bieżącego
-- stanu tabel znaczyłoby, że wystarczy usunąć warsztat albo podmienić NIP,
-- żeby licznik wrócił do zera — dokładnie ta sama pułapka, co przy numeracji
-- faktur, gdzie skasowana faktura NIE zwalnia numeru.
--
-- Stąd wpis bez klucza obcego: zajęcie NIP-u przeżywa warsztat.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO Z TYM, CO JUŻ NADANO
-- ═══════════════════════════════════════════════════════════════════════════
-- Stan zastany: 31 warsztatów, z tego 6 z poprawnym NIP-em, a 4 NIP-y mają już
-- wykorzystany okres próbny. Te 4 wpisujemy do rejestru (uzupełnienie wsteczne
-- niżej) — bez tego pierwszy klient z NIP-em, który już raz próbował, dostałby
-- drugi okres próbny w dniu wdrożenia tej zmiany.
-- Nikomu nic nie odbieramy: trwające okresy próbne biegną do swoich dat.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. POSTAĆ PORÓWNYWALNA NIP-U ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nip_do_porownania(p_nip text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  -- Same cyfry i dokładnie dziesięć. Sumy kontrolnej tu NIE liczymy: to jest
  -- klucz porównania, a nie walidacja — poprawność sprawdza formularz
  -- (`nipPoprawny` w `DaneDoFaktury.tsx`) zanim cokolwiek zapisze.
  SELECT CASE
    WHEN p_nip IS NULL THEN NULL
    WHEN length(regexp_replace(p_nip, '\D', '', 'g')) = 10
      THEN regexp_replace(p_nip, '\D', '', 'g')
    ELSE NULL
  END
$$;

-- ── 2. REJESTR ZAJĘTYCH NIP-ÓW ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_nip_okresu_probnego (
  nip            text PRIMARY KEY,
  subscriber_id  uuid,
  user_id        uuid,
  przyznany_at   timestamptz NOT NULL DEFAULT now(),
  zrodlo         text NOT NULL DEFAULT 'activate-workshop-trial'
);

COMMENT ON TABLE public.billing_nip_okresu_probnego IS
  'Który NIP wykorzystał już okres próbny. Bez klucza obcego świadomie: '
  'skasowanie warsztatu NIE zwalnia NIP-u, tak samo jak skasowanie faktury '
  'nie zwalnia numeru. Zapis wyłącznie kluczem serwisowym.';

ALTER TABLE public.billing_nip_okresu_probnego ENABLE ROW LEVEL SECURITY;
-- Celowo ZERO polityk: nikt z przeglądarki nie ma tu czego czytać ani pisać.
-- `service_role` omija RLS, więc funkcja brzegowa działa.

-- ── 3. ZAJĘCIE NIP-U — CAŁA DECYZJA W JEDNYM MIEJSCU ──────────────────────
CREATE OR REPLACE FUNCTION public.billing_zajmij_nip_okresu_probnego(
  p_provider uuid,
  p_user     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nip   text;
  v_rodzaj text;
  v_ist   record;
BEGIN
  IF p_provider IS NULL THEN
    RETURN jsonb_build_object('stan', 'brak_warsztatu');
  END IF;

  SELECT public.nip_do_porownania(sp.company_nip), sp.faktura_rodzaj_nabywcy
    INTO v_nip, v_rodzaj
  FROM service_providers sp WHERE sp.id = p_provider;

  -- Komplet danych sprawdza TA SAMA funkcja, co bramka zakupu. Druga reguła
  -- „co to znaczy komplet" rozjechałaby się z pierwszą przy pierwszej zmianie.
  IF NOT public.billing_dane_nabywcy_kompletne(p_provider) THEN
    RETURN jsonb_build_object('stan', 'brak_danych');
  END IF;

  -- Okres próbny wiesza się na NIP-ie, więc bez NIP-u nie ma na czym go
  -- powiesić. Osoba prywatna nadal może KUPIĆ — bramka zakupu jej nie dotyczy.
  IF v_nip IS NULL THEN
    RETURN jsonb_build_object('stan', 'brak_nipu', 'rodzaj', COALESCE(v_rodzaj, '?'));
  END IF;

  INSERT INTO public.billing_nip_okresu_probnego (nip, subscriber_id, user_id)
  VALUES (v_nip, p_provider, p_user)
  ON CONFLICT (nip) DO NOTHING;

  IF FOUND THEN
    RETURN jsonb_build_object('stan', 'ok', 'nip', v_nip);
  END IF;

  SELECT * INTO v_ist FROM public.billing_nip_okresu_probnego WHERE nip = v_nip;

  -- Ten sam warsztat pytający drugi raz ma dostać „ok" — inaczej ponowione
  -- wywołanie (a funkcja brzegowa jest idempotentna) odmawiałoby samo sobie.
  IF v_ist.subscriber_id = p_provider THEN
    RETURN jsonb_build_object('stan', 'ok', 'nip', v_nip, 'juz_nasz', true);
  END IF;

  RETURN jsonb_build_object(
    'stan', 'nip_wykorzystany',
    'nip', v_nip,
    'kiedy', to_char(v_ist.przyznany_at, 'YYYY-MM-DD')
  );
END $$;

REVOKE ALL ON FUNCTION public.billing_zajmij_nip_okresu_probnego(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_zajmij_nip_okresu_probnego(uuid, uuid) TO service_role;

-- ── 4. UZUPEŁNIENIE WSTECZNE ──────────────────────────────────────────────
-- NIP-y, które okres próbny już wykorzystały. Przy tym samym NIP-ie na dwóch
-- kontach zostaje NAJSTARSZE — ono było pierwsze.
INSERT INTO public.billing_nip_okresu_probnego (nip, subscriber_id, user_id, przyznany_at, zrodlo)
SELECT DISTINCT ON (public.nip_do_porownania(sp.company_nip))
       public.nip_do_porownania(sp.company_nip), sp.id, sp.user_id, ps.started_at, 'uzupelnienie_wsteczne'
FROM service_providers sp
JOIN paid_service_subscriptions ps ON ps.user_id = sp.user_id
WHERE public.nip_do_porownania(sp.company_nip) IS NOT NULL
ORDER BY public.nip_do_porownania(sp.company_nip), ps.started_at
ON CONFLICT (nip) DO NOTHING;

-- ── KONTROLA ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n integer;
  v_prov uuid;
  v_wynik jsonb;
BEGIN
  SELECT count(*) INTO v_n FROM billing_nip_okresu_probnego;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Uzupełnienie wsteczne nie wpisało ani jednego NIP-u — a zmierzone były cztery. Zatrzymuję.';
  END IF;
  RAISE NOTICE 'Rejestr NIP-ów: % wpisów po uzupełnieniu wstecznym.', v_n;

  -- Normalizacja w obie strony.
  IF public.nip_do_porownania('527-288-49-84') IS DISTINCT FROM '5272884984'
  OR public.nip_do_porownania('5272884984')    IS DISTINCT FROM '5272884984' THEN
    RAISE EXCEPTION 'Normalizacja NIP-u nie sprowadza dwóch zapisów do jednego.';
  END IF;
  IF public.nip_do_porownania('12345')   IS NOT NULL
  OR public.nip_do_porownania('')        IS NOT NULL
  OR public.nip_do_porownania('brak')    IS NOT NULL THEN
    RAISE EXCEPTION 'Normalizacja uznaje śmieć za NIP.';
  END IF;

  -- KONTROLA POZYTYWNA: cudzy warsztat z zajętym NIP-em MA dostać odmowę.
  -- Zapisy tego bloku wycofuje wyjątek na jego końcu.
  BEGIN
    SELECT id INTO v_prov FROM service_providers
     WHERE id NOT IN (SELECT subscriber_id FROM billing_nip_okresu_probnego WHERE subscriber_id IS NOT NULL)
     LIMIT 1;
    IF v_prov IS NULL THEN
      RAISE EXCEPTION 'KONTROLA_BRAK_PODKLADU';
    END IF;

    -- Komplet danych ustawiamy tak, żeby `billing_dane_nabywcy_kompletne`
    -- odpowiedziało TAK — inaczej odmowa przyszłaby z braku danych i nie
    -- dowodziłaby niczego o zajętym NIP-ie.
    UPDATE service_providers SET
      company_nip = (SELECT nip FROM billing_nip_okresu_probnego ORDER BY przyznany_at LIMIT 1),
      company_name = COALESCE(NULLIF(btrim(company_name), ''), 'Kontrola'),
      company_address = COALESCE(NULLIF(btrim(company_address), ''), 'ul. Kontrolna 1'),
      company_city = COALESCE(NULLIF(btrim(company_city), ''), 'Kontrola'),
      company_postal_code = COALESCE(NULLIF(btrim(company_postal_code), ''), '00-001'),
      faktura_rodzaj_nabywcy = 'firma'
    WHERE id = v_prov;

    IF NOT public.billing_dane_nabywcy_kompletne(v_prov) THEN
      RAISE EXCEPTION 'Podkład kontroli niekompletny — odmowa przyszłaby z braku danych, nie z zajętego NIP-u.';
    END IF;

    v_wynik := public.billing_zajmij_nip_okresu_probnego(v_prov, NULL);
    -- KONTROLA POZYTYWNA: ma być odmowa, i to DOKŁADNIE ta o zajętym NIP-ie.
    IF v_wynik->>'stan' <> 'nip_wykorzystany' THEN
      RAISE EXCEPTION 'KONTROLA POZYTYWNA PADŁA: oczekiwano nip_wykorzystany, jest %.', v_wynik;
    END IF;

    -- KONTROLA ODWROTNA: warsztat, KTÓRY ZAJĄŁ ten NIP, ma dostać „ok" —
    -- inaczej ponowione wywołanie funkcji brzegowej odmawiałoby samo sobie.
    SELECT subscriber_id INTO v_prov FROM billing_nip_okresu_probnego
     WHERE nip = (SELECT nip FROM billing_nip_okresu_probnego ORDER BY przyznany_at LIMIT 1);
    IF v_prov IS NOT NULL THEN
      v_wynik := public.billing_zajmij_nip_okresu_probnego(v_prov, NULL);
      IF v_wynik->>'stan' NOT IN ('ok', 'brak_danych') THEN
        RAISE EXCEPTION 'KONTROLA ODWROTNA PADŁA: właściciel NIP-u dostał %.', v_wynik;
      END IF;
    END IF;

    RAISE EXCEPTION 'KONTROLA_OK';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'KONTROLA_BRAK_PODKLADU' THEN
      RAISE EXCEPTION 'Brak warsztatu do kontroli — kontrola bez podkładu nic nie znaczy.';
    ELSIF SQLERRM <> 'KONTROLA_OK' THEN
      RAISE;
    END IF;
  END;

  RAISE NOTICE '✅ Zajęty NIP nie przechodzi drugi raz; rejestr uzupełniony wstecz.';
END $$;

COMMIT;
