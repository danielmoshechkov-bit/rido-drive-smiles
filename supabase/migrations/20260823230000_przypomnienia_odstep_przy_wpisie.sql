-- Odstep miedzy przypomnieniami byl jeden dla calego warsztatu i liczony
-- w dniach. Naturalna jednostka w przechowalni to miesiac, a rytm bywa inny
-- dla roznych klientow — wiec odstep przenosimy NA WPIS.
--
-- `reminder_months` juz istnieje i mowi, po ilu miesiacach przypomniec
-- pierwszy raz. Ta sama liczba staje sie odstepem miedzy kolejnymi.
-- Ustawienie warsztatu zostaje jako wartosc zapasowa dla wpisow bez wlasnej.

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
  -- Odebrany komplet nie dostaje juz nic. To ten sam warunek co "klient
  -- zamknal sprawe" — po wydaniu przypominac nie ma o czym.
  AND s.pickup_at IS NULL
  AND s.nieodebrane_od IS NULL
  AND COALESCE(s.reminder_channel, 'sms'::text) <> 'none'::text
  AND COALESCE(s.pickup_deadline,
               (s.stored_at + make_interval(months => COALESCE(s.reminder_months, 6)))::date)
      <= (CURRENT_DATE + 7)
  -- Odstep bierzemy z wpisu (w miesiacach). Gdy wpis go nie ma, schodzimy
  -- do ustawienia warsztatu (w dniach).
  AND (s.reminder_sent_at IS NULL
       OR s.reminder_sent_at < now() - CASE
            WHEN COALESCE(s.reminder_months, 0) > 0
              THEN make_interval(months => s.reminder_months)
            ELSE make_interval(days => COALESCE(z.co_ile_dni_przypominac, 30))
          END)
  AND s.reminder_count < COALESCE(z.ile_przypomnien_max, 6);

ALTER VIEW public.workshop_tire_reminders_due SET (security_invoker = true);
