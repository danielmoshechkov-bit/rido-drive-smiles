-- Fix upsert issue: Remove partial index and create full unique index
-- Partial indexes (with WHERE clause) don't work with ON CONFLICT in PostgreSQL

-- Drop old partial index
DROP INDEX IF EXISTS public.idx_settlements_raw_row_id_unique;

-- Create full unique index without WHERE clause
-- This allows ON CONFLICT to work properly in upsert operations
CREATE UNIQUE INDEX idx_settlements_raw_row_id_unique 
ON public.settlements(raw_row_id);