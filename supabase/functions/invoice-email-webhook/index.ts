import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // === PROCESS INCOMING INVOICE (from email forward or manual API call) ===
    if (action === "process_invoice") {
      const { user_id, file_base64, mime_type, sender_email, subject, webhook_secret } = body;

      // Verify webhook secret if provided
      if (webhook_secret) {
        const { data: config } = await supabaseAdmin
          .from("invoice_email_configs")
          .select("*")
          .eq("webhook_secret", webhook_secret)
          .eq("is_active", true)
          .single();
        
        if (!config) {
          return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      if (!file_base64 || !user_id) {
        throw new Error("Brak pliku lub user_id");
      }

      // OCR with Claude
      const ANTHROPIC_API_KEY = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
      if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

      const mediaType = mime_type === "application/pdf" ? "application/pdf" : 
                        mime_type?.startsWith("image/") ? mime_type : "image/jpeg";

      const anthropicBody = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            {
              type: mediaType === "application/pdf" ? "document" : "image",
              source: { type: "base64", media_type: mediaType, data: file_base64 },
            },
            {
              type: "text",
              text: `Odczytaj tę fakturę zakupową i zwróć TYLKO czysty JSON (bez backticks, bez komentarzy) w strukturze:
{
  "numer_faktury": "string",
  "data_wystawienia": "YYYY-MM-DD",
  "data_sprzedazy": "YYYY-MM-DD",
  "termin_platnosci": "YYYY-MM-DD",
  "forma_platnosci": "przelew/gotówka/karta",
  "sprzedawca": {
    "nazwa": "string",
    "nip": "string",
    "adres": "string",
    "numer_konta": "string",
    "bank": "string"
  },
  "pozycje": [
    {
      "nazwa": "string",
      "ilosc": number,
      "jednostka": "szt/kg/l/m/usł",
      "cena_netto": number,
      "vat_proc": number,
      "wartosc_netto": number,
      "wartosc_brutto": number
    }
  ],
  "suma_netto": number,
  "suma_vat": number,
  "suma_brutto": number,
  "waluta": "PLN"
}`
            }
          ]
        }]
      };

      const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(anthropicBody),
      });

      if (!aiResp.ok) {
        const errText = await aiResp.text();
        console.error("Anthropic error:", aiResp.status, errText);
        throw new Error("Błąd OCR: " + aiResp.status);
      }

      const aiData = await aiResp.json();
      const rawText = aiData.content?.[0]?.text || "";
      
      let ocrResult;
      try {
        const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        ocrResult = JSON.parse(cleaned);
      } catch {
        console.error("Parse error, raw:", rawText);
        throw new Error("Nie udało się odczytać faktury");
      }

      // Save invoice with review_status = 'pending'
      const { data: invoice, error: invError } = await supabaseAdmin
        .from("user_invoices")
        .insert({
          user_id,
          invoice_number: ocrResult.numer_faktury || "Brak numeru",
          issue_date: ocrResult.data_wystawienia || new Date().toISOString().split("T")[0],
          sale_date: ocrResult.data_sprzedazy,
          due_date: ocrResult.termin_platnosci,
          seller_name: ocrResult.sprzedawca?.nazwa || "Nieznany",
          seller_nip: ocrResult.sprzedawca?.nip,
          seller_address: ocrResult.sprzedawca?.adres,
          seller_bank_account: ocrResult.sprzedawca?.numer_konta,
          seller_bank_name: ocrResult.sprzedawca?.bank,
          net_amount: ocrResult.suma_netto || 0,
          vat_amount: ocrResult.suma_vat || 0,
          gross_amount: ocrResult.suma_brutto || 0,
          currency: ocrResult.waluta || "PLN",
          payment_method: ocrResult.forma_platnosci || "przelew",
          invoice_type: "cost",
          status: "draft",
          source: "email",
          review_status: "pending",
          sender_email: sender_email || null,
          received_at: new Date().toISOString(),
          ocr_data: ocrResult,
        })
        .select()
        .single();

      if (invError) {
        console.error("Insert error:", invError);
        throw new Error("Błąd zapisu faktury: " + invError.message);
      }

      // Save invoice items
      if (ocrResult.pozycje?.length > 0) {
        const items = ocrResult.pozycje.map((p: any, idx: number) => ({
          invoice_id: invoice.id,
          user_id,
          name: p.nazwa || `Pozycja ${idx + 1}`,
          quantity: p.ilosc || 1,
          unit: p.jednostka || "szt",
          net_price: p.cena_netto || 0,
          vat_rate: String(p.vat_proc || 23),
          net_amount: p.wartosc_netto || 0,
          vat_amount: (p.wartosc_brutto || 0) - (p.wartosc_netto || 0),
          gross_amount: p.wartosc_brutto || 0,
        }));

        await supabaseAdmin.from("user_invoice_items").insert(items);
      }

      // Create notification
      await supabaseAdmin.from("invoice_notifications").insert({
        user_id,
        invoice_id: invoice.id,
        title: `Nowa faktura: ${ocrResult.numer_faktury || "Brak numeru"}`,
        message: `Faktura od ${ocrResult.sprzedawca?.nazwa || sender_email || "nieznany nadawca"} na kwotę ${ocrResult.suma_brutto || 0} ${ocrResult.waluta || "PLN"}. Wymaga sprawdzenia.`,
        notification_type: "new_invoice",
      });

      return new Response(JSON.stringify({ 
        success: true, 
        invoice_id: invoice.id,
        ocr_result: ocrResult 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === GET PENDING INVOICES ===
    if (action === "get_pending") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("Brak autoryzacji");

      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user } } = await supabaseUser.auth.getUser();
      if (!user) throw new Error("Nie zalogowany");

      const { data: invoices } = await supabaseUser
        .from("user_invoices")
        .select("*, user_invoice_items(*)")
        .eq("review_status", "pending")
        .order("created_at", { ascending: false });

      return new Response(JSON.stringify({ success: true, invoices: invoices || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === CONFIRM INVOICE ===
    if (action === "confirm_invoice") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("Brak autoryzacji");

      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user } } = await supabaseUser.auth.getUser();
      if (!user) throw new Error("Nie zalogowany");

      const { invoice_id, cost_category, add_to_inventory } = body;

      await supabaseUser.from("user_invoices").update({
        review_status: "confirmed",
        status: "confirmed",
        cost_category: cost_category || "other",
      }).eq("id", invoice_id);

      // Mark notification as read
      await supabaseUser.from("invoice_notifications")
        .update({ is_read: true })
        .eq("invoice_id", invoice_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Nieznana akcja: ${action}`);
  } catch (err: any) {
    console.error("invoice-email-webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
