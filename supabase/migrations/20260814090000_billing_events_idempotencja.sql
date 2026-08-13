-- ============================================================================
-- BILLING 4.6 — idempotencja webhooków.
--
-- Operator wysyła to samo zdarzenie wielokrotnie: przy każdym timeoucie, przy
-- każdym błędzie 5xx, a Stripe ponawia przez wiele godzin. Bez ograniczenia
-- unikalnego na identyfikatorze zdarzenia druga dostawa `invoice.paid` założy
-- drugą subskrypcję albo wystawi drugą fakturę.
--
-- Wzorzec: webhook NAJPIERW zgłasza zdarzenie do tej tabeli. Konflikt na tym
-- indeksie znaczy „już to widzieliśmy" i kończy obsługę odpowiedzią 200 —
-- operator ma przestać ponawiać, bo z jego punktu widzenia dostarczył.
--
-- `external_id IS NOT NULL` w warunku, bo zdarzenia wytworzone przez nas
-- (np. ręczne korekty) identyfikatora operatora nie mają i nie konkurują
-- o unikalność.
-- ============================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_provider_external_id
  ON public.billing_events (provider, external_id)
  WHERE external_id IS NOT NULL;

COMMENT ON INDEX public.billing_events_provider_external_id IS
  'Idempotencja webhooków: jedno zdarzenie operatora = jeden wiersz. Konflikt = powtórna dostawa.';

-- Wyszukiwanie subskrypcji po identyfikatorze u operatora — webhook robi to
-- przy każdym zdarzeniu cyklu życia (invoice.paid, subscription.updated).
CREATE INDEX IF NOT EXISTS billing_subscriptions_provider_sub_id
  ON public.billing_subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Klient widzi WŁASNĄ subskrypcję.
--
-- Etap 1 dał na billing_subscriptions wyłącznie politykę dla platform_admin.
-- Po powrocie z płatności panel odpytuje o status przez 30 sekund (webhook bywa
-- wolniejszy niż przekierowanie) — bez tej polityki odpytywanie zawsze wracałoby
-- puste, klient widziałby brak dostępu mimo opłaconej faktury i zapłaciłby
-- drugi raz. Dokładnie ten scenariusz mieliśmy wykluczyć.
--
-- Zasada „klient czyta, nie zapisuje" zachowana: wyłącznie SELECT, wyłącznie
-- własne wiersze. Zapis pozostaje przy webhooku, na service_role.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS billing_subscriptions_select_own ON public.billing_subscriptions;
CREATE POLICY billing_subscriptions_select_own ON public.billing_subscriptions
  FOR SELECT TO authenticated
  USING (
    subscriber_type = 'service_provider'
    AND subscriber_id IN (
      SELECT sp.id FROM public.service_providers sp WHERE sp.user_id = (SELECT auth.uid())
    )
  );

COMMIT;
