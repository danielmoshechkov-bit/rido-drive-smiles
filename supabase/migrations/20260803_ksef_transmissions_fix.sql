-- =====================================================================
-- KSeF — NAPRAWA ZAPISU TRANSMISJI (bez tego nie ma UPO)
--
-- OBJAW: wysłaliśmy 6 faktur testowych, KSeF przyjął wszystkie i nadał numery,
-- a tabela `ksef_transmissions` została PUSTA. W efekcie `download_upo` nie miał
-- czego zwrócić — a UPO to jedyny dowód, że faktura trafiła do KSeF, wymagany
-- przy kontroli.
--
-- PRZYCZYNA 1 — klucz obcy pokazuje na złą tabelę.
--   `invoice_id` ma FK do `invoices`, a faktury sprzedażowe siedzą w `user_invoices`.
--   Każdy insert łamał więzy i padał. Kod nie sprawdzał błędu insertu (`const { data }`
--   bez `error`), więc wysyłka szła dalej i nikt nie widział problemu.
--   Tabela obsługuje transmisje z DWÓCH źródeł — sprzedaż (`user_invoices`) i zakupy
--   (`purchase_invoices`) — więc nie da się wskazać jednego rodzica. FK usuwamy,
--   zostawiając samo UUID. Sprzątanie po usuniętej fakturze robimy świadomie w kodzie,
--   bo ślad wysyłki do urzędu bywa cenniejszy niż sama faktura.
--
-- PRZYCZYNA 2 — CHECK na statusie nie zna stanów, których używa kod.
--   Dopuszczał: pending, sent, accepted, rejected, error.
--   Kod ustawia dodatkowo `session_open` (sesja otwarta) i `processing` (KSeF przetwarza).
--   Te UPDATE-y też padały po cichu.
-- =====================================================================

ALTER TABLE public.ksef_transmissions
  DROP CONSTRAINT IF EXISTS ksef_transmissions_invoice_id_fkey;

COMMENT ON COLUMN public.ksef_transmissions.invoice_id IS
  'UUID faktury: user_invoices (sprzedaż) albo purchase_invoices (zakup). Bez FK, bo źródła są dwa.';

ALTER TABLE public.ksef_transmissions
  DROP CONSTRAINT IF EXISTS ksef_transmissions_status_check;

ALTER TABLE public.ksef_transmissions
  ADD CONSTRAINT ksef_transmissions_status_check
  CHECK (status IN ('pending', 'session_open', 'sent', 'processing', 'accepted', 'rejected', 'error'));
