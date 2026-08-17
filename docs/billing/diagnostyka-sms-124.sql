-- Dlaczego licznik SMS pokazuje 0 przy kupionych 100, i skąd 124.
--
-- Uruchom W CAŁOŚCI i przyślij wynik. Cztery pytania, na które odpowiada:
--   1. czy konto ma WIĘCEJ NIŻ JEDEN warsztat (licznik czyta najstarszy,
--      a zakup mógł trafić do innego),
--   2. co naprawdę leży w paczkach SMS,
--   3. co odpowiada `check_usage` — to samo, co czyta pasek,
--   4. czy zamówienie zostało opłacone i czy paczka została WYDANA.

-- ---------------------------------------------------------------------------
-- 1. Ile warsztatów ma to konto
-- ---------------------------------------------------------------------------
-- Licznik w pasku bierze NAJSTARSZY warsztat użytkownika. Jeśli kont jest
-- kilka, a zakup poszedł na inny, licznik pokaże zero mimo opłaconej paczki.
SELECT sp.id, sp.company_name, sp.created_at,
       row_number() OVER (ORDER BY sp.created_at) AS ktory_wg_wieku
FROM service_providers sp
WHERE sp.user_id = (SELECT user_id FROM service_providers WHERE company_name ILIKE '%CART sp%' LIMIT 1)
ORDER BY sp.created_at;

-- ---------------------------------------------------------------------------
-- 2. Paczki SMS — co, ile, kiedy, z jakiego zamówienia
-- ---------------------------------------------------------------------------
SELECT sp.company_name,
       p.amount_total   AS kupione,
       p.amount_remaining AS zostalo,
       p.source, p.note, p.order_id,
       p.expires_at, p.created_at
FROM billing_addon_packs p
JOIN billing_features f ON f.id = p.feature_id
JOIN service_providers sp ON sp.id = p.subscriber_id
WHERE f.key = 'sms' AND p.subscriber_type = 'service_provider'
  AND sp.company_name ILIKE '%CART%'
ORDER BY p.created_at DESC;

-- ---------------------------------------------------------------------------
-- 3. Co widzi pasek — dokładnie to wywołanie robi interfejs
-- ---------------------------------------------------------------------------
SELECT sp.company_name,
       public.check_usage('service_provider', sp.id, 'sms', 1) AS stan_sms,
       public.sms_dostepne(sp.id)                              AS sms_dostepne
FROM service_providers sp
WHERE sp.company_name ILIKE '%CART%'
ORDER BY sp.created_at;

-- ---------------------------------------------------------------------------
-- 4. Zamówienia SMS — czy opłacone i czy paczka wydana
-- ---------------------------------------------------------------------------
-- `wydane_at` puste przy statusie `oplacone` znaczy, że pieniądze przyszły,
-- a towaru nie wydano — wtedy problem jest w webhooku, nie w liczniku.
SELECT o.id, sp.company_name, o.status, o.units, o.amount_gross,
       o.wydane_at, o.pack_id, o.created_at, pr.code AS produkt
FROM billing_orders o
JOIN service_providers sp ON sp.id = o.subscriber_id
LEFT JOIN billing_addon_products pr ON pr.id = o.product_id
WHERE sp.company_name ILIKE '%CART%'
ORDER BY o.created_at DESC
LIMIT 10;

-- ---------------------------------------------------------------------------
-- 5. Księga SMS — skąd wzięło się 124
-- ---------------------------------------------------------------------------
-- Podejrzenie: 124 to nie „doliczone za 100", tylko SUMA — reszta pakietu
-- startowego plus nowy zakup. Ta księga to pokaże wprost.
SELECT sp.company_name, l.delta, l.powod, l.opis, l.created_at
FROM sms_credit_ledger l
JOIN service_providers sp ON sp.id = l.provider_id
WHERE sp.company_name ILIKE '%CART%'
ORDER BY l.created_at DESC
LIMIT 20;
