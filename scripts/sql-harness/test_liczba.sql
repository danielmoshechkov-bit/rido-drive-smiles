\echo '=== stan przed (jako wlasciciel bazy) ==='
SELECT count(*) AS zlecen_zablokowanego FROM public.workshop_orders
 WHERE provider_id='a0000000-0000-0000-0000-000000000002';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);

\echo '=== ile wierszy REALNIE dotknie UPDATE i DELETE (oczekiwane 0) ==='
WITH z AS (UPDATE public.workshop_orders SET created_at = now()
           WHERE provider_id='a0000000-0000-0000-0000-000000000002' RETURNING 1)
SELECT count(*) AS zmienionych FROM z;

WITH z AS (DELETE FROM public.workshop_orders
           WHERE id='cccccccc-0000-0000-0000-000000000002' RETURNING 1)
SELECT count(*) AS usunietych FROM z;
RESET ROLE;

\echo '=== stan po — musi byc nadal 2 ==='
SELECT count(*) AS zlecen_zablokowanego FROM public.workshop_orders
 WHERE provider_id='a0000000-0000-0000-0000-000000000002';

\echo '=== a dla AKTYWNEGO ta sama operacja ma zadzialac ==='
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
WITH z AS (UPDATE public.workshop_orders SET created_at = now()
           WHERE provider_id='a0000000-0000-0000-0000-000000000001' RETURNING 1)
SELECT count(*) AS zmienionych_aktywny FROM z;
RESET ROLE;
