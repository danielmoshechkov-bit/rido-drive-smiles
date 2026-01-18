-- Add missing columns to maps_config for data sources and style overrides
ALTER TABLE public.maps_config 
ADD COLUMN IF NOT EXISTS data_sources JSONB DEFAULT '{
  "osm_poi": true,
  "partner_poi": true,
  "overpass_incidents": true,
  "community_reports": true,
  "static_hazards": true,
  "fleet_live": false
}'::jsonb,
ADD COLUMN IF NOT EXISTS style_overrides_light JSONB DEFAULT '{
  "background": "#F9F7FF",
  "roadsMinor": "#E5E0F5",
  "roadsMajor": "#D0C8E8",
  "buildings": "#EDE8F5",
  "parks": "#D4E8D4",
  "water": "#C5D8F0",
  "boundaries": "#BFBFBF",
  "labels": "#1A103D",
  "routeMain": "#7c3aed",
  "routeAlt": "#a78bfa"
}'::jsonb,
ADD COLUMN IF NOT EXISTS style_overrides_dark JSONB DEFAULT '{
  "background": "#0f0a1a",
  "roadsMinor": "#2D2640",
  "roadsMajor": "#3D3560",
  "buildings": "#1F1A30",
  "parks": "#1A2E1A",
  "water": "#0A1525",
  "boundaries": "#4A4A4A",
  "labels": "#f8fafc",
  "routeMain": "#8b5cf6",
  "routeAlt": "#a78bfa"
}'::jsonb;

-- Add map_user_reputation table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.map_user_reputation (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  reports_approved INT NOT NULL DEFAULT 0,
  reports_rejected INT NOT NULL DEFAULT 0,
  votes_received INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.map_user_reputation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own reputation" ON public.map_user_reputation;
CREATE POLICY "Users can view their own reputation"
  ON public.map_user_reputation FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can update reputation" ON public.map_user_reputation;
CREATE POLICY "System can update reputation"
  ON public.map_user_reputation FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

-- Create trigger for updated_at if not exists
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS set_map_user_reputation_updated_at ON public.map_user_reputation;
CREATE TRIGGER set_map_user_reputation_updated_at
  BEFORE UPDATE ON public.map_user_reputation
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();