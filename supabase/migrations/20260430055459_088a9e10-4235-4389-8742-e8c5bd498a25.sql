ALTER TABLE public.driver_weekly_debts
  ADD COLUMN IF NOT EXISTS visible_debt numeric DEFAULT 0;

COMMENT ON COLUMN public.driver_weekly_debts.visible_debt IS
  'Dług pokazywany w UI w arkuszu tygodnia (= max(0, opening_debt - paid_amount)). NIE zawiera nowego deficytu z tego tygodnia.';

COMMENT ON COLUMN public.driver_weekly_debts.remaining_debt IS
  'Dług na koniec tygodnia (visible_debt + max(0, -current_raw_payout)). Jest opening_debt następnego tygodnia.';