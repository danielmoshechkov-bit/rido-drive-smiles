-- 20260714_SECFIX2a_storage_provider_policies.sql
-- =====================================================================
-- SECFIX ETAP 2 — CZĘŚĆ A (ADDYTYWNA, bezpieczna do wykonania OD RAZU)
-- ---------------------------------------------------------------------
-- Dodaje polityki storage.objects zawężone do WŁAŚCICIELA pliku przez
-- ścieżkę: obiekty leżą pod `${order_id}/...`, więc pierwszy segment ścieżki
-- (storage.foldername(name))[1] = order_id → provider_id → user_id.
-- Dzięki nim zalogowany warsztat może mintować signed URL na SWOJE zdjęcia
-- (nowy front WorkshopOrderFilesTab) — potrzebne do testu przed lockdownem.
--
-- NIE rusza starych, szerokich polityk ani flagi public bucketu — stary front
-- (getPublicUrl na publicznym buckecie) działa dalej. Storage RLS łączy
-- polityki przez OR, więc nowe zawężone polityki niczego nie odbierają.
-- Zdjęcie szerokich polityk + prywatny bucket = CZĘŚĆ B (SECFIX2b), przy deployu.
--
-- Idempotentne (DROP POLICY IF EXISTS + CREATE).
-- =====================================================================

-- SELECT: właściciel czyta/mintuje signed URL tylko swoich obiektów
DROP POLICY IF EXISTS "Provider reads own order photos" ON storage.objects;
CREATE POLICY "Provider reads own order photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'workshop-order-photos'
  AND EXISTS (
    SELECT 1 FROM public.workshop_orders o
    JOIN public.service_providers sp ON sp.id = o.provider_id
    WHERE sp.user_id = auth.uid()
      AND o.id::text = (storage.foldername(name))[1]
  )
);

-- INSERT: upload tylko pod ścieżkę własnego zlecenia
DROP POLICY IF EXISTS "Provider uploads own order photos" ON storage.objects;
CREATE POLICY "Provider uploads own order photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'workshop-order-photos'
  AND EXISTS (
    SELECT 1 FROM public.workshop_orders o
    JOIN public.service_providers sp ON sp.id = o.provider_id
    WHERE sp.user_id = auth.uid()
      AND o.id::text = (storage.foldername(name))[1]
  )
);

-- DELETE: kasowanie tylko własnych obiektów
DROP POLICY IF EXISTS "Provider deletes own order photos" ON storage.objects;
CREATE POLICY "Provider deletes own order photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'workshop-order-photos'
  AND EXISTS (
    SELECT 1 FROM public.workshop_orders o
    JOIN public.service_providers sp ON sp.id = o.provider_id
    WHERE sp.user_id = auth.uid()
      AND o.id::text = (storage.foldername(name))[1]
  )
);

-- =====================================================================
-- WERYFIKACJA (po 2a): zalogowany właściciel createSignedUrl na swoim
-- obiekcie → działa; stary front (public URL) dalej działa (bucket wciąż
-- public). Anon file-read i public bucket NADAL otwarte do 2b.
-- =====================================================================
-- ROLLBACK 2a (nic nie psuje — to tylko dodatkowe zawężone polityki):
--   DROP POLICY IF EXISTS "Provider reads own order photos"   ON storage.objects;
--   DROP POLICY IF EXISTS "Provider uploads own order photos" ON storage.objects;
--   DROP POLICY IF EXISTS "Provider deletes own order photos" ON storage.objects;
-- =====================================================================
