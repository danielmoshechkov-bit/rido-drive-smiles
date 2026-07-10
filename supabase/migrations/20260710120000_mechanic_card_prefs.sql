-- M1: preferencje karty mechanika (widoczność pól + język wydruku) per warsztat/user
ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS mechanic_card_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.workshop_settings.mechanic_card_prefs IS
  'Karta mechanika: { "visible_fields": { "client": true, "phone": true, "vin": true, "plate": true, "year": true, "vehicle": true, "mileage": true, "fuel": true, "tasks": true, "parts": true, "notes": true }, "print_lang": "pl" }';
