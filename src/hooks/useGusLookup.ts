import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { shortenLegalForm } from '@/utils/legalFormShortener';

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
  /**
   * Pełna nazwa rejestrowa z GUS — zawsze oryginał, niezależnie od checkboxa
   * „Skróć formę prawną". Pole `nazwa` może mieć skróconą formę prawną.
   */
  nazwa_pelna?: string;
}

interface UseGusLookupOptions {
  /**
   * Wywoływany po udanym lookupie ORAZ przy każdym przełączeniu `setShorten`
   * — zawsze z nazwą w aktualnie wybranym wariancie (skrócona/pełna).
   * Tu formularz mapuje dane na swoje pola; dzięki temu przełączenie
   * checkboxa PO lookupie podmienia nazwę w polu.
   */
  onCompany?: (data: GusCompanyData) => void;
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

/** Kopia danych z nazwą w wybranym wariancie; oryginał zawsze w `nazwa_pelna`. */
function withNameVariant(data: GusCompanyData, shorten: boolean): GusCompanyData {
  const original = data.nazwa_pelna ?? data.nazwa;
  return {
    ...data,
    nazwa: shorten ? shortenLegalForm(original) : original,
    nazwa_pelna: original,
  };
}

export function useGusLookup(options?: UseGusLookupOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `company` trzyma zawsze ORYGINALNE dane z GUS (pełna nazwa).
  const [company, setCompany] = useState<GusCompanyData | null>(null);
  // Domyślnie skracamy formę prawną (sp. z o.o. itd.) w nazwie wstawianej do formularza.
  const [shorten, setShortenState] = useState(true);

  const onCompanyRef = useRef(options?.onCompany);
  onCompanyRef.current = options?.onCompany;
  const shortenRef = useRef(shorten);
  shortenRef.current = shorten;
  const companyRef = useRef<GusCompanyData | null>(null);

  const lookup = useCallback(async (nip: string): Promise<GusCompanyData | null> => {
    const clean = cleanNip(nip);
    setCompany(null);
    companyRef.current = null;

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
      companyRef.current = result;
      const variant = withNameVariant(result, shortenRef.current);
      onCompanyRef.current?.(variant);
      return variant;
    } catch (err) {
      console.error('gus-lookup error:', err);
      setError('Błąd połączenia z rejestrem GUS');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Przełączenie checkboxa PO lookupie re-emituje onCompany z podmienioną nazwą. */
  const setShorten = useCallback((checked: boolean) => {
    setShortenState(checked);
    if (companyRef.current) {
      onCompanyRef.current?.(withNameVariant(companyRef.current, checked));
    }
  }, []);

  const reset = useCallback(() => {
    setCompany(null);
    companyRef.current = null;
    setError(null);
  }, []);

  return { lookup, loading, error, company, reset, shorten, setShorten };
}
