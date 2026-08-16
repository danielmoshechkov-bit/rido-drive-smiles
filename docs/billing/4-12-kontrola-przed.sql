-- 4.12 — stan PRZED. Uruchomić i pokazać wynik ZANIM cokolwiek zmienimy.

-- ---------------------------------------------------------------------------
-- A. 🔴 PILNE, niezależne od 4.12 — skutek uboczny przełączenia SMS (4.10)
-- ---------------------------------------------------------------------------
-- `billing_wydaj_paczke` nadal dopisuje do `sms_balance` przy każdym zakupie
-- i oznacza paczkę `odzwierciedlone_at`. Po 4.10 to saldo jest martwe (nikt go
-- nie czyta), ale znacznik został — a to ten sam znacznik, po którym migracja
-- 4.10 rozpoznawała paczki DO WYZEROWANIA.
--
-- Jeśli poniższe zwróci cokolwiek, są to paczki OPŁACONE PO migracji, które
-- wyglądają jak duplikaty. Nie wolno na nich uruchomić logiki zerowania.
SELECT p.id AS pack_id, p.subscriber_id, sp.company_name, f.key AS produkt,
       p.amount_total, p.amount_remaining, p.source, p.order_id,
       p.created_at, p.odzwierciedlone_at
FROM billing_addon_packs p
JOIN billing_features f ON f.id = p.feature_id
LEFT JOIN service_providers sp ON sp.id = p.subscriber_id
WHERE p.odzwierciedlone_at IS NOT NULL
  AND p.source = 'purchase'
  -- po migracji 4.10
  AND p.created_at > (SELECT max(wykonano_at) FROM sms_migracja_4_10)
ORDER BY p.created_at DESC;

-- Ile salda SMS przyrosło po migracji (powinno być 0 — każde > 0 to martwy zapis)
SELECT count(*) AS warsztatow_z_odrosnietym_saldem,
       COALESCE(sum(sms_balance), 0) AS lacznie
FROM service_providers WHERE COALESCE(sms_balance, 0) > 0;

-- ---------------------------------------------------------------------------
-- B. Kredyty VIN właścicieli warsztatów — to przenosimy do puli firmy (wariant W)
-- ---------------------------------------------------------------------------
SELECT
  sp.id                                     AS warsztat_id,
  sp.company_name,
  sp.user_id                                AS wlasciciel,
  COALESCE(vlc.remaining_credits, 0)        AS saldo_wlasciciela,
  COALESCE(dubl.suma, 0)                    AS paczki_odzwierciedlone,
  COALESCE(nowe.suma, 0)                    AS paczki_nieodzwierciedlone,
  -- ile da się sprawdzić DZIŚ
  COALESCE(vlc.remaining_credits, 0) + COALESCE(nowe.suma, 0) AS do_sprawdzenia_dzis,
  -- ile po przeniesieniu — musi być ta sama liczba
  COALESCE(vlc.remaining_credits, 0) + COALESCE(nowe.suma, 0) AS po_przeniesieniu
FROM service_providers sp
LEFT JOIN vehicle_lookup_credits vlc ON vlc.user_id = sp.user_id
LEFT JOIN LATERAL (
  SELECT sum(p.amount_remaining) AS suma FROM billing_addon_packs p
  JOIN billing_features f ON f.id = p.feature_id
  WHERE p.subscriber_type = 'service_provider' AND p.subscriber_id = sp.id
    AND f.key = 'vehicle_lookup' AND p.amount_remaining > 0
    AND p.odzwierciedlone_at IS NOT NULL
) dubl ON true
LEFT JOIN LATERAL (
  SELECT sum(p.amount_remaining) AS suma FROM billing_addon_packs p
  JOIN billing_features f ON f.id = p.feature_id
  WHERE p.subscriber_type = 'service_provider' AND p.subscriber_id = sp.id
    AND f.key = 'vehicle_lookup' AND p.amount_remaining > 0
    AND p.odzwierciedlone_at IS NULL
) nowe ON true
WHERE COALESCE(vlc.remaining_credits, 0) > 0 OR dubl.suma > 0 OR nowe.suma > 0
ORDER BY sp.company_name;

-- ---------------------------------------------------------------------------
-- C. Ile sprawdzeń VIN naprawdę się zużywa — podstawa do ustalenia limitów planów
-- ---------------------------------------------------------------------------
-- Bez tej liczby limit w planie będzie zgadywaniem. Baza jest testowa, więc
-- traktuję to jako rząd wielkości, nie prognozę.
SELECT date_trunc('month', created_at) AS miesiac,
       count(*)                        AS sprawdzen,
       count(DISTINCT user_id)         AS uzytkownikow
FROM vehicle_lookup_usage
GROUP BY 1 ORDER BY 1 DESC LIMIT 6;
