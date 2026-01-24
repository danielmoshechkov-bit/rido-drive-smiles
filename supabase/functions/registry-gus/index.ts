import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GUSResponse {
  success: boolean;
  data?: {
    name: string;
    nip: string;
    regon: string;
    address: string;
    street?: string;
    propertyNumber?: string;
    apartmentNumber?: string;
    city: string;
    postalCode: string;
    voivodeship: string;
    status: string;
  };
  error?: string;
  mode?: 'api' | 'simulation';
}

// Get API key from external_integrations table or environment
async function getGusApiKey(): Promise<{ key: string | null; isEnabled: boolean; environment: string }> {
  // First try environment variable
  const envKey = Deno.env.get('GUS_API_KEY');
  if (envKey) {
    console.log('Using GUS_API_KEY from environment');
    return { key: envKey, isEnabled: true, environment: 'production' };
  }

  // Otherwise check database
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('external_integrations')
      .select('api_key_encrypted, is_enabled, environment')
      .eq('service_name', 'gus_regon')
      .single();

    if (error) {
      console.log('No GUS integration config found in database:', error.message);
      return { key: null, isEnabled: false, environment: 'demo' };
    }

    return { 
      key: data?.api_key_encrypted || null, 
      isEnabled: data?.is_enabled || false,
      environment: data?.environment || 'demo'
    };
  } catch (e) {
    console.error('Error fetching GUS config:', e);
    return { key: null, isEnabled: false, environment: 'demo' };
  }
}

// GUS BIR 1.1 API helper
async function queryGUS(nip: string, gusApiKey: string | null, environment: string): Promise<GUSResponse> {
  if (!gusApiKey) {
    console.log('GUS_API_KEY not configured, using simulation mode');
    const result = simulateGUSResponse(nip);
    result.mode = 'simulation';
    return result;
  }

  // Use correct endpoint based on environment
  const endpoint = environment === 'production'
    ? 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzworcznikow.svc'
    : 'https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzworcznikow.svc';

  console.log(`Using GUS ${environment} endpoint:`, endpoint);

  try {
    // GUS BIR 1.1 SOAP endpoint - Login
    const loginEnvelope = `
      <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07">
        <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
          <wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzworcznikow/Zaloguj</wsa:Action>
          <wsa:To>${endpoint}</wsa:To>
        </soap:Header>
        <soap:Body>
          <ns:Zaloguj>
            <ns:pKluczUzytkownika>${gusApiKey}</ns:pKluczUzytkownika>
          </ns:Zaloguj>
        </soap:Body>
      </soap:Envelope>
    `;

    const loginResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml;charset=UTF-8',
      },
      body: loginEnvelope,
    });

    if (!loginResponse.ok) {
      console.error('GUS login failed:', loginResponse.status, await loginResponse.text());
      throw new Error(`GUS login failed: ${loginResponse.status}`);
    }

    const loginXml = await loginResponse.text();
    console.log('GUS login response received');
    
    const sessionMatch = loginXml.match(/<ZalogujResult>([^<]+)<\/ZalogujResult>/);
    
    if (!sessionMatch || !sessionMatch[1]) {
      console.error('Failed to extract session from:', loginXml.substring(0, 500));
      throw new Error('Failed to get GUS session - invalid API key or service unavailable');
    }

    const sessionId = sessionMatch[1];
    console.log('GUS session obtained');

    // Query for company data
    const searchEnvelope = `
      <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07" xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">
        <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
          <wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzworcznikow/DaneSzukajPodmioty</wsa:Action>
          <wsa:To>${endpoint}</wsa:To>
        </soap:Header>
        <soap:Body>
          <ns:DaneSzukajPodmioty>
            <ns:pParametryWyszukiwania>
              <dat:Nip>${nip}</dat:Nip>
            </ns:pParametryWyszukiwania>
          </ns:DaneSzukajPodmioty>
        </soap:Body>
      </soap:Envelope>
    `;

    const searchResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml;charset=UTF-8',
        'sid': sessionId,
      },
      body: searchEnvelope,
    });

    if (!searchResponse.ok) {
      throw new Error('GUS search failed');
    }

    const searchXml = await searchResponse.text();
    console.log('GUS search response received');
    
    // Parse XML response
    const extractField = (xml: string, field: string): string => {
      const match = xml.match(new RegExp(`<${field}>([^<]*)</${field}>`));
      return match ? match[1] : '';
    };

    const resultMatch = searchXml.match(/<DaneSzukajPodmiotyResult>([^]*?)<\/DaneSzukajPodmiotyResult>/);
    
    if (!resultMatch) {
      return { success: false, error: 'Nie znaleziono podmiotu o podanym NIP', mode: 'api' };
    }

    const resultXml = resultMatch[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    const street = extractField(resultXml, 'Ulica');
    const propertyNumber = extractField(resultXml, 'NrNieruchomosci');
    const apartmentNumber = extractField(resultXml, 'NrLokalu');

    return {
      success: true,
      mode: 'api',
      data: {
        name: extractField(resultXml, 'Nazwa'),
        nip: extractField(resultXml, 'Nip'),
        regon: extractField(resultXml, 'Regon'),
        street,
        propertyNumber,
        apartmentNumber,
        address: `${street} ${propertyNumber}${apartmentNumber ? '/' + apartmentNumber : ''}`.trim(),
        city: extractField(resultXml, 'Miejscowosc'),
        postalCode: extractField(resultXml, 'KodPocztowy'),
        voivodeship: extractField(resultXml, 'Wojewodztwo'),
        status: extractField(resultXml, 'StatusNip') || 'active',
      },
    };

  } catch (error) {
    console.error('GUS API error:', error);
    // Fallback to simulation in case of API errors
    const result = simulateGUSResponse(nip);
    result.mode = 'simulation';
    result.error = `API GUS niedostępne: ${String(error)}. Używam danych symulowanych.`;
    return result;
  }
}

// Simulation for development without API key
function simulateGUSResponse(nip: string): GUSResponse {
  // Validate NIP format
  const cleanNip = nip.replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(cleanNip)) {
    return { success: false, error: 'Nieprawidłowy format NIP' };
  }

  // Simulate response based on NIP
  const mockCompanies: Record<string, GUSResponse['data']> = {
    '5252344078': {
      name: 'RIDO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
      nip: '5252344078',
      regon: '147302566',
      address: 'ul. Przykładowa 10',
      city: 'Warszawa',
      postalCode: '00-001',
      voivodeship: 'mazowieckie',
      status: 'active',
    },
    '1234567890': {
      name: 'PRZYKŁADOWA FIRMA SP. Z O.O.',
      nip: '1234567890',
      regon: '123456789',
      address: 'ul. Testowa 5',
      city: 'Kraków',
      postalCode: '30-001',
      voivodeship: 'małopolskie',
      status: 'active',
    },
  };

  const mockData = mockCompanies[cleanNip];
  
  if (mockData) {
    return { success: true, data: mockData };
  }

  // Generate random data for unknown NIPs (for testing)
  return {
    success: true,
    data: {
      name: `Firma NIP ${cleanNip}`,
      nip: cleanNip,
      regon: `${cleanNip.slice(0, 9)}`,
      address: 'ul. Nieznana 1',
      city: 'Warszawa',
      postalCode: '00-000',
      voivodeship: 'mazowieckie',
      status: 'active',
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { nip, recipientId } = await req.json();

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

    // Get API config
    const config = await getGusApiKey();
    console.log(`GUS config: enabled=${config.isEnabled}, hasKey=${!!config.key}, env=${config.environment}`);

    // Query GUS
    const result = await queryGUS(cleanNip, config.key, config.environment);

    // If we have a recipient ID and success, log the verification
    if (result.success && recipientId) {
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
        verification_type: 'gus',
        nip: cleanNip,
        result: result.data,
        is_valid: result.success,
        verified_by: userId,
      });

      // Update recipient with GUS data
      await supabase.from('invoice_recipients').update({
        gus_data: result.data,
        last_verified_at: new Date().toISOString(),
      }).eq('id', recipientId);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Registry GUS error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
