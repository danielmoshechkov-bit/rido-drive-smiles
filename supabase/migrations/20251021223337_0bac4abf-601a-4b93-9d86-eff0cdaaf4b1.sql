-- Create unique index on raw_row_id in settlements table
-- This prevents duplicate entries when importing CSV files
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlements_raw_row_id_unique 
ON public.settlements(raw_row_id) 
WHERE raw_row_id IS NOT NULL;