// ============================================================================
// agent-demo-lead — zapis kontaktu ze strony /ai-agent i wydanie numeru demo.
//
// Numer demonstracyjny NIE JEST w kodzie strony. Pokazuje się dopiero po
// zostawieniu kontaktu, i to ta funkcja go wydaje — dzięki temu nie da się go
// zebrać ze źródła strony ani z paczki aplikacji.
//
// `marketing_leads` jest dostępna wyłącznie dla administratora (jedna polityka
// RLS), więc zapis z przeglądarki nie przejdzie. Idzie przez tę funkcję, która
// przy okazji robi to, czego formularz w przeglądarce zrobić nie może:
// sprawdza zgody i zapisuje ICH TREŚĆ, a nie samo „true".
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/**
 * Treść zgód zapisywana RAZEM z kontaktem.
 *
 * Zgoda to nie jest pole „true". Gdy ktoś zapyta, na co się zgodził, musimy
 * pokazać zdanie, które widział — a ono zmienia się w czasie. Zapisujemy więc
 * brzmienie z chwili kliknięcia, nie odsyłacz do dzisiejszej wersji strony.
 */
const ZGODY = {
  dane: "Zgadzam się, żeby GETRIDO sp. z o.o. (NIP 5223377431) przetwarzała moje imię "
    + "i numer telefonu w celu kontaktu w sprawie wirtualnej asystentki AI.",
  telefon: "Zgadzam się na kontakt telefoniczny pod podanym numerem w sprawie oferty GETRIDO.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json().catch(() => ({}));
    const imie = String(body?.imie ?? "").trim().slice(0, 80);
    const telefon = String(body?.telefon ?? "").replace(/[\s\-()]/g, "").slice(0, 20);
    const zgodaDane = body?.zgoda_dane === true;
    const zgodaTelefon = body?.zgoda_telefon === true;

    if (imie.length < 2) return json({ error: "BRAK_IMIENIA", message: "Podaj imię." }, 400);
    if (!/^(\+?48)?\d{9}$/.test(telefon)) {
      return json({ error: "ZLY_NUMER", message: "Podaj numer telefonu — dziewięć cyfr." }, 400);
    }
    // Bez pierwszej zgody nie wolno nam zapisać nawet imienia.
    if (!zgodaDane) {
      return json({ error: "BRAK_ZGODY", message: "Bez zgody na przetwarzanie danych nie możemy zapisać kontaktu." }, 400);
    }

    // Numer demo bierzemy z BAZY, nie z kodu — przeniesienie dema na inny numer
    // to jeden UPDATE, bez wdrożenia.
    const { data: numer } = await admin
      .from("voice_numbers")
      .select("phone_number")
      .eq("demonstracyjny", true)
      .eq("status", "aktywny")
      .limit(1)
      .maybeSingle();

    if (!numer?.phone_number) {
      return json({ error: "BRAK_NUMERU", message: "Demo jest chwilowo niedostępne. Spróbuj później." }, 503);
    }

    /**
     * Piszemy do `leady`, nie do `marketing_leads`.
     *
     * Tamta tabela ma pięć własnych ścieżek zapisu (webhook Meta Ads, leady
     * zewnętrzne, synchronizacja, scoring AI, kolejka obdzwaniania) i własny
     * interfejs. Kontakt z dema wpadłby przy pierwszej kampanii do
     * automatycznego obdzwaniania razem z leadami reklamowymi.
     */
    const { error } = await admin.from("leady").insert({
      imie,
      telefon,
      zrodlo: "demo-agenta",
      // Osobna kolumna, bo to jest ZAKAZ, a nie szczegół: bez tej zgody
      // oddzwonienie jest naruszeniem.
      zgoda_telefon: zgodaTelefon,
      zgody: {
        dane: { udzielona: true, tresc: ZGODY.dane },
        telefon: { udzielona: zgodaTelefon, tresc: ZGODY.telefon },
        kiedy: new Date().toISOString(),
        skad: "/ai-agent",
      },
    });
    if (error) {
      console.error("[agent-demo-lead] zapis leada nieudany:", error.code, error.message);
      // Kontakt się nie zapisał, ale numer i tak wydajemy — człowiek zrobił
      // swoje, a nasza awaria nie może kosztować go możliwości posłuchania.
    }

    return json({ ok: true, numer: numer.phone_number, mozna_dzwonic: true });
  } catch (e) {
    console.error("[agent-demo-lead]", (e as Error).message);
    return json({ error: "BLAD", message: "Coś poszło nie tak. Spróbuj jeszcze raz." }, 500);
  }
});
