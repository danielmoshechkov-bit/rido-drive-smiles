/**
 * Klient mostka fiskalnego — połączenie przeglądarka → lokalny serwer drukowania.
 *
 * Mostek jest ustawieniem KONKRETNEGO KOMPUTERA, nie tenanta: w warsztacie z trzema
 * stanowiskami każde ma własną drukarkę albo własny mostek. Dlatego konfiguracja siedzi
 * w localStorage tej przeglądarki, a nie w bazie.
 *
 * Chrome traktuje http://127.0.0.1 jako bezpieczne pochodzenie, więc strona HTTPS
 * (getrido.pl) może wołać mostek bez ostrzeżeń o mieszanej treści.
 */

export interface BridgeConfig {
  enabled: boolean;
  url: string;
  token?: string;
}

export const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:9110';

const storageKey = (providerId?: string) => `fiscal_bridge:${providerId ?? 'default'}`;

export function getBridgeConfig(providerId?: string): BridgeConfig {
  try {
    const raw = localStorage.getItem(storageKey(providerId));
    if (!raw) return { enabled: false, url: DEFAULT_BRIDGE_URL };
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      url: parsed.url || DEFAULT_BRIDGE_URL,
      token: parsed.token || undefined,
    };
  } catch {
    return { enabled: false, url: DEFAULT_BRIDGE_URL };
  }
}

export function setBridgeConfig(config: BridgeConfig, providerId?: string): void {
  localStorage.setItem(storageKey(providerId), JSON.stringify(config));
}

function headers(config: BridgeConfig): HeadersInit {
  return config.token
    ? { 'Content-Type': 'application/json', 'X-Fiscal-Token': config.token }
    : { 'Content-Type': 'application/json' };
}

async function parse(response: Response): Promise<any> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.message || 'Mostek fiskalny zwrócił błąd.') as Error & { code?: string };
    error.code = payload?.code || 'BRIDGE_ERROR';
    throw error;
  }
  return payload;
}

/** Czy mostek na tym komputerze odpowiada. */
export async function bridgeHealth(config: BridgeConfig): Promise<{ ok: boolean; version?: string }> {
  const response = await fetch(`${config.url.replace(/\/$/, '')}/health`, { method: 'GET' });
  return parse(response);
}

export interface BridgePrinter {
  host: string;
  port: number;
  codepage?: string;
  itemNameLength?: number;
  commandTimeoutMs?: number;
}

export async function bridgePrint(
  config: BridgeConfig,
  printer: BridgePrinter,
  receipt: Record<string, unknown>,
): Promise<{ receiptNumber: number | null; totalGrosze: number; trace?: string[] }> {
  const response = await fetch(`${config.url.replace(/\/$/, '')}/print`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify({ printer, receipt }),
  });
  return parse(response);
}

export async function bridgeTest(
  config: BridgeConfig,
  printer: BridgePrinter,
): Promise<{ clock: string; lastReceiptNumber: number | null; message: string }> {
  const response = await fetch(`${config.url.replace(/\/$/, '')}/test`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify({ printer }),
  });
  return parse(response);
}

export interface FoundPrinter {
  host: string;
  port: number;
  clock: string;
  lastReceiptNumber: number | null;
}

/**
 * Szukanie drukarki w sieci lokalnej przez mostek.
 *
 * `knownHost` sprawdzany jest pierwszy, więc gdy adres się nie zmienił, skan kończy się
 * natychmiast i nie obciąża sieci.
 */
export async function bridgeScan(
  config: BridgeConfig,
  options: { knownHost?: string; port?: number } = {},
): Promise<{ devices: FoundPrinter[]; subnets: string[]; scanned: number }> {
  const response = await fetch(`${config.url.replace(/\/$/, '')}/scan`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify({ knownHost: options.knownHost, port: options.port ?? 9100 }),
  });
  return parse(response);
}

export async function bridgeDayReport(config: BridgeConfig, printer: BridgePrinter): Promise<{ message: string }> {
  const response = await fetch(`${config.url.replace(/\/$/, '')}/day-report`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify({ printer }),
  });
  return parse(response);
}

/** Czytelny komunikat, gdy mostek nie odpowiada (najczęstszy przypadek: nie jest uruchomiony). */
export function bridgeUnreachableMessage(url: string): string {
  return `Mostek fiskalny nie odpowiada pod adresem ${url}. Uruchom go na tym komputerze poleceniem „npm run fiscal:bridge".`;
}
