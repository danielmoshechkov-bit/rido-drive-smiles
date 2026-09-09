-- Wpisu przechowania nie dalo sie usunac. Pomylka przy przyjeciu zostawala
-- na liscie na zawsze, a warsztat mial jedyne wyjscie: wydac komplet,
-- ktorego nikt nie odbieral.
--
-- Usuwamy MIEKKO. Klient, ktory dostal link SMS-em albo mailem, nie moze
-- zostac z martwa strona tylko dlatego, ze warsztat posprzatal u siebie.
-- Jego potwierdzenie dziala dalej i mowi wprost, ze wpis zostal usuniety
-- oraz kiedy.

ALTER TABLE public.workshop_tire_storage
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

COMMENT ON COLUMN public.workshop_tire_storage.deleted_at IS
  'Miekkie usuniecie. Wpis znika z list warsztatu, ale potwierdzenie klienta dziala dalej.';

CREATE INDEX IF NOT EXISTS workshop_tire_storage_zywe
  ON public.workshop_tire_storage (provider_id, is_active)
  WHERE deleted_at IS NULL;

ALTER TABLE public.workshop_tire_receipts
  ADD COLUMN IF NOT EXISTS usunieto_at timestamptz;

-- Usuniecie u warsztatu odbija sie w potwierdzeniu klienta.
CREATE OR REPLACE FUNCTION public.oznacz_usuniecie_w_potwierdzeniu()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
    RETURN NEW;
  END IF;

  UPDATE workshop_tire_receipts
  SET usunieto_at = NEW.deleted_at
  WHERE storage_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuniecie_w_potwierdzeniu ON public.workshop_tire_storage;
CREATE TRIGGER trg_usuniecie_w_potwierdzeniu
  AFTER UPDATE OF deleted_at ON public.workshop_tire_storage
  FOR EACH ROW EXECUTE FUNCTION public.oznacz_usuniecie_w_potwierdzeniu();

-- Usuniety komplet nie dostaje juz przypomnien: nie ma po co upominac sie
-- o cos, czego warsztat u siebie skreslil.
DROP VIEW IF EXISTS public.workshop_tire_reminders_due;
CREATE VIEW public.workshop_tire_reminders_due AS
SELECT
  s.id, s.provider_id, s.client_id, s.storage_number, s.season, s.quantity,
  s.reminder_count, s.reminder_months,
  COALESCE(s.reminder_channel, 'sms'::text) AS channel,
  COALESCE(s.pickup_deadline,
           (s.stored_at + make_interval(months => COALESCE(s.reminder_months, 6)))::date) AS due_date,
  COALESCE(NULLIF(s.client_name, ''::text),
           TRIM(BOTH FROM (COALESCE(c.first_name, ''::text) || ' '::text) || COALESCE(c.last_name, ''::text)),
           c.company_name) AS client_name,
  NULLIF(COALESCE(NULLIF(s.client_phone, ''::text), c.phone), ''::text) AS phone,
  NULLIF(c.email, ''::text) AS email,
  COALESCE(NULLIF(p.short_name, ''::text), p.company_name) AS provider_name,
  p.company_phone AS provider_phone,
  v.plate AS vehicle_plate
FROM workshop_tire_storage s
  LEFT JOIN workshop_clients c ON c.id = s.client_id
  LEFT JOIN workshop_vehicles v ON v.id = s.vehicle_id
  LEFT JOIN service_providers p ON p.id = s.provider_id
  LEFT JOIN workshop_tire_storage_settings z ON z.provider_id = s.provider_id
WHERE s.is_active IS TRUE
  AND s.deleted_at IS NULL
  AND s.pickup_at IS NULL
  AND s.nieodebrane_od IS NULL
  AND COALESCE(s.reminder_channel, 'sms'::text) <> 'none'::text
  AND (z.przypomnienia_od IS NULL OR s.stored_at::date >= z.przypomnienia_od)
  AND COALESCE(s.pickup_deadline,
               (s.stored_at + make_interval(months => COALESCE(s.reminder_months, 6)))::date)
      <= (CURRENT_DATE + 7)
  AND (s.reminder_sent_at IS NULL
       OR s.reminder_sent_at < now() - CASE
            WHEN COALESCE(s.reminder_months, 0) > 0
              THEN make_interval(months => s.reminder_months)
            ELSE make_interval(days => COALESCE(z.co_ile_dni_przypominac, 30))
          END)
  AND s.reminder_count < COALESCE(z.ile_przypomnien_max, 6);

ALTER VIEW public.workshop_tire_reminders_due SET (security_invoker = true);
