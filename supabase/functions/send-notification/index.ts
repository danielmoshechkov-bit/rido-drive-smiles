import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { type, order_id, provider_id, new_status, lead_id } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!resendKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ success: false, error: "no_api_key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let to = "";
    let subject = "";
    let html = "";

    if (type === "new_ad_order") {
      // Get notification settings
      const { data: settings } = await supabase
        .from("marketing_notification_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (!settings?.notification_email || settings?.notify_new_orders === false) {
        return new Response(JSON.stringify({ success: true, skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: order } = await supabase
        .from("provider_ad_orders")
        .select("*, service_providers!provider_id(company_name, company_city), provider_services!service_id(name)")
        .eq("id", order_id)
        .single();

      if (!order) throw new Error("Order not found");

      to = settings.notification_email;
      subject = `🆕 Nowe zlecenie reklamy — ${order.service_providers?.company_name || "Nieznana firma"}`;
      html = buildEmail(
        "Nowe zlecenie reklamy",
        `<p><strong>Firma:</strong> ${order.service_providers?.company_name || "—"}</p>
         <p><strong>Usługa:</strong> ${order.provider_services?.name || "—"}</p>
         <p><strong>Typ:</strong> ${order.ad_type}</p>
         <p><strong>Budżet:</strong> ${order.budget} zł</p>
         <p><strong>Miasto:</strong> ${order.target_city || order.service_providers?.company_city || "—"}</p>`,
        "Przejdź do panelu",
        "https://rido-drive-smiles.lovable.app/admin/marketing?tab=orders"
      );
    } else if (type === "ad_status_change") {
      const { data: order } = await supabase
        .from("provider_ad_orders")
        .select("*, service_providers!provider_id(company_email, company_name), provider_services!service_id(name)")
        .eq("id", order_id)
        .single();

      if (!order?.service_providers?.company_email) {
        return new Response(JSON.stringify({ success: true, skipped: true, reason: "no_email" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      to = order.service_providers.company_email;
      const statusMessages: Record<string, { emoji: string; title: string; body: string }> = {
        active: { emoji: "✅", title: "Twoja reklama została uruchomiona!", body: "Twoja kampania reklamowa jest teraz aktywna. Leady będą pojawiać się w zakładce Leady." },
        rejected: { emoji: "❌", title: "Zlecenie reklamy odrzucone", body: "Niestety Twoje zlecenie zostało odrzucone. Skontaktuj się z nami po szczegóły." },
        completed: { emoji: "🏁", title: "Kampania zakończona", body: "Twoja kampania reklamowa została zakończona. Sprawdź wyniki w panelu." },
        paused: { emoji: "⏸️", title: "Kampania wstrzymana", body: "Twoja kampania została tymczasowo wstrzymana." },
      };
      const msg = statusMessages[new_status] || { emoji: "📋", title: `Status: ${new_status}`, body: "Status Twojego zlecenia został zmieniony." };

      subject = `${msg.emoji} ${msg.title}`;
      html = buildEmail(
        msg.title,
        `<p>${msg.body}</p>
         <p><strong>Usługa:</strong> ${order.provider_services?.name || "—"}</p>`,
        "Przejdź do panelu",
        "https://rido-drive-smiles.lovable.app/uslugi"
      );
    } else if (type === "new_lead") {
      const { data: lead } = await supabase
        .from("service_leads")
        .select("*, service_providers!provider_id(company_email), provider_services!service_id(name)")
        .eq("id", lead_id)
        .single();

      if (!lead?.service_providers?.company_email) {
        return new Response(JSON.stringify({ success: true, skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      to = lead.service_providers.company_email;
      subject = "🔔 Nowy klient zainteresowany Twoją usługą!";
      html = buildEmail(
        "Nowy lead!",
        `<p><strong>Imię:</strong> ${lead.lead_name || "—"}</p>
         <p><strong>Usługa:</strong> ${lead.provider_services?.name || "—"}</p>
         <p><strong>Źródło:</strong> ${lead.source}</p>
         ${lead.lead_message ? `<p><strong>Wiadomość:</strong> ${lead.lead_message}</p>` : ""}`,
        "Zobacz leady",
        "https://rido-drive-smiles.lovable.app/uslugi?tab=leads"
      );
    }

    if (!to) {
      return new Response(JSON.stringify({ success: false, error: "no_recipient" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "GetRido <noreply@getrido.pl>",
        to: [to],
        subject,
        html,
      }),
    });

    const resBody = await res.text();
    if (!res.ok) {
      console.error("Resend error:", resBody);
      return new Response(JSON.stringify({ success: false, error: resBody }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Notification error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildEmail(title: string, content: string, ctaText: string, ctaUrl: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:#7A4EDA;padding:24px 32px;text-align:center;">
  <img src="https://wclrrytmrscqvsyxyvnn.supabase.co/storage/v1/object/public/documents/getrido-logo-white.png" alt="GetRido" height="32" style="height:32px;" onerror="this.style.display='none'"/>
  <h1 style="color:#fff;margin:12px 0 0;font-size:18px;">${title}</h1>
</td></tr>
<tr><td style="padding:32px;">
  ${content}
  <div style="text-align:center;margin-top:24px;">
    <a href="${ctaUrl}" style="display:inline-block;background:#7A4EDA;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">${ctaText}</a>
  </div>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e5e5e5;text-align:center;">
  <p style="color:#999;font-size:12px;margin:0;">GetRido — Portal Usług i Nieruchomości</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
