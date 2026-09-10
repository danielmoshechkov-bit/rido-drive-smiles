-- Skasowana faktura zwalnia ODNOŚNIK PŁATNOŚCI (ale nie numer).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 KLIENT ZAPŁACIŁ I NIE MA FAKTURY
-- ═══════════════════════════════════════════════════════════════════════════
-- AUTO-SERWIS HAWRYLUK zapłacił 09.09.2026 o 09:51 — 84,87 zł, zamówienie
-- `MF4W6851B6260909GUEST000P01`, status `oplacone`. Faktura GR/2026/007
-- powstała o 09:51 i została skasowana o 12:18. Nowej nie wystawiono.
--
-- Ponowienie nie pomogło i nie mogło: `billing-invoice-issue` sprawdzała
-- `external_payment_ref` BEZ warunku na `deleted_at`, znajdowała skasowany
-- wiersz i odpowiadała `duplicate: true` — meldując sukces nad nieistniejącym
-- dokumentem. Do tego unikalny indeks `user_invoices_external_payment_ref`
-- obejmował wiersze skasowane, więc nawet po poprawce w kodzie zapis by nie
-- wszedł, a odmowa wyglądałaby na awarię.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DWIE RÓŻNE RZECZY, DWIE RÓŻNE ZASADY
-- ═══════════════════════════════════════════════════════════════════════════
-- NUMER FAKTURY jest zużyty na zawsze — klient mógł go dostać, księgowa
-- zaksięgować (migracja `20260909162228`). Skasowanie nie zwalnia numeru.
--
-- ODNOŚNIK PŁATNOŚCI jest czymś innym: mówi „ta zapłata ma swój dokument".
-- Gdy dokument znika, zapłata zostaje bez dokumentu — a wtedy trzeba móc
-- wystawić nowy. Trzymanie odnośnika przy skasowanym wierszu zamykało jedyną
-- drogę do naprawy.
--
-- Nowa faktura dostanie KOLEJNY WOLNY numer, nie 007. Numer 007 zostaje przy
-- CART78GARAGE — decyzja z 10.09.2026.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. UNIKALNOŚĆ ODNOŚNIKA TYLKO WŚRÓD AKTYWNYCH
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.user_invoices_external_payment_ref;
CREATE UNIQUE INDEX IF NOT EXISTS user_invoices_external_payment_ref
  ON public.user_invoices (external_payment_ref)
  WHERE external_payment_ref IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- KONTROLA KOŃCOWA — ZACHOWANIEM
-- ---------------------------------------------------------------------------
DO $KONIEC$
DECLARE
  v_user  uuid;
  v_ref   text := 'kontrola:' || substr(gen_random_uuid()::text, 1, 12);
  v_id1   uuid := gen_random_uuid();
  v_id2   uuid := gen_random_uuid();
  v_id3   uuid := gen_random_uuid();
  v_udalo boolean;
  v_unik  boolean;
  v_haw   int;
BEGIN
  SELECT platform_invoice_user_id INTO v_user FROM billing_settings WHERE id = true;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Brak platform_invoice_user_id — nie mam na czym sprawdzic zachowania';
  END IF;

  -- (a) KONTROLA POZYTYWNA: pierwszy zapis MA przejsc.
  INSERT INTO user_invoices (id, user_id, invoice_number, issue_date, external_payment_ref)
  VALUES (v_id1, v_user, 'KONTROLA/REF/1/' || v_ref, current_date, v_ref);
  IF NOT EXISTS (SELECT 1 FROM user_invoices WHERE id = v_id1) THEN
    RAISE EXCEPTION 'Kontrola pozytywna padla — nie da sie wystawic pierwszej faktury';
  END IF;

  -- (b) DRUGA AKTYWNA z tym samym odnosnikiem MA byc odrzucona. To jest cala
  --     ochrona przed podwojna faktura za jedna zaplate i nie wolno jej zgubic
  --     przy okazji poluzowania indeksu.
  v_udalo := true;
  BEGIN
    INSERT INTO user_invoices (id, user_id, invoice_number, issue_date, external_payment_ref)
    VALUES (v_id2, v_user, 'KONTROLA/REF/2/' || v_ref, current_date, v_ref);
  EXCEPTION WHEN unique_violation THEN
    v_udalo := false;
  END;
  IF v_udalo THEN
    DELETE FROM user_invoices WHERE id IN (v_id1, v_id2, v_id3);
    RAISE EXCEPTION 'Dwie AKTYWNE faktury do jednej zaplaty przeszly — indeks nie chroni';
  END IF;

  -- (c) SEDNO: po SKASOWANIU pierwszej odnosnik ma byc wolny.
  UPDATE user_invoices SET deleted_at = now() WHERE id = v_id1;
  v_udalo := true;
  BEGIN
    INSERT INTO user_invoices (id, user_id, invoice_number, issue_date, external_payment_ref)
    VALUES (v_id3, v_user, 'KONTROLA/REF/3/' || v_ref, current_date, v_ref);
  EXCEPTION WHEN unique_violation THEN
    v_udalo := false;
  END;
  IF NOT v_udalo THEN
    DELETE FROM user_invoices WHERE id IN (v_id1, v_id2, v_id3);
    RAISE EXCEPTION 'Po skasowaniu faktury odnosnik platnosci nadal jest zajety — klient zostaje bez dokumentu';
  END IF;

  DELETE FROM user_invoices WHERE id IN (v_id1, v_id2, v_id3);

  -- (d) Indeks jest UNIKALNY, nie tylko obecny.
  SELECT indisunique INTO v_unik
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
  WHERE c.relname = 'user_invoices_external_payment_ref';
  IF v_unik IS NOT TRUE THEN
    RAISE EXCEPTION 'user_invoices_external_payment_ref nie jest unikalny';
  END IF;

  -- (e) Stan Hawryluka — wypisany, nie naprawiony. Wystawienie faktury to
  --     wywolanie `billing-invoice-issue`, nie zapis w migracji: numer,
  --     pozycje i mail maja powstac ta sama droga co przy kazdej innej
  --     platnosci, inaczej dokument rozjedzie sie z reszta.
  SELECT count(*) INTO v_haw
  FROM user_invoices
  WHERE external_payment_ref = 'payu:MF4W6851B6260909GUEST000P01' AND deleted_at IS NULL;
  IF v_haw = 0 THEN
    RAISE WARNING 'AUTO-SERWIS HAWRYLUK: zaplata payu:MF4W6851B6260909GUEST000P01 nadal bez faktury. Odnosnik jest juz wolny — wystaw dokument wywolaniem billing-invoice-issue.';
  ELSE
    RAISE NOTICE 'AUTO-SERWIS HAWRYLUK: faktura juz jest (% szt.).', v_haw;
  END IF;

  RAISE NOTICE 'Skasowana faktura zwalnia odnosnik platnosci; dwie aktywne do jednej zaplaty nadal odrzucane.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';
