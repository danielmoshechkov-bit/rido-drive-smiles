
-- Allow public read of workshop_clients linked to orders with client_code
CREATE POLICY "Public read clients via client_code orders"
ON public.workshop_clients
FOR SELECT
TO anon, authenticated
USING (
  id IN (
    SELECT client_id FROM workshop_orders WHERE client_code IS NOT NULL
  )
);

-- Allow public read of workshop_vehicles linked to orders with client_code
CREATE POLICY "Public read vehicles via client_code orders"
ON public.workshop_vehicles
FOR SELECT
TO anon, authenticated
USING (
  id IN (
    SELECT vehicle_id FROM workshop_orders WHERE client_code IS NOT NULL
  )
);

-- Allow public read of signatures for orders with client_code
CREATE POLICY "Public read signatures via client_code orders"
ON public.workshop_order_signatures
FOR SELECT
TO anon, authenticated
USING (
  order_id IN (
    SELECT id FROM workshop_orders WHERE client_code IS NOT NULL
  )
);

-- Allow anon to INSERT signatures (client signing from portal)
CREATE POLICY "Public insert signatures for client_code orders"
ON public.workshop_order_signatures
FOR INSERT
TO anon, authenticated
WITH CHECK (
  order_id IN (
    SELECT id FROM workshop_orders WHERE client_code IS NOT NULL
  )
);

-- Allow anon to UPDATE workshop_orders (for setting client_acceptance_confirmed, quote_accepted)
CREATE POLICY "Public update orders by client_code"
ON public.workshop_orders
FOR UPDATE
TO anon, authenticated
USING (client_code IS NOT NULL)
WITH CHECK (client_code IS NOT NULL);
