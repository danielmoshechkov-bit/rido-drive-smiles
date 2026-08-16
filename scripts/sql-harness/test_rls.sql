\set QUIET on
CREATE OR REPLACE FUNCTION public.probuj(opis text, polecenie text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE polecenie;
  RETURN opis || ' => PRZESZŁO';
EXCEPTION WHEN others THEN
  RETURN opis || ' => ODMOWA (' || left(SQLERRM, 40) || ')';
END $$;
\set QUIET off

\echo '=========== WARSZTAT AKTYWNY (a...001) ==========='
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
SELECT public.probuj('INSERT zlecenia',
  $$INSERT INTO public.workshop_orders (id, provider_id) VALUES (gen_random_uuid(),'a0000000-0000-0000-0000-000000000001')$$);
SELECT public.probuj('INSERT klienta',
  $$INSERT INTO public.workshop_clients (id, provider_id) VALUES (gen_random_uuid(),'a0000000-0000-0000-0000-000000000001')$$);
RESET ROLE;

\echo '=========== WARSZTAT ZABLOKOWANY (a...002, read_only) ==========='
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
SELECT public.probuj('INSERT zlecenia  (ma ODMÓWIĆ)',
  $$INSERT INTO public.workshop_orders (id, provider_id) VALUES (gen_random_uuid(),'a0000000-0000-0000-0000-000000000002')$$);
SELECT public.probuj('INSERT klienta   (ma ODMÓWIĆ)',
  $$INSERT INTO public.workshop_clients (id, provider_id) VALUES (gen_random_uuid(),'a0000000-0000-0000-0000-000000000002')$$);
SELECT public.probuj('INSERT rezerwacji(ma ODMÓWIĆ)',
  $$INSERT INTO public.workshop_client_bookings (id, provider_id) VALUES (gen_random_uuid(),'a0000000-0000-0000-0000-000000000002')$$);
\echo '--- ODCZYT I EKSPORT MUSZĄ DZIAŁAĆ ---'
SELECT count(*) AS widzi_zlecen FROM public.workshop_orders;
SELECT count(*) AS widzi_klientow FROM public.workshop_clients;
RESET ROLE;

\echo '=========== TRIAL WYGASŁ (a...004) ==========='
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
SELECT public.probuj('INSERT zlecenia  (ma ODMÓWIĆ)',
  $$INSERT INTO public.workshop_orders (id, provider_id) VALUES (gen_random_uuid(),'a0000000-0000-0000-0000-000000000004')$$);
RESET ROLE;

\echo '=========== TRIAL TRWA (a...003) ==========='
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
SELECT public.probuj('INSERT zlecenia  (ma PRZEJŚĆ)',
  $$INSERT INTO public.workshop_orders (id, provider_id) VALUES (gen_random_uuid(),'a0000000-0000-0000-0000-000000000003')$$);
RESET ROLE;

\echo '=========== AKTUALIZACJA REZERWACJI PRZY BLOKADZIE (ma PRZEJŚĆ) ==========='
INSERT INTO public.workshop_client_bookings (id, provider_id)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
SELECT public.probuj('UPDATE rezerwacji(ma PRZEJŚĆ)',
  $$UPDATE public.workshop_client_bookings SET created_at = now() WHERE id='bbbbbbbb-0000-0000-0000-000000000001'$$);
RESET ROLE;
