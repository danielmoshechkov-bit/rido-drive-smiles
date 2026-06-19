-- FIX-P1 — intercars_token_cache: wyciek tokenu integracji (access_token globalnie)
-- ---------------------------------------------------------------------------
-- Polityka ALL "Service role full access on intercars_token_cache" miała
-- USING(true)/CHECK(true) dla roli public → KAŻDY (anon+authenticated) czytał i
-- nadpisywał access_token. Nazwa myląca: service-role i tak omija RLS.
--
-- Czytelnik z frontu: BRAK. Tabelę używa wyłącznie edge workshop-parts-api
-- (service-role, omija RLS). Dlatego usuwamy politykę i NIE tworzymy nowej →
-- RLS on + 0 polityk = deny-all dla authenticated/anon. Edge działa dalej.

DROP POLICY IF EXISTS "Service role full access on intercars_token_cache" ON public.intercars_token_cache;

-- (świadomie brak CREATE POLICY → deny-all dla zwykłych userów)

-- =========================================================================
-- ROLLBACK (przywraca dokładnie stan sprzed FIX-P1):
-- =========================================================================
-- CREATE POLICY "Service role full access on intercars_token_cache"
--   ON public.intercars_token_cache
--   FOR ALL TO public USING (true) WITH CHECK (true);
