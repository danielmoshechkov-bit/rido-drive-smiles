-- Clean up test service providers
CREATE TEMP TABLE _keepers AS
  SELECT id FROM service_providers WHERE user_id IS NOT NULL
  UNION ALL
  (SELECT DISTINCT ON (category_id) id FROM service_providers 
   WHERE user_id IS NULL AND category_id IS NOT NULL
   ORDER BY category_id, created_at ASC);

DELETE FROM service_bookings WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM service_reviews WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM provider_services WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM service_working_hours WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM service_resources WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM service_employees WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM services WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM service_calendar_blocks WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM service_customers WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM service_customer_notes WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM pending_service_reviews WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM provider_reminder_confirmations WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM website_projects WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM workshop_employees WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM workshop_clients WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM workshop_vehicles WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM workshop_order_statuses WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM workshop_orders WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM booking_services WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM booking_resources WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM booking_availability_rules WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM booking_availability_config WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM booking_appointments WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM booking_public_links WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM workshop_workstations WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM workshop_mechanics WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM workshop_tire_storage WHERE provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM client_reviews WHERE reviewer_provider_id NOT IN (SELECT id FROM _keepers);
DELETE FROM workspace_projects WHERE tenant_id NOT IN (SELECT id FROM _keepers);

DELETE FROM service_providers WHERE id NOT IN (SELECT id FROM _keepers);

DROP TABLE _keepers;