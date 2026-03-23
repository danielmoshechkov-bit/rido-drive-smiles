ALTER TABLE ksef_monitor_log 
  ADD COLUMN IF NOT EXISTS endpoint_checked text,
  ADD COLUMN IF NOT EXISTS change_detected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS response_code integer,
  ADD COLUMN IF NOT EXISTS version_detected text,
  ADD COLUMN IF NOT EXISTS notes text;