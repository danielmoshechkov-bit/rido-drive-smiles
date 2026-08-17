// ============================================================================
// voice-number-activate — WARSZTAT PROSI O NUMER.
//
// Dlaczego osobna funkcja, a nie zapis z panelu: kolejka `voice_number_jobs`
// jest przed warsztatem ZAMKNIĘTA (tylko odczyt admina). W jej wierszach są
// treści błędów operatora i identyfikatory naszego konta, a jedno z zadań
// KUPUJE NUMER za prawdziwe pieniądze. Wpuszczenie tam klienta zapisem
// znaczyłoby, że kolejność i liczba zakupów zależy od tego, ile razy ktoś
// kliknie.
//
// Funkcja robi trzy rzeczy i nic więcej:
//   status   — co warsztat ma w tej chwili (numer albo etap aktywacji),
//   aktywuj  — zakłada JEDNO zadanie, albo oddaje to, które już jest,
//   miasto   — wymusza podanie miasta, jeśli go nie mamy.
//
// MIASTO JEST WYMAGANE, i to nie jest formalność: `company_city` jest w bazie
// puste u większości warsztatów, a telefony to komórki, z których nie da się
// odczytać strefy. Bez miasta warsztat z Gdańska dostałby numer warszawski
// i wyglądałby dla swojego klienta jak obca firma.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/**
 * Etapy pokazywane warsztatowi. Nazwy techniczne zostają u nas.
 *
 * ŻADNEGO OPTYMIZMU, GDY NIE WIEMY, CZY COŚ SIĘ DZIEJE. Pierwsza wersja
 * mówiła „zaraz się zaczniemy tym zajmować" na status `oczekuje` — a zadanie
 * stało zaparkowane, bo czekało na naszą zgodę na pierwszy zakup. Po dwóch
 * minutach takiego „zaraz" komunikat brzmi jak awaria, a warsztat odświeża
 * stronę albo klika drugi raz.
 */
const ETAPY: Record<string, string> = {
  oczekuje: "W kolejce. Numer przygotowujemy zwykle do godziny.",
  w_toku: "Przygotowujemy numer…",
  czeka_na_zgode: "Przygotowujemy numer — zwykle do godziny.",
  wymaga_uwagi: "Coś poszło nie tak — już to sprawdzamy, odezwiemy się.",
  zrobione: "Gotowe.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "brak autoryzacji" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  // Klient Z TOKENEM UŻYTKOWNIKA — po to, żeby to baza rozstrzygała, do których
  // warsztatów ten człowiek ma prawo. Sprawdzanie tego w kodzie funkcji
  // znaczyłoby powielenie reguły, która już istnieje w RLS.
  const jako = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: uzytkownik, error: bladUzytkownika } = await jako.auth.getUser();
  if (bladUzytkownika || !uzytkownik?.user) return json({ error: "nieautoryzowane" }, 401);

  const { data: moje, error: bladProv } = await jako.rpc("get_user_provider_ids", { p_user_id: uzytkownik.user.id });
  if (bladProv) {
    console.error("[voice-number-activate] odczyt warsztatow nieudany:", bladProv.code, bladProv.message);
    return json({ error: "nie udalo sie ustalic warsztatu" }, 500);
  }
  const providerId = Array.isArray(moje) ? (moje[0]?.get_user_provider_ids ?? moje[0]) : null;
  if (!providerId) return json({ error: "konto nie jest powiazane z zadnym warsztatem" }, 403);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const akcja = String(body?.akcja ?? "status");

  const stan = async () => {
    const [{ data: numer }, { data: zadanie }] = await Promise.all([
      admin.from("voice_numbers").select("phone_number, status")
        .eq("provider_id", providerId).in("status", ["aktywny", "przypisywany"]).maybeSingle(),
      admin.from("voice_number_jobs").select("status, krok, created_at")
        .eq("provider_id", providerId).eq("typ", "aktywacja")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const { data: sp } = await admin.from("service_providers")
      .select("company_city").eq("id", providerId).maybeSingle();
    // ZADANIE AKTYWACJI CZĘSTO CZEKA NA COŚ INNEGO niż na siebie: na numer
    // z puli, a pula na naszą zgodę przy pierwszym zakupie. Status samego
    // zadania aktywacji mówi wtedy „oczekuje" i nie ma w tym ani słowa prawdy
    // o tym, dlaczego nic się nie dzieje. Dlatego czytamy też zadanie puli.
    const { data: pula } = await admin.from("voice_number_jobs")
      .select("status").eq("typ", "uzupelnienie_puli")
      .in("status", ["oczekuje", "w_toku", "czeka_na_zgode"]).limit(1).maybeSingle();
    const etap = zadanie
      ? (pula && zadanie.status === "oczekuje" ? ETAPY.czeka_na_zgode : (ETAPY[zadanie.status] ?? zadanie.status))
      : null;
    return {
      numer: numer?.phone_number ?? null,
      status_numeru: numer?.status ?? null,
      zadanie: zadanie ? { status: zadanie.status, etap: etap as string } : null,
      miasto: sp?.company_city ?? null,
      // Panel musi wiedzieć, że ma zapytać o miasto, ZANIM pokaże przycisk —
      // inaczej pierwsze kliknięcie kończy się odmową i wygląda jak awaria.
      wymaga_miasta: !numer && !sp?.company_city,
    };
  };

  if (akcja === "status") return json(await stan());

  if (akcja !== "aktywuj") return json({ error: `nieznana akcja: ${akcja}` }, 400);

  const obecny = await stan();
  // DRUGIE KLIKNIĘCIE NIE ZAKŁADA DRUGIEGO ZADANIA. Baza i tak by na to nie
  // pozwoliła (indeks częściowy), ale warsztat ma zobaczyć swój stan, a nie
  // komunikat o naruszeniu klucza.
  if (obecny.numer) return json({ ...obecny, uwaga: "numer juz przypisany" });
  if (obecny.zadanie && ["oczekuje", "w_toku", "czeka_na_zgode"].includes(obecny.zadanie.status)) {
    return json({ ...obecny, uwaga: "aktywacja juz trwa" });
  }

  const miasto = String(body?.miasto ?? "").trim();
  if (!obecny.miasto && miasto.length < 2) {
    return json({ ...obecny, error: "Podaj miasto — numer dobierzemy z Twojego regionu." }, 400);
  }
  if (miasto.length >= 2 && miasto !== obecny.miasto) {
    const { error } = await admin.from("service_providers").update({ company_city: miasto }).eq("id", providerId);
    if (error) console.error("[voice-number-activate] zapis miasta nieudany:", error.code, error.message);
  }

  const { error: bladZadania } = await admin.from("voice_number_jobs")
    .insert({ typ: "aktywacja", provider_id: providerId, dane: { zrodlo: "panel", uzytkownik: uzytkownik.user.id } });
  if (bladZadania && bladZadania.code !== "23505") {
    console.error("[voice-number-activate] zalozenie zadania nieudane:", bladZadania.code, bladZadania.message);
    return json({ error: "nie udalo sie rozpoczac aktywacji" }, 500);
  }
  console.info("[voice-number-activate]", JSON.stringify({
    event: "aktywacja_zlecona", provider_id: providerId, duplikat: bladZadania?.code === "23505",
  }));
  return json({ ...(await stan()), uwaga: "aktywacja rozpoczeta" });
});
