import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvoiceIntent {
  action: 'create_invoice' | 'add_cost' | 'check_status' | 'mark_paid' | 'find_invoice' | 'unknown';
  data: {
    nip?: string;
    company_name?: string;
    amount?: number;
    vat_rate?: string;
    description?: string;
    invoice_number?: string;
    status_filter?: string;
  };
  confidence: number;
  response: string;
}

const INTENT_PROMPT = `Jesteś asystentem fakturowania. Rozpoznaj intencję użytkownika i wyodrębnij dane.

Możliwe intencje:
- create_invoice: użytkownik chce wystawić nową fakturę (słowa: "wystaw", "nowa faktura", "faktura dla")
- add_cost: użytkownik chce dodać fakturę kosztową (słowa: "koszt", "wydatek", "zakup", "otrzymałem fakturę")
- check_status: użytkownik pyta o status faktur (słowa: "nieopłacone", "zaległe", "przeterminowane", "ile mam")
- mark_paid: użytkownik chce oznaczyć fakturę jako opłaconą (słowa: "opłacona", "zapłacona", "oznacz")
- find_invoice: użytkownik szuka konkretnej faktury (słowa: "znajdź", "pokaż", "gdzie jest")
- unknown: nie rozpoznano intencji

Wyodrębnij dane:
- nip: 10-cyfrowy NIP firmy
- company_name: nazwa firmy
- amount: kwota w PLN (np. "5000 zł" → 5000)
- vat_rate: stawka VAT (domyślnie "23%")
- description: opis usługi/produktu
- invoice_number: numer faktury
- status_filter: filtr statusu (pending, paid, overdue)

Odpowiedz TYLKO w formacie JSON:
{
  "action": "create_invoice",
  "data": { "company_name": "ABC Sp. z o.o.", "amount": 5000, "vat_rate": "23%" },
  "confidence": 0.95,
  "response": "Przygotowuję fakturę dla ABC Sp. z o.o. na kwotę 5000 PLN."
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { command, entity_id } = await req.json();

    if (!command) {
      return new Response(
        JSON.stringify({ error: 'Brak polecenia' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing invoice command:', command);

    // Get OpenAI key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try to get custom key first
    const { data: aiSettings } = await supabase
      .from('ai_settings')
      .select('openai_api_key_encrypted')
      .single();

    const apiKey = aiSettings?.openai_api_key_encrypted || Deno.env.get('LOVABLE_API_KEY');
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Brak klucza API' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call OpenAI for intent detection
    const openaiResponse = await fetch('https://ai.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: INTENT_PROMPT },
          { role: 'user', content: command }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!openaiResponse.ok) {
      console.error('OpenAI error:', await openaiResponse.text());
      throw new Error('Błąd AI');
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Brak odpowiedzi AI');
    }

    const intent: InvoiceIntent = JSON.parse(content);
    console.log('Detected intent:', intent);

    // Handle different actions
    let result: any = { intent };

    switch (intent.action) {
      case 'create_invoice':
        // If NIP provided, try to fetch from GUS
        if (intent.data.nip && entity_id) {
          const { data: gusData } = await supabase.functions.invoke('registry-gus', {
            body: { nip: intent.data.nip }
          });
          
          if (gusData?.success) {
            result.gus_data = gusData.data;
            result.response = `Znalazłem firmę: ${gusData.data.name}. Czy wystawić fakturę na kwotę ${intent.data.amount || '?'} PLN?`;
          }
        }
        result.open_wizard = true;
        result.prefill = {
          company_name: intent.data.company_name || result.gus_data?.name,
          nip: intent.data.nip,
          amount: intent.data.amount,
          vat_rate: intent.data.vat_rate || '23%',
          description: intent.data.description
        };
        break;

      case 'add_cost':
        result.open_cost_modal = true;
        result.prefill = {
          supplier_name: intent.data.company_name,
          amount: intent.data.amount,
          description: intent.data.description
        };
        break;

      case 'check_status':
        if (entity_id) {
          const statusFilter = intent.data.status_filter || 'pending';
          const { data: invoices, count } = await supabase
            .from('invoices')
            .select('*', { count: 'exact' })
            .eq('entity_id', entity_id)
            .eq('status', statusFilter)
            .limit(5);

          result.invoices = invoices;
          result.count = count;
          result.filter = statusFilter;
          result.response = `Masz ${count || 0} faktur ze statusem "${statusFilter}".`;
        }
        break;

      case 'mark_paid':
        if (intent.data.invoice_number && entity_id) {
          const { data: invoice } = await supabase
            .from('invoices')
            .select('id, invoice_number')
            .eq('entity_id', entity_id)
            .ilike('invoice_number', `%${intent.data.invoice_number}%`)
            .single();

          if (invoice) {
            result.invoice = invoice;
            result.confirm_action = 'mark_paid';
            result.response = `Znalazłem fakturę ${invoice.invoice_number}. Czy oznaczyć jako opłaconą?`;
          } else {
            result.response = `Nie znalazłem faktury ${intent.data.invoice_number}.`;
          }
        }
        break;

      case 'find_invoice':
        if (entity_id) {
          const searchTerm = intent.data.company_name || intent.data.invoice_number;
          if (searchTerm) {
            const { data: invoices } = await supabase
              .from('invoices')
              .select('id, invoice_number, gross_amount, status, buyer_snapshot')
              .eq('entity_id', entity_id)
              .or(`invoice_number.ilike.%${searchTerm}%`)
              .limit(5);

            result.invoices = invoices;
            result.response = `Znalazłem ${invoices?.length || 0} faktur.`;
          }
        }
        break;

      default:
        result.response = 'Nie zrozumiałem polecenia. Spróbuj: "wystaw fakturę", "dodaj koszt", "pokaż nieopłacone".';
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Wystąpił błąd',
        response: 'Przepraszam, wystąpił błąd. Spróbuj ponownie.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
