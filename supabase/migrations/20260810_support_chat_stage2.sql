-- Czat wsparcia, etap 2: rozmowy gości + powiadomienia dla admina.
--
-- Numeru telefonu admina NIE trzymamy w `app_settings` — tamta tabela ma
-- politykę SELECT dla wszystkich, więc prywatny numer byłby publiczny.
-- Stąd osobna tabela, czytelna wyłącznie dla admina.

CREATE TABLE IF NOT EXISTS public.support_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),   -- pojedynczy wiersz
  notify_phone text,
  notify_email text,
  sms_enabled boolean NOT NULL DEFAULT true,
  -- nie częściej niż raz na tyle minut na jedną rozmowę
  sms_throttle_minutes integer NOT NULL DEFAULT 10 CHECK (sms_throttle_minutes BETWEEN 0 AND 240),
  -- cisza nocna (godziny lokalne PL); poza nią SMS-y lecą normalnie
  quiet_hours_from integer NOT NULL DEFAULT 22 CHECK (quiet_hours_from BETWEEN 0 AND 23),
  quiet_hours_to integer NOT NULL DEFAULT 7 CHECK (quiet_hours_to BETWEEN 0 AND 23),
  quiet_hours_enabled boolean NOT NULL DEFAULT true,
  -- mail do klienta, gdy admin odpisze, a klient nie ma otwartego okna
  email_client_on_reply boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.support_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.support_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_settings_admin" ON public.support_settings;
CREATE POLICY "support_settings_admin" ON public.support_settings
  FOR ALL TO authenticated
  USING (public.is_support_admin())
  WITH CHECK (public.is_support_admin());

-- Kiedy ostatnio poszedł mail do klienta (limit częstotliwości po stronie klienta).
ALTER TABLE public.support_conversations
  ADD COLUMN IF NOT EXISTS client_notified_at timestamptz;

COMMENT ON TABLE public.support_settings IS
  'Ustawienia powiadomień czatu wsparcia (numer SMS admina, cisza nocna, limity). Widoczne tylko dla admina.';
