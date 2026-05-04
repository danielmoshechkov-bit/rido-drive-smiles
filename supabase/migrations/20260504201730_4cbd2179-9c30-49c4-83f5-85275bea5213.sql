
CREATE TABLE public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_percent NUMERIC NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_promo_codes_code ON public.promo_codes(code);

CREATE TABLE public.promo_code_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id UUID,
  discount_amount NUMERIC,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(promo_code_id, user_id)
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active promo codes via function"
  ON public.promo_codes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage promo codes insert"
  ON public.promo_codes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage promo codes update"
  ON public.promo_codes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage promo codes delete"
  ON public.promo_codes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users see own redemptions"
  ON public.promo_code_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own redemptions"
  ON public.promo_code_redemptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.validate_promo_code(_code TEXT)
RETURNS TABLE(id UUID, discount_percent NUMERIC, valid BOOLEAN, message TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pc RECORD;
BEGIN
  SELECT * INTO pc FROM public.promo_codes WHERE upper(code) = upper(_code) LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, 0::NUMERIC, false, 'Kod nie istnieje'; RETURN;
  END IF;
  IF NOT pc.is_active THEN
    RETURN QUERY SELECT pc.id, 0::NUMERIC, false, 'Kod nieaktywny'; RETURN;
  END IF;
  IF pc.valid_until IS NOT NULL AND pc.valid_until < now() THEN
    RETURN QUERY SELECT pc.id, 0::NUMERIC, false, 'Kod wygasł'; RETURN;
  END IF;
  IF pc.max_uses IS NOT NULL AND pc.used_count >= pc.max_uses THEN
    RETURN QUERY SELECT pc.id, 0::NUMERIC, false, 'Limit użyć wyczerpany'; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.promo_code_redemptions WHERE promo_code_id = pc.id AND user_id = auth.uid()) THEN
    RETURN QUERY SELECT pc.id, 0::NUMERIC, false, 'Kod już użyty przez Ciebie'; RETURN;
  END IF;
  RETURN QUERY SELECT pc.id, pc.discount_percent, true, 'OK';
END;
$$;

CREATE TRIGGER trg_promo_codes_updated
  BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
