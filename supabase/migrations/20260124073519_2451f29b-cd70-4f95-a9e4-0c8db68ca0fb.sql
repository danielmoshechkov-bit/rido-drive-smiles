-- Create driver_fleet_relations table for multi-fleet support
CREATE TABLE public.driver_fleet_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES public.drivers(id) ON DELETE CASCADE NOT NULL,
  fleet_id uuid REFERENCES public.fleets(id) ON DELETE CASCADE NOT NULL,
  relation_type text NOT NULL CHECK (relation_type IN ('rental', 'settlement', 'both')),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE (driver_id, fleet_id, relation_type)
);

-- Enable RLS
ALTER TABLE public.driver_fleet_relations ENABLE ROW LEVEL SECURITY;

-- RLS policies - allow authenticated users to read/write their own relations
CREATE POLICY "Users can view fleet relations"
ON public.driver_fleet_relations FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can manage fleet relations"
ON public.driver_fleet_relations FOR ALL
TO authenticated
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_driver_fleet_relations_driver ON public.driver_fleet_relations(driver_id);
CREATE INDEX idx_driver_fleet_relations_fleet ON public.driver_fleet_relations(fleet_id);
CREATE INDEX idx_driver_fleet_relations_type ON public.driver_fleet_relations(relation_type);