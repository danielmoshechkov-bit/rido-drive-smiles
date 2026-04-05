CREATE TABLE IF NOT EXISTS translation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  listing_type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  description text,
  source_lang text DEFAULT 'pl',
  target_langs text[] DEFAULT ARRAY['en','ru','ua','de','vi','kz'],
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','failed')),
  attempts int DEFAULT 0,
  max_attempts int DEFAULT 3,
  error_msg text,
  priority int DEFAULT 5,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  source text DEFAULT 'manual'
);

CREATE INDEX idx_tq_status_priority 
  ON translation_queue(status, priority DESC, created_at ASC);
CREATE INDEX idx_tq_listing 
  ON translation_queue(listing_id);

ALTER TABLE translation_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all" ON translation_queue 
  FOR ALL USING (true);