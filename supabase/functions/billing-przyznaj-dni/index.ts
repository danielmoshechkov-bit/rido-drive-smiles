/**
 * Przyznanie dni dostępu z panelu administratora.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO FUNKCJA BRZEGOWA, A NIE ZAPIS Z PRZEGLĄDARKI
 * ═══════════════════════════════════════════════════════════════════════════
 * To jest zapis, który daje DOSTĘP — czyli dokładnie ta klasa operacji, przy
 * której siedemnaście funkcji `SECURITY DEFINER` było kiedyś wywoływalnych
 * przez zalogowanego klienta (patrz CLAUDE.md, `REVOKE ... FROM public`).
 * `billing_przyznaj_dni_admin` jest odcięta od `anon` i `authenticated`
 * z nazwy; wykonać ją może wyłącznie `service_role`, czyli ta funkcja.
 *
 * Rolę sprawdzamy TUTAJ, bo `verify_jwt = false` — brama Supabase nie
 * sprawdza niczego. Dwie drogi wejścia, tak samo jak w `billing-stripe-sync`:
 * token administratora platformy albo klucz serwisowy (do napraw z konsoli).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * GRANICE SĄ W BAZIE, NIE TUTAJ
 * ═══════════════════════════════════════════════════════════════════════════
 * 1–365 dni, istnienie subskrypcji, doklejanie do ważnej daty — wszystko
 * sprawdza funkcja w bazie. Ta funkcja tylko tłumaczy jej wyjątki na zdania,
 * które administrator zrozumie. Powtórzenie warunków tutaj dałoby drugie
 * miejsce na tę samą decyzję i pierwszą okazję, żeby się rozjechały.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const json = (dane: unknown, status = 200) =>
  new Response(JSON.stringify(dane), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Wyjątki z bazy → zdania dla człowieka. Kody niesie sama treść wyjątku. */
function komunikat(blad: string): { kod: string; zdanie: string; status: number } {
  if (blad.includes("ZLA_LICZBA_DNI")) {
    return { kod: "ZLA_LICZBA_DNI", zdanie: "Liczba dni musi mieścić się w zakresie 1–365.", status: 400 };
  }
  if (blad.includes("ZLA_LINIA")) {
    return { kod: "ZLA_LINIA", zdanie: "Nieznana linia produktowa.", status: 400 };
  }
  if (blad.includes("BRAK_SUBSKRYPCJI")) {
    return {
      kod: "BRAK_SUBSKRYPCJI",
      zdanie: "To konto nie ma jeszcze subskrypcji w tej linii — najpierw wybierz dla niego plan.",
      status: 409,
    };
  }
  return { kod: "BLAD", zdanie: "Nie udało się przyznać dni. Szczegóły w dzienniku funkcji.", status: 500 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const kluczSerwisowy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(supabaseUrl, kluczSerwisowy, { auth: { persistSession: false } });

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    let actorId: string | null = null;
    const zKluczaSerwisowego = kluczSerwisowy.length > 0 && token === kluczSerwisowy;

    if (!zKluczaSerwisowego) {
      const jako = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: kto } = await jako.auth.getUser(token);
      if (!kto?.user) return json({ error: "Unauthorized" }, 401);

      const { data: rola, error: bladRoli } = await admin
        .from("user_roles").select("role")
        .eq("user_id", kto.user.id).eq("role", "platform_admin").maybeSingle();
      // Błąd odczytu roli to „nie wiem", a nie „wpuść" — przy nadawaniu dostępu
      // niewiedza zamyka.
      if (bladRoli) {
        console.error("billing-przyznaj-dni: nie można potwierdzić roli", bladRoli);
        return json({ error: "Nie można potwierdzić uprawnień" }, 503);
      }
      if (!rola) return json({ error: "Forbidden" }, 403);
      actorId = kto.user.id;
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const linia = String(body.linia ?? "");

    /**
     * Panel administratora szuka po e-mailu i zna `user_id`, nie warsztat.
     * Rozwiązujemy go TU, tą samą regułą co reszta aplikacji (najstarszy
     * warsztat konta) — żeby panel i serwer nie mogły wskazać różnych firm.
     */
    let subscriberId = String(body.subscriber_id ?? "");
    if (!subscriberId && body.user_id) {
      const { data: warsztat } = await admin
        .from("service_providers").select("id")
        .eq("user_id", String(body.user_id))
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (!warsztat?.id) {
        return json({ error: "BRAK_WARSZTATU", message: "To konto nie ma warsztatu." }, 409);
      }
      subscriberId = warsztat.id as string;
    }
    const dni = Number(body.dni);
    const powod = typeof body.powod === "string" && body.powod.trim() ? body.powod.trim().slice(0, 500) : null;

    if (!subscriberId || !linia) return json({ error: "BRAK_DANYCH" }, 400);

    const { data, error } = await (admin as any).rpc("billing_przyznaj_dni_admin", {
      p_subscriber_id: subscriberId,
      p_linia: linia,
      p_dni: Number.isFinite(dni) ? Math.trunc(dni) : null,
      p_powod: powod,
      p_actor: actorId,
    });

    if (error) {
      const k = komunikat(error.message ?? "");
      console.error(JSON.stringify({
        event: "dni_odmowa", kod: k.kod, subscriber: subscriberId, linia, dni,
        blad: String(error.message ?? "").slice(0, 200),
      }));
      return json({ error: k.kod, message: k.zdanie }, k.status);
    }

    console.log(JSON.stringify({
      event: "dni_przyznane", subscriber: subscriberId, linia, dni,
      actor: actorId ?? "klucz serwisowy", nowy_koniec: (data as any)?.nowy_koniec ?? null,
    }));
    return json({ ok: true, wynik: data });
  } catch (e) {
    console.error("billing-przyznaj-dni:", e);
    return json({ error: "BLAD", message: "Nie udało się przyznać dni." }, 500);
  }
});
