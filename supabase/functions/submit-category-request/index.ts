import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const ADMIN_EMAIL = Deno.env.get("PORTAL_ADMIN_EMAIL") || "daniel.moshechkov@gmail.com";

function esc(v: unknown): string {
  return String(v ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const name = String(body?.category_name || "").trim();
    if (!name) {
      return new Response(JSON.stringify({ error: "Podaj nazwę kategorii" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = {
      user_id: user.id,
      provider_id: body?.provider_id || null,
      requested_category_name: name,
      category_description: body?.category_description || null,
      example_services: body?.example_services || null,
      contact_email: body?.contact_email || user.email || null,
    };

    const { data: inserted, error: insErr } = await admin
      .from("category_requests")
      .insert(payload)
      .select()
      .single();
    if (insErr) throw insErr;

    // Nazwa firmy zgłaszającego (jeśli jest usługodawcą)
    let companyName = "";
    if (payload.provider_id) {
      const { data: prov } = await admin
        .from("service_providers")
        .select("company_name, company_city")
        .eq("id", payload.provider_id)
        .maybeSingle();
      companyName = prov ? `${prov.company_name || ""} ${prov.company_city ? `(${prov.company_city})` : ""}` : "";
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    let emailSent = false;
    if (resendKey) {
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#4A3AFF;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
            <h2 style="margin:0;font-size:20px">Zgłoszenie nowej kategorii usług</h2>
          </div>
          <div style="border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 12px 12px">
            <p><strong>Kategoria:</strong> ${esc(name)}</p>
            <p><strong>Opis kategorii:</strong><br>${esc(payload.category_description)}</p>
            <p><strong>Przykładowe usługi:</strong><br>${esc(payload.example_services)}</p>
            <hr style="border:0;border-top:1px solid #e5e7eb">
            <p><strong>Firma:</strong> ${esc(companyName || "—")}</p>
            <p><strong>Użytkownik:</strong> ${esc(user.email)}</p>
            <p><strong>E-mail kontaktowy:</strong> ${esc(payload.contact_email)}</p>
            <p style="color:#6b7280;font-size:12px">ID zgłoszenia: ${esc(inserted?.id)}</p>
          </div>
        </div>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "GetRido <no-reply@getrido.pl>",
          to: [ADMIN_EMAIL],
          reply_to: payload.contact_email || undefined,
          subject: `Nowa kategoria do akceptacji: ${name}`,
          html,
        }),
      });
      emailSent = res.ok;
      if (!res.ok) console.error("Resend error:", res.status, await res.text());
    } else {
      console.error("RESEND_API_KEY not configured");
    }

    return new Response(JSON.stringify({ success: true, id: inserted?.id, email_sent: emailSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("submit-category-request error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Nieznany błąd" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
