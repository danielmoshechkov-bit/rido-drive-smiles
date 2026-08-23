// Faktura sprzedażowa GetRido — wystawiana po opłaconej płatności.
//
// Kierunek odwrotny niż reszta modułu faktur: nie warsztat wystawia swojemu
// klientowi, tylko GETRIDO sp. z o.o. wystawia warsztatowi za abonament.
// Silnik jest ten sam, bo wszystko w nim wisi przy `user_id` — wystarczy konto
// platformowe wskazane w `billing_settings.platform_invoice_user_id`.
//
// IDEMPOTENCJA jest tu ważniejsza niż gdziekolwiek indziej. `invoice.paid`
// przychodzi wielokrotnie, a faktury nie da się cofnąć: po wysyłce do KSeF
// wchodzi do ewidencji i jedyną drogą wyjścia jest korekta. Dlatego jedna
// płatność = jeden wiersz, pilnowany unikalnym indeksem na
// `external_payment_ref`, a nie sprawdzeniem „czy już jest" przed zapisem.
//
// NUMERACJA liczona modułem współdzielonym z frontem
// (`_shared/invoiceNumbering.ts`). Dwie implementacje rozjechałyby się przy
// pierwszej zmianie wzoru, a skutkiem byłyby dwie faktury o tym samym numerze.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { generateInvoiceHtml, type InvoiceData } from "../_shared/invoiceHtml.ts";
import { buildPublicUrl } from "../_shared/publicUrl.ts";
import {
  buildInvoiceNumber,
  DEFAULT_NUMBERING,
  extractSeq,
  nextSeq,
  seriesLike,
  type NumberingConfig,
  type NumberingMode,
  type NumberingPattern,
} from "../_shared/invoiceNumbering.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** Ile razy próbujemy nadać numer, gdy równoległy zapis zajmie nam ten sam. */
const PROB_NUMERU = 5;

interface Pozycja {
  name: string;
  quantity: number;
  unit: string;
  /** Cena netto — gdy sprzedajemy „od netto". */
  unit_net_price?: number;
  /**
   * Cena BRUTTO — gdy kwota jest z góry ustalona i musi się zgodzić co do grosza.
   * Tak jest przy subskrypcjach: operator pobrał konkretną kwotę brutto i to ona
   * rozstrzyga. Liczymy wtedy „w stu": netto = brutto / (1 + stawka), a VAT jako
   * RÓŻNICĘ, nie z osobnego mnożenia — inaczej suma faktury potrafi rozejść się
   * z obciążeniem o grosz, a faktura ma się zgadzać z tym, co klient zapłacił.
   */
  unit_gross_price?: number;
  vat_rate: number;
}

const zaokr = (v: number) => Math.round(v * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Wywołanie wyłącznie wewnętrzne: z webhooka albo ręcznie przy naprawie.
  // Klucz serwisowy w nagłówku jest jedyną drogą — ta funkcja wystawia dokumenty
  // księgowe w imieniu spółki i nie ma trybu „dla zalogowanego użytkownika".
  const podany = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (podany !== serviceKey) return json({ error: "Unauthorized" }, 401);

  try {
    const body = (await req.json().catch(() => null) ?? {}) as Record<string, any>;

    const ref: string = String(body?.external_payment_ref ?? "").trim();
    const pozycje: Pozycja[] = Array.isArray(body?.items) ? body.items : [];
    if (!ref) return json({ error: "Brak external_payment_ref" }, 400);
    if (!pozycje.length) return json({ error: "Faktura bez pozycji" }, 400);

    // ------------------------------------------------ 1. czy już wystawiona
    // Sprawdzenie wcześniej to wygoda (czytelna odpowiedź, brak zbędnej pracy),
    // nie zabezpieczenie — właściwym zabezpieczeniem jest unikalny indeks niżej.
    const { data: istnieje } = await admin
      .from("user_invoices")
      .select("id, invoice_number")
      .eq("external_payment_ref", ref)
      .maybeSingle();
    if (istnieje) {
      return json({ ok: true, duplicate: true, invoice_id: istnieje.id, invoice_number: istnieje.invoice_number });
    }

    // ---------------------------------------------- 2. kto wystawia fakturę
    const { data: ustawienia } = await admin
      .from("billing_settings")
      .select("platform_invoice_user_id, platform_invoice_company_id")
      .eq("id", true)
      .maybeSingle();

    const platformUserId = ustawienia?.platform_invoice_user_id;
    if (!platformUserId) {
      // Fail-closed: bez wskazanego konta nie zgadujemy, kto jest sprzedawcą.
      console.error("billing-invoice-issue: brak platform_invoice_user_id w billing_settings");
      return json({ error: "PLATFORM_ACCOUNT_NOT_CONFIGURED" }, 503);
    }

    /**
     * FIRMA WSKAZANA JAWNIE, NIE „DOMYŚLNA".
     *
     * 🔴 POPRAWIONE 23.08.2026 — na tym wywróciło się pierwsze wystawienie.
     * Konto administratora ma kilka firm: prywatną i spółki. „Domyślna" mówi,
     * którą podpowiedzieć w kreatorze faktury, a nie która jest sprzedawcą
     * GetRido — i wskazała prywatną, bez NIP-u. Odmowa była słuszna, ale
     * przyczyna przypadkowa: przestawienie domyślnej w kreatorze zmieniałoby
     * sprzedawcę na fakturach platformy.
     */
    const zapytanieOFirme = admin
      .from("user_invoice_companies")
      // Lista kolumn musi być JEDNYM literałem — sklejona z kawałków przez `+`
      // przestaje być typem literalnym i klient Supabase gubi kształt wiersza,
      // przez co każde `firma.cokolwiek` staje się błędem typów. Reszta pól
      // (adres, konto, logo) jest tu dlatego, że składamy z nich nagłówek PDF-u.
      .select("id, name, nip, numbering_prefix, numbering_pattern, numbering_mode, address_street, address_building_number, address_apartment_number, address_city, address_postal_code, bank_name, bank_account, email, phone, logo_url, vat_exemption_basis");

    const { data: firma } = ustawienia?.platform_invoice_company_id
      ? await zapytanieOFirme.eq("id", ustawienia.platform_invoice_company_id).maybeSingle()
      : await zapytanieOFirme
          .eq("user_id", platformUserId)
          .order("is_default", { ascending: false })
          .limit(1)
          .maybeSingle();

    if (!firma?.nip) {
      console.error("billing-invoice-issue: konto platformowe bez danych firmy albo bez NIP");
      return json({ error: "PLATFORM_COMPANY_INCOMPLETE" }, 503);
    }

    const cfg: NumberingConfig = {
      prefix: firma.numbering_prefix || DEFAULT_NUMBERING.prefix,
      pattern: (firma.numbering_pattern || DEFAULT_NUMBERING.pattern) as NumberingPattern,
      mode: (firma.numbering_mode || DEFAULT_NUMBERING.mode) as NumberingMode,
    };

    // ------------------------------------------------------- 3. sumy z pozycji
    let netto = 0;
    let vat = 0;
    let brutto = 0;

    const doZapisu = pozycje.map((p, i) => {
      const ilosc = Number(p.quantity ?? 1);
      const stawka = Number(p.vat_rate ?? 23);

      let netPoz: number;
      let vatPoz: number;
      let bruttoPoz: number;
      let cenaNetto: number;

      if (p.unit_gross_price != null) {
        // Liczenie „w stu" — kwota brutto jest dana i nie wolno jej ruszyć.
        bruttoPoz = zaokr(ilosc * Number(p.unit_gross_price));
        netPoz = zaokr(bruttoPoz / (1 + stawka / 100));
        vatPoz = zaokr(bruttoPoz - netPoz);
        cenaNetto = zaokr(netPoz / (ilosc || 1));
      } else {
        cenaNetto = Number(p.unit_net_price ?? 0);
        netPoz = zaokr(ilosc * cenaNetto);
        vatPoz = zaokr(netPoz * stawka / 100);
        bruttoPoz = zaokr(netPoz + vatPoz);
      }

      netto = zaokr(netto + netPoz);
      vat = zaokr(vat + vatPoz);
      brutto = zaokr(brutto + bruttoPoz);

      return {
        name: String(p.name ?? "Abonament GetRido"),
        quantity: ilosc,
        unit: String(p.unit ?? "szt."),
        unit_net_price: cenaNetto,
        vat_rate: stawka,
        net_amount: netPoz,
        vat_amount: vatPoz,
        // 🔴 BEZ TEJ LINII FAKTURA POKAZYWAŁA „BRUTTO 0,00".
        //
        // Moduł faktur NIE liczy pozycji w bazie — wartość brutto jest liczona
        // przy wypełnianiu formularza i ZAPISYWANA razem z pozycją
        // (`CostInvoiceModal`: `gross_amount: item.grossAmount`). Kolumna ma
        // wartość domyślną 0, więc pominięcie jej nie dawało błędu, tylko cichą
        // zerową kwotę: netto 69,00, VAT 15,87, brutto 0,00 i „do zapłaty
        // −84,87 zł". Nagłówek faktury był poprawny, bo sumy liczymy osobno —
        // i właśnie dlatego nic tego nie zgłosiło.
        gross_amount: bruttoPoz,
        sort_order: i,
      };
    });

    // -------------------------------------- 4. numer + zapis, z ponowieniem
    //
    // Numer liczymy z AKTYWNYCH faktur tego konta (`deleted_at IS NULL`), tak
    // samo jak front. Między policzeniem a zapisem może wejść inna faktura —
    // wtedy trigger `trg_unique_invoice_number` odrzuci zapis, a my liczymy
    // numer OD NOWA. Ponawianie z tym samym numerem nie miałoby sensu.
    const dzis = new Date();
    const dataWystawienia = dzis.toISOString().slice(0, 10);

    let ostatniBlad: unknown = null;

    for (let proba = 1; proba <= PROB_NUMERU; proba++) {
      const { data: zajete } = await admin
        .from("user_invoices")
        .select("invoice_number")
        .eq("user_id", platformUserId)
        .is("deleted_at", null)
        .like("invoice_number", seriesLike(cfg, dzis));

      const seqs = (zajete ?? [])
        .map((r: { invoice_number: string }) => extractSeq(cfg, dzis, r.invoice_number))
        .filter((n): n is number => n !== null);

      const numer = buildInvoiceNumber(cfg, dzis, nextSeq(cfg.mode, seqs));

      const { data: faktura, error: insErr } = await admin
        .from("user_invoices")
        .insert({
          user_id: platformUserId,
          company_id: firma.id,
          invoice_number: numer,
          invoice_type: "vat",
          issue_date: dataWystawienia,
          sale_date: body?.sale_date ?? dataWystawienia,
          due_date: body?.due_date ?? dataWystawienia,
          currency: "PLN",
          net_total: netto,
          vat_total: vat,
          gross_total: brutto,
          is_paid: true,
          paid_at: body?.paid_at ?? new Date().toISOString(),
          paid_amount: brutto,
          payment_method: String(body?.payment_method ?? "card"),
          buyer_name: body?.buyer_name ?? null,
          buyer_nip: body?.buyer_nip ?? null,
          buyer_address: body?.buyer_address ?? null,
          buyer_email: body?.buyer_email ?? null,
          external_payment_ref: ref,
          source: "billing",
          // Marker faktur wystawionych zanim KSeF ruszył — mają dać się
          // odróżnić i wyczyścić po testach.
          notes: body?.pre_ksef
            ? `[PRZED URUCHOMIENIEM KSEF] ${body?.notes ?? ""}`.trim()
            : (body?.notes ?? null),
        })
        .select("id, invoice_number")
        .single();

      if (!insErr && faktura) {
        const { error: itemsErr } = await admin
          .from("user_invoice_items")
          .insert(doZapisu.map((p) => ({ ...p, invoice_id: faktura.id })));

        if (itemsErr) {
          // Faktura bez pozycji jest gorsza niż jej brak: ma numer, sumy i
          // trafiłaby do KSeF jako dokument bez treści. Wycofujemy nagłówek.
          console.error("billing-invoice-issue: pozycje nie zapisane, wycofuję fakturę", itemsErr);
          await admin.from("user_invoices").delete().eq("id", faktura.id);
          throw itemsErr;
        }

        console.log(JSON.stringify({
          event: "faktura_wystawiona",
          numer: faktura.invoice_number,
          ref,
          brutto,
          proba,
        }));

        /**
         * MAIL DO KLIENTA — po zapisaniu pozycji, nigdy jako warunek.
         *
         * Wystawienie bez wysyłki nie było błędem widocznym nigdzie: `billing_events`
         * pokazywało `processed`, faktura leżała w panelu, a klient nie dostawał nic
         * i nie miał skąd wiedzieć, że coś mu przysługuje.
         *
         * BEZ ZAŁĄCZNIKA PDF — i to jest świadome ograniczenie, nie przeoczenie.
         * Przycisk „Email" w panelu składa PDF W PRZEGLĄDARCE (`invoice-pdf.php`
         * dostaje gotowy HTML) i dopiero wtedy woła `send-invoice-email`
         * z `pdf_base64`. Webhook przeglądarki nie ma. `send-invoice-email`
         * obsługuje wywołanie bez załącznika — front sam z tego korzysta, gdy
         * PDF się nie uda („wysyłam fakturę bez załącznika") — więc klient
         * dostaje wiadomość z numerem, kwotą i odnośnikiem, a plik pobiera
         * z panelu. Serwerowe składanie PDF-u to osobna praca, opisana
         * w STAN-PRAC.md.
         *
         * Nieudana wysyłka NIE MOŻE wywrócić wystawienia: dokument już istnieje
         * i ma numer, a ponowienie maila to jedno kliknięcie w panelu.
         */
        const mailDo = String(body?.buyer_email ?? "").trim();
        if (mailDo) {
          try {
            /**
             * ZAŁĄCZNIK PDF — składany TYM SAMYM generatorem co w przeglądarce.
             *
             * Szablon leży w `_shared/invoiceHtml.ts` jako jedyne źródło: panel
             * i ta funkcja wołają dokładnie tę samą funkcję, więc dokument
             * z maila i dokument z przycisku „Pobierz" nie mogą się różnić.
             *
             * Sam PDF robi ten sam endpoint co przeglądarka —
             * `getrido.pl/invoice-pdf.php` (Dompdf). Nie duplikujemy renderowania,
             * tylko wołamy je z drugiej strony.
             *
             * Nieudane złożenie PDF-u NIE wstrzymuje maila: klient B2B ma dostać
             * dokument, a wiadomość bez załącznika jest lepsza niż jej brak.
             * Księgowa i tak nie zaloguje się do panelu, więc brak maila znaczy
             * brak faktury.
             */
            let pdfBase64: string | null = null;
            try {
              const dane: InvoiceData = {
                invoice_number: faktura.invoice_number,
                type: "invoice",
                issue_date: dataWystawienia,
                sale_date: dataWystawienia,
                due_date: dataWystawienia,
                payment_method: "transfer",
                currency: "PLN",
                paid_amount: brutto,
                is_fully_paid: true,
                items: doZapisu.map((p) => ({
                  name: p.name,
                  quantity: p.quantity,
                  unit: p.unit,
                  unit_net_price: p.unit_net_price,
                  vat_rate: String(p.vat_rate),
                  net_amount: p.net_amount,
                  vat_amount: p.vat_amount,
                  gross_amount: p.gross_amount,
                })) as InvoiceData["items"],
                seller: {
                  name: firma.name ?? "",
                  nip: firma.nip ?? undefined,
                  address_street: firma.address_street ?? undefined,
                  address_building_number: firma.address_building_number ?? undefined,
                  address_apartment_number: firma.address_apartment_number ?? undefined,
                  address_city: firma.address_city ?? undefined,
                  address_postal_code: firma.address_postal_code ?? undefined,
                  bank_name: firma.bank_name ?? undefined,
                  bank_account: firma.bank_account ?? undefined,
                  email: firma.email ?? undefined,
                  phone: firma.phone ?? undefined,
                  logo_url: firma.logo_url ?? undefined,
                  vat_exemption_basis: firma.vat_exemption_basis ?? undefined,
                },
                buyer: {
                  name: String(body?.buyer_name ?? ""),
                  nip: body?.buyer_nip ?? undefined,
                  address_street: body?.buyer_address ?? undefined,
                },
              };

              const odpPdf = await fetch(buildPublicUrl("/invoice-pdf.php"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ html: generateInvoiceHtml(dane) }),
              });
              const wynikPdf = await odpPdf.json().catch(() => null);
              if (typeof wynikPdf?.pdf_base64 === "string" && wynikPdf.pdf_base64.length > 100) {
                pdfBase64 = wynikPdf.pdf_base64;
              } else {
                console.warn(JSON.stringify({
                  event: "faktura_pdf_pusty", numer: faktura.invoice_number, status: odpPdf.status,
                }));
              }
            } catch (bladPdf) {
              console.error("billing-invoice-issue: PDF nie powstał, wysyłam bez załącznika", bladPdf);
            }

            const odp = await fetch(`${supabaseUrl}/functions/v1/send-invoice-email`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
              body: JSON.stringify({
                invoice_id: faktura.id,
                recipient_email: mailDo,
                type: "faktura_oplacona",
                ...(pdfBase64 ? { pdf_base64: pdfBase64 } : {}),
              }),
            });
            const wynikMaila = await odp.json().catch(() => ({}));
            console.log(JSON.stringify({
              event: odp.ok && (wynikMaila as any)?.success !== false ? "faktura_mail" : "faktura_mail_blad",
              numer: faktura.invoice_number, do: mailDo, status: odp.status,
              zalacznik: pdfBase64 ? "jest" : "brak",
            }));
          } catch (bladMaila) {
            console.error("billing-invoice-issue: mail niewysłany", bladMaila);
          }
        } else {
          // Brak adresu to nie awaria — ale ma zostawić ślad, bo klient
          // spodziewa się faktury na skrzynce.
          console.warn(JSON.stringify({
            event: "faktura_bez_adresu", numer: faktura.invoice_number, ref,
          }));
        }

        return json({
          ok: true,
          invoice_id: faktura.id,
          invoice_number: faktura.invoice_number,
          net_total: netto,
          vat_total: vat,
          gross_total: brutto,
        });
      }

      ostatniBlad = insErr;

      // 23505 na `external_payment_ref` = równoległe wystawienie tej samej
      // faktury. To nie jest błąd do ponawiania — to znaczy, że ktoś nas
      // ubiegł i faktura już istnieje.
      if (insErr?.code === "23505" && String(insErr.message ?? "").includes("external_payment_ref")) {
        const { data: juz } = await admin
          .from("user_invoices")
          .select("id, invoice_number")
          .eq("external_payment_ref", ref)
          .maybeSingle();
        return json({ ok: true, duplicate: true, invoice_id: juz?.id, invoice_number: juz?.invoice_number });
      }

      // 23505 na numerze = kolizja numeracji. Liczymy numer od nowa.
      if (insErr?.code === "23505") {
        console.warn(`billing-invoice-issue: numer ${numer} zajęty, próba ${proba}/${PROB_NUMERU}`);
        continue;
      }

      throw insErr;
    }

    console.error("billing-invoice-issue: nie udało się nadać numeru", ostatniBlad);
    return json({ error: "Nie udało się nadać numeru faktury po kilku próbach" }, 409);
  } catch (e: any) {
    console.error("billing-invoice-issue error:", e?.message ?? e);
    return json({ error: e?.message ?? "Unknown error" }, 500);
  }
});
