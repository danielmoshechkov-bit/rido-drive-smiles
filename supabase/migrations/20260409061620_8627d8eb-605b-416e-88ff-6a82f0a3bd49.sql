-- Add "Wycena" status for all providers that don't have it yet
INSERT INTO order_statuses (user_id, name, color, sort_order, is_default)
SELECT DISTINCT os.user_id, 'Wycena', '#8B5CF6', 1, true
FROM order_statuses os
WHERE NOT EXISTS (
  SELECT 1 FROM order_statuses os2 
  WHERE os2.user_id = os.user_id AND os2.name = 'Wycena'
)
ON CONFLICT DO NOTHING;