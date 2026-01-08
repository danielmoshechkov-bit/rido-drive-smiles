-- Add validity date columns to fleet_settlement_fees
ALTER TABLE fleet_settlement_fees 
ADD COLUMN valid_from DATE,
ADD COLUMN valid_to DATE;

-- Add comment for documentation
COMMENT ON COLUMN fleet_settlement_fees.valid_from IS 'Start date from which this fee is applicable';
COMMENT ON COLUMN fleet_settlement_fees.valid_to IS 'End date until which this fee is applicable';