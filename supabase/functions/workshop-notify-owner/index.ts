// Powiadomienie właściciela warsztatu, że pula czegoś się skończyła.
//
// Powstało dla trzeciego poziomu rozliczania VIN: pracownik, któremu pula firmy
// się wyczerpała, ma móc poprosić o doładowanie zamiast dokładać z własnej
// kieszeni albo przerywać pracę.
//
// ŚWIADOMIE BEZ SMS-a. Powiadomienie idzie wyłącznie do panelu. Wysyłka SMS-a
// kosztuje jednostkę z puli SMS — wydawanie pieniędzy po to, żeby powiedzieć
// „skończyły się pieniądze", to najgorszy możliwy moment na taki koszt.
//
// `verify_jwt = false` w config.toml (konwencja projektu), więc autoryzacja
// jest TUTAJ i jest fail-closed: bez ważnego tokenu i bez potwierdzonego
// zatrudnienia w tym warsztacie nie wysyłamy nic.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type Powod = 'vehicle_lookup_wyczerpane' | 'sms_wyczerpane';

const TRESCI: Record<Powod, { title: string; body: string }> = {
  vehicle_lookup_wyczerpane: {
    title: 'Skończyły się sprawdzenia pojazdów',
    body: 'Pracownik nie może sprawdzić pojazdu po VIN — pula warsztatu jest pusta. Doładuj pakiet w panelu.',
  },
  sms_wyczerpane: {
    title: 'Skończyły się SMS-y',
    body: 'Pula SMS-ów warsztatu jest pusta — powiadomienia do klientów nie wychodzą. Doładuj pakiet w panelu.',
  },
};

// Jedno powiadomienie tego samego rodzaju na godzinę. Bez tego pięciu mechaników
// klikających ten sam przycisk zasypie właściciela i nauczy go ignorować dzwonek.
const ODSTEP_MINUT = 60;

function json(tresc: unknown, status = 200) {
  return new Response(JSON.stringify(tresc), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Brak autoryzacji" }, 401);

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !serviceKey) return json({ error: "Funkcja nieskonfigurowana" }, 503);

    const jako = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(url, serviceKey);

    const { data: { user }, error: bladAuth } = await jako.auth.getUser();
    if (bladAuth || !user) return json({ error: "Nieautoryzowany" }, 401);

    const { providerId, powod } = await req.json().catch(() => ({}));
    if (!providerId || !(powod in TRESCI)) return json({ error: "Brak providerId lub nieznany powód" }, 400);

    const { data: warsztat } = await admin
      .from("service_providers")
      .select("id, user_id, company_name")
      .eq("id", providerId)
      .maybeSingle();
    if (!warsztat?.user_id) return json({ error: "Nie znaleziono warsztatu" }, 404);

    // Prosić może wyłącznie ktoś, kto w tym warsztacie pracuje.
    const { data: pracownik } = await admin
      .from("workshop_employees")
      .select("id, name")
      .eq("provider_id", providerId)
      .eq("user_id", user.id)
      .is("removed_at", null)
      .maybeSingle();

    const jestWlascicielem = warsztat.user_id === user.id;
    if (!pracownik && !jestWlascicielem) return json({ error: "Brak uprawnień" }, 403);

    // Właściciel nie wysyła powiadomienia sam do siebie.
    if (jestWlascicielem) return json({ ok: true, pominieto: "wlasciciel" });

    const tresc = TRESCI[powod as Powod];

    const { data: ostatnie } = await admin
      .from("workspace_notifications")
      .select("id, created_at")
      .eq("user_id", warsztat.user_id)
      .eq("type", `pula_${powod}`)
      .gte("created_at", new Date(Date.now() - ODSTEP_MINUT * 60_000).toISOString())
      .limit(1)
      .maybeSingle();

    if (ostatnie) return json({ ok: true, pominieto: "juz_wyslane" });

    const { error: bladZapisu } = await admin.from("workspace_notifications").insert({
      user_id: warsztat.user_id,
      type: `pula_${powod}`,
      title: tresc.title,
      body: tresc.body,
      sender_user_id: user.id,
      sender_name: pracownik?.name ?? null,
      is_read: false,
    });
    if (bladZapisu) return json({ error: "Nie udało się zapisać powiadomienia" }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Błąd" }, 500);
  }
});
