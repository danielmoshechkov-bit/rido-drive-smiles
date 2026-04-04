alter table user_invoices add column if not exists ksef_status text default 'not_sent';
alter table user_invoices add column if not exists ksef_reference text;
alter table user_invoices add column if not exists ksef_environment text;
alter table ksef_transmissions add column if not exists upo_content text;
alter table ksef_transmissions add column if not exists environment text;