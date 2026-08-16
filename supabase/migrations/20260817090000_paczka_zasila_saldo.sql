-- Wydana paczka zasila saldo, z którego klient naprawdę wydaje.
--
-- PROBLEM: po zakupie przez PayU powstaje wiersz w `billing_addon_packs`, ale
-- `service_providers.sms_balance` się nie zmienia — a to JEGO sprawdza bramka
-- wysyłki (`workshop-send-sms`) i to ON widnieje na pasku. Klient kupiłby
-- 500 SMS-ów, zobaczył stary licznik i nie mógł nic wysłać.
--
-- ROZWAŻANA I ODRZUCONA ALTERNATYWA: pokazywać na pasku sumę
-- „pula planu + paczki − zużycie". Licznik pokazywałby wtedy SMS-y, których
-- NIE DA SIĘ WYSŁAĆ, bo odjęcie idzie ze starego salda. Klient widzi 500
-- i dostaje „Brak pakietu SMS" — gorzej niż stary, zaniżony licznik.
--
-- Stan docelowy (4.10) to `billing_consume`: pula planu → paczki FIFO →
-- nadwyżka, a saldo staje się wyliczane. Do tego czasu paczka jest ZAPISEM
-- ZAKUPU, a starym saldem się wydaje. Kolumna `odzwierciedlone_at` mówi
-- wprost, że dana paczka została już policzona w starym saldzie — bez niej
-- migracja do 4.10 policzyłaby te jednostki drugi raz.

ALTER TABLE public.billing_addon_packs
  ADD COLUMN IF NOT EXISTS odzwierciedlone_at timestamptz;

COMMENT ON COLUMN public.billing_addon_packs.odzwierciedlone_at IS
  'Kiedy jednostki z tej paczki dopisano do starego salda (sms_balance / '
  'vehicle_lookup_credits). Przy przejściu na billing_consume (4.10) paczki '
  'z tym znacznikiem są JUŻ policzone — nie wolno dodać ich ponownie.';

CREATE OR REPLACE FUNCTION public.billing_wydaj_paczke(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_zam    billing_orders%ROWTYPE;
  v_prod   billing_addon_products%ROWTYPE;
  v_klucz  text;
  v_pack   uuid;
  v_wygasa timestamptz;
BEGIN
  SELECT * INTO v_zam FROM billing_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_wydaj_paczke: nie ma zamówienia %', p_order_id;
  END IF;

  IF v_zam.wydane_at IS NOT NULL THEN
    RETURN v_zam.pack_id;
  END IF;

  IF v_zam.status <> 'oplacone' THEN
    RAISE EXCEPTION 'billing_wydaj_paczke: zamówienie % nie jest opłacone (%)', p_order_id, v_zam.status;
  END IF;

  SELECT * INTO v_prod FROM billing_addon_products WHERE id = v_zam.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_wydaj_paczke: nie ma produktu %', v_zam.product_id;
  END IF;

  SELECT key INTO v_klucz FROM billing_features WHERE id = v_prod.feature_id;

  IF v_prod.waznosc_dni IS NOT NULL THEN
    v_wygasa := now() + make_interval(days => v_prod.waznosc_dni);
  END IF;

  INSERT INTO billing_addon_packs (
    subscriber_type, subscriber_id, feature_id,
    amount_total, amount_remaining, expires_at, source, order_id, note)
  VALUES (
    v_zam.subscriber_type, v_zam.subscriber_id, v_prod.feature_id,
    v_zam.units, v_zam.units, v_wygasa, 'purchase', v_zam.id,
    'Doładowanie: ' || v_zam.units || ' × ' || v_prod.name)
  RETURNING id INTO v_pack;

  -- ── Zasilenie salda, z którego realnie się wydaje ────────────────
  -- Wszystko w TEJ SAMEJ transakcji co wydanie paczki: nie może powstać stan,
  -- w którym paczka istnieje, a saldo jej nie widzi.
  IF v_klucz = 'sms' AND v_zam.subscriber_type = 'service_provider' THEN
    PERFORM public.grant_sms_credits(
      v_zam.subscriber_id, v_zam.units::integer, 'zakup', NULL,
      'Doładowanie PayU, zamówienie ' || v_zam.id);
    UPDATE billing_addon_packs SET odzwierciedlone_at = now() WHERE id = v_pack;

  ELSIF v_klucz = 'vehicle_lookup' AND v_zam.user_id IS NOT NULL THEN
    INSERT INTO vehicle_lookup_credits (user_id, remaining_credits, total_credits_purchased)
    VALUES (v_zam.user_id, v_zam.units::integer, v_zam.units::integer)
    ON CONFLICT (user_id) DO UPDATE
      SET remaining_credits       = vehicle_lookup_credits.remaining_credits + EXCLUDED.remaining_credits,
          total_credits_purchased = COALESCE(vehicle_lookup_credits.total_credits_purchased, 0)
                                    + EXCLUDED.total_credits_purchased;

    INSERT INTO vehicle_lookup_credit_transactions (user_id, type, credits, source, note)
    VALUES (v_zam.user_id, 'purchase', v_zam.units::integer, 'payment',
            'Doładowanie PayU, zamówienie ' || v_zam.id);

    UPDATE billing_addon_packs SET odzwierciedlone_at = now() WHERE id = v_pack;

  ELSE
    -- Produkt, dla którego nie ma jeszcze starego salda (np. minuty Agenta).
    -- Paczka zostaje, ale nikt jej nie zobaczy do czasu 4.10 — mówimy o tym
    -- głośno, zamiast zostawiać ciszę.
    RAISE WARNING 'billing_wydaj_paczke: brak starego salda dla klucza % — paczka % czeka na 4.10',
                  COALESCE(v_klucz, '?'), v_pack;
  END IF;

  UPDATE billing_orders
  SET wydane_at = now(), pack_id = v_pack, updated_at = now()
  WHERE id = p_order_id;

  RETURN v_pack;
END;
$$;

NOTIFY pgrst, 'reload schema';
