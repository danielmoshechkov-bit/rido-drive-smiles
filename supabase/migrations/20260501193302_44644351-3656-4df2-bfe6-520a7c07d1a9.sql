-- Usun testowa fakture FV/2026/04/015 (warsztat@test.pl) wraz z powiazaniami
DELETE FROM invoice_items WHERE invoice_id = '239c4be3-a3be-4a9a-8583-8aec64af4aec';
DELETE FROM user_invoices WHERE id = '239c4be3-a3be-4a9a-8583-8aec64af4aec';

-- Zresetuj sekwencje kwietnia 2026 dla warsztat@test.pl tak,
-- aby kolejny numer w kwietniu byl 005 (po istniejacych 001-004).
UPDATE invoice_sequences
SET last_number = 4
WHERE user_id = 'fcba3af4-d18d-44ff-b2c8-5b528d9fa614'
  AND year = 2026
  AND month = 4;

-- Maj 2026 nie ma rekordu - funkcja get_next_invoice_number i tak rozpocznie od 001.