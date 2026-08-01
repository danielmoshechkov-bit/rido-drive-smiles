-- =====================================================================
-- SPRZĄTANIE DANYCH TESTOWYCH MODUŁU FISKALNEGO
--
-- Uruchamiane RĘCZNIE i JEDNORAZOWO (edytor SQL Supabase). To nie jest migracja —
-- nie ma go w supabase/migrations, żeby nigdy nie wykonał się automatycznie na
-- produkcji: kasuje dane, a nie zmienia schemat.
--
-- ZAKRES: wyłącznie paragony wydrukowane w TRYBIE SZKOLENIOWYM (printer_mode =
-- 'training') danej firmy oraz wpisy, które z nich powstały. Paragony fiskalne
-- (printer_mode = 'fiscal') są nietykalne — obrót jest w pamięci fiskalnej
-- drukarki i kasowanie go z bazy rozjechałoby ewidencję z raportami dobowymi.
--
-- Wpłat i wydatków WPISANYCH RĘCZNIE w Kasie ten skrypt NIE dotyka — nie da się
-- ich odróżnić od prawdziwych, więc decyzję o nich zostawiamy człowiekowi.
--
-- PRZED URUCHOMIENIEM: ustaw identyfikator firmy w pierwszym CTE.
-- =====================================================================

BEGIN;

-- Firma, której dane testowe czyścimy (Warsztat Testowy).
CREATE TEMP TABLE _target AS
SELECT id AS provider_id
FROM public.service_providers
WHERE id = '664ed87b-a20f-457b-a9fa-97ca13dcae7c';   -- Warsztat Testowy

-- Paragony do usunięcia: tylko szkoleniowe, tylko tej firmy.
CREATE TEMP TABLE _receipts AS
SELECT r.id
FROM public.fiscal_receipts r
JOIN _target t ON t.provider_id = r.provider_id
WHERE r.printer_mode = 'training';

-- Podgląd przed skasowaniem — sprawdź liczby, zanim zatwierdzisz transakcję.
SELECT (SELECT count(*) FROM _receipts)                                             AS paragony_do_usuniecia,
       (SELECT count(*) FROM public.workshop_payments
          WHERE fiscal_receipt_id IN (SELECT id FROM _receipts))                    AS wplaty_do_usuniecia,
       (SELECT count(*) FROM public.fiscal_returns
          WHERE receipt_id IN (SELECT id FROM _receipts))                           AS zwroty_do_usuniecia,
       (SELECT count(*) FROM public.fiscal_corrections
          WHERE receipt_id IN (SELECT id FROM _receipts))                           AS korekty_do_usuniecia;

-- 1. Pieniądze: wpłaty z paragonów i wypłaty ze zwrotów.
DELETE FROM public.workshop_expenses
WHERE fiscal_return_id IN (
  SELECT id FROM public.fiscal_returns WHERE receipt_id IN (SELECT id FROM _receipts)
);

DELETE FROM public.workshop_payments
WHERE fiscal_receipt_id IN (SELECT id FROM _receipts);

-- 2. Ewidencje (FK do paragonu ma ON DELETE RESTRICT — muszą zniknąć wcześniej).
--    Najpierw zdejmujemy wskazanie paragonu na korektę, inaczej FK zablokuje kasowanie.
UPDATE public.fiscal_receipts
SET superseded_by_correction_id = NULL
WHERE id IN (SELECT id FROM _receipts);

DELETE FROM public.fiscal_corrections WHERE receipt_id IN (SELECT id FROM _receipts);
DELETE FROM public.fiscal_returns     WHERE receipt_id IN (SELECT id FROM _receipts);

-- 3. Faktury tracą wskazanie na paragon, ale zostają — to osobne dokumenty.
UPDATE public.user_invoices
SET fiscal_receipt_id = NULL
WHERE fiscal_receipt_id IN (SELECT id FROM _receipts);

-- 4. Same paragony.
DELETE FROM public.fiscal_receipts WHERE id IN (SELECT id FROM _receipts);

-- Sprawdź wynik podglądu powyżej. Jeśli liczby się zgadzają:
COMMIT;
-- W razie wątpliwości zamiast COMMIT wykonaj: ROLLBACK;
