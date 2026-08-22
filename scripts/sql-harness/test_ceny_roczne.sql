\set QUIET on
SET client_min_messages = notice;
BEGIN;
DO $$
DECLARE v_ok text := ''; v_zle text := ''; m record; r record;
        v_prov uuid := 'bbbb0000-0000-0000-0000-000000000001';
BEGIN
  -- 1. Standard rok = 990 netto (przypadek, ktory MA sie udac)
  SELECT * INTO r FROM public.billing_cena_okresu('warsztat_standard', NULL, 'rok');
  IF r.cena_netto = 990 AND r.bez_rabatu_netto = 1188
    THEN v_ok := v_ok || E'\n  OK   Standard rok: 990 netto zamiast 1188';
    ELSE v_zle := v_zle || E'\n  BLAD Standard rok: ' || r.cena_netto || ' / ' || r.bez_rabatu_netto; END IF;

  -- 2. Pro rok = 1690 netto
  SELECT * INTO r FROM public.billing_cena_okresu('warsztat_pro', NULL, 'rok');
  IF r.cena_netto = 1690 AND r.bez_rabatu_netto = 2028
    THEN v_ok := v_ok || E'\n  OK   Pro rok: 1690 netto zamiast 2028';
    ELSE v_zle := v_zle || E'\n  BLAD Pro rok: ' || r.cena_netto || ' / ' || r.bez_rabatu_netto; END IF;

  -- 3. rabat to DOKLADNIE dwa miesiace
  SELECT * INTO m FROM public.billing_cena_okresu('warsztat_pro', NULL, 'miesiac');
  IF r.bez_rabatu_netto - r.cena_netto = m.cena_netto * 2
    THEN v_ok := v_ok || E'\n  OK   rabat = dokladnie dwa miesiace';
    ELSE v_zle := v_zle || E'\n  BLAD rabat: ' || (r.bez_rabatu_netto - r.cena_netto); END IF;

  -- 4. po gwarancji rok liczy sie z ceny DOCELOWEJ
  UPDATE billing_subscriptions SET price_guarantee_until = now() - interval '1 day'
    WHERE subscriber_id = v_prov;
  SELECT * INTO r FROM public.billing_cena_okresu('warsztat_pro', v_prov, 'rok');
  IF r.cena_netto = 2490 AND r.po_gwarancji
    THEN v_ok := v_ok || E'\n  OK   po gwarancji rok Pro: 2490 (249 x 10)';
    ELSE v_zle := v_zle || E'\n  BLAD po gwarancji: ' || r.cena_netto; END IF;

  -- 5. gwarancja TRWA -> nadal cena startowa
  UPDATE billing_subscriptions SET price_guarantee_until = now() + interval '100 days'
    WHERE subscriber_id = v_prov;
  SELECT * INTO r FROM public.billing_cena_okresu('warsztat_pro', v_prov, 'rok');
  IF r.cena_netto = 1690 AND NOT r.po_gwarancji
    THEN v_ok := v_ok || E'\n  OK   gwarancja trwa: rok nadal 1690';
    ELSE v_zle := v_zle || E'\n  BLAD gwarancja trwa: ' || r.cena_netto; END IF;

  -- 6. brutto liczone na kwocie
  IF r.cena_brutto = round(1690 * 1.23, 2)
    THEN v_ok := v_ok || E'\n  OK   brutto roku = ' || r.cena_brutto;
    ELSE v_zle := v_zle || E'\n  BLAD brutto: ' || r.cena_brutto; END IF;

  -- 7. plan darmowy i indywidualny odmawiaja
  BEGIN PERFORM public.billing_cena_okresu('warsztat_free', NULL, 'rok');
    v_zle := v_zle || E'\n  BLAD plan darmowy dal sie wycenic';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'PLAN_NIE_DO_KUPIENIA%' THEN v_ok := v_ok || E'\n  OK   plan darmowy odmawia'; ELSE RAISE; END IF; END;

  RAISE NOTICE '%', v_ok;
  IF v_zle <> '' THEN RAISE EXCEPTION '%', v_zle; END IF;
  RAISE NOTICE 'WSZYSTKIE SIEDEM PRZYPADKOW ZGODNYCH';
END $$;
ROLLBACK;
