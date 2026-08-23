-- Decyzja wlasciciela: nie wysylamy przypomnien do kompletow przyjetych
-- przed uruchomieniem tej funkcji. Klient, ktory zostawil opony rok temu,
-- nie spodziewa sie dzis SMS-a o zaleglosci, o ktorej nikt go nie uprzedzil.
--
-- Zamiast wylaczac przypomnienia na poszczegolnych wpisach (co trzeba by
-- potem cofac recznie) warsztat dostaje date graniczna. Wpisy starsze sa
-- pomijane przez wysylke, ale nadal widoczne na liscie i nadal licza
-- naleznosci — chodzi wylacznie o to, zeby nic nie wyszlo w przeszlosc.

ALTER TABLE public.workshop_tire_storage_settings
  ADD COLUMN IF NOT EXISTS przypomnienia_od date;

COMMENT ON COLUMN public.workshop_tire_storage_settings.przypomnienia_od IS
  'Przypomnienia wychodza tylko dla kompletow przyjetych od tego dnia. Puste = bez ograniczenia.';

-- Istniejacym warsztatom stawiamy granice na dzis, zeby uruchomienie funkcji
-- nie odezwalo sie nagle do wszystkich zaleglych naraz.
UPDATE public.workshop_tire_storage_settings
SET przypomnienia_od = current_date
WHERE przypomnienia_od IS NULL;

-- Warsztaty bez zapisanych zasad tez musza byc objete — inaczej granica
-- nie dziala tam, gdzie nikt nie wchodzil w ustawienia.
INSERT INTO public.workshop_tire_storage_settings (provider_id, przypomnienia_od)
SELECT DISTINCT s.provider_id, current_date
FROM public.workshop_tire_storage s
WHERE s.provider_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.workshop_tire_storage_settings z WHERE z.provider_id = s.provider_id
  );

DROP VIEW IF EXISTS public.workshop_tire_reminders_due;
CREATE VIEW public.workshop_tire_reminders_due AS
SELECT
  s.id,
  s.provider_id,
  s.client_id,
  s.storage_number,
  s.season,
  s.quantity,
  s.reminder_count,
  s.reminder_months,
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
  AND s.pickup_at IS NULL
  AND s.nieodebrane_od IS NULL
  AND COALESCE(s.reminder_channel, 'sms'::text) <> 'none'::text
  -- Granica wstecz: komplety przyjete wczesniej nie dostaja nic.
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
