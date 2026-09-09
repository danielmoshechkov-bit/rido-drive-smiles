-- Zadanie dokańczające wysyłkę faktur platformy.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PO CO
-- ═══════════════════════════════════════════════════════════════════════════
-- Od 09.09.2026 `billing-invoice-issue` WSTRZYMUJE maila, gdy KSeF nie oddał
-- jeszcze numeru — bo klient nie może dostać faktury bez numeru, a potem
-- drugiej z numerem. Bez zadania dokańczającego znaczyłoby to, że nie dostaje
-- jej WCALE.
--
-- Drugie zastosowanie jest równie ważne: faktura GR/2026/007 z 09.09 nie
-- dotarła do klienta mimo poprawnego adresu i nie było czym ponowić. Teraz
-- jest — sygnałem jest `email_sent_at IS NULL`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SEKRET Z VAULT, NIE W TREŚCI ZADANIA
-- ═══════════════════════════════════════════════════════════════════════════
-- Siedem zadań w tej bazie ma token wpisany WPROST w `cron.job.command` —
-- widoczny dla każdego, kto odczyta `cron.job`, i zapisany w publicznym
-- repozytorium razem z treścią migracji (pozycja 4.4 w STAN-PRAC). Tutaj
-- idziemy wzorcem `billing-ostrzezenia`: sekret czytany z `vault`.
--
-- ⚠️ WYMAGANIE WSTĘPNE: sekret `BILLING_CRON_SECRET` musi istnieć w panelu
-- Supabase (Edge Functions → Secrets) i mieć TĘ SAMĄ wartość co wpis
-- `billing_cron_secret` w vault. Oba już istnieją — używa ich
-- `billing-ostrzezenia` i `billing-gwarancja-ceny`.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'Brak rozszerzenia pg_cron — nie mam czym zaplanowac zadania';
  END IF;

  -- Fail-closed: bez sekretu zadanie chodziłoby i dostawało 403 przy każdym
  -- przebiegu, a w dzienniku wyglądałoby to na awarię funkcji.
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'billing_cron_secret') THEN
    RAISE EXCEPTION 'Brak sekretu billing_cron_secret w vault — zadanie dostawaloby 403';
  END IF;

  -- Idempotencja: powtórne uruchomienie migracji nie zakłada drugiego zadania.
  PERFORM cron.unschedule('billing-faktura-mail-ponow')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-faktura-mail-ponow');

  -- Co 10 minut. Częściej nie ma sensu: KSeF nadaje numer w minutach, a przy
  -- awarii poczty i tak liczy się godzina, nie minuta. Rzadziej znaczyłoby,
  -- że klient czeka na fakturę pół dnia.
  PERFORM cron.schedule(
    'billing-faktura-mail-ponow',
    '*/10 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/billing-faktura-mail-ponow',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'billing_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $cron$
  );
END $$;

-- ---------------------------------------------------------------------------
-- KONTROLA KOŃCOWA
-- ---------------------------------------------------------------------------
DO $KONIEC$
DECLARE
  v_ile int;
  v_cmd text;
BEGIN
  SELECT count(*) INTO v_ile FROM cron.job WHERE jobname = 'billing-faktura-mail-ponow';
  IF v_ile <> 1 THEN
    RAISE EXCEPTION 'Zadanie zalozone % razy zamiast raz', v_ile;
  END IF;

  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 'billing-faktura-mail-ponow';

  -- (a) Zadanie jest aktywne — samo istnienie wiersza nie wystarcza.
  IF NOT (SELECT active FROM cron.job WHERE jobname = 'billing-faktura-mail-ponow') THEN
    RAISE EXCEPTION 'Zadanie zalozone, ale nieaktywne';
  END IF;

  -- (b) Sekret idzie Z VAULT, a nie wpisany w treść. Kontrola pilnuje wzorca,
  --     bo to jego kopiowanie rozniosło problem na siedem zadań.
  IF v_cmd NOT LIKE '%vault.decrypted_secrets%' THEN
    RAISE EXCEPTION 'Zadanie nie czyta sekretu z vault — token trafilby do cron.job jawnie';
  END IF;
  IF v_cmd ~ 'eyJ[A-Za-z0-9_-]{20,}' THEN
    RAISE EXCEPTION 'W tresci zadania siedzi token JWT — dokladnie to, czego unikamy';
  END IF;

  -- (c) Kolumna, na której zadanie stoi, naprawdę istnieje. Bez niej funkcja
  --     padałaby przy każdym przebiegu, a zadanie meldowałoby sukces.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_invoices' AND column_name='email_sent_at'
  ) THEN
    RAISE EXCEPTION 'Brak user_invoices.email_sent_at — wykonaj najpierw migracje 20260909155654';
  END IF;

  RAISE NOTICE 'Zadanie billing-faktura-mail-ponow: co 10 minut, sekret z vault.';
END $KONIEC$;

COMMIT;
