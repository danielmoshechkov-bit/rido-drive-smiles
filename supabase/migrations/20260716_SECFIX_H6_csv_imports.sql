-- 20260716_SECFIX_H6_csv_imports.sql
-- =====================================================================
-- SECFIX H6 — csv_imports: koniec USING(true) na metadanych importów
-- (dostęp/zapis tylko dla admina; 0 zapisów z frontu).
-- WYKONANE RĘCZNIE NA PRODUKCJI 16.07 — plik odtworzony 1:1 dla repo (Lovable).
-- Idempotentne.
-- =====================================================================
DROP POLICY IF EXISTS "Admins can view import history" ON public.csv_imports;
CREATE POLICY "Admins manage import history" ON public.csv_imports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
