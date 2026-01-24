import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhitelistResponse {
  success: boolean;
  data?: {
    nip: string;
    name: string;
    statusVat: string;
    regon: string;
    krs?: string;
    residenceAddress?: string;
    workingAddress?: string;
    accountNumbers?: string[];
    hasVirtualAccounts?: boolean;
    registrationLegalDate?: string;
    registrationDenialDate?: string;
    registrationDenialBasis?: string;
    restorationDate?: string;
    restorationBasis?: string;
    removalDate?: string;
    removalBasis?: string;
    requestId: string;
    requestDateTime: string;
  };
  error?: string;
}

// MF White List API (free, no key required)
async function queryWhitelist(nip: string, date?: string): Promise<WhitelistResponse> {
  const queryDate = date || new Date().toISOString().split('T')[0];
  
  try {
    const response = await fetch(
      `https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${queryDate}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return { 
          success: false, 
          error: 'Nie znaleziono podmiotu o podanym NIP w Wykazie podatników VAT' 
        };
      }
      throw new Error(`MF API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.result?.subject) {
      const subject = data.result.subject;
      return {
        success: true,
        data: {
          nip: subject.nip,
          name: subject.name,
          statusVat: subject.statusVat, // "Czynny", "Zwolniony", "Niezarejestrowany"
          regon: subject.regon,
          krs: subject.krs,
          residenceAddress: subject.residenceAddress,
          workingAddress: subject.workingAddress,
          accountNumbers: subject.accountNumbers || [],
          hasVirtualAccounts: subject.hasVirtualAccounts,
          registrationLegalDate: subject.registrationLegalDate,
          registrationDenialDate: subject.registrationDenialDate,
          registrationDenialBasis: subject.registrationDenialBasis,
          restorationDate: subject.restorationDate,
          restorationBasis: subject.restorationBasis,
          removalDate: subject.removalDate,
          removalBasis: subject.removalBasis,
          requestId: data.result.requestId,
          requestDateTime: data.result.requestDateTime,
        },
      };
    }

    return { 
      success: false, 
      error: 'Brak danych w odpowiedzi z Wykazu podatników VAT' 
    };

  } catch (error) {
    console.error('MF Whitelist API error:', error);
    return { 
      success: false, 
      error: `Błąd połączenia z API Ministerstwa Finansów: ${String(error)}` 
    };
  }
}

function getVatStatusLabel(status: string): { label: string; valid: boolean } {
  switch (status) {
    case 'Czynny':
      return { label: 'Czynny podatnik VAT', valid: true };
    case 'Zwolniony':
      return { label: 'Zwolniony z VAT', valid: true };
    case 'Niezarejestrowany':
      return { label: 'Niezarejestrowany', valid: false };
    default:
      return { label: status || 'Nieznany', valid: false };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { nip, date, recipientId, bankAccount } = await req.json();

    if (!nip) {
      return new Response(
        JSON.stringify({ success: false, error: 'NIP jest wymagany' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean NIP
    const cleanNip = nip.replace(/[\s-]/g, '').replace(/^PL/i, '');
    
    // Validate NIP format
    if (!/^\d{10}$/.test(cleanNip)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nieprawidłowy format NIP (wymagane 10 cyfr)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Query whitelist
    const result = await queryWhitelist(cleanNip, date);

    // Add VAT status label
    if (result.success && result.data) {
      const statusInfo = getVatStatusLabel(result.data.statusVat);
      (result.data as Record<string, unknown>).statusLabel = statusInfo.label;
      (result.data as Record<string, unknown>).isActiveVat = statusInfo.valid;

      // Check bank account if provided
      if (bankAccount && result.data.accountNumbers) {
        const cleanAccount = bankAccount.replace(/[\s-]/g, '');
        const accountMatches = result.data.accountNumbers.some(
          acc => acc.replace(/[\s-]/g, '') === cleanAccount
        );
        (result.data as Record<string, unknown>).bankAccountVerified = accountMatches;
      }
    }

    // If we have a recipient ID and success, log the verification
    if (recipientId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Get user from auth
      const authHeader = req.headers.get('Authorization');
      let userId: string | null = null;
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id || null;
      }

      // Log verification
      await supabase.from('contractor_verification_logs').insert({
        recipient_id: recipientId,
        verification_type: 'whitelist',
        nip: cleanNip,
        result: result.data,
        is_valid: result.success && result.data?.statusVat === 'Czynny',
        verified_by: userId,
      });

      // Update recipient with whitelist data
      if (result.success) {
        await supabase.from('invoice_recipients').update({
          whitelist_data: result.data,
          verification_status: result.data?.statusVat === 'Czynny' ? 'verified' : 'warning',
          last_verified_at: new Date().toISOString(),
        }).eq('id', recipientId);
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Registry Whitelist error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
