-- Rido AI: KONIEC przydziału miesięcznego. Jednorazowy start + dokupienie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DECYZJA I JEJ POWÓD
-- ═══════════════════════════════════════════════════════════════════════════
-- Do tej pory plan dawał pytania co miesiąc (free 3, standard 50, pro 300).
-- To obiecywało coś, czego nie chcemy dawać: pytanie do modelu kosztuje nas
-- realne pieniądze przy KAŻDYM wywołaniu, a przydział miesięczny odnawia się
-- niezależnie od tego, czy warsztat zapłacił za ten miesiąc więcej.
--
-- Nowy model jest prostszy do wytłumaczenia i uczciwszy w obie strony:
--   • miesięcznie NIE DAJEMY NIC,
--   • przy wejściu w plan warsztat dostaje JEDNORAZOWĄ pulę na sprawdzenie,
--   • dalej — wyłącznie dokupienie sztywnego pakietu.
--
-- Jednorazowe pule ustalone z warsztatem: free 3, standard 20, pro 50.
-- Sieci dostają tyle co Pro; ich warunki i tak ustala umowa, a zmiana wymaga
-- świadomej decyzji, nie domysłu. Okres próbny 50 — ma pokazać pełnię działania.
--
-- Limit zostaje ZEREM, a nie NULL-em. NULL znaczy „bez limitu" i otworzyłby
-- pytania na oścież. Zero znaczy „funkcja jest w planie, ale plan nie daje
-- przydziału" — dokładnie to, o co chodzi. Cennik takich pozycji nie pokazuje.

BEGIN;

UPDATE public.billing_plan_features pf
   SET limit_value = 0
  FROM public.billing_features f
 WHERE f.id = pf.feature_id
   AND f.key = 'rido_ai';

-- ---------------------------------------------------------------------------
-- Jednorazowa pula przy wejściu w plan
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rido_ai_start (
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  plan_code   text NOT NULL,
  ile         integer NOT NULL,
  przyznany_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, plan_code)
);

COMMENT ON TABLE public.rido_ai_start IS
  'Kto dostał już jednorazową pulę Rido AI i za jaki plan. Klucz złożony pilnuje, '
  'żeby wejście w ten sam plan drugi raz (po przerwie, po zmianie i powrocie) '
  'nie dawało puli ponownie.';

ALTER TABLE public.rido_ai_start ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rido_ai_start FROM anon, authenticated;

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

  v_ile := CASE p_plan_code
    WHEN 'warsztat_free'     THEN 3
    WHEN 'warsztat_standard' THEN 20
    WHEN 'warsztat_pro'      THEN 50
    WHEN 'warsztat_sieci'    THEN 50
    WHEN 'trial_max'         THEN 50
    WHEN 'trial_warsztat'    THEN 50
    ELSE 0
  END;

  IF v_ile = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO rido_ai_start (provider_id, plan_code, ile)
  VALUES (p_provider_id, p_plan_code, v_ile)
  ON CONFLICT (provider_id, plan_code) DO NOTHING;

  IF NOT FOUND THEN
    -- Ten plan już dostał swoją pulę. Cisza, nie błąd: wołający nie musi
    -- wiedzieć, czy to pierwsze wejście, czy powrót.
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
          -- Bezterminowo, tak samo jak dokupione pakiety. Pula na sprawdzenie
          -- funkcji nie ma sensu, jeśli wygasa, zanim warsztat ją otworzy.
          NULL, 'admin_grant',
          'Pula startowa Rido AI — plan ' || p_plan_code);

  RETURN v_ile;
END;
$$;

REVOKE ALL ON FUNCTION public.przyznaj_start_rido_ai(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.przyznaj_start_rido_ai(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_nie_zero int;
BEGIN
  SELECT count(*) INTO v_nie_zero
  FROM billing_plan_features pf
  JOIN billing_features f ON f.id = pf.feature_id
  WHERE f.key = 'rido_ai' AND coalesce(pf.limit_value, -1) <> 0;

  IF v_nie_zero > 0 THEN
    RAISE EXCEPTION 'Rido AI nadal ma przydzial miesieczny w % planach', v_nie_zero;
  END IF;

  RAISE NOTICE 'Rido AI: zero miesiecznie, pula jednorazowa przy wejsciu w plan.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
