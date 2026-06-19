-- FIX-P2 — agency_api_connections: wyciek credentials (encrypted_data) na SELECT
-- ---------------------------------------------------------------------------
-- Polityka SELECT "Auth users can read agency_api_connections" miała USING(true)
-- → KAŻDY zalogowany czytał encrypted_data (credentials API). WRITE jest już
-- admin-only (ALL "Admins can manage..." has_role admin) i pozostaje bez zmian.
--
-- Czytelnik z frontu: MarketingConnectionsTab (panel marketingu/admina), pobiera
-- połączenia platformowe (account_type='getrido'). Spójnie z WRITE → SELECT też
-- ograniczamy do admina. (Gdy pojawią się per-agencyjne połączenia → dodać
-- OR created_by = auth.uid().)

DROP POLICY IF EXISTS "Auth users can read agency_api_connections" ON public.agency_api_connections;

CREATE POLICY "Admins can read agency_api_connections" ON public.agency_api_connections
  FOR SELECT TO authenticated
  USING ( has_role(auth.uid(), 'admin'::app_role) );

-- =========================================================================
-- ROLLBACK (przywraca dokładnie stan sprzed FIX-P2):
-- =========================================================================
-- DROP POLICY IF EXISTS "Admins can read agency_api_connections" ON public.agency_api_connections;
-- CREATE POLICY "Auth users can read agency_api_connections" ON public.agency_api_connections
--   FOR SELECT TO authenticated USING (true);
