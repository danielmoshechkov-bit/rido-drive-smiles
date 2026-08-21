-- Wariant A, krok 3 z 3: każdy warsztat z właścicielem dostaje wiersz
-- w `billing_subscriptions`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WYMAGANIE NACZELNE: NIKOMU NIC SIĘ NIE ZMIENIA
-- ═══════════════════════════════════════════════════════════════════════════
-- Ta migracja PRZEPISUJE stan, nie nadaje go. Nikt nie może przez nią zyskać
-- dnia okresu próbnego ani go stracić. Nie jest to deklaracja — na końcu stoi
-- kontrola, która porównuje `moze_pracowac` DLA KAŻDEGO warsztatu przed i po,
-- i przerywa migrację przy pierwszej różnicy.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ODWZOROWANIE STANU
-- ═══════════════════════════════════════════════════════════════════════════
--   • ważny okres próbny w `paid_service_subscriptions`
--       → `trialing` z TĄ SAMĄ datą końca,
--   • okres próbny, który już minął
--       → `trialing` z prawdziwą datą z przeszłości. Po kroku 1 `moze_pracowac`
--         zwraca dla takiego wiersza fałsz, czyli dokładnie tyle, ile dziś daje
--         gałąź zapasowa. Zapisujemy KIEDY się skończył, zamiast zacierać to
--         statusem `expired` — dzięki temu tryb dokończenia będzie miał jedną
--         regułę dla wszystkich, nowych i przepisanych.
--   • okres próbny bez daty (wiersze sprzed wprowadzenia terminów)
--       → `trialing` bez daty. Bezterminowy, tak jak dziś. Zmiana warunków
--         wstecz byłaby nieuczciwa.
--   • brak jakiegokolwiek okresu próbnego
--       → `expired` bez dat. Dziś taki warsztat nie ma dostępu i po migracji
--         też nie ma. Nie zakładamy mu okresu próbnego, którego nigdy nie dostał.
--
-- Warsztatów BEZ `user_id` nie ruszamy — to konta demonstracyjne z 24 stycznia,
-- bez właściciela i bez zleceń. Nie mają komu dawać dostępu. Osobny dług.
--
-- Liczb nie zaszywam. Wszystko liczy się w chwili wykonania.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Zapis do cofnięcia
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wariant_a_uzupelnienie (
  subscription_id uuid PRIMARY KEY,
  provider_id     uuid NOT NULL,
  status_nadany   text NOT NULL,
  trial_ends_at   timestamptz,
  zrodlo          text NOT NULL,
  wykonano_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wariant_a_uzupelnienie IS
  'Wiersze billing_subscriptions założone wariantem A. Cofnięcie: '
  'DELETE FROM billing_subscriptions WHERE id IN (SELECT subscription_id FROM wariant_a_uzupelnienie);';

-- ---------------------------------------------------------------------------
-- 2. Stan przed — dla każdego warsztatu z właścicielem
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _przed ON COMMIT DROP AS
SELECT sp.id AS provider_id,
       public.moze_pracowac(sp.id, 'warsztat') AS mogl_pracowac
FROM public.service_providers sp
WHERE sp.user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Co komu przypisujemy
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _plan ON COMMIT DROP AS
WITH probny AS (
  -- Najnowszy okres próbny właściciela. Bez filtra po `metadata->>module` —
  -- tak samo, jak czyta go dziś `moze_pracowac`. Filtr rozjechałby przepisanie
  -- ze stanem faktycznym.
  SELECT DISTINCT ON (ps.user_id)
         ps.user_id, ps.expires_at, ps.created_at
  FROM public.paid_service_subscriptions ps
  WHERE ps.status = 'trial'
  ORDER BY ps.user_id, ps.created_at DESC
)
SELECT
  sp.id AS provider_id,
  CASE WHEN pr.user_id IS NULL THEN 'expired' ELSE 'trialing' END AS status_nadany,
  pr.expires_at AS trial_ends_at,
  CASE
    WHEN pr.user_id IS NULL             THEN 'brak okresu probnego'
    WHEN pr.expires_at IS NULL          THEN 'okres probny bez daty'
    WHEN pr.expires_at > now()          THEN 'okres probny trwa'
    ELSE                                     'okres probny minal'
  END AS zrodlo
FROM public.service_providers sp
LEFT JOIN probny pr ON pr.user_id = sp.user_id
WHERE sp.user_id IS NOT NULL
  -- Tylko ci, którzy wiersza w linii warsztatowej jeszcze nie mają. Istniejących
  -- nie dotykamy w ogóle: mogą pochodzić z prawdziwego zakupu.
  AND NOT EXISTS (
    SELECT 1 FROM public.billing_subscriptions s
    WHERE s.subscriber_type = 'service_provider'
      AND s.subscriber_id = sp.id
      AND s.product_line = 'warsztat'
  );

-- ---------------------------------------------------------------------------
-- 4. Założenie wierszy
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_plan uuid; v_ile integer;
BEGIN
  SELECT id INTO v_plan FROM billing_plans WHERE code = 'trial_warsztat';
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'brak planu trial_warsztat — najpierw krok 2';
  END IF;

  WITH nowe AS (
    INSERT INTO billing_subscriptions
      (subscriber_type, subscriber_id, plan_id, status,
       current_period_start, current_period_end, trial_ends_at, price_snapshot)
    SELECT 'service_provider', p.provider_id, v_plan, p.status_nadany::billing_subscription_status,
           now(), p.trial_ends_at, p.trial_ends_at,
           jsonb_build_object('zrodlo', 'wariant_a', 'opis', p.zrodlo)
    FROM _plan p
    RETURNING id, subscriber_id, status, trial_ends_at
  )
  INSERT INTO public.wariant_a_uzupelnienie
    (subscription_id, provider_id, status_nadany, trial_ends_at, zrodlo)
  SELECT n.id, n.subscriber_id, n.status::text, n.trial_ends_at, p.zrodlo
  FROM nowe n JOIN _plan p ON p.provider_id = n.subscriber_id;

  GET DIAGNOSTICS v_ile = ROW_COUNT;
  RAISE NOTICE 'wariant A: zalozono % wierszy', v_ile;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Kontrola — dostęp ma być IDENTYCZNY jak przed migracją
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_zmienione text; v_ile integer;
BEGIN
  SELECT string_agg(sp.company_name || ' (' || p.mogl_pracowac || ' -> '
                    || public.moze_pracowac(sp.id, 'warsztat') || ')', E'\n  '),
         count(*)
    INTO v_zmienione, v_ile
  FROM _przed p
  JOIN public.service_providers sp ON sp.id = p.provider_id
  WHERE p.mogl_pracowac IS DISTINCT FROM public.moze_pracowac(sp.id, 'warsztat');

  IF v_ile > 0 THEN
    RAISE EXCEPTION E'Migracja ZMIENILA dostep % warsztatom — wycofuje calosc:\n  %', v_ile, v_zmienione;
  END IF;

  RAISE NOTICE 'kontrola: dostep bez zmian dla wszystkich % warsztatow z wlascicielem',
    (SELECT count(*) FROM _przed);
END $$;

-- ---------------------------------------------------------------------------
-- 6. Podsumowanie — stan liczony TERAZ, nie zapamiętany
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT zrodlo, count(*) AS ile FROM public.wariant_a_uzupelnienie
    WHERE wykonano_at > now() - interval '1 minute'
    GROUP BY zrodlo ORDER BY zrodlo
  LOOP
    RAISE NOTICE '  % : %', rpad(r.zrodlo, 24), r.ile;
  END LOOP;

  RAISE NOTICE 'warsztatow bez wlasciciela (nietkniete, dlug do wyczyszczenia): %',
    (SELECT count(*) FROM service_providers WHERE user_id IS NULL);
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
