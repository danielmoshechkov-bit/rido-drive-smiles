-- 1. Function to sync drivers.billing_method with settlement plan name
CREATE OR REPLACE FUNCTION public.sync_driver_billing_method()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
BEGIN
  IF NEW.settlement_plan_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  SELECT name INTO v_name 
  FROM settlement_plans 
  WHERE id = NEW.settlement_plan_id;
  
  IF v_name IS NOT NULL THEN
    UPDATE drivers 
    SET billing_method = v_name 
    WHERE id = NEW.driver_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. Trigger on driver_app_users to auto-sync billing_method
DROP TRIGGER IF EXISTS trg_sync_billing_method ON driver_app_users;
CREATE TRIGGER trg_sync_billing_method
AFTER INSERT OR UPDATE OF settlement_plan_id ON driver_app_users
FOR EACH ROW
EXECUTE FUNCTION public.sync_driver_billing_method();

-- 3. Backfill existing data to fix discrepancies (like Beata)
UPDATE drivers d
SET billing_method = sp.name
FROM driver_app_users dau
JOIN settlement_plans sp ON sp.id = dau.settlement_plan_id
WHERE dau.driver_id = d.id
  AND dau.settlement_plan_id IS NOT NULL;

-- 4. RLS: Fleet users can view platform IDs of their drivers
CREATE POLICY "Fleet can view platform IDs"
ON public.driver_platform_ids
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM drivers d
    WHERE d.id = driver_platform_ids.driver_id
      AND d.fleet_id = get_user_fleet_id(auth.uid())
  )
);

-- 5. RLS: Drivers can view their own platform IDs
CREATE POLICY "Drivers can view own platform IDs"
ON public.driver_platform_ids
FOR SELECT
USING (
  driver_platform_ids.driver_id IN (
    SELECT dau.driver_id 
    FROM driver_app_users dau 
    WHERE dau.user_id = auth.uid()
  )
);

-- 6. RLS: Fleet settlement users can view all settlements for their drivers (no vehicle assignment required)
CREATE POLICY "Fleet settlement can view settlements for their drivers"
ON public.settlements
FOR SELECT
USING (
  has_role(auth.uid(), 'fleet_settlement')
  AND EXISTS (
    SELECT 1
    FROM drivers d
    WHERE d.id = settlements.driver_id
      AND d.fleet_id = get_user_fleet_id(auth.uid())
  )
);