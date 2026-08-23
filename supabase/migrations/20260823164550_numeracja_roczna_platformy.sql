-- Numeracja faktur platformy: seria ROCZNA zamiast miesięcznej.
--
-- Wystawiona dotąd faktura miała numer `GR/2026/08/001` — wzór `RRRR/MM/NNN`,
-- licznik zerowany co miesiąc. Ustalona zasada to seria roczna: jeden ciągły
-- licznik w roku, reset przy zmianie roku.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- TRZY CYFRY, NIE CZTERY — I DLACZEGO TAK ZOSTAJE
-- ═══════════════════════════════════════════════════════════════════════════
-- Ustaliliśmy zapis `GR/2026/0001`. Wyjdzie `GR/2026/001`.
--
-- Szerokość licznika jest ZASZYTA W MODULE `_shared/invoiceNumbering.ts`,
-- wspólnym dla całego programu do faktur. Rozszerzenie do czterech cyfr
-- zmieniłoby format numerów WSZYSTKIM warsztatom wystawiającym faktury swoim
-- klientom — a ciągłość numeracji jest sprawą księgową, nie kosmetyczną.
--
-- Trzy cyfry wystarczają do 999 faktur rocznie. Przy przekroczeniu licznik
-- rośnie dalej (`GR/2026/1000`) — nie urywa się, tylko przestaje być wyrównany.
--
-- Zmieniamy WYŁĄCZNIE wiersz firmy platformy. Cudzych ustawień numeracji
-- nie ruszamy.

BEGIN;

UPDATE user_invoice_companies c
SET numbering_pattern = 'RRRR/NNN',
    numbering_mode    = 'continuous',
    numbering_prefix  = 'GR',
    updated_at        = now()
FROM billing_settings b
WHERE c.id = b.platform_invoice_company_id;

DO $KONTROLA$
DECLARE v_wzor text; v_prefiks text; v_ile int;
BEGIN
  SELECT c.numbering_pattern, c.numbering_prefix INTO v_wzor, v_prefiks
  FROM billing_settings b JOIN user_invoice_companies c ON c.id = b.platform_invoice_company_id;

  IF v_wzor IS DISTINCT FROM 'RRRR/NNN' OR v_prefiks IS DISTINCT FROM 'GR' THEN
    RAISE EXCEPTION 'Numeracja platformy: wzór % prefiks %', v_wzor, v_prefiks;
  END IF;

  -- Kontrola zasięgu: żadna CUDZA firma nie mogła zostać przestawiona.
  SELECT count(*) INTO v_ile FROM user_invoice_companies c
  WHERE c.numbering_pattern = 'RRRR/NNN'
    AND c.id NOT IN (SELECT platform_invoice_company_id FROM billing_settings
                     WHERE platform_invoice_company_id IS NOT NULL);
  IF v_ile > 0 THEN
    RAISE NOTICE 'Uwaga: % innych firm ma wzór roczny — to ich własne ustawienie, nie nasza zmiana.', v_ile;
  END IF;

  RAISE NOTICE 'Numeracja platformy: %/RRRR/NNN, seria roczna.', v_prefiks;
END $KONTROLA$;

COMMIT;

NOTIFY pgrst, 'reload schema';
