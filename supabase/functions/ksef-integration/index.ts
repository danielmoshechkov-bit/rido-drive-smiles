import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const KSEF_URLS: Record<string, string> = {
  test:       'https://api-test.ksef.mf.gov.pl/v2',
  demo:       'https://api-demo.ksef.mf.gov.pl/v2',
  production: 'https://api.ksef.mf.gov.pl/v2',
};

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getBaseUrl(env?: string): string {
  if (env === 'test' || env === 'integration') return KSEF_URLS.test;
  if (env === 'production') return KSEF_URLS.production;
  return KSEF_URLS.demo;
}

function normalizeEnv(env?: string): string {
  if (env === 'integration') return 'test';
  if (env === 'test' || env === 'production' || env === 'demo') return env;
  return 'demo';
}

// ========== HELPERS ==========

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function getTag(xml: string, tag: string): string {
  return xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`))?.[1]?.trim() || '';
}

function getAllTagValues(xml: string, tag: string): number[] {
  return Array.from(xml.matchAll(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'g')))
    .map(m => Number((m[1] || '').replace(',', '.')))
    .filter(v => Number.isFinite(v));
}

// ========== X.509 SPKI EXTRACTION ==========

function extractSpkiFromX509(der: Uint8Array): Uint8Array {
  function parseLen(data: Uint8Array, pos: number): { len: number; next: number } {
    const b = data[pos];
    if (b < 0x80) return { len: b, next: pos + 1 };
    const n = b & 0x7F;
    let len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | data[pos + 1 + i];
    return { len, next: pos + 1 + n };
  }

  // RSA AlgorithmIdentifier: 30 0D 06 09 2A 86 48 86 F7 0D 01 01 01 05 00
  const rsaAlgId = [0x30, 0x0D, 0x06, 0x09, 0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x01];

  for (let i = 0; i < der.length - rsaAlgId.length - 10; i++) {
    let match = true;
    for (let j = 0; j < rsaAlgId.length; j++) {
      if (der[i + j] !== rsaAlgId[j]) { match = false; break; }
    }
    if (!match) continue;

    // SPKI SEQUENCE starts at 0x30 right before AlgorithmIdentifier
    let spkiStart = i;
    for (let back = 1; back <= 6; back++) {
      if (der[i - back] === 0x30) { spkiStart = i - back; break; }
    }

    const spki = parseLen(der, spkiStart + 1);
    const spkiEnd = spki.next + spki.len;
    if (spkiEnd <= der.length && spki.len > 100 && spki.len < 2000) {
      return der.slice(spkiStart, spkiEnd);
    }
  }
  throw new Error('[PHASE:public-key] Nie znaleziono SubjectPublicKeyInfo w certyfikacie X.509');
}

// ========== KSeF 2.0 AUTH ==========

async function getKsefAccessToken(base: string, nip: string, ksefToken: string): Promise<{ accessToken: string; cryptoKey: CryptoKey }> {
  // Krok 1 — POST /auth/challenge
  console.log('[KSeF][AUTH] Step 1: POST', base + '/auth/challenge');
  const chalRes = await fetch(`${base}/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!chalRes.ok) {
    const txt = await chalRes.text().catch(() => '');
    throw new Error(`[PHASE:challenge] HTTP ${chalRes.status}: ${txt.slice(0, 300)}`);
  }
  const chalData = await chalRes.json();
  const challenge = chalData.challenge;
  const timestampMs = chalData.timestampMs || chalData.timestamp;
  if (!challenge || !timestampMs) throw new Error('[PHASE:challenge] Brak challenge lub timestampMs w odpowiedzi');
  console.log('[KSeF][AUTH] Challenge OK, ts:', timestampMs);

  // Krok 2 — GET /security/public-key-certificates
  console.log('[KSeF][AUTH] Step 2: GET', base + '/security/public-key-certificates');
  const pubKeyRes = await fetch(`${base}/security/public-key-certificates`);
  if (!pubKeyRes.ok) throw new Error(`[PHASE:public-key] HTTP ${pubKeyRes.status}`);
  const certificates = await pubKeyRes.json();

  const certArr = Array.isArray(certificates) ? certificates : (certificates?.certificates || []);
  const certObj = certArr.find((c: any) => c.usage?.includes('KsefTokenEncryption')) || certArr[0];
  if (!certObj?.certificate) throw new Error('[PHASE:public-key] Brak certyfikatu KsefTokenEncryption');
  console.log('[KSeF][AUTH] Cert found, validTo:', certObj.validTo);

  const certB64 = certObj.certificate.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const certDer = b64ToBytes(certB64);
  const spkiBytes = extractSpkiFromX509(certDer);
  console.log('[KSeF][AUTH] SPKI extracted, size:', spkiBytes.byteLength);

  const cryptoKey = await crypto.subtle.importKey(
    'spki', spkiBytes.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false, ['encrypt']
  );
  console.log('[KSeF][AUTH] RSA key imported');

  // Krok 3 — Zaszyfruj token
  const plaintext = new TextEncoder().encode(`${ksefToken}|${timestampMs}`);
  const encBuf = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, cryptoKey, plaintext);
  const encryptedToken = bytesToB64(new Uint8Array(encBuf));
  console.log('[KSeF][AUTH] Token encrypted, len:', encryptedToken.length);

  // Krok 4 — POST /auth/ksef-token
  console.log('[KSeF][AUTH] Step 4: POST', base + '/auth/ksef-token');
  const authRes = await fetch(`${base}/auth/ksef-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge,
      contextIdentifier: { type: 'Nip', value: nip },
      encryptedToken,
    }),
  });
  if (!authRes.ok) {
    const txt = await authRes.text().catch(() => '');
    throw new Error(`[PHASE:ksef-token] HTTP ${authRes.status}: ${txt.slice(0, 500)}`);
  }
  const authData = await authRes.json();
  const authenticationToken = authData?.authenticationToken?.token || authData?.authenticationToken;
  if (!authenticationToken) throw new Error('[PHASE:ksef-token] Brak authenticationToken w odpowiedzi: ' + JSON.stringify(authData).slice(0, 300));
  const referenceNumber = authData?.referenceNumber;
  console.log('[KSeF][AUTH] authenticationToken OK, referenceNumber:', referenceNumber);

  // Krok 4.5 — Polling statusu uwierzytelniania
  if (referenceNumber) {
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const stRes = await fetch(`${base}/auth/${referenceNumber}`, {
        headers: { 'Authorization': `Bearer ${authenticationToken}` }
      });
      if (!stRes.ok) continue;
      const stData = await stRes.json();
      const st = String(stData.authenticationStatus || stData.processingStatus || stData.status || '');
      console.log('[KSeF][PHASE:auth-status] proba', i + 1, 'status:', st);
      if (st === '200' || st.toLowerCase().includes('success') || st.toLowerCase().includes('authentic')) break;
    }
  }

  // Krok 5 — POST /auth/token/redeem
  console.log('[KSeF][AUTH] Step 5: POST', base + '/auth/token/redeem');
  const redeemRes = await fetch(`${base}/auth/token/redeem`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authenticationToken}` },
  });
  if (!redeemRes.ok) {
    const txt = await redeemRes.text().catch(() => '');
    throw new Error(`[PHASE:token-redeem] HTTP ${redeemRes.status}: ${txt.slice(0, 300)}`);
  }
  const redeemData = await redeemRes.json();
  const accessTokenValue = redeemData?.accessToken?.token || redeemData?.accessToken;
  if (!accessTokenValue) throw new Error('[PHASE:token-redeem] Brak accessToken w odpowiedzi');
  console.log('[KSeF][AUTH] accessToken OK');

  return { accessToken: accessTokenValue, cryptoKey };
}

// ========== GET USER FROM JWT ==========

async function getUserFromJwt(req: Request, supabase: any) {
  const authHeader = req.headers.get('Authorization');
  const jwt = authHeader?.replace('Bearer ', '').trim();
  if (!jwt) return null;
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error) return null;
  return data.user || null;
}

// ========== RESOLVE CREDENTIALS ==========

async function resolveCredentials(req: Request, supabase: any, body: any) {
  let nip = body.nip?.trim() || null;
  let token = body.token?.trim() || null;
  let environment = normalizeEnv(body.environment);
  let userId: string | null = null;

  const user = await getUserFromJwt(req, supabase);
  userId = user?.id || null;

  // Try company_settings first
  if (userId && (!nip || !token)) {
    const { data: cs } = await supabase
      .from('company_settings')
      .select('nip, ksef_token, ksef_environment')
      .eq('user_id', userId)
      .maybeSingle();
    if (cs) {
      nip = nip || cs.nip || null;
      token = token || cs.ksef_token || null;
      if (!body.environment && cs.ksef_environment) environment = normalizeEnv(cs.ksef_environment);
    }
  }

  // Try entity + ksef_settings
  const entityId = body.entity_id || null;
  if (entityId && (!nip || !token)) {
    const [{ data: entity }, { data: ks }] = await Promise.all([
      supabase.from('entities').select('nip').eq('id', entityId).maybeSingle(),
      supabase.from('ksef_settings').select('token_encrypted, environment').eq('entity_id', entityId).maybeSingle(),
    ]);
    nip = nip || entity?.nip || null;
    token = token || ks?.token_encrypted || null;
    if (!body.environment && ks?.environment) environment = normalizeEnv(ks.environment);
  }

  return { nip, token, environment, userId, entityId };
}

// ========== AI CATEGORIZATION ==========

async function categorize(supplierName: string): Promise<string> {
  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key || !supplierName) return 'inne';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 30,
        messages: [{ role: 'user', content: `Faktura od: ${supplierName}. Odpowiedz TYLKO jednym slowem: paliwo | naprawa | czesci_magazyn | ubezpieczenie | leasing | uslugi | inne` }],
      }),
    });
    if (!res.ok) return 'inne';
    const d = await res.json();
    const cat = d.content?.[0]?.text?.trim()?.toLowerCase();
    return ['paliwo', 'naprawa', 'czesci_magazyn', 'ubezpieczenie', 'leasing', 'uslugi', 'inne'].includes(cat) ? cat : 'inne';
  } catch { return 'inne'; }
}

// ========== generateInvoiceXML & escapeXml — BEZ ZMIAN ==========

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

    const body = await req.json();
    const action = body.action;

    // ========== test_connection ==========
    if (action === 'test_connection') {
      const { nip, token, environment } = body;
      if (!nip || !token) return jsonRes({ success: false, error: 'Brak NIP lub tokenu KSeF' }, 400);

      const env = normalizeEnv(environment);
      const base = getBaseUrl(env);
      try {
        await getKsefAccessToken(base, nip, token);
        console.log('[KSeF] test_connection SUCCESS, env:', env);
        return jsonRes({ success: true, environment: env, nip });
      } catch (err: any) {
        console.error('[KSeF] test_connection FAIL:', err.message);
        return jsonRes({ success: false, error: err.message });
      }
    }

    // ========== get_settings ==========
    if (action === 'get_settings') {
      if (!body.entity_id) return jsonRes({ success: true, settings: null });
      const { data: settings } = await supabase.from('ksef_settings').select('*').eq('entity_id', body.entity_id).maybeSingle();
      return jsonRes({ success: true, settings: settings || null });
    }

    // ========== save_settings ==========
    if (action === 'save_settings') {
      if (!body.entity_id) return jsonRes({ success: false, error: 'Brak entity_id' }, 400);
      const { error } = await supabase.from('ksef_settings').upsert({
        entity_id: body.entity_id,
        is_enabled: body.is_enabled,
        environment: normalizeEnv(body.environment),
        token_encrypted: body.token,
        auto_send: body.auto_send || false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'entity_id' });
      if (error) throw error;
      return jsonRes({ success: true });
    }

    // ========== status ==========
    if (action === 'status') {
      if (!body.invoice_id) return jsonRes({ success: true, service: 'ksef', environments: Object.keys(KSEF_URLS) });
      const { data: transmissions, error } = await supabase
        .from('ksef_transmissions').select('*')
        .eq('invoice_id', body.invoice_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return jsonRes({ success: true, transmissions });
    }

    // ========== generate_xml ==========
    if (action === 'generate_xml') {
      const { data: invoice, error: invErr } = await supabase.from('user_invoices').select('*').eq('id', body.invoice_id).single();
      if (invErr || !invoice) throw new Error('Faktura nie znaleziona');
      const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', body.invoice_id);
      const { data: entity } = await supabase.from('entities').select('*').eq('id', invoice.entity_id).single();
      const xml = generateInvoiceXML(invoice, entity, items || []);
      return jsonRes({ success: true, xml });
    }

    // ========== fetch_received ==========
    if (action === 'fetch_received') {
      const creds = await resolveCredentials(req, supabase, body);
      const { nip, token, environment, userId } = creds;

      if (!nip) return jsonRes({ success: false, error: 'Brak NIP firmy — skonfiguruj w zakładce KSeF' }, 400);
      if (!token) return jsonRes({ success: false, error: 'Brak tokenu KSeF — skonfiguruj integrację w zakładce KSeF' }, 400);

      const dateFrom = body.date_from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const dateTo = body.date_to || new Date().toISOString().split('T')[0];

      const base = getBaseUrl(environment);
      console.log('[KSeF][fetch_received] env:', environment, 'base:', base);

      const { accessToken } = await getKsefAccessToken(base, nip, token);

      // Query metadata
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
      if (!queryRes.ok) {
        const txt = await queryRes.text().catch(() => '');
        throw new Error(`[PHASE:query-metadata] HTTP ${queryRes.status}: ${txt.slice(0, 300)}`);
      }
      const queryData = await queryRes.json();
      const invoiceList = queryData?.invoices || queryData?.items || queryData?.data?.invoices || [];
      console.log('[KSeF][fetch_received] found:', invoiceList.length, 'invoices');

      const results: any[] = [];
      for (const meta of invoiceList) {
        const refNum = meta?.ksefReferenceNumber || meta?.referenceNumber;
        if (!refNum) continue;

        try {
          const xmlRes = await fetch(`${base}/invoices/ksef/${refNum}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (!xmlRes.ok) { console.warn('[KSeF] XML fetch failed:', refNum, xmlRes.status); continue; }
          const xml = await xmlRes.text();

          const totalNet = ['P_13_1', 'P_13_2', 'P_13_3', 'P_13_4', 'P_13_5', 'P_13_6', 'P_13_7']
            .flatMap(t => getAllTagValues(xml, t)).reduce((s, v) => s + v, 0);
          const totalVat = ['P_14_1', 'P_14_2', 'P_14_3', 'P_14_4', 'P_14_5']
            .flatMap(t => getAllTagValues(xml, t)).reduce((s, v) => s + v, 0);
          const totalGross = Number(getTag(xml, 'P_15').replace(',', '.')) || totalNet + totalVat;
          const supplierName = xml.match(/<Podmiot1[\s\S]*?<Nazwa>([^<]+)<\/Nazwa>/)?.[1]?.trim() || meta?.subjectName || '';
          const supplierNip = xml.match(/<Podmiot1[\s\S]*?<NIP>([^<]+)<\/NIP>/)?.[1]?.trim() || '';

          const aiCategory = await categorize(supplierName);

          const invoiceData = {
            ksef_number: refNum,
            document_number: getTag(xml, 'P_2') || refNum,
            purchase_date: getTag(xml, 'P_1') || dateFrom,
            supplier_nip: supplierNip,
            supplier_name: supplierName,
            total_net: totalNet || 0,
            total_vat: totalVat || 0,
            total_gross: totalGross || 0,
            xml_content: xml,
            status: 'new',
            user_id: userId,
            entity_id: creds.entityId,
            ai_category: aiCategory,
            environment,
          };

          const { error } = await supabase.from('purchase_invoices').upsert(invoiceData, { onConflict: 'ksef_number' });
          if (!error) results.push(invoiceData);
          console.log('[KSeF] saved:', refNum, 'cat:', aiCategory);
        } catch (e: any) {
          console.error('[KSeF] fetch invoice error:', refNum, e.message);
        }
      }

      return jsonRes({ success: true, count: results.length, invoices: results, environment });
    }

    // ========== send ==========
    if (action === 'send') {
      const { data: invoice, error: invErr } = await supabase
        .from('user_invoices').select('*, entity:entities(*)').eq('id', body.invoice_id).single();
      if (invErr || !invoice) throw new Error('Faktura nie znaleziona');
      const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', body.invoice_id);

      const xml = generateInvoiceXML(invoice, invoice.entity, items || []);
      const xmlBytes = new TextEncoder().encode(xml);

      // Create transmission record
      const { data: transmission } = await supabase.from('ksef_transmissions').insert({
        invoice_id: body.invoice_id,
        entity_id: invoice.entity_id,
        direction: 'outgoing',
        status: 'pending',
        xml_content: xml,
      }).select().single();

      try {
        const creds = await resolveCredentials(req, supabase, body);
        const { nip, token, environment } = creds;

        if (!nip) throw new Error('Brak NIP firmy');
        if (!token) throw new Error('Brak tokenu KSeF');

        const base = getBaseUrl(environment);
        const { accessToken, cryptoKey } = await getKsefAccessToken(base, nip, token);

        // AES-256-CBC encryption of XML
        const aesKey = await crypto.subtle.generateKey({ name: 'AES-CBC', length: 256 }, true, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const rawAesKey = new Uint8Array(await crypto.subtle.exportKey('raw', aesKey));
        const encXmlBuf = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, xmlBytes);
        const encXmlBytes = new Uint8Array(encXmlBuf);
        const ivPlusEnc = new Uint8Array(iv.byteLength + encXmlBytes.byteLength);
        ivPlusEnc.set(iv, 0);
        ivPlusEnc.set(encXmlBytes, iv.byteLength);

        // Encrypt AES key with MF RSA key
        const encAesKeyBuf = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, cryptoKey, rawAesKey);
        const encryptedSymmetricKey = bytesToB64(new Uint8Array(encAesKeyBuf));
        const initializationVector = bytesToB64(iv);

        // SHA-256 hashes
        const xmlHash = bytesToB64(new Uint8Array(await crypto.subtle.digest('SHA-256', xmlBytes)));
        const encHash = bytesToB64(new Uint8Array(await crypto.subtle.digest('SHA-256', ivPlusEnc)));

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
        console.log('[KSeF] session opened:', sessionRef);

        if (transmission?.id) {
          await supabase.from('ksef_transmissions').update({ status: 'session_open', ksef_reference_number: sessionRef, environment }).eq('id', transmission.id);
        }

        // Send invoice
        const sendRes = await fetch(`${base}/sessions/online/${sessionRef}/invoices`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceHash: { hashSHA: { algorithm: 'SHA-256', encoding: 'Base64', value: xmlHash }, fileSize: xmlBytes.byteLength },
            encryptedDocumentHash: { hashSHA: { algorithm: 'SHA-256', encoding: 'Base64', value: encHash }, fileSize: ivPlusEnc.byteLength },
            encryptedDocumentContent: bytesToB64(ivPlusEnc),
          }),
        });
        if (!sendRes.ok) {
          const errTxt = (await sendRes.text()).slice(0, 300);
          if (transmission?.id) await supabase.from('ksef_transmissions').update({ status: 'error', error_message: errTxt }).eq('id', transmission.id);
          throw new Error(`[PHASE:invoice-send] HTTP ${sendRes.status}: ${errTxt}`);
        }
        const { referenceNumber: invoiceRef } = await sendRes.json();
        console.log('[KSeF] invoice sent, ref:', invoiceRef);

        if (transmission?.id) await supabase.from('ksef_transmissions').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', transmission.id);

        // Close session
        await fetch(`${base}/sessions/online/${sessionRef}/close`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` },
        }).catch(() => null);

        // Poll status
        let ksefNumber: string | null = null;
        let upoXml: string | null = null;
        let finalStatus = 'processing';

        for (let i = 0; i < 8; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const stRes = await fetch(`${base}/sessions/${sessionRef}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (!stRes.ok) { console.error('[KSeF] poll', i + 1, 'HTTP', stRes.status); break; }
          const stData = await stRes.json();
          const st = String(stData.status || stData.processingStatus || '');
          console.log('[KSeF] poll', i + 1, 'status:', st);

          if (st === 'Finished' || st === 'FINISHED') {
            finalStatus = 'accepted';
            const ilRes = await fetch(`${base}/sessions/${sessionRef}/invoices`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (ilRes.ok) {
              const ilData = await ilRes.json();
              ksefNumber = ilData.invoices?.[0]?.ksefReferenceNumber || null;
            }
            if (invoiceRef) {
              try {
                const upoRes = await fetch(`${base}/sessions/${sessionRef}/invoices/${invoiceRef}/upo`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                if (upoRes.ok) upoXml = await upoRes.text();
              } catch { /* ignore */ }
            }
            break;
          }
          if (st === 'Failed' || st === 'FAILED') {
            finalStatus = 'rejected';
            let errDetail = 'Faktura odrzucona przez KSeF';
            try {
              const fRes = await fetch(`${base}/sessions/${sessionRef}/invoices/failed`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
              if (fRes.ok) { const fd = await fRes.json(); errDetail = JSON.stringify(fd?.invoices?.[0]?.status || fd).slice(0, 400); }
            } catch { /* ignore */ }
            if (transmission?.id) await supabase.from('ksef_transmissions').update({ status: 'rejected', error_message: errDetail, response_at: new Date().toISOString() }).eq('id', transmission.id);
            await supabase.from('invoices').update({ ksef_status: 'rejected' }).eq('id', body.invoice_id);
            return jsonRes({ success: false, error: errDetail, session_ref: sessionRef });
          }
        }

        // Save final
        if (transmission?.id) await supabase.from('ksef_transmissions').update({
          status: finalStatus,
          ksef_reference_number: ksefNumber || sessionRef,
          response_at: new Date().toISOString(),
          ...(upoXml ? { upo_content: upoXml } : {}),
          environment,
        }).eq('id', transmission.id);
        await supabase.from('invoices').update({ ksef_status: finalStatus, ksef_reference: ksefNumber, ksef_environment: environment }).eq('id', body.invoice_id);

        return jsonRes({ success: true, ksef_reference: ksefNumber, session_ref: sessionRef, status: finalStatus, upo_available: !!upoXml, environment });
      } catch (sendErr: any) {
        if (transmission?.id) await supabase.from('ksef_transmissions').update({ status: 'error', error_message: sendErr.message, response_at: new Date().toISOString() }).eq('id', transmission.id);
        throw sendErr;
      }
    }

    // ========== download ==========
    if (action === 'download') {
      if (!body.ksef_reference) return jsonRes({ success: false, error: 'Brak numeru referencyjnego KSeF' }, 400);
      const creds = await resolveCredentials(req, supabase, body);
      if (!creds.nip || !creds.token) return jsonRes({ success: false, error: 'Brak danych autoryzacyjnych KSeF' }, 400);
      const base = getBaseUrl(creds.environment);
      const { accessToken } = await getKsefAccessToken(base, creds.nip, creds.token);
      const xmlRes = await fetch(`${base}/invoices/ksef/${body.ksef_reference}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      if (!xmlRes.ok) throw new Error(`Błąd pobierania XML: HTTP ${xmlRes.status}`);
      const xml = await xmlRes.text();
      return jsonRes({ success: true, xml });
    }

    return jsonRes({ success: false, error: 'Unknown action' }, 400);
  } catch (error: any) {
    console.error('[KSeF] error:', error);
    return jsonRes({ success: false, error: error.message }, 500);
  }
});
