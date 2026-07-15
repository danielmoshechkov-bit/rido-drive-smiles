-- 20260715_SECFIX_signature_snapshot.sql
-- =====================================================================
-- ETAP B — snapshot podpisu (dowód prawny: co i za ile klient podpisał)
-- ---------------------------------------------------------------------
-- ADDYTYWNA. Dodaje kolumnę snapshot jsonb do workshop_order_signatures
-- i przebudowuje sign_workshop_document_by_client_code tak, by przy KAŻDYM
-- podpisie ZAMRAŻAŁ stan: pozycje + sumy + numer zlecenia + dane/telefon
-- klienta + kto/kiedy przygotował wycenę. Read-RPC zwraca to automatycznie
-- (serializuje pełne wiersze podpisów).
--
-- Stary front działa dalej (snapshot=null → fallback na live). Backfill
-- niemożliwy (brak historycznego stanu pozycji) — snapshoty od teraz w przód.
-- Idempotentne (ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE).
-- =====================================================================

ALTER TABLE public.workshop_order_signatures
  ADD COLUMN IF NOT EXISTS snapshot jsonb;

CREATE OR REPLACE FUNCTION public.sign_workshop_document_by_client_code(
  p_code text, p_doc_type text, p_user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order    workshop_orders%ROWTYPE;
  v_client   workshop_clients%ROWTYPE;
  v_snapshot jsonb;
BEGIN
  SELECT * INTO v_order FROM workshop_orders
   WHERE p_code IS NOT NULL AND length(btrim(p_code)) >= 4 AND client_code = p_code
   LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_doc_type NOT IN ('reception_protocol','cost_estimate','release_protocol') THEN
    RAISE EXCEPTION 'invalid doc_type: %', p_doc_type;
  END IF;

  SELECT * INTO v_client FROM workshop_clients WHERE id = v_order.client_id;

  -- Zamrożony stan w chwili podpisu: pozycje + sumy liczone z tych pozycji
  -- (gwarancja spójności z listą, którą klient widział klikając "Akceptuję").
  SELECT jsonb_build_object(
    'document_type', p_doc_type,
    'signed_at', now(),
    'signature_method', 'button',
    'order_number', v_order.order_number,
    'client_type', v_client.client_type,
    'client_name', coalesce(
                     nullif(v_client.company_name, ''),
                     nullif(btrim(concat_ws(' ', v_client.first_name, v_client.last_name)), '')),
    'client_phone', v_client.phone,
    'quote_done_at', v_order.quote_done_at,
    'quote_done_by_user_id', v_order.quote_done_by_user_id,
    'estimate_sent_to_client', v_order.estimate_sent_to_client,
    'items', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'name', i.name, 'item_type', i.item_type, 'unit', i.unit,
                 'quantity', i.quantity, 'discount_percent', i.discount_percent,
                 'unit_price_net', i.unit_price_net, 'unit_price_gross', i.unit_price_gross,
                 'total_net', i.total_net, 'total_gross', i.total_gross
               ) ORDER BY i.sort_order NULLS LAST, i.created_at)
        FROM workshop_order_items i WHERE i.order_id = v_order.id), '[]'::jsonb),
    'total_net',   coalesce((SELECT sum(i.total_net)   FROM workshop_order_items i WHERE i.order_id = v_order.id), 0),
    'total_gross', coalesce((SELECT sum(i.total_gross) FROM workshop_order_items i WHERE i.order_id = v_order.id), 0)
  ) INTO v_snapshot;
  v_snapshot := v_snapshot || jsonb_build_object(
    'total_vat', coalesce((v_snapshot->>'total_gross')::numeric,0) - coalesce((v_snapshot->>'total_net')::numeric,0));

  INSERT INTO workshop_order_signatures(order_id, document_type, signed_at, user_agent, signature_method, snapshot)
  VALUES (v_order.id, p_doc_type, now(), p_user_agent, 'button', v_snapshot);

  -- Mapowanie statusów DOKŁADNIE jak oryginalny RPC (SECFIX1a) — bez zmian.
  -- Podpisy klienta zapisują podpis+snapshot; sterowanie statusem tam, gdzie
  -- warsztat robi to ręcznie, NIE jest przejmowane.
  IF p_doc_type = 'reception_protocol' THEN
    UPDATE workshop_orders SET client_acceptance_confirmed = true, status_name = 'Przyjęcie do serwisu'
     WHERE id = v_order.id;
  ELSIF p_doc_type = 'cost_estimate' THEN
    UPDATE workshop_orders SET quote_accepted = true, status_name = 'Zaakceptowano'
     WHERE id = v_order.id;
  -- release_protocol: TYLKO podpis + snapshot (wstawione wyżej). To potwierdzenie
  -- odbioru auta przez klienta, NIE zmiana etapu — statusem ('Zakończone'
  -- odblokowuje zakładkę wydania, potem 'Wydano') steruje warsztat RĘCZNIE.
  END IF;

  RETURN jsonb_build_object(
    'signatures', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                     FROM workshop_order_signatures s WHERE s.order_id = v_order.id),
    'order',      (SELECT to_jsonb(o) FROM workshop_orders o WHERE o.id = v_order.id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.sign_workshop_document_by_client_code(text, text, text) TO anon, authenticated;

-- =====================================================================
-- WERYFIKACJA:
--   -- kolumna istnieje:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='workshop_order_signatures' AND column_name='snapshot';  -- jsonb
--   -- po pierwszym NOWYM podpisie: snapshot niepusty
--   SELECT document_type, signed_at, snapshot->>'total_gross' AS kwota,
--          snapshot->>'client_phone' AS tel, jsonb_array_length(snapshot->'items') AS pozycji
--   FROM workshop_order_signatures WHERE snapshot IS NOT NULL ORDER BY created_at DESC LIMIT 3;
-- =====================================================================
-- ROLLBACK:
--   -- przywróć wersję RPC bez snapshotu z 20260714_SECFIX1a (INSERT bez kolumny snapshot);
--   -- kolumnę można zostawić (nieszkodliwa) lub: ALTER TABLE ... DROP COLUMN snapshot;
-- =====================================================================
