DROP POLICY IF EXISTS "Users can insert own invoices" ON public.user_invoices;
DROP POLICY IF EXISTS "Users can view own invoices" ON public.user_invoices;
DROP POLICY IF EXISTS "Users can update own invoices" ON public.user_invoices;
DROP POLICY IF EXISTS "Users can delete own invoices" ON public.user_invoices;

CREATE POLICY "Users can insert own invoices" ON public.user_invoices
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own invoices" ON public.user_invoices
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own invoices" ON public.user_invoices
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own invoices" ON public.user_invoices
FOR DELETE TO authenticated
USING (auth.uid() = user_id);