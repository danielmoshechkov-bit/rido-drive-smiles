-- Wyrównanie pakietu startowego dla warsztatów zarejestrowanych po 4.10.
--
-- POWÓD: `przyznaj_pakiet_startowy` przyznawała SMS-y przez `grant_sms_credits`
-- do kolumny `sms_balance`, a migracja 4.10 uczyniła tę kolumnę martwą — nic
-- jej już nie czyta. Warsztaty zarejestrowane po 4.10 mają więc w bazie zapis
-- „przyznano pakiet startowy" i zero jednostek do wydania.
--
-- ⚠️ TO ZMIENIA DANE KLIENTA. Uruchamiaj świadomie, nie przy okazji.
-- Najpierw punkt 1 (kogo dotyczy), potem dopiero punkt 2.

-- 1. Kogo to dotyczy
SELECT ps.email, sp.company_name, ps.sms AS obiecano_sms, ps.vin AS obiecano_vin,
       ps.created_at
FROM pakiety_startowe ps
JOIN service_providers sp ON sp.id = ps.provider_id
WHERE NOT EXISTS (
  SELECT 1 FROM billing_addon_packs p
  JOIN billing_features f ON f.id = p.feature_id
  WHERE p.subscriber_type = 'service_provider' AND p.subscriber_id = ps.provider_id
    AND f.key = 'sms' AND p.note = 'Pakiet startowy przy rejestracji')
ORDER BY ps.created_at;

-- 2. Wyrównanie — dopiero po obejrzeniu listy
-- Dosypuje DOKŁADNIE tyle, ile obiecywał zapis w `pakiety_startowe`, więc
-- powtórne uruchomienie nic nie doda (warunek NOT EXISTS przestaje pasować).
BEGIN;

INSERT INTO billing_addon_packs
  (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
   expires_at, source, note)
SELECT 'service_provider', ps.provider_id, f.id, ps.sms, ps.sms,
       NULL, 'compensation', 'Pakiet startowy przy rejestracji'
FROM pakiety_startowe ps
CROSS JOIN billing_features f
WHERE f.key = 'sms' AND ps.sms > 0
  AND NOT EXISTS (
    SELECT 1 FROM billing_addon_packs p
    WHERE p.subscriber_type = 'service_provider' AND p.subscriber_id = ps.provider_id
      AND p.feature_id = f.id AND p.note = 'Pakiet startowy przy rejestracji');

-- Sprawdzenia VIN: tylko tym, którzy nie mają ich na saldzie osobistym —
-- migracja 4.12 przeniosła salda właścicieli do puli, więc dosypanie bez tego
-- warunku dałoby drugi raz to samo.
INSERT INTO billing_addon_packs
  (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
   expires_at, source, note)
SELECT 'service_provider', ps.provider_id, f.id, ps.vin, ps.vin,
       NULL, 'compensation', 'Pakiet startowy przy rejestracji'
FROM pakiety_startowe ps
CROSS JOIN billing_features f
WHERE f.key = 'vehicle_lookup' AND ps.vin > 0
  AND NOT EXISTS (
    SELECT 1 FROM billing_addon_packs p
    WHERE p.subscriber_type = 'service_provider' AND p.subscriber_id = ps.provider_id
      AND p.feature_id = f.id AND p.note = 'Pakiet startowy przy rejestracji')
  AND NOT EXISTS (
    SELECT 1 FROM vin_migracja_4_12 m WHERE m.provider_id = ps.provider_id);

-- Kontrola: po wyrównaniu lista z punktu 1 ma być pusta.
SELECT count(*) AS wciaz_bez_pokrycia
FROM pakiety_startowe ps
WHERE NOT EXISTS (
  SELECT 1 FROM billing_addon_packs p
  JOIN billing_features f ON f.id = p.feature_id
  WHERE p.subscriber_type = 'service_provider' AND p.subscriber_id = ps.provider_id
    AND f.key = 'sms' AND p.note = 'Pakiet startowy przy rejestracji');

COMMIT;
