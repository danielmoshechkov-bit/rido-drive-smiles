-- 20260716_SECFIX_H5_supplier_mappings.sql
-- =====================================================================
-- SECFIX H5 — supplier_mappings: koniec anonimowego INSERT (zapis mapowań
-- kodów dostawców części tylko dla zalogowanych; odczyt bez zmian).
-- WYKONANE RĘCZNIE NA PRODUKCJI 16.07 — plik odtworzony 1:1 dla repo (Lovable).
-- Idempotentne.
-- =====================================================================
DROP POLICY IF EXISTS "Anyone can insert supplier_mappings" ON public.supplier_mappings;
CREATE POLICY "Authenticated can insert supplier_mappings" ON public.supplier_mappings
  FOR INSERT TO authenticated WITH CHECK (true);
