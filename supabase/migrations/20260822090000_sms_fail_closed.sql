-- 🔴 SMS-y wychodziły ZA DARMO, gdy zużycie zostało odrzucone.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO SIĘ DZIAŁO
-- ═══════════════════════════════════════════════════════════════════════════
-- `deduct_sms_credit` wołała `billing_consume`, a przy odmowie robiła
-- `RAISE WARNING`. Ostrzeżenie w PostgreSQL NIE JEST błędem — nie przerywa
-- funkcji i nie wraca do wywołującego jako `error`. Funkcja brzegowa
-- sprawdzała `decrError`, dostawała `null` i uznawała pobranie za udane.
--
-- Do tego wiersz księgi zapisywał się BEZWARUNKOWO, także przy odmowie.
-- Stąd w księdze seria wpisów „wyslanie" z opisem `z_puli=0 z_paczek=0
-- nadwyzka=0`: wiadomość poszła, księga zapisała minus jeden, a żadna paczka
-- nie została ruszona.
--
-- Dwie zmiany, obie fail-closed:
--
--  1. ODMOWA JEST WYJĄTKIEM, nie ostrzeżeniem. Wywołujący dostaje błąd
--     i ma jak przerwać wysyłkę.
--  2. WIERSZ KSIĘGI POWSTAJE TYLKO PRZY UDANYM POBRANIU. Zapis „zeszło −1”
--     przy nietkniętej paczce to nieprawda w rejestrze, który ma odpowiadać
--     na pytanie „skąd to saldo".
--
-- Sama kolejność „najpierw pobierz, potem wyślij" jest po stronie funkcji
-- brzegowych — bez niej ta zmiana tylko zgłasza problem po fakcie.

BEGIN;

CREATE OR REPLACE FUNCTION public.deduct_sms_credit(p_provider_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_wynik jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM service_providers WHERE id = p_provider_id) THEN
    -- Też wyjątek, nie ostrzeżenie: nieznany warsztat znaczy, że nie wiemy,
    -- komu policzyć wiadomość — a wtedy jej nie wysyłamy.
    RAISE EXCEPTION 'deduct_sms_credit: % nie jest warsztatem', p_provider_id;
  END IF;

  v_wynik := public.billing_consume('service_provider', p_provider_id, 'sms', 1);

  IF COALESCE((v_wynik ->> 'ok')::boolean, false) = false THEN
    -- WYJĄTEK, nie RAISE WARNING. Ostrzeżenie nie wracało do funkcji brzegowej,
    -- więc wysyłka szła dalej mimo odmowy.
    RAISE EXCEPTION 'BRAK_SMS: zużycie odrzucone dla % — %',
      p_provider_id, COALESCE(v_wynik ->> 'reason', 'nieznany powód');
  END IF;

  -- Księga dopiero TERAZ — po potwierdzonym pobraniu.
  INSERT INTO sms_credit_ledger (provider_id, delta, powod, opis)
  VALUES (p_provider_id, -1, 'wyslanie',
          'z_puli=' || COALESCE(v_wynik ->> 'z_puli', '0') ||
          ' z_paczek=' || COALESCE(v_wynik ->> 'z_paczek', '0') ||
          ' nadwyzka=' || COALESCE(v_wynik ->> 'nadwyzka', '0'));
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_sms_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_sms_credit(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Zwrot jednostki, gdy wysyłka padnie PO pobraniu
-- ---------------------------------------------------------------------------
-- Przy kolejności „najpierw pobierz, potem wyślij" trzeba umieć oddać jednostkę,
-- gdy operator SMS odmówi. Osobna funkcja, żeby funkcja brzegowa nie musiała
-- wołać `grant_sms_credits` z powodem „korekta" i zgadywać parametrów.
CREATE OR REPLACE FUNCTION public.zwroc_sms_credit(p_provider_id uuid, p_powod text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sms uuid;
BEGIN
  SELECT id INTO v_sms FROM billing_features WHERE key = 'sms';
  IF v_sms IS NULL THEN
    RAISE WARNING 'zwroc_sms_credit: brak cechy sms — jednostka NIEZWRÓCONA';
    RETURN;
  END IF;

  -- Zwrot jako osobna paczka bezterminowa. Świadomie nie „odkręcamy" paczki,
  -- z której zeszło: przy zużyciu z kilku paczek nie da się tego odtworzyć,
  -- a jedna jednostka więcej w nowej paczce jest równoważna dla klienta
  -- i zostawia czytelny ślad.
  INSERT INTO billing_addon_packs
    (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
     expires_at, source, note)
  VALUES ('service_provider', p_provider_id, v_sms, 1, 1, NULL, 'compensation',
          COALESCE(p_powod, 'Zwrot za nieudaną wysyłkę SMS'));

  INSERT INTO sms_credit_ledger (provider_id, delta, powod, opis)
  VALUES (p_provider_id, 1, 'korekta', COALESCE(p_powod, 'Zwrot za nieudaną wysyłkę SMS'));
END;
$$;

REVOKE ALL ON FUNCTION public.zwroc_sms_credit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zwroc_sms_credit(uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
