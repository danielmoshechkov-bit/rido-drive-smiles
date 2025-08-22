-- Create settlements table for storing weekly earnings data
CREATE TABLE IF NOT EXISTS public.settlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  total_earnings NUMERIC(10,2),
  commission_amount NUMERIC(10,2),
  net_amount NUMERIC(10,2),
  trips_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_driver_platform_week UNIQUE (driver_id, platform, week_start)
);

-- Enable RLS on settlements table
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for settlements
CREATE POLICY "Admins can manage settlements" 
ON public.settlements 
FOR ALL 
USING (true);

-- Create index for faster queries
CREATE INDEX idx_settlements_driver_week ON public.settlements(driver_id, week_start DESC);
CREATE INDEX idx_settlements_city_week ON public.settlements(city_id, week_start DESC);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_settlements_updated_at
BEFORE UPDATE ON public.settlements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();