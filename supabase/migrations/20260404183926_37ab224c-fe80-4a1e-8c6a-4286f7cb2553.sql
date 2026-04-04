-- Sequence-based invoice numbering to prevent duplicates
CREATE TABLE IF NOT EXISTS public.invoice_sequences (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, year, month)
);

ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sequences"
  ON public.invoice_sequences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Atomic function to get next invoice number
CREATE OR REPLACE FUNCTION public.get_next_invoice_number(p_user_id UUID, p_year INT, p_month INT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  INSERT INTO invoice_sequences (user_id, year, month, last_number)
  VALUES (p_user_id, p_year, p_month, 1)
  ON CONFLICT (user_id, year, month)
  DO UPDATE SET last_number = invoice_sequences.last_number + 1
  RETURNING last_number INTO next_num;
  RETURN next_num;
END;
$$;