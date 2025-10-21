-- Step 1: Consolidate platform_ids from driver_platform_ids table into drivers.platform_ids (JSONB)
UPDATE drivers d
SET platform_ids = (
  SELECT jsonb_build_object(
    'uber', COALESCE(
      (SELECT jsonb_agg(DISTINCT platform_id) 
       FROM driver_platform_ids 
       WHERE driver_id = d.id AND platform = 'uber'), 
      '[]'::jsonb
    ),
    'bolt', COALESCE(
      (SELECT jsonb_agg(DISTINCT platform_id) 
       FROM driver_platform_ids 
       WHERE driver_id = d.id AND platform = 'bolt'), 
      '[]'::jsonb
    ),
    'freeNow', COALESCE(
      (SELECT jsonb_agg(DISTINCT platform_id) 
       FROM driver_platform_ids 
       WHERE driver_id = d.id AND platform = 'freenow'), 
      '[]'::jsonb
    )
  )
)
WHERE EXISTS (
  SELECT 1 FROM driver_platform_ids WHERE driver_id = d.id
);

-- Step 2: Find and merge duplicate drivers
CREATE TEMP TABLE driver_duplicates AS
WITH grouped AS (
  SELECT 
    LOWER(TRIM(COALESCE(email, ''))) as normalized_email,
    TRIM(COALESCE(phone, '')) as normalized_phone,
    array_agg(id ORDER BY created_at ASC) as driver_ids,
    COUNT(*) as dup_count
  FROM drivers
  WHERE (email IS NOT NULL AND email != '') 
     OR (phone IS NOT NULL AND phone != '')
  GROUP BY LOWER(TRIM(COALESCE(email, ''))), TRIM(COALESCE(phone, ''))
  HAVING COUNT(*) > 1
)
SELECT * FROM grouped;

-- Merge duplicates
DO $$
DECLARE
  dup RECORD;
  primary_id uuid;
  duplicate_id uuid;
  merged_platform_ids jsonb;
BEGIN
  FOR dup IN SELECT * FROM driver_duplicates LOOP
    primary_id := dup.driver_ids[1];
    
    -- Merge platform_ids
    SELECT jsonb_build_object(
      'uber', COALESCE((
        SELECT jsonb_agg(DISTINCT elem)
        FROM drivers
        CROSS JOIN LATERAL jsonb_array_elements_text(
          COALESCE(platform_ids->'uber', '[]'::jsonb)
        ) as elem
        WHERE id = ANY(dup.driver_ids)
      ), '[]'::jsonb),
      'bolt', COALESCE((
        SELECT jsonb_agg(DISTINCT elem)
        FROM drivers
        CROSS JOIN LATERAL jsonb_array_elements_text(
          COALESCE(platform_ids->'bolt', '[]'::jsonb)
        ) as elem
        WHERE id = ANY(dup.driver_ids)
      ), '[]'::jsonb),
      'freeNow', COALESCE((
        SELECT jsonb_agg(DISTINCT elem)
        FROM drivers
        CROSS JOIN LATERAL jsonb_array_elements_text(
          COALESCE(platform_ids->'freeNow', '[]'::jsonb)
        ) as elem
        WHERE id = ANY(dup.driver_ids)
      ), '[]'::jsonb)
    ) INTO merged_platform_ids;
    
    UPDATE drivers
    SET platform_ids = merged_platform_ids,
        updated_at = now()
    WHERE id = primary_id;
    
    -- Move related data
    FOREACH duplicate_id IN ARRAY dup.driver_ids[2:array_length(dup.driver_ids, 1)]
    LOOP
      -- Settlements (using actual schema: week_start, week_end, platform)
      UPDATE settlements SET driver_id = primary_id 
      WHERE driver_id = duplicate_id 
      AND NOT EXISTS (
        SELECT 1 FROM settlements 
        WHERE driver_id = primary_id 
        AND platform = settlements.platform 
        AND week_start = settlements.week_start
        AND week_end = settlements.week_end
      );
      
      -- Driver settlements
      UPDATE driver_settlements SET driver_id = primary_id 
      WHERE driver_id = duplicate_id
      AND NOT EXISTS (
        SELECT 1 FROM driver_settlements 
        WHERE driver_id = primary_id 
        AND week_start = driver_settlements.week_start
      );
      
      -- Documents
      UPDATE driver_documents SET driver_id = primary_id 
      WHERE driver_id = duplicate_id
      AND NOT EXISTS (
        SELECT 1 FROM driver_documents 
        WHERE driver_id = primary_id 
        AND document_type_id = driver_documents.document_type_id
      );
      
      -- Document statuses
      DELETE FROM driver_document_statuses WHERE driver_id = duplicate_id;
      
      -- Vehicle assignments
      UPDATE driver_vehicle_assignments SET driver_id = primary_id 
      WHERE driver_id = duplicate_id
      AND status = 'active';
      
      UPDATE driver_vehicle_assignments 
      SET status = 'inactive'
      WHERE driver_id = duplicate_id;
      
      -- Messages
      UPDATE messages SET driver_id = primary_id 
      WHERE driver_id = duplicate_id;
      
      -- Fuel logs
      UPDATE fuel_logs SET driver_id = primary_id 
      WHERE driver_id = duplicate_id;
      
      -- Platform IDs
      DELETE FROM driver_platform_ids WHERE driver_id = duplicate_id;
      
      -- Delete duplicate
      DELETE FROM drivers WHERE id = duplicate_id;
      
      RAISE NOTICE 'Merged duplicate driver % into %', duplicate_id, primary_id;
    END LOOP;
  END LOOP;
END $$;

DROP TABLE IF EXISTS driver_duplicates;