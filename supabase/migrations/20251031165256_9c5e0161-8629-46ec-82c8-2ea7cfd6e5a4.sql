-- ===================================
-- FAZA 1: System ról flotowych
-- ===================================

-- 1.1 Utworzenie typu enum dla ról
CREATE TYPE public.app_role AS ENUM (
  'admin',
  'fleet_settlement',
  'fleet_rental',
  'driver'
);

-- 1.2 Utworzenie tabeli user_roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  fleet_id uuid REFERENCES public.fleets(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(user_id, role, fleet_id)
);

-- Włączenie RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 1.3 Funkcja sprawdzająca rolę użytkownika (SECURITY DEFINER - omija RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 1.4 Funkcja pobierająca fleet_id użytkownika flotowego
CREATE OR REPLACE FUNCTION public.get_user_fleet_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fleet_id
  FROM public.user_roles
  WHERE user_id = _user_id
    AND role IN ('fleet_settlement', 'fleet_rental')
  LIMIT 1
$$;

-- ===================================
-- FAZA 2: Polityki RLS dla user_roles
-- ===================================

-- 2.1 Admini zarządzają wszystkimi rolami
CREATE POLICY "Admins can manage user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2.2 Użytkownicy widzą swoje role
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- ===================================
-- FAZA 3: Polityki RLS dla vehicles
-- ===================================

-- Usunięcie starych polityk jeśli istnieją
DROP POLICY IF EXISTS "Admins can manage vehicles" ON public.vehicles;

-- 3.1 Admin i flotowi mogą przeglądać pojazdy
CREATE POLICY "Admin and fleet users can view vehicles"
ON public.vehicles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR fleet_id = public.get_user_fleet_id(auth.uid())
);

-- 3.2 Flotowi mogą dodawać pojazdy tylko do swojej floty
CREATE POLICY "Fleet users can insert vehicles to their fleet"
ON public.vehicles
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR fleet_id = public.get_user_fleet_id(auth.uid())
);

-- 3.3 Flotowi mogą edytować tylko swoje pojazdy
CREATE POLICY "Fleet users can update their fleet vehicles"
ON public.vehicles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR fleet_id = public.get_user_fleet_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR fleet_id = public.get_user_fleet_id(auth.uid())
);

-- 3.4 Flotowi mogą usuwać tylko swoje pojazdy
CREATE POLICY "Fleet users can delete their fleet vehicles"
ON public.vehicles
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR fleet_id = public.get_user_fleet_id(auth.uid())
);

-- ===================================
-- FAZA 4: Polityki RLS dla drivers
-- ===================================

-- Usunięcie starych polityk jeśli istnieją
DROP POLICY IF EXISTS "Admins can manage drivers" ON public.drivers;

-- 4.1 Admin widzi wszystkich, flotowi tylko swoich kierowców
CREATE POLICY "Admin and fleet users can view drivers"
ON public.drivers
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM driver_vehicle_assignments dva
    JOIN vehicles v ON dva.vehicle_id = v.id
    WHERE dva.driver_id = drivers.id
      AND dva.status = 'active'
      AND v.fleet_id = public.get_user_fleet_id(auth.uid())
  )
);

-- 4.2 Admin może zarządzać kierowcami
CREATE POLICY "Admin can manage drivers"
ON public.drivers
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===================================
-- FAZA 5: Polityki RLS dla settlements
-- ===================================

-- Usunięcie starych polityk jeśli istnieją
DROP POLICY IF EXISTS "Admins can manage settlements" ON public.settlements;

-- 5.1 Admin i flotowi rozliczeniowi widzą rozliczenia
CREATE POLICY "Admin and fleet settlement users can view settlements"
ON public.settlements
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    public.has_role(auth.uid(), 'fleet_settlement')
    AND EXISTS (
      SELECT 1 FROM driver_vehicle_assignments dva
      JOIN vehicles v ON dva.vehicle_id = v.id
      WHERE dva.driver_id = settlements.driver_id
        AND dva.status = 'active'
        AND v.fleet_id = public.get_user_fleet_id(auth.uid())
    )
  )
);

-- 5.2 Admin może zarządzać rozliczeniami
CREATE POLICY "Admin can manage settlements"
ON public.settlements
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===================================
-- FAZA 6: Polityki RLS dla driver_vehicle_assignments
-- ===================================

-- Usunięcie starych polityk jeśli istnieją
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.driver_vehicle_assignments;

-- 6.1 Flotowi mogą zarządzać przypisaniami tylko dla swoich pojazdów
CREATE POLICY "Fleet users can manage their vehicle assignments"
ON public.driver_vehicle_assignments
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM vehicles v
    WHERE v.id = driver_vehicle_assignments.vehicle_id
      AND v.fleet_id = public.get_user_fleet_id(auth.uid())
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM vehicles v
    WHERE v.id = driver_vehicle_assignments.vehicle_id
      AND v.fleet_id = public.get_user_fleet_id(auth.uid())
  )
);

-- ===================================
-- FAZA 7: Rozbudowa settlement_plans - widoczność i promocje
-- ===================================

-- 7.1 Dodanie kolumn dla widoczności i dat promocji
ALTER TABLE public.settlement_plans
ADD COLUMN IF NOT EXISTS is_visible boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS valid_from date,
ADD COLUMN IF NOT EXISTS valid_to date;

-- 7.2 Komentarze do nowych kolumn
COMMENT ON COLUMN public.settlement_plans.is_visible IS 'Czy plan jest widoczny dla kierowców (możliwość ukrycia planu)';
COMMENT ON COLUMN public.settlement_plans.valid_from IS 'Data rozpoczęcia dostępności planu (NULL = bez ograniczenia)';
COMMENT ON COLUMN public.settlement_plans.valid_to IS 'Data zakończenia dostępności planu (NULL = bez ograniczenia)';

-- 7.3 Funkcja sprawdzająca czy plan jest dostępny
CREATE OR REPLACE FUNCTION public.is_plan_available(_plan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.settlement_plans
    WHERE id = _plan_id
      AND is_active = true
      AND is_visible = true
      AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
      AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
  )
$$;

-- ===================================
-- FAZA 8: Polityki RLS dla documents (flotowi mogą przeglądać)
-- ===================================

-- Usunięcie starych polityk jeśli istnieją
DROP POLICY IF EXISTS "Admins can manage documents" ON public.documents;

-- 8.1 Admin i flotowi mogą przeglądać dokumenty swoich kierowców/pojazdów
CREATE POLICY "Admin and fleet users can view documents"
ON public.documents
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    vehicle_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM vehicles v
      WHERE v.id = documents.vehicle_id
        AND v.fleet_id = public.get_user_fleet_id(auth.uid())
    )
  )
  OR (
    driver_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM driver_vehicle_assignments dva
      JOIN vehicles v ON dva.vehicle_id = v.id
      WHERE dva.driver_id = documents.driver_id
        AND dva.status = 'active'
        AND v.fleet_id = public.get_user_fleet_id(auth.uid())
    )
  )
);

-- 8.2 Admin i flotowi mogą dodawać dokumenty
CREATE POLICY "Admin and fleet users can insert documents"
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR (
    vehicle_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM vehicles v
      WHERE v.id = documents.vehicle_id
        AND v.fleet_id = public.get_user_fleet_id(auth.uid())
    )
  )
  OR (
    driver_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM driver_vehicle_assignments dva
      JOIN vehicles v ON dva.vehicle_id = v.id
      WHERE dva.driver_id = documents.driver_id
        AND dva.status = 'active'
        AND v.fleet_id = public.get_user_fleet_id(auth.uid())
    )
  )
);

-- 8.3 Admin może zarządzać wszystkimi dokumentami
CREATE POLICY "Admin can manage all documents"
ON public.documents
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));