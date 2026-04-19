
CREATE OR REPLACE FUNCTION public.sync_company_data_from_workshop()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  UPDATE service_providers SET
    company_name = COALESCE(NULLIF(NEW.firm_name,''), company_name),
    company_nip = COALESCE(NULLIF(NEW.nip,''), company_nip),
    company_address = COALESCE(NULLIF(NEW.address,''), company_address),
    company_city = COALESCE(NULLIF(NEW.city,''), company_city),
    company_postal_code = COALESCE(NULLIF(NEW.postal_code,''), company_postal_code),
    company_phone = COALESCE(NULLIF(NEW.phone,''), company_phone),
    owner_email = COALESCE(NULLIF(NEW.email,''), owner_email),
    company_website = COALESCE(NULLIF(NEW.website,''), company_website),
    logo_url = COALESCE(NEW.logo_url, logo_url)
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_sync_company_from_workshop ON workshop_settings;
CREATE TRIGGER trg_sync_company_from_workshop
AFTER INSERT OR UPDATE OF firm_name, nip, address, city, postal_code, phone, email, website, logo_url
ON workshop_settings FOR EACH ROW EXECUTE FUNCTION public.sync_company_data_from_workshop();
