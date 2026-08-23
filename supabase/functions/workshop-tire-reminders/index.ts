// Przypomnienia o odbiorze opon z przechowalni. Uruchamiane cronem raz dziennie
// (patrz migracja 20260802_tire_reminders_dispatch.sql).
//
// SMS-a NIE wysyłamy sami — wkładamy go do kolejki `workshop_sms_log` ze statusem
// 'scheduled', a istniejący dyspozytor (workshop-send-scheduled-sms, cron co minutę)
// robi resztę. Dzięki temu przypomnienia dziedziczą całą logikę wysyłki: ustawienia
// bramki SMS warsztatu, obsługę błędów, log i ochronę przed podwójną wysyłką.
// Mail idzie bezpośrednio przez Resend, bo dla maili takiej kolejki nie ma.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mozePracowac } from "../_shared/subscriptionGate.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const formatDate = (iso: string) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Ta sama bramka co w dyspozytorze SMS. Przypomnienia nie sa juz jednorazowe,
  // wiec dawne uzasadnienie "wyjdzie i tak tylko raz" przestalo obowiazywac.
  // Powtorki pilnuje teraz widok: kolejny wpis wraca dopiero po odstepie
  // ustalonym przez warsztat, a licznik zatrzymuje calosc na jego granicy.
  // Bez sekretu obcy moze wiec wywolac wysylke wczesniej, niz chcial warsztat —
  // dlatego SCHEDULED_SMS_SECRET powinien byc ustawiony.
  const cronSecret = Deno.env.get("SCHEDULED_SMS_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "FORBIDDEN" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // dryRun pozwala sprawdzić na produkcji, KOMU poszłoby przypomnienie,
    // zanim cokolwiek wyjdzie do klientów.
    let body: any = {};
    try { body = await req.json(); } catch { /* cron woła z pustym ciałem */ }
    const dryRun = body?.dryRun === true;
    const providerFilter = typeof body?.providerId === "string" ? body.providerId : null;

    let query = supabaseAdmin
      .from("workshop_tire_reminders_due")
      .select("*")
      .order("due_date", { ascending: true })
      .limit(200);
    if (providerFilter) query = query.eq("provider_id", providerFilter);

    const { data: due, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ processed: 0, sms: 0, email: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (dryRun) {
      return new Response(JSON.stringify({
        dryRun: true,
        candidates: due.map((r: any) => ({
          storage_number: r.storage_number, client: r.client_name, due: r.due_date,
          channel: r.channel, hasPhone: !!r.phone, hasEmail: !!r.email,
        })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resend = resendKey ? new Resend(resendKey) : null;
    const now = new Date().toISOString();
    let sms = 0, email = 0, skipped = 0;
    const problems: string[] = [];

    // Bramka subskrypcji (G5), per warsztat. To przypomnienie o wymianie opon,
    // czyli działanie handlowe WARSZTATU — inaczej niż przypomnienie o wizycie,
    // które służy klientowi i dlatego bramce nie podlega. Pytamy raz na
    // warsztat, nie raz na wiersz: kolejka bywa długa.
    const decyzje = new Map<string, boolean>();
    const wolnoWysylac = async (providerId: string | null | undefined) => {
      if (!providerId) return false;
      const znane = decyzje.get(providerId);
      if (znane !== undefined) return znane;
      const { wolno } = await mozePracowac(supabaseAdmin, providerId);
      decyzje.set(providerId, wolno);
      return wolno;
    };

    for (const row of due as any[]) {
      if (!(await wolnoWysylac(row.provider_id))) { skipped++; continue; }
      const warsztat = row.provider_name || "Warsztat";
      const termin = formatDate(row.due_date);
      const miejsce = row.storage_number ? ` (nr ${row.storage_number})` : "";

      try {
        if (row.channel === "sms") {
          if (!row.phone) {
            // Brak numeru nie jest błędem wysyłki — nie oznaczamy jako wysłane,
            // komplet po prostu wypadnie z okna. Warsztat widzi to w podsumowaniu.
            skipped++; problems.push(`${row.storage_number || row.id}: brak telefonu`);
            continue;
          }
          // Treść z polskimi znakami to segmenty po 70 znaków (UCS-2), stąd zwięzłość —
          // każde zdanie więcej to realny koszt po stronie warsztatu.
          const message =
            `${warsztat}: przypominamy o odbiorze opon${miejsce}. Termin: ${termin}.` +
            (row.provider_phone ? ` Kontakt: ${row.provider_phone}` : "");

          const { error: queueErr } = await supabaseAdmin.from("workshop_sms_log").insert({
            provider_id: row.provider_id,
            client_id: row.client_id,
            phone: row.phone,
            message,
            sms_type: "tire_pickup_reminder",
            status: "scheduled",
            scheduled_at: now,
          });
          if (queueErr) throw queueErr;
          sms++;
        } else if (row.channel === "email") {
          if (!row.email) {
            skipped++; problems.push(`${row.storage_number || row.id}: brak adresu e-mail`);
            continue;
          }
          if (!resend) {
            skipped++; problems.push("brak klucza RESEND_API_KEY — maile nie wychodzą");
            continue;
          }
          const { error: mailErr } = await resend.emails.send({
            from: "RIDO <no-reply@getrido.pl>",
            to: [row.email],
            subject: `Przypomnienie o odbiorze opon — ${warsztat}`,
            html: `
              <p>Dzień dobry${row.client_name ? ` ${row.client_name}` : ""},</p>
              <p>przypominamy o odbiorze opon przechowywanych w naszym warsztacie${miejsce}.</p>
              <p><strong>Termin odbioru: ${termin}</strong></p>
              ${row.quantity ? `<p>Liczba opon: ${row.quantity}${row.season ? `, sezon: ${row.season}` : ""}</p>` : ""}
              <p>Prosimy o kontakt w celu ustalenia dogodnego terminu${row.provider_phone ? `: ${row.provider_phone}` : ""}.</p>
              <p>Pozdrawiamy,<br/>${warsztat}</p>
            `,
          } as any);
          if (mailErr) throw mailErr;
          email++;
        } else {
          skipped++;
          continue;
        }

        // Znacznik stawiamy dopiero po udanym zakolejkowaniu/wysłaniu — inaczej
        // awaria bramki oznaczyłaby przypomnienie jako doręczone.
        // Licznik rosnie, bo przypomnienie nie jest juz jednorazowe: kolejne
        // wychodza co ustalony odstep, az do granicy zapisanej w zasadach
        // warsztatu. Bez licznika nie dalo by sie tej granicy pilnowac.
        // Historia wysylek: przy sporze z klientem to jedyny dowod, ze
        // przypomnienie w ogole poszlo i na jaki numer.
        await supabaseAdmin.from("workshop_tire_reminder_log").insert({
          storage_id: row.id,
          provider_id: row.provider_id,
          kanal: row.channel,
          odbiorca: row.channel === "email" ? row.email : row.phone,
          udane: true,
        });

        await supabaseAdmin
          .from("workshop_tire_storage")
          .update({
            reminder_sent_at: now,
            reminder_sent: true,
            reminder_count: Number(row.reminder_count ?? 0) + 1,
          })
          .eq("id", row.id);
      } catch (err: any) {
        skipped++;
        problems.push(`${row.storage_number || row.id}: ${err?.message ?? "błąd wysyłki"}`);
        console.error("[Tire reminders] Nie udało się przypomnieć", row.id, err);
      }
    }

    return new Response(JSON.stringify({ processed: due.length, sms, email, skipped, problems }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Tire reminders] Błąd:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
