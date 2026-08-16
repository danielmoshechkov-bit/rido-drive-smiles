# Przełączenie zużycia SMS na `billing_consume` (wariant A)

## 1. Stan PRZED — uruchom to najpierw

```sql
SELECT
  sp.id, sp.company_name,
  COALESCE(sp.sms_balance, 0)                                   AS saldo_stare,
  COALESCE(dubl.suma, 0)                                        AS paczki_odzwierciedlone,
  COALESCE(nowe.suma, 0)                                        AS paczki_nieodzwierciedlone,
  -- To jest prawda o tym, ile klient może dziś wysłać:
  COALESCE(sp.sms_balance, 0) + COALESCE(nowe.suma, 0)          AS do_wyslania_dzis,
  -- I tyle będzie po scaleniu — ta sama liczba.
  COALESCE(sp.sms_balance, 0) + COALESCE(nowe.suma, 0)          AS po_scaleniu
FROM service_providers sp
LEFT JOIN LATERAL (
  SELECT sum(p.amount_remaining) AS suma FROM billing_addon_packs p
  JOIN billing_features f ON f.id = p.feature_id
  WHERE p.subscriber_type = 'service_provider' AND p.subscriber_id = sp.id
    AND f.key = 'sms' AND p.amount_remaining > 0 AND p.odzwierciedlone_at IS NOT NULL
) dubl ON true
LEFT JOIN LATERAL (
  SELECT sum(p.amount_remaining) AS suma FROM billing_addon_packs p
  JOIN billing_features f ON f.id = p.feature_id
  WHERE p.subscriber_type = 'service_provider' AND p.subscriber_id = sp.id
    AND f.key = 'sms' AND p.amount_remaining > 0 AND p.odzwierciedlone_at IS NULL
) nowe ON true
WHERE COALESCE(sp.sms_balance, 0) > 0 OR dubl.suma > 0 OR nowe.suma > 0
ORDER BY sp.company_name;
```

### Jak to czytać

`paczki_odzwierciedlone` **NIE dodają się** do salda — to te same jednostki,
policzone dwa razy. Gdy klient kupił 500 SMS-ów przez PayU:

- powstała paczka na 500 (`amount_remaining = 500`),
- **oraz** doliczyliśmy 500 do `sms_balance`, bo z niego się wydaje.

Zużycie zdejmowało wyłącznie ze starego salda, więc paczka wciąż pokazuje 500,
choć część już poszła. **Prawdą jest `sms_balance`.**

Dlatego scalenie „saldo + wszystkie paczki" byłoby błędem — dałoby klientowi
drugi raz to, co już ma. Migracja zeruje paczki-duplikaty i zakłada jedną
nową paczkę równą staremu saldu.

`paczki_nieodzwierciedlone` to paczki, których nigdy nie doliczono do salda —
te dodają się normalnie.

**Kolumny `do_wyslania_dzis` i `po_scaleniu` muszą być równe.** Jeśli
którykolwiek wiersz się różni, nie uruchamiaj migracji i pokaż mi wynik.

---

## 2. Kolejność wykonania

**🔴 NAJPIERW DEPLOY FUNKCJI, POTEM MIGRACJA.** Nie odwrotnie.

Migracja zeruje `sms_balance`, a stara bramka wysyłki sprawdza właśnie tę
kolumnę — po migracji odmawiałaby wszystkim. Nowe funkcje rozpoznają OBA
stany (stare saldo albo pulę z `check_usage`), więc działają przed migracją
i po niej.

1. Deploy: `workshop-send-sms`, `send-sms`
2. Zapytanie kontrolne z punktu 1
3. Migracja `20260817170000_sms_przelaczenie.sql`
4. Kontrola po migracji (na końcu tego pliku)
5. Deploy frontu (pasek kredytów czyta teraz sumę, nie kolumnę)

## 3. Pora dnia — ma znaczenie

Migracja blokuje wiersze warsztatów (`FOR UPDATE`), więc wysyłka SMS-a
w trakcie **poczeka**, a nie zgubi się. Dane są bezpieczne o każdej porze.

Ale między krokiem 3 a 5 pasek kredytów pokaże zero — kolumna jest już pusta,
a nowy odczyt jeszcze niewdrożony. To kilka minut, w których warsztat może
zdążyć napisać, że „zniknęły SMS-y". **Wieczorem albo wcześnie rano**, po
prostu żeby nikt tego nie zobaczył.

Wysyłka działa w tym oknie normalnie — bramka rozpoznaje nowe źródło.

## 4. Cofnięcie

Migracja zapisuje stan sprzed do `sms_migracja_4_10` (saldo, suma paczek,
znacznik czasu). Cofnięcie:

```sql
BEGIN;

-- 1. Saldo wraca do wartości sprzed
UPDATE service_providers sp
SET sms_balance = m.saldo_przed, updated_at = now()
FROM sms_migracja_4_10 m
WHERE m.provider_id = sp.id;

-- 2. Paczka z migracji znika
DELETE FROM billing_addon_packs
WHERE source = 'migracja'
  AND id IN (SELECT pack_id FROM sms_migracja_4_10 WHERE pack_id IS NOT NULL);

-- 3. Paczki-duplikaty wracają do stanu sprzed wyzerowania
UPDATE billing_addon_packs p
SET amount_remaining = d.remaining_przed
FROM sms_migracja_4_10_paczki d
WHERE d.pack_id = p.id;

-- 4. Zużycie znów zdejmuje ze starego salda
CREATE OR REPLACE FUNCTION public.deduct_sms_credit(p_provider_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trafione integer;
BEGIN
  UPDATE service_providers
  SET sms_balance = GREATEST(COALESCE(sms_balance,0) - 1, 0), updated_at = now()
  WHERE id = p_provider_id;
  GET DIAGNOSTICS v_trafione = ROW_COUNT;
  IF v_trafione = 0 THEN
    RAISE WARNING 'deduct_sms_credit: identyfikator % nie jest warsztatem — SMS NIEROZLICZONY', p_provider_id;
    RETURN;
  END IF;
  INSERT INTO sms_credit_ledger (provider_id, delta, powod) VALUES (p_provider_id, -1, 'wyslanie');
END $$;

COMMIT;
```

Cofnięcie nie odtwarza SMS-ów wysłanych **po** migracji — te zeszły już
z paczek. Im dłużej po migracji, tym większa rozbieżność, więc cofać
najlepiej tego samego dnia.

## 5. Kontrola PO migracji

```sql
-- Suma przed = suma po, dla każdego warsztatu. Pusty wynik = zgodnie.
SELECT m.provider_id, sp.company_name,
       m.saldo_przed + m.paczki_nieodzwierciedlone_przed AS przed,
       COALESCE((SELECT sum(p.amount_remaining) FROM billing_addon_packs p
                 JOIN billing_features f ON f.id = p.feature_id
                 WHERE p.subscriber_id = m.provider_id AND f.key = 'sms'
                   AND p.amount_remaining > 0), 0) AS po
FROM sms_migracja_4_10 m
JOIN service_providers sp ON sp.id = m.provider_id
WHERE m.saldo_przed + m.paczki_nieodzwierciedlone_przed
   <> COALESCE((SELECT sum(p.amount_remaining) FROM billing_addon_packs p
                JOIN billing_features f ON f.id = p.feature_id
                WHERE p.subscriber_id = m.provider_id AND f.key = 'sms'
                  AND p.amount_remaining > 0), 0);

-- Stare salda wyzerowane
SELECT count(*) AS niewyzerowane FROM service_providers WHERE COALESCE(sms_balance,0) <> 0;

-- Zużycie działa: powinno zdjąć z paczki, nie ze starego salda
SELECT public.billing_consume('service_provider', '<ID-WARSZTATU>'::uuid, 'sms', 1);
```
