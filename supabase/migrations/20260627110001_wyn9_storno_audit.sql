-- WYN9: Storno + audyt operacji kasowych (payments, expenses, payouts).
-- PO CO: korekta pomyłek bez kasowania (miękkie storno: voided + powód + kto) oraz
-- ślad kto zarejestrował/edytował (created_by_name + user_id pod przyszłe logowanie).
ALTER TABLE public.workshop_payments
  ADD COLUMN IF NOT EXISTS voided          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voided_by       text,
  ADD COLUMN IF NOT EXISTS void_reason     text,
  ADD COLUMN IF NOT EXISTS voided_at       timestamptz,
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS edited_by_name  text,
  ADD COLUMN IF NOT EXISTS edited_at       timestamptz,
  ADD COLUMN IF NOT EXISTS user_id         uuid;
ALTER TABLE public.workshop_expenses
  ADD COLUMN IF NOT EXISTS voided          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voided_by       text,
  ADD COLUMN IF NOT EXISTS void_reason     text,
  ADD COLUMN IF NOT EXISTS voided_at       timestamptz,
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS edited_by_name  text,
  ADD COLUMN IF NOT EXISTS edited_at       timestamptz,
  ADD COLUMN IF NOT EXISTS user_id         uuid;
ALTER TABLE public.workshop_employee_payouts
  ADD COLUMN IF NOT EXISTS voided          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voided_by       text,
  ADD COLUMN IF NOT EXISTS void_reason     text,
  ADD COLUMN IF NOT EXISTS voided_at       timestamptz,
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS edited_by_name  text,
  ADD COLUMN IF NOT EXISTS edited_at       timestamptz,
  ADD COLUMN IF NOT EXISTS user_id         uuid;
