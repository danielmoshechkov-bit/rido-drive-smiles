import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyVatRequest {
  nip: string;
  driver_id?: string;
}

interface VIESResponse {
  valid: boolean;
  name?: string;
  address?: string;
  requestDate?: string;
  vatNumber?: string;
  countryCode?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { nip, driver_id }: VerifyVatRequest = await req.json();

    if (!nip) {
      return new Response(
        JSON.stringify({ error: "NIP jest wymagany" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize NIP - remove spaces, dashes, PL prefix
    const cleanNip = nip.replace(/[\s-]/g, '').replace(/^PL/i, '');
    
    if (!/^\d{10}$/.test(cleanNip)) {
      return new Response(
        JSON.stringify({ 
          error: "Nieprawidłowy format NIP (wymagane 10 cyfr)",
          valid: false,
          status: 'invalid'
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("🔍 Verifying VAT for NIP:", cleanNip);

    // Try VIES API (EU VAT validation)
    let viesResult: VIESResponse | null = null;
    let verificationStatus = 'error';
    let errorMessage = '';

    try {
      // Use VIES SOAP API
      const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns1="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soap:Body>
    <tns1:checkVat>
      <tns1:countryCode>PL</tns1:countryCode>
      <tns1:vatNumber>${cleanNip}</tns1:vatNumber>
    </tns1:checkVat>
  </soap:Body>
</soap:Envelope>`;

      const viesResponse = await fetch(
        'https://ec.europa.eu/taxation_customs/vies/services/checkVatService',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml;charset=UTF-8',
            'SOAPAction': '',
          },
          body: soapRequest,
        }
      );

      const xmlText = await viesResponse.text();
      console.log("📦 VIES Response:", xmlText.substring(0, 500));

      // Parse VIES response
      const validMatch = xmlText.match(/<valid>(\w+)<\/valid>/i);
      const nameMatch = xmlText.match(/<name>([^<]*)<\/name>/i);
      const addressMatch = xmlText.match(/<address>([^<]*)<\/address>/i);
      
      if (validMatch) {
        const isValid = validMatch[1].toLowerCase() === 'true';
        viesResult = {
          valid: isValid,
          name: nameMatch?.[1] || undefined,
          address: addressMatch?.[1] || undefined,
          vatNumber: `PL${cleanNip}`,
          countryCode: 'PL',
          requestDate: new Date().toISOString()
        };
        
        verificationStatus = isValid ? 'verified' : 'invalid';
        console.log("✅ VIES verification result:", viesResult);
      } else {
        // Check for fault/error in response
        const faultMatch = xmlText.match(/<faultstring>([^<]*)<\/faultstring>/i);
        if (faultMatch) {
          errorMessage = faultMatch[1];
          console.log("⚠️ VIES fault:", errorMessage);
          verificationStatus = 'error';
        }
      }
    } catch (viesError) {
      console.error("❌ VIES API error:", viesError);
      errorMessage = "Błąd połączenia z VIES. Spróbuj ponownie później.";
      verificationStatus = 'error';
    }

    // If driver_id provided, update driver_b2b_profiles
    if (driver_id) {
      const updateData = {
        vat_verified_at: new Date().toISOString(),
        vat_verification_status: verificationStatus,
        vat_verification_response: viesResult || { error: errorMessage }
      };

      const { error: updateError } = await supabaseAdmin
        .from('driver_b2b_profiles')
        .update(updateData)
        .eq('driver_id', driver_id);

      if (updateError) {
        console.error("⚠️ Failed to update driver_b2b_profiles:", updateError);
      } else {
        console.log("✅ Updated driver_b2b_profiles with verification result");
      }
    }

    return new Response(
      JSON.stringify({
        valid: viesResult?.valid || false,
        status: verificationStatus,
        name: viesResult?.name,
        address: viesResult?.address,
        vatNumber: viesResult?.vatNumber,
        verifiedAt: new Date().toISOString(),
        error: errorMessage || undefined
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Wystąpił nieoczekiwany błąd",
        valid: false,
        status: 'error'
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
