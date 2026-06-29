-- DRVFIX2: żądania zmiany nr konta kierowca (potwierdzenie mailem, ważne 24 h)
-- Kierowca NIE dostaje bezpośredniego UPDATE na drivers (RLS jest wierszowy, nie
-- kolumnowy — pozwoliłoby mu zmienić też saldo/fleet_id). Zamiast tego:
--  1) edge 'driver-bank-change-request' (service role) tworzy wpis + wysyła mail,
--  2) edge 'driver-bank-change-confirm' (service role, po tokenie) ustawia drivers.iban.
-- Brak polityk RLS dla klienta = tabela dostępna tylko przez funkcje edge (service role).

CREATE TABLE IF NOT EXISTS public.driver_bank_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  new_iban text NOT NULL,
  token text NOT NULL UNIQUE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_dbcr_token ON public.driver_bank_change_requests(token);
CREATE INDEX IF NOT EXISTS idx_dbcr_driver ON public.driver_bank_change_requests(driver_id);

ALTER TABLE public.driver_bank_change_requests ENABLE ROW LEVEL SECURITY;
-- celowo brak polityk: dostęp wyłącznie przez funkcje edge (klucz service role)
