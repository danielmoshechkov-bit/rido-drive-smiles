import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvoiceIntent {
  action: 
    | 'create_invoice' 
    | 'add_cost' 
    | 'check_status' 
    | 'mark_paid' 
    | 'find_invoice'
    | 'export_pdf'
    | 'monthly_summary'
    | 'navigate'
    | 'send_reminder'
    | 'unknown';
  data: {
    nip?: string;
    company_name?: string;
    amount?: number;
    vat_rate?: string;
    description?: string;
    invoice_number?: string;
    status_filter?: string;
    tab_name?: string;
    month?: number;
    year?: number;
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
- find_invoice: użytkownik szuka konkretnej faktury (słowa: "znajdź", "pokaż fakturę", "gdzie jest")
- export_pdf: użytkownik chce pobrać/wyeksportować PDF faktury (słowa: "pobierz PDF", "eksportuj", "drukuj", "wydruk faktury")
- monthly_summary: użytkownik chce podsumowanie finansowe (słowa: "podsumowanie", "ile zarobiłem", "przychody", "raport", "statystyki", "ile mam przychodów")
- navigate: użytkownik chce przejść do zakładki (słowa: "pokaż sprzedaż", "idź do kosztów", "otwórz płatności", "kontrahenci", "przejdź do")
- send_reminder: użytkownik chce wysłać przypomnienie o płatności (słowa: "wyślij przypomnienie", "przypomnij o płatności", "przypomnienie dla")
- unknown: nie rozpoznano intencji

Wyodrębnij dane:
- nip: 10-cyfrowy NIP firmy
- company_name: nazwa firmy
- amount: kwota w PLN (np. "5000 zł" → 5000)
- vat_rate: stawka VAT (domyślnie "23%")
- description: opis usługi/produktu
- invoice_number: numer faktury
- status_filter: filtr statusu (pending, paid, overdue)
- tab_name: nazwa zakładki (sales, costs, payments, contractors)
- month: numer miesiąca (1-12) - jeśli użytkownik mówi "styczeń" → 1, "grudzień" → 12
- year: rok (np. 2025, 2026)

Mapowanie zakładek:
- "sprzedaż", "faktury sprzedażowe" → sales
- "koszty", "wydatki" → costs
- "płatności", "przypomnienia" → payments
- "kontrahenci", "odbiorcy", "klienci" → contractors

Mapowanie miesięcy polskich:
- styczeń → 1, luty → 2, marzec → 3, kwiecień → 4, maj → 5, czerwiec → 6
- lipiec → 7, sierpień → 8, wrzesień → 9, październik → 10, listopad → 11, grudzień → 12

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

    // Call Lovable AI Gateway for intent detection
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: INTENT_PROMPT },
          { role: 'user', content: command }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Za dużo zapytań. Spróbuj ponownie za chwilę.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Limit kredytów AI wyczerpany.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('Błąd AI Gateway');
    }

    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Brak odpowiedzi AI');
    }

    // Parse JSON from content (may be wrapped in markdown code blocks)
    let jsonContent = content;
    if (content.includes('```json')) {
      jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    } else if (content.includes('```')) {
      jsonContent = content.replace(/```\n?/g, '').trim();
    }

    const intent: InvoiceIntent = JSON.parse(jsonContent);
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
            .select('id, invoice_number, gross_amount')
            .eq('entity_id', entity_id)
            .ilike('invoice_number', `%${intent.data.invoice_number}%`)
            .single();

          if (invoice) {
            result.invoice = invoice;
            result.confirm_action = 'mark_paid';
            result.response = `Znalazłem fakturę ${invoice.invoice_number} na ${invoice.gross_amount?.toLocaleString('pl-PL') || '?'} PLN. Czy oznaczyć jako opłaconą?`;
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

      case 'export_pdf':
        if (intent.data.invoice_number && entity_id) {
          const { data: invoice } = await supabase
            .from('invoices')
            .select('id, invoice_number, pdf_url')
            .eq('entity_id', entity_id)
            .ilike('invoice_number', `%${intent.data.invoice_number}%`)
            .single();

          if (invoice) {
            result.invoice = invoice;
            result.action = 'download_pdf';
            
            if (invoice.pdf_url) {
              result.pdf_url = invoice.pdf_url;
              result.response = `Pobieram PDF faktury ${invoice.invoice_number}.`;
            } else {
              result.generate_pdf = true;
              result.response = `Generuję PDF dla faktury ${invoice.invoice_number}. Proszę chwilę poczekać.`;
            }
          } else {
            result.response = `Nie znalazłem faktury ${intent.data.invoice_number}.`;
          }
        } else {
          result.response = 'Podaj numer faktury, którą chcesz pobrać jako PDF.';
        }
        break;

      case 'monthly_summary':
        if (entity_id) {
          // Determine target month - default to current
          const now = new Date();
          const targetMonth = intent.data.month || (now.getMonth() + 1);
          const targetYear = intent.data.year || now.getFullYear();
          
          const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
          const lastDay = new Date(targetYear, targetMonth, 0).getDate();
          const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;
          
          // Fetch sales invoices
          const { data: salesInvoices } = await supabase
            .from('invoices')
            .select('gross_amount, net_amount, status, type')
            .eq('entity_id', entity_id)
            .neq('type', 'cost')
            .gte('issue_date', startDate)
            .lte('issue_date', endDate);
          
          // Fetch cost invoices
          const { data: costInvoices } = await supabase
            .from('invoices')
            .select('gross_amount, net_amount')
            .eq('entity_id', entity_id)
            .eq('type', 'cost')
            .gte('issue_date', startDate)
            .lte('issue_date', endDate);
          
          const totalIncome = salesInvoices?.reduce((sum, i) => sum + (i.gross_amount || 0), 0) || 0;
          const totalCosts = costInvoices?.reduce((sum, i) => sum + (i.gross_amount || 0), 0) || 0;
          const paidCount = salesInvoices?.filter(i => i.status === 'paid').length || 0;
          const unpaidCount = salesInvoices?.filter(i => i.status !== 'paid').length || 0;
          
          const monthNames = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 
                             'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
          const monthName = monthNames[targetMonth - 1];
          
          result.summary = {
            period: `${monthName} ${targetYear}`,
            month: targetMonth,
            year: targetYear,
            total_income: totalIncome,
            total_costs: totalCosts,
            profit: totalIncome - totalCosts,
            invoices_count: salesInvoices?.length || 0,
            costs_count: costInvoices?.length || 0,
            paid_count: paidCount,
            unpaid_count: unpaidCount
          };
          result.show_summary = true;
          result.response = `Podsumowanie za ${monthName} ${targetYear}: przychody ${totalIncome.toLocaleString('pl-PL')} PLN, koszty ${totalCosts.toLocaleString('pl-PL')} PLN, zysk ${(totalIncome - totalCosts).toLocaleString('pl-PL')} PLN. Masz ${unpaidCount} nieopłaconych faktur.`;
        }
        break;

      case 'navigate': {
        const tabMapping: Record<string, string> = {
          'sprzedaz': 'sales',
          'sprzedaż': 'sales',
          'sales': 'sales',
          'koszty': 'costs',
          'wydatki': 'costs',
          'costs': 'costs',
          'platnosci': 'payments',
          'płatności': 'payments',
          'payments': 'payments',
          'przypomnienia': 'payments',
          'kontrahenci': 'contractors',
          'odbiorcy': 'contractors',
          'klienci': 'contractors',
          'contractors': 'contractors'
        };
        
        const targetTab = tabMapping[intent.data.tab_name?.toLowerCase() || ''] || intent.data.tab_name;
        
        if (targetTab && ['sales', 'costs', 'payments', 'contractors'].includes(targetTab)) {
          result.navigate_to = targetTab;
          const tabNames: Record<string, string> = {
            sales: 'Sprzedaż',
            costs: 'Koszty',
            payments: 'Płatności',
            contractors: 'Kontrahenci'
          };
          result.response = `Przechodzę do zakładki ${tabNames[targetTab]}.`;
        } else {
          result.response = 'Dostępne zakładki: sprzedaż, koszty, płatności, kontrahenci.';
        }
        break;
      }

      case 'send_reminder':
        if (entity_id) {
          let invoice = null;
          
          // Search by invoice number or company name
          if (intent.data.invoice_number) {
            const { data } = await supabase
              .from('invoices')
              .select('id, invoice_number, gross_amount, due_date, buyer_snapshot')
              .eq('entity_id', entity_id)
              .in('status', ['pending', 'issued', 'overdue'])
              .ilike('invoice_number', `%${intent.data.invoice_number}%`)
              .single();
            invoice = data;
          } else if (intent.data.company_name) {
            const { data } = await supabase
              .from('invoices')
              .select('id, invoice_number, gross_amount, due_date, buyer_snapshot')
              .eq('entity_id', entity_id)
              .in('status', ['pending', 'issued', 'overdue'])
              .limit(10);
            
            // Filter by company name in buyer_snapshot
            if (data) {
              invoice = data.find(inv => 
                inv.buyer_snapshot?.name?.toLowerCase().includes(intent.data.company_name!.toLowerCase())
              );
            }
          }
          
          if (invoice) {
            result.invoice = invoice;
            result.confirm_action = 'send_reminder';
            const buyerName = (invoice.buyer_snapshot as any)?.name || 'kontrahenta';
            result.response = `Znalazłem fakturę ${invoice.invoice_number} dla ${buyerName} na ${invoice.gross_amount?.toLocaleString('pl-PL') || '?'} PLN. Czy wysłać przypomnienie o płatności?`;
          } else {
            result.response = 'Nie znalazłem nieopłaconej faktury dla podanego kontrahenta.';
          }
        }
        break;

      default:
        result.response = 'Nie zrozumiałem polecenia. Spróbuj: "wystaw fakturę", "dodaj koszt", "pokaż nieopłacone", "podsumowanie miesiąca", "pokaż płatności".';
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
