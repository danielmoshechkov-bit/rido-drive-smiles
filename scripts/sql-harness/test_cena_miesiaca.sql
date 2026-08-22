\set QUIET on
SET client_min_messages = notice;
BEGIN;
DO $$
DECLARE r record; v_ok text := ''; v_zle text := '';
BEGIN
  -- 1. Pierwszy zakup, brak subskrypcji -> cena STARTOWA (przypadek, ktory MA sie udac)
  SELECT * INTO r FROM public.billing_cena_miesiaca('warsztat_standard','bbbb0000-0000-0000-0000-00000000000f');
  IF r.cena_netto = 99 AND r.po_gwarancji = false
    THEN v_ok := v_ok || E'\n  OK   pierwszy zakup: cena startowa 99';
    ELSE v_zle := v_zle || E'\n  BLAD pierwszy zakup: ' || r.cena_netto; END IF;

  -- 2. Gwarancja TRWA -> nadal startowa
  UPDATE billing_subscriptions SET price_guarantee_until = now() + interval '60 days'
    WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000001';
  SELECT * INTO r FROM public.billing_cena_miesiaca('warsztat_standard','bbbb0000-0000-0000-0000-000000000001');
  IF r.cena_netto = 99 AND r.po_gwarancji = false
    THEN v_ok := v_ok || E'\n  OK   gwarancja trwa: nadal 99';
    ELSE v_zle := v_zle || E'\n  BLAD gwarancja trwa: ' || r.cena_netto; END IF;

  -- 3. Gwarancja MINELA -> cena docelowa
  UPDATE billing_subscriptions SET price_guarantee_until = now() - interval '1 day'
    WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000001';
  SELECT * INTO r FROM public.billing_cena_miesiaca('warsztat_standard','bbbb0000-0000-0000-0000-000000000001');
  IF r.cena_netto = 139 AND r.po_gwarancji = true
    THEN v_ok := v_ok || E'\n  OK   gwarancja minela: cena docelowa 139';
    ELSE v_zle := v_zle || E'\n  BLAD po gwarancji: ' || r.cena_netto; END IF;

  -- 4. Pro po gwarancji
  SELECT * INTO r FROM public.billing_cena_miesiaca('warsztat_pro','bbbb0000-0000-0000-0000-000000000001');
  IF r.cena_netto = 249 THEN v_ok := v_ok || E'\n  OK   Pro po gwarancji: 249';
  ELSE v_zle := v_zle || E'\n  BLAD Pro po gwarancji: ' || r.cena_netto; END IF;

  -- 5. Brutto liczone na kwocie, nie na skladnikach
  SELECT * INTO r FROM public.billing_cena_miesiaca('warsztat_pro','bbbb0000-0000-0000-0000-00000000000f');
  IF r.cena_brutto = round(169 * 1.23, 2) THEN v_ok := v_ok || E'\n  OK   brutto = ' || r.cena_brutto;
  ELSE v_zle := v_zle || E'\n  BLAD brutto: ' || r.cena_brutto; END IF;

  -- 6. Zamowienie musi dotyczyc ALBO produktu, ALBO planu
  BEGIN
    INSERT INTO billing_orders (subscriber_type, subscriber_id, product_id, plan_id, amount_gross)
    VALUES ('service_provider','bbbb0000-0000-0000-0000-000000000001',
            (SELECT id FROM billing_addon_products LIMIT 1),
            (SELECT id FROM billing_plans WHERE code='warsztat_pro'), 100);
    v_zle := v_zle || E'\n  BLAD zamowienie z produktem I planem przeszlo';
  EXCEPTION WHEN check_violation THEN
    v_ok := v_ok || E'\n  OK   zamowienie nie moze byc i produktem, i planem';
  END;

  -- 7. Zamowienie na sam plan przechodzi (przypadek, ktory MA sie udac)
  BEGIN
    INSERT INTO billing_orders (subscriber_type, subscriber_id, plan_id, amount_gross)
    VALUES ('service_provider','bbbb0000-0000-0000-0000-000000000001',
            (SELECT id FROM billing_plans WHERE code='warsztat_pro'), 207.87);
    v_ok := v_ok || E'\n  OK   zamowienie na sam plan przechodzi';
  EXCEPTION WHEN others THEN v_zle := v_zle || E'\n  BLAD zamowienie na plan: ' || SQLERRM;
  END;

  RAISE NOTICE '%', v_ok;
  IF v_zle <> '' THEN RAISE EXCEPTION '%', v_zle; END IF;
  RAISE NOTICE 'WSZYSTKIE SIEDEM PRZYPADKOW ZGODNYCH';
END $$;
ROLLBACK;
