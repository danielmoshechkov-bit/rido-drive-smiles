-- Warsztat: sterowanie tym, co klient widzi na stronie z linku (rozbicie kwot
-- wyceny). Trzy flagi w workshop_settings (per user_id), domyślnie TRUE = pokazuj.
-- Odczytywane przez src/pages/WorkshopClientCard.tsx, ustawiane w
-- src/components/workshop/WorkshopSettingsPage.tsx.

ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS show_client_net   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_client_vat   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_client_gross BOOLEAN NOT NULL DEFAULT true;
