-- 20260714_SECFIX1a_workshop_client_code_rpcs.sql
-- =====================================================================
-- SECFIX ETAP 1 — CZĘŚĆ A (ADDYTYWNA, bezpieczna do wykonania OD RAZU)
-- ---------------------------------------------------------------------
-- Tworzy/aktualizuje 2 SECURITY DEFINER RPC, którymi nowy front
-- (WorkshopClientCard) czyta i podpisuje zlecenie po PEŁNYM client_code.
-- NIE rusza żadnych polityk — stary front na produkcji dalej działa na
-- dotychczasowych politykach anon. Nikt na produkcji jeszcze tych RPC nie
-- woła, więc CREATE OR REPLACE nie zmienia żywego zachowania.
--
-- Cel: umożliwić test nowego frontu lokalnie (przez RPC) ZANIM zdejmiemy
-- otwarte polityki. Zdjęcie polityk = CZĘŚĆ B (SECFIX1b), wykonywana DOPIERO
-- razem z deployem nowego frontu.
--
-- Idempotentne. SECURITY DEFINER omija RLS. Sygnatura i typ zwrotny bez zmian
-- względem 20260619240000 — rozszerzono tylko obiekt provider o
-- company_nip/company_website (dodatek; żaden odbiorca się nie psuje).
-- =====================================================================

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
                          'company_nip', sp.company_nip, 'company_website', sp.company_website,
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

GRANT EXECUTE ON FUNCTION public.get_workshop_order_by_client_code(text)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_workshop_document_by_client_code(text, text, text) TO anon, authenticated;

-- =====================================================================
-- WERYFIKACJA (po wykonaniu 1a):
--   SELECT public.get_workshop_order_by_client_code('<REALNY_KOD>') IS NOT NULL;  -- true
--   SELECT public.get_workshop_order_by_client_code('ZZZZZZ')       IS NULL;      -- true
-- Stary front dalej działa (polityki nietknięte). Wyciek NADAL otwarty do 1b.
-- =====================================================================
-- ROLLBACK 1a (opcjonalny; nic nie psuje, bo nikt na prod tych RPC nie wołał):
--   DROP FUNCTION IF EXISTS public.get_workshop_order_by_client_code(text);
--   DROP FUNCTION IF EXISTS public.sign_workshop_document_by_client_code(text, text, text);
-- =====================================================================
