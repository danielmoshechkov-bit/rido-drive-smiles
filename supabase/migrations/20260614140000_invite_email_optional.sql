-- Zaproszenie pracownika: email LUB telefon (wcześniej email był wymagany).
-- invited_email staje się opcjonalny, dochodzi invited_phone.
ALTER TABLE public.workshop_employee_invitations
  ALTER COLUMN invited_email DROP NOT NULL;

ALTER TABLE public.workshop_employee_invitations
  ADD COLUMN IF NOT EXISTS invited_phone text;

-- Co najmniej jeden kanał kontaktu musi być podany.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workshop_invitation_contact_present'
  ) THEN
    ALTER TABLE public.workshop_employee_invitations
      ADD CONSTRAINT workshop_invitation_contact_present
      CHECK (invited_email IS NOT NULL OR invited_phone IS NOT NULL) NOT VALID;
  END IF;
END $$;
