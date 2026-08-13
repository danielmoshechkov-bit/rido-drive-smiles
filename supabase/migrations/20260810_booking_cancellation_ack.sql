-- Ostrzeżenia o odwołanych wizytach w Terminarzu: trwałe „Ukryj".
--
-- Do tej pory lista ukrytych ostrzeżeń żyła wyłącznie w stanie komponentu
-- (useState), więc przejście na inną zakładkę i powrót przywracało wszystkie
-- ostrzeżenia. Znacznik zapisujemy na rezerwacji, dzięki czemu ukrycie działa
-- dla całego warsztatu (obsłużone = obsłużone), a nie tylko w jednej przeglądarce.

ALTER TABLE public.workshop_client_bookings
  ADD COLUMN IF NOT EXISTS cancellation_ack_at timestamptz;

COMMENT ON COLUMN public.workshop_client_bookings.cancellation_ack_at IS
  'Kiedy warsztat potwierdził (ukrył) ostrzeżenie o odwołanej wizycie. NULL = ostrzeżenie nadal widoczne w Terminarzu.';

CREATE INDEX IF NOT EXISTS idx_workshop_client_bookings_cancelled_unack
  ON public.workshop_client_bookings (provider_id, cancelled_at DESC)
  WHERE status = 'cancelled' AND cancellation_ack_at IS NULL;
