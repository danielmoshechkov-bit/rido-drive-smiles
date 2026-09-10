-- Wycofanie numerów ze SKASOWANYCH faktur — wszystkich kolizji, nie tylko naszej.
--
-- ⚠️ PLIK PRZEPISANY 10.09.2026 PO NIEUDANYM PRZEBIEGU. Pierwsza wersja zakładała
-- jedną kolizję (`GR/2026/007`) i od razu pełny indeks unikalny. Indeks padł:
-- kolizji jest DZIEWIĘĆ, a większość dotyczy faktur WARSZTATÓW wystawianych ich
-- klientom, nie faktur GetRido. Plik nie był wykonany, więc edycja nie łamie
-- zasady „nie ruszaj wykonanych migracji". Pełny indeks przeniesiony do osobnej
-- migracji — patrz koniec pliku.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SKĄD SIĘ WZIĘŁY
-- ═══════════════════════════════════════════════════════════════════════════
-- Ta sama usterka, którą zamknęła migracja `20260909162228`: numeracja liczyła
-- z faktur AKTYWNYCH, więc skasowanie zwalniało numer. Dotyczyło to tak samo
-- faktur platformy, jak i faktur warsztatów — moduł jest jeden
-- (`SimpleFreeInvoice` + `_shared/invoiceNumbering.ts`).
--
-- Stan zastany (cała tabela: 69 faktur, 5 wystawców):
--
--   DZIEWIĘĆ grup kolizji na TRZECH kontach, z tego SIEDEM ma po jednej
--   aktywnej fakturze i resztę skasowanych — czyli czysty ślad po kasowaniu.
--   DWIE mają po DWIE AKTYWNE faktury i wymagają decyzji człowieka.
--
-- Ta migracja rusza WYŁĄCZNIE wiersze skasowane. Żadnego aktywnego dokumentu
-- nie dotyka.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO SUFIKS, A NIE KOLEJNY WOLNY NUMER
-- ═══════════════════════════════════════════════════════════════════════════
-- `FV/2026/07/006-WYCOFANA-1` nie pasuje do wzorca serii (`^FV/2026/07/\d+$`),
-- więc `extractSeq` go IGNORUJE i nie wpływa na liczenie kolejnych numerów.
-- Widać przy tym na pierwszy rzut oka, że to dokument wycofany.
--
-- Nadanie kolejnego wolnego numeru byłoby gorsze: dokument skasowany zająłby
-- numer należny następnej prawdziwej sprzedaży.
--
-- Numeracja sufiksu jest po `created_at`, bo w jednej grupie potrafią być TRZY
-- skasowane wiersze (`FV/2026/07/006`).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. CO RUSZAMY
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE do_wycofania ON COMMIT DROP AS
WITH kolizje AS (
  SELECT user_id, invoice_number
  FROM public.user_invoices
  GROUP BY user_id, invoice_number
  HAVING count(*) > 1
)
SELECT i.id,
       i.invoice_number AS stary,
       i.invoice_number || '-WYCOFANA-' ||
         row_number() OVER (PARTITION BY i.user_id, i.invoice_number ORDER BY i.created_at) AS nowy
FROM public.user_invoices i
JOIN kolizje k ON k.user_id = i.user_id AND k.invoice_number = i.invoice_number
WHERE i.deleted_at IS NOT NULL;

DO $KONTROLA$
DECLARE
  v_grup  int;
  v_wierszy int;
  v_ksef  int;
  v_zajete text;
BEGIN
  SELECT count(*) INTO v_grup FROM (
    SELECT user_id, invoice_number FROM user_invoices
    GROUP BY user_id, invoice_number HAVING count(*) > 1) t;
  SELECT count(*) INTO v_wierszy FROM do_wycofania;

  -- Rozpoznanie z 10.09 mowilo: 9 grup, 13 wierszy skasowanych. Inny stan
  -- znaczy, ze cos sie zmienilo — wtedy migracja ma STANAC.
  IF v_grup > 15 THEN
    RAISE EXCEPTION 'Grup kolizji jest % zamiast okolo 9 — stan inny niz przy rozpoznaniu', v_grup;
  END IF;

  -- Faktura wyslana do KSeF jest ZAMROZONA: wyzwalacz
  -- `prevent_ksef_frozen_invoice_update` zablokuje zmiane jej numeru. Zadna
  -- ze skasowanych w kolizjach nie ma numeru KSeF (sprawdzone), ale gdyby
  -- kiedys miala — mamy stanac, a nie dowiedziec sie o tym z wyjatku.
  SELECT count(*) INTO v_ksef
  FROM user_invoices i JOIN do_wycofania d ON d.id = i.id
  WHERE i.ksef_reference IS NOT NULL;
  IF v_ksef > 0 THEN
    RAISE EXCEPTION '% wycofywanych faktur ma numer KSeF — sa zamrozone i nie wolno ich przenumerowac', v_ksef;
  END IF;

  -- Nowy numer nie moze zderzyc sie z istniejacym.
  SELECT string_agg(d.nowy, ', ') INTO v_zajete
  FROM do_wycofania d
  JOIN user_invoices i ON i.invoice_number = d.nowy
   AND i.user_id = (SELECT user_id FROM user_invoices x WHERE x.id = d.id);
  IF v_zajete IS NOT NULL THEN
    RAISE EXCEPTION 'Numery wycofania sa juz zajete: %', v_zajete;
  END IF;

  RAISE NOTICE 'Kolizji: %. Do wycofania (wylacznie skasowane): % wierszy.', v_grup, v_wierszy;
END $KONTROLA$;

-- ---------------------------------------------------------------------------
-- 2. WYCOFANIE
-- ---------------------------------------------------------------------------
UPDATE public.user_invoices i
SET invoice_number = d.nowy
FROM do_wycofania d
WHERE i.id = d.id;

-- ---------------------------------------------------------------------------
-- KONTROLA KOŃCOWA
-- ---------------------------------------------------------------------------
DO $KONIEC$
DECLARE
  v_zostalo int;
  v_opis    text;
  v_aktywne int;
  v_probny  uuid;
  v_user    uuid;
  v_numer   text := 'KONTROLA/WYC/' || substr(gen_random_uuid()::text, 1, 8);
  v_id2     uuid := gen_random_uuid();
  v_udalo   boolean;
BEGIN
  -- (a) Nie zostala ANI JEDNA kolizja z udzialem wiersza skasowanego.
  SELECT count(*) INTO v_zostalo FROM (
    SELECT user_id, invoice_number FROM user_invoices
    GROUP BY user_id, invoice_number
    HAVING count(*) > 1 AND count(*) FILTER (WHERE deleted_at IS NOT NULL) > 0) t;
  IF v_zostalo > 0 THEN
    RAISE EXCEPTION 'Zostalo % kolizji zawierajacych skasowany wiersz', v_zostalo;
  END IF;

  -- (b) Zostaly WYLACZNIE kolizje dwoch AKTYWNYCH dokumentow — i mowimy ktore.
  SELECT count(*), string_agg(u.email || ' ' || t.invoice_number, ', ') INTO v_aktywne, v_opis
  FROM (
    SELECT user_id, invoice_number FROM user_invoices
    WHERE deleted_at IS NULL
    GROUP BY user_id, invoice_number HAVING count(*) > 1) t
  JOIN auth.users u ON u.id = t.user_id;

  IF v_aktywne > 0 THEN
    RAISE WARNING 'DO DECYZJI CZLOWIEKA: % grup po DWIE AKTYWNE faktury o tym samym numerze — %. Migracja ich NIE RUSZA. Pelny indeks unikalny wejdzie dopiero po ich rozstrzygnieciu.', v_aktywne, v_opis;
  END IF;

  -- (c) KONTROLA POZYTYWNA: zwykle wystawienie MA dzialac. Bez niej caly ten
  --     zestaw sprawdzen przeszedlby takze wtedy, gdyby cos zablokowalo zapis.
  SELECT platform_invoice_user_id INTO v_user FROM billing_settings WHERE id = true;
  IF v_user IS NOT NULL THEN
    INSERT INTO user_invoices (id, user_id, invoice_number, issue_date)
    VALUES (v_id2, v_user, v_numer, current_date);
    IF NOT EXISTS (SELECT 1 FROM user_invoices WHERE id = v_id2) THEN
      RAISE EXCEPTION 'Kontrola pozytywna padla — nie da sie wystawic faktury';
    END IF;

    -- (d) I numer skasowanej nadal ma byc zajety (wyzwalacz z 20260909162228).
    UPDATE user_invoices SET deleted_at = now() WHERE id = v_id2;
    v_udalo := true;
    BEGIN
      INSERT INTO user_invoices (user_id, invoice_number, issue_date)
      VALUES (v_user, v_numer, current_date);
    EXCEPTION WHEN unique_violation THEN v_udalo := false;
    END;
    DELETE FROM user_invoices WHERE invoice_number = v_numer;
    IF v_udalo THEN
      RAISE EXCEPTION 'Numer skasowanej faktury znowu da sie uzyc — wyzwalacz przestal dzialac';
    END IF;
  END IF;

  RAISE NOTICE 'Numery skasowanych faktur wycofane. Aktywne dokumenty nietkniete.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- CO DALEJ
-- ---------------------------------------------------------------------------
-- Pełny indeks unikalny `(user_id, invoice_number)` bez warunku na `deleted_at`
-- czeka w migracji `20260910…_pelny_indeks_numeru_faktury`. Da się go założyć
-- dopiero, gdy znikną DWIE ostatnie kolizje — te po dwie AKTYWNE faktury.
-- Do tego czasu chroni wyzwalacz `prevent_duplicate_invoice_number` plus
-- indeks częściowy na wierszach aktywnych.
