-- Pakiet doładowania Rido AI: 200 pytań.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SKĄD TA CENA
-- ═══════════════════════════════════════════════════════════════════════════
-- Policzone z realnego zużycia, nie z sufitu. Jedno pytanie do Rido AI to dziś
-- dwa wywołania modeli naraz (Claude Haiku 4.5 i Gemini 2.5 Flash — `ai-chat`
-- odpala oba i wybiera lepszą odpowiedź):
--
--   wejście  ~1200 tokenów (persona + auto + pozycje + historia cen)
--   wyjście   ~500 tokenów (zakresy, stawka, werdykt, notatka)
--
--   Claude Haiku 4.5   $1 / $5 za mln  ->  $0,0037
--   Gemini 2.5 Flash   $0,05 / $0,20   ->  $0,0002
--   razem ~$0,004, czyli okolo 1,6 gr przy kursie 4 zl
--
-- Liczymy 20 gr za pytanie — DWANAŚCIE RAZY powyżej kosztu. Zapas jest celowy:
-- pytanie ze zdjęciem (pomoc przy naprawie) jest droższe od samej wyceny, ceny
-- modeli się zmieniają, a kurs dolara nie jest naszą decyzją.
--
-- 200 pytań = 40 zł netto = 49,20 zł brutto. Rozmiar dobrany tak, żeby NIE
-- podcinał abonamentu: Pro daje 300 pytań w cenie 169 zł, więc pakiet ma być
-- doładowaniem awaryjnym, a nie tańszą drogą naokoło.

BEGIN;

INSERT INTO public.billing_addon_products
  (code, name, feature_id, unit_price_net, vat_rate, step, min_units, waznosc_dni, is_active, sort_order)
SELECT 'rido_ai', 'Pakiet Rido AI — 200 pytań', f.id,
       0.20, 23, 200, 200,
       -- Bezterminowo, tak samo jak paczki SMS. Wygaszanie pakietów, za które
       -- ktoś zapłacił, wymaga osobnej decyzji — nie robimy tego mimochodem.
       NULL,
       true, 30
FROM public.billing_features f
WHERE f.key = 'rido_ai'
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      feature_id = EXCLUDED.feature_id,
      unit_price_net = EXCLUDED.unit_price_net,
      vat_rate = EXCLUDED.vat_rate,
      step = EXCLUDED.step,
      min_units = EXCLUDED.min_units,
      is_active = true;

DO $$
DECLARE v_cena numeric; v_krok int;
BEGIN
  SELECT unit_price_net, step INTO v_cena, v_krok
  FROM public.billing_addon_products WHERE code = 'rido_ai';

  IF v_cena IS NULL THEN
    RAISE EXCEPTION 'Pakiet rido_ai nie powstal — sprawdz, czy cecha rido_ai istnieje';
  END IF;

  RAISE NOTICE 'Pakiet Rido AI: % pytan po % zl netto = % zl netto (% zl brutto).',
    v_krok, v_cena, v_krok * v_cena, round(v_krok * v_cena * 1.23, 2);
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
