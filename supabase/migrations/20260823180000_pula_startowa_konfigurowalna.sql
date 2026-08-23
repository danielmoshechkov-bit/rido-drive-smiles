-- Ile zapytań Rido AI dostaje warsztat na start było wpisane w CASE wewnątrz
-- `przyznaj_start_rido_ai`. Każda zmiana ceny wymagała migracji. Przenosimy to
-- do `billing_plans`, żeby Centrum Płatności mogło to ustawić z panelu.
--
-- Fail-closed: brak wartości = 0 zapytań, nie „domyślne 50".

ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS rido_ai_start_ile integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.billing_plans.rido_ai_start_ile IS
  'Jednorazowa pula zapytań Rido AI przyznawana przy pierwszym wejściu w ten plan. 0 = nic nie przyznajemy.';

-- Przepisujemy stan faktyczny z dotychczasowego CASE, żeby nikt nie stracił puli.
UPDATE public.billing_plans SET rido_ai_start_ile = CASE code
  WHEN 'warsztat_free'     THEN 3
  WHEN 'warsztat_standard' THEN 20
  WHEN 'warsztat_pro'      THEN 50
  WHEN 'warsztat_sieci'    THEN 50
  WHEN 'trial_max'         THEN 50
  WHEN 'trial_warsztat'    THEN 50
  ELSE 0
END
WHERE rido_ai_start_ile = 0;

CREATE OR REPLACE FUNCTION public.przyznaj_start_rido_ai(
  p_provider_id uuid,
  p_plan_code text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ile   integer;
  v_cecha uuid;
BEGIN
  IF p_provider_id IS NULL OR coalesce(p_plan_code, '') = '' THEN
    RETURN 0;
  END IF;

  SELECT coalesce(rido_ai_start_ile, 0) INTO v_ile
  FROM billing_plans WHERE code = p_plan_code;

  IF coalesce(v_ile, 0) <= 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO rido_ai_start (provider_id, plan_code, ile)
  VALUES (p_provider_id, p_plan_code, v_ile)
  ON CONFLICT (provider_id, plan_code) DO NOTHING;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT id INTO v_cecha FROM billing_features WHERE key = 'rido_ai';
  IF v_cecha IS NULL THEN
    RAISE EXCEPTION 'Brak cechy rido_ai — nie ma czego przyznac';
  END IF;

  INSERT INTO billing_addon_packs
    (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
     expires_at, source, note)
  VALUES ('service_provider', p_provider_id, v_cecha, v_ile, v_ile,
          NULL, 'admin_grant',
          'Pula startowa Rido AI — plan ' || p_plan_code);

  RETURN v_ile;
END;
$$;

REVOKE ALL ON FUNCTION public.przyznaj_start_rido_ai(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.przyznaj_start_rido_ai(uuid, text) TO service_role;
