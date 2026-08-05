-- ============================================================================
-- Przeniesienie zakładania sald i bonusu powitalnego na serwer.
--
-- Dotąd robił to front: `useUserWallet` i `useVehicleLookup` wstawiały wiersz
-- portfela/kredytów insertem z przeglądarki, a `useUserCredits` przyznawał
-- 50 kredytów AI, gdy nie znalazł wiersza. Bezpiecznikiem bonusu było wyłącznie
-- „wiersz nie istnieje", a polityka RLS pozwalała ten wiersz skasować — bonus
-- dawał się więc odebrać dowolną liczbę razy.
--
-- Po tej migracji:
--   * puste salda zakłada trigger przy tworzeniu konta (plus backfill poniżej),
--   * jednorazowość bonusu pilnuje osobna księga z kluczem głównym na user_id,
--     niezależna od tego, czy saldo istnieje.
--
-- Stan na 05.08.2026: 3 wiersze w user_credits, wszystkie po 50, nic nie wydane.
-- Nikt z powtarzalnego bonusu nie skorzystał — to zmiana prewencyjna.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Księga bonusów powitalnych. Klucz główny na user_id daje jednorazowość
-- na poziomie bazy, a nie logiki aplikacji.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_welcome_claims (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      integer NOT NULL,
  granted_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_welcome_claims ENABLE ROW LEVEL SECURITY;

-- Użytkownik widzi wyłącznie własny wpis; zapis idzie przez service_role.
CREATE POLICY "welcome_claims_select_own" ON public.credit_welcome_claims
  FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.credit_welcome_claims FROM anon, authenticated;

-- Backfill: konta, które bonus już dostały, nie mogą go dostać drugi raz.
-- Kwota historyczna to 50 (tyle przyznawał front).
INSERT INTO public.credit_welcome_claims (user_id, amount, granted_at)
SELECT uc.user_id, 50, COALESCE(uc.created_at, now())
FROM public.user_credits uc
WHERE uc.user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Zakładanie pustych sald przy rejestracji.
-- Wszystkie kolumny kwotowe mają DEFAULT 0, więc podajemy wyłącznie user_id.
-- ON CONFLICT, bo trigger musi być odporny na ponowne wywołanie.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_user_balances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_wallets (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.vehicle_lookup_credits (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provision_user_balances() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created_provision_balances ON auth.users;
CREATE TRIGGER on_auth_user_created_provision_balances
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_user_balances();

-- Backfill dla kont istniejących — bez tego użytkownik bez wiersza widziałby
-- zero i nigdy nie dostałby rekordu, skoro front przestał go zakładać.
INSERT INTO public.user_wallets (user_id)
SELECT u.id FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.vehicle_lookup_credits (user_id)
SELECT u.id FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
