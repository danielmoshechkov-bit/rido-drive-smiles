// gus-lookup — autouzupełnianie danych firmy po NIP z GUS REGON (BIR1.1 SOAP).
// Zastępuje lookup-nip (biała lista MF) i registry-gus jako jedyne źródło danych rejestrowych firm.
// Klucz WYŁĄCZNIE z secreta GUS_BIR_API_KEY (nie z tabeli external_integrations).
// Opcjonalnie GUS_BIR_ENV=test przełącza na środowisko testowe GUS.
import { corsHeaders } from '../_shared/cors.ts';
import { BirError, isValidNip, lookupNipInGus, type BirEnvironment } from './bir.ts';
import { phaseABlockedResponse } from "../_shared/phaseABlock.ts";

Deno.serve(async (req) => {
  return phaseABlockedResponse(req, "gus-lookup");

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const { nip } = await req.json();
    const cleanNip = String(nip || '').replace(/[\s-]/g, '').replace(/^PL/i, '');

    if (!/^\d{10}$/.test(cleanNip)) {
      return json({ success: false, code: 'INVALID_NIP', error: 'Nieprawidłowy NIP — wymagane 10 cyfr' });
    }
    if (!isValidNip(cleanNip)) {
      return json({ success: false, code: 'INVALID_NIP', error: 'NIP ma nieprawidłową sumę kontrolną' });
    }

    const apiKey = Deno.env.get('GUS_BIR_API_KEY');
    if (!apiKey) {
      console.error('gus-lookup: missing GUS_BIR_API_KEY secret');
      return json({ success: false, code: 'NO_KEY', error: 'Integracja GUS nie jest skonfigurowana' }, 500);
    }

    const environment: BirEnvironment = Deno.env.get('GUS_BIR_ENV') === 'test' ? 'test' : 'production';
    const data = await lookupNipInGus(cleanNip, apiKey, environment);

    return json({ success: true, data });
  } catch (err) {
    if (err instanceof BirError) {
      console.error(`gus-lookup BIR error [${err.code}]:`, err.message);
      return json({ success: false, code: err.code, error: err.message }, err.code === 'NOT_FOUND' ? 200 : 502);
    }
    console.error('gus-lookup unexpected error:', err);
    return json({ success: false, code: 'GUS_ERROR', error: 'Błąd połączenia z rejestrem GUS' }, 500);
  }
});
