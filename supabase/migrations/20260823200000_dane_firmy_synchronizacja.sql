-- Dane firmy (nazwa, NIP, adres, konto) leza w DWOCH tabelach: `entities`
-- i `company_settings`. Nic ich nie łączyło, wiec ekran ktory zapisuje do
-- jednej zostawial druga nieaktualna. Na produkcji rozjechaly sie wszystkie
-- trzy konta, ktore maja oba wpisy — lacznie z roznym NIP-em, a NIP trafia
-- na fakture.
--
-- Zasada: mirrorujemy WYLACZNIE te kolumny, ktore wlasnie sie zmienily.
-- Nie robimy masowego nadpisania i nie zgadujemy, ktora strona ma racje —
-- istniejace rozbieznosci zostaja do recznego rozstrzygniecia, bo automat
-- wybralby zle rownie czesto co dobrze.

CREATE OR REPLACE FUNCTION public.synchronizuj_firme_do_ustawien()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Zapis wywolany przez blizniaczy trigger — nie odbijamy pilki w kolko.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.owner_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE company_settings cs SET
    company_name         = CASE WHEN NEW.name IS DISTINCT FROM OLD.name THEN NEW.name ELSE cs.company_name END,
    nip                  = CASE WHEN NEW.nip IS DISTINCT FROM OLD.nip THEN NEW.nip ELSE cs.nip END,
    regon                = CASE WHEN NEW.regon IS DISTINCT FROM OLD.regon THEN NEW.regon ELSE cs.regon END,
    street               = CASE WHEN NEW.address_street IS DISTINCT FROM OLD.address_street THEN NEW.address_street ELSE cs.street END,
    city                 = CASE WHEN NEW.address_city IS DISTINCT FROM OLD.address_city THEN NEW.address_city ELSE cs.city END,
    postal_code          = CASE WHEN NEW.address_postal_code IS DISTINCT FROM OLD.address_postal_code THEN NEW.address_postal_code ELSE cs.postal_code END,
    email                = CASE WHEN NEW.email IS DISTINCT FROM OLD.email THEN NEW.email ELSE cs.email END,
    phone                = CASE WHEN NEW.phone IS DISTINCT FROM OLD.phone THEN NEW.phone ELSE cs.phone END,
    bank_name            = CASE WHEN NEW.bank_name IS DISTINCT FROM OLD.bank_name THEN NEW.bank_name ELSE cs.bank_name END,
    bank_account         = CASE WHEN NEW.bank_account IS DISTINCT FROM OLD.bank_account THEN NEW.bank_account ELSE cs.bank_account END,
    vat_exemption_basis  = CASE WHEN NEW.vat_exemption_basis IS DISTINCT FROM OLD.vat_exemption_basis THEN NEW.vat_exemption_basis ELSE cs.vat_exemption_basis END,
    updated_at           = now()
  WHERE cs.user_id = NEW.owner_user_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.synchronizuj_ustawienia_do_firmy()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ile integer;
  v_id  uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Uzytkownik moze miec kilka firm. Wtedy nie wiadomo, ktorej dotyczy zmiana
  -- w ustawieniach — a zle zgadniecie podmienia NIP na fakturach cudzej firmy.
  -- W takiej sytuacji nie robimy nic.
  SELECT count(*) INTO v_ile
  FROM entities WHERE owner_user_id = NEW.user_id AND coalesce(is_active, true);

  IF v_ile <> 1 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_id
  FROM entities WHERE owner_user_id = NEW.user_id AND coalesce(is_active, true);

  UPDATE entities e SET
    name                 = CASE WHEN NEW.company_name IS DISTINCT FROM OLD.company_name THEN NEW.company_name ELSE e.name END,
    nip                  = CASE WHEN NEW.nip IS DISTINCT FROM OLD.nip THEN NEW.nip ELSE e.nip END,
    regon                = CASE WHEN NEW.regon IS DISTINCT FROM OLD.regon THEN NEW.regon ELSE e.regon END,
    address_street       = CASE WHEN NEW.street IS DISTINCT FROM OLD.street THEN NEW.street ELSE e.address_street END,
    address_city         = CASE WHEN NEW.city IS DISTINCT FROM OLD.city THEN NEW.city ELSE e.address_city END,
    address_postal_code  = CASE WHEN NEW.postal_code IS DISTINCT FROM OLD.postal_code THEN NEW.postal_code ELSE e.address_postal_code END,
    email                = CASE WHEN NEW.email IS DISTINCT FROM OLD.email THEN NEW.email ELSE e.email END,
    phone                = CASE WHEN NEW.phone IS DISTINCT FROM OLD.phone THEN NEW.phone ELSE e.phone END,
    bank_name            = CASE WHEN NEW.bank_name IS DISTINCT FROM OLD.bank_name THEN NEW.bank_name ELSE e.bank_name END,
    bank_account         = CASE WHEN NEW.bank_account IS DISTINCT FROM OLD.bank_account THEN NEW.bank_account ELSE e.bank_account END,
    vat_exemption_basis  = CASE WHEN NEW.vat_exemption_basis IS DISTINCT FROM OLD.vat_exemption_basis THEN NEW.vat_exemption_basis ELSE e.vat_exemption_basis END,
    updated_at           = now()
  WHERE e.id = v_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_firma_do_ustawien ON public.entities;
CREATE TRIGGER trg_firma_do_ustawien
  AFTER UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.synchronizuj_firme_do_ustawien();

DROP TRIGGER IF EXISTS trg_ustawienia_do_firmy ON public.company_settings;
CREATE TRIGGER trg_ustawienia_do_firmy
  AFTER UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.synchronizuj_ustawienia_do_firmy();
