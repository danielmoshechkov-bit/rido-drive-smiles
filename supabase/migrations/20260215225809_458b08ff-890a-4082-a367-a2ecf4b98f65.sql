
-- Fix calendar_calendars RLS to include provider-owned calendars
DROP POLICY IF EXISTS "Users can view own calendars" ON calendar_calendars;
CREATE POLICY "Users can view own calendars" ON calendar_calendars
  FOR SELECT USING (
    (owner_type = 'user' AND owner_id = auth.uid())
    OR (owner_type = 'provider' AND owner_id::text IN (SELECT get_user_provider_ids(auth.uid())::text))
    OR is_public = true
  );

DROP POLICY IF EXISTS "Users can update own calendars" ON calendar_calendars;
CREATE POLICY "Users can update own calendars" ON calendar_calendars
  FOR UPDATE USING (
    (owner_type = 'user' AND owner_id = auth.uid())
    OR (owner_type = 'provider' AND owner_id::text IN (SELECT get_user_provider_ids(auth.uid())::text))
  );

DROP POLICY IF EXISTS "Users can delete own calendars" ON calendar_calendars;
CREATE POLICY "Users can delete own calendars" ON calendar_calendars
  FOR DELETE USING (
    (owner_type = 'user' AND owner_id = auth.uid())
    OR (owner_type = 'provider' AND owner_id::text IN (SELECT get_user_provider_ids(auth.uid())::text))
  );

-- Fix calendar_events RLS for provider calendars
DROP POLICY IF EXISTS "Users can manage own calendar events" ON calendar_events;
CREATE POLICY "Users can manage own calendar events" ON calendar_events
  FOR ALL USING (
    calendar_id IN (
      SELECT id FROM calendar_calendars WHERE 
        (owner_type = 'user' AND owner_id = auth.uid())
        OR (owner_type = 'provider' AND owner_id::text IN (SELECT get_user_provider_ids(auth.uid())::text))
    )
  ) WITH CHECK (
    calendar_id IN (
      SELECT id FROM calendar_calendars WHERE 
        (owner_type = 'user' AND owner_id = auth.uid())
        OR (owner_type = 'provider' AND owner_id::text IN (SELECT get_user_provider_ids(auth.uid())::text))
    )
  );
