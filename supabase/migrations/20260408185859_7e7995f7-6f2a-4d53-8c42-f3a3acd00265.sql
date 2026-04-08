
-- Restore Bolt CSV data for flamepartner drivers (period 2026-03-30 to 2026-04-05)
-- These were overwritten by debt_carryover logic with empty amounts

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 2843.91, "bolt_net": 1957.09, "bolt_payout": 1298.34, "bolt_fees": 886.82, "bolt_cash_collected": 658.75, "bolt_tips": 4.0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 873.28, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 2843.91, net_amount = 1957.09
WHERE driver_id = 'cebe9670-4e80-4e24-95dd-3c894960c996' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 783.33, "bolt_net": 542.45, "bolt_payout": 282.76, "bolt_fees": 240.88, "bolt_cash_collected": 259.69, "bolt_tips": 0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 240.88, "bolt_other_fees": 0}'::jsonb,
  total_earnings = 783.33, net_amount = 542.45
WHERE driver_id = '25363b17-c19c-4f2c-8b4b-8d4d2d143eb9' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 0, "bolt_net": -13.54, "bolt_payout": -13.54, "bolt_fees": 13.54, "bolt_cash_collected": 0, "bolt_tips": 0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 0, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 0, net_amount = -13.54
WHERE driver_id = '14467376-4b37-4373-bfa1-f8788410b229' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 467.98, "bolt_net": 311.77, "bolt_payout": 157.44, "bolt_fees": 156.21, "bolt_cash_collected": 154.33, "bolt_tips": 4.0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 142.67, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 467.98, net_amount = 311.77
WHERE driver_id = '6c414994-42ce-4cb9-ac2b-9c254d8bc8cb' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 0, "bolt_net": -13.54, "bolt_payout": -13.54, "bolt_fees": 13.54, "bolt_cash_collected": 0, "bolt_tips": 0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 0, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 0, net_amount = -13.54
WHERE driver_id = '454c71d5-5b02-4391-b291-a8c76f95a4e1' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 2729.46, "bolt_net": 1880.30, "bolt_payout": 921.07, "bolt_fees": 849.16, "bolt_cash_collected": 959.23, "bolt_tips": 12.0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 835.62, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 2729.46, net_amount = 1880.30
WHERE driver_id = 'dc694dfd-dddd-4cd5-b121-5ddaadcca6de' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 0, "bolt_net": -6.77, "bolt_payout": -6.77, "bolt_fees": 6.77, "bolt_cash_collected": 0, "bolt_tips": 0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 0, "bolt_other_fees": 6.77}'::jsonb,
  total_earnings = 0, net_amount = -6.77
WHERE driver_id = 'be13a57d-a2f3-45fc-9c91-9fc5b3356a76' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 2580.79, "bolt_net": 1773.65, "bolt_payout": 197.38, "bolt_fees": 807.14, "bolt_cash_collected": 1576.27, "bolt_tips": 0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 793.60, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 2580.79, net_amount = 1773.65
WHERE driver_id = '23f5ff09-e4a4-4b99-8758-e93570b5effe' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 1976.98, "bolt_net": 1357.98, "bolt_payout": 444.82, "bolt_fees": 619.00, "bolt_cash_collected": 913.16, "bolt_tips": 8.0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 605.46, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 1976.98, net_amount = 1357.98
WHERE driver_id = 'de5af690-334c-4b46-a726-699b9d1b500f' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 307.96, "bolt_net": 199.72, "bolt_payout": 80.52, "bolt_fees": 108.24, "bolt_cash_collected": 119.20, "bolt_tips": 0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 94.70, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 307.96, net_amount = 199.72
WHERE driver_id = '6443fb57-3e13-49b2-b4bf-0d47d1cf0c81' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 279.39, "bolt_net": 179.94, "bolt_payout": 58.51, "bolt_fees": 99.45, "bolt_cash_collected": 121.43, "bolt_tips": 0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 85.91, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 279.39, net_amount = 179.94
WHERE driver_id IN (SELECT id FROM drivers WHERE email = 'Izabelagontarz6@gmail.com' AND fleet_id = 'fe139dfc-829f-48af-959c-e7a907661f01' LIMIT 1) AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 52.46, "bolt_net": 36.33, "bolt_payout": 20.49, "bolt_fees": 16.13, "bolt_cash_collected": 15.84, "bolt_tips": 0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 16.13, "bolt_other_fees": 0}'::jsonb,
  total_earnings = 52.46, net_amount = 36.33
WHERE driver_id IN (SELECT id FROM drivers WHERE email = 'norbert.urbanowicz2@gmail.com' AND fleet_id = 'fe139dfc-829f-48af-959c-e7a907661f01' LIMIT 1) AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 2464.94, "bolt_net": 1695.58, "bolt_payout": 127.69, "bolt_fees": 769.36, "bolt_cash_collected": 1567.89, "bolt_tips": 7.0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 755.82, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 2464.94, net_amount = 1695.58
WHERE driver_id = 'd2b71899-f2e3-40dd-a179-d7252ec7c5ed' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 0, "bolt_net": -6.77, "bolt_payout": -6.77, "bolt_fees": 6.77, "bolt_cash_collected": 0, "bolt_tips": 0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 0, "bolt_other_fees": 6.77}'::jsonb,
  total_earnings = 0, net_amount = -6.77
WHERE driver_id = 'f5673e16-f6af-47a1-8718-32d95eeed2d7' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 1676.81, "bolt_net": 1153.18, "bolt_payout": 637.04, "bolt_fees": 523.63, "bolt_cash_collected": 516.14, "bolt_tips": 18.0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 510.09, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 1676.81, net_amount = 1153.18
WHERE driver_id = '44fe9b96-018b-4baf-aded-3c9470b111cd' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 2100.44, "bolt_net": 1442.24, "bolt_payout": 684.46, "bolt_fees": 658.20, "bolt_cash_collected": 757.78, "bolt_tips": 4.0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 644.66, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 2100.44, net_amount = 1442.24
WHERE driver_id = '85dc0a47-518b-4e7e-afba-3af157458d0b' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 1838.84, "bolt_net": 1259.86, "bolt_payout": 670.98, "bolt_fees": 578.98, "bolt_cash_collected": 588.88, "bolt_tips": 0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 565.44, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 1838.84, net_amount = 1259.86
WHERE driver_id = '090177e9-6a03-4146-b395-ff1cfad9f182' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 401.43, "bolt_net": 279.22, "bolt_payout": 145.79, "bolt_fees": 122.21, "bolt_cash_collected": 133.43, "bolt_tips": 4.0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 122.21, "bolt_other_fees": 0}'::jsonb,
  total_earnings = 401.43, net_amount = 279.22
WHERE driver_id = 'e5e9632c-a8c2-448a-90f5-76f45b5dbab8' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 0, "bolt_net": -13.54, "bolt_payout": -13.54, "bolt_fees": 13.54, "bolt_cash_collected": 0, "bolt_tips": 0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 0, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 0, net_amount = -13.54
WHERE driver_id IN (SELECT id FROM drivers WHERE email = '+1sasusumasu@gmail.com' AND fleet_id = 'fe139dfc-829f-48af-959c-e7a907661f01' LIMIT 1) AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 0, "bolt_net": -6.77, "bolt_payout": -6.77, "bolt_fees": 6.77, "bolt_cash_collected": 0, "bolt_tips": 0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 0, "bolt_other_fees": 6.77}'::jsonb,
  total_earnings = 0, net_amount = -6.77
WHERE driver_id = 'a83f6c69-c1ad-435a-9fef-091cef54cccf' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 1473.48, "bolt_net": 1012.84, "bolt_payout": 523.91, "bolt_fees": 460.64, "bolt_cash_collected": 488.93, "bolt_tips": 11.0, "bolt_campaigns": 8.51, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 447.10, "bolt_other_fees": 13.54}'::jsonb,
  total_earnings = 1473.48, net_amount = 1012.84
WHERE driver_id = '2bc03f0b-3a56-4e4a-94a8-65e924490aef' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;

-- Also handle Kacper Piluś (might have been partially updated)
UPDATE settlements SET 
  amounts = '{"bolt_total_gross": 50.20, "bolt_net": 34.76, "bolt_payout": 34.76, "bolt_fees": 15.44, "bolt_cash_collected": 0, "bolt_tips": 0, "bolt_campaigns": 0, "bolt_refunds": 0, "bolt_toll": 0, "bolt_booking_fee": 0, "bolt_commission": 15.44, "bolt_other_fees": 0}'::jsonb,
  total_earnings = 50.20, net_amount = 34.76
WHERE driver_id = 'b409fbba-1ac6-4174-8f1e-4361349118cf' AND period_from = '2026-03-30' AND period_to = '2026-04-05' AND total_earnings = 0;
