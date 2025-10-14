-- Create settlement_periods table for tracking settlement periods
CREATE TABLE public.settlement_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  city_id uuid NOT NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  status text NOT NULL DEFAULT 'robocze',
  google_sheet_url text NOT NULL DEFAULT 'https://docs.google.com/spreadsheets/d/1gzBs58BH7c3bzY4l6WnDMOBRvjK3T1brF9ZYdIx5WRc/edit?rm=minimal',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.settlement_periods ENABLE ROW LEVEL SECURITY;

-- Create policy for admins
CREATE POLICY "Admins can manage settlement periods"
ON public.settlement_periods
FOR ALL
USING (true);

-- Add updated_at trigger
CREATE TRIGGER update_settlement_periods_updated_at
BEFORE UPDATE ON public.settlement_periods
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();