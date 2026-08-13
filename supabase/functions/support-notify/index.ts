import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Powiadomienia czatu wsparcia.
 *
 * - nowa wiadomość od klienta  → SMS do admina (z limitem częstotliwości i ciszą nocną)
 * - odpowiedź admina           → e-mail do klienta, żeby wiedział, że czekamy
 *
 * Limity liczone są TU, na serwerze, na podstawie znaczników w bazie — nawet
 * gdyby ktoś wołał tę funkcję w kółko, SMS-y nie polecą częściej niż ustawiono.
 */


/**
 * Treść SMS-a musi zmieścić się w JEDNEJ wiadomości.
 *
 * Dwie pułapki: (1) 160 znaków to limit tylko dla alfabetu GSM-7 — jeden polski
 * ogonek albo myślnik „—" przełącza wiadomość na Unicode, gdzie limit spada do
 * 70 znaków i operator nalicza kilka SMS-ów; (2) długa nazwa firmy potrafi sama
 * zjeść pół wiadomości. Dlatego: najpierw czyste ASCII, potem twarde przycięcie
 * fragmentu wiadomości do tego, co zostało z budżetu.
 */
const SMS_LIMIT = 160;
const SMS_TAIL = ' Odp: getrido.pl/admin/portal';

const asciiOnly = (text: string) =>
  text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // ą->a, ć->c, ...
    .replace(/[łŁ]/g, (m) => (m === 'ł' ? 'l' : 'L'))
    .replace(/[–—]/g, '-')
    .replace(/[„”"']/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildSingleSms = (who: string, excerpt: string) => {
  const head = `GetRido: nowa wiadomosc od ${who}: `;
  const room = SMS_LIMIT - head.length - SMS_TAIL.length;
  if (room <= 0) return `${head}${SMS_TAIL}`.slice(0, SMS_LIMIT).trim();
  const body = excerpt.length > room ? `${excerpt.slice(0, Math.max(0, room - 3))}...` : excerpt;
  return `${head}${body}${SMS_TAIL}`.slice(0, SMS_LIMIT);
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Godzina w Polsce — cisza nocna ma działać wg czasu lokalnego, nie UTC. */
const warsawHour = () =>
  Number(new Intl.DateTimeFormat('pl-PL', { hour: 'numeric', hour12: false, timeZone: 'Europe/Warsaw' })
    .format(new Date()));

const inQuietHours = (from: number, to: number) => {
  const h = warsawHour();
  return from <= to ? h >= from && h < to : h >= from || h < to; // zakres przez północ
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { conversation_id, sender_role } = await req.json();
    if (!conversation_id) return json({ error: 'Brak conversation_id' }, 400);

    const { data: conv, error: convError } = await supabase
      .from('support_conversations')
      .select('id, contact_name, contact_email, admin_notified_at, client_notified_at, unread_for_user, is_test')
      .eq('id', conversation_id)
      .maybeSingle();
    if (convError) throw convError;
    if (!conv) return json({ error: 'Nie znaleziono rozmowy' }, 404);

    // ROZMOWA TESTOWA — bez SMS-a i bez e-maila.
    //
    // Zestaw testów zakłada rozmowę i sprawdza eskalację do człowieka, a ta
    // kończy się tutaj. Każdy przebieg wysyłał więc dwie prawdziwe wiadomości
    // na prywatny numer admina; ograniczenie częstotliwości nie pomagało, bo
    // liczy się per rozmowa, a każdy przebieg zakładał nową.
    //
    // Nazwa z prefiksem to druga linia obrony — dla rozmów sprzed dodania
    // znacznika i na wypadek testu, który zapomni go ustawić.
    const nazwaTestowa = /^\[(AI-)?TEST\]/i.test(String(conv.contact_name || ''));
    if (conv.is_test || nazwaTestowa) {
      console.info('[support-notify]', JSON.stringify({ event: 'test_conversation_skipped', conversation: String(conv.id).slice(0, 8) }));
      return json({ skipped: 'rozmowa testowa' });
    }

    const { data: settings } = await supabase.from('support_settings').select('*').eq('id', true).maybeSingle();
    if (!settings) return json({ skipped: 'brak ustawień wsparcia' });

    // Bierzemy kilka ostatnich wiadomosci, bo do SMS-a potrzebujemy PYTANIA
    // KLIENTA, a nie ostatniego wpisu w watku. Gdy asystent eskaluje, najpierw
    // wstawia swoja odpowiedz — bez tego rozroznienia admin dostawal SMS-a
    // cytujacego bota zamiast problemu, ktory ma rozwiazac.
    const { data: recent } = await supabase
      .from('support_messages')
      .select('body, sender_role, sender_name, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(10);
    const lastMessage = recent?.[0];
    const lastUserMessage = recent?.find(m => m.sender_role === 'user');
    const lastAdminMessage = recent?.find(m => m.sender_role === 'admin');

    const role = sender_role || lastMessage?.sender_role;

    // ── Klient napisał → SMS do admina ────────────────────────────────────
    if (role === 'user') {
      if (!settings.sms_enabled || !settings.notify_phone) {
        return json({ skipped: 'SMS wyłączony lub brak numeru' });
      }
      if (settings.quiet_hours_enabled && inQuietHours(settings.quiet_hours_from, settings.quiet_hours_to)) {
        return json({ skipped: 'cisza nocna' });
      }
      const throttleMs = (settings.sms_throttle_minutes ?? 10) * 60_000;
      if (conv.admin_notified_at && Date.now() - new Date(conv.admin_notified_at).getTime() < throttleMs) {
        return json({ skipped: 'limit częstotliwości' });
      }

      const who = asciiOnly(conv.contact_name || conv.contact_email || 'Klient').slice(0, 28);
      const excerpt = asciiOnly(String(lastUserMessage?.body ?? lastMessage?.body ?? ''));
      const message = buildSingleSms(who, excerpt);

      const { error: smsError } = await supabase.functions.invoke('send-sms', {
        body: { phone: settings.notify_phone, message, type: 'support_chat' },
      });
      if (smsError) throw smsError;

      await supabase.from('support_conversations')
        .update({ admin_notified_at: new Date().toISOString() })
        .eq('id', conversation_id);

      return json({ sent: 'sms', message, length: message.length });
    }

    // ── Admin odpisał → e-mail do klienta ─────────────────────────────────
    if (role === 'admin') {
      if (!settings.email_client_on_reply || !conv.contact_email) {
        return json({ skipped: 'e-mail do klienta wyłączony lub brak adresu' });
      }
      // Nie zasypujemy skrzynki przy serii odpowiedzi — najwyżej raz na 15 minut.
      if (conv.client_notified_at && Date.now() - new Date(conv.client_notified_at).getTime() < 15 * 60_000) {
        return json({ skipped: 'limit częstotliwości e-mail' });
      }
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (!resendKey) return json({ skipped: 'brak RESEND_API_KEY' });

      const excerpt = String(lastAdminMessage?.body ?? lastMessage?.body ?? '').replace(/\s+/g, ' ').slice(0, 300);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'GetRido <noreply@getrido.pl>',
          to: [conv.contact_email],
          subject: 'Odpowiedź od wsparcia GetRido',
          html: `
            <p>Cześć${conv.contact_name ? ' ' + conv.contact_name : ''},</p>
            <p>Odpowiedzieliśmy na Twoją wiadomość:</p>
            <blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #6532c9;background:#f7f6fa">${excerpt}</blockquote>
            <p>Otwórz czat w portalu, żeby zobaczyć całą rozmowę i dopisać kolejne pytanie:<br>
            <a href="https://getrido.pl">getrido.pl</a></p>
            <p style="color:#6d6680;font-size:12px">Wiadomość wysłana automatycznie — odpowiadaj w czacie, nie na tego maila.</p>
          `,
        }),
      });
      if (!res.ok) throw new Error(`Resend: ${res.status} ${await res.text()}`);

      await supabase.from('support_conversations')
        .update({ client_notified_at: new Date().toISOString() })
        .eq('id', conversation_id);

      return json({ sent: 'email' });
    }

    return json({ skipped: 'nieznana rola nadawcy' });
  } catch (e) {
    console.error('[support-notify]', e);
    return json({ error: (e as Error).message || 'Błąd serwera' }, 500);
  }
});
