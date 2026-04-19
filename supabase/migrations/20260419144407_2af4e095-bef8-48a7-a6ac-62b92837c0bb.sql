
CREATE OR REPLACE FUNCTION public.sync_company_data_from_provider()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_street TEXT;
  v_building TEXT;
  v_parts TEXT[];
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  v_parts := regexp_split_to_array(COALESCE(NEW.company_address,''), '\s+');
  IF array_length(v_parts,1) >= 2 AND v_parts[array_length(v_parts,1)] ~ '^\d' THEN
    v_building := v_parts[array_length(v_parts,1)];
    v_street := array_to_string(v_parts[1:array_length(v_parts,1)-1], ' ');
  ELSE
    v_street := COALESCE(NEW.company_address,'');
    v_building := '';
  END IF;

  INSERT INTO workshop_settings (user_id, firm_name, nip, address, city, postal_code, phone, email, website, logo_url, updated_at)
  VALUES (NEW.user_id, NEW.company_name, NEW.company_nip, NEW.company_address, NEW.company_city, NEW.company_postal_code, NEW.company_phone, NEW.owner_email, NEW.company_website, NEW.logo_url, now())
  ON CONFLICT (user_id) DO UPDATE SET
    firm_name = EXCLUDED.firm_name, nip = EXCLUDED.nip, address = EXCLUDED.address,
    city = EXCLUDED.city, postal_code = EXCLUDED.postal_code, phone = EXCLUDED.phone,
    email = EXCLUDED.email, website = EXCLUDED.website,
    logo_url = COALESCE(EXCLUDED.logo_url, workshop_settings.logo_url),
    updated_at = now();

  INSERT INTO company_settings (user_id, company_name, nip, address, city, postal_code, phone, email)
  VALUES (NEW.user_id, NEW.company_name, NEW.company_nip, NEW.company_address, NEW.company_city, NEW.company_postal_code, NEW.company_phone, NEW.owner_email)
  ON CONFLICT (user_id) DO UPDATE SET
    company_name = EXCLUDED.company_name, nip = EXCLUDED.nip, address = EXCLUDED.address,
    city = EXCLUDED.city, postal_code = EXCLUDED.postal_code, phone = EXCLUDED.phone,
    email = EXCLUDED.email, updated_at = now();

  UPDATE user_invoice_companies SET
    name = NEW.company_name, nip = NEW.company_nip,
    address_street = v_street, address_building_number = v_building,
    address_city = NEW.company_city, address_postal_code = NEW.company_postal_code,
    phone = NEW.company_phone, email = NEW.owner_email,
    logo_url = COALESCE(NEW.logo_url, logo_url), updated_at = now()
  WHERE user_id = NEW.user_id AND is_default = true;

  IF NOT FOUND THEN
    INSERT INTO user_invoice_companies (user_id, name, nip, address_street, address_building_number, address_city, address_postal_code, phone, email, logo_url, is_default)
    VALUES (NEW.user_id, NEW.company_name, NEW.company_nip, v_street, v_building, NEW.company_city, NEW.company_postal_code, NEW.company_phone, NEW.owner_email, NEW.logo_url, true);
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_sync_company_from_provider ON service_providers;
CREATE TRIGGER trg_sync_company_from_provider
AFTER INSERT OR UPDATE OF company_name, company_nip, company_address, company_city, company_postal_code, company_phone, owner_email, company_website, logo_url
ON service_providers
FOR EACH ROW EXECUTE FUNCTION public.sync_company_data_from_provider();
