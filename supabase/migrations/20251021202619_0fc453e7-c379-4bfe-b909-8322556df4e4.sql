-- Fix settlements table constraint to allow 'main' platform
ALTER TABLE settlements 
DROP CONSTRAINT IF EXISTS settlements_platform_check;

ALTER TABLE settlements 
ADD CONSTRAINT settlements_platform_check 
CHECK (platform = ANY (ARRAY['uber'::text, 'bolt'::text, 'freenow'::text, 'main'::text]));