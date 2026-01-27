import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface InventoryFeatures {
  inventory_enabled: boolean;
  inventory_purchase_ocr_enabled: boolean;
  inventory_alias_mapping_enabled: boolean;
  inventory_price_suggestions_enabled: boolean;
  inventory_profit_alerts_enabled: boolean;
  inventory_stocktaking_enabled: boolean;
  inventory_barcode_enabled: boolean;
  inventory_profit_analytics_enabled: boolean;
}

const defaultFeatures: InventoryFeatures = {
  inventory_enabled: false,
  inventory_purchase_ocr_enabled: false,
  inventory_alias_mapping_enabled: false,
  inventory_price_suggestions_enabled: false,
  inventory_profit_alerts_enabled: false,
  inventory_stocktaking_enabled: false,
  inventory_barcode_enabled: false,
  inventory_profit_analytics_enabled: false,
};

export function useInventoryFeatures() {
  const [features, setFeatures] = useState<InventoryFeatures>(defaultFeatures);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFeatures = async () => {
      const { data, error } = await supabase
        .from('feature_toggles')
        .select('feature_key, is_enabled')
        .like('feature_key', 'inventory_%');

      if (error) {
        console.error('Error fetching inventory features:', error);
        setLoading(false);
        return;
      }

      const featureMap: InventoryFeatures = { ...defaultFeatures };
      data?.forEach((toggle) => {
        const key = toggle.feature_key as keyof InventoryFeatures;
        if (key in featureMap) {
          featureMap[key] = toggle.is_enabled;
        }
      });

      setFeatures(featureMap);
      setLoading(false);
    };

    fetchFeatures();
  }, []);

  return { features, loading };
}
