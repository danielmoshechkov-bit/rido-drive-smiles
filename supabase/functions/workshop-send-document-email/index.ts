import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendMail } from "../_shared/smtpSend.ts";

/**
 * Wysylka dokumentu warsztatowego do klienta: jedna tresc, rozny zalacznik.
 *
 * Wolajacy podaje gotowy HTML dokumentu (ten sam, ktory idzie na wydruk),
 * a my zamieniamy go na PDF istniejacym generatorem `invoice-pdf.php` —
 * tym samym, ktory obsluguje faktury. Nie budujemy drugiego generatora,
 * bo jeden dokument renderowany dwoma drogami predzej czy pozniej zaczyna
 * wygladac inaczej w kazdej z nich.
 *
 * Tresc maila jest UNIWERSALNA. Roznica miedzy potwierdzeniem przechowania
 * opon a przyjeciem auta do naprawy siedzi w zalaczniku, nie w liscie —
 * dzieki temu jest jeden szablon do utrzymania zamiast osobnego na kazdy
 * rodzaj dokumentu.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "Metoda niedozwolona" }, 405);

  try {
    const {
      providerId, do: adresat, html, nazwaPliku, tytulDokumentu, numer,
    } = await req.json();

    if (!providerId || !adresat || !html) {
      return json({ error: "Brak wymaganych danych" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(adresat))) {
      return json({ error: "Nieprawidlowy adres e-mail" }, 400);
    }

    // Funkcje maja `verify_jwt = false`, wiec tozsamosc sprawdzamy tutaj.
    // Bez tego kazdy moglby wyslac maila w imieniu dowolnego warsztatu.
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    if (!token) return json({ error: "Brak autoryzacji" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user }, error: bladUzytkownika } = await anon.auth.getUser(token);
    if (bladUzytkownika || !user) return json({ error: "Brak autoryzacji" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: warsztat } = await admin
      .from("service_providers")
      .select("id, user_id, company_name, short_name, company_address, company_city, company_phone, company_email, company_website")
      .eq("id", providerId)
      .maybeSingle();

    if (!warsztat) return json({ error: "Nie znaleziono warsztatu" }, 404);
    if (warsztat.user_id !== user.id) {
      return json({ error: "Brak dostepu do tego warsztatu" }, 403);
    }

    // ------------------------------------------------------------ zalacznik
    let pdfBase64: string | null = null;
    try {
      const odp = await fetch("https://getrido.pl/invoice-pdf.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      });
      const wynik = await odp.json();
      if (odp.ok && wynik?.pdf_base64) {
        pdfBase64 = wynik.pdf_base64;
      } else {
        console.error("[Dokument mail] PDF nieudany:", wynik?.error ?? odp.status);
      }
    } catch (e) {
      console.error("[Dokument mail] PDF nieosiagalny:", e);
    }

    // Nieudany PDF nie wstrzymuje maila. Wiadomosc bez zalacznika jest lepsza
    // niz brak wiadomosci — klient wie, ze warsztat cos przyjal, i moze
    // zadzwonic. Informujemy go wprost, ze zalacznika nie ma.
    const nazwa = warsztat.short_name?.trim() || warsztat.company_name || "Warsztat";
    const adres = [warsztat.company_address, warsztat.company_city].filter(Boolean).join(", ");
    const opis = tytulDokumentu || "Potwierdzenie";

    const kontakt = [
      warsztat.company_phone ? `tel. ${warsztat.company_phone}` : "",
      warsztat.company_email ?? "",
      warsztat.company_website ?? "",
    ].filter(Boolean).join(" &middot; ");

    const tresc = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:560px">
  <p>Dzień dobry,</p>
  <p>dziękujemy za skorzystanie z naszych usług.
     ${pdfBase64
       ? `W załączniku przesyłamy <strong>${opis.toLowerCase()}</strong>${numer ? ` nr ${numer}` : ""}.`
       : `${opis}${numer ? ` nr ${numer}` : ""} jest gotowe — prosimy o kontakt, prześlemy je ponownie.`}
  </p>
  <p>Prosimy o zachowanie tego dokumentu. Będzie potrzebny przy odbiorze.</p>

  <div style="margin-top:22px;padding-top:14px;border-top:1px solid #ddd;color:#555;font-size:13px">
    <div style="font-weight:bold;color:#111;font-size:14px">${nazwa}</div>
    ${adres ? `<div>${adres}</div>` : ""}
    ${kontakt ? `<div>${kontakt}</div>` : ""}
  </div>

  <p style="margin-top:18px;font-size:11px;color:#888">
    Wiadomość wysłana automatycznie — prosimy na nią nie odpowiadać.
    W sprawach dotyczących zlecenia prosimy o kontakt z warsztatem
    pod danymi powyżej.
  </p>
</div>`.trim();

    await sendMail(
      String(adresat),
      `${opis}${numer ? ` ${numer}` : ""} — ${nazwa}`,
      tresc,
      {
        // Bez `replyTo`: to wiadomosc jednostronna — potwierdzenie, nie
        // rozpoczecie rozmowy. Adres warsztatu jest w stopce, wiec klient
        // wie, gdzie napisac albo zadzwonic, jesli faktycznie ma sprawe.
        zalaczniki: pdfBase64
          ? [{
              nazwa: nazwaPliku || `${opis.replace(/\s+/g, "-").toLowerCase()}.pdf`,
              typ: "application/pdf",
              base64: pdfBase64,
            }]
          : undefined,
      },
    );

    return json({ wyslano: true, zZalacznikiem: !!pdfBase64 });
  } catch (e) {
    console.error("[Dokument mail]", e);
    return json({ error: (e as Error)?.message ?? "Blad wysylki" }, 500);
  }
});
