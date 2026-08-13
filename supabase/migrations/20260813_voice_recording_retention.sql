-- Sprzątanie nagrań rozmów — żeby dysk nie rósł w nieskończoność.
--
-- Jedno nagranie dwuminutowej rozmowy waży ok. 2 MB. Nagrania zapisujemy tylko
-- wtedy, gdy ktoś kliknie „Odsłuchaj", więc nie przybywa ich tyle, ile rozmów —
-- ale przy tysiącu odsłuchanych rozmów to i tak ok. 2 GB, które nikomu już
-- do niczego nie służą.
--
-- Zasada: nagranie jest potrzebne DOPÓKI sprawa jest otwarta. Po zakończeniu
-- zlecenia zostaje jeszcze przez ustalony czas (reklamacja, spór o ustalenia),
-- a potem znika. Rozmowy, które nigdy nie stały się zleceniem, mają twardy
-- limit czasu — inaczej leżałyby wiecznie, bo nie mają czego „zakończyć".
--
-- Kasujemy WYŁĄCZNIE plik audio. Transkrypcja i podsumowanie zostają przy
-- zleceniu na zawsze: ważą tyle co nic, a to one odpowiadają na pytanie,
-- co zostało ustalone.

CREATE TABLE IF NOT EXISTS public.voice_recording_retention (
  provider_id            uuid PRIMARY KEY REFERENCES public.service_providers(id) ON DELETE CASCADE,
  keep_days_after_order  int NOT NULL DEFAULT 90,   -- ile dni po zakończeniu zlecenia
  keep_days_max          int NOT NULL DEFAULT 180,  -- twardy limit od dnia rozmowy
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vrr_sensowne_okresy CHECK (keep_days_after_order BETWEEN 1 AND 3650
                                    AND keep_days_max BETWEEN 1 AND 3650)
);

COMMENT ON TABLE public.voice_recording_retention IS
  'Okresy przechowywania nagrań rozmów per warsztat. Brak wiersza = wartości domyślne (90/180 dni).';

ALTER TABLE public.voice_recording_retention ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.voice_recording_retention TO authenticated;
GRANT ALL ON public.voice_recording_retention TO service_role;

DROP POLICY IF EXISTS "vrr_owner_all" ON public.voice_recording_retention;
CREATE POLICY "vrr_owner_all" ON public.voice_recording_retention
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
              OR public.has_role(auth.uid(), 'admin'::app_role));

-- Ślad po usunięciu: karta zlecenia ma powiedzieć „nagranie usunięto zgodnie
-- z zasadą przechowywania", a nie udawać, że nagrania nigdy nie było.
ALTER TABLE public.voice_calls
  ADD COLUMN IF NOT EXISTS recording_deleted_at timestamptz;

-- Cała arytmetyka dat w JEDNYM miejscu — dzięki temu da się ją sprawdzić
-- zapytaniem („co by dziś zniknęło") bez uruchamiania kasowania.
CREATE OR REPLACE FUNCTION public.voice_recordings_expired(p_limit int DEFAULT 500)
RETURNS TABLE (call_id uuid, provider_id uuid, recording_path text, powod text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.provider_id, c.recording_path,
         CASE
           WHEN o.completed_at IS NOT NULL
             AND o.completed_at < now() - make_interval(days => COALESCE(r.keep_days_after_order, 90))
           THEN 'zlecenie zakonczone ' || COALESCE(r.keep_days_after_order, 90) || ' dni temu'
           ELSE 'rozmowa starsza niz ' || COALESCE(r.keep_days_max, 180) || ' dni'
         END
  FROM public.voice_calls c
  LEFT JOIN public.workshop_orders o
         ON c.linked_entity_type = 'workshop_order' AND o.id = c.linked_entity_id
  LEFT JOIN public.voice_recording_retention r ON r.provider_id = c.provider_id
  WHERE c.recording_path IS NOT NULL
    AND (
      (o.completed_at IS NOT NULL
        AND o.completed_at < now() - make_interval(days => COALESCE(r.keep_days_after_order, 90)))
      OR c.created_at < now() - make_interval(days => COALESCE(r.keep_days_max, 180))
    )
  ORDER BY c.created_at
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.voice_recordings_expired(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.voice_recordings_expired(int) TO service_role;

-- Codzienne sprzątanie o 4:20. Token z sejfu — ta sama brama, co przy
-- voice-call-reconcile. Wpis jest tu, żeby harmonogram dało się odtworzyć
-- z repozytorium, a nie tylko z pamięci bazy.
SELECT cron.unschedule('voice-recordings-cleanup')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'voice-recordings-cleanup');

SELECT cron.schedule('voice-recordings-cleanup', '20 4 * * *', $cron$
  SELECT net.http_post(
    url := 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/voice-recordings-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'VOICE_LLM_TOKEN')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
