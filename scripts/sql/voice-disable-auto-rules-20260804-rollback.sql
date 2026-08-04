-- ODWRÓCENIE: przywrócenie pięciu auto-reguł wygenerowanych przez voice-call-analyze 04.08.2026,
-- zatwierdzone przez właściciela. Reguła #6 (wyjaśnianie przyczyny prośby
-- o powtórzenie) ZOSTAJE aktywna.
--
-- Każda z wyłączanych reguł przeczy zasadzie wprowadzonej tego samego dnia:
--   b8529b7f  pytania diagnostyczne        -> zakaz prowadzenia diagnostyki
--   26d57d80  powtarzanie numeru telefonu  -> zakaz czytania numeru wstecz
--   f92f69b1  obietnica ceny i czasu       -> zakaz obiecywania cen
--   657e8806  potwierdzanie imienia+numeru -> zakaz powtarzania danych i nazwiska
--   2a120de3  pełne podsumowanie usług     -> zakaz pełnych podsumowań
--
-- ZAKRES: wyłącznie persona workshop_secretary. Zero DDL, zero usuwania rekordów.
-- Odwraca: scripts/sql/voice-disable-auto-rules-20260804.sql
--
--   supabase db query --linked -f scripts/sql/voice-disable-auto-rules-20260804-rollback.sql

BEGIN;

UPDATE public.voice_agent_knowledge
SET is_active = true
WHERE persona_key = 'workshop_secretary'
  AND id IN (
    'b8529b7f-8f2c-40eb-bdff-6e1df46a1ea0',  -- pytania diagnostyczne
    '26d57d80-84e1-485f-bbc3-968984c32098',  -- powtarzanie numeru telefonu
    'f92f69b1-90b3-48dd-8fd3-5128fefa5396',  -- obietnica ceny i czasu
    '657e8806-aecd-47d2-bc6f-649cfbfb58f1',  -- potwierdzanie imienia i numeru
    '2a120de3-94e0-41ac-a43f-fa0154f62613'   -- pełne podsumowanie usług
  );

COMMIT;

-- Weryfikacja: powrót do 15 aktywnych, 11 wyłączonych.
SELECT
  count(*) FILTER (WHERE is_active)     AS aktywne,
  count(*) FILTER (WHERE NOT is_active) AS wylaczone
FROM public.voice_agent_knowledge
WHERE persona_key = 'workshop_secretary';
