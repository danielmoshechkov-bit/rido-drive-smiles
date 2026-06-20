-- ============================================================
-- E1 — BUG 1: zwykly zalogowany user moze zarzadzac WLASNYMI ogloszeniami aut.
-- Przyczyna bledu 42501: vehicle_listings mialo polityki tylko dla floty/admina/kierowcy.
-- Polityki RLS sa permissive (OR) — to NIE rusza istniejacych fleet/admin/driver.
-- Wlasnosc po kolumnie created_by (front ustawia created_by = auth.uid() przy insercie).
-- ============================================================

drop policy if exists "Users manage own vehicle listings" on vehicle_listings;

create policy "Users manage own vehicle listings" on vehicle_listings
  for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
