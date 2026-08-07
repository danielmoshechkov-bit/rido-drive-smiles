-- Historycznie ta migracja ustawiała hasło konta biuro@flamepartner.pl, wpisane
-- wprost w treści pliku (także w komentarzu). Repozytorium jest publiczne, więc
-- hasło było jawne dla każdego, kto je przeczytał — usunięte 2026-08-04.
--
-- Migracja jest już zaaplikowana na produkcji, dlatego treść zamieniono na
-- wykonywalny no-op zamiast usuwać plik: numeracja i kolejność migracji zostają
-- nienaruszone, a ponowne uruchomienie nie ustawi nikomu słabego hasła.
--
-- Hasło tego konta rotuje się w panelu Supabase (Authentication → Users →
-- Reset password) wraz z unieważnieniem aktywnych sesji. Nie wpisywać hasła
-- ponownie do repozytorium ani do żadnej migracji.

DO $$
BEGIN
  RAISE NOTICE 'Migracja 20260309202141: no-op. Haslo konta rotuje sie w panelu Supabase, nie w migracji.';
END $$;
