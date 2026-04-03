import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const KSEF_URLS: Record<string, string> = {
  test:        'https://api-test.ksef.mf.gov.pl/v2',
  demo:        'https://api-demo.ksef.mf.gov.pl/v2',
  production:  'https://api.ksef.mf.gov.pl/v2',
  integration: 'https://api-test.ksef.mf.gov.pl/v2',
};

const textEncoder = new TextEncoder();

type NormalizedEnvironment = 'test' | 'demo' | 'production';

interface KSeFRequest {
  action: 'send' | 'status' | 'download' | 'generate_xml' | 'get_settings' | 'save_settings' | 'fetch_received' | 'test_connection';
  invoice_id?: string;
  entity_id?: string;
  ksef_reference?: string;
  is_enabled?: boolean;
  environment?: string;
  token?: string;
  auto_send?: boolean;
  date_from?: string;
  date_to?: string;
  nip?: string;
  user_id?: string;
}

function jsonRes(data: unknown, status = 200) {
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

function getBaseUrl(env?: string): string {
  const normalized = normalizeEnvironment(env);
  return KSEF_URLS[normalized] || KSEF_URLS['demo'];
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
        <P_7>${escapeXml(item.name || 'UsÅuga')}</P_7>
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
      <FormaPlatnosci>${invoice.payment_method === 'cash' ? 'gotÃ³wka' : 'przelew'}</FormaPlatnosci>
      ${entity?.bank_account ? `<RachunekBankowy><NrRB>${String(entity.bank_account).replace(/\s/g, '')}</NrRB></RachunekBankowy>` : ''}
    </Platnosc>
  </Fa>
</Faktura>`;
}

// ========== HELPERS ==========

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

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function errorFromResponse(prefix: string, response: Response, payload: any) {
  const detail = typeof payload === 'string'
    ? payload
    : payload?.error || payload?.message || payload?.title || payload?.raw || JSON.stringify(payload).slice(0, 500);
  return new Error(detail ? `${prefix}: HTTP ${response.status} â ${detail}` : `${prefix}: HTTP ${response.status}`);
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

// ========== KSeF 2.0 AUTH (zgodnie z open-api.json) ==========

async function getKsefAccessToken(base: string, nip: string, ksefToken: string): Promise<{ accessToken: string; cryptoKey: CryptoKey }> {
  // KROK 2A â POST /auth/challenge (POST zgodnie z open-api.json)
  const chalRes = await fetch(`${base}/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!chalRes.ok) throw new Error(`[PHASE:challenge] HTTP ${chalRes.status}: ${await chalRes.text().catch(() => '')}`);
  const { challenge, timestampMs } = await chalRes.json();
  console.log('[KSeF][PHASE:challenge] OK, challenge:', challenge, 'ts:', timestampMs);

  if (!challenge || !timestampMs) {
    throw new Error('[PHASE:challenge] KSeF nie zwrÃ³ciÅ challenge lub timestampMs');
  }

  // KROK 2B â GET /security/public-key-certificates (zgodnie z open-api.json)
  const pubKeyRes = await fetch(`${base}/security/public-key-certificates`);
  if (!pubKeyRes.ok) throw new Error(`[PHASE:public-key] HTTP ${pubKeyRes.status}`);
  const certificates: Array<{ certificate: string; validFrom: string; validTo: string; usage: string[] }> = await pubKeyRes.json();

  const certObj = certificates.find(c => c.usage?.includes('KsefTokenEncryption')) || certificates[0];
  if (!certObj?.certificate) throw new Error('[PHASE:public-key] Brak certyfikatu KsefTokenEncryption');
  console.log('[KSeF][PHASE:public-key] certyfikat wybrany, waÅ¼ny do:', certObj.validTo);

  // Certyfikat to X.509 DER base64 â wyciÄgnij SubjectPublicKeyInfo
  const certDer = Uint8Array.from(atob(certObj.certificate), c => c.charCodeAt(0));

  function extractSpkiFromCertificate(der: Uint8Array): Uint8Array {
  // Parsuje certyfikat X.509 DER i wyciąga SubjectPublicKeyInfo (SPKI)
  // Testowane na certyfikatach z https://api-demo.ksef.mf.gov.pl/v2/security/public-key-certificates
  function parseLen(data: Uint8Array, pos: number): { len: number; nextPos: number } {
    const lb = data[pos];
    if (lb < 0x80) return { len: lb, nextPos: pos + 1 };
    const numBytes = lb & 0x7F;
    let len = 0;
    for (let i = 0; i < numBytes; i++) len = (len << 8) | data[pos + 1 + i];
    return { len, nextPos: pos + 1 + numBytes };
  }
  if (der[0] !== 0x30) throw new Error('[PHASE:public-key] Certyfikat nie zaczyna sie od SEQUENCE');
  const cert = parseLen(der, 1);
  if (der[cert.nextPos] !== 0x30) throw new Error('[PHASE:public-key] TBSCertificate nie jest SEQUENCE');
  const tbs = parseLen(der, cert.nextPos + 1);
  const tbsEnd = tbs.nextPos + tbs.len;
  // Szukaj AlgorithmIdentifier RSA: 30 0D 06 09 2A 86 48 86 F7 0D 01 01 01
  const rsaAlgId = [0x30, 0x0D, 0x06, 0x09, 0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x01];
  for (let i = tbs.nextPos; i < tbsEnd - rsaAlgId.length - 4; i++) {
    let match = true;
    for (let j = 0; j < rsaAlgId.length; j++) {
      if (der[i + j] !== rsaAlgId[j]) { match = false; break; }
    }
    if (match) {
      // Cofnij do SEQUENCE SubjectPublicKeyInfo (0x30 bezposrednio przed AlgorithmIdentifier)
      let spkiStart = i;
      for (let back = 1; back <= 6; back++) {
        if (der[i - back] === 0x30) { spkiStart = i - back; break; }
      }
      const spki = parseLen(der, spkiStart + 1);
      const spkiEnd = spki.nextPos + spki.len;
      if (spkiEnd <= der.length && spki.len > 100 && spki.len < 2000) {
        return der.slice(spkiStart, spkiEnd);
      }
    }
  }
  throw new Error('[PHASE:public-key] Nie znaleziono SubjectPublicKeyInfo w certyfikacie X.509 KSeF');
}

  const spkiBytes = extractSpkiFromCertificate(certDer);
  console.log('[KSeF][PHASE:public-key] SPKI wyciÄgniÄty z X.509, rozmiar:', spkiBytes.byteLength);

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey('spki', spkiBytes.buffer, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  } catch (importErr) {
    console.error('[KSeF][PHASE:public-key] importKey SPKI failed:', importErr);
    throw new Error('[PHASE:public-key] Nie moÅ¼na zaimportowaÄ klucza publicznego MF');
  }
  console.log('[KSeF][PHASE:public-key] Klucz RSA zaimportowany pomyÅlnie');

  // KROK 2C â Zaszyfruj token RSA-OAEP SHA-256
  const plaintext = textEncoder.encode(`${ksefToken}|${timestampMs}`);
  const encryptedBuf = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, cryptoKey, plaintext);
  const encryptedToken = bytesToBase64(new Uint8Array(encryptedBuf));
  console.log('[KSeF][PHASE:encrypt-token] Token zaszyfrowany, dÅugoÅÄ:', encryptedToken.length);

  // KROK 2D â POST /auth/ksef-token
  const authRes = await fetch(`${base}/auth/ksef-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge,
      contextIdentifier: { type: 'Nip', value: nip },
      encryptedToken,
    }),
  });
  if (!authRes.ok) throw new Error(`[PHASE:ksef-token] HTTP ${authRes.status}: ${await authRes.text().catch(() => '')}`);
  const authPayload = await authRes.json();
  const authToken = authPayload?.authenticationToken?.token || authPayload?.authenticationToken || authPayload?.token;
  if (!authToken) throw new Error('[PHASE:ksef-token] KSeF nie zwrÃ³ciÅ authenticationToken');
  console.log('[KSeF][PHASE:ksef-token] authenticationToken OK');

  // KROK 2E â POST /auth/token/redeem
  const redeemRes = await fetch(`${base}/auth/token/redeem`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` },
  });
  if (!redeemRes.ok) throw new Error(`[PHASE:token-redeem] HTTP ${redeemRes.status}: ${await redeemRes.text().catch(() => '')}`);
  const redeemPayload = await redeemRes.json();
  const accessToken = redeemPayload?.accessToken?.token || redeemPayload?.accessToken;
  if (!accessToken) throw new Error('[PHASE:token-redeem] KSeF nie zwrÃ³ciÅ accessToken');
  console.log('[KSeF][PHASE:token-redeem] accessToken OK');

  return { accessToken, cryptoKey };
}

// ========== RESOLVE CREDENTIALS ==========

async function getRequestUser(req: Request, supabase: any) {
  const authHeader = req.headers.get('Authorization');
  const jwt = authHeader?.replace('Bearer ', '').trim();
  if (!jwt) return null;
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error) { console.warn('[KSeF] auth.getUser failed:', error.message); return null; }
  return data.user || null;
}

async function resolveRequestEntityId(req: Request, supabase: any, explicitEntityId?: string | null) {
  if (explicitEntityId) return explicitEntityId;
  const user = await getRequestUser(req, supabase);
  if (!user) return null;
  const { data: entity } = await supabase.from('entities').select('id').eq('owner_user_id', user.id).limit(1).maybeSingle();
  return entity?.id || null;
}

async function resolveKsefCredentials(options: { req: Request; supabase: any; body: KSeFRequest; entityId?: string | null }) {
  const { req, supabase, body, entityId } = options;
  let nip = body.nip?.trim() || null;
  let token = body.token?.trim() || null;
  let environment = normalizeEnvironment(body.environment);

  const user = await getRequestUser(req, supabase);
  if ((!nip || !token || !body.environment) && user) {
    const { data: cs } = await supabase.from('company_settings').select('nip, ksef_token, ksef_environment').eq('user_id', user.id).maybeSingle();
    if (cs) {
      nip = nip || cs.nip || null;
      token = token || cs.ksef_token || null;
      if (!body.environment && cs.ksef_environment) environment = normalizeEnvironment(cs.ksef_environment);
    }
  }

  if ((!nip || !token) && entityId) {
    const [{ data: entity }, { data: ksefSettings }] = await Promise.all([
      supabase.from('entities').select('id, nip').eq('id', entityId).maybeSingle(),
      supabase.from('ksef_settings').select('token_encrypted, environment, is_enabled').eq('entity_id', entityId).maybeSingle(),
    ]);
    if (ksefSettings?.is_enabled !== false) {
      nip = nip || entity?.nip || null;
      token = token || ksefSettings?.token_encrypted || null;
      if (!body.environment && ksefSettings?.environment) environment = normalizeEnvironment(ksefSettings.environment);
    }
  }

  return { nip, token, environment, userId: user?.id || null };
}

// ========== AI CATEGORIZATION ==========

async function categorizePurchaseInvoice(supplierName: string, supplierNip: string, totalNet: number) {
  const fallback = 'inne';
  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) return fallback;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{ role: 'user', content: `Faktura zakupowa od: ${supplierName} (NIP: ${supplierNip}), kwota netto: ${totalNet} PLN. Odpowiedz TYLKO jednym sÅowem: paliwo, naprawa, czesci_magazyn, ubezpieczenie, leasing, uslugi, inne` }],
      }),
    });
    if (!response.ok) return fallback;
    const payload = await response.json();
    const category = payload?.content?.[0]?.text?.trim()?.toLowerCase();
    return ['paliwo', 'naprawa', 'czesci_magazyn', 'ubezpieczenie', 'leasing', 'uslugi', 'inne'].includes(category) ? category : fallback;
  } catch { return fallback; }
}

// ========== DEMO INVOICES ==========

async function buildDemoInvoices(supabase: any, entityId: string | null, userId: string | null, dateFrom: string) {
  const sampleSuppliers = [
    { name: 'Auto-Partner SA', nip: '6792881003', category: 'czesci_magazyn' },
    { name: 'BP Europa SE', nip: '1070010978', category: 'paliwo' },
    { name: 'PZU SA', nip: '5260300291', category: 'ubezpieczenie' },
    { name: 'Serwis-IT Sp. z o.o.', nip: '7811934421', category: 'uslugi' },
    { name: 'MotoLeasing Sp. z o.o.', nip: '1132853869', category: 'leasing' },
  ];
  const results: any[] = [];
  for (const supplier of sampleSuppliers) {
    const ksefNumber = `DEMO-${(entityId || userId || 'direct').slice(0, 8)}-${supplier.nip}-${dateFrom}`;
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
      user_id: userId,
      ai_category: supplier.category,
      environment: 'demo',
    };
    const { error } = await supabase.from('purchase_invoices').upsert(invoiceData, { onConflict: 'ksef_number' });
    if (!error) results.push(invoiceData);
  }
  return results;
}

// ========== MAIN HANDLER ==========

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

    // ========== test_connection ==========
    if (action === 'test_connection') {
      const { nip, token, environment } = body;
      if (!nip || !token) return jsonRes({ success: false, error: 'Brak NIP lub tokenu KSeF' }, 400);

      const env = normalizeEnvironment(environment);
      if (env === 'demo') {
        return jsonRes({ success: true, demo: true, environment: env, message: 'Tryb demo GetRido aktywny' });
      }

      const base = getBaseUrl(env);
      try {
        await getKsefAccessToken(base, nip, token);
        console.log('[KSeF][PHASE:test_connection] SUCCESS env:', env);
        return jsonRes({ success: true, environment: env, nip });
      } catch (err: any) {
        console.error('[KSeF][PHASE:test_connection] FAIL:', err.message);
        return jsonRes({ success: false, error: err.message });
      }
    }

    // ========== get_settings ==========
    if (action === 'get_settings') {
      if (!body.entity_id) return jsonRes({ success: true, settings: null });
      const { data: settings, error } = await supabase.from('ksef_settings').select('*').eq('entity_id', body.entity_id).maybeSingle();
      if (error) throw error;
      return jsonRes({ success: true, settings: settings || null });
    }

    // ========== save_settings ==========
    if (action === 'save_settings') {
      if (!body.entity_id) return jsonRes({ success: false, error: 'Brak entity_id' }, 400);
      const { error } = await supabase.from('ksef_settings').upsert({
        entity_id: body.entity_id,
        is_enabled: body.is_enabled,
        environment: normalizeEnvironment(body.environment),
        token_encrypted: body.token,
        auto_send: body.auto_send || false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'entity_id' });
      if (error) throw error;
      return jsonRes({ success: true });
    }

    // ========== fetch_received ==========
    if (action === 'fetch_received') {
      const entityId = await resolveRequestEntityId(req, supabase, body.entity_id || null);
      const { nip, token, environment, userId } = await resolveKsefCredentials({ req, supabase, body, entityId });
      const dateFrom = body.date_from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const dateTo = body.date_to || new Date().toISOString().split('T')[0];

      // TRYB MOCK / DEMO GetRido
      if (environment === 'demo') {
        const invoices = await buildDemoInvoices(supabase, entityId, userId, dateFrom);
        return jsonRes({ success: true, demo: true, count: invoices.length, invoices });
      }

      if (!nip) return jsonRes({ success: false, error: 'Brak NIP firmy â skonfiguruj w zakÅadce KSeF' }, 400);
      if (!token) return jsonRes({ success: false, error: 'Brak tokenu KSeF â skonfiguruj integracjÄ w zakÅadce KSeF' }, 400);

      const base = getBaseUrl(environment);
      console.log('[KSeF][PHASE:fetch-received] START env:', environment, 'base:', base);
      const { accessToken } = await getKsefAccessToken(base, nip, token);
      console.log('[KSeF][PHASE:fetch-received] auth OK');

      // POST /invoices/query/metadata
      const queryRes = await fetch(`${base}/invoices/query/metadata`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
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
      const queryPayload = await readResponsePayload(queryRes);
      if (!queryRes.ok) throw errorFromResponse('BÅÄd pobierania listy faktur z KSeF', queryRes, queryPayload);

      const invoiceList = getMetadataInvoices(queryPayload);
      console.log('[KSeF][PHASE:query-metadata] znaleziono:', invoiceList.length, 'faktur');

      const results: any[] = [];
      for (const metadata of invoiceList) {
        const referenceNumber = getKsefReferenceNumber(metadata);
        if (!referenceNumber) continue;

        try {
          const xmlRes = await fetch(`${base}/invoices/ksef/${referenceNumber}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (!xmlRes.ok) { console.warn(`[KSeF] XML fetch failed for ${referenceNumber}: HTTP ${xmlRes.status}`); continue; }
          const xml = await xmlRes.text();

          const totalNet = ['P_13_1', 'P_13_2', 'P_13_3', 'P_13_4', 'P_13_5', 'P_13_6', 'P_13_7']
            .flatMap((tag) => getAllXmlTagValues(xml, tag)).reduce((sum, v) => sum + v, 0);
          const totalVat = ['P_14_1', 'P_14_2', 'P_14_3', 'P_14_4', 'P_14_5']
            .flatMap((tag) => getAllXmlTagValues(xml, tag)).reduce((sum, v) => sum + v, 0);
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
            user_id: userId,
            ai_category: aiCategory,
            environment,
          };

          const { error } = await supabase.from('purchase_invoices').upsert(invoiceData, { onConflict: 'ksef_number' });
          if (!error) results.push(invoiceData);
          console.log('[KSeF][PHASE:fetch-invoice] zapisano:', referenceNumber, 'kategoria:', aiCategory);
        } catch (invoiceError: any) {
          console.error('[KSeF][PHASE:fetch-invoice] bÅÄd dla', referenceNumber, ':', invoiceError.message);
        }
      }

      console.log('[KSeF][PHASE:fetch-received] DONE, zapisano:', results.length, 'faktur');
      return jsonRes({ success: true, count: results.length, invoices: results, environment });
    }

    // ========== generate_xml ==========
    if (action === 'generate_xml') {
      const { data: invoice, error: invoiceError } = await supabase.from('invoices').select('*').eq('id', body.invoice_id).single();
      if (invoiceError || !invoice) throw new Error('Invoice not found');
      const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', body.invoice_id);
      const { data: entity } = await supabase.from('entities').select('*').eq('id', invoice.entity_id).single();
      const xml = generateInvoiceXML(invoice, entity, items || []);
      return jsonRes({ success: true, xml });
    }

    // ========== send ==========
    if (action === 'send') {
      const { data: invoice, error: invoiceError } = await supabase.from('invoices').select('*, entity:entities(*)').eq('id', body.invoice_id).single();
      if (invoiceError || !invoice) throw new Error('[PHASE:load-invoice] Faktura nie znaleziona');
      const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', body.invoice_id);

      const xml = generateInvoiceXML(invoice, invoice.entity, items || []);
      const xmlBytes = textEncoder.encode(xml);
      console.log('[KSeF][PHASE:xml] wygenerowany, rozmiar:', xmlBytes.byteLength, 'bajtÃ³w');

      const { data: transmission, error: transmissionError } = await supabase.from('ksef_transmissions').insert({
        invoice_id: body.invoice_id,
        entity_id: invoice.entity_id,
        direction: 'outgoing',
        status: 'pending',
        xml_content: xml,
      }).select().single();
      if (transmissionError) throw transmissionError;

      try {
        const { nip, token, environment } = await resolveKsefCredentials({ req, supabase, body, entityId: invoice.entity_id });

        // TRYB DEMO
        if (environment === 'demo') {
          const fakeRef = `DEMO/${new Date().getFullYear()}/${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
          await supabase.from('invoices').update({ ksef_status: 'sent', ksef_reference: fakeRef }).eq('id', body.invoice_id);
          await supabase.from('ksef_transmissions').update({
            status: 'sent', ksef_reference_number: fakeRef, sent_at: new Date().toISOString(),
            response_at: new Date().toISOString(), error_message: null, environment: 'demo',
          }).eq('id', transmission.id);
          return jsonRes({ success: true, demo: true, ksef_reference: fakeRef, transmission_id: transmission.id });
        }

        if (!nip) throw new Error('[PHASE:config] Brak NIP firmy do wysyÅki KSeF');
        if (!token) throw new Error('[PHASE:config] Brak tokenu KSeF do wysyÅki faktury');

        const base = getBaseUrl(environment);
        const { accessToken, cryptoKey } = await getKsefAccessToken(base, nip, token);

        // AES-256-CBC encryption
        const aesKey = await crypto.subtle.generateKey({ name: 'AES-CBC', length: 256 }, true, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const rawAesKey = new Uint8Array(await crypto.subtle.exportKey('raw', aesKey));
        const encXmlBuf = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, xmlBytes);
        const encXmlBytes = new Uint8Array(encXmlBuf);
        const ivPlusEncrypted = new Uint8Array(iv.byteLength + encXmlBytes.byteLength);
        ivPlusEncrypted.set(iv, 0);
        ivPlusEncrypted.set(encXmlBytes, iv.byteLength);
        console.log('[KSeF][PHASE:encrypt] XML zaszyfrowany AES-256-CBC, rozmiar:', ivPlusEncrypted.byteLength);

        // Encrypt AES key with MF public key
        const encAesKeyBuf = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, cryptoKey, rawAesKey);
        const encryptedSymmetricKey = bytesToBase64(new Uint8Array(encAesKeyBuf));
        const initializationVector = bytesToBase64(iv);

        // SHA-256 hashes
        const xmlHashBuf = await crypto.subtle.digest('SHA-256', xmlBytes);
        const encHashBuf = await crypto.subtle.digest('SHA-256', ivPlusEncrypted);
        const xmlHashB64 = bytesToBase64(new Uint8Array(xmlHashBuf));
        const encHashB64 = bytesToBase64(new Uint8Array(encHashBuf));

        // Open session
        const sessionRes = await fetch(`${base}/sessions/online`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            formCode: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' },
            encryption: { encryptedSymmetricKey, initializationVector },
          }),
        });
        if (!sessionRes.ok) throw new Error(`[PHASE:session-open] HTTP ${sessionRes.status}: ${(await sessionRes.text()).slice(0, 300)}`);
        const { referenceNumber: sessionRef } = await sessionRes.json();
        console.log('[KSeF][PHASE:session-open] sesja otwarta, ref:', sessionRef);

        await supabase.from('ksef_transmissions').update({ status: 'session_open', ksef_reference_number: sessionRef, environment }).eq('id', transmission.id);

        // Send invoice
        const sendRes = await fetch(`${base}/sessions/online/${sessionRef}/invoices`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceHash: {
              hashSHA: { algorithm: 'SHA-256', encoding: 'Base64', value: xmlHashB64 },
              fileSize: xmlBytes.byteLength,
            },
            encryptedDocumentHash: {
              hashSHA: { algorithm: 'SHA-256', encoding: 'Base64', value: encHashB64 },
              fileSize: ivPlusEncrypted.byteLength,
            },
            encryptedDocumentContent: bytesToBase64(ivPlusEncrypted),
          }),
        });
        if (!sendRes.ok) {
          const errTxt = (await sendRes.text()).slice(0, 300);
          await supabase.from('ksef_transmissions').update({ status: 'error', error_message: `[PHASE:invoice-send] HTTP ${sendRes.status}: ${errTxt}` }).eq('id', transmission.id);
          throw new Error(`[PHASE:invoice-send] HTTP ${sendRes.status}: ${errTxt}`);
        }
        const { referenceNumber: invoiceRef } = await sendRes.json();
        console.log('[KSeF][PHASE:invoice-send] faktura wysÅana, invoiceRef:', invoiceRef);

        await supabase.from('ksef_transmissions').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', transmission.id);

        // Close session
        await fetch(`${base}/sessions/online/${sessionRef}/close`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` },
        }).catch(() => null);
        console.log('[KSeF][PHASE:session-close] sesja zamkniÄta');

        // Polling session status (max 8 tries, 3s each)
        let ksefNumber: string | null = null;
        let upoXml: string | null = null;
        let finalStatus = 'processing';

        for (let i = 0; i < 8; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const stRes = await fetch(`${base}/sessions/${sessionRef}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (!stRes.ok) { console.error(`[KSeF][PHASE:session-status] poll ${i + 1} HTTP ${stRes.status}`); break; }
          const stData = await stRes.json();
          const st = (stData.status || stData.processingStatus || '').toString();
          console.log(`[KSeF][PHASE:session-status] prÃ³ba ${i + 1}/8, status: ${st}`);

          if (st === 'Finished' || st === 'FINISHED') {
            finalStatus = 'accepted';
            const invListRes = await fetch(`${base}/sessions/${sessionRef}/invoices`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (invListRes.ok) {
              const invListData = await invListRes.json();
              ksefNumber = invListData.invoices?.[0]?.ksefReferenceNumber || null;
              console.log('[KSeF][PHASE:session-status] numer KSeF:', ksefNumber);
            }
            if (invoiceRef) {
              try {
                const upoRes = await fetch(`${base}/sessions/${sessionRef}/invoices/${invoiceRef}/upo`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                if (upoRes.ok) { upoXml = await upoRes.text(); console.log('[KSeF][PHASE:upo] UPO pobrane'); }
              } catch { /* ignore */ }
            }
            break;
          }

          if (st === 'Failed' || st === 'FAILED') {
            finalStatus = 'rejected';
            let errDetail = 'Faktura odrzucona przez KSeF';
            try {
              const failRes = await fetch(`${base}/sessions/${sessionRef}/invoices/failed`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
              if (failRes.ok) { const fd = await failRes.json(); errDetail = JSON.stringify(fd?.invoices?.[0]?.status || fd).slice(0, 400); }
            } catch { /* ignore */ }
            await supabase.from('ksef_transmissions').update({ status: 'rejected', error_message: errDetail, response_at: new Date().toISOString() }).eq('id', transmission.id);
            await supabase.from('invoices').update({ ksef_status: 'rejected' }).eq('id', body.invoice_id);
            return jsonRes({ success: false, error: errDetail, session_ref: sessionRef });
          }
        }

        // Save final results
        await supabase.from('ksef_transmissions').update({
          status: finalStatus,
          ksef_reference_number: ksefNumber || sessionRef,
          response_at: new Date().toISOString(),
          ...(upoXml ? { upo_content: upoXml } : {}),
          environment,
        }).eq('id', transmission.id);
        await supabase.from('invoices').update({ ksef_status: finalStatus, ksef_reference: ksefNumber, ksef_environment: environment }).eq('id', body.invoice_id);

        console.log('[KSeF][PHASE:complete] status:', finalStatus, 'ksefNumber:', ksefNumber, 'UPO:', !!upoXml);
        return jsonRes({ success: true, ksef_reference: ksefNumber, session_ref: sessionRef, status: finalStatus, upo_available: !!upoXml, environment, transmission_id: transmission.id });
      } catch (sendError: any) {
        await supabase.from('ksef_transmissions').update({ status: 'error', error_message: sendError.message, response_at: new Date().toISOString() }).eq('id', transmission.id);
        throw sendError;
      }
    }

    // ========== download ==========
    if (action === 'download') {
      if (!body.ksef_reference) return jsonRes({ success: false, error: 'Brak numeru referencyjnego KSeF' }, 400);
      const entityId = await resolveRequestEntityId(req, supabase, body.entity_id || null);
      const { nip, token, environment } = await resolveKsefCredentials({ req, supabase, body, entityId });
      if (environment === 'demo') return jsonRes({ success: false, error: 'Tryb demo GetRido nie przechowuje dokumentÃ³w XML.' }, 400);
      if (!nip || !token) return jsonRes({ success: false, error: 'Brak danych autoryzacyjnych KSeF do pobrania XML.' }, 400);
      const base = getBaseUrl(environment);
      const { accessToken } = await getKsefAccessToken(base, nip, token);
      const xmlRes = await fetch(`${base}/invoices/ksef/${body.ksef_reference}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      const xml = await xmlRes.text();
      if (!xmlRes.ok) throw new Error(`BÅÄd pobierania XML z KSeF: HTTP ${xmlRes.status}`);
      return jsonRes({ success: true, xml });
    }

    // ========== status ==========
    if (action === 'status') {
      if (!body.invoice_id) return jsonRes({ success: true, service: 'ksef', environments: Object.keys(KSEF_URLS) });
      const { data: transmissions, error } = await supabase.from('ksef_transmissions').select('*').eq('invoice_id', body.invoice_id).order('created_at', { ascending: false });
      if (error) throw error;
      return jsonRes({ success: true, transmissions });
    }

    return jsonRes({ success: false, error: 'Unknown action' }, 400);
  } catch (error: any) {
    console.error('[KSeF] error:', error);
    return jsonRes({ success: false, error: error.message }, 500);
  }
});
