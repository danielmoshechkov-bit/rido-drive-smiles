-- WYN4 (Pack 4) — Model płacy pracownika.
-- PO CO: dziś jest tylko hourly_rate (+ typ stawki trzymany w localStorage), brak
-- jawnej jednostki. Dodajemy pay_rate + pay_unit (godzina/dzień/tydzień/miesiąc),
-- żeby rozliczać należność za okres niezależnie od localStorage.
-- Migracja danych: jeśli pay_rate puste a jest hourly_rate → przepisz jako 'hour'.

ALTER TABLE public.workshop_employees
  ADD COLUMN IF NOT EXISTS pay_rate numeric,
  ADD COLUMN IF NOT EXISTS pay_unit text;

ALTER TABLE public.workshop_employees
  DROP CONSTRAINT IF EXISTS workshop_employees_pay_unit_check;
ALTER TABLE public.workshop_employees
  ADD CONSTRAINT workshop_employees_pay_unit_check
  CHECK (pay_unit IS NULL OR pay_unit IN ('hour','day','week','month'));

UPDATE public.workshop_employees
  SET pay_rate = hourly_rate, pay_unit = 'hour'
  WHERE pay_rate IS NULL AND hourly_rate IS NOT NULL;
