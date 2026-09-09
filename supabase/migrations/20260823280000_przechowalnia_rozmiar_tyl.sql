-- Auto potrafi miec dwa rozmiary opon: inny na przedniej osi, inny na tylnej.
-- Jedno pole na komplet zmuszalo do wpisywania obu w jedna linie albo
-- zakladania dwoch wpisow na ten sam komplet.
ALTER TABLE public.workshop_tire_storage
  ADD COLUMN IF NOT EXISTS tire_size_rear text;

COMMENT ON COLUMN public.workshop_tire_storage.tire_size_rear IS
  'Rozmiar tylnej osi, gdy inny niz przednia. Puste = ten sam rozmiar wokolo.';
