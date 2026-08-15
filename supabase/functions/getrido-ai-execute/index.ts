/**
 * Pośrednik do `ai-chat` dla paneli administratora.
 *
 * ⚠️ CO TU BYŁO ŹLE (naprawione 16.08.2026):
 * Funkcja miała 22 linie i robiła jedną rzecz — brała CAŁE ciało żądania
 * i przekazywała je do `ai-chat`, podstawiając **klucz `service_role` jako
 * token uwierzytelniający**. Nie sprawdzała niczego. Każdy, kto znał adres,
 * dostawał w ten sposób dostęp do `ai-chat` z uprawnieniami serwisowymi
 * i na nasz koszt — podręcznikowy „zdezorientowany zastępca": funkcja
 * o wysokich uprawnieniach wykonuje polecenia kogoś, kto ich nie ma.
 *
 * Wołają ją dwa panele administratora (`AIFunctionMappingPanel`, `AIHubPanel`),
 * więc wymaganie roli `admin` nie zmienia niczego w działaniu aplikacji.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';
import { wymagajRoli } from '../_shared/requireRole.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!key) {
      console.error('getrido-ai-execute: brak SUPABASE_SERVICE_ROLE_KEY');
      return json({ error: 'NOT_CONFIGURED' }, 503);
    }

    const admin = createClient(url, key);

    const brama = await wymagajRoli(admin, req, ['admin']);
    if (!brama.ok) return brama.odp;

    const body = await req.json().catch(() => ({}));
    console.log(`[getrido-ai-execute] ${brama.kto.email ?? brama.kto.id}`);

    const res = await fetch(`${url}/functions/v1/ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
      // `actor_user_id` przekazujemy dalej, żeby koszt zapytania trafił
      // do dziennika z autorem, a nie jako anonimowy.
      body: JSON.stringify({ ...body, stream: false, actor_user_id: brama.kto.id }),
    });

    const data = await res.json().catch(() => ({}));
    return json(data, res.ok ? 200 : res.status);
  } catch (err) {
    const tresc = err instanceof Error ? err.message : String(err);
    return json({ error: tresc, result: `Błąd: ${tresc}` }, 500);
  }
});
