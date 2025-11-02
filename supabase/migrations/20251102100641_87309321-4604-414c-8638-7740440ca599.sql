-- PRIORYTET 1: Usunięcie duplikatów transakcji paliwowych

-- Krok 1: Usunięcie duplikatów (zachowujemy rekord z najmniejszym id)
DELETE FROM fuel_transactions a
USING fuel_transactions b
WHERE a.id > b.id
  AND a.card_number = b.card_number
  AND a.transaction_date = b.transaction_date
  AND a.transaction_time = b.transaction_time
  AND a.total_amount = b.total_amount
  AND COALESCE(a.liters, 0) = COALESCE(b.liters, 0);

-- Krok 2: Dodanie unique constraint zapobiegającego przyszłym duplikatom
CREATE UNIQUE INDEX IF NOT EXISTS idx_fuel_transactions_unique 
ON fuel_transactions(card_number, transaction_date, transaction_time, total_amount, COALESCE(liters, 0));

-- PRIORYTET 7: Dodanie kolumny import_batch_id dla zapobiegania duplikatom przy imporcie
ALTER TABLE fuel_transactions 
ADD COLUMN IF NOT EXISTS import_batch_id uuid;

-- Dodanie indeksu dla szybszego wyszukiwania
CREATE INDEX IF NOT EXISTS idx_fuel_transactions_import_batch 
ON fuel_transactions(import_batch_id);

-- Komentarz wyjaśniający
COMMENT ON COLUMN fuel_transactions.import_batch_id IS 'Unikalny identyfikator partii importu CSV - używany do zapobiegania duplikatom przy wielokrotnym imporcie tego samego pliku';