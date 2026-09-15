-- Ustawienia rozliczeń per miasto: flota może zapisywać SWOJE wiersze.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POWÓD (14.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Migracja `20260507184637` zamknęła zapis na `fleet_city_settings` do samego
-- administratora platformy:
--
--   CREATE POLICY "Admin manage fleet city settings" ... FOR ALL TO authenticated
--     USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
--
-- Flotowy (rola `fleet_settlement` / `fleet_rental`) od tego dnia:
--   * przy DODANIU miasta dostawał wprost
--     „new row violates row-level security policy for table fleet_city_settings",
--   * przy KASOWANIU i EDYCJI — ciszę: polityka RLS FILTRUJE wiersze, więc
--     `DELETE` i `UPDATE` kończyły się BEZ BŁĘDU, zmieniając ZERO wierszy.
--     Panel pokazywał „Usunięto", a wiersz zostawał na liście.
--
-- Sąsiednia tabela `fleet_settlement_fees` — z tego samego ekranu — cały czas
-- miała politykę dla flotowych i działała. Stąd wrażenie „raz zapisuje, raz nie".
--
-- Ta migracja NIE daje nikomu dostępu do cudzych danych: warunek jest ten sam,
-- którego używa działająca `fleet_settlement_fees` — wiersz musi należeć do
-- floty, w której użytkownik ma rolę.
--
-- Sprawdzone na produkcji przed napisaniem:
--   konto anastasiia.shapovalova1991@gmail.com ma role `fleet_settlement`
--   i `fleet_rental` na flocie b780dbf2-586b-4034-9176-be5431604f3e (Car4Ride),
--   a na `fleet_city_settings` stały WYŁĄCZNIE dwie polityki zapisu, obie
--   `has_role(auth.uid(), 'admin')`.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS "fleet_city_settings_zapis_floty" ON public.fleet_city_settings;

CREATE POLICY "fleet_city_settings_zapis_floty"
  ON public.fleet_city_settings
  FOR ALL
  TO authenticated
  USING (
    fleet_id IN (
      SELECT ur.fleet_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('fleet_settlement', 'fleet_rental')
    )
  )
  WITH CHECK (
    fleet_id IN (
      SELECT ur.fleet_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('fleet_settlement', 'fleet_rental')
    )
  );

-- ---------------------------------------------------------------------------
-- Kontrola: flotowy MUSI mieć czym zapisać, a polityka nie może być otwarta
-- ---------------------------------------------------------------------------
-- Sam zestaw odmów niczego nie dowodzi (CLAUDE.md, „Test RLS musi zawierać
-- przypadek, który ma PRZEJŚĆ"), więc sprawdzamy obie strony: że polityka dla
-- floty istnieje ORAZ że żadna polityka zapisu nie przepuszcza `true`.
DO $$
DECLARE
  v_ile_zapisu integer;
  v_otwarte    text;
BEGIN
  SELECT count(*) INTO v_ile_zapisu
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'fleet_city_settings'
    AND policyname = 'fleet_city_settings_zapis_floty';

  IF v_ile_zapisu <> 1 THEN
    RAISE EXCEPTION 'Polityka zapisu dla floty nie powstała (znaleziono %)', v_ile_zapisu;
  END IF;

  SELECT string_agg(policyname, ', ') INTO v_otwarte
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'fleet_city_settings'
    AND cmd <> 'SELECT'
    AND COALESCE(btrim(qual), 'true') = 'true';

  IF v_otwarte IS NOT NULL THEN
    RAISE EXCEPTION 'Otwarty zapis dla wszystkich: %', v_otwarte;
  END IF;

  RAISE NOTICE 'OK: flotowy zapisuje wiersze swojej floty, reszta bez zmian.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- WYCOFANIE
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS "fleet_city_settings_zapis_floty" ON public.fleet_city_settings;
