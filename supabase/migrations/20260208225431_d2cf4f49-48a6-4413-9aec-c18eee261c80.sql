-- Add transfer title template column to fleets table
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS transfer_title_template TEXT;