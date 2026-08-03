-- =====================================================================
-- PRZECHOWALNIA OPON — WYSYŁKA PRZYPOMNIEŃ O ODBIORZE
--
-- Do tej pory formularz pytał „przypomnieć za ile miesięcy" i zapisywał odpowiedź,
-- ale nikt tych przypomnień nie wysyłał — pole było obietnicą bez pokrycia.
--
-- Ten plik daje dwie rzeczy:
--   1) widok `workshop_tire_reminders_due` — kto DZIŚ powinien dostać przypomnienie,
--      razem z gotowym numerem telefonu i mailem (żeby funkcja brzegowa nie musiała
--      robić czterech zapytań na komplet opon),
--   2) zadanie cykliczne, które raz dziennie każe funkcji je rozesłać.
--
-- OKNO CZASOWE (najważniejsza decyzja w tym pliku):
--   przypominamy od 7 dni PRZED terminem do 30 dni PO nim. Górna granica jest
--   po to, żeby pierwsze uruchomienie nie zasypało klientów SMS-ami o kompletach
--   sprzed dwóch sezonów — zaległości sprzed miesiąca to temat na telefon, nie
--   na automat. Dolna daje klientowi tydzień na umówienie wizyty.
-- =====================================================================

CREATE OR REPLACE VIEW public.workshop_tire_reminders_due AS
SELECT
  s.id,
  s.provider_id,
  s.client_id,
  s.storage_number,
  s.season,
  s.quantity,
  coalesce(s.reminder_channel, 'sms')                                   AS channel,
  -- Termin: data odbioru wpisana ręcznie ma pierwszeństwo, inaczej liczymy
  -- od przyjęcia + zadeklarowana liczba miesięcy (domyślnie 6 = jeden sezon).
  coalesce(
    s.pickup_deadline,
    (s.stored_at + make_interval(months => coalesce(s.reminder_months, 6)))::date
  )                                                                     AS due_date,
  coalesce(nullif(s.client_name, ''), trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
           c.company_name)                                              AS client_name,
  nullif(coalesce(nullif(s.client_phone, ''), c.phone), '')             AS phone,
  nullif(c.email, '')                                                   AS email,
  coalesce(nullif(p.short_name, ''), p.company_name)                    AS provider_name,
  p.company_phone                                                       AS provider_phone
FROM public.workshop_tire_storage s
LEFT JOIN public.workshop_clients c   ON c.id = s.client_id
LEFT JOIN public.service_providers p  ON p.id = s.provider_id
WHERE s.is_active IS TRUE
  AND s.pickup_at IS NULL              -- komplet nadal leży w magazynie
  AND s.reminder_sent_at IS NULL       -- jeszcze nie przypominaliśmy
  AND coalesce(s.reminder_channel, 'sms') <> 'none'   -- klient nie odmówił kontaktu
  AND coalesce(
        s.pickup_deadline,
        (s.stored_at + make_interval(months => coalesce(s.reminder_months, 6)))::date
      ) BETWEEN current_date - 30 AND current_date + 7;

COMMENT ON VIEW public.workshop_tire_reminders_due IS
  'Komplety opon, dla których dziś należy się przypomnienie o odbiorze (okno: 7 dni przed terminem do 30 dni po).';

-- Widok wykonuje się z prawami właściciela, więc omija RLS i pokazywałby dane
-- wszystkich warsztatów. Czyta go WYŁĄCZNIE funkcja brzegowa (service_role).
REVOKE ALL ON public.workshop_tire_reminders_due FROM anon, authenticated;
GRANT SELECT ON public.workshop_tire_reminders_due TO service_role;

-- ---------------------------------------------------------------------
-- Zadanie cykliczne: raz dziennie o 8:00 UTC (10:00 w Polsce latem, 9:00 zimą).
-- Rano, w godzinach pracy warsztatu — nie o świcie i nie w nocy.
-- ---------------------------------------------------------------------
SELECT cron.unschedule('workshop-tire-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'workshop-tire-reminders');

SELECT cron.schedule(
  'workshop-tire-reminders',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/workshop-tire-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
