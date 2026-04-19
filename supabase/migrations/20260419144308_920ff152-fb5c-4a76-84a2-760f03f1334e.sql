
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workshop_settings_user_id_uniq') THEN
    DELETE FROM workshop_settings a USING workshop_settings b
      WHERE a.user_id = b.user_id AND a.ctid < b.ctid;
    ALTER TABLE workshop_settings ADD CONSTRAINT workshop_settings_user_id_uniq UNIQUE (user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_user_id_uniq') THEN
    DELETE FROM company_settings a USING company_settings b
      WHERE a.user_id = b.user_id AND a.ctid < b.ctid;
    ALTER TABLE company_settings ADD CONSTRAINT company_settings_user_id_uniq UNIQUE (user_id);
  END IF;
END $$;
