import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CompanyData {
  nip: string;
  name: string;
  regon: string;
  fullAddress: string;
  street: string;
  buildingNumber: string;
  apartmentNumber: string;
  city: string;
  postalCode: string;
  province: string;
  statusVat: string;
  isVatPayer: boolean;
  accountNumbers: string[];
}

export function useNipLookup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyData | null>(null);

  const lookup = useCallback(async (nip: string) => {
    const clean = nip.replace(/[\s-]/g, '');
    if (clean.length < 10) return;

    setLoading(true);
    setError(null);
    setCompany(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('lookup-nip', {
        body: { nip: clean },
      });

      if (fnErr) throw fnErr;
      if (!data.valid) {
        setError(data.error || 'Nie znaleziono firmy');
        return;
      }

      setCompany(data.data as CompanyData);
    } catch (err) {
      setError('Błąd połączenia z rejestrem firm');
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setCompany(null);
    setError(null);
  }, []);

  return { lookup, loading, error, company, reset };
}
