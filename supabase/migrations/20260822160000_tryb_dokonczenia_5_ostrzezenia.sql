-- Tryb dokończenia, krok 5: ostrzeżenia przed końcem.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PO CO
-- ═══════════════════════════════════════════════════════════════════════════
-- Blokada bez uprzedzenia jest karą, nie zasadą. Klient ma wiedzieć, KIEDY
-- straci dostęp i CO dokładnie przestanie działać — z takim wyprzedzeniem,
-- żeby zdążył zdecydować, a nie tylko zareagować.
--
-- Dwa progi: 7 dni i 1 dzień. Pierwszy daje czas na decyzję i rozmowę
-- z księgową, drugi jest przypomnieniem dla tych, którzy odłożyli.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO OSOBNA TABELA, A NIE ZNACZNIK NA SUBSKRYPCJI
-- ═══════════════════════════════════════════════════════════════════════════
-- Znacznik `ostrzezono_at` odpowiadałby na pytanie „czy wysłano", ale nie „ile
-- razy i o którym progu". Przy dwóch progach i ponawianym zadaniu to za mało:
-- pierwsze uruchomienie po awarii wysłałoby wszystko od nowa.
--
-- Osobny wiersz na (subskrypcja, próg) daje idempotencję z klucza głównego —
-- nie trzeba jej pilnować w kodzie. Zostawia też ślad: przy sporze widać, kiedy
-- klient został uprzedzony.

BEGIN;

CREATE TABLE IF NOT EXISTS public.billing_ostrzezenia (
  subscription_id uuid        NOT NULL REFERENCES public.billing_subscriptions(id) ON DELETE CASCADE,
  prog_dni        integer     NOT NULL CHECK (prog_dni IN (7, 1)),
  -- Data, której ostrzeżenie dotyczyło. Gdy klient przedłuży i za rok znów
  -- będzie się kończyć, ma dostać ostrzeżenie ponownie — a bez tej kolumny
  -- klucz główny uznałby je za już wysłane.
  dotyczy_daty    date        NOT NULL,
  wyslano_at      timestamptz NOT NULL DEFAULT now(),
  kanal           text        NOT NULL DEFAULT 'email',
  PRIMARY KEY (subscription_id, prog_dni, dotyczy_daty)
);

ALTER TABLE public.billing_ostrzezenia ENABLE ROW LEVEL SECURITY;

-- Klient widzi własne ostrzeżenia; pisze wyłącznie `service_role`.
DROP POLICY IF EXISTS billing_ostrzezenia_wlasne ON public.billing_ostrzezenia;
CREATE POLICY billing_ostrzezenia_wlasne ON public.billing_ostrzezenia
  FOR SELECT TO authenticated
  USING (subscription_id IN (
    SELECT s.id FROM public.billing_subscriptions s
    WHERE s.subscriber_type = 'service_provider'
      AND s.subscriber_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
  ));

REVOKE INSERT, UPDATE, DELETE ON public.billing_ostrzezenia FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Kogo ostrzec
-- ---------------------------------------------------------------------------
-- Zwraca to, co funkcja brzegowa ma wysłać. Świadomie NIE wysyła sama: SQL nie
-- ma jak, a rozdzielenie „kogo" od „jak" pozwala sprawdzić pierwsze bez drugiego.
CREATE OR REPLACE FUNCTION public.billing_do_ostrzezenia()
RETURNS TABLE (
  subscription_id uuid,
  provider_id     uuid,
  user_id         uuid,
  email           text,
  nazwa_firmy     text,
  prog_dni        integer,
  koniec          date,
  powod           text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH kandydaci AS (
    SELECT s.id, s.subscriber_id,
           COALESCE(s.trial_ends_at, s.current_period_end)::date AS koniec,
           CASE WHEN s.status = 'trialing' THEN 'trial' ELSE 'platnosc' END AS powod
    FROM billing_subscriptions s
    WHERE s.subscriber_type = 'service_provider'
      AND s.status IN ('trialing', 'active')
      -- Warsztat już w trybie dokończenia jest po fakcie — ostrzeżenie
      -- przed końcem nie ma dla niego sensu.
      AND s.dokanczanie_do IS NULL
      AND COALESCE(s.trial_ends_at, s.current_period_end) IS NOT NULL
  ), z_progiem AS (
    SELECT k.*, p.prog
    FROM kandydaci k
    CROSS JOIN (VALUES (7), (1)) AS p(prog)
    WHERE k.koniec = (now() AT TIME ZONE 'Europe/Warsaw')::date + p.prog
  )
  SELECT z.id, z.subscriber_id, sp.user_id,
         COALESCE(NULLIF(sp.owner_email, ''), NULLIF(sp.company_email, ''), u.email),
         COALESCE(NULLIF(sp.company_name, ''), 'Twój warsztat'),
         z.prog, z.koniec, z.powod
  FROM z_progiem z
  JOIN service_providers sp ON sp.id = z.subscriber_id
  LEFT JOIN auth.users u ON u.id = sp.user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM billing_ostrzezenia o
    WHERE o.subscription_id = z.id AND o.prog_dni = z.prog AND o.dotyczy_daty = z.koniec
  )
  -- Bez adresu nie ma jak ostrzec; taki warsztat pomijamy zamiast wysyłać w próżnię.
  AND COALESCE(NULLIF(sp.owner_email, ''), NULLIF(sp.company_email, ''), u.email) IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.billing_do_ostrzezenia() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_do_ostrzezenia() TO service_role;

-- ---------------------------------------------------------------------------
-- Harmonogram
-- ---------------------------------------------------------------------------
-- 2:30 UTC — PRZED zadaniem wprowadzającym w tryb (3:00). Odwrotna kolejność
-- znaczyłaby, że ostrzeżenie „został 1 dzień" wychodzi tego samego ranka, gdy
-- dostęp już został ograniczony.
--
-- Sekret ze skarbca, nie w treści zadania — wzorzec z `billing-gwarancja-ceny`.
-- Token wpisany wprost w `cron.job.command` widzi każdy, kto odczyta tę tabelę,
-- i zostaje w publicznym repozytorium razem z migracją.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN

    IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'billing_cron_secret') THEN
      RAISE WARNING 'brak sekretu billing_cron_secret — zadanie ostrzeżeń NIE zaplanowane';
      RETURN;
    END IF;

    PERFORM cron.unschedule('billing-ostrzezenia')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-ostrzezenia');

    PERFORM cron.schedule(
      'billing-ostrzezenia',
      '30 2 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/billing-ostrzezenia',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret',
          (SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'billing_cron_secret')
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
    RAISE NOTICE 'zadanie billing-ostrzezenia: 2:30 UTC, przed wejściem w tryb o 3:00';
  ELSE
    RAISE WARNING 'pg_cron/pg_net niedostępne — billing-ostrzezenia trzeba wołać z zewnątrz';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
