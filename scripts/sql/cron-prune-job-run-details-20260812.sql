-- ============================================================================
-- cron-prune-job-run-details-20260812.sql   — DO ZATWIERDZENIA
--
-- PRZYCZYNA WYCZERPANIA BUDŻETU DISK IO. Zmierzone 12.08:
--
--   cron.job_run_details:  439 956 wierszy, 481 MB, najstarszy z 2026-04-05
--   To NAJWIĘKSZA TABELA W CAŁEJ BAZIE — większa niż ic_parts_catalog (88 MB)
--   i cała reszta razem wzięta.
--
--   Najdroższe pojedyncze zapytanie w bazie (pg_stat_statements):
--     update cron.job_run_details set status = $1 ... where status in ($3,$4)
--     JEDNO wywołanie, 2 924 ms, 60 261 bloków z dysku = ~470 MB
--   pg_cron aktualizuje statusy skanując CAŁĄ tabelę. Im większa, tym drożej,
--   i tak w kółko.
--
-- pg_cron NIE SPRZĄTA po sobie. Supabase też nie. Tabela rośnie od kwietnia.
--
-- NASZ UDZIAŁ: crony głosowe to 57% wierszy z ostatnich 7 dni (31 156 z 54 733).
-- Cztery podtrzymujące co minutę dają 5 760 wierszy dziennie. Konsolidacja
-- w osobnym pliku (voice-keep-warm-consolidate) ścina to o 75%.
--
-- ⚠️ KOLEJNOŚĆ MA ZNACZENIE. Kasujemy PARTIAMI, bo pojedynczy DELETE na 430 tys.
-- wierszy przy WYCZERPANYM budżecie IO tylko pogłębi problem. VACUUM FULL na końcu
-- odzyskuje miejsce fizycznie (sam DELETE go nie zwalnia), ale BLOKUJE tabelę —
-- na logach cronów to nieszkodliwe, jednak uruchom to w spokojnym momencie.
--
-- Rollback: NIE ISTNIEJE i nie jest potrzebny — to logi wykonań, nie dane.
-- Zachowujemy 7 dni, czyli więcej, niż realnie oglądamy.
-- ============================================================================

-- KROK 1. Kasowanie partiami po 50 tys. Uruchamiaj, aż zwróci 0.
DELETE FROM cron.job_run_details
 WHERE ctid IN (
   SELECT ctid FROM cron.job_run_details
    WHERE end_time < now() - interval '7 days'
    LIMIT 50000
 );
-- Powtórz powyższe do skutku (ok. 9 przebiegów przy 440 tys. wierszy).

-- KROK 2. Fizyczne odzyskanie miejsca. DOPIERO po wyczyszczeniu.
--   VACUUM (FULL, ANALYZE) cron.job_run_details;

-- KROK 3. Codzienne sprzątanie o 4:00, żeby to się nie powtórzyło.
SELECT cron.schedule(
  'cron-prune-run-details',
  '0 4 * * *',
  $$ DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days' $$
);

-- KONTROLA:
--   SELECT count(*), pg_size_pretty(pg_total_relation_size('cron.job_run_details'))
--     FROM cron.job_run_details;
