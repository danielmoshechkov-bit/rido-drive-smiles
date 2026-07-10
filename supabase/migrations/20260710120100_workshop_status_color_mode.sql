-- M2: tryb kolorów statusów zleceń per provider (Zalecane / Ręczne)
ALTER TABLE public.workshop_status_settings
  ADD COLUMN IF NOT EXISTS color_mode text NOT NULL DEFAULT 'recommended';

ALTER TABLE public.workshop_status_settings
  DROP CONSTRAINT IF EXISTS workshop_status_settings_color_mode_check;

ALTER TABLE public.workshop_status_settings
  ADD CONSTRAINT workshop_status_settings_color_mode_check
  CHECK (color_mode IN ('recommended', 'custom'));

COMMENT ON COLUMN public.workshop_status_settings.color_mode IS
  'recommended = paleta domyślna (Zalecane), custom = kolory hex z workshop_order_statuses.color (Ręczne)';
