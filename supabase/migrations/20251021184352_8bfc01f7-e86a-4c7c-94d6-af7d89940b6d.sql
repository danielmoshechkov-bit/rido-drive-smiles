-- Add raw_row_id column to settlements table for idempotency
ALTER TABLE public.settlements
ADD COLUMN IF NOT EXISTS raw_row_id text;

-- Add unique constraint for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlements_raw_row_id 
ON public.settlements(raw_row_id) 
WHERE raw_row_id IS NOT NULL;