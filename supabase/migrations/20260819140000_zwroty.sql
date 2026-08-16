-- Obsługa zwrotów i obciążeń zwrotnych (audyt, punkt 4).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ZASADA NADRZĘDNA: ścieżka zwrotu NIE MA PRAWA ZAPISU do `billing_orders.status`
-- ═══════════════════════════════════════════════════════════════════════════
-- Dziś webhook czyta wyłącznie `order.status` i mapuje nieznany status na
-- `oczekuje`. Powiadomienie o zwrocie, które nie niesie statusu zamówienia,
-- cofnęłoby więc OPŁACONE zamówienie na „oczekujące" — przy wydanej paczce.
-- Dlatego zwrot dostaje własną tabelę i własną funkcję, a `billing_orders`
-- pozostaje nietknięte poza znacznikiem `zwrocone_at`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO SIĘ DZIEJE Z NIEWYKORZYSTANĄ RESZTĄ
-- ═══════════════════════════════════════════════════════════════════════════
-- Trzy zachowania, uzgodnione świadomie:
--
-- B — ZWROT PEŁNY (domyślny): zdejmujemy TYLKO to, co zostało.
--     Klient kupił 100 SMS, wysłał 40, dostaje pełny zwrot → zabieramy 60,
--     te 40 zostaje mu za darmo. Zwrot robimy my, zwykle wobec niezadowolonego
--     klienta; dobijanie go ujemnym saldem psuje ten gest. Różnicę zapisujemy
--     jako `nierozliczone` — jest liczba do raportu i podstawa, żeby przy
--     powtarzającym się nadużyciu zareagować ręcznie.
--
-- A — OBCIĄŻENIE ZWROTNE: zdejmujemy CAŁOŚĆ, także zużytą.
--     Tu pieniądze zabiera operator przed rozstrzygnięciem sporu, a klient
--     zgłaszający chargeback po zużyciu towaru nie zasługuje na ten sam gest.
--     Jeśli spór rozstrzygnie się na jego korzyść, paczkę przywracamy ręcznie
--     z zapisu w `billing_zwroty`.
--
-- C — ZWROT CZĘŚCIOWY: NIE zdejmujemy nic, oznaczamy `do_rozpatrzenia`.
--     Proporcja bywa niejednoznaczna (zwrot 30% ceny nie znaczy 30% jednostek),
--     a zgadywanie na pieniądzach jest gorsze niż wpis do przejrzenia.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Rejestr zwrotów
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_zwroty (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES public.billing_orders(id) ON DELETE RESTRICT,
  pack_id          uuid REFERENCES public.billing_addon_packs(id) ON DELETE SET NULL,

  -- Identyfikator zwrotu u operatora. UNIKALNY — to on rozstrzyga powtórki.
  refund_id        text NOT NULL,
  provider         text NOT NULL DEFAULT 'payu',

  typ              text NOT NULL CHECK (typ IN ('zwrot', 'chargeback')),
  kwota_gr         integer NOT NULL CHECK (kwota_gr > 0),
  pelny            boolean NOT NULL,

  -- Ile jednostek realnie zdjęliśmy i ile zostało nierozliczone.
  zdjete           numeric(12,2) NOT NULL DEFAULT 0,
  nierozliczone    numeric(12,2) NOT NULL DEFAULT 0,

  status           text NOT NULL DEFAULT 'rozliczony'
                   CHECK (status IN ('rozliczony', 'do_rozpatrzenia', 'bez_paczki')),
  payload          jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT billing_zwroty_refund_unikalny UNIQUE (provider, refund_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_zwroty_order ON public.billing_zwroty (order_id);
CREATE INDEX IF NOT EXISTS idx_billing_zwroty_do_rozpatrzenia
  ON public.billing_zwroty (created_at DESC) WHERE status = 'do_rozpatrzenia';

ALTER TABLE public.billing_zwroty ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_zwroty FROM anon, authenticated;

-- Znacznik na zamówieniu — jedyna rzecz, którą ścieżka zwrotu tam zapisuje.
-- Świadomie NIE `status`: ta kolumna opisuje płatność, a płatność się wydarzyła.
ALTER TABLE public.billing_orders
  ADD COLUMN IF NOT EXISTS zwrocone_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Rejestracja zwrotu
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_zwrot(
  p_order_id  uuid,
  p_refund_id text,
  p_kwota_gr  integer,
  p_typ       text DEFAULT 'zwrot',
  p_payload   jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_zam      billing_orders%ROWTYPE;
  v_pack     billing_addon_packs%ROWTYPE;
  v_oczek_gr integer;
  v_pelny    boolean;
  v_zdejmij  numeric := 0;
  v_brak     numeric := 0;
  v_status   text;
  v_wynik    jsonb;
BEGIN
  IF p_typ NOT IN ('zwrot', 'chargeback') THEN
    RAISE EXCEPTION 'billing_zwrot: nieznany typ %', p_typ;
  END IF;
  IF p_refund_id IS NULL OR btrim(p_refund_id) = '' THEN
    RAISE EXCEPTION 'billing_zwrot: brak identyfikatora zwrotu';
  END IF;

  -- Idempotencja PRZED czymkolwiek. Operator potrafi powtórzyć powiadomienie,
  -- a drugie zdjęcie jednostek zabrałoby klientowi to, czego nie kupił dwa razy.
  IF EXISTS (SELECT 1 FROM billing_zwroty WHERE provider = 'payu' AND refund_id = p_refund_id) THEN
    SELECT jsonb_build_object('ok', true, 'powtorka', true, 'status', z.status,
                              'zdjete', z.zdjete, 'nierozliczone', z.nierozliczone)
    INTO v_wynik FROM billing_zwroty z
    WHERE z.provider = 'payu' AND z.refund_id = p_refund_id;
    RETURN v_wynik;
  END IF;

  SELECT * INTO v_zam FROM billing_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_zwrot: nie ma zamówienia %', p_order_id;
  END IF;

  v_oczek_gr := round(v_zam.amount_gross * 100)::integer;
  v_pelny := (p_kwota_gr >= v_oczek_gr);

  -- Paczka wydana z tego zamówienia. Może nie istnieć: zwrot zamówienia,
  -- za które nigdy nie wydaliśmy towaru, jest poprawny i nie ma nic do zdjęcia.
  SELECT * INTO v_pack FROM billing_addon_packs
  WHERE order_id = p_order_id ORDER BY created_at LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    v_status := 'bez_paczki';

  ELSIF p_typ = 'chargeback' THEN
    -- Wariant A: całość, także zużyta.
    v_zdejmij := v_pack.amount_remaining;
    v_brak    := v_pack.amount_total - v_pack.amount_remaining;
    UPDATE billing_addon_packs
    SET amount_remaining = 0,
        note = COALESCE(note, '') || ' [obciążenie zwrotne ' || p_refund_id || ']',
        updated_at = now()
    WHERE id = v_pack.id;
    v_status := 'rozliczony';

  ELSIF v_pelny THEN
    -- Wariant B: tylko reszta.
    v_zdejmij := v_pack.amount_remaining;
    v_brak    := v_pack.amount_total - v_pack.amount_remaining;
    UPDATE billing_addon_packs
    SET amount_remaining = 0,
        note = COALESCE(note, '') || ' [zwrot ' || p_refund_id || ']',
        updated_at = now()
    WHERE id = v_pack.id;
    v_status := 'rozliczony';

  ELSE
    -- Wariant C: zwrot częściowy — nie zgadujemy proporcji.
    v_status := 'do_rozpatrzenia';
  END IF;

  INSERT INTO billing_zwroty
    (order_id, pack_id, refund_id, typ, kwota_gr, pelny, zdjete, nierozliczone, status, payload)
  VALUES
    (p_order_id, v_pack.id, p_refund_id, p_typ, p_kwota_gr, v_pelny,
     v_zdejmij, v_brak, v_status, p_payload);

  -- Jedyny zapis do `billing_orders`. NIE ruszamy `status` — patrz nagłówek.
  UPDATE billing_orders SET zwrocone_at = now(), updated_at = now()
  WHERE id = p_order_id AND zwrocone_at IS NULL;

  IF v_brak > 0 THEN
    RAISE WARNING 'billing_zwrot: zamówienie % — % jednostek już zużyto, nierozliczone',
      p_order_id, v_brak;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'powtorka', false, 'status', v_status,
    'pelny', v_pelny, 'zdjete', v_zdejmij, 'nierozliczone', v_brak);
END;
$$;

REVOKE ALL ON FUNCTION public.billing_zwrot(uuid, text, integer, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.billing_zwrot(uuid, text, integer, text, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
