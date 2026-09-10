/**
 * Kto może wołać `ksef-integration` — i do czyich dokumentów.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 POWÓD ISTNIENIA (10.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * `ksef-integration` miała `verify_jwt = false` i ZERO kontroli w kodzie.
 * `getUserFromJwt` zwracała `null` przy braku tokenu i funkcja szła dalej:
 * gdy w ciele było `invoice_id`, tożsamość ustalała się z
 * `user_invoices.user_id` TEJ FAKTURY, po czym używano tokenu KSeF jej
 * właściciela.
 *
 * Znając identyfikator faktury albo encji dało się z zewnątrz:
 *   • WYSŁAĆ CUDZĄ FAKTURĘ DO KSEF cudzym tokenem — nieodwracalnie,
 *   • odczytać jej pełny XML FA(3): nabywca, NIP, adres, kwoty,
 *   • odczytać i NADPISAĆ `ksef_settings` wskazanej encji,
 *   • pobrać UPO i status.
 *
 * Identyfikatory to UUID-y, więc nie dało się tego przeglądać masowo — ale
 * wyciekają adresami, mailami i logami, a `send` jest nieodwracalny.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TRZY DROGI, KAŻDA JAWNA
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. WEWNĘTRZNA — klucz `service_role` w nagłówku. Tak woła
 *    `billing-invoice-issue` po wystawieniu faktury platformy. Pełny dostęp,
 *    bo ten kanał jest osiągalny wyłącznie z naszych funkcji brzegowych.
 * 2. ADMINISTRATOR — rola z `user_roles`, nie z tokenu. Zarządza ustawieniami
 *    KSeF w panelu i musi widzieć dokumenty klientów przy pomocy.
 * 3. WŁAŚCICIEL — zalogowany użytkownik, ale WYŁĄCZNIE do swoich dokumentów
 *    i swoich encji.
 *
 * Fail-closed: brak tokenu, zły token, błąd odczytu — odmowa. Nie ma ścieżki,
 * w której brak wiedzy przepuszcza.
 */
import { corsHeaders } from "./cors.ts";

export type RodzajWywolujacego = "internal" | "admin" | "user";

export interface DostepKsef {
  rodzaj: RodzajWywolujacego;
  /** `null` dla kanału wewnętrznego — nie ma tam człowieka. */
  userId: string | null;
}

const odmowa = (status: number, komunikat: string): Response =>
  new Response(JSON.stringify({ success: false, error: komunikat }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Porównanie sekretów w stałym czasie. Zwykłe `===` na tajnym ciągu
 * przecieka jego długość i prefiks przez czas odpowiedzi.
 */
async function sekretyZgodne(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let rozne = 0;
  for (let i = 0; i < x.length; i++) rozne |= x[i] ^ y[i];
  return rozne === 0;
}

/**
 * Ustala, kim jest wywołujący, i sprawdza, czy wolno mu ruszyć wskazany zasób.
 *
 * Zwraca gotową odpowiedź odmowną — wołający ma ją po prostu zwrócić.
 */
export async function sprawdzDostepKsef(
  req: Request,
  admin: any,
  body: Record<string, unknown>,
  serviceKey: string,
): Promise<{ ok: true; kto: DostepKsef } | { ok: false; odp: Response }> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, odp: odmowa(401, "Musisz być zalogowany.") };

  // ── 1. kanał wewnętrzny ──
  if (await sekretyZgodne(token, serviceKey)) {
    return { ok: true, kto: { rodzaj: "internal", userId: null } };
  }

  // ── 2. tożsamość ──
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return { ok: false, odp: odmowa(401, "Musisz być zalogowany.") };

  const { data: role, error: bladRol } = await admin
    .from("user_roles").select("role").eq("user_id", user.id);
  if (bladRol) {
    console.error("ksefDostep: nie udało się odczytać ról", bladRol);
    return { ok: false, odp: odmowa(503, "Nie można zweryfikować uprawnień.") };
  }
  const jestAdmin = ((role ?? []) as Array<{ role: string }>).some((r) => r.role === "admin");

  // ── 3. własność zasobu ──
  // Administrator pomija tę kontrolę świadomie: zarządza ustawieniami KSeF
  // i pomaga klientom przy odrzuconych dokumentach.
  if (!jestAdmin) {
    const invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : null;
    if (invoiceId) {
      const { data: f, error: bladF } = await admin
        .from("user_invoices").select("user_id").eq("id", invoiceId).maybeSingle();
      if (bladF) {
        console.error("ksefDostep: nie udało się odczytać faktury", bladF);
        return { ok: false, odp: odmowa(503, "Nie można zweryfikować uprawnień.") };
      }
      // Identyczna odmowa dla „nie ma takiej faktury" i „nie twoja" — inaczej
      // różnica w odpowiedzi mówiłaby, które identyfikatory istnieją.
      if (!f || f.user_id !== user.id) {
        console.warn(`ksefDostep: odmowa dostępu do faktury ${invoiceId} dla ${user.id}`);
        return { ok: false, odp: odmowa(403, "Brak dostępu do tego dokumentu.") };
      }
    }

    const entityId = typeof body.entity_id === "string" ? body.entity_id : null;
    if (entityId) {
      const { data: e, error: bladE } = await admin
        .from("entities").select("owner_user_id").eq("id", entityId).maybeSingle();
      if (bladE) {
        console.error("ksefDostep: nie udało się odczytać encji", bladE);
        return { ok: false, odp: odmowa(503, "Nie można zweryfikować uprawnień.") };
      }
      if (!e || e.owner_user_id !== user.id) {
        console.warn(`ksefDostep: odmowa dostępu do encji ${entityId} dla ${user.id}`);
        return { ok: false, odp: odmowa(403, "Brak dostępu do tego wystawcy.") };
      }
    }
  }

  return { ok: true, kto: { rodzaj: jestAdmin ? "admin" : "user", userId: user.id } };
}
