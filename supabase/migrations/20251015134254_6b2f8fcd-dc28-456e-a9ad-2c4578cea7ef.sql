-- Update default Google Sheet URL to include sharing parameter
ALTER TABLE settlement_periods 
ALTER COLUMN google_sheet_url 
SET DEFAULT 'https://docs.google.com/spreadsheets/d/1gzBs58BH7c3bzY4l6WnDMOBRvjK3T1brF9ZYdIx5WRc/edit?usp=sharing';