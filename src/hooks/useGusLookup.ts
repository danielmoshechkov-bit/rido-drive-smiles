import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Znormalizowane dane firmy z GUS REGON (Edge Function gus-lookup). */
export interface GusCompanyData {
  nazwa: string;
  nazwa_skrocona: string | null;
  nip: string;
  regon: string;
  krs: string | null;
  ulica: string;
  nr_domu: string;
  nr_lokalu: string;
  kod_pocztowy: string;
  miasto: string;
  wojewodztwo: string;
  gmina: string;
  powiat: string;
  forma_prawna: string | null;
  pkd_glowne: { kod: string; nazwa: string } | null;
  status: 'aktywny' | 'zakonczony';
  data_zakonczenia: string | null;
  typ_podmiotu: 'prawna' | 'fizyczna' | 'lokalna_prawnej' | 'lokalna_fizycznej';
  /** Adres "Ulica Nr/Lokal" sklejony z pól GUS. */
  adres: string;
  zrodlo: 'gus';
}

export function cleanNip(nip: string): string {
  return nip.replace(/[\s-]/g, '').replace(/^PL/i, '');
}

/** Walidacja sumy kontrolnej NIP — wołana PRZED strzałem do GUS. */
export function isValidNip(nip: string): boolean {
  const clean = cleanNip(nip);
  if (!/^\d{10}$/.test(clean)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const digits = clean.split('').map(Number);
  const checksum = weights.reduce((sum, w, i) => sum + w * digits[i], 0) % 11;
  return checksum !== 10 && checksum === digits[9];
}

export function useGusLookup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<GusCompanyData | null>(null);

  const lookup = useCallback(async (nip: string): Promise<GusCompanyData | null> => {
    const clean = cleanNip(nip);
    setCompany(null);

    if (!/^\d{10}$/.test(clean)) {
      setError('NIP musi mieć 10 cyfr');
      return null;
    }
    if (!isValidNip(clean)) {
      setError('NIP ma nieprawidłową sumę kontrolną');
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('gus-lookup', {
        body: { nip: clean },
      });
      if (fnError) throw fnError;
      if (!data?.success || !data?.data) {
        setError(data?.error || 'Nie znaleziono firmy w rejestrze GUS');
        return null;
      }
      const result = data.data as GusCompanyData;
      setCompany(result);
      return result;
    } catch (err) {
      console.error('gus-lookup error:', err);
      setError('Błąd połączenia z rejestrem GUS');
      return null;
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
