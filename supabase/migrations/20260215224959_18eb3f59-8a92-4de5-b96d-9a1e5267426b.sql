
-- Set submitted_by default to auth.uid() so it auto-fills
ALTER TABLE public.support_tickets ALTER COLUMN submitted_by SET DEFAULT auth.uid();

-- Recreate INSERT policy to be simpler
DROP POLICY IF EXISTS "Authenticated users can create tickets" ON support_tickets;
CREATE POLICY "Authenticated users can create tickets" ON support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (true);
