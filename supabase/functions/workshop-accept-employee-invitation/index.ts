import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { mozePracowac, odmowaBramki } from '../_shared/subscriptionGate.ts';
import { numerDoPorownania } from '../_shared/numerTelefonu.ts';

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/**
 * PRZYJĘCIE ZAPROSZENIA PRACOWNIKA — żetonem z linku.
 *
 * `invitation_id` (UUID z wiadomości) jest żetonem, więc wywołanie działa też
 * bez zalogowania. Jeśli wywołujący MA sesję, bierzemy jego tożsamość.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 ZAPROSZENIE BEZ POWIĄZANEGO KONTA ZOSTAJE `pending`
 * ═══════════════════════════════════════════════════════════════════════════
 * Poprzednia wersja oznaczała je `accepted` także wtedy, gdy nie znalazła
 * użytkownika — z komentarzem, że konto „zostanie dowiązane przy następnym
 * logowaniu". Nie zostawało: dowiązywał wyłącznie ten kod, wyłącznie w chwili
 * przyjęcia, a skan po zalogowaniu ponawiał TYLKO zaproszenia `pending`.
 * Kto kliknął link przed założeniem konta, nie był powiązany nigdy.
 *
 * Stan zastany 15.09.2026: 10 zaproszeń, wszystkie `accepted`, a dowiązanych
 * pracowników dwóch. Dlatego zaproszenie zamykamy DOPIERO wtedy, gdy jest kogo
 * do niego przypiąć.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DOPASOWANIE WIERSZA PRACOWNIKA: ADRES ALBO NUMER
 * ═══════════════════════════════════════════════════════════════════════════
 * Szukanie po samym adresie nie znajdowało nic przy zaproszeniu SMS-owym
 * (`invited_email IS NULL`) i zakładało DRUGI wiersz — tak powstał „Pracownik"
 * bez adresu i numeru obok wpisanego ręcznie „Marcin Ogrzyński". Numer
 * porównujemy w postaci znormalizowanej, bo `530890466` i `+48530890466` to
 * ten sam człowiek.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KOGO WOLNO PRZYPIĄĆ
 * ═══════════════════════════════════════════════════════════════════════════
 * • zaproszenie Z ADRESEM — tylko konto o tym adresie (jak dotąd),
 * • zaproszenie SMS-owe (bez adresu) — konto wywołującego, bo dowodem jest
 *   sam link: dostał go wyłącznie właściciel numeru.
 * Numeru wpisanego przez zakładającego konto przy rejestracji NIE używamy do
 * niczego — to jego własne oświadczenie, więc dopasowanie po nim wpuszczałoby
 * do warsztatu każdego, kto zna numer zaproszonego.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    const invitation_id: string | undefined = body.invitation_id;
    const accept: boolean = body.accept !== false; // default true

    if (!invitation_id) return json({ error: 'invitation_id required' }, 400);

    const supaUrl = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(supaUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: inv } = await admin
      .from('workshop_employee_invitations')
      .select('*, service_providers(company_name)')
      .eq('id', invitation_id)
      .maybeSingle();
    if (!inv) return json({ error: 'not_found' }, 404);

    const companyName = (inv as any).service_providers?.company_name || 'warsztat';

    // Zaproszenie już przyjęte I POWIĄZANE — nie ma co robić drugi raz.
    // Przyjęte, ale BEZ konta, idzie dalej: takich wisi dziś dziesięć, wszystkie
    // zamknięte przez poprzednią wersję, zanim było kogo przypiąć.
    if (inv.status === 'accepted' && inv.invited_user_id) {
      return json({ success: true, status: 'accepted', already: true, company_name: companyName, invited_email: inv.invited_email });
    }
    if (inv.status !== 'pending' && inv.status !== 'accepted') {
      // Odrzucone i odwołane zostają zamknięte — ponowne kliknięcie linku
      // nie ma prawa ich ożywić.
      return json({ error: 'already_processed', status: inv.status }, 400);
    }

    // Bramka subskrypcji (G5) — tylko na PRZYJĘCIU zaproszenia. Odrzucenie
    // zostaje wolne: to zamknięcie sprawy, nie praca, a zablokowanie go
    // zostawiłoby zaproszenie wiszące w nieskończoność.
    if (accept) {
      const bramka = await mozePracowac(admin, inv.provider_id);
      if (!bramka.wolno) return odmowaBramki(corsHeaders, bramka.powod);
    }

    if (!accept) {
      await admin.from('workshop_employee_invitations').update({
        status: 'rejected', rejected_at: new Date().toISOString(),
      }).eq('id', invitation_id);
      return json({ success: true, status: 'rejected' });
    }

    // Kto woła? Sesja jest opcjonalna — link ma działać także bez zalogowania.
    let wolajacy: any = null;
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (token) {
      const { data: u } = await admin.auth.getUser(token);
      wolajacy = u?.user ?? null;
    }

    const adresZaproszenia = (inv.invited_email || '').toLowerCase();

    // Konto o adresie z zaproszenia — jeśli w ogóle istnieje.
    let foundUser: any = null;
    if (adresZaproszenia) {
      if (wolajacy && (wolajacy.email || '').toLowerCase() === adresZaproszenia) {
        foundUser = wolajacy;   // wywołujący JEST zaproszonym, nie trzeba szukać
      } else {
        try {
          let page = 1;
          while (page < 20 && !foundUser) {
            const { data: list } = await (admin.auth.admin as any).listUsers({ page, perPage: 200 });
            const users = list?.users || [];
            foundUser = users.find((u: any) => (u.email || '').toLowerCase() === adresZaproszenia);
            if (users.length < 200) break;
            page++;
          }
        } catch (e) {
          console.warn('listUsers failed', e);
        }
      }
    } else if (wolajacy) {
      // Zaproszenie SMS-owe: dowodem jest link, który dostał właściciel numeru.
      foundUser = wolajacy;
    }

    const userId = foundUser?.id || inv.invited_user_id || null;

    // Wiersz pracownika szukamy po adresie ALBO po numerze w postaci
    // porównywalnej. `maybeSingle()` przy dwóch trafieniach zwraca BŁĄD, a nie
    // pierwszy wiersz — i taki błąd wyglądałby jak „nie ma pracownika", więc
    // bierzemy listę i pierwszy element.
    const numerZaproszenia = numerDoPorownania(inv.invited_phone);
    const warunki = [
      adresZaproszenia ? `email.eq.${adresZaproszenia}` : null,
      numerZaproszenia ? `telefon_norm.eq.${numerZaproszenia}` : null,
      userId ? `user_id.eq.${userId}` : null,
    ].filter(Boolean).join(',');

    const { data: kandydaci } = warunki
      ? await admin.from('workshop_employees')
          .select('id').eq('provider_id', inv.provider_id).or(warunki)
          .order('created_at', { ascending: true }).limit(1)
      : { data: [] as any[] };
    const existing = (kandydaci || [])[0] ?? null;

    if (existing) {
      await admin.from('workshop_employees').update({
        user_id: userId, status: 'active', is_active: true,
        language_preference: inv.language_preference || 'pl',
        role: inv.role || 'mechanic', removed_at: null,
        // Adresu i numeru NIE kasujemy, gdy zaproszenie ich nie niesie —
        // pracodawca zwykle wpisał je przy pracowniku ręcznie.
        ...(inv.invited_email ? { email: inv.invited_email } : {}),
        ...(inv.invited_phone ? { phone: inv.invited_phone } : {}),
      }).eq('id', existing.id);
    } else {
      const fullName = foundUser?.user_metadata?.full_name || inv.invited_email || 'Pracownik';
      const parts = String(fullName).split(' ');
      await admin.from('workshop_employees').insert({
        provider_id: inv.provider_id, user_id: userId,
        name: fullName, first_name: parts[0] || 'Pracownik', last_name: parts.slice(1).join(' ') || '',
        email: inv.invited_email, phone: inv.invited_phone, role: inv.role || 'mechanic',
        language_preference: inv.language_preference || 'pl',
        status: 'active', is_active: true,
      });
    }

    // 🔴 BEZ KONTA ZAPROSZENIE ZOSTAJE OTWARTE. Zamknięte i niepowiązane jest
    // nie do odzyskania: nikt go później nie ponowi, a ta funkcja przy statusie
    // `accepted` wychodzi od razu.
    if (userId) {
      await admin.from('workshop_employee_invitations').update({
        status: 'accepted', accepted_at: new Date().toISOString(),
        invited_user_id: userId,
      }).eq('id', invitation_id);
    } else {
      console.log(JSON.stringify({
        event: 'zaproszenie_czeka_na_konto',
        invitation: invitation_id,
        ma_adres: !!inv.invited_email,
        ma_numer: !!inv.invited_phone,
      }));
    }

    return json({
      success: true,
      status: userId ? 'accepted' : 'pending',
      company_name: companyName,
      invited_email: inv.invited_email,
      user_linked: !!userId,
      // Front po tym poznaje, że ma poprosić o założenie konta i wrócić
      // z tym samym linkiem — a nie pokazać „gotowe".
      czeka_na_konto: !userId,
    });
  } catch (e) {
    console.error('workshop-accept-employee-invitation error:', e);
    return json({ error: String(e) }, 500);
  }
});
