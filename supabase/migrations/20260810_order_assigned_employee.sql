-- Przypisanie pracownika do zlecenia (Terminarz) — brakująca kolumna.
--
-- Terminarz od początku zapisuje `assigned_employee_id`, ale kolumna nigdy nie
-- powstała: zapis leciał błędem, a przypisanie nie zapisywało się nigdzie.
--
-- Nie używamy istniejącego `workshop_orders.mechanic_id`, bo wskazuje on na
-- tabelę `workshop_mechanics` (0 rekordów, stary model). Żywym modelem kadry
-- jest `workshop_employees` — to na nią wskazuje też `workshop_order_items.employee_id`.

ALTER TABLE public.workshop_orders
  ADD COLUMN IF NOT EXISTS assigned_employee_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workshop_orders'::regclass
      AND conname = 'workshop_orders_assigned_employee_id_fkey'
  ) THEN
    ALTER TABLE public.workshop_orders
      ADD CONSTRAINT workshop_orders_assigned_employee_id_fkey
      FOREIGN KEY (assigned_employee_id)
      REFERENCES public.workshop_employees(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Raport pracowników filtruje zlecenia po przypisanej osobie.
CREATE INDEX IF NOT EXISTS idx_workshop_orders_assigned_employee
  ON public.workshop_orders (assigned_employee_id)
  WHERE assigned_employee_id IS NOT NULL;

COMMENT ON COLUMN public.workshop_orders.assigned_employee_id IS
  'Pracownik przypisany do zlecenia (Terminarz, raport pracowników). FK -> workshop_employees. Zastępuje martwe mechanic_id -> workshop_mechanics.';
