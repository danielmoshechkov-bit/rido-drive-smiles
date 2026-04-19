
CREATE OR REPLACE FUNCTION public.sync_company_data_from_invoice_company()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  IF NEW.user_id IS NULL OR NEW.is_default IS NOT TRUE THEN RETURN NEW; END IF;
  UPDATE service_providers SET
    company_name = COALESCE(NULLIF(NEW.name,''), company_name),
    company_nip = COALESCE(NULLIF(NEW.nip,''), company_nip),
    company_address = COALESCE(NULLIF(TRIM(CONCAT(NEW.address_street,' ',NEW.address_building_number)),''), company_address),
    company_city = COALESCE(NULLIF(NEW.address_city,''), company_city),
    company_postal_code = COALESCE(NULLIF(NEW.address_postal_code,''), company_postal_code),
    company_phone = COALESCE(NULLIF(NEW.phone,''), company_phone),
    owner_email = COALESCE(NULLIF(NEW.email,''), owner_email),
    logo_url = COALESCE(NEW.logo_url, logo_url)
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_sync_company_from_invoice_company ON user_invoice_companies;
CREATE TRIGGER trg_sync_company_from_invoice_company
AFTER INSERT OR UPDATE OF name, nip, address_street, address_building_number, address_city, address_postal_code, phone, email, logo_url, is_default
ON user_invoice_companies FOR EACH ROW EXECUTE FUNCTION public.sync_company_data_from_invoice_company();

-- Jednorazowy fix: wymuś synchronizację dla wszystkich
UPDATE service_providers SET updated_at = now() WHERE user_id IS NOT NULL;
