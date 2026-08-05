-- =============================================================================
-- Sekwencja numeracji zleceń — per provider, per miesiąc
--
-- POWÓD: `count(*) + 1` w voice_commit_call jest podatne na trzy rzeczy naraz:
--   1. WYŚCIG — dwa commity w tej samej chwili dostaną ten sam numer.
--      Argument „commity idą po rozmowach" przestanie być prawdziwy przy wielu
--      tenantach i przy retry webhooka, a retry ElevenLabs JUŻ mamy.
--   2. USUNIĘTE ZLECENIE — skasowanie jednego sprawia, że następne dostanie
--      numer, który już był u klienta na SMS-ie.
--   3. Numer jest widoczny dla klienta i dla księgowości, więc duplikat albo
--      dziura to problem dokumentowy, nie techniczny.
--
-- ROZWIĄZANIE: licznik w tabeli, zwiększany atomowo przez UPSERT z RETURNING.
-- Postgres blokuje wiersz na czas UPDATE, więc dwa równoległe wywołania dostaną
-- kolejne numery, a nie ten sam. Nie używamy natywnych SEQUENCE, bo potrzebujemy
-- osobnego licznika dla każdej pary (provider, miesiąc), a sekwencji nie da się
-- tworzyć dynamicznie bez DDL w locie.
--
-- ZGODNOŚĆ WSTECZNA: licznik startuje od NAJWIĘKSZEGO numeru, jaki dany provider
-- ma już w tym miesiącu. Bez tego pierwszy commit po migracji nadałby ZLP-…-001
-- i zderzyłby się z istniejącymi zleceniami.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workshop_order_counters (
  provider_id uuid        NOT NULL,
  period      text        NOT NULL,          -- 'MM/YYYY', dokładnie jak w numerze
  last_no     int         NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, period)
);

ALTER TABLE public.workshop_order_counters ENABLE ROW LEVEL SECURITY;
-- Brak polityk = brak dostępu dla anon i authenticated. Tabela jest wyłącznie
-- dla funkcji SECURITY DEFINER; nikt nie ma jej czytać ani pisać bezpośrednio.

COMMENT ON TABLE public.workshop_order_counters IS
  'Licznik numeracji zlecen per provider i miesiac. Zwiekszany wylacznie przez '
  'next_workshop_order_number(). Nie czytac i nie pisac bezposrednio.';

-- ---------------------------------------------------------------------------
-- Atomowe pobranie kolejnego numeru.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_workshop_order_number(p_provider_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period text := to_char(now(), 'MM/YYYY');
  v_next   int;
BEGIN
  -- Pierwsze użycie w danym miesiącu startuje od najwyższego istniejącego numeru,
  -- żeby nie zderzyć się ze zleceniami sprzed migracji.
  INSERT INTO workshop_order_counters (provider_id, period, last_no)
  VALUES (
    p_provider_id, v_period,
    COALESCE((
      SELECT max((regexp_match(order_number, '-(\d+)$'))[1]::int)
        FROM workshop_orders
       WHERE provider_id = p_provider_id
         AND order_number LIKE 'ZLP-' || v_period || '-%'
    ), 0)
  )
  ON CONFLICT (provider_id, period) DO NOTHING;

  -- UPDATE blokuje wiersz, więc równoległe wywołania ustawiają się w kolejkę.
  UPDATE workshop_order_counters
     SET last_no = last_no + 1, updated_at = now()
   WHERE provider_id = p_provider_id AND period = v_period
  RETURNING last_no INTO v_next;

  RETURN 'ZLP-' || v_period || '-' || lpad(v_next::text, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_workshop_order_number(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_workshop_order_number(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.next_workshop_order_number(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.next_workshop_order_number(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- voice_commit_call przechodzi na sekwencję. Zmieniają się DWIE linie:
-- znika count(*)+1, wchodzi wywołanie funkcji.
-- ---------------------------------------------------------------------------
-- W pliku voice-commit-call-20260806.sql zastąpić:
--
--   SELECT count(*) + 1 INTO v_seq FROM workshop_orders
--    WHERE provider_id = p_provider_id
--      AND date_trunc('month', created_at) = date_trunc('month', now());
--   v_order_no := 'ZLP-' || to_char(now(), 'MM/YYYY') || '-' || lpad(v_seq::text, 3, '0');
--
-- przez:
--
--   v_order_no := public.next_workshop_order_number(p_provider_id);
--
-- (deklaracja v_seq staje się zbędna)

-- ---------------------------------------------------------------------------
-- KONTROLA — dwa kolejne wywołania muszą dać RÓŻNE numery.
-- ---------------------------------------------------------------------------
-- BEGIN;
--   SELECT public.next_workshop_order_number('664ed87b-a20f-457b-a9fa-97ca13dcae7c') AS pierwszy;
--   SELECT public.next_workshop_order_number('664ed87b-a20f-457b-a9fa-97ca13dcae7c') AS drugi;
--   SELECT max(order_number) AS najwyzszy_istniejacy FROM workshop_orders
--    WHERE provider_id = '664ed87b-a20f-457b-a9fa-97ca13dcae7c'
--      AND order_number LIKE 'ZLP-' || to_char(now(),'MM/YYYY') || '-%';
-- ROLLBACK;
--
-- Oczekiwane: "pierwszy" jest o jeden większy od najwyższego istniejącego,
-- "drugi" o jeden większy od "pierwszego".
