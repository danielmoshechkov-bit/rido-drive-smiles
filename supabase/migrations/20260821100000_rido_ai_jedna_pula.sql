-- Rido AI: JEDNA PULA na wyceny i pomoc przy naprawie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO JEDNA, A NIE DWIE
-- ═══════════════════════════════════════════════════════════════════════════
-- W cenniku stały dwie osobne pozycje: `ai_repair_help` (pytania o naprawę)
-- i `ai_labor_pricing` (wyceny robocizny). Dwie pule znaczą dwa liczniki, dwa
-- miejsca do doładowania i dwa razy pytanie „która to była funkcja".
--
-- Dla warsztatu to jedna rzecz: zapytał Rido AI. Dla nas też — oba pytania idą
-- na to samo konto u dostawcy modelu i kosztują tak samo. Dzielenie tego na pół
-- utrudniało liczenie, nie ułatwiało niczego.
--
-- Stąd `rido_ai`: jedna pula, jeden licznik w pasku, jedno doładowanie.
--
-- Limity zgodne z decyzją warsztatu:
--   free 3 · standard 50 · pro 300 · sieci bez limitu · okres próbny bez limitu
--
-- STARE CECHY ZOSTAJĄ W BAZIE. Nie kasujemy ich, bo mogą do nich odsyłać
-- wcześniejsze paczki i wpisy zużycia — a historia rozliczeń ma zostać
-- czytelna. Przestają być używane przez aplikację, to wszystko.

BEGIN;

INSERT INTO public.billing_features (key, name, description, kind, unit, sort_order)
VALUES ('rido_ai', 'Rido AI',
        'Wyceny robocizny i pomoc przy naprawie — wspólna pula pytań',
        'metered', 'pytanie', 55)
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      kind = EXCLUDED.kind,
      unit = EXCLUDED.unit;

INSERT INTO public.billing_plan_features (plan_id, feature_id, is_enabled, limit_value)
SELECT p.id, f.id, true, m.limit_value
FROM (VALUES
        ('warsztat_free',     3::numeric),
        ('warsztat_standard', 50),
        ('warsztat_pro',      300),
        -- NULL = bez limitu. Sieci mają limity per umowa, okres próbny ma
        -- pokazywać pełne możliwości.
        ('warsztat_sieci',    NULL),
        ('trial_max',         NULL)
     ) AS m(plan_code, limit_value)
JOIN public.billing_plans p ON p.code = m.plan_code
CROSS JOIN public.billing_features f
WHERE f.key = 'rido_ai'
ON CONFLICT (plan_id, feature_id) DO UPDATE
  SET is_enabled = true,
      limit_value = EXCLUDED.limit_value;

-- ---------------------------------------------------------------------------
-- Kontrola: cecha istnieje i ma komplet planów
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ile int;
BEGIN
  SELECT count(*) INTO v_ile
  FROM public.billing_plan_features pf
  JOIN public.billing_features f ON f.id = pf.feature_id
  WHERE f.key = 'rido_ai';

  IF v_ile < 3 THEN
    RAISE EXCEPTION 'Rido AI ma tylko % planow — oczekiwano co najmniej trzech (free, standard, pro)', v_ile;
  END IF;

  RAISE NOTICE 'Rido AI: jedna pula na % planach.', v_ile;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
