-- Allow 'payment' and 'manual_add' types in debt transactions
ALTER TABLE public.driver_debt_transactions DROP CONSTRAINT driver_debt_transactions_type_check;
ALTER TABLE public.driver_debt_transactions ADD CONSTRAINT driver_debt_transactions_type_check 
  CHECK (type = ANY (ARRAY['debt_increase', 'debt_payment', 'payment', 'manual_add']));