import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders } from "../_shared/cors.ts";
import { sendMail, emailShell } from "../_shared/smtpSend.ts";

/**
 * Ostrzeżenia przed końcem okresu — 7 dni i 1 dzień.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO
 * ═══════════════════════════════════════════════════════════════════════════
 * Blokada bez uprzedzenia jest karą, nie zasadą. Klient ma wiedzieć, kiedy
 * straci dostęp i co dokładnie przestanie działać — z wyprzedzeniem, które
 * pozwala zdecydować, a nie tylko zareagować.
 *
 * Kogo ostrzec, rozstrzyga `billing_do_ostrzezenia()` w bazie. Ta funkcja robi
 * jedno: wysyła i odnotowuje. Rozdzielenie jest celowe — „kogo" da się
 * sprawdzić bez wysyłania czegokolwiek.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ODNOTOWUJEMY PO UDANEJ WYSYŁCE, NIE PRZED
 * ═══════════════════════════════════════════════════════════════════════════
 * Odwrotna kolejność znaczyłaby, że awaria poczty kasuje ostrzeżenie na zawsze:
 * wiersz w `billing_ostrzezenia` już jest, więc następny przebieg go pominie,
 * a klient nigdy się nie dowie. Lepiej wysłać dwa razy niż ani razu.
 */

/**
 * 🔴 BEZ ADRESU ZWROTNEGO — ŚWIADOMIE.
 *
 * Do 13.09.2026 ostrzeżenia miały `Reply-To: kontakt@getrido.pl` i zdanie
 * „odpisz na tego maila". Sprawy abonamentowe nie mają iść na skrzynkę
 * kontaktową: mieszają się tam z korespondencją prowadzoną do czego innego.
 *
 * Skoro nie ma dokąd odpisać, treść MUSI powiedzieć, gdzie napisać — i mówi
 * to nazwą, którą klient widzi na ekranie: dymek „Pomoc" w prawym dolnym
 * rogu panelu. NIE „zakładka Wsparcie" — takiej zakładki w panelu nie ma.
 */

const json = (dane: unknown, status = 200) =>
  new Response(JSON.stringify(dane), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** „za 7 dni" / „jutro" / „dziś" — liczba dni brzmi sztucznie przy jedynce i zerze. */
function kiedy(prog: number): string {
  if (prog === 0) return "dziś";
  return prog === 1 ? "jutro" : `za ${prog} dni`;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAKIET AGENTA MA WŁASNE ZDANIA — bo kończy się inaczej
 * ═══════════════════════════════════════════════════════════════════════════
 * Abonament warsztatowy ODNAWIA SIĘ SAM i ostrzeżenie jest uprzejmością.
 * Pakiet agenta kupiony BLIK-iem NIE ODNOWI SIĘ SAM — tam ostrzeżenie jest
 * jedynym powodem, dla którego klient w ogóle zdąży. Dlatego inne progi
 * (3 dni i dzień wygaśnięcia) i inna treść: mówimy wprost, co przestanie
 * działać i że nic nie pobierze się samo.
 *
 * Zdanie o numerze jest tu najważniejsze. Klient, który stracił numer, stracił
 * też wszystkie wizytówki, naklejki i wpisy z tym numerem — a tego nie cofnie
 * żadna płatność.
 */
function trescAgenta(nazwaFirmy: string, prog: number, koniec: string): string {
  const naglowek = prog === 0
    ? "Pakiet wygasł — asystentka nie odbiera"
    : `Pakiet Agent AI kończy się ${kiedy(prog)}`;

  const wstep = prog === 0
    ? `pakiet <strong>Agent AI</strong> dla <strong>${nazwaFirmy}</strong> wygasł ${koniec}.
       Od dziś wirtualna asystentka nie odbiera telefonów.`
    : `pakiet <strong>Agent AI</strong> dla <strong>${nazwaFirmy}</strong> działa do <strong>${koniec}</strong>.
       Po tym dniu wirtualna asystentka przestanie odbierać telefony.`;

  return emailShell(naglowek, `
    <p>Dzień dobry,</p>
    <p>${wstep}</p>
    <p><strong>Nic nie pobierze się samo.</strong> Jeżeli płaciłeś BLIK-iem, to była
    płatność jednorazowa — przedłużenie wymaga jednego kliknięcia w panelu,
    w zakładce asystentki.</p>
    <p>Numer trzymamy dla Ciebie przez trzydzieści dni. Po tym czasie wraca do puli
    i nie będziemy mogli go przywrócić — klienci, którzy go zapisali, trafią w pustkę.</p>
    <p>Jeśli wolisz, żeby odnawiało się samo, przy kolejnym zakupie wybierz kartę.</p>
    <p>Gdyby coś się nie zgadzało, napisz do nas w panelu — dymek „Pomoc” w prawym dolnym rogu.</p>
    <p>Zespół GetRido</p>
  `);
}

function tresc(nazwaFirmy: string, prog: number, koniec: string, powod: string): string {
  const naglowek = powod === "trial"
    ? "Twój okres próbny dobiega końca"
    : "Twoja subskrypcja wymaga odnowienia";

  const wstep = powod === "trial"
    ? `okres próbny dla konta <strong>${nazwaFirmy}</strong> kończy się ${kiedy(prog)}, ${koniec}.`
    : `subskrypcja dla konta <strong>${nazwaFirmy}</strong> wymaga odnowienia ${kiedy(prog)}, ${koniec}.`;

  return emailShell(naglowek, `
    <p>Dzień dobry,</p>
    <p>${wstep}</p>
    <p><strong>Co się wtedy zmieni</strong></p>
    <p>Przez trzy dni robocze będziesz mógł dokończyć rozpoczęte zlecenia:
    zmienić status, dopisać części, wystawić fakturę i powiadomić klienta.
    Nie założysz w tym czasie nowego zlecenia ani nie zmienisz w istniejącym
    klienta i pojazdu.</p>
    <p>Po tych trzech dniach dostęp do zleceń, kartoteki i kasy zostaje wstrzymany.
    <strong>Twoje dane zostają nietknięte</strong> — wracają w całości po opłaceniu.
    Księgowość i faktury działają bez przerwy, także po wstrzymaniu.</p>
    <p><strong>Co zrobić</strong></p>
    <p>Wybierz plan w panelu, w zakładce Rozliczenia. Zajmuje to chwilę
    i nie przerywa pracy.</p>
    <p>Gdyby coś się nie zgadzało, napisz do nas w panelu — dymek „Pomoc” w prawym dolnym rogu.</p>
    <p>Zespół GetRido</p>
  `);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Bramka: zadanie cykliczne podaje sekret ze skarbca. Fail-closed —
    // brak konfiguracji to odmowa, nie przepuszczenie.
    const oczekiwany = Deno.env.get("BILLING_CRON_SECRET");
    if (!oczekiwany) {
      console.error("billing-ostrzezenia: brak BILLING_CRON_SECRET");
      return json({ error: "Niedostępne" }, 503);
    }
    if (req.headers.get("x-cron-secret") !== oczekiwany) {
      return json({ error: "Brak uprawnień" }, 403);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: doWyslania, error: bladListy } = await admin.rpc("billing_do_ostrzezenia");
    if (bladListy) throw bladListy;

    let wyslane = 0;
    const problemy: string[] = [];

    for (const o of doWyslania ?? []) {
      const koniec = new Date(o.koniec).toLocaleDateString("pl-PL", {
        day: "numeric", month: "long", year: "numeric",
      });
      // Linia produktowa rozstrzyga treść. `billing_do_ostrzezenia` podaje ją
      // wprost, żeby ten kod nie zgadywał po nazwie planu.
      const agent = (o as { linia?: string }).linia === "agent";

      const temat = agent
        ? (o.prog_dni === 0
            ? "Pakiet wygasł — asystentka nie odbiera — GetRido"
            : `Pakiet Agent AI kończy się ${kiedy(o.prog_dni)} — GetRido`)
        : (o.prog_dni === 1
            ? "Jutro kończy się Twój dostęp — GetRido"
            : `Za ${o.prog_dni} dni kończy się Twój dostęp — GetRido`);

      try {
        await sendMail(
          o.email,
          temat,
          agent
            ? trescAgenta(o.nazwa_firmy, o.prog_dni, koniec)
            : tresc(o.nazwa_firmy, o.prog_dni, koniec, o.powod),
        );
      } catch (e) {
        // Jeden nieudany adres nie może zatrzymać reszty listy.
        problemy.push(`${o.email}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      const { error: bladZapisu } = await admin.from("billing_ostrzezenia").insert({
        subscription_id: o.subscription_id,
        prog_dni: o.prog_dni,
        dotyczy_daty: o.koniec,
      });
      if (bladZapisu) {
        // Wysłane, ale nieodnotowane — klient dostanie jutro drugie. Głośno,
        // bo to jedyny ślad.
        console.error("billing-ostrzezenia: wysłane, nieodnotowane", o.subscription_id, bladZapisu);
      }
      wyslane++;
    }

    console.log(JSON.stringify({
      event: "ostrzezenia", do_wyslania: doWyslania?.length ?? 0, wyslane, problemy: problemy.length,
    }));

    return json({ do_wyslania: doWyslania?.length ?? 0, wyslane, problemy });
  } catch (e) {
    console.error("billing-ostrzezenia:", e);
    return json({ error: "Nie udało się wysłać ostrzeżeń" }, 500);
  }
});
