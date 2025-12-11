-- Delete settlements linked to duplicate drivers
DELETE FROM settlements 
WHERE driver_id IN (
  SELECT id FROM drivers WHERE first_name IN ('Uber', 'Bolt', 'FreeNow')
);

-- Delete platform_ids linked to duplicate drivers
DELETE FROM driver_platform_ids 
WHERE driver_id IN (
  SELECT id FROM drivers WHERE first_name IN ('Uber', 'Bolt', 'FreeNow')
);

-- Delete driver_app_users linked to duplicate drivers
DELETE FROM driver_app_users 
WHERE driver_id IN (
  SELECT id FROM drivers WHERE first_name IN ('Uber', 'Bolt', 'FreeNow')
);

-- Delete driver_document_statuses linked to duplicate drivers
DELETE FROM driver_document_statuses 
WHERE driver_id IN (
  SELECT id FROM drivers WHERE first_name IN ('Uber', 'Bolt', 'FreeNow')
);

-- Delete the duplicate drivers themselves
DELETE FROM drivers 
WHERE first_name IN ('Uber', 'Bolt', 'FreeNow');