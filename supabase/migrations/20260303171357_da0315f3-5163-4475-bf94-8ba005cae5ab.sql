-- Delete duplicate workshop_order_statuses (keep lowest id per name+provider_id+sort_order)
DELETE FROM workshop_order_statuses
WHERE id NOT IN (
  SELECT MIN(id::text)::uuid 
  FROM workshop_order_statuses 
  GROUP BY provider_id, name, sort_order
);

-- Add unique constraint to prevent future duplicates
ALTER TABLE workshop_order_statuses 
ADD CONSTRAINT unique_status_per_provider UNIQUE (provider_id, name);