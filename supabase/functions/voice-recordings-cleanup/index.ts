// ============================================================================
// voice-recordings-cleanup — KASOWANIE STARYCH NAGRAŃ ROZMÓW.
//
// Nagranie jest potrzebne, dopóki sprawa jest otwarta: reklamacja, spór o to,
// co ustalono przez telefon. Potem to już tylko megabajty. Jedna dwuminutowa
// rozmowa waży ok. 2 MB, więc bez sprzątania koszyk rośnie w nieskończoność.
//
// Co znika, decyduje funkcja bazy voice_recordings_expired — cała arytmetyka
// dat siedzi tam, więc da się ją sprawdzić zapytaniem, bez uruchamiania
// kasowania. Domyślnie: 30 dni po zakończeniu zlecenia; nagranie znika też od
// razu razem z usuniętym zleceniem. Warsztat może to zmienić w tabeli
// voice_recording_retention.
//
// ZNIKA WYŁĄCZNIE PLIK AUDIO. Transkrypcja i podsumowanie zostają przy zleceniu
// na zawsze — ważą tyle co nic, a to one mówią, co zostało ustalone.
//
// dry_run pokazuje, co BY zniknęło, i nie rusza niczego.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhase1Secret } from "../_shared/voicePhase1SecretReader.ts";
import { corsHeaders } from "../_shared/cors.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const KOSZYK = "voice-recordings";
const PACZKA = 50;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Ta sama brama co w voice-call-reconcile: token z sejfu albo service-role.
    const expected = await getPhase1Secret(admin, "VOICE_LLM_TOKEN");
    const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const pelnyPrzebieg = provided === serviceRoleKey || (!!expected && provided === expected);

    // TRYB „PO USUNIĘCIU ZLECENIA". Panel woła to zaraz po skasowaniu zlecenia,
    // żeby nagranie znikło od razu — a panel ma tylko token zalogowanego
    // użytkownika, nie sekret nocnego sprzątania. Taki gość NIE decyduje, co jest
    // przeterminowane: opróżnia wyłącznie kolejkę SWOJEGO warsztatu, czyli
    // pliki, o których baza już orzekła, że mają zniknąć.
    if (!pelnyPrzebieg) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      if (!provided) return json({ error: "unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${provided}` } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "unauthorized" }, 401);

      const [{ data: wlasne }, { data: zatrudnienie }] = await Promise.all([
        admin.from("service_providers").select("id").eq("user_id", user.id),
        admin.from("workshop_employees").select("provider_id").eq("user_id", user.id).eq("status", "active"),
      ]);
      const moje = [...(wlasne || []).map((p: any) => p.id), ...(zatrudnienie || []).map((e: any) => e.provider_id)];
      if (!moje.length) return json({ nagrania_z_kolejki: 0 });

      const { data: kolejkaMoja } = await admin.from("voice_recordings_purge_queue")
        .select("id, path").in("provider_id", moje).limit(200);
      if (!kolejkaMoja?.length) return json({ nagrania_z_kolejki: 0 });

      const { error: qErr } = await admin.storage.from(KOSZYK).remove(kolejkaMoja.map((k) => k.path));
      if (qErr) return json({ nagrania_z_kolejki: 0, blad: qErr.message }, 500);
      await admin.from("voice_recordings_purge_queue").delete().in("id", kolejkaMoja.map((k) => k.id));
      return json({ nagrania_z_kolejki: kolejkaMoja.length, tryb: "kolejka" });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const limit = Math.min(Number(body?.limit) || 500, 2000);

    const { data: doUsuniecia, error } = await admin.rpc("voice_recordings_expired", { p_limit: limit });
    if (error) return json({ error: error.message }, 500);
    const lista = (doUsuniecia || []) as Array<{ call_id: string; provider_id: string; recording_path: string; powod: string }>;

    if (dryRun) {
      const { data: ileSierot } = await admin.rpc("voice_calls_orphans_count");
      return json({
        dry_run: true, nagrania_do_usuniecia: lista.length,
        przyklady: lista.slice(0, 10).map((r) => ({ rozmowa: r.call_id.slice(0, 8), powod: r.powod })),
        rozmowy_po_usunietych_zleceniach: ileSierot ?? null,
      });
    }

    let usuniete = 0;
    let bledy = 0;
    for (let i = 0; i < lista.length && lista.length > 0; i += PACZKA) {
      const paczka = lista.slice(i, i + PACZKA);
      const { error: delErr } = await admin.storage.from(KOSZYK).remove(paczka.map((r) => r.recording_path));
      if (delErr) {
        // Nie oznaczamy jako usunięte czegoś, co nadal leży w koszyku — inaczej
        // plik zostałby na dysku na zawsze, bo nikt by go już nie wytypował.
        bledy += paczka.length;
        console.error("[voice-recordings-cleanup]", JSON.stringify({ event: "storage_remove_failed", ile: paczka.length, error: delErr.message }));
        continue;
      }
      const { error: updErr } = await admin.from("voice_calls").update({
        recording_path: null, recording_status: "deleted", recording_deleted_at: new Date().toISOString(),
      }).in("id", paczka.map((r) => r.call_id));
      if (updErr) {
        bledy += paczka.length;
        console.error("[voice-recordings-cleanup]", JSON.stringify({ event: "mark_failed", error: updErr.message }));
        continue;
      }
      usuniete += paczka.length;
    }

    // KOLEJKA PO USUNIĘTYCH ZLECENIACH. Wiersz rozmowy kasuje wyzwalacz w tej
    // samej chwili co zlecenie, ale do koszyka baza nie sięga — ścieżkę pliku
    // zostawia więc tutaj. Wołane zaraz po usunięciu zlecenia, żeby nagranie
    // znikało od razu, a nie następnej nocy.
    let zKolejki = 0;
    const { data: kolejka } = await admin.from("voice_recordings_purge_queue")
      .select("id, path").limit(500);
    if (kolejka?.length) {
      const { error: qErr } = await admin.storage.from(KOSZYK).remove(kolejka.map((k) => k.path));
      if (qErr) {
        console.error("[voice-recordings-cleanup]", JSON.stringify({ event: "queue_remove_failed", error: qErr.message }));
      } else {
        await admin.from("voice_recordings_purge_queue").delete().in("id", kolejka.map((k) => k.id));
        zKolejki = kolejka.length;
      }
    }

    // DRUGI KROK: rozmowy po usuniętych zleceniach. Dopiero teraz, gdy plik audio
    // jest już z koszyka usunięty — inaczej zostałby tam na zawsze, bo bez wiersza
    // nikt by nie wiedział, że tam leży.
    const { data: skasowaneRozmowy, error: purgeErr } = await admin.rpc("voice_calls_purge_orphans", { p_limit: 500 });
    if (purgeErr) console.error("[voice-recordings-cleanup]", JSON.stringify({ event: "purge_failed", error: purgeErr.message }));

    console.info("[voice-recordings-cleanup]", JSON.stringify({
      event: "sprzatanie", usuniete, bledy, z_kolejki: zKolejki, rozmowy_skasowane: skasowaneRozmowy ?? 0,
    }));
    return json({
      usuniete, blad_kasowania: bledy, nagrania_z_kolejki: zKolejki,
      rozmowy_po_usunietych_zleceniach: skasowaneRozmowy ?? 0,
      blad_kasowania_rozmow: purgeErr?.message || null,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
