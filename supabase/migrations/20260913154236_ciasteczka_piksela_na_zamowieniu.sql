-- `fbp` i `fbc` zapamiętane przy rozpoczęciu zakupu.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PO CO KOLUMNY, A NIE ODCZYT Z PRZEGLĄDARKI
-- ═══════════════════════════════════════════════════════════════════════════
-- Conversions API wysyła `meta-capi`, wołane z `billing-payu-webhook` w chwili
-- WYDANIA zamówienia. Webhook nie ma przeglądarki — a `fbp` i `fbc` żyją
-- wyłącznie w niej.
--
-- Cały sens serwerowej kopii zdarzenia polega na tym, że działa TAKŻE wtedy,
-- gdy klient nigdy nie wróci na stronę: zapłacił w BLIK-u na telefonie
-- i zamknął kartę. Gdyby ciasteczka trzeba było odczytać po powrocie, kopia
-- serwerowa nie łapałaby dokładnie tych przypadków, dla których powstała.
--
-- Dlatego przeglądarka podaje je RAZ, przy rozpoczęciu płatności, a my
-- trzymamy je przy zamówieniu do chwili wydania.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO TO NIE JEST
-- ═══════════════════════════════════════════════════════════════════════════
-- To nie są dane osobowe: `_fbp` to identyfikator przeglądarki nadany przez
-- piksel, `_fbc` to identyfikator kliknięcia w reklamę. Oba powstają WYŁĄCZNIE
-- po zgodzie marketingowej — bez niej piksel się nie uruchamia i kolumny
-- zostają puste.
--
-- Ich pustka jest przy tym SYGNAŁEM: `meta-capi` traktuje brak obu jak brak
-- zgody i nie wysyła niczego, nawet znając adres z konta.

BEGIN;

ALTER TABLE public.billing_orders
  ADD COLUMN IF NOT EXISTS meta_fbp text,
  ADD COLUMN IF NOT EXISTS meta_fbc text;

COMMENT ON COLUMN public.billing_orders.meta_fbp IS
  'Ciasteczko _fbp z przeglądarki, zapamiętane przy rozpoczęciu płatności. Puste = piksel nie działał, czyli brak zgody marketingowej.';
COMMENT ON COLUMN public.billing_orders.meta_fbc IS
  'Ciasteczko _fbc (kliknięcie w reklamę). Puste = klient nie przyszedł z reklamy albo nie było zgody.';

DO $KONIEC$
DECLARE
  v_ile int;
  v_zam uuid;
  v_udalo boolean := true;
BEGIN
  -- (a) Obie kolumny istnieją.
  SELECT count(*) INTO v_ile FROM information_schema.columns
  WHERE table_schema='public' AND table_name='billing_orders'
    AND column_name IN ('meta_fbp','meta_fbc');
  IF v_ile <> 2 THEN
    RAISE EXCEPTION 'Kolumn jest % zamiast 2', v_ile;
  END IF;

  -- (b) KONTROLA POZYTYWNA: da sie je zapisac i odczytac. Sam fakt istnienia
  --     kolumny nie dowodzi, ze zapis przejdzie — moglby go zablokowac
  --     wyzwalacz albo polityka.
  SELECT id INTO v_zam FROM billing_orders LIMIT 1;
  IF v_zam IS NOT NULL THEN
    UPDATE billing_orders SET meta_fbp = 'kontrola.migracji' WHERE id = v_zam;
    SELECT count(*) INTO v_ile FROM billing_orders
    WHERE id = v_zam AND meta_fbp = 'kontrola.migracji';
    IF v_ile <> 1 THEN
      RAISE EXCEPTION 'Kontrola pozytywna padla — nie da sie zapisac meta_fbp';
    END IF;
    UPDATE billing_orders SET meta_fbp = NULL WHERE id = v_zam;
  ELSE
    RAISE WARNING 'Brak zamowien — kontrola zapisu pominieta';
  END IF;

  -- (c) Zadne istniejace zamowienie nie dostalo wartosci z powietrza.
  SELECT count(*) INTO v_ile FROM billing_orders
  WHERE meta_fbp IS NOT NULL OR meta_fbc IS NOT NULL;
  IF v_ile > 0 THEN
    RAISE EXCEPTION 'Nowe kolumny nie sa puste (% wierszy) — cos je wypelnilo', v_ile;
  END IF;

  RAISE NOTICE 'Kolumny meta_fbp i meta_fbc zalozone, puste, zapisywalne.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';
