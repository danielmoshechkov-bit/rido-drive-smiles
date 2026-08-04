-- Phase C: prywatny storage i izolacja właściciela/tenanta.
--
-- Ta migracja nie przenosi ani nie usuwa obiektów. Historyczne publiczne URL-e
-- oraz bezpośrednie uploady przestaną działać po jej zastosowaniu. Jest to
-- świadomy fail-closed: klient nie może sam mintować URL z dowolnym TTL ani
-- ominąć statusu kwarantanny. Odczyt wraca wyłącznie przez autoryzowany endpoint
-- private-storage-download (TTL 5 minut + security_audit_log) po kontrolowanym
-- backfillu private_storage_objects. Upload wymaga osobnego domenowego endpointu
-- z walidacją pliku, kwarantanną, limitem i atomowym wpisem metadata.

-- ---------------------------------------------------------------------------
-- 1. Wszystkie potwierdzone buckety z danymi prywatnymi są prywatne
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('documents', 'documents', false, 26214400, NULL),
  ('workspace-files', 'workspace-files', false, 20971520, NULL),
  ('ticket-screenshots', 'ticket-screenshots', false, 10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]),
  ('driver-documents', 'driver-documents', false, 26214400, NULL),
  ('document-attachments', 'document-attachments', false, 26214400, NULL),
  ('driver-invoices', 'driver-invoices', false, 26214400,
    ARRAY['application/pdf']::text[]),
  ('purchase-invoices', 'purchase-invoices', false, 26214400,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]),
  ('verification-documents', 'verification-documents', false, 10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]),
  ('meeting-audio', 'meeting-audio', false, 262144000,
    ARRAY['audio/webm', 'audio/mpeg', 'audio/wav', 'audio/x-wav',
          'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'video/mp4']::text[]),
  ('invoice-pdfs', 'invoice-pdfs', false, 26214400,
    ARRAY['application/pdf']::text[]),
  ('invoices', 'invoices', false, 26214400,
    ARRAY['application/pdf']::text[]),
  ('workshop-order-photos', 'workshop-order-photos', false, 26214400,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = least(
      coalesce(storage.buckets.file_size_limit, EXCLUDED.file_size_limit),
      EXCLUDED.file_size_limit
    ),
    allowed_mime_types = CASE
      WHEN EXCLUDED.allowed_mime_types IS NULL
        THEN storage.buckets.allowed_mime_types
      ELSE EXCLUDED.allowed_mime_types
    END;

-- Kanoniczne powiązanie prywatnego obiektu z właścicielem i zasobem domenowym.
-- Historyczne obiekty wymagają osobnego, kontrolowanego backfillu; migracja nie
-- zgaduje właściciela na podstawie niejednoznacznych nazw plików.
CREATE TABLE IF NOT EXISTS public.private_storage_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL CHECK (bucket_id IN (
    'documents', 'workspace-files', 'ticket-screenshots',
    'driver-documents', 'document-attachments', 'driver-invoices',
    'purchase-invoices', 'verification-documents', 'meeting-audio',
    'invoice-pdfs', 'invoices', 'workshop-order-photos'
  )),
  object_path text NOT NULL CHECK (
    length(object_path) BETWEEN 3 AND 1024
    AND object_path !~ '(^/|(^|/)\.\.(/|$)|[[:cntrl:]])'
  ),
  tenant_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT,
  -- UUID jest trwałym identyfikatorem właściciela. Brak FK jest świadomy:
  -- usunięcie auth.users nie może unieważnić CHECK ani przepisać właściciela;
  -- usunięty UUID nie uzyska ponownie sesji i obiekt pozostaje fail-closed.
  owner_user_id uuid,
  resource_type text NOT NULL CHECK (length(resource_type) BETWEEN 1 AND 80),
  resource_id uuid,
  classification text NOT NULL DEFAULT 'private'
    CHECK (classification IN ('private', 'confidential', 'restricted')),
  content_type text CHECK (content_type IS NULL OR length(content_type) <= 255),
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 262144000),
  content_sha256 text CHECK (
    content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'quarantined', 'deleted')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (bucket_id, object_path),
  CHECK (tenant_id IS NOT NULL OR owner_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS private_storage_objects_tenant_idx
  ON public.private_storage_objects (tenant_id, resource_type, resource_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS private_storage_objects_owner_idx
  ON public.private_storage_objects (owner_user_id, created_at DESC)
  WHERE status = 'active';

ALTER TABLE public.private_storage_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_storage_objects FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.private_storage_objects
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.private_storage_objects TO service_role;

DROP POLICY IF EXISTS phase_c_private_storage_metadata_read
  ON public.private_storage_objects;

-- Samo członkostwo w firmie nie uprawnia do wszystkich dokumentów klientów,
-- pracowników ani spraw supportowych. Dla obiektów tenantowych wymagany jest
-- jawny grant per użytkownik (lub ściślejsza reguła klasyfikacji w endpointcie).
-- Tabela ACL i metadane są niewidoczne dla PostgREST; zarządza nimi wyłącznie
-- zaufany endpoint podczas atomowego uploadu/nadania dostępu.
CREATE TABLE IF NOT EXISTS public.private_storage_object_acl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL
    REFERENCES public.private_storage_objects(id) ON DELETE CASCADE,
  grantee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'download' CHECK (permission = 'download'),
  expires_at timestamptz,
  revoked_at timestamptz,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text CHECK (reason IS NULL OR length(reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, grantee_user_id, permission)
);

CREATE INDEX IF NOT EXISTS private_storage_object_acl_grantee_idx
  ON public.private_storage_object_acl (grantee_user_id, object_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.private_storage_object_acl ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_storage_object_acl FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.private_storage_object_acl
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.private_storage_object_acl TO service_role;

-- Atomowy licznik ogranicza koszt mintowania signed URL przez jedno konto.
-- Jest ogólny, ale na tym etapie używa go tylko private-storage-download.
CREATE TABLE IF NOT EXISTS public.security_rate_limit_buckets (
  scope text NOT NULL CHECK (scope ~ '^[a-z0-9._:-]{3,80}$'),
  subject_id uuid NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, subject_id)
);

ALTER TABLE public.security_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_rate_limit_buckets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.security_rate_limit_buckets
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.security_rate_limit_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.security_consume_rate_limit(
  p_scope text,
  p_subject_id uuid,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF p_scope IS NULL OR p_scope !~ '^[a-z0-9._:-]{3,80}$'
     OR p_subject_id IS NULL
     OR p_limit NOT BETWEEN 1 AND 10000
     OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'invalid_rate_limit_contract' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.security_rate_limit_buckets AS bucket (
    scope, subject_id, window_started_at, request_count, updated_at
  ) VALUES (
    p_scope, p_subject_id, v_now, 1, v_now
  )
  ON CONFLICT (scope, subject_id) DO UPDATE
  SET window_started_at = CASE
        WHEN bucket.window_started_at
             <= v_now - make_interval(secs => p_window_seconds)
          THEN v_now
        ELSE bucket.window_started_at
      END,
      request_count = CASE
        WHEN bucket.window_started_at
             <= v_now - make_interval(secs => p_window_seconds)
          THEN 1
        -- p_limit+1 oznacza pierwszą odmowę; p_limit+2 zapobiega ponownemu
        -- logowaniu każdego kolejnego żądania w tym samym oknie.
        ELSE least(bucket.request_count + 1, p_limit + 2)
      END,
      updated_at = v_now
  RETURNING request_count INTO v_count;

  IF v_count = p_limit + 1 THEN
    INSERT INTO public.security_audit_log (
      actor_id, tenant_id, action, resource_type, resource_id,
      result, correlation_id, metadata
    ) VALUES (
      p_subject_id, NULL, 'rate_limit.exceeded', 'endpoint', p_scope,
      'denied', gen_random_uuid(),
      jsonb_build_object('limit', p_limit, 'window_seconds', p_window_seconds)
    );
  END IF;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.security_consume_rate_limit(text, uuid, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.security_consume_rate_limit(text, uuid, integer, integer)
  TO service_role;

-- Usuń każdą wcześniejszą politykę odnoszącą się do zabezpieczanych bucketów.
-- Użycie katalogu obejmuje także polityki o innych nazwach, które mogły zostać
-- dodane pomiędzy migracjami. Obejmuje to również workshop-order-photos:
-- bezpośrednie createSignedUrl nie zapewnia wymuszonego TTL ani audytu.
DO $phase_c_storage_policies$
DECLARE
  v_policy record;
  v_bucket text;
BEGIN
  FOR v_policy IN
    SELECT policyname, qual, with_check
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
  LOOP
    FOREACH v_bucket IN ARRAY ARRAY[
      'documents',
      'workspace-files',
      'ticket-screenshots',
      'driver-documents',
      'document-attachments',
      'driver-invoices',
      'purchase-invoices',
      'verification-documents',
      'meeting-audio',
      'invoice-pdfs',
      'invoices',
      'workshop-order-photos'
    ]::text[]
    LOOP
      IF position(quote_literal(v_bucket) IN coalesce(v_policy.qual, '')) > 0
         OR position(quote_literal(v_bucket) IN coalesce(v_policy.with_check, '')) > 0 THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', v_policy.policyname);
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
END;
$phase_c_storage_policies$;

-- ---------------------------------------------------------------------------
-- 2. Wąskie helpery ścieżek; nie przyjmują user_id i zawsze używają auth.uid()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.security_uuid_or_null(p_value text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
BEGIN
  RETURN p_value::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.security_uuid_or_null(text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.security_uuid_or_null(text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.security_can_access_workspace_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (storage.foldername(p_name))[1] = 'workspace'
    AND public.phase_c_can_access_workspace_project(
      public.security_uuid_or_null((storage.foldername(p_name))[2])
    );
$$;

REVOKE ALL ON FUNCTION public.security_can_access_workspace_object(text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.security_can_access_workspace_object(text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.security_can_access_fleet_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.security_uuid_or_null((storage.foldername(p_name))[1])
           = public.get_user_fleet_id(auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.security_can_access_fleet_object(text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.security_can_access_fleet_object(text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.security_can_access_driver_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH path AS (
    SELECT storage.foldername(p_name) AS folder
  )
  SELECT auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR (path.folder)[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.driver_app_users AS app_user
        WHERE app_user.user_id = auth.uid()
          AND app_user.driver_id = public.security_uuid_or_null((path.folder)[1])
      )
      OR EXISTS (
        SELECT 1
        FROM public.drivers AS driver
        WHERE driver.id = public.security_uuid_or_null((path.folder)[1])
          AND driver.fleet_id = public.get_user_fleet_id(auth.uid())
      )
      OR (
        (path.folder)[1] IN ('fleet_signatures', 'fleet_stamps', 'fleet_logos')
        AND public.security_uuid_or_null((path.folder)[2])
              = public.get_user_fleet_id(auth.uid())
      )
    )
  FROM path;
$$;

REVOKE ALL ON FUNCTION public.security_can_access_driver_object(text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.security_can_access_driver_object(text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Brak klientowych polityk dla prywatnych bucketów jest zamierzony
-- ---------------------------------------------------------------------------

-- Stare ścieżki nie pozwalają jednoznacznie wyprowadzić właściciela, roli ani
-- klasy danych. Bezpośredni SELECT pozwoliłby ominąć wymuszony TTL i audyt,
-- a INSERT ominąłby private_storage_objects oraz kwarantannę. Dlatego wszystkie
-- prywatne uploady/odczyty są zablokowane do czasu przejścia danej domeny na
-- serwerowy kontrakt. Service role nie otrzymuje tu nowej polityki ani grantu.

-- ---------------------------------------------------------------------------
-- 4. Publiczne media pozostają publiczne do odczytu, ale nie do cudzego zapisu
-- ---------------------------------------------------------------------------

-- Publiczny URL nie oznacza dowolnego hostingu plików. Ograniczamy rozmiar i
-- deklarowany MIME do pasywnych formatów rastrowych; SVG/HTML/GIF nie są tu
-- potrzebne. Docelowy endpoint uploadu powinien dodatkowo sprawdzać magic bytes
-- i ponownie kodować obraz, ponieważ sam Content-Type klienta nie jest dowodem.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('listing-photos', 'listing-photos', true, 10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('entity-logos', 'entity-logos', true, 5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('car-photos', 'car-photos', true, 15728640,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('ad-media', 'ad-media', true, 104857600,
    ARRAY['image/jpeg', 'image/png', 'image/webp',
          'video/mp4', 'video/webm']::text[])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = least(
      coalesce(storage.buckets.file_size_limit, EXCLUDED.file_size_limit),
      EXCLUDED.file_size_limit
    ),
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Auth users can upload listing photos" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete own listing photos" ON storage.objects;
CREATE POLICY phase_c_listing_photos_owner_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(name) ~ '\.(jpe?g|png|webp)$'
  );
CREATE POLICY phase_c_listing_photos_owner_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(name) ~ '\.(jpe?g|png|webp)$'
  );
CREATE POLICY phase_c_listing_photos_owner_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "car-photos public read" ON storage.objects;
DROP POLICY IF EXISTS "car-photos owner insert" ON storage.objects;
DROP POLICY IF EXISTS "car-photos owner update" ON storage.objects;
DROP POLICY IF EXISTS "car-photos owner delete" ON storage.objects;
CREATE POLICY phase_c_car_photos_public_read
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'car-photos');
CREATE POLICY phase_c_car_photos_owner_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'car-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(name) ~ '\.(jpe?g|png|webp)$'
  );
CREATE POLICY phase_c_car_photos_owner_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'car-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'car-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(name) ~ '\.(jpe?g|png|webp)$'
  );
CREATE POLICY phase_c_car_photos_owner_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'car-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Public can view ad media" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload ad media" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update ad media" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete ad media" ON storage.objects;
CREATE POLICY phase_c_ad_media_public_read
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'ad-media');
CREATE POLICY phase_c_ad_media_admin_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ad-media'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'real_estate_admin'::public.app_role)
    )
    AND lower(name) ~ '\.(jpe?g|png|webp|mp4|webm)$'
  );
CREATE POLICY phase_c_ad_media_admin_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ad-media'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'real_estate_admin'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'ad-media'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'real_estate_admin'::public.app_role)
    )
    AND lower(name) ~ '\.(jpe?g|png|webp|mp4|webm)$'
  );
CREATE POLICY phase_c_ad_media_admin_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ad-media'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'real_estate_admin'::public.app_role)
    )
  );

-- `entity-logos` miało globalne UPDATE/DELETE dla każdego authenticated.
-- Pozostawiamy publiczny SELECT, lecz zapis wymaga nowego prefiksu user/<uid>/
-- lub providera należącego do aktora/firmy aktora. Stare ścieżki nadal są
-- czytelne, ale nie mogą zostać nadpisane przez innego użytkownika.
DROP POLICY IF EXISTS "Users can upload their entity logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their entity logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their entity logos" ON storage.objects;

CREATE OR REPLACE FUNCTION public.security_can_write_entity_logo(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      (
        (storage.foldername(p_name))[1] = 'user'
        AND (storage.foldername(p_name))[2] = auth.uid()::text
      )
      OR EXISTS (
        SELECT 1
        FROM public.service_providers AS provider
        WHERE provider.id = public.security_uuid_or_null((storage.foldername(p_name))[1])
          AND public.phase_c_can_manage_provider(provider.id)
      )
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    );
$$;

REVOKE ALL ON FUNCTION public.security_can_write_entity_logo(text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.security_can_write_entity_logo(text)
  TO authenticated;

CREATE POLICY phase_c_entity_logos_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'entity-logos'
    AND public.security_can_write_entity_logo(name)
    AND lower(name) ~ '\.(jpe?g|png|webp)$'
  );
CREATE POLICY phase_c_entity_logos_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'entity-logos'
    AND public.security_can_write_entity_logo(name)
  )
  WITH CHECK (
    bucket_id = 'entity-logos'
    AND public.security_can_write_entity_logo(name)
    AND lower(name) ~ '\.(jpe?g|png|webp)$'
  );
CREATE POLICY phase_c_entity_logos_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'entity-logos'
    AND public.security_can_write_entity_logo(name)
  );
