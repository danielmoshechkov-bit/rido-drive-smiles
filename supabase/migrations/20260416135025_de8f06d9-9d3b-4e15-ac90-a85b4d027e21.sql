
-- Fix Paweł Chwaleba: settlements are on 94ff97a0, but app user links to f9324c29
UPDATE driver_app_users 
SET driver_id = '94ff97a0-06f1-4a62-9241-51292d71164e'
WHERE driver_id = 'f9324c29-ee62-499f-9130-0d4c7dbf6836';

-- Fix Jarosław Kawałek: settlements are on 454c71d5, but app user links to aa75e5ea
UPDATE driver_app_users 
SET driver_id = '454c71d5-5b02-4391-b291-a8c76f95a4e1'
WHERE driver_id = 'aa75e5ea-c440-4cc5-ac80-3fda9dafe71f';
