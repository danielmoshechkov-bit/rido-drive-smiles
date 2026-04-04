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

  const rsaAlgId = [0x30, 0x0D, 0x06, 0x09, 0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x01];

  for (let i = 0; i < der.length - rsaAlgId.length - 10; i++) {
    let match = true;
    for (let j = 0; j < rsaAlgId.length; j++) {
      if (der[i + j] !== rsaAlgId[j]) { match = false; break; }
    }
    if (!match) continue;

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

// ========== IMPORT RSA KEY FROM CERT ==========

async function importRsaKeyFromCert(certObj: any): Promise<CryptoKey> {
  const certB64 = certObj.certificate.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const certDer = b64ToBytes(certB64);
  const spkiBytes = extractSpkiFromX509(certDer);
  return crypto.subtle.importKey(
    'spki', spkiBytes.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false, ['encrypt']
  );
}

// ========== AUTH STATUS CODES ==========
const AUTH_STATUS_MESSAGES: Record<number, string> = {
  100: 'Uwierzytelnianie w toku',
  200: 'Sukces',
  415: 'Brak przypisanych uprawnień w KSeF',
  425: 'Uwierzytelnienie unieważnione',
  450: 'Błędny token / czas / wyzwanie',
  460: 'Problem z certyfikatem',
  470: 'Konto zablokowane',
  480: 'Zablokowanie z powodu incydentu bezpieczeństwa',
  500: 'Błąd systemowy KSeF',
  550: 'Błąd systemowy KSeF',
};

// ========== KSeF 2.0 AUTH (with polling + redeem + refresh token) ==========

async function getKsefAccessToken(base: string, nip: string, ksefToken: string): Promise<{ accessToken: string; refreshToken: string; tokenCryptoKey: CryptoKey; docCryptoKey: CryptoKey }> {
  // Step 1 — POST /auth/challenge
  console.log('[KSeF][AUTH] Step 1: POST /auth/challenge');
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
  if (!challenge || !timestampMs) throw new Error('[PHASE:challenge] Brak challenge lub timestampMs');
  console.log('[KSeF][AUTH] Challenge OK, timestampMs:', timestampMs);

  // Step 2 — GET /security/public-key-certificates
  console.log('[KSeF][AUTH] Step 2: GET /security/public-key-certificates');
  const pubKeyRes = await fetch(`${base}/security/public-key-certificates`);
  if (!pubKeyRes.ok) throw new Error(`[PHASE:public-key] HTTP ${pubKeyRes.status}`);
  const certificates = await pubKeyRes.json();

  const certArr = Array.isArray(certificates) ? certificates : (certificates?.certificates || []);
  
  const tokenCertObj = certArr.find((c: any) => c.usage?.includes('KsefTokenEncryption')) || certArr[0];
  const docCertObj = certArr.find((c: any) => c.usage?.includes('SymmetricKeyEncryption')) || certArr[1] || certArr[0];
  
  if (!tokenCertObj?.certificate) throw new Error('[PHASE:public-key] Brak certyfikatu KsefTokenEncryption');
  console.log('[KSeF][AUTH] TokenCert usage:', tokenCertObj.usage);
  console.log('[KSeF][AUTH] DocCert usage:', docCertObj.usage);

  const tokenCryptoKey = await importRsaKeyFromCert(tokenCertObj);
  const docCryptoKey = await importRsaKeyFromCert(docCertObj);
  console.log('[KSeF][AUTH] Both RSA keys imported');

  // Step 3 — Encrypt token: format is "token|timestampMs"
  const plaintext = new TextEncoder().encode(`${ksefToken}|${timestampMs}`);
  const encBuf = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, tokenCryptoKey, plaintext);
  const encryptedToken = bytesToB64(new Uint8Array(encBuf));
  console.log('[KSeF][AUTH] Token encrypted, len:', encryptedToken.length);

  // Step 4 — POST /auth/ksef-token
  console.log('[KSeF][AUTH] Step 4: POST /auth/ksef-token');
  const authBody = {
    challenge,
    contextIdentifier: { type: 'Nip', value: nip },
    encryptedToken,
  };
  const authRes = await fetch(`${base}/auth/ksef-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(authBody),
  });
  if (!authRes.ok) {
    const txt = await authRes.text().catch(() => '');
    throw new Error(`[PHASE:ksef-token] HTTP ${authRes.status}: ${txt.slice(0, 500)}`);
  }
  const authData = await authRes.json();
  const authenticationToken = authData?.authenticationToken?.token || authData?.authenticationToken;
  if (!authenticationToken) throw new Error('[PHASE:ksef-token] Brak authenticationToken: ' + JSON.stringify(authData).slice(0, 300));
  const referenceNumber = authData?.referenceNumber;
  console.log('[KSeF][AUTH] authenticationToken OK, referenceNumber:', referenceNumber);

  // Step 4.5 — Poll auth status GET /auth/{referenceNumber} until code 200
  if (referenceNumber) {
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const statusRes = await fetch(`${base}/auth/${referenceNumber}`, {
          headers: { 'Authorization': `Bearer ${authenticationToken}` },
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          const code = statusData?.status?.code;
          console.log('[KSeF][AUTH] auth status poll #' + attempt + ' code:', code);
          if (code === 200) break;
          if (code && code >= 400) {
            const msg = AUTH_STATUS_MESSAGES[code] || statusData?.status?.description || `Błąd autoryzacji (${code})`;
            throw new Error(`[PHASE:auth-status] ${msg} (code ${code})`);
          }
        } else {
          console.warn('[KSeF][AUTH] auth status poll HTTP', statusRes.status);
          await statusRes.text(); // consume body
        }
      } catch (e: any) {
        if (e.message.includes('[PHASE:auth-status]')) throw e;
        console.warn('[KSeF][AUTH] auth poll error:', e.message);
      }
    }
  } else {
    // No referenceNumber — wait briefly
    await new Promise(r => setTimeout(r, 1500));
  }

  // Step 5 — POST /auth/token/redeem
  console.log('[KSeF][AUTH] Step 5: POST /auth/token/redeem');
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
  const refreshTokenValue = redeemData?.refreshToken?.token || redeemData?.refreshToken || '';
  if (!accessTokenValue) throw new Error('[PHASE:token-redeem] Brak accessToken');
  console.log('[KSeF][AUTH] accessToken OK, refreshToken:', refreshTokenValue ? 'present' : 'none');

  return { accessToken: accessTokenValue, refreshToken: refreshTokenValue, tokenCryptoKey, docCryptoKey };
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

  if (body.invoice_id && !userId) {
    const { data: inv } = await supabase.from('user_invoices').select('user_id').eq('id', body.invoice_id).maybeSingle();
    userId = inv?.user_id || userId;
  }

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

// ========== escapeXml ==========

function escapeXml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function safeJsonObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value as Record<string, any> : {};
}

function pickSourceValue(candidates: Array<{ value: unknown; source: string }>): { value: string | null; source: string | null } {
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate.value);
    if (normalized) return { value: normalized, source: candidate.source };
  }
  return { value: null, source: null };
}

function normalizeBinaryFlag(value: unknown, fallback: '1' | '2' = '2'): '1' | '2' {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (value === 1 || normalized === '1' || normalized === 'true' || normalized === 'tak' || normalized === 'yes') return '1';
  if (value === 2 || normalized === '2' || normalized === 'false' || normalized === 'nie' || normalized === 'no') return '2';
  return fallback;
}

function parsePolishAddress(rawAddress: unknown): { raw: string | null; street: string | null; postalCode: string | null; city: string | null } {
  const raw = normalizeText(rawAddress);
  if (!raw) return { raw: null, street: null, postalCode: null, city: null };

  let street: string | null = raw;
  let postalCode: string | null = null;
  let city: string | null = null;

  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    street = normalizeText(parts.slice(0, -1).join(', '));
    const tail = parts[parts.length - 1];
    const tailMatch = tail.match(/(\d{2}-\d{3})(?:\s+(.+))?$/);
    if (tailMatch) {
      postalCode = normalizeText(tailMatch[1]);
      city = normalizeText(tailMatch[2]);
    } else {
      city = normalizeText(tail);
    }
  } else {
    const inlineMatch = raw.match(/^(.*?)(?:,?\s+)?(\d{2}-\d{3})(?:\s+(.+))$/);
    if (inlineMatch) {
      street = normalizeText(inlineMatch[1]);
      postalCode = normalizeText(inlineMatch[2]);
      city = normalizeText(inlineMatch[3]);
    }
  }

  return { raw, street: normalizeText(street), postalCode, city };
}

function extractXmlFragment(xml: string, tag: string): string {
  return xml.match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`))?.[0] || '';
}

function countXmlTags(xml: string, tag: string): number {
  return Array.from(xml.matchAll(new RegExp(`<${tag}(?:\\s|>)`, 'g'))).length;
}

function hasEmptyTag(xml: string, tag: string): boolean {
  return new RegExp(`<${tag}[^>]*>\\s*<\\/${tag}>`).test(xml);
}

function addViolation(list: Array<{ kind: string; path: string; message: string }>, kind: string, path: string, message: string) {
  list.push({ kind, path, message });
}

function ensureTagOrder(fragment: string, tags: string[], basePath: string, violations: Array<{ kind: string; path: string; message: string }>) {
  let lastIndex = -1;
  let lastTag = '';
  for (const tag of tags) {
    const idx = fragment.indexOf(`<${tag}`);
    if (idx === -1) continue;
    if (idx < lastIndex) {
      addViolation(violations, 'sequence', `${basePath}/${tag}`, `Element <${tag}> występuje przed <${lastTag}>, choć XSD wymaga odwrotnej kolejności.`);
    } else {
      lastIndex = idx;
      lastTag = tag;
    }
  }
}

function buildAddressXml(tagName: string, address: { country?: string | null; line1?: string | null; line2?: string | null; gln?: string | null }, baseIndent = '    '): string {
  const line1 = normalizeText(address.line1);
  if (!line1) return '';

  const line2 = normalizeText(address.line2);
  const gln = normalizeText(address.gln);
  const country = normalizeText(address.country) || 'PL';
  const lines = [
    `<${tagName}>`,
    `  <KodKraju>${escapeXml(country)}</KodKraju>`,
    `  <AdresL1>${escapeXml(line1)}</AdresL1>`,
    ...(line2 ? [`  <AdresL2>${escapeXml(line2)}</AdresL2>`] : []),
    ...(gln ? [`  <GLN>${escapeXml(gln)}</GLN>`] : []),
    `</${tagName}>`,
  ];

  return lines.map((line) => `${baseIndent}${line}`).join('\n');
}

async function resolveSellerEntityForInvoice(req: Request, supabase: any, invoice: any) {
  let company: any = null;
  let companySettings: any = null;

  if (invoice.company_id) {
    const { data } = await supabase.from('user_invoice_companies').select('*').eq('id', invoice.company_id).maybeSingle();
    company = data || null;
  }

  const effectiveUserId = invoice.user_id || (await getUserFromJwt(req, supabase))?.id;
  if (effectiveUserId) {
    const { data } = await supabase.from('company_settings').select('*').eq('user_id', effectiveUserId).maybeSingle();
    companySettings = data || null;
  }

  const nip = pickSourceValue([
    { value: company?.nip, source: 'user_invoice_companies.nip' },
    { value: companySettings?.nip, source: 'company_settings.nip' },
  ]);
  const name = pickSourceValue([
    { value: company?.name, source: 'user_invoice_companies.name' },
    { value: company?.company_name, source: 'user_invoice_companies.company_name' },
    { value: companySettings?.company_name, source: 'company_settings.company_name' },
  ]);
  const addressStreet = pickSourceValue([
    {
      value: [company?.address_street, company?.address_building_number, company?.address_apartment_number].filter(Boolean).join(' '),
      source: 'user_invoice_companies.address_*',
    },
    {
      value: [companySettings?.street, companySettings?.building_number, companySettings?.apartment_number].filter(Boolean).join(' '),
      source: 'company_settings.street/building_number/apartment_number',
    },
  ]);
  const addressPostalCode = pickSourceValue([
    { value: company?.address_postal_code, source: 'user_invoice_companies.address_postal_code' },
    { value: companySettings?.postal_code, source: 'company_settings.postal_code' },
  ]);
  const addressCity = pickSourceValue([
    { value: company?.address_city, source: 'user_invoice_companies.address_city' },
    { value: companySettings?.city, source: 'company_settings.city' },
  ]);
  const bankAccount = pickSourceValue([
    { value: company?.bank_account, source: 'user_invoice_companies.bank_account' },
    { value: companySettings?.bank_account, source: 'company_settings.bank_account' },
  ]);

  return {
    nip: nip.value,
    name: name.value,
    address_street: addressStreet.value,
    address_postal_code: addressPostalCode.value,
    address_city: addressCity.value,
    bank_account: bankAccount.value,
    fieldSources: {
      nip: nip.source,
      name: name.source,
      address_street: addressStreet.source,
      address_postal_code: addressPostalCode.source,
      address_city: addressCity.source,
      bank_account: bankAccount.source,
    },
    rawSellerObject: {
      invoice_company_id: invoice.company_id || null,
      company,
      companySettings,
    },
  };
}

function resolveSellerSource(entity: any) {
  return {
    nip: normalizeText(entity?.nip),
    name: normalizeText(entity?.name || entity?.company_name),
    addressStreet: normalizeText(entity?.address_street || entity?.street),
    addressPostalCode: normalizeText(entity?.address_postal_code || entity?.postal_code),
    addressCity: normalizeText(entity?.address_city || entity?.city),
    bankAccount: normalizeText(entity?.bank_account),
    fieldSources: entity?.fieldSources || {
      nip: entity?.nip ? 'entity.nip' : null,
      name: entity?.name ? 'entity.name' : entity?.company_name ? 'entity.company_name' : null,
      address_street: entity?.address_street ? 'entity.address_street' : entity?.street ? 'entity.street' : null,
      address_postal_code: entity?.address_postal_code ? 'entity.address_postal_code' : entity?.postal_code ? 'entity.postal_code' : null,
      address_city: entity?.address_city ? 'entity.address_city' : entity?.city ? 'entity.city' : null,
      bank_account: entity?.bank_account ? 'entity.bank_account' : null,
    },
    rawSellerObject: entity?.rawSellerObject || entity || null,
  };
}

function resolveBuyerSource(invoice: any) {
  const buyerSnapshot = safeJsonObject(invoice?.buyer_snapshot);
  const rawAddress = pickSourceValue([
    { value: buyerSnapshot.address, source: 'buyer_snapshot.address' },
    { value: buyerSnapshot.full_address, source: 'buyer_snapshot.full_address' },
    { value: buyerSnapshot.buyer_address, source: 'buyer_snapshot.buyer_address' },
    { value: invoice?.buyer_address, source: 'user_invoices.buyer_address' },
  ]);
  const parsedAddress = parsePolishAddress(rawAddress.value);

  const nip = pickSourceValue([
    { value: buyerSnapshot.nip, source: 'buyer_snapshot.nip' },
    { value: buyerSnapshot.tax_id, source: 'buyer_snapshot.tax_id' },
    { value: buyerSnapshot.buyer_nip, source: 'buyer_snapshot.buyer_nip' },
    { value: invoice?.buyer_nip, source: 'user_invoices.buyer_nip' },
  ]);
  const name = pickSourceValue([
    { value: buyerSnapshot.name, source: 'buyer_snapshot.name' },
    { value: buyerSnapshot.companyName, source: 'buyer_snapshot.companyName' },
    { value: buyerSnapshot.company_name, source: 'buyer_snapshot.company_name' },
    { value: invoice?.buyer_name, source: 'user_invoices.buyer_name' },
  ]);
  const addressStreet = pickSourceValue([
    { value: buyerSnapshot.address_street, source: 'buyer_snapshot.address_street' },
    { value: buyerSnapshot.street, source: 'buyer_snapshot.street' },
    { value: buyerSnapshot.addressLine1, source: 'buyer_snapshot.addressLine1' },
    { value: parsedAddress.street, source: rawAddress.source ? `parsed:${rawAddress.source}` : 'parsed:address' },
  ]);
  const addressPostalCode = pickSourceValue([
    { value: buyerSnapshot.address_postal_code, source: 'buyer_snapshot.address_postal_code' },
    { value: buyerSnapshot.postal_code, source: 'buyer_snapshot.postal_code' },
    { value: parsedAddress.postalCode, source: rawAddress.source ? `parsed:${rawAddress.source}` : 'parsed:address' },
  ]);
  const addressCity = pickSourceValue([
    { value: buyerSnapshot.address_city, source: 'buyer_snapshot.address_city' },
    { value: buyerSnapshot.city, source: 'buyer_snapshot.city' },
    { value: parsedAddress.city, source: rawAddress.source ? `parsed:${rawAddress.source}` : 'parsed:address' },
  ]);
  const jstSource = pickSourceValue([
    { value: buyerSnapshot.jst, source: 'buyer_snapshot.jst' },
    { value: buyerSnapshot.is_jst, source: 'buyer_snapshot.is_jst' },
    { value: invoice?.buyer_jst, source: 'user_invoices.buyer_jst' },
    { value: invoice?.is_jst, source: 'user_invoices.is_jst' },
  ]);
  const gvSource = pickSourceValue([
    { value: buyerSnapshot.gv, source: 'buyer_snapshot.gv' },
    { value: buyerSnapshot.is_gv, source: 'buyer_snapshot.is_gv' },
    { value: invoice?.buyer_gv, source: 'user_invoices.buyer_gv' },
    { value: invoice?.is_gv, source: 'user_invoices.is_gv' },
  ]);
  const jst = ['1','2'].includes(String(jstSource.value)) ? String(jstSource.value) : '2';
  const gv = ['1','2'].includes(String(gvSource.value)) ? String(gvSource.value) : '2';

  return {
    nip: nip.value,
    brakId: nip.value ? null : '1',
    name: name.value,
    addressRaw: rawAddress.value,
    addressStreet: addressStreet.value,
    addressPostalCode: addressPostalCode.value,
    addressCity: addressCity.value,
    jst: jst,
    gv: gv,
    fieldSources: {
      nip: nip.source,
      brakId: nip.value ? null : 'derived:BrakID',
      name: name.source,
      addressRaw: rawAddress.source,
      addressStreet: addressStreet.source,
      addressPostalCode: addressPostalCode.source,
      addressCity: addressCity.source,
      jst: jstSource.source || 'default:2',
      gv: gvSource.source || 'default:2',
    },
    rawBuyerObject: {
      buyerSnapshot,
      invoiceBuyerFields: {
        buyer_nip: invoice?.buyer_nip ?? null,
        buyer_name: invoice?.buyer_name ?? null,
        buyer_address: invoice?.buyer_address ?? null,
      },
    },
  };
}

function validatePodmiot1Xsd(podmiot1: string, sellerSource: any) {
  const violations: Array<{ kind: string; path: string; message: string }> = [];
  const basePath = 'Faktura/Podmiot1';

  if (!podmiot1) {
    addViolation(violations, 'missing', basePath, 'Brak sekcji Podmiot1.');
    return violations;
  }

  if (countXmlTags(podmiot1, 'DaneIdentyfikacyjne') === 0) addViolation(violations, 'minOccurs', `${basePath}/DaneIdentyfikacyjne`, 'TPodmiot1 wymaga elementu DaneIdentyfikacyjne (minOccurs=1).');
  if (countXmlTags(podmiot1, 'DaneIdentyfikacyjne') > 1) addViolation(violations, 'maxOccurs', `${basePath}/DaneIdentyfikacyjne`, 'DaneIdentyfikacyjne może wystąpić tylko raz (maxOccurs=1).');
  if (countXmlTags(podmiot1, 'Adres') === 0) addViolation(violations, 'minOccurs', `${basePath}/Adres`, 'Podmiot1 wymaga elementu Adres (minOccurs=1).');
  if (countXmlTags(podmiot1, 'Adres') > 1) addViolation(violations, 'maxOccurs', `${basePath}/Adres`, 'Adres może wystąpić tylko raz w Podmiot1 (maxOccurs=1).');

  ensureTagOrder(podmiot1, ['DaneIdentyfikacyjne', 'Adres', 'AdresKoresp', 'DaneKontaktowe', 'StatusInfoPodatnika'], basePath, violations);

  if (!sellerSource.nip) addViolation(violations, 'minOccurs', `${basePath}/DaneIdentyfikacyjne/NIP`, 'TPodmiot1/NIP jest obowiązkowy i nie może być pusty.');
  if (!sellerSource.name) addViolation(violations, 'minOccurs', `${basePath}/DaneIdentyfikacyjne/Nazwa`, 'TPodmiot1/Nazwa jest obowiązkowa i nie może być pusta.');
  if (!sellerSource.addressStreet) addViolation(violations, 'minOccurs', `${basePath}/Adres/AdresL1`, 'TAdres/AdresL1 dla Podmiot1 jest obowiązkowy, bo Adres ma minOccurs=1.');

  if (hasEmptyTag(podmiot1, 'NIP')) addViolation(violations, 'empty', `${basePath}/DaneIdentyfikacyjne/NIP`, 'Nie wolno generować pustego tagu <NIP>.');
  if (hasEmptyTag(podmiot1, 'Nazwa')) addViolation(violations, 'empty', `${basePath}/DaneIdentyfikacyjne/Nazwa`, 'Nie wolno generować pustego tagu <Nazwa>.');
  if (hasEmptyTag(podmiot1, 'AdresL1')) addViolation(violations, 'empty', `${basePath}/Adres/AdresL1`, 'Nie wolno generować pustego tagu <AdresL1>.');

  const nameInsideData = /<DaneIdentyfikacyjne>[\s\S]*<Nazwa>[^<]+<\/Nazwa>[\s\S]*<\/DaneIdentyfikacyjne>/.test(podmiot1);
  if (countXmlTags(podmiot1, 'Nazwa') > 0 && !nameInsideData) {
    addViolation(violations, 'wrong-nesting', `${basePath}/DaneIdentyfikacyjne/Nazwa`, 'W TPodmiot1 element <Nazwa> musi znajdować się wewnątrz <DaneIdentyfikacyjne>.');
  }

  return violations;
}

function validatePodmiot2Xsd(podmiot2: string, buyerSource: any) {
  const violations: Array<{ kind: string; path: string; message: string }> = [];
  const basePath = 'Faktura/Podmiot2';

  if (!podmiot2) {
    addViolation(violations, 'missing', basePath, 'Brak sekcji Podmiot2.');
    return violations;
  }

  if (countXmlTags(podmiot2, 'DaneIdentyfikacyjne') === 0) addViolation(violations, 'minOccurs', `${basePath}/DaneIdentyfikacyjne`, 'Podmiot2 wymaga elementu DaneIdentyfikacyjne (minOccurs=1).');
  if (countXmlTags(podmiot2, 'DaneIdentyfikacyjne') > 1) addViolation(violations, 'maxOccurs', `${basePath}/DaneIdentyfikacyjne`, 'DaneIdentyfikacyjne może wystąpić tylko raz (maxOccurs=1).');
  if (countXmlTags(podmiot2, 'JST') === 0) addViolation(violations, 'minOccurs', `${basePath}/JST`, 'Podmiot2/JST jest obowiązkowy (minOccurs=1).');
  if (countXmlTags(podmiot2, 'JST') > 1) addViolation(violations, 'maxOccurs', `${basePath}/JST`, 'Podmiot2/JST może wystąpić tylko raz (maxOccurs=1).');
  if (countXmlTags(podmiot2, 'GV') === 0) addViolation(violations, 'minOccurs', `${basePath}/GV`, 'Podmiot2/GV jest obowiązkowy (minOccurs=1).');
  if (countXmlTags(podmiot2, 'GV') > 1) addViolation(violations, 'maxOccurs', `${basePath}/GV`, 'Podmiot2/GV może wystąpić tylko raz (maxOccurs=1).');
  if (countXmlTags(podmiot2, 'Adres') > 1) addViolation(violations, 'maxOccurs', `${basePath}/Adres`, 'Podmiot2/Adres może wystąpić tylko raz (maxOccurs=1).');

  ensureTagOrder(podmiot2, ['DaneIdentyfikacyjne', 'Adres', 'AdresKoresp', 'DaneKontaktowe', 'NrKlienta', 'IDNabywcy', 'JST', 'GV'], basePath, violations);

  const nipCount = countXmlTags(podmiot2, 'NIP');
  const brakIdCount = countXmlTags(podmiot2, 'BrakID');
  const kodUECount = countXmlTags(podmiot2, 'KodUE');
  const nrVatUECount = countXmlTags(podmiot2, 'NrVatUE');
  const nrIdCount = countXmlTags(podmiot2, 'NrID');
  const choiceCount = Number(nipCount > 0) + Number(kodUECount > 0 || nrVatUECount > 0) + Number(nrIdCount > 0) + Number(brakIdCount > 0);

  if (choiceCount === 0) {
    addViolation(violations, 'choice', `${basePath}/DaneIdentyfikacyjne`, 'TPodmiot2 wymaga dokładnie jednego identyfikatora: NIP albo KodUE+NrVatUE albo KodKraju+NrID albo BrakID.');
  }
  if (choiceCount > 1) {
    addViolation(violations, 'choice', `${basePath}/DaneIdentyfikacyjne`, 'TPodmiot2 narusza xsd:choice — wygenerowano więcej niż jeden wariant identyfikatora.');
  }
  if ((kodUECount > 0 && nrVatUECount === 0) || (kodUECount === 0 && nrVatUECount > 0)) {
    addViolation(violations, 'choice', `${basePath}/DaneIdentyfikacyjne`, 'Wariant VAT UE wymaga jednoczesnej obecności <KodUE> i <NrVatUE>.');
  }

  if (hasEmptyTag(podmiot2, 'NIP')) addViolation(violations, 'empty', `${basePath}/DaneIdentyfikacyjne/NIP`, 'Nie wolno generować pustego tagu <NIP>.');
  if (hasEmptyTag(podmiot2, 'BrakID')) addViolation(violations, 'empty', `${basePath}/DaneIdentyfikacyjne/BrakID`, 'Nie wolno generować pustego tagu <BrakID>.');
  if (hasEmptyTag(podmiot2, 'Nazwa')) addViolation(violations, 'empty', `${basePath}/DaneIdentyfikacyjne/Nazwa`, 'Nie wolno generować pustego tagu <Nazwa>.');
  if (hasEmptyTag(podmiot2, 'AdresL1')) addViolation(violations, 'empty', `${basePath}/Adres/AdresL1`, 'Nie wolno generować pustego tagu <AdresL1>.');
  if (hasEmptyTag(podmiot2, 'JST')) addViolation(violations, 'empty', `${basePath}/JST`, 'Nie wolno generować pustego tagu <JST>.');
  if (hasEmptyTag(podmiot2, 'GV')) addViolation(violations, 'empty', `${basePath}/GV`, 'Nie wolno generować pustego tagu <GV>.');

  const nameInsideData = /<DaneIdentyfikacyjne>[\s\S]*<Nazwa>[^<]+<\/Nazwa>[\s\S]*<\/DaneIdentyfikacyjne>/.test(podmiot2);
  if (countXmlTags(podmiot2, 'Nazwa') > 0 && !nameInsideData) {
    addViolation(violations, 'wrong-nesting', `${basePath}/DaneIdentyfikacyjne/Nazwa`, 'Zgodnie z TPodmiot2 element <Nazwa> musi znajdować się wewnątrz <DaneIdentyfikacyjne>.');
  }

  if (!/^<[\s\S]*<JST>[12]<\/JST>[\s\S]*$/.test(podmiot2)) {
    addViolation(violations, 'sequence', `${basePath}/JST`, 'Podmiot2/JST musi być obecny i mieć wartość 1 albo 2.');
  }
  if (!/^<[\s\S]*<GV>[12]<\/GV>[\s\S]*$/.test(podmiot2)) {
    addViolation(violations, 'sequence', `${basePath}/GV`, 'Podmiot2/GV musi być obecny i mieć wartość 1 albo 2.');
  }

  if (!buyerSource.nip && buyerSource.brakId !== '1') {
    addViolation(violations, 'choice', `${basePath}/DaneIdentyfikacyjne`, 'Brak NIP nabywcy bez poprawnego BrakID=1 narusza xsd:choice dla TPodmiot2.');
  }

  return violations;
}

function validateSemanticRules(sellerSource: any, buyerSource: any) {
  const violations: Array<{ kind: string; path: string; message: string }> = [];

  if (!buyerSource.name) {
    addViolation(violations, 'semantic', 'Faktura/Podmiot2/DaneIdentyfikacyjne/Nazwa', 'buyer.name jest puste — w naszym standardowym flow KSeF wymagamy nazwy nabywcy.');
  }
  if (!buyerSource.addressRaw && !buyerSource.addressStreet) {
    addViolation(violations, 'semantic', 'Faktura/Podmiot2/Adres', 'buyer.address jest puste — adres nabywcy jest wymagany w tym flow.');
  }
  if (!buyerSource.addressStreet) {
    addViolation(violations, 'semantic', 'Faktura/Podmiot2/Adres/AdresL1', 'Nie udało się zbudować buyer.address_street dla Podmiot2/Adres/AdresL1.');
  }
  if (!sellerSource.nip) {
    addViolation(violations, 'semantic', 'Faktura/Podmiot1/DaneIdentyfikacyjne/NIP', 'Brak NIP sprzedawcy uniemożliwia poprawną wysyłkę do KSeF.');
  }
  if (!sellerSource.name) {
    addViolation(violations, 'semantic', 'Faktura/Podmiot1/DaneIdentyfikacyjne/Nazwa', 'Brak nazwy sprzedawcy uniemożliwia poprawną wysyłkę do KSeF.');
  }
  if (!sellerSource.addressStreet) {
    addViolation(violations, 'semantic', 'Faktura/Podmiot1/Adres/AdresL1', 'Brak adresu sprzedawcy uniemożliwia poprawną wysyłkę do KSeF.');
  }
  if (!['1', '2'].includes(buyerSource.jst)) {
    addViolation(violations, 'semantic', 'Faktura/Podmiot2/JST', 'JST musi mieć świadomie ustawioną wartość 1 albo 2.');
  }
  if (!['1', '2'].includes(buyerSource.gv)) {
    addViolation(violations, 'semantic', 'Faktura/Podmiot2/GV', 'GV musi mieć świadomie ustawioną wartość 1 albo 2.');
  }

  return violations;
}

function buildWarnings(sellerSource: any, buyerSource: any) {
  const warnings = [
    `buyer.nip source: ${buyerSource.fieldSources.nip || 'derived:BrakID'}`,
    `buyer.name source: ${buyerSource.fieldSources.name || 'missing'}`,
    `buyer.address source: ${buyerSource.fieldSources.addressRaw || 'missing'}`,
    `buyer.address_street source: ${buyerSource.fieldSources.addressStreet || 'missing'}`,
    `buyer.address_postal_code source: ${buyerSource.fieldSources.addressPostalCode || 'missing'}`,
    `buyer.address_city source: ${buyerSource.fieldSources.addressCity || 'missing'}`,
    `buyer.jst source: ${buyerSource.fieldSources.jst}`,
    `buyer.gv source: ${buyerSource.fieldSources.gv}`,
    `seller.nip source: ${sellerSource.fieldSources.nip || 'missing'}`,
    `seller.name source: ${sellerSource.fieldSources.name || 'missing'}`,
    `seller.address_street source: ${sellerSource.fieldSources.address_street || 'missing'}`,
    `seller.address_postal_code source: ${sellerSource.fieldSources.address_postal_code || 'missing'}`,
    `seller.address_city source: ${sellerSource.fieldSources.address_city || 'missing'}`,
  ];

  if (!buyerSource.nip) warnings.push('Brak buyer.nip — generator użyje <BrakID>1</BrakID> zgodnie z FA(3).');
  if (!buyerSource.name) warnings.push('Brak buyer.name — tag <Nazwa> nie zostanie wygenerowany.');
  if (!buyerSource.addressStreet) warnings.push('Brak buyer.address_street — tag <Adres> nie zostanie wygenerowany.');
  if (!buyerSource.addressPostalCode || !buyerSource.addressCity) warnings.push('buyer.address_postal_code lub buyer.address_city są niepełne.');
  if (buyerSource.fieldSources.jst === 'default:2') warnings.push('Podmiot2/JST ustawiono domyślnie na 2 (nie dotyczy JST).');
  if (buyerSource.fieldSources.gv === 'default:2') warnings.push('Podmiot2/GV ustawiono domyślnie na 2 (nie dotyczy GV).');

  return Array.from(new Set(warnings));
}

function buildKsefInvoiceArtifacts(invoice: any, entity: any, items: any[]) {
  const issueDate = invoice.issue_date || new Date().toISOString().split('T')[0];
  const saleDate = invoice.sale_date || issueDate;
  const buyerSource = resolveBuyerSource(invoice);
  const sellerSource = resolveSellerSource(entity);
  const formCode = 'FA (3) / 1-0E';
  
  // Determine invoice type for KSeF
  const isCorrection = invoice.is_correction === true || invoice.invoice_type === 'correction';
  const invoiceType = isCorrection ? 'KOR' : 'VAT';

  const vatByRate: Record<string, { net: number; vat: number }> = {};
  items.forEach((item) => {
    const rate = String(item.vat_rate || '23');
    if (!vatByRate[rate]) vatByRate[rate] = { net: 0, vat: 0 };
    vatByRate[rate].net += Number(item.net_amount) || 0;
    vatByRate[rate].vat += Number(item.vat_amount) || 0;
  });

  const grossTotal = items.reduce((sum, item) => sum + (Number(item.gross_amount) || 0), 0);

  let vatBreakdownXML = '';
  for (const [rate, amounts] of Object.entries(vatByRate)) {
    if (rate === 'zw') {
      vatBreakdownXML += `\n        <P_13_6>${amounts.net.toFixed(2)}</P_13_6>`;
    } else if (rate === 'np') {
      vatBreakdownXML += `\n        <P_13_7>${amounts.net.toFixed(2)}</P_13_7>`;
    } else {
      const numericRate = parseInt(rate) || 23;
      const fieldSuffix = numericRate === 23 ? '1' : numericRate === 8 ? '3' : numericRate === 5 ? '5' : numericRate === 0 ? '6' : '1';
      vatBreakdownXML += `\n        <P_13_${fieldSuffix}>${amounts.net.toFixed(2)}</P_13_${fieldSuffix}>`;
      vatBreakdownXML += `\n        <P_14_${fieldSuffix}>${amounts.vat.toFixed(2)}</P_14_${fieldSuffix}>`;
    }
  }

  const itemsXML = items.map((item, idx) => {
    const vatCode = item.vat_rate === 'zw' ? 'zw' : item.vat_rate === 'np' ? 'np' : String(item.vat_rate || '23');
    return `
      <FaWiersz>
        <NrWierszaFa>${idx + 1}</NrWierszaFa>
        <P_7>${escapeXml(item.name || 'Usługa')}</P_7>
        <P_8A>${escapeXml(item.unit || 'szt')}</P_8A>
        <P_8B>${Number(item.quantity || 1).toFixed(4)}</P_8B>
        <P_9A>${Number(item.unit_net_price || 0).toFixed(2)}</P_9A>
        <P_11>${Number(item.net_amount || 0).toFixed(2)}</P_11>
        <P_12>${vatCode}</P_12>
      </FaWiersz>`;
  }).join('');

  const bankEl = sellerSource.bankAccount
    ? `<RachunekBankowy><NrRB>${sellerSource.bankAccount.replace(/\s/g, '')}</NrRB></RachunekBankowy>`
    : '';

  const formaPlatnosci = invoice.payment_method === 'cash' ? '1' : '2';
  const sellerAdresL2 = [sellerSource.addressPostalCode, sellerSource.addressCity].filter(Boolean).join(' ') || null;
  const buyerAdresL2 = [buyerSource.addressPostalCode, buyerSource.addressCity].filter(Boolean).join(' ') || null;
  const sellerAddressXml = buildAddressXml('Adres', { country: 'PL', line1: sellerSource.addressStreet, line2: sellerAdresL2 });
  const buyerAddressXml = buildAddressXml('Adres', { country: 'PL', line1: buyerSource.addressStreet, line2: buyerAdresL2 });

  const podmiot1Lines = [
    '<Podmiot1>',
    '  <DaneIdentyfikacyjne>',
    ...(sellerSource.nip ? [`    <NIP>${escapeXml(sellerSource.nip)}</NIP>`] : []),
    ...(sellerSource.name ? [`    <Nazwa>${escapeXml(sellerSource.name)}</Nazwa>`] : []),
    '  </DaneIdentyfikacyjne>',
    ...(sellerAddressXml ? [sellerAddressXml] : []),
    '</Podmiot1>',
  ];
  const podmiot1 = podmiot1Lines.join('\n');

  const buyerIdentifierLines = buyerSource.nip
    ? [`    <NIP>${escapeXml(buyerSource.nip)}</NIP>`]
    : buyerSource.brakId
      ? [`    <BrakID>${buyerSource.brakId}</BrakID>`]
      : [];
  const podmiot2Lines = [
    '<Podmiot2>',
    '  <DaneIdentyfikacyjne>',
    ...buyerIdentifierLines,
    ...(buyerSource.name ? [`    <Nazwa>${escapeXml(buyerSource.name)}</Nazwa>`] : []),
    '  </DaneIdentyfikacyjne>',
    ...(buyerAddressXml ? [buyerAddressXml] : []),
    `  <JST>${buyerSource.jst}</JST>`,
    `  <GV>${buyerSource.gv}</GV>`,
    '</Podmiot2>',
  ];
  const podmiot2 = podmiot2Lines.join('\n');

  // Build correction-specific elements (P_3C = original invoice number, P_3D = original issue date)
  let correctionElements = '';
  if (isCorrection) {
    const origNumber = invoice.corrected_invoice_number || '';
    const origDate = invoice.corrected_issue_date || invoice.sale_date || issueDate;
    if (origNumber) correctionElements += `\n        <P_3C>${escapeXml(origNumber)}</P_3C>`;
    if (origDate) correctionElements += `\n        <P_3D>${origDate}</P_3D>`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa>
    <SystemInfo>GetRido</SystemInfo>
  </Naglowek>
  ${podmiot1.split('\n').join('\n  ')}
  ${podmiot2.split('\n').join('\n  ')}
  <Fa>
    <KodWaluty>${invoice.currency || 'PLN'}</KodWaluty>
    <P_1>${issueDate}</P_1>
    <P_2>${escapeXml(invoice.invoice_number || '')}</P_2>${correctionElements}
    <P_6>${saleDate}</P_6>${vatBreakdownXML}
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
    <RodzajFaktury>${invoiceType}</RodzajFaktury>${itemsXML}
    <Platnosc>
      <TerminPlatnosci><Termin>${invoice.due_date || issueDate}</Termin></TerminPlatnosci>
      <FormaPlatnosci>${formaPlatnosci}</FormaPlatnosci>
      ${bankEl}
    </Platnosc>
  </Fa>
</Faktura>`;

  const normalizedPodmiot1 = extractXmlFragment(xml, 'Podmiot1');
  const normalizedPodmiot2 = extractXmlFragment(xml, 'Podmiot2');
  const xsdViolations = [
    ...validatePodmiot1Xsd(normalizedPodmiot1, sellerSource),
    ...validatePodmiot2Xsd(normalizedPodmiot2, buyerSource),
  ];
  const semanticViolations = validateSemanticRules(sellerSource, buyerSource);
  const warnings = buildWarnings(sellerSource, buyerSource);

  return {
    xml,
    podmiot1: normalizedPodmiot1,
    podmiot2: normalizedPodmiot2,
    formCode,
    invoiceType,
    warnings,
    xsdViolations,
    semanticViolations,
    buyerSource,
    sellerSource,
  };
}

function generateInvoiceXML(invoice: any, entity: any, items: any[]): string {
  return buildKsefInvoiceArtifacts(invoice, entity, items).xml;
}

// ========== INVOICE STATUS CODES ==========
const INVOICE_STATUS_MESSAGES: Record<number, string> = {
  100: 'Faktura przyjęta do przetwarzania',
  150: 'Trwa przetwarzanie',
  200: 'Sukces — numer KSeF nadany',
  405: 'Przetwarzanie anulowane z powodu błędu sesji',
  410: 'Nieprawidłowy zakres uprawnień',
  415: 'Brak możliwości wysyłania faktury z załącznikiem',
  430: 'Błąd weryfikacji pliku faktury',
  435: 'Błąd odszyfrowania pliku',
  440: 'Duplikat faktury',
  450: 'Błąd weryfikacji semantyki dokumentu',
};

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
      const { data: items } = await supabase.from('user_invoice_items').select('*').eq('invoice_id', body.invoice_id).order('sort_order');
      const sellerEntity = await resolveSellerEntityForInvoice(req, supabase, invoice);
      const artifacts = buildKsefInvoiceArtifacts(invoice, sellerEntity, items || []);
      return jsonRes({ success: true, xml: artifacts.xml, warnings: artifacts.warnings, xsdViolations: artifacts.xsdViolations });
    }

    // ========== debug ==========
    if (action === 'debug') {
      const { data: invoice, error: invErr } = await supabase.from('user_invoices').select('*').eq('id', body.invoice_id).single();
      if (invErr || !invoice) return jsonRes({ success: false, error: 'Faktura nie znaleziona' }, 404);
      const { data: items } = await supabase.from('user_invoice_items').select('*').eq('invoice_id', body.invoice_id).order('sort_order');

      // Use shared resolveSellerEntityForInvoice + buildKsefInvoiceArtifacts
      const sellerEntity = await resolveSellerEntityForInvoice(req, supabase, invoice);
      const artifacts = buildKsefInvoiceArtifacts(invoice, sellerEntity, items || []);

      console.log('[KSeF][DEBUG] XML generated, size:', artifacts.xml.length);
      console.log('[KSeF][DEBUG] Full XML:\n', artifacts.xml);
      console.log('[KSeF][DEBUG] Podmiot1:\n', artifacts.podmiot1);
      console.log('[KSeF][DEBUG] Podmiot2:\n', artifacts.podmiot2);
      console.log('[KSeF][DEBUG] formCode:', artifacts.formCode, 'invoiceType:', artifacts.invoiceType);
      console.log('[KSeF][DEBUG] buyerSource:', JSON.stringify(artifacts.buyerSource));
      console.log('[KSeF][DEBUG] sellerSource:', JSON.stringify(artifacts.sellerSource));
      console.log('[KSeF][DEBUG] xsdViolations:', JSON.stringify(artifacts.xsdViolations));
      console.log('[KSeF][DEBUG] semanticViolations:', JSON.stringify(artifacts.semanticViolations));

      return jsonRes({
        success: true,
        xml: artifacts.xml,
        podmiot1: artifacts.podmiot1,
        podmiot2: artifacts.podmiot2,
        formCode: artifacts.formCode,
        invoiceType: artifacts.invoiceType,
        warnings: artifacts.warnings,
        xsdViolations: artifacts.xsdViolations,
        semanticViolations: artifacts.semanticViolations,
        buyerSource: artifacts.buyerSource,
        sellerSource: artifacts.sellerSource,
      });
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

      // KSeF requires plain YYYY-MM-DD format without timezone
      console.log('[KSeF][fetch_received] dateFrom:', dateFrom, 'dateTo:', dateTo);
      const queryRes = await fetch(`${base}/invoices/query/metadata`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: {
            subjectType: 'subject2',
            dateRange: {
              startDate: dateFrom,
              endDate: dateTo,
            },
          },
          page: 0,
          size: 100,
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
      // Duplicate check
      const { data: existingInv } = await supabase.from('user_invoices').select('ksef_status, user_id').eq('id', body.invoice_id).single();
      if (existingInv?.ksef_status === 'accepted' || existingInv?.ksef_status === 'processing') {
        return jsonRes({ success: false, error: 'Faktura już wysłana do KSeF. Status: ' + existingInv.ksef_status });
      }

      const { data: invoice, error: invErr } = await supabase
        .from('user_invoices').select('*').eq('id', body.invoice_id).single();
      if (invErr || !invoice) throw new Error('Faktura nie znaleziona');
      const { data: items } = await supabase.from('user_invoice_items').select('*').eq('invoice_id', body.invoice_id).order('sort_order');

      // Use shared seller resolution + XML builder with full XSD validation
      const sellerEntity = await resolveSellerEntityForInvoice(req, supabase, invoice);
      const artifacts = buildKsefInvoiceArtifacts(invoice, sellerEntity, items || []);
      const { xml } = artifacts;

      // Pre-send XSD validation — block if critical violations found
      const criticalViolations = artifacts.xsdViolations.filter(v => ['minOccurs', 'choice', 'missing'].includes(v.kind));
      if (criticalViolations.length > 0) {
        console.error('[KSeF][send] BLOCKED: XSD violations detected before send:', JSON.stringify(criticalViolations));
        return jsonRes({
          success: false,
          error: 'Faktura nie przeszła walidacji XSD FA(3) — wysyłka zablokowana.',
          xsdViolations: criticalViolations,
          warnings: artifacts.warnings,
        }, 400);
      }

      const xmlBytes = new TextEncoder().encode(xml);

      // Size validation (max 1 MB for online session)
      const xmlSizeMB = xmlBytes.byteLength / (1024 * 1024);
      if (xmlSizeMB > 1) {
        throw new Error(`Rozmiar XML faktury (${xmlSizeMB.toFixed(2)} MB) przekracza limit 1 MB dla sesji interaktywnej`);
      }

      console.log('[KSeF][send] invoice.xml.generated, size:', xmlBytes.byteLength, 'bytes');
      console.log('[KSeF][send] invoice.xml.full:\n', xml);
      console.log('[KSeF][send] Podmiot1:\n', artifacts.podmiot1);
      console.log('[KSeF][send] Podmiot2:\n', artifacts.podmiot2);
      console.log('[KSeF][send] formCode:', artifacts.formCode, 'invoiceType:', artifacts.invoiceType);
      console.log('[KSeF][send] buyerSource:', JSON.stringify(artifacts.buyerSource));
      console.log('[KSeF][send] sellerSource:', JSON.stringify(artifacts.sellerSource));

      // Create transmission record
      const { data: transmission } = await supabase.from('ksef_transmissions').insert({
        invoice_id: body.invoice_id,
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
        const { accessToken, docCryptoKey } = await getKsefAccessToken(base, nip, token);

        // ===== AES-256-CBC encryption =====
        const aesKey = await crypto.subtle.generateKey({ name: 'AES-CBC', length: 256 }, true, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const rawAesKey = new Uint8Array(await crypto.subtle.exportKey('raw', aesKey));
        
        // Encrypt XML with AES-CBC (PKCS#7 padding is automatic with WebCrypto)
        const encXmlBuf = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, xmlBytes);
        // FIX BŁĄD 1: encXmlBytes = ONLY the ciphertext, NO IV prefix
        const encXmlBytes = new Uint8Array(encXmlBuf);

        console.log('[KSeF][send] invoice.encryption.result: encSize=', encXmlBytes.byteLength, 'ivSize=', iv.byteLength);

        // Encrypt AES key with RSA-OAEP using SymmetricKeyEncryption certificate
        const encAesKeyBuf = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, docCryptoKey, rawAesKey);
        const encryptedSymmetricKey = bytesToB64(new Uint8Array(encAesKeyBuf));
        // IV goes ONLY here in session open
        const initializationVector = bytesToB64(iv);

        // ===== Hashes =====
        // FIX BŁĄD 2: invoiceHash = SHA-256 of raw XML bytes
        const xmlHashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', xmlBytes));
        const xmlHash = bytesToB64(xmlHashBytes);
        // FIX BŁĄD 2: encryptedInvoiceHash = SHA-256 of ciphertext ONLY (no IV)
        const encHashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encXmlBytes));
        const encHash = bytesToB64(encHashBytes);

        console.log('[KSeF][send] invoice.hashes.calculated:',
          'xmlHash:', xmlHash.substring(0, 10) + '...', 'len:', xmlHash.length,
          'invoiceSize:', xmlBytes.byteLength,
          'encHash:', encHash.substring(0, 10) + '...', 'len:', encHash.length,
          'encInvoiceSize:', encXmlBytes.byteLength);

        // ===== Open session =====
        console.log('[KSeF][send] session.open.request');
        const sessionRes = await fetch(`${base}/sessions/online`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            formCode: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' },
            encryption: { encryptedSymmetricKey, initializationVector },
          }),
        });
        if (!sessionRes.ok) {
          const errBody = await sessionRes.text().catch(() => '');
          console.error('[KSeF][send] session.open.response ERROR:', sessionRes.status, errBody.slice(0, 500));
          if (sessionRes.status === 403) {
            throw new Error('Token KSeF nie ma uprawnień InvoiceWrite. Sprawdź uprawnienia tokenu w portalu KSeF.');
          }
          throw new Error(`[PHASE:session-open] HTTP ${sessionRes.status}: ${errBody.slice(0, 300)}`);
        }
        const sessionData = await sessionRes.json();
        const sessionRef = sessionData?.referenceNumber;
        console.log('[KSeF][send] session.open.response OK, sessionRef:', sessionRef, 'validUntil:', sessionData?.validUntil);

        if (transmission?.id) {
          await supabase.from('ksef_transmissions').update({ status: 'session_open', ksef_reference_number: sessionRef, environment }).eq('id', transmission.id);
        }

        // ===== Send invoice =====
        // Per KSeF 2.0 API: flat strings for hashes, integer for sizes
        const sendPayload = {
          invoiceHash: xmlHash,
          invoiceSize: xmlBytes.byteLength,
          encryptedInvoiceHash: encHash,
          encryptedInvoiceSize: encXmlBytes.byteLength,
          // FIX BŁĄD 1: encryptedInvoiceContent = base64 of ciphertext WITHOUT IV
          encryptedInvoiceContent: bytesToB64(encXmlBytes),
          offlineMode: false,
        };
        console.log('[KSeF][send] invoice.send.request, payload keys:', Object.keys(sendPayload),
          'invoiceSize:', sendPayload.invoiceSize, 'encryptedInvoiceSize:', sendPayload.encryptedInvoiceSize);
        
        const sendRes = await fetch(`${base}/sessions/online/${sessionRef}/invoices`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(sendPayload),
        });
        
        const sendResponseText = await sendRes.text();
        console.log('[KSeF][send] invoice.send.response:', sendRes.status, sendResponseText.slice(0, 500));
        
        if (!sendRes.ok) {
          if (transmission?.id) await supabase.from('ksef_transmissions').update({ status: 'error', error_message: sendResponseText.slice(0, 500) }).eq('id', transmission.id);
          throw new Error(`[PHASE:invoice-send] HTTP ${sendRes.status}: ${sendResponseText.slice(0, 300)}`);
        }
        
        let sendData: any = {};
        try { sendData = JSON.parse(sendResponseText); } catch { /* non-JSON 202 response */ }
        // FIX BŁĄD 4: Save invoiceReferenceNumber
        const invoiceRef = sendData?.referenceNumber || sendData?.elementReferenceNumber;
        console.log('[KSeF][send] invoice sent OK, invoiceRef:', invoiceRef);

        // Save invoiceRef to transmission and user_invoices
        if (transmission?.id) {
          await supabase.from('ksef_transmissions').update({ 
            status: 'sent', 
            sent_at: new Date().toISOString(),
            ksef_invoice_ref: invoiceRef,
          }).eq('id', transmission.id);
        }

        // ===== Close session =====
        console.log('[KSeF][send] session.close.request');
        try {
          const closeRes = await Promise.race([
            fetch(`${base}/sessions/online/${sessionRef}/close`, {
              method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` },
            }),
            new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
          ]);
          console.log('[KSeF][send] session.close.response:', (closeRes as Response)?.status);
        } catch (e: any) {
          console.warn('[KSeF][send] session close timeout — ignoruj:', e.message);
        }

        // Save processing status with invoiceRef
        if (transmission?.id) {
          await supabase.from('ksef_transmissions').update({
            status: 'processing',
            ksef_reference_number: sessionRef,
            ksef_invoice_ref: invoiceRef,
            environment,
          }).eq('id', transmission.id);
        }
        await supabase.from('user_invoices').update({
          ksef_status: 'processing',
          ksef_invoice_ref: invoiceRef,
          ksef_environment: environment,
        }).eq('id', body.invoice_id);

        return jsonRes({
          success: true,
          status: 'processing',
          session_ref: sessionRef,
          invoice_ref: invoiceRef,
          message: 'Faktura wysłana do KSeF — oczekiwanie na numer KSeF',
          environment,
        });
      } catch (sendErr: any) {
        console.error('[KSeF][send] FULL ERROR:', sendErr.message);
        if (transmission?.id) await supabase.from('ksef_transmissions').update({ status: 'error', error_message: sendErr.message, response_at: new Date().toISOString() }).eq('id', transmission.id);
        await supabase.from('user_invoices').update({ ksef_status: 'rejected' }).eq('id', body.invoice_id);
        throw sendErr;
      }
    }

    // ========== check_status (FIX BŁĄD 3, 4, 6: use invoice_ref for individual status) ==========
    if (action === 'check_status') {
      try {
        const sessionRef = body.session_ref;
        const invoiceRef = body.invoice_ref;
        const invoiceId = body.invoice_id;
        if (!sessionRef) return jsonRes({ success: true, status: 'processing' });

        // If we don't have invoice_ref from body, try to load it from DB
        let effectiveInvoiceRef = invoiceRef;
        if (!effectiveInvoiceRef && invoiceId) {
          const { data: inv } = await supabase.from('user_invoices').select('ksef_invoice_ref').eq('id', invoiceId).maybeSingle();
          effectiveInvoiceRef = inv?.ksef_invoice_ref || null;
        }

        const creds = await resolveCredentials(req, supabase, body);
        const { nip, token, environment } = creds;
        if (!nip || !token) return jsonRes({ success: true, status: 'processing' });

        const base = getBaseUrl(environment);
        let accessToken: string;
        try {
          const authResult = await getKsefAccessToken(base, nip, token);
          accessToken = authResult.accessToken;
        } catch (authErr: any) {
          console.warn('[KSeF][check_status] auth failed:', authErr.message);
          return jsonRes({ success: true, status: 'processing', message: 'Autoryzacja wygasła — spróbuj ponownie za chwilę' });
        }

        // ===== Check session status =====
        console.log('[KSeF][check_status] session.status.request, sessionRef:', sessionRef);
        const stRes = await fetch(`${base}/sessions/${sessionRef}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        
        if (stRes.status === 401) {
          console.warn('[KSeF][check_status] 401 — token expired');
          await stRes.text();
          return jsonRes({ success: true, status: 'processing', message: 'Token KSeF wygasł — ponów próbę' });
        }
        
        if (stRes.status === 429) {
          const retryAfter = stRes.headers.get('Retry-After');
          console.warn('[KSeF][check_status] 429 Rate Limited, Retry-After:', retryAfter);
          await stRes.text();
          return jsonRes({ success: true, status: 'processing', message: `Rate limit — spróbuj za ${retryAfter || '30'}s` });
        }
        
        if (!stRes.ok) {
          const errTxt = await stRes.text();
          console.warn('[KSeF][check_status] session status HTTP', stRes.status, errTxt.slice(0, 200));
          return jsonRes({ success: true, status: 'processing', message: `Sesja przetwarzana (HTTP ${stRes.status})` });
        }
        const stData = await stRes.json();
        const statusCode = stData?.status?.code;
        const statusDesc = stData?.status?.description;
        console.log('[KSeF][check_status] session.status.response:',
          'code:', statusCode, 'desc:', statusDesc,
          'sessionRef:', sessionRef, 'invoiceRef:', effectiveInvoiceRef);

        // Session succeeded — now check individual invoice status
        if (statusCode === 200) {
          let ksefNumber: string | null = null;
          let invoiceStatusCode: number | null = null;
          let invoiceStatusDesc: string | null = null;
          let upoDownloadUrl: string | null = null;

          // FIX BŁĄD 3 & 6: Check individual invoice status if we have invoiceRef
          if (effectiveInvoiceRef) {
            try {
              console.log('[KSeF][check_status] invoice.status.request:', `${base}/sessions/${sessionRef}/invoices/${effectiveInvoiceRef}`);
              const invStatusRes = await fetch(`${base}/sessions/${sessionRef}/invoices/${effectiveInvoiceRef}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
              });
              if (invStatusRes.ok) {
                const invStatusData = await invStatusRes.json();
                invoiceStatusCode = invStatusData?.status?.code;
                invoiceStatusDesc = invStatusData?.status?.description;
                ksefNumber = invStatusData?.ksefNumber || null;
                upoDownloadUrl = invStatusData?.upoDownloadUrl || null;
                console.log('[KSeF][check_status] invoice.status.response:',
                  'code:', invoiceStatusCode, 'desc:', invoiceStatusDesc,
                  'ksefNumber:', ksefNumber, 'upoDownloadUrl:', upoDownloadUrl ? 'present' : 'none',
                  'acquisitionDate:', invStatusData?.acquisitionDate,
                  'permanentStorageDate:', invStatusData?.permanentStorageDate);
                
                // Handle invoice-level errors
                if (invoiceStatusCode && invoiceStatusCode >= 400) {
                  const errMsg = INVOICE_STATUS_MESSAGES[invoiceStatusCode] || invoiceStatusDesc || `Błąd faktury (${invoiceStatusCode})`;
                  console.error('[KSeF][check_status] Invoice REJECTED:', invoiceStatusCode, errMsg);
                  if (invoiceId) await supabase.from('user_invoices').update({ ksef_status: 'rejected' }).eq('id', invoiceId);
                  await supabase.from('ksef_transmissions').update({ 
                    status: 'rejected', 
                    error_message: `${invoiceStatusCode}: ${errMsg}`,
                    response_at: new Date().toISOString() 
                  }).eq('ksef_reference_number', sessionRef);
                  return jsonRes({ success: false, status: 'rejected', error: errMsg, error_code: invoiceStatusCode });
                }

                // Invoice still processing
                if (invoiceStatusCode === 100 || invoiceStatusCode === 150) {
                  return jsonRes({ success: true, status: 'processing', message: INVOICE_STATUS_MESSAGES[invoiceStatusCode] });
                }
              } else {
                const errTxt = await invStatusRes.text();
                console.warn('[KSeF][check_status] invoice status fetch failed:', invStatusRes.status, errTxt.slice(0, 200));
              }
            } catch (e: any) {
              console.warn('[KSeF][check_status] invoice status error:', e.message);
            }
          }

          // Fallback: if no invoiceRef, try listing all invoices in session
          if (!ksefNumber && !effectiveInvoiceRef) {
            try {
              const ilRes = await fetch(`${base}/sessions/${sessionRef}/invoices`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
              if (ilRes.ok) {
                const ilData = await ilRes.json();
                const firstInv = ilData.invoices?.[0];
                ksefNumber = firstInv?.ksefNumber || null;
                upoDownloadUrl = firstInv?.upoDownloadUrl || null;
                invoiceStatusCode = firstInv?.status?.code;
                console.log('[KSeF][check_status] session invoices list: ksefNumber:', ksefNumber, 'statusCode:', invoiceStatusCode);
                
                if (invoiceStatusCode && invoiceStatusCode >= 400) {
                  const errMsg = INVOICE_STATUS_MESSAGES[invoiceStatusCode] || `Błąd faktury (${invoiceStatusCode})`;
                  if (invoiceId) await supabase.from('user_invoices').update({ ksef_status: 'rejected' }).eq('id', invoiceId);
                  return jsonRes({ success: false, status: 'rejected', error: errMsg, error_code: invoiceStatusCode });
                }
              } else {
                await ilRes.text();
              }
            } catch { /* ignore */ }
          }

          // Only mark as accepted if we actually got a ksefNumber
          if (!ksefNumber) {
            console.log('[KSeF][check_status] session OK but no ksefNumber yet — still processing');
            return jsonRes({ success: true, status: 'processing', message: 'Sesja aktywna, faktura jeszcze przetwarzana...' });
          }

          // SUCCESS: save ksefNumber
          if (invoiceId) {
            await supabase.from('user_invoices').update({ 
              ksef_status: 'accepted', 
              ksef_reference: ksefNumber, 
              ksef_environment: environment 
            }).eq('id', invoiceId);
          }
          
          // Save UPO URL to transmission
          const txUpdate: any = {
            status: 'accepted',
            ksef_reference_number: ksefNumber || sessionRef,
            response_at: new Date().toISOString(),
            environment,
          };
          if (upoDownloadUrl) txUpdate.upo_download_url = upoDownloadUrl;
          await supabase.from('ksef_transmissions').update(txUpdate).eq('ksef_reference_number', sessionRef);

          // Try to download UPO if URL available
          if (upoDownloadUrl) {
            try {
              console.log('[KSeF][check_status] upo.download.request');
              const upoRes = await fetch(upoDownloadUrl);
              if (upoRes.ok) {
                const upoXml = await upoRes.text();
                const upoHash = upoRes.headers.get('x-ms-meta-hash');
                console.log('[KSeF][check_status] upo.download.response OK, hash:', upoHash, 'size:', upoXml.length);
                await supabase.from('ksef_transmissions').update({ 
                  upo_content: upoXml,
                  upo_reference: upoHash || ksefNumber,
                }).eq('ksef_reference_number', sessionRef);
              } else {
                console.warn('[KSeF][check_status] UPO download failed:', upoRes.status);
                await upoRes.text();
              }
            } catch (e: any) {
              console.warn('[KSeF][check_status] UPO download error:', e.message);
            }
          }

          return jsonRes({ 
            success: true, 
            status: 'accepted', 
            ksef_reference: ksefNumber, 
            environment,
            upo_available: !!upoDownloadUrl,
          });
        }

        // Session error states
        if (statusCode === 445 || statusCode === 450 || statusCode === 435 || statusCode === 440) {
          let errDetail = `Sesja odrzucona przez KSeF (${statusCode}): ${statusDesc || ''}`;
          
          // Try to get failed invoices detail
          try {
            const fRes = await fetch(`${base}/sessions/${sessionRef}/invoices/failed`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (fRes.ok) { 
              const fd = await fRes.json(); 
              const failedInv = fd?.invoices?.[0];
              if (failedInv) {
                errDetail = `${failedInv.status?.code || statusCode}: ${failedInv.status?.description || errDetail}`;
                console.error('[KSeF][check_status] Failed invoice detail:', JSON.stringify(failedInv.status));
              }
            } else {
              await fRes.text();
            }
          } catch { /* ignore */ }

          console.error('[KSeF][check_status] Session REJECTED:', statusCode, errDetail);
          if (invoiceId) {
            await supabase.from('user_invoices').update({ ksef_status: 'rejected' }).eq('id', invoiceId);
          }
          await supabase.from('ksef_transmissions').update({ 
            status: 'rejected', 
            error_message: errDetail, 
            response_at: new Date().toISOString() 
          }).eq('ksef_reference_number', sessionRef);

          return jsonRes({ success: false, status: 'rejected', error: errDetail });
        }

        // Still in progress (100, 170, etc.)
        console.log('[KSeF][check_status] Session still processing, code:', statusCode);
        return jsonRes({ success: true, status: 'processing', message: 'Sesja KSeF w trakcie przetwarzania', status_code: statusCode });
      } catch (checkErr: any) {
        console.error('[KSeF][check_status] error:', checkErr.message);
        return jsonRes({ success: true, status: 'processing' });
      }
    }

    // ========== download_upo ==========
    if (action === 'download_upo') {
      if (!body.invoice_id && !body.session_ref) return jsonRes({ success: false, error: 'Brak invoice_id lub session_ref' }, 400);
      
      // Try to get UPO from ksef_transmissions first
      let query = supabase.from('ksef_transmissions').select('upo_content, upo_reference, upo_download_url, ksef_reference_number');
      if (body.session_ref) {
        query = query.eq('ksef_reference_number', body.session_ref);
      } else {
        query = query.eq('invoice_id', body.invoice_id);
      }
      const { data: tx } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
      
      if (tx?.upo_content) {
        return jsonRes({ success: true, upo_xml: tx.upo_content, upo_reference: tx.upo_reference });
      }
      
      // If no cached UPO but we have download URL, try fetching it
      if (tx?.upo_download_url) {
        try {
          const upoRes = await fetch(tx.upo_download_url);
          if (upoRes.ok) {
            const upoXml = await upoRes.text();
            const upoHash = upoRes.headers.get('x-ms-meta-hash');
            // Cache it
            await supabase.from('ksef_transmissions').update({ upo_content: upoXml, upo_reference: upoHash }).eq('id', tx.id);
            return jsonRes({ success: true, upo_xml: upoXml, upo_reference: upoHash });
          }
          await upoRes.text();
        } catch { /* fall through */ }
      }
      
      return jsonRes({ success: false, error: 'UPO nie jest jeszcze dostępne. Spróbuj ponownie za chwilę.' });
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
