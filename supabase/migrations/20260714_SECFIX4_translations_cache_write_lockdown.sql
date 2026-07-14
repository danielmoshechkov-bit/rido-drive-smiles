-- 20260714_SECFIX4_translations_cache_write_lockdown.sql
-- =====================================================================
-- SECFIX ETAP 4 — workshop_translations_cache: koniec zapisu przez authenticated
-- ---------------------------------------------------------------------
-- Było: "Auth insert/update translations cache" WITH CHECK/USING (true) — każdy
-- ZALOGOWANY user mógł nadpisać dowolny wiersz współdzielonego cache tłumaczeń
-- (cache poisoning; nie PII, ale otwarty zapis między najemcami).
-- Jedyny realny zapis to edge function workshop-translate-batch, która używa
-- SERVICE_ROLE (GRANT ALL → omija RLS, więc dalej działa). Front NIE zapisuje
-- tej tabeli. Zostawiamy tylko odczyt dla authenticated (współdzielony cache).
--
-- Destrukcyjne (DROP), ale niezależne od frontu — można wykonać w oknie deployu.
-- Idempotentne.
-- =====================================================================

DROP POLICY IF EXISTS "Auth insert translations cache" ON public.workshop_translations_cache;
DROP POLICY IF EXISTS "Auth update translations cache" ON public.workshop_translations_cache;

-- (Zostaje: "Auth read translations cache" SELECT TO authenticated USING (true)
--  — współdzielony odczyt; oraz GRANT ALL dla service_role = zapis z edge.)

-- =====================================================================
-- WERYFIKACJA (oczekiwane: brak polityk write dla authenticated):
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE schemaname='public' AND tablename='workshop_translations_cache';
--   -- powinno zostać tylko SELECT dla {authenticated}.
--   -- Test: zalogowany user INSERT/UPDATE → odmowa; edge translate-batch → działa.
-- =====================================================================
-- ROLLBACK: odtworzyć 2 polityki z 20260611153750 (INSERT/UPDATE WITH CHECK/USING true).
-- =====================================================================
