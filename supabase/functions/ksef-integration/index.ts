import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// KSeF API endpoints (demo/test)
const KSEF_DEMO_URL = 'https://ksef-demo.mf.gov.pl/api/v2';
const KSEF_PROD_URL = 'https://ksef.mf.gov.pl/api/v2';

interface KSeFRequest {
  action: 'send' | 'status' | 'download' | 'generate_xml' | 'get_settings' | 'save_settings' | 'fetch_received';
  invoice_id?: string;
  entity_id?: string;
  ksef_reference?: string;
  is_enabled?: boolean;
  environment?: 'demo' | 'production';
  token?: string;
  auto_send?: boolean;
  date_from?: string;
  date_to?: string;
}

// Generate FA(2) XML for invoice
function generateInvoiceXML(invoice: any, entity: any, items: any[]): string {
  const issueDate = invoice.issue_date || new Date().toISOString().split('T')[0];
  const buyer = invoice.buyer_snapshot || {};
  
  // Calculate totals
  const netTotal = items.reduce((sum, item) => sum + (item.net_amount || 0), 0);
  const vatTotal = items.reduce((sum, item) => sum + (item.vat_amount || 0), 0);
  const grossTotal = items.reduce((sum, item) => sum + (item.gross_amount || 0), 0);

  // VAT breakdown by rate
  const vatByRate: { [key: string]: { net: number; vat: number } } = {};
  items.forEach(item => {
    const rate = item.vat_rate || '23';
    if (!vatByRate[rate]) vatByRate[rate] = { net: 0, vat: 0 };
    vatByRate[rate].net += item.net_amount || 0;
    vatByRate[rate].vat += item.vat_amount || 0;
  });

  const vatBreakdownXML = Object.entries(vatByRate).map(([rate, amounts]) => {
    if (rate === 'zw' || rate === 'np') {
      return `
        <P_13_${rate === 'zw' ? '6' : '7'}>${amounts.net.toFixed(2)}</P_13_${rate === 'zw' ? '6' : '7'}>`;
    }
    const rateNum = parseInt(rate) || 23;
    let fieldNum = '1';
    if (rateNum === 23) fieldNum = '1';
    else if (rateNum === 8) fieldNum = '3';
    else if (rateNum === 5) fieldNum = '5';
    else if (rateNum === 0) fieldNum = '6';
    
    return `
        <P_13_${fieldNum}>${amounts.net.toFixed(2)}</P_13_${fieldNum}>
        <P_14_${fieldNum}>${amounts.vat.toFixed(2)}</P_14_${fieldNum}>`;
  }).join('');

  const itemsXML = items.map((item, idx) => `
      <FaWiersz>
        <NrWierszaFa>${idx + 1}</NrWierszaFa>
        <P_7>${escapeXml(item.name || 'Usługa')}</P_7>
        <P_8A>${item.unit || 'szt'}</P_8A>
        <P_8B>${item.quantity || 1}</P_8B>
        <P_9A>${(item.unit_net_price || 0).toFixed(2)}</P_9A>
        <P_11>${(item.net_amount || 0).toFixed(2)}</P_11>
        <P_12>${item.vat_rate === 'zw' ? 'zw' : item.vat_rate === 'np' ? 'np' : (item.vat_rate || '23')}</P_12>
      </FaWiersz>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa>
    <SystemInfo>RIDO Fleet Management</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${entity.nip || ''}</NIP>
      <Nazwa>${escapeXml(entity.name || '')}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>${escapeXml(entity.address_street || '')}</AdresL1>
      <AdresL2>${escapeXml(`${entity.address_postal_code || ''} ${entity.address_city || ''}`.trim())}</AdresL2>
    </Adres>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>${buyer.nip || ''}</NIP>
      <Nazwa>${escapeXml(buyer.name || '')}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>${escapeXml(buyer.address_street || '')}</AdresL1>
      <AdresL2>${escapeXml(`${buyer.address_postal_code || ''} ${buyer.address_city || ''}`.trim())}</AdresL2>
    </Adres>
  </Podmiot2>
  <Fa>
    <KodWaluty>${invoice.currency || 'PLN'}</KodWaluty>
    <P_1>${issueDate}</P_1>
    <P_2>${escapeXml(invoice.invoice_number || '')}</P_2>
    <P_6>${invoice.sale_date || issueDate}</P_6>${vatBreakdownXML}
    <P_15>${grossTotal.toFixed(2)}</P_15>
    <Adnotacje>
      <P_16>2</P_16>
      <P_17>2</P_17>
      <P_18>2</P_18>
      <P_18A>2</P_18A>
      <Zwolnienie>
        <P_19N>1</P_19N>
      </Zwolnienie>
      <NoweSrodkiTransportu>
        <P_22N>1</P_22N>
      </NoweSrodkiTransportu>
      <P_23>2</P_23>
      <PMarzy>
        <P_PMarzyN>1</P_PMarzyN>
      </PMarzy>
    </Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>${itemsXML}
    <Platnosc>
      <TerminPlatnosci>
        <Termin>${invoice.due_date || issueDate}</Termin>
      </TerminPlatnosci>
      <FormaPlatnosci>${invoice.payment_method === 'cash' ? 'gotówka' : 'przelew'}</FormaPlatnosci>
      ${entity.bank_account ? `<RachunekBankowy>
        <NrRB>${entity.bank_account.replace(/\s/g, '')}</NrRB>
      </RachunekBankowy>` : ''}
    </Platnosc>
  </Fa>
</Faktura>`;

  return xml;
}

function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: KSeFRequest = await req.json();
    const { action } = body;

    // GET SETTINGS
    if (action === 'get_settings') {
      const { data: settings, error } = await supabase
        .from('ksef_settings')
        .select('*')
        .eq('entity_id', body.entity_id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return new Response(
        JSON.stringify({ success: true, settings: settings || null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SAVE SETTINGS
    if (action === 'save_settings') {
      const { error } = await supabase
        .from('ksef_settings')
        .upsert({
          entity_id: body.entity_id,
          is_enabled: body.is_enabled,
          environment: body.environment || 'demo',
          token_encrypted: body.token,
          auto_send: body.auto_send || false,
          updated_at: new Date().toISOString()
        }, { onConflict: 'entity_id' });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // FETCH RECEIVED INVOICES FROM KSEF
    if (action === 'fetch_received') {
      // Get KSeF settings
      const { data: ksefSettings } = await supabase
        .from('ksef_settings')
        .select('*')
        .eq('entity_id', body.entity_id)
        .single();

      if (!ksefSettings?.is_enabled) {
        throw new Error('KSeF nie jest włączony dla tej firmy');
      }

      const { data: entity } = await supabase
        .from('entities')
        .select('nip')
        .eq('id', body.entity_id)
        .single();

      const baseUrl = ksefSettings.environment === 'production' ? KSEF_PROD_URL : KSEF_DEMO_URL;

      // In demo mode, generate sample purchase invoices
      if (ksefSettings.environment === 'demo' || ksefSettings.environment === 'integration') {
        const sampleSuppliers = [
          { name: 'Auto-Partner SA', nip: '6792881003', category: 'części_magazyn' },
          { name: 'BP Europa SE', nip: '1070010978', category: 'paliwo' },
          { name: 'PZU SA', nip: '5260300291', category: 'ubezpieczenie' },
          { name: 'Serwis-IT Sp. z o.o.', nip: '7811934421', category: 'usługi_it' },
          { name: 'MotoLeasing Sp. z o.o.', nip: '1132853869', category: 'leasing' },
        ];

        let insertedCount = 0;
        for (const supplier of sampleSuppliers) {
          const ksefNumber = `DEMO-${body.entity_id?.slice(0, 8)}-${supplier.nip}-${body.date_from}`;
          const netAmount = Math.round((Math.random() * 5000 + 500) * 100) / 100;
          const vatAmount = Math.round(netAmount * 0.23 * 100) / 100;

          const { error: upsertError } = await supabase
            .from('purchase_invoices')
            .upsert({
              document_number: `FV/${new Date().getFullYear()}/${Math.floor(Math.random() * 9999)}`,
              ksef_number: ksefNumber,
              supplier_name: supplier.name,
              supplier_nip: supplier.nip,
              total_net: netAmount,
              total_vat: vatAmount,
              total_gross: netAmount + vatAmount,
              purchase_date: body.date_from,
              status: 'new',
              entity_id: body.entity_id,
              ai_category: supplier.category,
            }, { onConflict: 'ksef_number' });

          if (!upsertError) insertedCount++;
        }

        return new Response(
          JSON.stringify({ success: true, demo: true, count: insertedCount }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Production: Real KSeF API flow
      try {
        // Step 1: Challenge
        const challengeRes = await fetch(`${baseUrl}/auth/challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contextIdentifier: { type: 'onip', identifier: entity?.nip }
          }),
        });

        if (!challengeRes.ok) {
          throw new Error(`KSeF challenge failed: ${challengeRes.status}`);
        }

        const challengeData = await challengeRes.json();
        const challenge = challengeData.challenge;

        // Step 2: Token (simplified - needs real token signing in production)
        // For now return error for prod
        throw new Error('Produkcyjne pobieranie faktur wymaga konfiguracji certyfikatu');
      } catch (prodError) {
        return new Response(
          JSON.stringify({ success: false, error: prodError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // GENERATE XML
    if (action === 'generate_xml') {
      // Fetch invoice with items
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', body.invoice_id)
        .single();

      if (invError || !invoice) throw new Error('Invoice not found');

      const { data: items } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', body.invoice_id);

      const { data: entity } = await supabase
        .from('entities')
        .select('*')
        .eq('id', invoice.entity_id)
        .single();

      const xml = generateInvoiceXML(invoice, entity, items || []);

      return new Response(
        JSON.stringify({ success: true, xml }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SEND TO KSEF
    if (action === 'send') {
      // Get invoice
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .select('*, entity:entities(*)')
        .eq('id', body.invoice_id)
        .single();

      if (invError || !invoice) throw new Error('Invoice not found');

      // Get KSeF settings
      const { data: ksefSettings } = await supabase
        .from('ksef_settings')
        .select('*')
        .eq('entity_id', invoice.entity_id)
        .single();

      if (!ksefSettings?.is_enabled) {
        throw new Error('KSeF is not enabled for this entity');
      }

      // Get items
      const { data: items } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', body.invoice_id);

      // Generate XML
      const xml = generateInvoiceXML(invoice, invoice.entity, items || []);

      // Create transmission record
      const { data: transmission, error: transError } = await supabase
        .from('ksef_transmissions')
        .insert({
          invoice_id: body.invoice_id,
          entity_id: invoice.entity_id,
          direction: 'outgoing',
          status: 'pending',
          xml_content: xml,
        })
        .select()
        .single();

      if (transError) throw transError;

      // In demo mode, simulate success
      if (ksefSettings.environment === 'demo') {
        const fakeKsefNumber = `2026/01/23/${Math.random().toString(36).substring(7).toUpperCase()}`;
        
        await supabase
          .from('ksef_transmissions')
          .update({
            status: 'accepted',
            ksef_reference_number: fakeKsefNumber,
            sent_at: new Date().toISOString(),
            response_at: new Date().toISOString(),
          })
          .eq('id', transmission.id);

        await supabase
          .from('invoices')
          .update({
            ksef_status: 'accepted',
            ksef_reference: fakeKsefNumber,
          })
          .eq('id', body.invoice_id);

        return new Response(
          JSON.stringify({ 
            success: true, 
            demo: true,
            ksef_reference: fakeKsefNumber,
            transmission_id: transmission.id 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Production: would make actual API call to KSeF
      // For now, mark as pending (requires real token and authentication)
      await supabase
        .from('ksef_transmissions')
        .update({
          status: 'error',
          error_message: 'Production KSeF integration requires valid token and certificate configuration',
        })
        .eq('id', transmission.id);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Production KSeF requires additional configuration',
          transmission_id: transmission.id 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CHECK STATUS
    if (action === 'status') {
      const { data: transmissions, error } = await supabase
        .from('ksef_transmissions')
        .select('*')
        .eq('invoice_id', body.invoice_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, transmissions }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('KSeF error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
