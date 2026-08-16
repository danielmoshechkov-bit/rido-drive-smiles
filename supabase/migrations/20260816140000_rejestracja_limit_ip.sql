-- Ograniczenie częstotliwości rejestracji po adresie IP.
--
-- POWÓD: pole „Nie jestem robotem" w formularzach rejestracji jest **wyłącznie
-- stanem po stronie przeglądarki** (`if (!isHuman) return`). Nie weryfikuje
-- niczego i nie dociera do serwera — bot wysyłający żądanie wprost do
-- `register-marketplace-user` omija je w całości. Funkcja ma `verify_jwt =
-- false`, zakłada konta w `auth.users` i wysyła maile, więc bez ograniczenia
-- jest darmową fabryką kont i wysyłki.
--
-- To NIE zastępuje prawdziwej weryfikacji (Turnstile / hCaptcha) — jest
-- ochroną, którą da się mieć od razu, bez zakładania konta u zewnętrznego
-- dostawcy i bez czekania na klucze.

CREATE TABLE IF NOT EXISTS public.rejestracje_ip (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip         text NOT NULL,
  email      text,
  -- Skąd przyszła próba: 'marketplace', 'warsztat', 'fleet'. Pozwala nałożyć
  -- różne limity na różne ścieżki bez dokładania tabel.
  sciezka    text NOT NULL DEFAULT 'marketplace',
  udana      boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rejestracje_ip_okno
  ON public.rejestracje_ip (ip, created_at DESC);

ALTER TABLE public.rejestracje_ip ENABLE ROW LEVEL SECURITY;

-- Nikt poza `service_role` nie ma tu czego szukać. Brak polityk = brak dostępu
-- dla `anon` i `authenticated`; `service_role` omija RLS.
REVOKE ALL ON public.rejestracje_ip FROM anon, authenticated;

-- Sprzątanie: wpisy starsze niż dobę nie są już do niczego potrzebne, a tabela
-- rośnie z każdą próbą rejestracji, także nieudaną.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('rejestracje-ip-sprzatanie')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rejestracje-ip-sprzatanie');

    PERFORM cron.schedule(
      'rejestracje-ip-sprzatanie',
      '25 4 * * *',
      $cron$ DELETE FROM public.rejestracje_ip WHERE created_at < now() - interval '1 day'; $cron$
    );
  ELSE
    RAISE WARNING 'pg_cron niedostępny — rejestracje_ip trzeba sprzątać ręcznie';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
