-- ============================================================================
-- BILLING 3.2b — próg miękki w atomowej podmianie macierzy.
--
-- Rewizja cennika dołożyła `billing_plan_features.soft_limit_value` (fair use:
-- limit, który ostrzega, zamiast blokować). RPC podmieniający całą macierz
-- wciąż zapisywał wyłącznie limit twardy, więc każdy zapis z panelu KASOWAŁ
-- progi miękkie — DELETE + INSERT bez tej kolumny to cicha utrata danych.
--
-- Wywoływana wyłącznie z edge `billing-admin-plans` na service_role.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.billing_set_plan_features(
  p_plan_id uuid,
  p_rows    jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'billing: plan % nie istnieje', p_plan_id;
  END IF;

  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'billing: oczekiwano tablicy funkcji';
  END IF;

  DELETE FROM public.billing_plan_features WHERE plan_id = p_plan_id;

  INSERT INTO public.billing_plan_features
    (plan_id, feature_id, is_enabled, limit_value, soft_limit_value)
  SELECT
    p_plan_id,
    (r->>'feature_id')::uuid,
    COALESCE((r->>'is_enabled')::boolean, true),
    -- Brak klucza i pusty ciąg znaczą to samo co NULL: bez limitu.
    NULLIF(r->>'limit_value', '')::numeric,
    NULLIF(r->>'soft_limit_value', '')::numeric
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.billing_set_plan_features(uuid, jsonb) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_set_plan_features(uuid, jsonb) TO service_role;

COMMIT;
