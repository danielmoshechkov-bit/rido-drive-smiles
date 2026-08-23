-- 4.7 — jednorazówki przez PayU: katalog produktów i zamówienia.
--
-- Podział zadań: **Stripe obsługuje subskrypcje, PayU jednorazówki.** PayU nie
-- ma w Polsce wygodnego modelu subskrypcyjnego, a Stripe nie obsługuje BLIK-a,
-- czyli sposobu, w jaki warsztat najchętniej zapłaci za pakiet SMS-ów.
--
-- Zakres tej migracji to SZYNY PŁATNICZE, nie pełny katalog z 4.11: tabela
-- produktów jest minimalna i celowo pusta. Wypełnia ją 4.11 razem z panelem
-- administratora.

-- ---------------------------------------------------------------------------
-- 1. Katalog produktów dokupowanych
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_addon_products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  name         text NOT NULL,
  -- Co klient dostaje: która funkcja i ile jednostek. `feature_id` wiąże
  -- produkt z pulą w `billing_addon_packs`, więc zużycie (4.10) nie musi
  -- wiedzieć nic o samym produkcie.
  feature_id   uuid NOT NULL REFERENCES public.billing_features(id) ON DELETE RESTRICT,
  amount       numeric(12,2) NOT NULL CHECK (amount > 0),
  -- Cena BRUTTO, bo tyle klient widzi i tyle płaci. Netto liczymy „w stu"
  -- przy fakturze, tak samo jak przy subskrypcjach.
  price_gross  numeric(10,2) NOT NULL CHECK (price_gross > 0),
  vat_rate     numeric(5,2) NOT NULL DEFAULT 23,
  -- NULL = paczka bezterminowa. SMS-y i sprawdzenia VIN nie przepadają,
  -- minuty Agenta owszem — stąd ważność per produkt, nie globalna.
  waznosc_dni  integer CHECK (waznosc_dni IS NULL OR waznosc_dni > 0),
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_addon_products ENABLE ROW LEVEL SECURITY;

-- Katalog jest publiczny — musi go zobaczyć niezalogowany na stronie z cenami.
DROP POLICY IF EXISTS billing_addon_products_public ON public.billing_addon_products;
CREATE POLICY billing_addon_products_public ON public.billing_addon_products
  FOR SELECT TO anon, authenticated USING (is_active = true);

REVOKE INSERT, UPDATE, DELETE ON public.billing_addon_products FROM anon, authenticated;
GRANT SELECT ON public.billing_addon_products TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Zamówienia jednorazowe
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_type  public.billing_subscriber_type NOT NULL,
  subscriber_id    uuid NOT NULL,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id       uuid NOT NULL REFERENCES public.billing_addon_products(id) ON DELETE RESTRICT,

  -- Kwota i zawartość ZAMROŻONE w chwili zakupu. Cennik wolno zmieniać;
  -- to, za co klient zapłacił, zmieniać się nie może — przy sporze rozstrzyga
  -- ten wiersz, nie bieżąca tabela produktów.
  amount_gross     numeric(10,2) NOT NULL CHECK (amount_gross > 0),
  currency         text NOT NULL DEFAULT 'PLN',
  snapshot         jsonb NOT NULL DEFAULT '{}'::jsonb,

  provider         public.billing_provider NOT NULL DEFAULT 'payu',
  provider_order_id text,
  status           text NOT NULL DEFAULT 'nowe'
                   CHECK (status IN ('nowe', 'oczekuje', 'oplacone', 'anulowane', 'odrzucone')),

  -- Kiedy paczka została wydana. NULL = jeszcze nie wydana. To pole, a nie
  -- sam status, chroni przed podwójnym wydaniem przy powtórnym powiadomieniu.
  wydane_at        timestamptz,
  pack_id          uuid REFERENCES public.billing_addon_packs(id) ON DELETE SET NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Identyfikator zamówienia u operatora musi być unikalny — po nim rozpoznajemy
-- powtórne powiadomienia. Indeks częściowy, bo zamówienie nowo utworzone go
-- jeszcze nie ma.
CREATE UNIQUE INDEX IF NOT EXISTS billing_orders_provider_order
  ON public.billing_orders (provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_orders_subscriber
  ON public.billing_orders (subscriber_type, subscriber_id, created_at DESC);

ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;

-- Klient widzi własne zamówienia — to jego historia zakupów. Pisze wyłącznie
-- `service_role`, czyli funkcje brzegowe; inaczej dałoby się sobie dopisać
-- opłacone zamówienie.
DROP POLICY IF EXISTS billing_orders_wlasne ON public.billing_orders;
CREATE POLICY billing_orders_wlasne ON public.billing_orders
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (subscriber_type = 'service_provider'
        AND subscriber_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  );

REVOKE INSERT, UPDATE, DELETE ON public.billing_orders FROM anon, authenticated;
GRANT SELECT ON public.billing_orders TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Powiązanie paczki z zamówieniem
-- ---------------------------------------------------------------------------
-- `billing_addon_packs.payment_id` wskazuje na starą tabelę `payments`.
-- Nie ruszamy jej — dokładamy własne powiązanie, żeby dało się dojść od paczki
-- do zamówienia, które za nią zapłaciło.
ALTER TABLE public.billing_addon_packs
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.billing_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS billing_addon_packs_order
  ON public.billing_addon_packs (order_id) WHERE order_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Wydanie paczki — idempotentne
-- ---------------------------------------------------------------------------
-- Powiadomienie od operatora potrafi przyjść kilka razy. Dwa razy wydany
-- pakiet to towar oddany za darmo, więc zabezpieczenie musi być w bazie,
-- a nie w kodzie funkcji brzegowej.
CREATE OR REPLACE FUNCTION public.billing_wydaj_paczke(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_zam    billing_orders%ROWTYPE;
  v_prod   billing_addon_products%ROWTYPE;
  v_pack   uuid;
  v_wygasa timestamptz;
BEGIN
  -- Blokada wiersza: dwa równoczesne powiadomienia nie wydadzą dwóch paczek.
  SELECT * INTO v_zam FROM billing_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_wydaj_paczke: nie ma zamówienia %', p_order_id;
  END IF;

  IF v_zam.wydane_at IS NOT NULL THEN
    RETURN v_zam.pack_id;   -- już wydane; to nie jest błąd
  END IF;

  IF v_zam.status <> 'oplacone' THEN
    RAISE EXCEPTION 'billing_wydaj_paczke: zamówienie % nie jest opłacone (%)', p_order_id, v_zam.status;
  END IF;

  SELECT * INTO v_prod FROM billing_addon_products WHERE id = v_zam.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_wydaj_paczke: nie ma produktu %', v_zam.product_id;
  END IF;

  IF v_prod.waznosc_dni IS NOT NULL THEN
    v_wygasa := now() + make_interval(days => v_prod.waznosc_dni);
  END IF;

  INSERT INTO billing_addon_packs (
    subscriber_type, subscriber_id, feature_id,
    amount_total, amount_remaining, expires_at, source, order_id, note)
  VALUES (
    v_zam.subscriber_type, v_zam.subscriber_id, v_prod.feature_id,
    v_prod.amount, v_prod.amount, v_wygasa, 'purchase', v_zam.id,
    'Zakup: ' || v_prod.name)
  RETURNING id INTO v_pack;

  UPDATE billing_orders
  SET wydane_at = now(), pack_id = v_pack, updated_at = now()
  WHERE id = p_order_id;

  RETURN v_pack;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_wydaj_paczke(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_wydaj_paczke(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Wpis bramki PayU
-- ---------------------------------------------------------------------------
-- Sam wiersz konfiguracyjny; sekrety idą do sekretów Supabase, nie tutaj.
INSERT INTO public.billing_gateways (provider, is_enabled, is_sandbox, supports_subscriptions, supports_one_time)
VALUES ('payu', false, true, false, true)
ON CONFLICT (provider) DO NOTHING;

NOTIFY pgrst, 'reload schema';
