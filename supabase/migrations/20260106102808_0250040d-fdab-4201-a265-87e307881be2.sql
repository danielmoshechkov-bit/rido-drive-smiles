-- Create fleet settlement fees table
CREATE TABLE public.fleet_settlement_fees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fleet_id UUID NOT NULL REFERENCES public.fleets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  vat_rate NUMERIC NOT NULL DEFAULT 8,
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly', 'monthly')),
  type TEXT NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed', 'percent')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fleet_settlement_fees ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admins can manage all fleet fees" 
ON public.fleet_settlement_fees 
FOR ALL 
USING (has_role(auth.uid(), 'admin'));

-- Fleet managers can manage their own fleet fees
CREATE POLICY "Fleet managers can manage their fleet fees" 
ON public.fleet_settlement_fees 
FOR ALL 
USING (
  fleet_id IN (
    SELECT ur.fleet_id FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('fleet_settlement', 'fleet_rental')
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_fleet_settlement_fees_updated_at
BEFORE UPDATE ON public.fleet_settlement_fees
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();