-- Porzucone zamówienia wygasają, zamiast wisieć w „oczekuje".
--
-- POWÓD (z testu w sandboxie): klient otwiera stronę płatności i zamyka ją bez
-- płacenia. Zamówienie zostaje w stanie `oczekuje` na zawsze. Przy realnym
-- ruchu takich będzie sporo i przestanie dać się odróżnić awarię („zapłacił,
-- a pakietu nie ma") od zwykłej rezygnacji.
--
-- Rezygnacja to NIE to samo co odrzucenie przez operatora, dlatego osobny
-- status `porzucone` — inaczej w statystykach sprzedaży rezygnacje zlałyby się
-- z błędami płatności i nie dałoby się odpowiedzieć, ilu klientów odpadło na
-- bramce, a ilu się rozmyśliło.

ALTER TABLE public.billing_orders
  DROP CONSTRAINT IF EXISTS billing_orders_status_check;

ALTER TABLE public.billing_orders
  ADD CONSTRAINT billing_orders_status_check CHECK (status IN
    ('nowe', 'oczekuje', 'oplacone', 'anulowane', 'odrzucone', 'porzucone'));

CREATE OR REPLACE FUNCTION public.billing_wygas_porzucone(p_godzin integer DEFAULT 6)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ile integer;
BEGIN
  UPDATE billing_orders
  SET status = 'porzucone', updated_at = now()
  WHERE status IN ('nowe', 'oczekuje')
    -- Nigdy nie ruszamy zamówień, za które cokolwiek wydano. Gdyby taki
    -- wiersz istniał, znaczy to, że status się rozjechał — i wtedy trzeba
    -- go obejrzeć, a nie zamiatać.
    AND wydane_at IS NULL
    AND created_at < now() - make_interval(hours => p_godzin);

  GET DIAGNOSTICS v_ile = ROW_COUNT;
  IF v_ile > 0 THEN
    RAISE NOTICE 'billing_wygas_porzucone: oznaczono % zamówień', v_ile;
  END IF;
  RETURN v_ile;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_wygas_porzucone(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_wygas_porzucone(integer) TO service_role;

-- Sześć godzin, nie kilkanaście minut: BLIK potrafi czekać na potwierdzenie
-- w aplikacji banku, a przelew tradycyjny księguje się nawet następnego dnia.
-- Zbyt krótkie okno oznaczałoby oznaczanie jako porzucone czegoś, co jeszcze
-- się dzieje.
--
-- Oznaczenie NIE jest nieodwracalne: gdyby PayU przysłało spóźnione
-- `COMPLETED`, webhook przestawi status na `oplacone` i wyda pakiet normalnie.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('billing-zamowienia-porzucone')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-zamowienia-porzucone');

    PERFORM cron.schedule(
      'billing-zamowienia-porzucone',
      '10 * * * *',
      $cron$ SELECT public.billing_wygas_porzucone(6); $cron$
    );
  ELSE
    RAISE WARNING 'pg_cron niedostępny — billing_wygas_porzucone trzeba wołać z zewnątrz';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
