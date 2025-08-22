-- Create cities table
CREATE TABLE public.cities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on cities
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

-- Create policy for cities (admins can manage all cities)
CREATE POLICY "Admins can manage cities" 
ON public.cities 
FOR ALL 
USING (true);

-- Create drivers table connected to cities
CREATE TABLE public.drivers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on drivers
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- Create policy for drivers
CREATE POLICY "Admins can manage drivers" 
ON public.drivers 
FOR ALL 
USING (true);

-- Create driver platform IDs table
CREATE TABLE public.driver_platform_ids (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('uber', 'bolt', 'freenow')),
  platform_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(driver_id, platform)
);

-- Enable RLS on driver platform IDs
ALTER TABLE public.driver_platform_ids ENABLE ROW LEVEL SECURITY;

-- Create policy for driver platform IDs
CREATE POLICY "Admins can manage platform IDs" 
ON public.driver_platform_ids 
FOR ALL 
USING (true);

-- Create settlements table
CREATE TABLE public.settlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('uber', 'bolt', 'freenow')),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  total_earnings DECIMAL(10,2),
  commission_amount DECIMAL(10,2),
  net_amount DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on settlements
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- Create policy for settlements
CREATE POLICY "Admins can manage settlements" 
ON public.settlements 
FOR ALL 
USING (true);

-- Create fuel cards table
CREATE TABLE public.fuel_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  card_number TEXT NOT NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on fuel cards
ALTER TABLE public.fuel_cards ENABLE ROW LEVEL SECURITY;

-- Create policy for fuel cards
CREATE POLICY "Admins can manage fuel cards" 
ON public.fuel_cards 
FOR ALL 
USING (true);

-- Create CSV imports history table
CREATE TABLE public.csv_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('uber', 'bolt', 'freenow', 'fuel_cards')),
  filename TEXT NOT NULL,
  records_count INTEGER,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on CSV imports
ALTER TABLE public.csv_imports ENABLE ROW LEVEL SECURITY;

-- Create policy for CSV imports
CREATE POLICY "Admins can view import history" 
ON public.csv_imports 
FOR ALL 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_cities_updated_at
  BEFORE UPDATE ON public.cities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settlements_updated_at
  BEFORE UPDATE ON public.settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fuel_cards_updated_at
  BEFORE UPDATE ON public.fuel_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default cities
INSERT INTO public.cities (name) VALUES 
  ('Warszawa'),
  ('Kraków'),
  ('Gdańsk'),
  ('Wrocław'),
  ('Poznań');