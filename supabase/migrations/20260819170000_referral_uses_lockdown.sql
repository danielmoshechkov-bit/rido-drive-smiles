-- 🔴 KRYTYCZNE: `referral_uses` była zapisywalna z konta klienta.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO DAWAŁO SIĘ ZROBIĆ
-- ═══════════════════════════════════════════════════════════════════════════
-- Polityki „System can insert referral uses" i „System can update referral
-- uses" miały warunek `true` i rolę `public` — mimo nazw sugerujących system.
--
-- `complete_referral_on_first_purchase` (SECURITY DEFINER) wyszukuje wiersz
-- `referral_uses` ze statusem `pending_first_purchase` i wypłaca nagrodę
-- WPROST do `user_wallets.pln_balance` — po 150 zł polecającemu i poleconemu
-- przy dwóch kontach firmowych. Funkcję woła `payment-core` po każdej udanej
-- płatności (linia 507), a `pln_balance` da się wydać przez `wallet_used`.
--
-- Czyli: dopisz sobie wiersz wskazujący siebie jako polecającego I poleconego,
-- kup cokolwiek za 30 zł, odbierz 2 × 150 zł. Polityka UPDATE pozwalała
-- przestawić status z powrotem i powtórzyć. To najkrótsza droga od konta
-- klienta do wydawalnych pieniędzy, jaką znalazłem w tym audycie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO ZAMKNIĘCIE JEST BEZPIECZNE
-- ═══════════════════════════════════════════════════════════════════════════
-- Sprawdzone: front NIGDZIE nie zapisuje do tej tabeli — czyta ją w dwóch
-- miejscach (`ReferralsTab`, `ReferralSystemPanel`). Wiersze tworzy wyłącznie
-- funkcja bazy, a ona działa jako `SECURITY DEFINER` i RLS jej nie dotyczy.
-- Zamknięcie zapisu nie odbiera niczego, co dziś działa.

BEGIN;

DROP POLICY IF EXISTS "System can insert referral uses" ON public.referral_uses;
DROP POLICY IF EXISTS "System can update referral uses" ON public.referral_uses;

-- Nazwa mówi teraz prawdę o tym, kto może pisać.
-- DROP przed CREATE: migracja ma przechodzić przy powtórnym wklejeniu.
DROP POLICY IF EXISTS "referral_uses_zapis_tylko_system" ON public.referral_uses;
CREATE POLICY "referral_uses_zapis_tylko_system"
  ON public.referral_uses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Odczyt zostaje bez zmian: polecający widzi swoje polecenia, admin wszystkie.
-- Nie ruszamy tego, żeby nie zgasić panelu poleceń przy okazji naprawy zapisu.

-- ---------------------------------------------------------------------------
-- Kontrola: po migracji nie może zostać żadna polityka ZAPISU dla klienta
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_zostalo text;
BEGIN
  SELECT string_agg(policyname || ' (' || cmd || ')', ', ') INTO v_zostalo
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'referral_uses'
    AND cmd <> 'SELECT'
    AND (roles::text[] && ARRAY['public', 'authenticated', 'anon']);

  IF v_zostalo IS NOT NULL THEN
    RAISE EXCEPTION 'Na referral_uses nadal jest zapis dla klienta: %', v_zostalo;
  END IF;

  RAISE NOTICE 'referral_uses: zapis wyłącznie dla service_role.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
