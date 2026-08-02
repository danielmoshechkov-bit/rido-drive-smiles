/**
 * Błędy modułu fiskalizacji + mapowanie na komunikaty po polsku dla użytkownika końcowego.
 *
 * Każdy błąd ma `code` (stabilny identyfikator do logów/UI) i `userMessage` (PL).
 */

export type ElzabErrorCode =
  | 'CONNECTION' // nie udało się połączyć z drukarką
  | 'TIMEOUT' // brak odpowiedzi w czasie
  | 'NAK' // drukarka odrzuciła komendę
  | 'PROTOCOL' // nieoczekiwana odpowiedź
  | 'VALIDATION' // dane paragonu niepoprawne zanim cokolwiek wysłaliśmy
  | 'RECEIPT_CANCELLED'; // paragon unieważniony przez drukarkę

export class ElzabError extends Error {
  readonly code: ElzabErrorCode;
  readonly userMessage: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ElzabErrorCode,
    userMessage: string,
    technicalMessage?: string,
    details?: Record<string, unknown>,
  ) {
    super(technicalMessage ?? userMessage);
    this.name = 'ElzabError';
    this.code = code;
    this.userMessage = userMessage;
    this.details = details;
  }

  toJSON() {
    return {
      code: this.code,
      userMessage: this.userMessage,
      message: this.message,
      details: this.details,
    };
  }
}

export class ElzabConnectionError extends ElzabError {
  constructor(host: string, port: number, cause?: unknown) {
    super(
      'CONNECTION',
      `Brak połączenia z drukarką fiskalną (${host}:${port}). Sprawdź, czy drukarka jest włączona i w tej samej sieci.`,
      `connect ${host}:${port} failed: ${String(cause)}`,
      { host, port },
    );
    this.name = 'ElzabConnectionError';
  }
}

export class ElzabTimeoutError extends ElzabError {
  constructor(command: string, timeoutMs: number) {
    super(
      'TIMEOUT',
      `Drukarka nie odpowiedziała na komendę „${command}" w ciągu ${Math.round(timeoutMs / 1000)} s. Sprawdź papier, zasilanie i połączenie sieciowe.`,
      `timeout waiting for response to ${command} (${timeoutMs} ms)`,
      { command, timeoutMs },
    );
    this.name = 'ElzabTimeoutError';
  }
}

export class ElzabNakError extends ElzabError {
  constructor(command: string, status?: { status1?: number; status2?: number }) {
    super(
      'NAK',
      `Drukarka odrzuciła operację „${command}". ${describeStatus(status)}`.trim(),
      `NAK for ${command}`,
      { command, ...status },
    );
    this.name = 'ElzabNakError';
  }
}

export class ElzabProtocolError extends ElzabError {
  constructor(command: string, technical: string) {
    super(
      'PROTOCOL',
      `Nieprawidłowa odpowiedź drukarki na komendę „${command}". Skontaktuj się z serwisem drukarki.`,
      technical,
      { command },
    );
    this.name = 'ElzabProtocolError';
  }
}

export class ElzabValidationError extends ElzabError {
  constructor(userMessage: string, details?: Record<string, unknown>) {
    super('VALIDATION', userMessage, userMessage, details);
    this.name = 'ElzabValidationError';
  }
}

/**
 * Kody błędów drukowane przez drukarkę przy #ANULOWANY# (dokumentacja ElzabESC).
 */
export const RECEIPT_ERROR_CODES: Record<string, string> = {
  '7': 'Niezgodność sumy paragonu z sumą pozycji.',
  'B': 'Nazwa towaru krótsza niż 5 znaków znaczących.',
  'I': 'Nieprawidłowa lub niezdefiniowana w drukarce stawka VAT.',
  'R': 'Pozycja o zerowej wartości.',
  'S': 'Przekroczona maksymalna kwota paragonu.',
  'H': 'Brak sekwencji stawki VAT w oczekiwanym miejscu.',
  'X': 'Przekroczony czas oczekiwania drukarki na dane (timeout paragonu).',
};

export function describeReceiptErrorCode(code: string): string {
  return RECEIPT_ERROR_CODES[code.toUpperCase()] ?? `Nieznany kod błędu paragonu: ${code}.`;
}

/**
 * Bity bajtów statusu (Esc 54H / Esc 55H) — opis pomocniczy po NAK.
 * Zweryfikowane na Zeta Online: status2 bit 0x10 zapala się po odrzuconej operacji
 * (np. niezgodna suma paragonu). Pozostałych bitów nie interpretujemy — pokazujemy surowo.
 */
function describeStatus(status?: { status1?: number; status2?: number }): string {
  if (!status || (status.status1 === undefined && status.status2 === undefined)) {
    return 'Sprawdź stan drukarki (papier, tryb pracy, otwarty paragon).';
  }
  const s1 = status.status1 ?? 0;
  const s2 = status.status2 ?? 0;
  const hex2 = (n: number) => `0x${n.toString(16).padStart(2, '0')}`;
  if (s2 & 0x10) {
    return 'Drukarka odrzuciła ostatnią operację — paragon został unieważniony (na wydruku #ANULOWANY#).';
  }
  return `Status drukarki: ${hex2(s1)} / ${hex2(s2)}.`;
}

/** Zamienia dowolny wyjątek na czytelny komunikat PL (do UI / zapisu w logu). */
export function toUserMessage(error: unknown): string {
  if (error instanceof ElzabError) return error.userMessage;
  if (error instanceof Error) return `Błąd fiskalizacji: ${error.message}`;
  return 'Nieznany błąd fiskalizacji.';
}
