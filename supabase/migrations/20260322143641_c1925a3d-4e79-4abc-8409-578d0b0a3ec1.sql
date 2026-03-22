
-- Delete all listings for test agencies (created by AI)
DELETE FROM real_estate_listings WHERE agent_id IN (
  '132310ce-25a7-4949-ab66-297b1949e47a',
  '5e2ce295-49c3-49c1-9004-f826ec98c683'
);

-- Delete test agencies
DELETE FROM real_estate_agents WHERE id IN (
  '132310ce-25a7-4949-ab66-297b1949e47a',
  '5e2ce295-49c3-49c1-9004-f826ec98c683'
);

-- Delete all listings from user's agent EXCEPT one mieszkanie na sprzedaż
DELETE FROM real_estate_listings 
WHERE agent_id = 'e8b6592e-91b1-4cc4-ab0e-02025b503eb5'
  AND id != 'a7fea637-2698-4235-9718-084cc31125a3';

-- Update the remaining listing description with TEST prefix
UPDATE real_estate_listings 
SET description = '[TEST] ' || description
WHERE id = 'a7fea637-2698-4235-9718-084cc31125a3';
