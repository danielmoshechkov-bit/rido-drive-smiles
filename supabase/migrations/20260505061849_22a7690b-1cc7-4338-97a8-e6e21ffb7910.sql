
CREATE OR REPLACE FUNCTION public.merge_duplicate_drivers(p_source uuid, p_target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_e text; v_p text; v_i text; v_pm text;
BEGIN
  IF p_source = p_target THEN RETURN; END IF;
  SELECT email, phone, iban, payment_method INTO v_e, v_p, v_i, v_pm FROM drivers WHERE id = p_source;

  DELETE FROM driver_app_users WHERE driver_id = p_target AND EXISTS (SELECT 1 FROM driver_app_users WHERE driver_id = p_source);
  UPDATE driver_app_users SET driver_id = p_target WHERE driver_id = p_source;

  DELETE FROM driver_document_statuses WHERE driver_id = p_source AND document_type IN (SELECT document_type FROM driver_document_statuses WHERE driver_id = p_target);
  UPDATE driver_document_statuses SET driver_id = p_target WHERE driver_id = p_source;

  DELETE FROM driver_platform_ids WHERE driver_id = p_source AND platform IN (SELECT platform FROM driver_platform_ids WHERE driver_id = p_target);
  UPDATE driver_platform_ids SET driver_id = p_target WHERE driver_id = p_source;

  DELETE FROM driver_b2b_profiles WHERE driver_id = p_source AND EXISTS (SELECT 1 FROM driver_b2b_profiles WHERE driver_id = p_target);
  UPDATE driver_b2b_profiles SET driver_id = p_target WHERE driver_id = p_source;

  DELETE FROM driver_auto_invoicing_settings WHERE driver_id = p_source AND EXISTS (SELECT 1 FROM driver_auto_invoicing_settings WHERE driver_id = p_target);
  UPDATE driver_auto_invoicing_settings SET driver_id = p_target WHERE driver_id = p_source;

  UPDATE driver_debts SET driver_id = p_target WHERE driver_id = p_source AND NOT EXISTS (SELECT 1 FROM driver_debts WHERE driver_id = p_target);
  DELETE FROM driver_debts WHERE driver_id = p_source;

  DELETE FROM settlements WHERE driver_id = p_source AND (period_from, period_to) IN (SELECT period_from, period_to FROM settlements WHERE driver_id = p_target);
  UPDATE settlements SET driver_id = p_target WHERE driver_id = p_source;

  DELETE FROM driver_settlements a USING driver_settlements b WHERE a.driver_id = p_source AND b.driver_id = p_target
    AND COALESCE(a.week_start::text,'')=COALESCE(b.week_start::text,'') AND COALESCE(a.platform,'')=COALESCE(b.platform,'');
  UPDATE driver_settlements SET driver_id = p_target WHERE driver_id = p_source;

  DELETE FROM settlements_weekly a USING settlements_weekly b WHERE a.driver_id = p_source AND b.driver_id = p_target
    AND COALESCE(a.week_start::text,'')=COALESCE(b.week_start::text,'') AND COALESCE(a.platform,'')=COALESCE(b.platform,'');
  UPDATE settlements_weekly SET driver_id = p_target WHERE driver_id = p_source;

  DELETE FROM driver_weekly_debts a USING driver_weekly_debts b WHERE a.driver_id = p_source AND b.driver_id = p_target
    AND COALESCE(a.period_from::text,'')=COALESCE(b.period_from::text,'');
  UPDATE driver_weekly_debts SET driver_id = p_target WHERE driver_id = p_source;

  UPDATE auto_invoicing_consents SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE autofactoring_agreements SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE documents SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE driver_accumulated_earnings SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE driver_additional_fees SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE driver_communications SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE driver_debt_transactions SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE driver_document_requests SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE driver_documents SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE driver_fleet_partnerships SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE driver_fleet_relations SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE driver_invoices SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE driver_vehicle_assignments SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE driver_weekly_debt_payments SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE fleet_document_instances SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE fleet_invitations SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE fuel_cards SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE fuel_logs SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE invoices SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE manual_driver_matches SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE marketplace_listings SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE messages SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE price_change_notifications SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE rental_payment_reminders SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE rides_raw SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE settlement_plan_changes SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE system_alerts SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE unmapped_settlement_drivers SET driver_id = p_target WHERE driver_id = p_source;
  UPDATE vehicle_rentals SET driver_id = p_target WHERE driver_id = p_source;

  UPDATE drivers SET email = COALESCE(NULLIF(email,''), v_e), phone = COALESCE(NULLIF(phone,''), v_p),
    iban = COALESCE(NULLIF(iban,''), v_i), payment_method = COALESCE(NULLIF(payment_method,''), v_pm), updated_at = now()
  WHERE id = p_target;

  DELETE FROM drivers WHERE id = p_source;
END;
$$;

SELECT public.merge_duplicate_drivers('047a06e9-3547-450b-9b42-368c8d77b99a','6ba05f19-286c-42a8-99c6-f8f52c4af11a');
SELECT public.merge_duplicate_drivers('f9324c29-ee62-499f-9130-0d4c7dbf6836','94ff97a0-06f1-4a62-9241-51292d71164e');
SELECT public.merge_duplicate_drivers('b409fbba-1ac6-4174-8f1e-4361349118cf','5f63b508-15e5-42f5-9792-5a9e05940f32');
