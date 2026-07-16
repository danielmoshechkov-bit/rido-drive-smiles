-- Ustawienia formatu numeracji faktur per firma (sekcja "Ustawienia faktur").
-- Wzory: RRRR/MM/NNN (reset miesięczny) | RRRR/NNN (roczny) | NNN/RRRR (roczny) | NNN (ciągły).
ALTER TABLE public.user_invoice_companies
  ADD COLUMN IF NOT EXISTS numbering_prefix text NOT NULL DEFAULT 'FV',
  ADD COLUMN IF NOT EXISTS numbering_pattern text NOT NULL DEFAULT 'RRRR/MM/NNN';
COMMENT ON COLUMN public.user_invoice_companies.numbering_pattern IS
  'Wzór numeracji: RRRR/MM/NNN | RRRR/NNN | NNN/RRRR | NNN (NNN=licznik z aktywnych faktur, bez martwego licznika RPC).';
