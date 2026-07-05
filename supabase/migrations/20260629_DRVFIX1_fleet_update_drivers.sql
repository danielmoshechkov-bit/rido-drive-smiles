-- DRVFIX1: właściciel floty może aktualizować kierowców SWOJEJ floty
-- Powód: migracja 20251101090456 usunęła "Fleet users can update drivers" i zostawiła
-- UPDATE na drivers tylko dla roli 'admin'. Skutek: flotowy zapisuje nr konta (IBAN),
-- UI pokazuje sukces, ale RLS odrzuca (0 wierszy) → wraca stary numer. Przywracamy zapis
-- dla właściciela floty (kierowca-self idzie osobną ścieżką z potwierdzeniem mailowym).

DROP POLICY IF EXISTS "Fleet users can update drivers" ON public.drivers;
CREATE POLICY "Fleet users can update drivers" ON public.drivers
  FOR UPDATE TO authenticated
  USING (fleet_id = public.get_user_fleet_id(auth.uid()))
  WITH CHECK (fleet_id = public.get_user_fleet_id(auth.uid()));
