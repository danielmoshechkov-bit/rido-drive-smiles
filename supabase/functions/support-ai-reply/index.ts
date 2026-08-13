import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Pierwsza linia wsparcia — asystent AI w czacie.
 *
 * Odpowiada WYŁĄCZNIE na podstawie bazy wiedzy o portalu (`support_knowledge`).
 * Czego tam nie ma — nie zgaduje: przekazuje rozmowę do człowieka i wysyła SMS
 * na numer z ustawień. Zmyślona odpowiedź o cenie albo terminie kosztuje więcej
 * niż uczciwe „sprawdzę i wrócę".
 *
 * Eskalacja następuje też, gdy: klient prosi o człowieka, zgłasza reklamację lub
 * asystent odpowiadał już N razy (ustawienie ai_escalate_after) bez rozwiązania.
 */

/** Uproszczenie tekstu do porównań: bez ogonków, bez interpunkcji. */
const uproszcz = (t: string) =>
  String(t || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[łŁ]/g, 'l')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Prośby o człowieka rozpoznajemy bez pytania modelu — to ma działać zawsze. */
const HUMAN_REQUEST = /(czlowiek|człowiek|konsultant|z kims|z kimś|prawdziw|nie bot|nie z botem|admin|reklamacj|skarg|zwrot pieniedzy|zwrot pieniędzy)/i;

const SYSTEM_PROMPT = `Jesteś asystentem wsparcia GetRido — polskiego systemu dla warsztatów samochodowych.

ZASADY (bezwzględne):
1. Odpowiadasz WYŁĄCZNIE na podstawie sekcji WIEDZA poniżej. Nie korzystasz z żadnych innych informacji.
2. Jeśli w WIEDZY nie ma odpowiedzi — NIE ZGADUJESZ. Ustawiasz needs_human = true.
3. Nigdy nie podajesz cen, terminów, warunków umowy ani obietnic, których nie ma wprost w WIEDZY.
4. Nie obiecujesz zmian w programie, nie przyjmujesz reklamacji, nie potwierdzasz zwrotów — to zawsze needs_human = true.
5. Piszesz po polsku, zwięźle (2–4 zdania), prosto, bez żargonu. Zwracasz się na „Ty".
6. Nie wymyślasz nazw ekranów ani przycisków — używasz tylko tych z WIEDZY.

Odpowiadasz WYŁĄCZNIE obiektem JSON:
{"answer": "treść odpowiedzi albo null", "needs_human": true/false, "reason": "krótko dlaczego przekazujesz człowiekowi"}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { conversation_id } = await req.json();
    if (!conversation_id) return json({ error: 'Brak conversation_id' }, 400);

    const { data: conv } = await supabase
      .from('support_conversations')
      .select('id, contact_name, escalated_at, ai_replies_count')
      .eq('id', conversation_id)
      .maybeSingle();
    if (!conv) return json({ error: 'Nie znaleziono rozmowy' }, 404);

    const { data: settings } = await supabase.from('support_settings').select('*').eq('id', true).maybeSingle();

    const escalate = async (reason: string, replyToClient?: string) => {
      if (replyToClient) {
        await supabase.from('support_messages').insert({
          conversation_id,
          sender_role: 'ai',
          sender_name: 'Asystent GetRido',
          body: replyToClient,
        });
      }
      if (!conv.escalated_at) {
        await supabase.from('support_conversations')
          .update({ escalated_at: new Date().toISOString() })
          .eq('id', conversation_id);
      }
      // SMS do człowieka — limity i cisza nocna po stronie support-notify.
      await supabase.functions.invoke('support-notify', {
        body: { conversation_id, sender_role: 'user' },
      });
      return json({ action: 'escalated', reason });
    };

    // Asystent wyłączony → sprawa od razu do człowieka.
    if (!settings?.ai_enabled) {
      return await escalate('asystent wyłączony');
    }

    const { data: history } = await supabase
      .from('support_messages')
      .select('sender_role, body, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(6);
    const messages = (history || []).reverse();
    const lastUser = [...messages].reverse().find(m => m.sender_role === 'user');
    if (!lastUser) return json({ skipped: 'brak wiadomości klienta' });

    // Rozmowa już u człowieka → asystent się nie wtrąca.
    if (conv.escalated_at) {
      await supabase.functions.invoke('support-notify', {
        body: { conversation_id, sender_role: 'user' },
      });
      return json({ action: 'already_escalated' });
    }

    // Wyraźna prośba o człowieka / reklamacja — bez pytania modelu.
    if (HUMAN_REQUEST.test(lastUser.body)) {
      return await escalate(
        'klient prosi o człowieka',
        'Jasne — przekazuję rozmowę naszemu zespołowi. Odezwiemy się tutaj, w tym samym oknie.',
      );
    }

    // Zbyt wiele podejść asystenta → oddajemy sprawę człowiekowi.
    if ((conv.ai_replies_count || 0) >= (settings.ai_escalate_after ?? 3)) {
      return await escalate(
        'limit odpowiedzi asystenta',
        'Widzę, że sprawa jest bardziej złożona — przekazuję ją naszemu zespołowi.',
      );
    }

    const { data: knowledge } = await supabase
      .from('support_knowledge')
      .select('category, question, answer, keywords')
      .eq('is_active', true)
      .limit(100);

    if (!knowledge?.length) {
      return await escalate('pusta baza wiedzy');
    }

    // Do modelu wysyłamy TYLKO wiedzę pasującą do pytania. Wrzucanie całej bazy
    // przy każdej wiadomości wydłużało odpowiedź (im więcej wpisów, tym gorzej)
    // i rozpraszało model. Dopasowanie po słowach — tanio i wystarczająco.
    const pytanie = uproszcz(lastUser.body);
    const slowaPytania = pytanie.split(' ').filter(w => w.length >= 4);
    const trafnosc = (k: any) => {
      const tekst = uproszcz(`${k.question} ${k.keywords || ''} ${k.category}`);
      return slowaPytania.reduce((suma, w) => suma + (tekst.includes(w) ? 1 : 0), 0);
    };
    const posortowane = [...knowledge].sort((a, b) => trafnosc(b) - trafnosc(a));
    const trafione = posortowane.filter(k => trafnosc(k) > 0);
    // Gdy nic nie pasuje, dajemy niewielki przekrój — model i tak ma wtedy
    // odpowiedzieć „nie wiem" i przekazać sprawę człowiekowi.
    const wybrane = (trafione.length ? trafione : posortowane).slice(0, 8);

    const knowledgeText = wybrane
      .map((k, i) => `[${i + 1}] (${k.category}) P: ${k.question}\nO: ${k.answer}`)
      .join('\n\n');

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return await escalate('brak klucza AI');

    const chat = messages.map(m => ({
      role: m.sender_role === 'user' ? 'user' : 'assistant',
      content: m.body,
    }));

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: settings.ai_model || 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\n=== WIEDZA ===\n${knowledgeText}` },
          ...chat,
        ],
        max_tokens: 500,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[support-ai-reply] gateway', res.status, errorText);
      return await escalate(`błąd AI ${res.status}`);
    }

    const data = await res.json();
    const raw = String(data.choices?.[0]?.message?.content ?? '');

    // Model bywa gadatliwy — wyłuskujemy obiekt JSON z odpowiedzi.
    let parsed: { answer?: string | null; needs_human?: boolean; reason?: string } | null = null;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    } catch {
      parsed = null;
    }

    if (!parsed || parsed.needs_human || !parsed.answer || !String(parsed.answer).trim()) {
      return await escalate(
        parsed?.reason || 'asystent nie zna odpowiedzi',
        'Nie chcę zgadywać, więc przekazuję pytanie naszemu zespołowi — odpiszemy tutaj.',
      );
    }

    await supabase.from('support_messages').insert({
      conversation_id,
      sender_role: 'ai',
      sender_name: 'Asystent GetRido',
      body: String(parsed.answer).trim(),
    });
    // Asystent obsłużył pytanie — admin nie dostaje alertu, sprawa zostaje
    // widoczna w skrzynce, ale bez znacznika „czeka na odpowiedź".
    await supabase.from('support_conversations')
      .update({ ai_replies_count: (conv.ai_replies_count || 0) + 1, unread_for_admin: 0 })
      .eq('id', conversation_id);

    return json({ action: 'answered', answer: String(parsed.answer).trim() });
  } catch (e) {
    console.error('[support-ai-reply]', e);
    return json({ error: (e as Error).message || 'Błąd serwera' }, 500);
  }
});
