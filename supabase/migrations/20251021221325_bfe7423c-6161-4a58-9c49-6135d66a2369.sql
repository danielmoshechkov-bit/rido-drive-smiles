-- Dodaj unikalny indeks na raw_row_id aby umożliwić upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlements_raw_row_id_unique 
ON settlements(raw_row_id) 
WHERE raw_row_id IS NOT NULL;