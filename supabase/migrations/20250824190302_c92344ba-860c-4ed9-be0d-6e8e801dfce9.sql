-- Create import_jobs table
CREATE TABLE public.import_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users,
  city_id UUID REFERENCES public.cities,
  platform TEXT NOT NULL CHECK (platform IN ('uber', 'bolt', 'freenow')),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'error'))
);

-- Create rides_raw table
CREATE TABLE public.rides_raw (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  driver_platform_id TEXT,
  driver_id UUID REFERENCES public.drivers(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  city TEXT,
  trip_uuid TEXT NOT NULL,
  gross_amount NUMERIC(12,2) DEFAULT 0,
  commission_amount NUMERIC(12,2) DEFAULT 0,
  adjustments NUMERIC(12,2) DEFAULT 0,
  cash_collected NUMERIC(12,2) DEFAULT 0,
  extra JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(job_id, trip_uuid)
);

-- Create import_errors table
CREATE TABLE public.import_errors (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  row_no INTEGER,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  raw JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create settlements_weekly table
CREATE TABLE public.settlements_weekly (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id),
  platform TEXT NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  trips_count INTEGER DEFAULT 0,
  gross_sum NUMERIC(12,2) DEFAULT 0,
  commission_sum NUMERIC(12,2) DEFAULT 0,
  cash_sum NUMERIC(12,2) DEFAULT 0,
  adjustments_sum NUMERIC(12,2) DEFAULT 0,
  net_result NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create platform_import_config table
CREATE TABLE public.platform_import_config (
  platform TEXT PRIMARY KEY CHECK (platform IN ('uber', 'bolt', 'freenow')),
  columns JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default column mappings
INSERT INTO public.platform_import_config (platform, columns) VALUES
('uber', '{
  "driver_platform_id": "Driver ID",
  "trip_uuid": "Trip ID", 
  "started_at": "Trip Start Time",
  "completed_at": "Trip End Time",
  "city": "City",
  "gross_amount": "Fare",
  "commission_amount": "Uber Fee",
  "cash_collected": "Cash Collected",
  "adjustments": "Promotions"
}'),
('bolt', '{
  "driver_platform_id": "Driver ID",
  "trip_uuid": "Order ID",
  "started_at": "Order Time", 
  "completed_at": "Completion Time",
  "city": "City",
  "gross_amount": "Total Amount",
  "commission_amount": "Commission",
  "cash_collected": "Cash Payment",
  "adjustments": "Bonus"
}'),
('freenow', '{
  "driver_platform_id": "Driver ID",
  "trip_uuid": "Booking ID",
  "started_at": "Start Time",
  "completed_at": "End Time", 
  "city": "City",
  "gross_amount": "Gross Amount",
  "commission_amount": "Commission",
  "cash_collected": "Cash Amount",
  "adjustments": "Adjustments"
}');

-- Add indexes
CREATE INDEX idx_rides_raw_job_id ON public.rides_raw(job_id);
CREATE INDEX idx_rides_raw_driver_id ON public.rides_raw(driver_id);
CREATE INDEX idx_settlements_weekly_job_id ON public.settlements_weekly(job_id);
CREATE INDEX idx_settlements_weekly_week ON public.settlements_weekly(week_start, week_end);
CREATE INDEX idx_import_jobs_platform_week ON public.import_jobs(platform, week_start, week_end);

-- Enable RLS
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements_weekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_import_config ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admins can manage import jobs" ON public.import_jobs FOR ALL USING (true);
CREATE POLICY "Admins can manage rides raw" ON public.rides_raw FOR ALL USING (true);
CREATE POLICY "Admins can manage import errors" ON public.import_errors FOR ALL USING (true);
CREATE POLICY "Admins can manage settlements weekly" ON public.settlements_weekly FOR ALL USING (true);
CREATE POLICY "Admins can manage platform import config" ON public.platform_import_config FOR ALL USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_settlements_weekly_updated_at
  BEFORE UPDATE ON public.settlements_weekly
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_platform_import_config_updated_at
  BEFORE UPDATE ON public.platform_import_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();