-- ═══════════════════════════════════════════════════════════════════════════
-- CZYSTY STAN LICZNIKA MINUT PRZED WDROŻENIEM (13.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Decyzja właściciela: wszystko sprzed wdrożenia to testy. Nie naliczamy
-- wstecznie, nie odtwarzamy starych rozmów — zerujemy licznik i zaczynamy od
-- zera. Od wdrożenia licznik ma odliczać każdą rozmowę.
--
-- STAN ZASTANY (zmierzony, nie oszacowany):
--   • 65 rozmów w `voice_calls`, wszystkie z kont CART
--   • 51 z nich bez naliczenia (`minutes_charged IS NULL`)
--   • 17 minut zapisanych w `billing_usage` dla CART78GARAGE, okres 2026-09-01
--
-- DLACZEGO DWA KROKI — bo licznik ma dwa źródła i wyzerowanie jednego
-- zostawiłoby drugie uzbrojone:
--
--   1. `billing_usage` — z tego liczy się licznik w nagłówku i bramka minut
--      (`check_usage` → `voice_saldo_minut` → `voice_odmowic_brak_minut`).
--
--   2. `voice_calls.minutes_charged` — po tej kolumnie chodzi idempotencja
--      naliczania: nalicza się to, co ma tam NULL. Zostawienie 51 NULL-i
--      znaczyłoby, że każde przyszłe przetworzenie tych rozmów (reconcile,
--      ponowny webhook, ręczne domknięcie) może je naliczyć jeszcze raz —
--      już PO wdrożeniu, czyli prosto w saldo płacącego warsztatu.
--      Stempel `0` zamyka je na zawsze.
--
-- Uruchomienie:  supabase db query --linked -f scripts/sql/13-09-czysty-stan-minut.sql

update billing_usage u
   set used = 0
  from billing_features f
 where f.id = u.feature_id
   and f.key = 'voice_minutes'
   and u.used <> 0;

update voice_calls
   set minutes_charged = 0
 where minutes_charged is null;

-- KONTROLA PO ZMIANIE. Oczekiwane: 0, 0, 0.
select
  (select coalesce(sum(u.used), 0)
     from billing_usage u
     join billing_features f on f.id = u.feature_id
    where f.key = 'voice_minutes')                              as zuzyte_minuty,
  (select count(*) from voice_calls where minutes_charged is null) as rozmowy_bez_naliczenia,
  (select coalesce(sum(minutes_charged), 0) from voice_calls)      as suma_naliczen;
