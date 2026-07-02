// Klient GUS REGON BIR1.1 (SOAP 1.2) — wspólna logika dla index.ts i testów.
// Endpointy i przebieg: Zaloguj -> DaneSzukajPodmioty (NIP) -> DanePobierzPelnyRaport -> (sesja cache'owana ~50 min, bez Wyloguj po każdym wywołaniu).
// Świadomie zero parsowania adresów regexami — pola adresowe bierzemy OSOBNO z pełnego raportu GUS.

export const BIR_ENDPOINTS = {
  production: 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc',
  test: 'https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc',
} as const;

export type BirEnvironment = keyof typeof BIR_ENDPOINTS;

export interface GusPkd {
  kod: string;
  nazwa: string;
}

export interface GusCompanyData {
  nazwa: string;
  nazwa_skrocona: string | null;
  nip: string;
  regon: string;
  krs: string | null;
  ulica: string;
  nr_domu: string;
  nr_lokalu: string;
  kod_pocztowy: string;
  miasto: string;
  wojewodztwo: string;
  gmina: string;
  powiat: string;
  forma_prawna: string | null;
  pkd_glowne: GusPkd | null;
  status: 'aktywny' | 'zakonczony';
  data_zakonczenia: string | null;
  typ_podmiotu: 'prawna' | 'fizyczna' | 'lokalna_prawnej' | 'lokalna_fizycznej';
  /** Złożony adres "Ulica Nr/Lokal" — sklejony z pól, nie parsowany. */
  adres: string;
  zrodlo: 'gus';
}

export class BirError extends Error {
  code: 'NOT_FOUND' | 'INVALID_KEY' | 'SESSION' | 'LIMIT' | 'GUS_ERROR';
  constructor(code: BirError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

/** Walidacja sumy kontrolnej NIP (10 cyfr). */
export function isValidNip(nip: string): boolean {
  const clean = nip.replace(/[\s-]/g, '').replace(/^PL/i, '');
  if (!/^\d{10}$/.test(clean)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const digits = clean.split('').map(Number);
  const checksum = weights.reduce((sum, w, i) => sum + w * digits[i], 0) % 11;
  return checksum !== 10 && checksum === digits[9];
}

const SOAP_NS = 'http://CIS/BIR/PUBL/2014/07';
const DATA_NS = 'http://CIS/BIR/PUBL/2014/07/DataContract';

function soapEnvelope(action: string, endpoint: string, body: string): string {
  return `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="${SOAP_NS}" xmlns:dat="${DATA_NS}">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:Action>${action}</wsa:Action>
    <wsa:To>${endpoint}</wsa:To>
  </soap:Header>
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`;
}

/** Odpowiedzi BIR przychodzą jako MTOM/multipart — wycinamy kopertę SOAP bez parsowania MIME. */
function extractEnvelope(raw: string): string {
  const match = raw.match(/<([A-Za-z0-9]+):Envelope[\s\S]*<\/\1:Envelope>/);
  return match ? match[0] : raw;
}

function decodeXmlEntities(xml: string): string {
  return xml
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#xD;/g, '')
    .replace(/&amp;/g, '&');
}

function tag(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? match[1].trim() : '';
}

async function soapCall(
  endpoint: string,
  action: string,
  body: string,
  sid?: string,
): Promise<string> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/soap+xml;charset=UTF-8',
      ...(sid ? { sid } : {}),
    },
    body: soapEnvelope(action, endpoint, body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new BirError('GUS_ERROR', `GUS HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return extractEnvelope(text);
}

// ---------------------------------------------------------------------------
// Sesja BIR — cache w pamięci instancji funkcji (~50 min; sesja GUS żyje 60).
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 50 * 60 * 1000;
let cachedSession: { sid: string; endpoint: string; obtainedAt: number } | null = null;

async function login(endpoint: string, apiKey: string): Promise<string> {
  const xml = await soapCall(
    endpoint,
    `${SOAP_NS}/IUslugaBIRzewnPubl/Zaloguj`,
    `<ns:Zaloguj><ns:pKluczUzytkownika>${apiKey}</ns:pKluczUzytkownika></ns:Zaloguj>`,
  );
  const sid = tag(xml, 'ZalogujResult');
  if (!sid) {
    throw new BirError('INVALID_KEY', 'GUS odrzucił klucz API (Zaloguj zwrócił pustą sesję)');
  }
  return sid;
}

async function getSession(endpoint: string, apiKey: string, forceNew = false): Promise<string> {
  const now = Date.now();
  if (
    !forceNew &&
    cachedSession &&
    cachedSession.endpoint === endpoint &&
    now - cachedSession.obtainedAt < SESSION_TTL_MS
  ) {
    return cachedSession.sid;
  }
  if (cachedSession && cachedSession.endpoint === endpoint) {
    // Stara sesja wygasa — wyloguj best-effort, żeby nie zostawiać wiszących sesji.
    soapCall(
      endpoint,
      `${SOAP_NS}/IUslugaBIRzewnPubl/Wyloguj`,
      `<ns:Wyloguj><ns:pIdentyfikatorSesji>${cachedSession.sid}</ns:pIdentyfikatorSesji></ns:Wyloguj>`,
      cachedSession.sid,
    ).catch(() => {});
  }
  const sid = await login(endpoint, apiKey);
  cachedSession = { sid, endpoint, obtainedAt: now };
  return sid;
}

// ---------------------------------------------------------------------------
// Wyszukiwanie + pełny raport
// ---------------------------------------------------------------------------

interface SearchHit {
  regon: string;
  nip: string;
  statusNip: string;
  nazwa: string;
  typ: string; // P | F | LP | LF
  silosId: string;
  wojewodztwo: string;
  powiat: string;
  gmina: string;
  miejscowosc: string;
  kodPocztowy: string;
  ulica: string;
  nrNieruchomosci: string;
  nrLokalu: string;
  dataZakonczenia: string;
}

function throwForErrorCode(code: string, message: string): never {
  if (code === '4') throw new BirError('NOT_FOUND', 'Nie znaleziono firmy o podanym NIP w rejestrze REGON');
  if (code === '7') throw new BirError('SESSION', 'Sesja GUS wygasła');
  if (code === '5') throw new BirError('LIMIT', 'Przekroczono limit zapytań do GUS — spróbuj za chwilę');
  throw new BirError('GUS_ERROR', message || `GUS zwrócił błąd (kod ${code})`);
}

async function searchByNip(endpoint: string, sid: string, nip: string): Promise<SearchHit> {
  const xml = await soapCall(
    endpoint,
    `${SOAP_NS}/IUslugaBIRzewnPubl/DaneSzukajPodmioty`,
    `<ns:DaneSzukajPodmioty><ns:pParametryWyszukiwania><dat:Nip>${nip}</dat:Nip></ns:pParametryWyszukiwania></ns:DaneSzukajPodmioty>`,
    sid,
  );
  const resultRaw = tag(xml, 'DaneSzukajPodmiotyResult');
  if (!resultRaw) {
    // Pusty wynik bez ErrorCode = najczęściej martwa/nieprawidłowa sesja.
    throw new BirError('SESSION', 'GUS zwrócił pustą odpowiedź (sesja nieaktywna?)');
  }
  const result = decodeXmlEntities(resultRaw);
  const errorCode = tag(result, 'ErrorCode');
  if (errorCode) {
    throwForErrorCode(errorCode, tag(result, 'ErrorMessagePl'));
  }
  const dane = tag(result, 'dane');
  if (!dane) {
    throw new BirError('NOT_FOUND', 'Nie znaleziono firmy o podanym NIP w rejestrze REGON');
  }
  return {
    regon: tag(dane, 'Regon'),
    nip: tag(dane, 'Nip') || nip,
    statusNip: tag(dane, 'StatusNip'),
    nazwa: tag(dane, 'Nazwa'),
    typ: tag(dane, 'Typ'),
    silosId: tag(dane, 'SilosID'),
    wojewodztwo: tag(dane, 'Wojewodztwo'),
    powiat: tag(dane, 'Powiat'),
    gmina: tag(dane, 'Gmina'),
    miejscowosc: tag(dane, 'Miejscowosc'),
    kodPocztowy: tag(dane, 'KodPocztowy'),
    ulica: tag(dane, 'Ulica'),
    nrNieruchomosci: tag(dane, 'NrNieruchomosci'),
    nrLokalu: tag(dane, 'NrLokalu'),
    dataZakonczenia: tag(dane, 'DataZakonczeniaDzialalnosci'),
  };
}

async function fullReport(
  endpoint: string,
  sid: string,
  regon: string,
  reportName: string,
): Promise<string | null> {
  const xml = await soapCall(
    endpoint,
    `${SOAP_NS}/IUslugaBIRzewnPubl/DanePobierzPelnyRaport`,
    `<ns:DanePobierzPelnyRaport><ns:pRegon>${regon}</ns:pRegon><ns:pNazwaRaportu>${reportName}</ns:pNazwaRaportu></ns:DanePobierzPelnyRaport>`,
    sid,
  );
  const resultRaw = tag(xml, 'DanePobierzPelnyRaportResult');
  if (!resultRaw) return null;
  const result = decodeXmlEntities(resultRaw);
  if (tag(result, 'ErrorCode')) return null;
  return result;
}

function reportNamesFor(hit: SearchHit): { main: string | null; pkd: string | null; prefix: string } {
  if (hit.typ === 'P') {
    return { main: 'BIR11OsPrawna', pkd: 'BIR11OsPrawnaPkd', prefix: 'praw' };
  }
  if (hit.typ === 'F') {
    const bySilos: Record<string, string> = {
      '1': 'BIR11OsFizycznaDzialalnoscCeidg',
      '2': 'BIR11OsFizycznaDzialalnoscRolnicza',
      '3': 'BIR11OsFizycznaDzialalnoscPozostala',
      '4': 'BIR11OsFizycznaDzialalnoscSkreslonaDoBazyKrupgn',
    };
    return {
      main: bySilos[hit.silosId] || 'BIR11OsFizycznaDzialalnoscCeidg',
      pkd: 'BIR11OsFizycznaPkd',
      prefix: 'fiz',
    };
  }
  // Jednostki lokalne (LP/LF) — zostajemy przy danych z wyszukiwarki.
  return { main: null, pkd: null, prefix: '' };
}

function pickMainPkd(pkdXml: string | null, prefix: string): GusPkd | null {
  if (!pkdXml) return null;
  const rows = pkdXml.match(/<dane>[\s\S]*?<\/dane>/g) || [];
  let first: GusPkd | null = null;
  for (const row of rows) {
    const kod = tag(row, `${prefix}_pkdKod`);
    const nazwa = tag(row, `${prefix}_pkdNazwa`);
    if (!kod) continue;
    const pkd = { kod, nazwa };
    if (!first) first = pkd;
    if (tag(row, `${prefix}_pkdPrzewazajace`) === '1') return pkd;
  }
  return first;
}

/** GUS zwraca kod pocztowy bez myślnika (np. "02515") — normalizujemy do "02-515". */
function formatKodPocztowy(kod: string): string {
  return /^\d{5}$/.test(kod) ? `${kod.slice(0, 2)}-${kod.slice(2)}` : kod;
}

function composeAdres(ulica: string, nrDomu: string, nrLokalu: string): string {
  const nr = nrLokalu ? `${nrDomu}/${nrLokalu}` : nrDomu;
  return [ulica, nr].filter(Boolean).join(' ').trim();
}

/**
 * Główny lookup: NIP -> znormalizowane dane firmy z GUS REGON.
 * Pełna nazwa rejestrowa (praw_nazwa / fiz_nazwa z pełnego raportu), adres z pól — bez cięcia stringów.
 */
export async function lookupNipInGus(
  nip: string,
  apiKey: string,
  environment: BirEnvironment = 'production',
): Promise<GusCompanyData> {
  const endpoint = BIR_ENDPOINTS[environment];
  const cleanNip = nip.replace(/[\s-]/g, '').replace(/^PL/i, '');

  let sid = await getSession(endpoint, apiKey);
  let hit: SearchHit;
  try {
    hit = await searchByNip(endpoint, sid, cleanNip);
  } catch (err) {
    if (err instanceof BirError && err.code === 'SESSION') {
      // Retry z nową sesją (wygasła w oknie cache).
      sid = await getSession(endpoint, apiKey, true);
      hit = await searchByNip(endpoint, sid, cleanNip);
    } else {
      throw err;
    }
  }

  const { main, pkd, prefix } = reportNamesFor(hit);
  const mainXml = main ? await fullReport(endpoint, sid, hit.regon, main).catch(() => null) : null;
  const pkdXml = pkd ? await fullReport(endpoint, sid, hit.regon, pkd).catch(() => null) : null;

  const r = (field: string) => (mainXml ? tag(mainXml, `${prefix}_${field}`) : '');

  const nazwa = r('nazwa') || hit.nazwa;
  const ulica = r('adSiedzUlica_Nazwa') || hit.ulica;
  const nrDomu = r('adSiedzNumerNieruchomosci') || hit.nrNieruchomosci;
  const nrLokalu = r('adSiedzNumerLokalu') || hit.nrLokalu;
  const dataZakonczenia = r('dataZakonczeniaDzialalnosci') || hit.dataZakonczenia;

  const formaPodstawowa = r('podstawowaFormaPrawna_Nazwa');
  const formaSzczegolna = r('szczegolnaFormaPrawna_Nazwa');

  return {
    nazwa,
    nazwa_skrocona: r('nazwaSkrocona') || null,
    nip: hit.nip,
    regon: hit.regon,
    krs: hit.typ === 'P' ? r('numerWRejestrzeEwidencji') || null : null,
    ulica,
    nr_domu: nrDomu,
    nr_lokalu: nrLokalu,
    kod_pocztowy: formatKodPocztowy(r('adSiedzKodPocztowy') || hit.kodPocztowy),
    miasto: r('adSiedzMiejscowosc_Nazwa') || hit.miejscowosc,
    wojewodztwo: r('adSiedzWojewodztwo_Nazwa') || hit.wojewodztwo,
    gmina: r('adSiedzGmina_Nazwa') || hit.gmina,
    powiat: r('adSiedzPowiat_Nazwa') || hit.powiat,
    forma_prawna: formaSzczegolna || formaPodstawowa || null,
    pkd_glowne: pickMainPkd(pkdXml, prefix),
    status: dataZakonczenia ? 'zakonczony' : 'aktywny',
    data_zakonczenia: dataZakonczenia || null,
    typ_podmiotu:
      hit.typ === 'P' ? 'prawna'
      : hit.typ === 'F' ? 'fizyczna'
      : hit.typ === 'LP' ? 'lokalna_prawnej'
      : 'lokalna_fizycznej',
    adres: composeAdres(ulica, nrDomu, nrLokalu),
    zrodlo: 'gus',
  };
}
