
-- Set password for biuro@flamepartner.pl to Test123!
UPDATE auth.users 
SET encrypted_password = crypt('Test123!', gen_salt('bf'))
WHERE email = 'biuro@flamepartner.pl';
