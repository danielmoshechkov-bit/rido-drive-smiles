-- 4.4 — księga SMS-ów.
--
-- ŻADNEJ MIGRACJI SALD. Salda zostają tam, gdzie są, co do jednego SMS-a.
-- Ustalenie z audytu: `user_credits` nie jest magazynem SMS (trzy konta po 50
-- to bonusy powitalne, a jedyna ścieżka zapisu SMS-ów do tej tabeli — zakup
-- pakietu — nigdy nie zadziałała, bo zakupów było zero). `billing_addon_packs`
-- jest pusty i przejmie rolę dopiero przy 4.10.
--
-- Problemem nie są liczby, tylko BRAK HISTORII. Przy kredytach VIN każde
-- nadanie dopisuje wiersz do tabeli transakcji. Przy SMS-ach — nic, poza
-- wpisem w logu funkcji. Dlatego na pytanie „skąd 147" nie da się odpowiedzieć
-- z bazy. Ta migracja zakłada księgę i od tej chwili każda zmiana salda ma
-- autora, powód i czas.

-- ---------------------------------------------------------------------------
-- 1. Księga
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_credit_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  -- Dodatnia przy nadaniu, ujemna przy zużyciu. Zero nie jest zdarzeniem.
  delta         integer NOT NULL CHECK (delta <> 0),
  powod         text NOT NULL CHECK (powod IN
                  ('saldo_otwarcia', 'nadanie_admin', 'zakup', 'wyslanie', 'korekta')),
  -- Kto to zrobił. NULL przy wysyłce (robi ją system) i przy saldzie otwarcia.
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Odnośnik do zdarzenia źródłowego, np. wiersza w `workshop_sms_log`.
  ref_tabela    text,
  ref_id        uuid,
  opis          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_credit_ledger_provider
  ON public.sms_credit_ledger (provider_id, created_at DESC);

ALTER TABLE public.sms_credit_ledger ENABLE ROW LEVEL SECURITY;

-- Warsztat widzi własną księgę — to jego rozliczenie. Pisze wyłącznie
-- `service_role`, czyli funkcje niżej; klient nie dopisze sobie kredytów.
DROP POLICY IF EXISTS sms_ksiega_wlasna ON public.sms_credit_ledger;
CREATE POLICY sms_ksiega_wlasna ON public.sms_credit_ledger
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.sms_credit_ledger FROM anon, authenticated;
GRANT SELECT ON public.sms_credit_ledger TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Saldo otwarcia — NIE zmienia ani jednej liczby
-- ---------------------------------------------------------------------------
-- Po tym kroku SUM(delta) = sms_balance Z DEFINICJI, bo niczego nie
-- przenosimy: zapisujemy stan zastany jako punkt wyjścia. Nie da się nic
-- zgubić, bo nic się nie przemieszcza.
INSERT INTO public.sms_credit_ledger (provider_id, delta, powod, opis)
SELECT sp.id, sp.sms_balance, 'saldo_otwarcia',
       'Stan zastany w chwili założenia księgi. Historii sprzed tej daty nie '
       'da się odtworzyć — nadania SMS nie zostawiały śladu w bazie.'
FROM public.service_providers sp
WHERE COALESCE(sp.sms_balance, 0) <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.sms_credit_ledger l
    WHERE l.provider_id = sp.id AND l.powod = 'saldo_otwarcia');

-- ---------------------------------------------------------------------------
-- 3. Zużycie przez księgę
-- ---------------------------------------------------------------------------
-- Podmiana istniejącej funkcji: ta sama sygnatura i to samo zachowanie salda,
-- plus wiersz w księdze. Wołający (`workshop-send-sms`, `send-sms`) nie
-- wymagają zmiany.
--
-- ZMIANA ZACHOWANIA, świadoma: gdy identyfikator nie trafia w żaden warsztat,
-- funkcja KRZYCZY do logu zamiast milczeć. Dotąd `UPDATE` obejmował zero
-- wierszy, co nie jest błędem, więc `rpcErr` było puste i nikt się nie
-- dowiadywał, że SMS poszedł za darmo (patrz `send-sms` z `fleet_id`
-- z tabeli `fleets`).
CREATE OR REPLACE FUNCTION public.deduct_sms_credit(p_provider_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_trafione integer;
BEGIN
  UPDATE service_providers
  SET sms_balance = GREATEST(COALESCE(sms_balance, 0) - 1, 0),
      updated_at  = now()
  WHERE id = p_provider_id;

  GET DIAGNOSTICS v_trafione = ROW_COUNT;

  IF v_trafione = 0 THEN
    RAISE WARNING 'deduct_sms_credit: identyfikator % nie jest warsztatem — SMS NIEROZLICZONY', p_provider_id;
    RETURN;
  END IF;

  INSERT INTO sms_credit_ledger (provider_id, delta, powod)
  VALUES (p_provider_id, -1, 'wyslanie');
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Nadanie przez księgę
-- ---------------------------------------------------------------------------
-- Zastępuje bezpośredni UPDATE w `payment-core`. Saldo i wpis powstają w tej
-- samej transakcji, więc nie ma stanu, w którym saldo urosło bez śladu.
CREATE OR REPLACE FUNCTION public.grant_sms_credits(
  p_provider_id uuid,
  p_ile         integer,
  p_powod       text DEFAULT 'nadanie_admin',
  p_actor       uuid DEFAULT NULL,
  p_opis        text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_saldo integer;
BEGIN
  IF p_ile IS NULL OR p_ile = 0 THEN
    RAISE EXCEPTION 'grant_sms_credits: liczba SMS-ów musi być różna od zera';
  END IF;
  IF p_powod NOT IN ('nadanie_admin', 'zakup', 'korekta') THEN
    RAISE EXCEPTION 'grant_sms_credits: niedozwolony powód %', p_powod;
  END IF;

  UPDATE service_providers
  SET sms_balance = GREATEST(COALESCE(sms_balance, 0) + p_ile, 0),
      updated_at  = now()
  WHERE id = p_provider_id
  RETURNING sms_balance INTO v_saldo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant_sms_credits: nie ma warsztatu %', p_provider_id;
  END IF;

  INSERT INTO sms_credit_ledger (provider_id, delta, powod, actor_user_id, opis)
  VALUES (p_provider_id, p_ile, p_powod, p_actor, p_opis);

  RETURN v_saldo;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_sms_credits(uuid, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_sms_credits(uuid, integer, text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Kontrola zgodności
-- ---------------------------------------------------------------------------
-- Widok do sprawdzania, czy księga nadal opisuje saldo. Rozjazd znaczy, że
-- ktoś ruszył `sms_balance` z pominięciem funkcji — i będzie widać, o ile.
CREATE OR REPLACE VIEW public.sms_saldo_kontrola AS
SELECT sp.id AS provider_id,
       sp.company_name,
       COALESCE(sp.sms_balance, 0)                   AS saldo,
       COALESCE(SUM(l.delta), 0)::integer            AS suma_ksiegi,
       COALESCE(sp.sms_balance, 0) - COALESCE(SUM(l.delta), 0)::integer AS roznica
FROM public.service_providers sp
LEFT JOIN public.sms_credit_ledger l ON l.provider_id = sp.id
GROUP BY sp.id, sp.company_name, sp.sms_balance;

REVOKE ALL ON public.sms_saldo_kontrola FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
