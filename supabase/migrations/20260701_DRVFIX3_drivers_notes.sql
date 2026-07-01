-- DRVFIX3: kolumna notatek o kierowcy (używana przez DriverInfoModal.notes).
-- Wcześniej modal pchał 'notes' do drivers, a kolumny nie było → cały UPDATE się wywalał
-- ("Could not find the 'notes' column of 'drivers'"), blokując też zapis IBAN.
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS notes text;
