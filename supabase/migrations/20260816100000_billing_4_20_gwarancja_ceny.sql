-- 4.20 — wygaśnięcie gwarancji ceny.
--
-- Cennik obiecuje cenę startową przez 12 miesięcy i powiadomienie 30 dni przed
-- końcem. Do tej pory nie było ani jednego, ani drugiego: `price_net_target`
-- stało w planie, `price_guarantee_until` w subskrypcji, i nic ich nie łączyło.

-- ---------------------------------------------------------------------------
-- 1. Cena docelowa w Stripe
-- ---------------------------------------------------------------------------
-- ⚠️ ZNALEZIONE PRZY OKAZJI: `billing-stripe-sync` czyta i zapisuje kolumnę
-- `stripe_price_id_target`, ale ŻADNA migracja w repo jej nie tworzy. Na
-- produkcji istnieje (synchronizacja przeszła), więc powstała poza repozytorium.
-- Skutek: świeże środowisko postawione z tych migracji ma niedziałającą
-- synchronizację cennika. `IF NOT EXISTS` naprawia repo i nie rusza produkcji.
ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS stripe_price_id_target text;

COMMENT ON COLUMN public.billing_plans.stripe_price_id_target IS
  'Obiekt Price w Stripe dla ceny DOCELOWEJ. Ceny w Stripe są niezmienne, więc '
  'każdy plan potrzebuje dwóch: startowej i docelowej. Bez tej drugiej wygaśnięcie '
  'gwarancji wymagałoby zakładania cen ręcznie, osobno dla każdego klienta.';

-- ---------------------------------------------------------------------------
-- 2. Znaczniki idempotencji
-- ---------------------------------------------------------------------------
-- Pytanie do rozstrzygnięcia brzmiało: czy trzeba pamiętać, Z KTÓREJ ceny
-- przechodzimy, skoro klient mógł w międzyczasie zmienić plan.
--
-- Nie trzeba. Pozycję subskrypcji odczytujemy na żywo ze Stripe w chwili
-- podmiany — i to jedyne wiarygodne źródło, bo zapamiętana wartość po zmianie
-- planu byłaby nieaktualna. Potrzebne jest co innego: pewność, ŻE JESTEŚMY tam,
-- gdzie myślimy. Zadanie podmienia cenę wyłącznie wtedy, gdy bieżąca pozycja
-- wskazuje dokładnie `stripe_price_id` planu, na którym klient jest TERAZ.
-- Cokolwiek innego — cena wynegocjowana, już docelowa, nieznana — zostaje
-- nietknięte. Inaczej zadanie zerwałoby indywidualną umowę handlową.
--
-- Znaczniki poniżej pilnują, żeby nie powiadomić dwa razy i nie podmienić dwa
-- razy: to jedyny stan, którego nie da się odczytać ze Stripe.
ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS price_guarantee_notified_at timestamptz;

ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS price_target_applied_at timestamptz;

CREATE INDEX IF NOT EXISTS billing_subscriptions_gwarancja
  ON public.billing_subscriptions (price_guarantee_until)
  WHERE price_guarantee_until IS NOT NULL AND price_target_applied_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Harmonogram
-- ---------------------------------------------------------------------------
-- Raz na dobę. Gwarancja liczy się w miesiącach, a mail „30 dni przed" nie
-- staje się pilniejszy przez sprawdzanie co godzinę.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN

    PERFORM cron.unschedule('billing-gwarancja-ceny')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-gwarancja-ceny');

    PERFORM cron.schedule(
      'billing-gwarancja-ceny',
      '40 3 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/billing-price-guarantee',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.billing_cron_secret', true)
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  ELSE
    RAISE WARNING 'pg_cron/pg_net niedostępne — billing-price-guarantee trzeba wołać z zewnątrz';
  END IF;
END $$;

-- Sekret współdzielony z funkcją. Ustawiany osobno, bo nie trzymamy sekretów
-- w repozytorium:
--   ALTER DATABASE postgres SET app.billing_cron_secret = '…';
-- Ta sama wartość wchodzi jako `BILLING_CRON_SECRET` w sekretach Supabase.
-- Dopóki nie ustawisz obu, funkcja ODMAWIA — nie chodzi po subskrypcjach
-- z domyślną zgodą.

NOTIFY pgrst, 'reload schema';
