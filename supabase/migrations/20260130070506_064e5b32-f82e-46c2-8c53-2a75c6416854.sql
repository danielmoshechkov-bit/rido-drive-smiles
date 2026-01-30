-- Krok 1: Dodanie nowych wartości enum dla działu sprzedaży
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_rep';