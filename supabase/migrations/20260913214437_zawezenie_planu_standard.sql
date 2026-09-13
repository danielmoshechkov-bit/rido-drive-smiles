-- ═══════════════════════════════════════════════════════════════════════════
-- ZAWĘŻENIE PLANU STANDARD — CZTERY CECHY ZOSTAJĄ TYLKO W PRO
-- ═══════════════════════════════════════════════════════════════════════════
-- Standard miał 13 cech, Pro 17 — różnica cztery przy 70 zł dopłaty. Po tej
-- zmianie Standard ma 9, a różnica rośnie do ośmiu.
--
-- Zdejmowane ze Standardu:
--   workshop_photos   Zdjęcia przy przyjęciu
--   tire_storage      Przechowalnia opon
--   fiscalization     Fiskalizacja
--   reports_margin    Raporty i marża live
--
-- Zostaje kompletny warsztat: baza klientów i pojazdów, zlecenia i terminarz,
-- wyceny i faktury, KSeF, rezerwacje online, dynamiczne statusy z e-podpisem,
-- ceny rynkowe usług, Rido AI, dane pojazdu po VIN.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- KTO NA TYM TRACI — POLICZONE PRZED ZMIANĄ
-- ═══════════════════════════════════════════════════════════════════════════
-- Na 13.09.2026 tych cech używają DWA konta i ŻADNE nie jest na Standardzie:
--
--   CART78GARAGE sp. z o.o.  warsztat_pro    12 wpisów przechowalni, 5 paragonów
--   CART sp. z o.o.          trial_warsztat   7 wpisów przechowalni
--
-- Kont na Standardzie jest jedno („Daniel Moshechkov") i nie używa żadnej
-- z czterech. `workshop_photos` nie używa NIKT — zero wierszy w całej bazie.
-- Drukarkę fiskalną ma jeden warsztat, CART78GARAGE, i jest na Pro.
--
-- Nikt niczego nie traci. Gdyby ktoś tracił, właściwą odpowiedzią byłoby
-- zostawienie mu cechy przez `billing_plan_features` na jego planie, a nie
-- wstrzymanie zmiany dla wszystkich.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ PIĄTA ZMIANA, KTÓREJ NIE BYŁO NA LIŚCIE — `workshop_photos` W PLANIE FREE
-- ═══════════════════════════════════════════════════════════════════════════
-- `warsztat_free` (0 zł) ma `workshop_photos`. Zdjęcie tej cechy ze Standardu
-- i zostawienie jej w Free dałoby plan DARMOWY bogatszy od płatnego — pierwsze
-- pytanie, jakie zada klient porównujący cennik.
--
-- Dlatego migracja zdejmuje ją także z Free. Używa jej zero kont, więc koszt
-- jest zerowy. Jeśli to ma zostać w Free, usuń z tej migracji jedną linijkę
-- (oznaczoną niżej) — reszta zadziała bez zmian.

BEGIN;

-- ── Standard: cztery cechy do Pro ──────────────────────────────────────────
DELETE FROM public.billing_plan_features pf
USING public.billing_plans p, public.billing_features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.code = 'warsztat_standard'
  AND f.key IN ('workshop_photos', 'tire_storage', 'fiscalization', 'reports_margin');

-- ── Free: zdjęcia przyjęcia (USUŃ TĘ INSTRUKCJĘ, jeśli mają zostać) ────────
DELETE FROM public.billing_plan_features pf
USING public.billing_plans p, public.billing_features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.code = 'warsztat_free'
  AND f.key = 'workshop_photos';

-- ═══════════════════════════════════════════════════════════════════════════
-- KONTROLA — CO ZNIKNĘŁO I CO MA ZOSTAĆ
-- ═══════════════════════════════════════════════════════════════════════════
-- Sam zestaw „czterech już nie ma" wypadłby zielono także wtedy, gdyby
-- `DELETE` wyczyścił Standardowi wszystko. Dlatego sprawdzamy OBIE strony:
-- czego nie ma i co zostało — co do sztuki i co do nazwy.
DO $kontrola$
DECLARE
  v_std_ile   int;
  v_pro_ile   int;
  v_zostalo   text[];
  v_oczekiwane text[] := ARRAY[
    'ai_labor_pricing','dynamic_statuses','ksef','marketplace_access',
    'rido_ai','vehicle_lookup','workshop_core','workshop_invoices','workshop_orders'
  ];
  v_zdjecia_free int;
BEGIN
  SELECT count(*), array_agg(f.key ORDER BY f.key)
    INTO v_std_ile, v_zostalo
    FROM public.billing_plan_features pf
    JOIN public.billing_plans p ON p.id = pf.plan_id
    JOIN public.billing_features f ON f.id = pf.feature_id
   WHERE p.code = 'warsztat_standard';

  IF v_zostalo IS DISTINCT FROM v_oczekiwane THEN
    RAISE EXCEPTION 'kontrola: Standard ma % cech: %, spodziewane: %',
      v_std_ile, array_to_string(v_zostalo, ', '), array_to_string(v_oczekiwane, ', ');
  END IF;

  -- KONTROLA ODWROTNA: Pro nie mogło stracić niczego.
  SELECT count(*) INTO v_pro_ile
    FROM public.billing_plan_features pf
    JOIN public.billing_plans p ON p.id = pf.plan_id
   WHERE p.code = 'warsztat_pro';
  IF v_pro_ile <> 17 THEN
    RAISE EXCEPTION 'kontrola: Pro ma % cech, miało zostać 17', v_pro_ile;
  END IF;

  -- Free nie może być bogatsze od Standardu w zdjęciach przyjęcia.
  SELECT count(*) INTO v_zdjecia_free
    FROM public.billing_plan_features pf
    JOIN public.billing_plans p ON p.id = pf.plan_id
    JOIN public.billing_features f ON f.id = pf.feature_id
   WHERE p.code = 'warsztat_free' AND f.key = 'workshop_photos';
  IF v_zdjecia_free <> 0 THEN
    RAISE EXCEPTION 'kontrola: Free nadal ma workshop_photos, a Standard już nie — plan darmowy bogatszy od płatnego';
  END IF;

  RAISE NOTICE 'Kontrola przeszła. Standard: % cech. Pro: % cech.', v_std_ile, v_pro_ile;
END;
$kontrola$;

COMMIT;
