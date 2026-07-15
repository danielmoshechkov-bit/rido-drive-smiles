-- 20260714_SECFIX2b_storage_lockdown.sql
-- =====================================================================
-- SECFIX ETAP 2 — CZĘŚĆ B (DESTRUKCYJNA — wykonać DOPIERO RAZEM z deployem
-- nowego frontu WorkshopOrderFilesTab na signed URL)
-- ---------------------------------------------------------------------
-- 1) Bucket workshop-order-photos → PRYWATNY (koniec z pobieraniem plików
--    przez sam URL bez autoryzacji).
-- 2) DROP starych, szerokich polityk storage (public read; authenticated
--    insert/delete bez sprawdzenia właściciela) — zostają zawężone polityki
--    provider z SECFIX2a.
-- 3) DROP anon SELECT na workshop_order_files (anon nie enumeruje już ścieżek
--    plików wszystkich zleceń). Provider czyta dalej przez istniejącą politykę
--    "Provider can manage order files" (20260215195906).
--
-- WYMAGANIE KOLEJNOŚCI: nowy front (WorkshopOrderFilesTab na signed URL) musi być
-- już wdrożony. Po prywatyzacji bucketu stare publiczne URL-e przestają działać.
-- Karta klienta NIE pokazuje zdjęć (dowód wyłącznie dla warsztatu), więc jej
-- nie dotyczy.
--
-- Zakłada wykonane SECFIX2a. Idempotentne.
-- =====================================================================

-- 1) Bucket prywatny
UPDATE storage.buckets SET public = false WHERE id = 'workshop-order-photos';

-- 2) Zdejmij szerokie polityki storage (z 20260413132012)
DROP POLICY IF EXISTS "Workshop photos are publicly readable"  ON storage.objects;
DROP POLICY IF EXISTS "Workshop providers can upload photos"   ON storage.objects;
DROP POLICY IF EXISTS "Workshop providers can delete photos"   ON storage.objects;

-- 3) Zdejmij anon SELECT na tabeli plików (z 20260413132012)
DROP POLICY IF EXISTS "Anon can view order files via client code" ON public.workshop_order_files;

-- =====================================================================
-- WERYFIKACJA po 2b:
--   SELECT public FROM storage.buckets WHERE id='workshop-order-photos';  -- false
--   -- brak szerokich polityk (oczekiwane: 0):
--   SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
--     AND policyname IN ('Workshop photos are publicly readable',
--                        'Workshop providers can upload photos',
--                        'Workshop providers can delete photos');
--   -- brak anon file-read (oczekiwane: 0):
--   SELECT policyname FROM pg_policies WHERE schemaname='public'
--     AND tablename='workshop_order_files' AND 'anon' = ANY(roles);
--   -- jako anon: publiczny URL do obiektu → 400/403; SELECT z workshop_order_files → 0 wierszy.
-- =====================================================================
-- ROLLBACK 2b (przywraca WYCIEK — tylko awaryjnie): public=true + odtworzyć
-- 3 polityki storage i anon file-read z 20260413132012.
-- =====================================================================
