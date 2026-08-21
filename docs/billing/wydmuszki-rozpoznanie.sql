-- ROZPOZNANIE PRZED USUNIĘCIEM KONT DEMONSTRACYJNYCH — samo czytanie, zero zmian.
--
-- Nie wypisuję listy tabel z pamięci. Zapytanie samo przechodzi po WSZYSTKICH
-- kolumnach wskazujących na `service_providers` — i po tych z kluczem obcym,
-- i po tych, które mają samą nazwę `provider_id` bez klucza (takich w tej bazie
-- jest sporo, bo tabele warsztatowe zakładano bez więzów). Lista wypisana ręcznie
-- byłaby aktualna do pierwszej nowej tabeli.
--
-- Uruchom W CAŁOŚCI i przyślij oba wyniki.

-- ---------------------------------------------------------------------------
-- 1. Które wiersze uznajemy za wydmuszki
-- ---------------------------------------------------------------------------
-- Definiuję je REGUŁĄ, nie listą identyfikatorów: brak właściciela, zasiane
-- 24 stycznia, zero zleceń. Dzięki temu widać, czy reguła trafia dokładnie
-- w te dziewięć — a nie w coś jeszcze.
CREATE TEMP TABLE _wydmuszki AS
SELECT sp.id, sp.company_name, sp.created_at, sp.status
FROM public.service_providers sp
WHERE sp.user_id IS NULL
  AND sp.created_at::date = DATE '2026-01-24'
  AND NOT EXISTS (SELECT 1 FROM public.workshop_orders o WHERE o.provider_id = sp.id);

SELECT company_name, status, created_at FROM _wydmuszki ORDER BY company_name;

-- Kontrola: czy reguła nie zgarnia niczego spoza tych dziewięciu i czy żadnej
-- nie gubi. Wypisuje też konta bez właściciela z INNYCH dni — gdyby były.
SELECT
  (SELECT count(*) FROM _wydmuszki)                                        AS zlapane_regula,
  (SELECT count(*) FROM public.service_providers WHERE user_id IS NULL)    AS wszystkie_bez_wlasciciela,
  (SELECT count(*) FROM public.service_providers)                          AS warsztatow_lacznie;

SELECT id, company_name, created_at::date AS dzien, user_id
FROM public.service_providers
WHERE user_id IS NULL AND id NOT IN (SELECT id FROM _wydmuszki);

-- ---------------------------------------------------------------------------
-- 2. Co realnie na nie wskazuje — przejście po CAŁYM schemacie
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _podpiecia (
  tabela text, kolumna text, ma_klucz_obcy boolean, przy_usunieciu text, wierszy bigint
);

DO $$
DECLARE
  r record;
  v_ile bigint;
  v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids FROM _wydmuszki;
  IF v_ids IS NULL THEN
    RAISE NOTICE 'Reguła nie znalazła żadnej wydmuszki — nie ma czego sprawdzać.';
    RETURN;
  END IF;

  FOR r IN
    -- (a) kolumny z kluczem obcym do service_providers
    SELECT (c.conrelid::regclass)::text AS tabela,
           a.attname::text              AS kolumna,
           true                         AS ma_fk,
           CASE c.confdeltype WHEN 'a' THEN 'BŁĄD (NO ACTION)'
                              WHEN 'r' THEN 'BŁĄD (RESTRICT)'
                              WHEN 'c' THEN 'kasuje w dół (CASCADE)'
                              WHEN 'n' THEN 'zeruje (SET NULL)'
                              WHEN 'd' THEN 'ustawia domyślną'
           END AS przy_usunieciu
    FROM pg_constraint c
    JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.service_providers'::regclass

    UNION

    -- (b) kolumny BEZ klucza obcego, ale o nazwie wskazującej na warsztat.
    -- Bez tego przeoczylibyśmy tabele warsztatowe zakładane bez więzów —
    -- a to one trzymają najwięcej danych.
    SELECT (cl.oid::regclass)::text, a.attname::text, false, 'brak więzu'
    FROM pg_class cl
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE cl.relkind = 'r'
      AND a.atttypid = 'uuid'::regtype
      AND a.attname IN ('provider_id', 'service_provider_id', 'reviewer_provider_id', 'tenant_id')
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint c2
        JOIN unnest(c2.conkey) k2(attnum) ON k2.attnum = a.attnum
        WHERE c2.contype = 'f' AND c2.conrelid = cl.oid
          AND c2.confrelid = 'public.service_providers'::regclass
      )
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = ANY($1)', r.tabela, r.kolumna)
      INTO v_ile USING v_ids;

    IF v_ile > 0 THEN
      INSERT INTO _podpiecia VALUES (r.tabela, r.kolumna, r.ma_fk, r.przy_usunieciu, v_ile);
    END IF;
  END LOOP;
END $$;

-- Wynik: tylko tabele, w których COŚ jest. Puste = nic poza samym wierszem
-- usługodawcy.
SELECT * FROM _podpiecia ORDER BY wierszy DESC, tabela;

-- ---------------------------------------------------------------------------
-- 3. Czy widać je publicznie
-- ---------------------------------------------------------------------------
-- Sedno sprawy: klient wchodzi na /uslugi i widzi firmy, których nie ma.
SELECT company_name, status,
       (SELECT count(*) FROM public.provider_services ps WHERE ps.provider_id = w.id) AS uslug
FROM _wydmuszki w
ORDER BY company_name;
