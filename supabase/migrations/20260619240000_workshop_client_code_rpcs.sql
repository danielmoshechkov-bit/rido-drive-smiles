-- =====================================================================
-- TURA PII / FIX 5 — KROK A: token-scoped RPCs dla publicznej karty klienta
-- ---------------------------------------------------------------------
-- Non-destructive: tworzy 2 SECURITY DEFINER RPC, którymi anonimowy klient
-- (WorkshopClientCard, /warsztat/klient/:code) będzie czytał i podpisywał
-- swoje zlecenie po DOKŁADNYM client_code. NIE rusza jeszcze żadnych
-- polityk (DROP-y idą w KROKU C, dopiero po wdrożeniu frontu).
--
-- Wzorzec jak booking-token RPCs (20260613140000): walidacja długości +
-- match po pełnym kodzie → caller dotyka tylko jednego zlecenia.
-- =====================================================================

-- READ: order + zagnieżdżone client/vehicle/items/signatures/provider/settings
CREATE OR REPLACE FUNCTION public.get_workshop_order_by_client_code(p_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(o)
    || jsonb_build_object(
         'client',     (SELECT to_jsonb(c) FROM workshop_clients  c WHERE c.id = o.client_id),
         'vehicle',    (SELECT to_jsonb(v) FROM workshop_vehicles v WHERE v.id = o.vehicle_id),
         'items',      (SELECT coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb)
                          FROM workshop_order_items i WHERE i.order_id = o.id),
         'signatures', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                          FROM workshop_order_signatures s WHERE s.order_id = o.id),
         'provider',   (SELECT jsonb_build_object(
                          'id', sp.id, 'company_name', sp.company_name, 'short_name', sp.short_name,
                          'company_address', sp.company_address, 'company_city', sp.company_city,
                          'company_postal_code', sp.company_postal_code, 'company_phone', sp.company_phone,
                          'logo_url', sp.logo_url, 'user_id', sp.user_id)
                        FROM service_providers sp WHERE sp.id = o.provider_id),
         'display_settings', (SELECT jsonb_build_object(
                          'show_net',   coalesce(ws.show_client_net,   true),
                          'show_vat',   coalesce(ws.show_client_vat,   true),
                          'show_gross', coalesce(ws.show_client_gross, true))
                        FROM workshop_settings ws
                        WHERE ws.user_id = (SELECT user_id FROM service_providers WHERE id = o.provider_id))
       )
  FROM workshop_orders o
  WHERE p_code IS NOT NULL
    AND length(btrim(p_code)) >= 4
    AND o.client_code = p_code
  LIMIT 1;
$$;

-- WRITE: podpis dokumentu + flagi zlecenia atomowo (zastępuje anon insert + update)
CREATE OR REPLACE FUNCTION public.sign_workshop_document_by_client_code(
  p_code text, p_doc_type text, p_user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_order workshop_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM workshop_orders
   WHERE p_code IS NOT NULL AND length(btrim(p_code)) >= 4 AND client_code = p_code
   LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_doc_type NOT IN ('reception_protocol','cost_estimate') THEN
    RAISE EXCEPTION 'invalid doc_type: %', p_doc_type;
  END IF;

  INSERT INTO workshop_order_signatures(order_id, document_type, signed_at, user_agent, signature_method)
  VALUES (v_order.id, p_doc_type, now(), p_user_agent, 'button');

  IF p_doc_type = 'reception_protocol' THEN
    UPDATE workshop_orders SET client_acceptance_confirmed = true, status_name = 'Przyjęcie do serwisu'
     WHERE id = v_order.id;
  ELSIF p_doc_type = 'cost_estimate' THEN
    UPDATE workshop_orders SET quote_accepted = true, status_name = 'Zaakceptowano'
     WHERE id = v_order.id;
  END IF;

  RETURN jsonb_build_object(
    'signatures', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                     FROM workshop_order_signatures s WHERE s.order_id = v_order.id),
    'order',      (SELECT to_jsonb(o) FROM workshop_orders o WHERE o.id = v_order.id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workshop_order_by_client_code(text)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_workshop_document_by_client_code(text, text, text) TO anon, authenticated;

-- =====================================================================
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.get_workshop_order_by_client_code(text);
--   DROP FUNCTION IF EXISTS public.sign_workshop_document_by_client_code(text, text, text);
-- =====================================================================
