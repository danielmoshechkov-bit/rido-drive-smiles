-- Create driver_settlements table for individual driver settlements
CREATE TABLE public.driver_settlements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id uuid NOT NULL,
  job_id uuid NOT NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  bezgotowka numeric NOT NULL DEFAULT 0,
  gotowka numeric NOT NULL DEFAULT 0,
  przychod_laczny numeric NOT NULL DEFAULT 0,
  wyplata numeric NOT NULL DEFAULT 0,
  platform text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_settlements ENABLE ROW LEVEL SECURITY;

-- Create policy for admins
CREATE POLICY "Admins can manage driver settlements" 
ON public.driver_settlements 
FOR ALL 
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_driver_settlements_updated_at
BEFORE UPDATE ON public.driver_settlements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();