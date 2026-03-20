import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VehicleLookupCredits {
  remaining_credits: number;
  total_credits_purchased: number;
}

interface VehicleData {
  registration_number?: string;
  vin?: string;
  make?: string;
  model?: string;
  body_style?: string;
  color?: string;
  registration_year?: number;
  fuel_type?: string;
  engine_size?: string;
  engine_power_kw?: string;
  mileage?: string;
  transmission?: string;
  number_of_doors?: string;
  number_of_seats?: string;
  description?: string;
}

export function useVehicleLookup(userId?: string) {
  const [credits, setCredits] = useState<VehicleLookupCredits | null>(null);
  const [loading, setLoading] = useState(false);
  const [creditsLoading, setCreditsLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    if (!userId) return;
    setCreditsLoading(true);
    try {
      const { data, error } = await supabase
        .from('vehicle_lookup_credits')
        .select('remaining_credits, total_credits_purchased')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching vehicle lookup credits:', error);
      }
      
      if (data) {
        setCredits(data);
      } else {
        // Create initial record with 0 credits
        const { data: newData } = await supabase
          .from('vehicle_lookup_credits')
          .insert({ user_id: userId, remaining_credits: 0, total_credits_purchased: 0 })
          .select('remaining_credits, total_credits_purchased')
          .single();
        if (newData) setCredits(newData);
        else setCredits({ remaining_credits: 0, total_credits_purchased: 0 });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreditsLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchCredits(); }, [fetchCredits]);

  const checkRegistration = useCallback(async (regNumber: string): Promise<VehicleData | null> => {
    if (!userId) { toast.error('Musisz być zalogowany'); return null; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('vehicle-check', {
        body: { action: 'check-registration', registrationNumber: regNumber },
      });

      if (error) {
        const msg = error.message || '';
        if (msg.includes('402') || msg.includes('NO_CREDITS')) {
          return null; // caller handles modal
        }
        toast.error('Błąd sprawdzania pojazdu');
        return null;
      }

      if (data?.error === 'NO_CREDITS') return null;
      if (data?.error === 'INTEGRATION_DISABLED') {
        toast.error('Integracja pojazdów nie jest aktywna');
        return null;
      }
      if (data?.error === 'NOT_FOUND' || data?.error === 'NO_DATA') {
        toast.error('Nie znaleziono danych dla podanego numeru rejestracyjnego');
        return null;
      }
      if (data?.error) {
        toast.error(data.message || 'Błąd');
        return null;
      }

      if (data?.data) {
        toast.success('Dane pojazdu zostały pobrane');
        await fetchCredits();
        return data.data as VehicleData;
      }

      return null;
    } catch (e: any) {
      toast.error('Błąd połączenia');
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId, fetchCredits]);

  const checkVin = useCallback(async (vinNumber: string): Promise<VehicleData | null> => {
    if (!userId) { toast.error('Musisz być zalogowany'); return null; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('vehicle-check', {
        body: { action: 'check-vin', vin: vinNumber },
      });

      if (error) {
        const msg = error.message || '';
        if (msg.includes('402') || msg.includes('NO_CREDITS')) return null;
        toast.error('Błąd sprawdzania VIN');
        return null;
      }

      if (data?.error === 'NO_CREDITS') return null;
      if (data?.error === 'NOT_FOUND') {
        toast.error('Nie znaleziono pojazdu po numerze VIN w bazie systemu');
        return null;
      }
      if (data?.error) {
        toast.error(data.message || 'Błąd');
        return null;
      }

      if (data?.data) {
        toast.success('Dane pojazdu zostały pobrane');
        await fetchCredits();
        return data.data as VehicleData;
      }
      return null;
    } catch {
      toast.error('Błąd połączenia');
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId, fetchCredits]);

  const purchaseCredits = useCallback(async (amount: number, priceNet: number) => {
    if (!userId) return false;
    try {
      // For now, simulate purchase (payment gateway integration later)
      const currentCredits = credits?.remaining_credits || 0;
      const totalPurchased = credits?.total_credits_purchased || 0;

      const { error } = await supabase
        .from('vehicle_lookup_credits')
        .update({
          remaining_credits: currentCredits + amount,
          total_credits_purchased: totalPurchased + amount,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) {
        toast.error('Błąd zakupu kredytów');
        return false;
      }

      await supabase.from('vehicle_lookup_credit_transactions').insert({
        user_id: userId,
        type: 'purchase',
        credits: amount,
        price_net: priceNet,
        source: 'payment',
        note: `Zakup ${amount} kredytów za ${priceNet.toFixed(2)} zł netto`,
      });

      await fetchCredits();
      toast.success(`Dodano ${amount} kredytów!`);
      return true;
    } catch {
      toast.error('Błąd zakupu');
      return false;
    }
  }, [userId, credits, fetchCredits]);

  return {
    credits,
    creditsLoading,
    loading,
    checkRegistration,
    checkVin,
    purchaseCredits,
    refreshCredits: fetchCredits,
  };
}
