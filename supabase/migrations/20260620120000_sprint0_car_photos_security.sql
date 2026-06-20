-- ============================================================
-- SPRINT 0 — car-photos (kanoniczny tor foto aut) + hardening documents (krok A)
-- Wspolna baza wclrrytmrscqvsyxyvnn. NIE rusza listing-photos / workshop-order-photos
-- (osobny, skoordynowany task z CC2/Workspace — patrz PROGRES_AI_FOTO.md).
-- ============================================================

-- ---------- 0a/0b: bucket car-photos ----------
insert into storage.buckets (id, name, public)
values ('car-photos', 'car-photos', true)
on conflict (id) do nothing;

drop policy if exists "car-photos public read"   on storage.objects;
drop policy if exists "car-photos owner insert"  on storage.objects;
drop policy if exists "car-photos owner update"  on storage.objects;
drop policy if exists "car-photos owner delete"  on storage.objects;

-- publiczny odczyt (zdjecia w ogloszeniach)
create policy "car-photos public read"
  on storage.objects for select
  using (bucket_id = 'car-photos');

-- zapis/zmiana/usun tylko we wlasnym folderze {userId}/...
create policy "car-photos owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "car-photos owner update"
  on storage.objects for update to authenticated
  using      (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "car-photos owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 0b: documents — krok A (usun anon write/del; zostaw public read) ----------
-- Byly to falszywe polityki "Admins can..." z USING(true)/bez TO authenticated
-- (pisac/kasowac mogl kazdy, takze anon). Krok A: ograniczamy do authenticated.
-- Pelna izolacja per-user/rola = osobny skoordynowany task (PROGRES_AI_FOTO.md).
drop policy if exists "Admins can upload documents" on storage.objects;
drop policy if exists "Admins can update documents" on storage.objects;
drop policy if exists "Admins can delete documents" on storage.objects;

create policy "documents authenticated insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents');

create policy "documents authenticated update"
  on storage.objects for update to authenticated
  using (bucket_id = 'documents');

create policy "documents authenticated delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents');
-- "Anyone can view documents" (SELECT, public read) zostaje bez zmian — potrzebny modulom.

-- ---------- 0d: koszt foto = ai_pricing (potwierdzenie, bez zmian danych) ----------
-- ai_pricing juz ma: vehicle_photo_enhance=10, vehicle_photo_custom=15
-- (migracja 20260119...). Zadna zmiana cen nie jest tu potrzebna — kod (creditGate)
-- czyta koszt wylacznie z ai_pricing. Idempotentne dopiecie na wszelki wypadek:
insert into ai_pricing (feature_key, credits_per_use, description, is_enabled)
values
  ('vehicle_photo_enhance', 10, 'Ulepszenie zdjecia pojazdu przez AI (tlo studyjne)', true),
  ('vehicle_photo_custom',  15, 'Niestandardowa edycja zdjecia z wlasnym opisem', true)
on conflict (feature_key) do nothing;
