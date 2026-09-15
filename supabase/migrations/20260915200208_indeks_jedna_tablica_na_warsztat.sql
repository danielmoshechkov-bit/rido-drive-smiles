-- ═══════════════════════════════════════════════════════════════════════════
-- JEDNA TABLICA — JEDEN POJAZD W KARTOTECE WARSZTATU
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 URUCHAMIAĆ PO `20260915200049_scalenie_zduplikowanych_pojazdow`.
-- Na danych sprzed scalenia ten indeks nie powstanie — i tak ma być.
--
-- Do 15.09.2026 `workshop_vehicles` nie miała ŻADNEGO indeksu unikalnego.
-- Trzy zwykłe (`pkey`, `provider`, `owner_client`) i nic więcej. Dlatego
-- podwójny zapis z okna dodawania pojazdu przechodził bez oporu 68 razy,
-- a historia napraw rozjeżdżała się na dwa wpisy.
--
-- Poprawka w kodzie (`useCreateWorkshopVehicle` szuka przed zapisem) obowiązuje
-- JEDNĄ drogę. Indeks obowiązuje wszystkie — także te, których jeszcze nie ma.
-- To jest różnica między uprzejmością a bramką.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO CZĘŚCIOWY I PO ZNORMALIZOWANEJ TABLICY
-- ═══════════════════════════════════════════════════════════════════════════
-- • `WHERE tablica <> ''` — pojazd bez numeru rejestracyjnego jest poprawny
--   (auto na lawecie, powypadkowe, świeżo sprowadzone). Takich nie ograniczamy;
-- • normalizacja `upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g'))` —
--   bo „WI 822 LY", „wi822ly" i „WI-822-LY" to jedna tablica. Bez tego indeks
--   przepuściłby duplikat różniący się spacją;
-- • w obrębie WARSZTATU — ta sama tablica u dwóch warsztatów to dwa różne auta
--   w dwóch różnych kartotekach.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NAJPIERW SPRAWDZAMY, POTEM ZAKŁADAMY
-- ═══════════════════════════════════════════════════════════════════════════
-- Zgodnie z zasadą z CLAUDE.md więz zakłada migracja, która NAJPIERW sprawdza,
-- czy dane na to pozwalają, i odmawia z wypisaną listą — zamiast padać na
-- komunikacie o kluczu, z którego nie wynika, co poprawić.

BEGIN;

DO $kontrola_wstepna$
DECLARE
  v_ile   int;
  v_lista text;
BEGIN
  SELECT count(*), string_agg(opis, E'\n  ' ORDER BY opis)
    INTO v_ile, v_lista
  FROM (
    SELECT sp.company_name || ' — ' || t.tablica || ' (' || t.ile || ' wierszy)' AS opis
    FROM (
      SELECT provider_id,
             upper(regexp_replace(coalesce(plate,''), '[^A-Za-z0-9]', '', 'g')) AS tablica,
             count(*) AS ile
      FROM public.workshop_vehicles
      WHERE upper(regexp_replace(coalesce(plate,''), '[^A-Za-z0-9]', '', 'g')) <> ''
      GROUP BY 1, 2 HAVING count(*) > 1
    ) t
    JOIN public.service_providers sp ON sp.id = t.provider_id
  ) x;

  IF v_ile > 0 THEN
    RAISE EXCEPTION E'Nie zakładam indeksu: w kartotekach jest jeszcze % powtórzonych tablic.\n  %\nUruchom najpierw migrację scalającą (20260915200049).', v_ile, v_lista;
  END IF;
END;
$kontrola_wstepna$;

CREATE UNIQUE INDEX workshop_vehicles_jedna_tablica
ON public.workshop_vehicles (
  provider_id,
  (upper(regexp_replace(coalesce(plate, ''), '[^A-Za-z0-9]', '', 'g')))
)
WHERE upper(regexp_replace(coalesce(plate, ''), '[^A-Za-z0-9]', '', 'g')) <> '';

COMMENT ON INDEX public.workshop_vehicles_jedna_tablica IS
  'Jedna tablica rejestracyjna na warsztat. Częściowy, bo pojazd bez numeru jest poprawny. Założony 15.09.2026 po scaleniu 68 duplikatów.';

-- ═══════════════════════════════════════════════════════════════════════════
-- KONTROLA — INDEKS MA NAPRAWDĘ ODRZUCAĆ, A NIE TYLKO ISTNIEĆ
-- ═══════════════════════════════════════════════════════════════════════════
DO $kontrola$
DECLARE
  v_prov uuid := gen_random_uuid();
  v_a    uuid := gen_random_uuid();
  v_odmowy int := 0;
BEGIN
  INSERT INTO public.service_providers (id, company_name) VALUES (v_prov, 'PRÓBA INDEKSU TABLIC');

  INSERT INTO public.workshop_vehicles (id, provider_id, plate, brand)
  VALUES (v_a, v_prov, 'WX 123 AB', 'PRÓBA');

  -- 1. TA SAMA tablica, inny zapis → MA odmówić
  BEGIN
    INSERT INTO public.workshop_vehicles (provider_id, plate, brand)
    VALUES (v_prov, 'wx123ab', 'PRÓBA 2');
    RAISE EXCEPTION 'kontrola pozytywna PADŁA: duplikat tablicy przeszedł';
  EXCEPTION WHEN unique_violation THEN v_odmowy := v_odmowy + 1;
  END;

  -- 2. KONTROLA ODWROTNA: inna tablica MA przejść
  INSERT INTO public.workshop_vehicles (provider_id, plate, brand)
  VALUES (v_prov, 'WX 999 ZZ', 'PRÓBA 3');

  -- 3. KONTROLA ODWROTNA: DWA pojazdy BEZ tablicy mają przejść — indeks jest częściowy
  INSERT INTO public.workshop_vehicles (provider_id, plate, brand) VALUES (v_prov, NULL, 'PRÓBA 4');
  INSERT INTO public.workshop_vehicles (provider_id, plate, brand) VALUES (v_prov, '',   'PRÓBA 5');

  IF v_odmowy <> 1 THEN
    RAISE EXCEPTION 'kontrola: odmów było %, miała być 1', v_odmowy;
  END IF;

  DELETE FROM public.workshop_vehicles WHERE provider_id = v_prov;
  DELETE FROM public.service_providers WHERE id = v_prov;

  RAISE NOTICE 'Indeks działa: duplikat tablicy odrzucony, inna tablica i pojazdy bez tablicy przepuszczone.';
END;
$kontrola$;

COMMIT;
