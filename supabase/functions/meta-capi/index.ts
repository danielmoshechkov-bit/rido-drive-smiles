/**
 * Conversions API — serwerowa kopia zdarzenia zakupu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KTO TO WOŁA
 * ═══════════════════════════════════════════════════════════════════════════
 * WYŁĄCZNIE `billing-payu-webhook`, kluczem serwisowym, w chwili WYDANIA
 * zamówienia. Nie front — bo cały sens tej funkcji polega na tym, że działa
 * także wtedy, gdy przeglądarka nigdy nie wróci.
 *
 * `verify_jwt = false` w konfiguracji, więc bramka jest tutaj: bez klucza
 * serwisowego funkcja odmawia. Bez tego ktokolwiek mógłby dopisywać nam
 * konwersje do konta reklamowego.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ZGODA OBOWIĄZUJE TAK SAMO PO STRONIE SERWERA
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 CAPI NIE OMIJA RODO. Klient, który odmówił zgody marketingowej, nie ma
 * `fbp` ani `fbc` — piksel się u niego nie uruchomił, więc nie zapisaliśmy
 * ich przy rozpoczęciu zakupu.
 *
 * Dlatego brak OBU ciasteczek traktujemy jak brak zgody i NIE WYSYŁAMY
 * niczego, nawet gdy znamy adres z konta. To jest zamierzone: adres znamy
 * z umowy o świadczenie usługi, nie ze zgody na marketing.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NIEUDANA WYSYŁKA NIE MA PRAWA NICZEGO WYWRÓCIĆ
 * ═══════════════════════════════════════════════════════════════════════════
 * Zamówienie jest już wydane, klient ma swoje jednostki. Awaria Meta,
 * przeterminowany token czy zmiana ich API nie mogą wpłynąć na wynik
 * webhooka — stąd wywołujący ma to wołać bez czekania i bez sprawdzania.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { wartoWyslac, zbudujZdarzenieZakupu } from "../_shared/capiLadunek.ts";

/** Wersja API Meta. Podnosić świadomie — starsze wersje wygasają. */
const WERSJA_API = "v21.0";

const json = (dane: unknown, status = 200) =>
  new Response(JSON.stringify(dane), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Porównanie odporne na czas — klucz serwisowy sprawdzamy jak hasło. */
function rowneStale(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const podany = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!serviceKey || !podany || !rowneStale(podany, serviceKey)) {
    return json({ error: "BRAK_UPRAWNIEN" }, 401);
  }

  const idPiksela = Deno.env.get("META_PIXEL_ID") ?? "";
  const token = Deno.env.get("META_CAPI_TOKEN") ?? "";
  if (!idPiksela || !token) {
    // Brak sekretów to stan konfiguracji, nie awaria — mówimy o tym wprost
    // i kończymy powodzeniem, żeby nie zaśmiecać dziennika webhooka.
    console.log(JSON.stringify({ event: "capi_pominiete", powod: "brak_sekretow" }));
    return json({ pominiete: "brak_sekretow" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "ZLE_CIALO" }, 400);
  }

  const idZamowienia = String(body.order_id ?? "");
  if (!idZamowienia) return json({ error: "BRAK_ORDER_ID" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey,
    { auth: { persistSession: false } },
  );

  // Wszystko czytamy z bazy, nie z ciała żądania — wywołujący podaje wyłącznie
  // identyfikator. Kwota wzięta z żądania dałaby się podmienić.
  const { data: zam } = await (admin as any)
    .from("billing_orders")
    .select("id, amount_gross, currency, meta_fbp, meta_fbc, subscriber_id, user_id")
    .eq("id", idZamowienia)
    .maybeSingle();

  if (!zam) return json({ error: "NIE_MA_ZAMOWIENIA" }, 404);

  if (!zam.meta_fbp && !zam.meta_fbc) {
    // Patrz nagłówek: brak obu ciasteczek znaczy, że piksel się nie uruchomił,
    // czyli nie było zgody marketingowej.
    console.log(JSON.stringify({ event: "capi_pominiete", powod: "brak_zgody", order: idZamowienia }));
    return json({ pominiete: "brak_zgody" });
  }

  /**
   * 🔴 NAZWY KOLUMN SPRAWDZONE W BAZIE, NIE ZGADNIĘTE.
   *
   * Pierwsza wersja pytała o `phone`, którego `service_providers` nie ma.
   * PostgREST odrzuca CAŁY select przy jednej nieznanej kolumnie, więc razem
   * z telefonem znikał adres — czyli najmocniejszy sygnał dopasowania. Bez
   * błędu w niczym: zdarzenie wychodziło dalej, tylko z samym `fbp`.
   *
   * Dlatego czytamy też `error`: brak nabywcy ma zostawić ślad, a nie po
   * cichu obniżyć jakość dopasowania.
   */
  const { data: nabywca, error: bladNabywcy } = await (admin as any)
    .from("service_providers")
    .select("company_email, owner_email, company_phone, owner_phone")
    .eq("id", zam.subscriber_id)
    .maybeSingle();

  if (bladNabywcy) {
    console.error("meta-capi: nie odczytano nabywcy", bladNabywcy.message);
  }

  const zdarzenie = await zbudujZdarzenieZakupu({
    idZamowienia: zam.id,
    email: nabywca?.company_email || nabywca?.owner_email || null,
    telefon: nabywca?.company_phone || nabywca?.owner_phone || null,
    kwotaBrutto: Number(zam.amount_gross ?? 0),
    waluta: zam.currency,
    fbp: zam.meta_fbp,
    fbc: zam.meta_fbc,
    adresIp: typeof body.client_ip === "string" ? body.client_ip : null,
    przegladarka: typeof body.user_agent === "string" ? body.user_agent : null,
    adresStrony: typeof body.source_url === "string" ? body.source_url : null,
  });

  if (!wartoWyslac(zdarzenie)) {
    console.log(JSON.stringify({ event: "capi_pominiete", powod: "brak_uchwytu", order: idZamowienia }));
    return json({ pominiete: "brak_uchwytu" });
  }

  try {
    const odp = await fetch(
      `https://graph.facebook.com/${WERSJA_API}/${idPiksela}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [zdarzenie], access_token: token }),
      },
    );
    const wynik = await odp.json().catch(() => ({}));

    // `events_received` to jedyna liczba, która mówi, że Meta to przyjęła.
    // Kod 200 bez niej znaczy, że coś odrzucono po cichu.
    console.log(JSON.stringify({
      event: odp.ok ? "capi_wyslane" : "capi_blad",
      order: idZamowienia,
      http: odp.status,
      przyjete: (wynik as any)?.events_received ?? 0,
      blad: odp.ok ? undefined : String((wynik as any)?.error?.message ?? "").slice(0, 200),
    }));

    return json({ wyslane: odp.ok, przyjete: (wynik as any)?.events_received ?? 0 });
  } catch (e) {
    console.error("meta-capi: wysyłka nie doszła", e);
    return json({ wyslane: false, blad: "siec" });
  }
});
