-- Phase A: fail-closed lockdown of tables that contain credentials or
-- integration secrets. Browser roles must never read or write these rows,
-- even when an older RLS policy would otherwise allow it.
--
-- This migration deliberately keeps all existing rows. Edge Functions that
-- need a locked table must authenticate and authorize the caller, derive the
-- tenant on the server, use service_role only after that check, and return a
-- status-only DTO (for example has_api_key=true), never the stored value.

DO $credential_lockdown$
DECLARE
  credential_table text;
BEGIN
  FOREACH credential_table IN ARRAY ARRAY[
    'agency_api_connections',
    'agency_settings',
    'agent_calendar_tokens',
    'ai_providers',
    'ai_secret_store',
    'ai_settings',
    'email_accounts',
    'external_integrations',
    'external_lead_sources',
    'ic_catalog_integrations',
    'intercars_token_cache',
    'invoice_email_configs',
    'ksef_settings',
    'location_integrations',
    'payment_gateway_config',
    'secure_app_settings',
    'sms_settings',
    'workshop_parts_integrations'
  ]
  LOOP
    -- Some installations do not contain every legacy/optional module. Missing
    -- tables are skipped so this hardening migration remains deployable.
    IF to_regclass(format('public.%I', credential_table)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
        credential_table
      );
      EXECUTE format(
        'ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',
        credential_table
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        credential_table
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM service_role',
        credential_table
      );
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',
        credential_table
      );
    END IF;
  END LOOP;
END
$credential_lockdown$;

-- Ten historyczny rekord JSON zawierał sekret wywołania Google Apps Script.
-- Pozostałe niesekretne klucze rido_settings pozostają dostępne adminowi, ale
-- rekord środowiskowy jest od tej migracji wyłącznie serwerowy.
ALTER TABLE public.rido_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rido_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage rido settings" ON public.rido_settings;
DROP POLICY IF EXISTS "Admins manage rido settings" ON public.rido_settings;
CREATE POLICY "Admins manage non-secret rido settings"
  ON public.rido_settings
  FOR ALL
  TO authenticated
  USING (
    key <> 'rido_settings_env'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    key <> 'rido_settings_env'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Intentionally blocked direct-browser workflows after this migration:
-- AI provider/TTS settings, Rido Mail account management, SMS/KSeF settings,
-- marketing API connections and lead sources, Google/location credentials,
-- payment gateway configuration, invoice-email webhooks, calendar OAuth, and
-- workshop parts supplier credentials. Restore each workflow only through an
-- authenticated Edge Function which accepts a new secret write-only and
-- returns redacted status/configuration fields.
--
-- Mixed business tables are NOT revoked here because doing so would disable
-- unrelated core features. They remain release blockers until secret columns
-- are moved to a server-only credential store and replaced with a reference:
--   * ai_sales_agents: meta_access_token, calendar_token,
--     twilio_auth_token, vapi_api_key
--   * agency_clients: meta_access_token, google_refresh_token,
--     instagram_access_token
--   * ad_orders: meta_access_token
--   * company_settings: ksef_token, ksef_token_encrypted
--   * service_providers: gmb_access_token
--   * rido_settings: JSON value contains the historical settlement secret
--   * vehicle_rentals and viewing/booking tables: capability tokens mixed with
--     operational records (must be exposed only through token-scoped RPCs)
--
-- Reference-only configuration tables (for example agency_crm_integrations,
-- admin_communication_settings and gtfs_data_sources) currently store secret
-- names rather than secret values and therefore are not locked by this change.
-- They must never receive a raw password/token in those reference columns or
-- in a generic JSON config. The hard-coded historical credentials found in
-- migrations/frontend require external rotation; this migration cannot rotate
-- them and intentionally does not delete or null existing data.
