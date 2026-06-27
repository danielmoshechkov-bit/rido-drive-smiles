-- WYN7: Kasa ON/OFF (przełącznik w Ustawieniach + moment włączenia).
-- PO CO: kasa liczy dopiero od momentu włączenia (cash_started_at), ignorując
-- dane historyczne sprzed wdrożenia. Provider-scoped (workshop_finance_settings).
ALTER TABLE public.workshop_finance_settings
  ADD COLUMN IF NOT EXISTS cash_enabled    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cash_started_at timestamptz;
