import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ENVS = {
  test: 'https://api-test.ksef.mf.gov.pl/v2',
  demo: 'https://api-demo.ksef.mf.gov.pl/v2',
  production: 'https://api.ksef.mf.gov.pl/v2',
} as const;

const textEncoder = new TextEncoder();

type NormalizedEnvironment = 'test' | 'demo' | 'production';

interface KSeFRequest {
  action: 'send' | 'status' | 'download' | 'generate_xml' | 'get_settings' | 'save_settings' | 'fetch_received' | 'test_connection';
  invoice_id?: string;
  entity_id?: string;
  ksef_reference?: string;
  is_enabled?: boolean;
  environment?: 'demo' | 'production' | 'integration' | 'test';
  token?: string;
  auto_send?: boolean;
  date_from?: string;
  date_to?: string;
  nip?: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeEnvironment(environment?: string): NormalizedEnvironment {
  if (environment === 'integration') return 'test';
  if (environment === 'test' || environment === 'production' || environment === 'demo') return environment;
  return 'demo';
}

function getBaseUrl(environment?: string): string {
  return ENVS[normalizeEnvironment(environment)];
}

function escapeXml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function generateInvoiceXML(invoice: any, entity: any, items: any[]): string {
  const issueDate = invoice.issue_date || new Date().toISOString().split('T')[0];
  const buyer = invoice.buyer_snapshot || {};
  const grossTotal = items.reduce((sum, item) => sum + (item.gross_amount || 0), 0);

  const vatByRate: Record<string, { net: number; vat: number }> = {};
  items.forEach((item) => {
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

    const rateNum = parseInt(rate, 10) || 23;
    let fieldNum = '1';
    if (rateNum === 23) fieldNum = '1';
    else if (rateNum === 8) fieldNum = '3';
    else if (rateNum === 5) fieldNum = '5';
    else if (rateNum === 0) fieldNum = '6';

    return `
        <P_13_${fieldNum}>${amounts.net.toFixed(2)}</P_13_${fieldNum}>
        <P_14_${fieldNum}>${amounts.vat.toFixed(2)}</P_14_${fieldNum}>`;
  }).join('');

  const itemsXML = items.map((item, index) => `
      <FaWiersz>
        <NrWierszaFa>${index + 1}</NrWierszaFa>
        <P_7>${escapeXml(item.name || 'Usługa')}</P_7>
        <P_8A>${item.unit || 'szt'}</P_8A>
        <P_8B>${item.quantity || 1}</P_8B>
        <P_9A>${(item.unit_net_price || 0).toFixed(2)}</P_9A>
        <P_11>${(item.net_amount || 0).toFixed(2)}</P_11>
        <P_12>${item.vat_rate === 'zw' ? 'zw' : item.vat_rate === 'np' ? 'np' : (item.vat_rate || '23')}</P_12>
      </FaWiersz>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa>
    <SystemInfo>RIDO Fleet Management</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${entity?.nip || ''}</NIP>
      <Nazwa>${escapeXml(entity?.name || '')}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>${escapeXml(entity?.address_street || '')}</AdresL1>
      <AdresL2>${escapeXml(`${entity?.address_postal_code || ''} ${entity?.address_city || ''}`.trim())}</AdresL2>
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
      <Zwolnienie><P_19N>1</P_19N></Zwolnienie>
      <NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu>
      <P_23>2</P_23>
      <PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy>
    </Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>${itemsXML}
    <Platnosc>
      <TerminPlatnosci><Termin>${invoice.due_date || issueDate}</Termin></TerminPlatnosci>
      <FormaPlatnosci>${invoice.payment_method === 'cash' ? 'gotówka' : 'przelew'}</FormaPlatnosci>
      ${entity?.bank_account ? `<RachunekBankowy><NrRB>${String(entity.bank_account).replace(/\s/g, '')}</NrRB></RachunekBankowy>` : ''}
    </Platnosc>
  </Fa>
</Faktura>`;
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function errorFromResponse(prefix: string, response: Response, payload: any) {
  const detail = typeof payload === 'string'
    ? payload
    : payload?.error || payload?.message || payload?.title || payload?.raw || JSON.stringify(payload).slice(0, 500);
  return new Error(detail ? `${prefix}: HTTP ${response.status} — ${detail}` : `${prefix}: HTTP ${response.status}`);
}

function stripPemHeaders(value: string): string {
  return value.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function importPublicKey(publicKeyText: string): Promise<CryptoKey> {
  const keyBytes = base64ToBytes(stripPemHeaders(publicKeyText));
  return crypto.subtle.importKey('spki', keyBytes, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}

async function authenticateWithKsefToken(baseUrl: string, nip: string, ksefToken: string) {
  const challengeResponse = await fetch(`${baseUrl}/auth/challenge`, {
    headers: { 'Content-Type': 'application/json' },
  });
  const challengePayload = await readResponsePayload(challengeResponse);
  if (!challengeResponse.ok) throw errorFromResponse('Błąd pobierania challenge KSeF', challengeResponse, challengePayload);

  const challenge = challengePayload?.challenge;
  const timestampMs = challengePayload?.timestampMs;
  if (!challenge || !timestampMs) {
    throw new Error('KSeF nie zwrócił challenge lub timestampMs');
  }

  const publicKeyResponse = await fetch(`${baseUrl}/auth/public-key`);
  const publicKeyText = await publicKeyResponse.text();
  if (!publicKeyResponse.ok) {
    throw new Error(`Błąd pobierania klucza publicznego MF: HTTP ${publicKeyResponse.status}`);
  }

  const cryptoKey = await importPublicKey(publicKeyText);
  const plaintext = textEncoder.encode(`${ksefToken}|${timestampMs}`);
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, cryptoKey, plaintext);
  const encryptedToken = bytesToBase64(new Uint8Array(encrypted));

  const authResponse = await fetch(`${baseUrl}/auth/ksef-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge,
      contextIdentifier: { type: 'Nip', value: nip },
      encryptedToken,
    }),
  });
  const authPayload = await readResponsePayload(authResponse);
  if (!authResponse.ok) throw errorFromResponse('Błąd autoryzacji tokenem KSeF', authResponse, authPayload);

  const bearerToken = authPayload?.authenticationToken?.token || authPayload?.authenticationToken || authPayload?.token;
  if (!bearerToken) {
    throw new Error('KSeF nie zwrócił authenticationToken');
  }

  const redeemResponse = await fetch(`${baseUrl}/auth/token/redeem`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  const redeemPayload = await readResponsePayload(redeemResponse);
  if (!redeemResponse.ok) throw errorFromResponse('Błąd wymiany tokenu KSeF', redeemResponse, redeemPayload);

  const accessToken = redeemPayload?.accessToken?.token || redeemPayload?.accessToken;
  if (!accessToken) {
    throw new Error('KSeF nie zwrócił accessToken');
  }

  return {
    accessToken,
    publicKey: cryptoKey,
    authReferenceNumber: authPayload?.referenceNumber || null,
  };
}

async function getRequestUser(req: Request, supabase: any) {
  const authHeader = req.headers.get('Authorization');
  const jwt = authHeader?.replace('Bearer ', '').trim();
  if (!jwt) return null;

  const { data, error } = await supabase.auth.getUser(jwt);
  if (error) {
    console.warn('[KSeF] auth.getUser failed:', error.message);
    return null;
  }

  return data.user || null;
}

async function resolveRequestEntityId(req: Request, supabase: any, explicitEntityId?: string | null) {
  if (explicitEntityId) return explicitEntityId;
  const user = await getRequestUser(req, supabase);
  if (!user) return null;

  const { data: entity } = await supabase
    .from('entities')
    .select('id')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle();

  return entity?.id || null;
}

async function resolveKsefCredentials(options: {
  req: Request;
  supabase: any;
  body: KSeFRequest;
  entityId?: string | null;
}) {
  const { req, supabase, body, entityId } = options;
  let nip = body.nip?.trim() || null;
  let token = body.token?.trim() || null;
  let environment = normalizeEnvironment(body.environment);

  const user = await getRequestUser(req, supabase);
  if ((!nip || (!token && environment !== 'demo') || !body.environment) && user) {
    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('nip, ksef_token, ksef_environment')
      .eq('user_id', user.id)
      .maybeSingle();

    if (companySettings) {
      nip = nip || companySettings.nip || null;
      token = token || companySettings.ksef_token || null;
      if (!body.environment && companySettings.ksef_environment) {
        environment = normalizeEnvironment(companySettings.ksef_environment);
      }
    }
  }

  if ((!nip || (!token && environment !== 'demo')) && entityId) {
    const [{ data: entity }, { data: ksefSettings }] = await Promise.all([
      supabase.from('entities').select('id, nip').eq('id', entityId).maybeSingle(),
      supabase.from('ksef_settings').select('token_encrypted, environment, is_enabled').eq('entity_id', entityId).maybeSingle(),
    ]);

    if (ksefSettings?.is_enabled !== false) {
      nip = nip || entity?.nip || null;
      token = token || ksefSettings?.token_encrypted || null;
      if (!body.environment && ksefSettings?.environment) {
        environment = normalizeEnvironment(ksefSettings.environment);
      }
    }
  }

  return { nip, token, environment };
}

function getFirstXmlTagValue(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`));
  return match?.[1]?.trim() || '';
}

function getAllXmlTagValues(xml: string, tag: string): number[] {
  return Array.from(xml.matchAll(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'g')))
    .map((match) => Number((match[1] || '').replace(',', '.')))
    .filter((value) => Number.isFinite(value));
}

function getSupplierNip(xml: string): string {
  return xml.match(/<Podmiot1[\s\S]*?<NIP>([^<]+)<\/NIP>/)?.[1]?.trim() || '';
}

function getSupplierName(xml: string): string {
  return xml.match(/<Podmiot1[\s\S]*?<Nazwa>([^<]+)<\/Nazwa>/)?.[1]?.trim() || '';
}

function getMetadataInvoices(payload: any): any[] {
  if (Array.isArray(payload?.invoices)) return payload.invoices;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.invoices)) return payload.data.invoices;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  return [];
}

function getKsefReferenceNumber(invoice: any): string | null {
  return invoice?.ksefReferenceNumber || invoice?.ksefReference?.referenceNumber || invoice?.referenceNumber || null;
}

async function categorizePurchaseInvoice(supplierName: string, supplierNip: string, totalNet: number) {
  const fallback = 'inne';
  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) return fallback;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: `Faktura zakupowa od: ${supplierName} (NIP: ${supplierNip}), kwota netto: ${totalNet} PLN. Odpowiedz TYLKO jednym słowem: paliwo, naprawa, czesci_magazyn, ubezpieczenie, leasing, uslugi, inne`,
        }],
      }),
    });

    if (!response.ok) return fallback;
    const payload = await response.json();
    const category = payload?.content?.[0]?.text?.trim()?.toLowerCase();
    return ['paliwo', 'naprawa', 'czesci_magazyn', 'ubezpieczenie', 'leasing', 'uslugi', 'inne'].includes(category)
      ? category
      : fallback;
  } catch (error) {
    console.warn('[KSeF] AI categorization error:', error);
    return fallback;
  }
}

async function buildDemoInvoices(supabase: any, entityId: string | null, dateFrom: string) {
  const sampleSuppliers = [
    { name: 'Auto-Partner SA', nip: '6792881003', category: 'czesci_magazyn' },
    { name: 'BP Europa SE', nip: '1070010978', category: 'paliwo' },
    { name: 'PZU SA', nip: '5260300291', category: 'ubezpieczenie' },
    { name: 'Serwis-IT Sp. z o.o.', nip: '7811934421', category: 'uslugi' },
    { name: 'MotoLeasing Sp. z o.o.', nip: '1132853869', category: 'leasing' },
  ];

  const results: any[] = [];

  for (const supplier of sampleSuppliers) {
    const ksefNumber = `DEMO-${(entityId || 'direct').slice(0, 8)}-${supplier.nip}-${dateFrom}`;
    const totalNet = Math.round((Math.random() * 5000 + 500) * 100) / 100;
    const totalVat = Math.round(totalNet * 0.23 * 100) / 100;

    const invoiceData = {
      document_number: `FV/${new Date().getFullYear()}/${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`,
      ksef_number: ksefNumber,
      supplier_name: supplier.name,
      supplier_nip: supplier.nip,
      total_net: totalNet,
      total_vat: totalVat,
      total_gross: totalNet + totalVat,
      purchase_date: dateFrom,
      status: 'new',
      entity_id: entityId,
      ai_category: supplier.category,
    };

    const { error } = await supabase.from('purchase_invoices').upsert(invoiceData, { onConflict: 'ksef_number' });
    if (!error) results.push(invoiceData);
  }

  return results;
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
    const action = body.action;

    if (action === 'test_connection') {
      const environment = normalizeEnvironment(body.environment);

      if (environment === 'demo') {
        return json({
          success: true,
          demo: true,
          environment,
          message: 'Tryb demo GetRido aktywny',
        });
      }

      if (!body.nip || !body.token) {
        return json({ success: false, error: 'Brak NIP lub tokenu KSeF' }, 400);
      }

      const auth = await authenticateWithKsefToken(getBaseUrl(environment), body.nip, body.token);
      return json({
        success: true,
        environment,
        nip: body.nip,
        referenceNumber: auth.authReferenceNumber,
      });
    }

    if (action === 'get_settings') {
      if (!body.entity_id) {
        return json({ success: true, settings: null });
      }

      const { data: settings, error } = await supabase
        .from('ksef_settings')
        .select('*')
        .eq('entity_id', body.entity_id)
        .maybeSingle();

      if (error) throw error;
      return json({ success: true, settings: settings || null });
    }

    if (action === 'save_settings') {
      if (!body.entity_id) {
        return json({ success: false, error: 'Brak entity_id' }, 400);
      }

      const { error } = await supabase
        .from('ksef_settings')
        .upsert({
          entity_id: body.entity_id,
          is_enabled: body.is_enabled,
          environment: normalizeEnvironment(body.environment),
          token_encrypted: body.token,
          auto_send: body.auto_send || false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'entity_id' });

      if (error) throw error;
      return json({ success: true });
    }

    if (action === 'fetch_received') {
      const entityId = await resolveRequestEntityId(req, supabase, body.entity_id || null);
      const { nip, token, environment } = await resolveKsefCredentials({ req, supabase, body, entityId });
      const dateFrom = body.date_from || new Date().toISOString().split('T')[0];
      const dateTo = body.date_to || new Date().toISOString().split('T')[0];

      if (environment === 'demo') {
        const invoices = await buildDemoInvoices(supabase, entityId, dateFrom);
        return json({ success: true, demo: true, count: invoices.length, invoices });
      }

      if (!nip) return json({ success: false, error: 'Brak NIP firmy do połączenia z KSeF' }, 400);
      if (!token) return json({ success: false, error: 'Brak tokenu KSeF do pobrania faktur' }, 400);

      const baseUrl = getBaseUrl(environment);
      const { accessToken } = await authenticateWithKsefToken(baseUrl, nip, token);

      const queryResponse = await fetch(`${baseUrl}/invoices/query/metadata`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queryCriteria: {
            subjectType: 'subject2',
            dateRange: {
              startDate: `${dateFrom}T00:00:00Z`,
              endDate: `${dateTo}T23:59:59Z`,
              dateType: 'Invoicing',
            },
          },
          pageOffset: 0,
          pageSize: 100,
        }),
      });
      const queryPayload = await readResponsePayload(queryResponse);
      if (!queryResponse.ok) throw errorFromResponse('Błąd pobierania listy faktur z KSeF', queryResponse, queryPayload);

      const metadataInvoices = getMetadataInvoices(queryPayload);
      const results: any[] = [];

      for (const metadata of metadataInvoices) {
        const referenceNumber = getKsefReferenceNumber(metadata);
        if (!referenceNumber) continue;

        try {
          const xmlResponse = await fetch(`${baseUrl}/invoices/ksef/${referenceNumber}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const xml = await xmlResponse.text();
          if (!xmlResponse.ok) {
            console.warn(`[KSeF] XML fetch failed for ${referenceNumber}: HTTP ${xmlResponse.status}`);
            continue;
          }

          const totalNet = ['P_13_1', 'P_13_2', 'P_13_3', 'P_13_4', 'P_13_5', 'P_13_6', 'P_13_7']
            .flatMap((tag) => getAllXmlTagValues(xml, tag))
            .reduce((sum, value) => sum + value, 0);
          const totalVat = ['P_14_1', 'P_14_2', 'P_14_3', 'P_14_4', 'P_14_5']
            .flatMap((tag) => getAllXmlTagValues(xml, tag))
            .reduce((sum, value) => sum + value, 0);
          const totalGross = Number(getFirstXmlTagValue(xml, 'P_15').replace(',', '.')) || totalNet + totalVat;
          const supplierName = getSupplierName(xml) || metadata?.subjectName || 'Kontrahent';
          const supplierNip = getSupplierNip(xml) || metadata?.subjectIdentifier || '';
          const aiCategory = await categorizePurchaseInvoice(supplierName, supplierNip, totalNet || totalGross || 0);

          const invoiceData = {
            ksef_number: referenceNumber,
            document_number: getFirstXmlTagValue(xml, 'P_2') || referenceNumber,
            purchase_date: getFirstXmlTagValue(xml, 'P_1') || dateFrom,
            supplier_nip: supplierNip,
            supplier_name: supplierName,
            total_net: totalNet || 0,
            total_vat: totalVat || 0,
            total_gross: totalGross || 0,
            xml_content: xml,
            status: 'new',
            entity_id: entityId,
            ai_category: aiCategory,
          };

          const { error } = await supabase.from('purchase_invoices').upsert(invoiceData, { onConflict: 'ksef_number' });
          if (!error) results.push(invoiceData);
        } catch (invoiceError) {
          console.error('[KSeF] invoice parse error:', invoiceError);
        }
      }

      return json({ success: true, count: results.length, invoices: results });
    }

    if (action === 'generate_xml') {
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', body.invoice_id)
        .single();
      if (invoiceError || !invoice) throw new Error('Invoice not found');

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
      return json({ success: true, xml });
    }

    if (action === 'send') {
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*, entity:entities(*)')
        .eq('id', body.invoice_id)
        .single();
      if (invoiceError || !invoice) throw new Error('Invoice not found');

      const { data: items } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', body.invoice_id);

      const xml = generateInvoiceXML(invoice, invoice.entity, items || []);
      const { data: transmission, error: transmissionError } = await supabase
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
      if (transmissionError) throw transmissionError;

      try {
        const { nip, token, environment } = await resolveKsefCredentials({
          req,
          supabase,
          body,
          entityId: invoice.entity_id,
        });

        if (environment === 'demo') {
          const fakeReference = `DEMO/${new Date().getFullYear()}/${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

          await supabase.from('invoices').update({
            ksef_status: 'sent',
            ksef_reference: fakeReference,
          }).eq('id', body.invoice_id);

          await supabase.from('ksef_transmissions').update({
            status: 'sent',
            ksef_reference_number: fakeReference,
            sent_at: new Date().toISOString(),
            response_at: new Date().toISOString(),
            error_message: null,
          }).eq('id', transmission.id);

          return json({ success: true, demo: true, ksef_reference: fakeReference, transmission_id: transmission.id });
        }

        if (!nip) throw new Error('Brak NIP firmy do wysyłki KSeF');
        if (!token) throw new Error('Brak tokenu KSeF do wysyłki faktury');

        const baseUrl = getBaseUrl(environment);
        const { accessToken, publicKey } = await authenticateWithKsefToken(baseUrl, nip, token);

        const aesKey = await crypto.subtle.generateKey({ name: 'AES-CBC', length: 256 }, true, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const rawAesKey = new Uint8Array(await crypto.subtle.exportKey('raw', aesKey));
        const xmlBytes = textEncoder.encode(xml);
        const encryptedXml = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, xmlBytes));
        const encryptedAesKey = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawAesKey));

        const sessionResponse = await fetch(`${baseUrl}/sessions/online`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            formCode: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' },
            encryption: {
              encryptedSymmetricKey: bytesToBase64(encryptedAesKey),
              initializationVector: bytesToBase64(iv),
            },
          }),
        });
        const sessionPayload = await readResponsePayload(sessionResponse);
        if (!sessionResponse.ok) throw errorFromResponse('Błąd otwarcia sesji KSeF', sessionResponse, sessionPayload);

        const sessionReference = sessionPayload?.referenceNumber;
        if (!sessionReference) throw new Error('KSeF nie zwrócił numeru sesji');

        const ivPlusEncrypted = new Uint8Array(iv.length + encryptedXml.length);
        ivPlusEncrypted.set(iv, 0);
        ivPlusEncrypted.set(encryptedXml, iv.length);

        const documentHash = new Uint8Array(await crypto.subtle.digest('SHA-256', xmlBytes));
        const encryptedDocumentHash = new Uint8Array(await crypto.subtle.digest('SHA-256', ivPlusEncrypted));

        const sendResponse = await fetch(`${baseUrl}/sessions/online/${sessionReference}/invoices`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoiceHash: {
              hashSHA: { algorithm: 'SHA-256', encoding: 'Base64', value: bytesToBase64(documentHash) },
              fileSize: xmlBytes.byteLength,
            },
            encryptedDocumentHash: {
              hashSHA: { algorithm: 'SHA-256', encoding: 'Base64', value: bytesToBase64(encryptedDocumentHash) },
              fileSize: ivPlusEncrypted.byteLength,
            },
            encryptedDocumentContent: bytesToBase64(ivPlusEncrypted),
          }),
        });
        const sendPayload = await readResponsePayload(sendResponse);
        if (!sendResponse.ok) throw errorFromResponse('Błąd wysyłki faktury do KSeF', sendResponse, sendPayload);

        const invoiceReference = sendPayload?.referenceNumber || sendPayload?.ksefReferenceNumber || null;

        await fetch(`${baseUrl}/sessions/online/${sessionReference}/close`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => null);

        await supabase.from('invoices').update({
          ksef_status: 'sent',
          ksef_reference: invoiceReference,
        }).eq('id', body.invoice_id);

        await supabase.from('ksef_transmissions').update({
          status: 'sent',
          ksef_reference_number: invoiceReference,
          sent_at: new Date().toISOString(),
          response_at: new Date().toISOString(),
          error_message: null,
        }).eq('id', transmission.id);

        return json({ success: true, ksef_reference: invoiceReference, transmission_id: transmission.id });
      } catch (sendError: any) {
        await supabase.from('ksef_transmissions').update({
          status: 'error',
          error_message: sendError.message,
          response_at: new Date().toISOString(),
        }).eq('id', transmission.id);
        throw sendError;
      }
    }

    if (action === 'download') {
      if (!body.ksef_reference) {
        return json({ success: false, error: 'Brak numeru referencyjnego KSeF' }, 400);
      }

      const entityId = await resolveRequestEntityId(req, supabase, body.entity_id || null);
      const { nip, token, environment } = await resolveKsefCredentials({ req, supabase, body, entityId });
      if (environment === 'demo') {
        return json({ success: false, error: 'Tryb demo GetRido nie przechowuje dokumentów XML.' }, 400);
      }
      if (!nip || !token) {
        return json({ success: false, error: 'Brak danych autoryzacyjnych KSeF do pobrania XML.' }, 400);
      }

      const { accessToken } = await authenticateWithKsefToken(getBaseUrl(environment), nip, token);
      const xmlResponse = await fetch(`${getBaseUrl(environment)}/invoices/ksef/${body.ksef_reference}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const xml = await xmlResponse.text();
      if (!xmlResponse.ok) throw new Error(`Błąd pobierania XML z KSeF: HTTP ${xmlResponse.status}`);

      return json({ success: true, xml });
    }

    if (action === 'status') {
      if (!body.invoice_id) {
        return json({
          success: true,
          service: 'ksef',
          environments: Object.keys(ENVS),
        });
      }

      const { data: transmissions, error } = await supabase
        .from('ksef_transmissions')
        .select('*')
        .eq('invoice_id', body.invoice_id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      return json({ success: true, transmissions });
    }

    return json({ success: false, error: 'Unknown action' }, 400);
  } catch (error: any) {
    console.error('[KSeF] error:', error);
    return json({ success: false, error: error.message }, 500);
  }
});
