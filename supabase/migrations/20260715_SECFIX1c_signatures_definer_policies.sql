-- 20260715_SECFIX1c_signatures_definer_policies.sql
-- =====================================================================
-- HOTFIX do SECFIX1b: podpis przez RPC znów działa (bez otwierania anon)
-- ---------------------------------------------------------------------
-- Problem: sign_workshop_document_by_client_code (SECURITY DEFINER) wstawia
-- wiersz do workshop_order_signatures. Właściciel funkcji NIE omija RLS na tej
-- tabeli (omija workshop_orders — stąd działa odczyt i zmiana statusu — ale
-- signatures ma innego właściciela). W Etapie 1 insert przechodził dzięki
-- PERMISYWNYM politykom anon ("... insertable by anyone with code" WITH CHECK
-- true, "Public insert signatures for client_code orders") — SECFIX1b je zdjął,
-- więc insert (i odczyt) w kontekście definera stracił jakąkolwiek politykę.
--
-- Naprawa: polityki SELECT+INSERT dla KONTEKSTU DEFINERA. W SECURITY DEFINER
-- current_user = właściciel funkcji (NIE anon/authenticated), a bezpośrednie
-- żądania PostgREST idą jako anon/authenticated. Warunek current_user NOT IN
-- ('anon','authenticated') przepuszcza więc TYLKO wywołanie przez RPC (oraz
-- service_role z edge), a bezpośredni anon/authenticated INSERT/SELECT pozostaje
-- zablokowany — dziura z SECFIX1b NIE wraca.
--
-- Panel czyta podpisy dalej przez istniejącą "Workshop signatures viewable by
-- provider" (authenticated provider) — nietknięta. Idempotentne.
-- =====================================================================

DROP POLICY IF EXISTS "Definer RPC can read signatures" ON public.workshop_order_signatures;
CREATE POLICY "Definer RPC can read signatures"
ON public.workshop_order_signatures FOR SELECT
USING (current_user NOT IN ('anon', 'authenticated'));

DROP POLICY IF EXISTS "Definer RPC can insert signatures" ON public.workshop_order_signatures;
CREATE POLICY "Definer RPC can insert signatures"
ON public.workshop_order_signatures FOR INSERT
WITH CHECK (current_user NOT IN ('anon', 'authenticated'));

-- =====================================================================
-- WERYFIKACJA:
--   -- polityki istnieją:
--   SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
--   WHERE schemaname='public' AND tablename='workshop_order_signatures';
--   -- test funkcjonalny: podpis reception_protocol/cost_estimate z karty klienta
--   --   (świeże zlecenie) → sukces, wiersz w workshop_order_signatures ze snapshotem.
--   -- kontrola izolacji: bezpośredni anon INSERT (bez RPC) → nadal RLS violation.
-- =====================================================================
-- ROLLBACK: DROP obu polityk (wróci błąd podpisu — tylko awaryjnie).
-- =====================================================================
