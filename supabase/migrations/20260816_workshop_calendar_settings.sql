-- Ustawienia przypomnień SMS — miejsce, w którym mają się w ogóle zapisać.
--
-- Ekran „Ustawienia → Kalendarz → Przypomnienia SMS" zapisywał do kolumny
-- `calendar_settings` w tabeli `workshop_settings`. Ta kolumna nie istnieje,
-- a `workshop_settings` nie ma nawet `provider_id` (jest kluczowana po
-- użytkowniku). Skutek: zapis kończył się błędem „Could not find the
-- 'calendar_settings' column", a wczytywanie po cichu nie zwracało niczego —
-- czyli ekran nigdy nie działał, w żadną stronę.
--
-- Ustawienia są warsztatu, nie osoby: przypomnienia dotyczą wizyt całego
-- warsztatu i muszą wyglądać tak samo u właściciela i u pracownika przy
-- recepcji. Dlatego osobna tabela kluczowana po `provider_id`, a nie kolejna
-- kolumna w tabeli użytkownika.

CREATE TABLE IF NOT EXISTS public.workshop_calendar_settings (
  provider_id                 uuid PRIMARY KEY REFERENCES public.service_providers(id) ON DELETE CASCADE,
  sms_confirmation_on_booking boolean NOT NULL DEFAULT true,
  default_reminders           text[]  NOT NULL DEFAULT ARRAY['24h']::text[],
  default_duration            int     NOT NULL DEFAULT 60,
  max_bookings_per_day        int     NOT NULL DEFAULT 0,   -- 0 = bez limitu
  sms_templates               jsonb   NOT NULL DEFAULT '{}'::jsonb,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wcs_sensowne_wartosci CHECK (default_duration BETWEEN 5 AND 1440
                                      AND max_bookings_per_day BETWEEN 0 AND 500)
);

COMMENT ON TABLE public.workshop_calendar_settings IS
  'Domyślne przypomnienia i czas usługi dla rezerwacji warsztatu. Brak wiersza = wartości domyślne kolumn.';

ALTER TABLE public.workshop_calendar_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.workshop_calendar_settings TO authenticated;
GRANT ALL ON public.workshop_calendar_settings TO service_role;

-- Czytać musi też pracownik przy recepcji — to on zakłada wizytę i to jemu
-- mają się podstawić domyślne przypomnienia.
DROP POLICY IF EXISTS "wcs_read" ON public.workshop_calendar_settings;
CREATE POLICY "wcs_read" ON public.workshop_calendar_settings
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR provider_id IN (SELECT provider_id FROM workshop_employees WHERE user_id = auth.uid() AND status = 'active')
         OR public.has_role(auth.uid(), 'admin'::app_role));

-- Zmieniać może właściciel warsztatu (i admin) — to decyzja o tym, ile SMS-ów
-- wychodzi do klientów, czyli o koszcie.
DROP POLICY IF EXISTS "wcs_write" ON public.workshop_calendar_settings;
CREATE POLICY "wcs_write" ON public.workshop_calendar_settings
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
              OR public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_wcs_updated ON public.workshop_calendar_settings;
CREATE TRIGGER trg_wcs_updated BEFORE UPDATE ON public.workshop_calendar_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
