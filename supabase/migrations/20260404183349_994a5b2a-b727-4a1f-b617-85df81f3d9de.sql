-- FIX 1: Remove overly permissive company_settings policy that allows access to NULL user_id rows
DROP POLICY IF EXISTS "users own settings" ON public.company_settings;

-- FIX 2: Add policy for regular users to manage their own ksef_transmissions (via user_invoices ownership)
CREATE POLICY "Users manage own ksef transmissions"
  ON public.ksef_transmissions
  FOR ALL
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM public.user_invoices WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM public.user_invoices WHERE user_id = auth.uid()
    )
  );

-- FIX 3: Drop the overly permissive purchase_invoices policy and replace with user-scoped one
DROP POLICY IF EXISTS "auth purchase inv" ON public.purchase_invoices;

CREATE POLICY "Users see own purchase invoices"
  ON public.purchase_invoices
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);