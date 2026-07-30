/**
 * Klient protokołu ElzabESC — warstwa nad transportem TCP.
 *
 * Obsługuje: wysyłkę sekwencji, odbiór ACK/NAK, deadline per komenda,
 * odczyt payloadu (zegar, status, numer paragonu) i pełny cykl paragonu.
 */

import * as cmd from './commands.ts';
import { ACK, hex, NAK } from './codec.ts';
import {
  describeReceiptErrorCode,
  ElzabError,
  ElzabNakError,
  ElzabProtocolError,
  ElzabTimeoutError,
} from './errors.ts';
import { prepareReceipt, type PreparedReceipt } from './receipt.ts';
import type { ElzabTransport } from './transport.ts';
import type { PrinterClock, ReceiptRequest, ReceiptResult } from './types.ts';

export interface ElzabClientOptions {
  /** Timeout pojedynczej komendy. Drukarka bywa wolna (ping ~400 ms) — domyślnie 10 s. */
  commandTimeoutMs?: number;
  /** Timeout komend drukujących (zamknięcie paragonu, raport dobowy). */
  printTimeoutMs?: number;
  /** Liczba ponowień komend bezstanowych (healthcheck) — nie dotyczy paragonu. */
  retries?: number;
  logger?: (message: string) => void;
}

const DEFAULTS = {
  commandTimeoutMs: 10_000,
  printTimeoutMs: 30_000,
  retries: 1,
};

export interface CommandResult {
  ack: boolean;
  payload: Uint8Array;
}

export class ElzabClient {
  private buffer: number[] = [];
  private readonly transport: ElzabTransport;
  private readonly opts: Required<Omit<ElzabClientOptions, 'logger'>> & { logger?: (m: string) => void };
  readonly trace: string[] = [];

  // Uwaga: bez „parameter properties" — skrypty testowe działają na strip-only TS w Node.
  constructor(transport: ElzabTransport, options: ElzabClientOptions = {}) {
    this.transport = transport;
    this.opts = { ...DEFAULTS, ...options };
  }

  private log(message: string) {
    this.trace.push(message);
    this.opts.logger?.(message);
  }

  // ── warstwa bajtów ────────────────────────────────────────────────────────

  private async readBytes(count: number, timeoutMs: number, command: string): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    while (this.buffer.length < count) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new ElzabTimeoutError(command, timeoutMs);
      const chunk = await this.transport.read(remaining);
      if (chunk === null) {
        throw new ElzabProtocolError(command, 'drukarka zamknęła połączenie w trakcie odczytu');
      }
      if (chunk.length) this.buffer.push(...chunk);
    }
    return new Uint8Array(this.buffer.splice(0, count));
  }

  /** Odczytuje wszystko, co przyjdzie w krótkim oknie (gdy długość odpowiedzi nieznana). */
  private async readAvailable(windowMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + windowMs;
    while (Date.now() < deadline) {
      const chunk = await this.transport.read(Math.max(1, deadline - Date.now()));
      if (chunk === null) break;
      if (chunk.length) {
        this.buffer.push(...chunk);
        // Drukarka wysyła odpowiedź jednym strzałem — po pierwszej porcji dajemy jeszcze chwilę.
        const tail = await this.transport.read(150);
        if (tail?.length) this.buffer.push(...tail);
        break;
      }
    }
    return new Uint8Array(this.buffer.splice(0, this.buffer.length));
  }

  /** Czyści zaległe bajty z poprzednich (przerwanych) sesji. */
  async drain(windowMs = 200): Promise<void> {
    const leftovers = await this.readAvailable(windowMs);
    if (leftovers.length) this.log(`drain: odrzucono ${leftovers.length} B (${hex(leftovers)})`);
  }

  /**
   * Wysyła sekwencję i odbiera potwierdzenie.
   * @param payloadLength liczba bajtów danych następujących po ACK (0 = tylko ACK/NAK)
   */
  async send(
    name: string,
    bytes: Uint8Array,
    payloadLength = 0,
    options: { allowNak?: boolean; timeoutMs?: number } = {},
  ): Promise<CommandResult> {
    const timeoutMs = options.timeoutMs ?? this.opts.commandTimeoutMs;
    this.log(`→ ${name}: ${hex(bytes)}`);
    await this.transport.write(bytes);

    const first = await this.readBytes(1, timeoutMs, name);
    const code = first[0];

    if (code === NAK) {
      this.log(`← ${name}: NAK`);
      if (options.allowNak) return { ack: false, payload: new Uint8Array() };
      const status = await this.readStatusSafe();
      throw new ElzabNakError(name, status);
    }
    if (code !== ACK) {
      throw new ElzabProtocolError(name, `oczekiwano ACK/NAK, otrzymano 0x${code.toString(16)}`);
    }

    const payload = payloadLength > 0 ? await this.readBytes(payloadLength, timeoutMs, name) : new Uint8Array();
    this.log(`← ${name}: ACK${payload.length ? ' ' + hex(payload) : ''}`);
    return { ack: true, payload };
  }

  /**
   * Sekwencje „ciche" — potwierdzone empirycznie na ELZAB Zeta Online:
   * pozycja sprzedaży (Esc 06H 20H), koniec pozycji (Esc 07H) i płatność (Esc 81H)
   * NIE odsyłają ACK. Potwierdzeniem jest dopiero kontrola stanu (Esc 50H),
   * która zwraca ACK + bajt statusu (0x00 = OK).
   */
  async sendSilent(name: string, bytes: Uint8Array): Promise<void> {
    this.log(`→ ${name}: ${hex(bytes)}`);
    await this.transport.write(bytes);

    // Część firmware'ów potrafi jednak odpowiedzieć — jeśli to NAK, kończymy od razu.
    const early = await this.readAvailable(250);
    if (early.length) {
      this.log(`← ${name}: ${hex(early)}`);
      if (early[0] === NAK) throw new ElzabNakError(name, await this.readStatusSafe());
    }

    await this.verifyStatus(name);
  }

  /**
   * NIP nabywcy na paragonie (Esc 4BH).
   *
   * Uwaga: ta sekwencja NIE odpowiada ACK-iem — zwraca pojedynczy bajt odpowiedzi
   * (0x00 = przyjęte). Zweryfikowane na ELZAB Zeta: pole 42 znaków dopełnione spacjami,
   * odpowiedź `00`, status po niej 0x00.
   */
  async setBuyerNip(nip: string): Promise<void> {
    const bytes = cmd.buyerNip(nip);
    this.log(`→ NIP nabywcy: ${hex(bytes)}`);
    await this.transport.write(bytes);

    const response = await this.readBytes(1, this.opts.commandTimeoutMs, 'NIP nabywcy');
    this.log(`← NIP nabywcy: ${hex(response)}`);
    if (response[0] !== 0x00) {
      throw new ElzabError(
        'NAK',
        `Drukarka odrzuciła NIP nabywcy „${nip}" (odpowiedź 0x${response[0].toString(16)}). Sprawdź poprawność numeru.`,
        `buyer NIP rejected: 0x${response[0].toString(16)}`,
        { nip },
      );
    }
    await this.verifyStatus('NIP nabywcy');
  }

  /** Kontrola stanu (Esc 50H) → ACK + bajt statusu. Status != 0 oznacza błąd paragonu. */
  async verifyStatus(afterCommand: string): Promise<number> {
    const { payload } = await this.send('kontrola stanu', cmd.checkStatus(), 1, { timeoutMs: 5000 });
    const status = payload[0] ?? 0;
    if (status !== 0) {
      const code = status >= 0x20 && status < 0x7f ? String.fromCharCode(status) : `0x${status.toString(16)}`;
      throw new ElzabError(
        'RECEIPT_CANCELLED',
        `Paragon odrzucony przez drukarkę po kroku „${afterCommand}": ${describeReceiptErrorCode(code)}`,
        `printer status ${code} after ${afterCommand}`,
        { afterCommand, status, code },
      );
    }
    return status;
  }

  // ── komendy diagnostyczne ─────────────────────────────────────────────────

  /** Odczyt zegara drukarki — używany jako healthcheck (Esc 35H). */
  async getClock(): Promise<PrinterClock> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.opts.retries; attempt++) {
      try {
        const { payload } = await this.send('odczyt zegara', cmd.readClock(), 10);
        return parseClock(payload);
      } catch (error) {
        lastError = error;
        if (!(error instanceof ElzabTimeoutError)) throw error;
        this.log(`healthcheck: próba ${attempt + 1} nieudana, ponawiam`);
        this.buffer.length = 0;
      }
    }
    throw lastError as Error;
  }

  /** Bajty statusu (Esc 54H / Esc 55H). Best-effort — brak odpowiedzi nie jest błędem krytycznym. */
  async readStatusSafe(): Promise<{ status1?: number; status2?: number }> {
    const result: { status1?: number; status2?: number } = {};
    try {
      const s1 = await this.send('status 1', cmd.readStatus1(), 1, { allowNak: true, timeoutMs: 3000 });
      if (s1.payload.length) result.status1 = s1.payload[0];
      const s2 = await this.send('status 2', cmd.readStatus2(), 1, { allowNak: true, timeoutMs: 3000 });
      if (s2.payload.length) result.status2 = s2.payload[0];
    } catch (error) {
      this.log(`status: nie udało się odczytać (${String(error)})`);
      this.buffer.length = 0;
    }
    return result;
  }

  /**
   * Numer ostatniego paragonu (Esc 66H).
   * Długość odpowiedzi nie jest jednoznacznie udokumentowana — czytamy best-effort
   * i logujemy surowe bajty, żeby dało się je zweryfikować na urządzeniu.
   */
  async getLastReceiptNumber(): Promise<{ value?: number; raw: string }> {
    try {
      this.log(`→ nr ostatniego paragonu: ${hex(cmd.lastReceiptNumber())}`);
      await this.transport.write(cmd.lastReceiptNumber());
      const response = await this.readAvailable(3000);
      const raw = hex(response);
      this.log(`← nr ostatniego paragonu: ${raw || '(brak odpowiedzi)'}`);
      if (!response.length || response[0] !== ACK) return { raw };
      const payload = response.subarray(1);
      return { value: parseCounter(payload), raw };
    } catch (error) {
      this.log(`nr paragonu: błąd odczytu (${String(error)})`);
      this.buffer.length = 0;
      return { raw: '' };
    }
  }

  // ── operacje fiskalne ─────────────────────────────────────────────────────

  /** Raport dobowy fiskalny (Esc 25H). Drukarka blokuje sprzedaż po 48 h bez raportu. */
  async printDayReport(): Promise<void> {
    await this.send('raport dobowy', cmd.dayReport(), 0, { timeoutMs: this.opts.printTimeoutMs });
  }

  /** Awaryjne anulowanie otwartego paragonu (Esc 23H). Nie rzuca wyjątku. */
  async cancelReceiptSafe(): Promise<boolean> {
    try {
      const result = await this.send('anulowanie paragonu', cmd.cancelReceipt(), 0, { allowNak: true });
      return result.ack;
    } catch (error) {
      this.log(`anulowanie paragonu nie powiodło się: ${String(error)}`);
      return false;
    }
  }

  /**
   * Pełny cykl paragonu: otwarcie → pozycje → koniec pozycji → płatności → wydruk.
   * Przy błędzie w trakcie próbuje anulować paragon, żeby drukarka nie została z otwartą transakcją.
   */
  async printReceipt(request: ReceiptRequest): Promise<ReceiptResult> {
    const prepared = prepareReceipt(request);
    let receiptOpen = false;
    try {
      await this.send('otwarcie paragonu', cmd.openReceipt());
      receiptOpen = true;

      if (prepared.buyerNip) {
        await this.setBuyerNip(prepared.buyerNip);
      }

      for (const [index, item] of prepared.items.entries()) {
        await this.sendSilent(`pozycja ${index + 1} (${item.name})`, cmd.saleItem(item));
      }

      await this.sendSilent('koniec pozycji', cmd.endItems(prepared.totalGrosze));

      for (const [index, payment] of prepared.payments.entries()) {
        await this.sendSilent(
          `płatność ${payment.name} ${(payment.grosze / 100).toFixed(2)} zł`,
          cmd.payment(index + 1, payment.name, payment.grosze),
        );
      }

      try {
        await this.send('zamknięcie paragonu', cmd.closeReceipt(), 0, {
          timeoutMs: this.opts.printTimeoutMs,
        });
      } catch (error) {
        if (error instanceof ElzabNakError) {
          // Zweryfikowane na Zeta: niezgodność sumy/pozycji wychodzi dopiero tutaj,
          // a drukarka sama unieważnia paragon (dalsze Esc 23H też zwróci NAK).
          receiptOpen = false;
          throw new ElzabError(
            'RECEIPT_CANCELLED',
            'Drukarka unieważniła paragon przy zamykaniu (najczęściej: niezgodność sumy pozycji, nieprawidłowa stawka VAT lub brak papieru). Paragon nie został wydrukowany — na wydruku pojawi się #ANULOWANY#.',
            'NAK on close receipt',
            { ...(error.details ?? {}) },
          );
        }
        throw error;
      }
      receiptOpen = false;

      const number = await this.getLastReceiptNumber();
      return {
        ok: true,
        receiptNumber: number.value,
        totalGrosze: prepared.totalGrosze,
        trace: [...this.trace],
      };
    } catch (error) {
      if (receiptOpen) {
        this.log('błąd w trakcie paragonu — próba anulowania');
        await this.cancelReceiptSafe();
      }
      if (error instanceof ElzabError) {
        (error as ElzabError & { trace?: string[] }).trace = [...this.trace];
      }
      throw error;
    }
  }

  /** Podgląd przygotowanego paragonu bez wysyłki (do testów i debugowania). */
  static prepare(request: ReceiptRequest): PreparedReceipt {
    return prepareReceipt(request);
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}

/** Zegar: 10 bajtów jako pary (dziesiątki, jedności): rok, miesiąc, dzień, godzina, minuta. */
export function parseClock(payload: Uint8Array): PrinterClock {
  if (payload.length < 10) {
    throw new ElzabProtocolError('odczyt zegara', `oczekiwano 10 bajtów, otrzymano ${payload.length}`);
  }
  const pair = (i: number) => payload[i] * 10 + payload[i + 1];
  const year = 2000 + pair(0);
  const month = pair(2);
  const day = pair(4);
  const hour = pair(6);
  const minute = pair(8);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    year,
    month,
    day,
    hour,
    minute,
    iso: `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`,
  };
}

/**
 * Numer ostatniego paragonu (Esc 66H).
 * Zweryfikowane na Zeta Online: ACK + 2 bajty little-endian (00 00 → 0, 01 00 → 1).
 * Dla bezpieczeństwa obsługujemy też wariant 4-bajtowy.
 */
export function parseCounter(payload: Uint8Array): number | undefined {
  if (payload.length >= 4) {
    return payload[0] + payload[1] * 0x100 + payload[2] * 0x10000 + payload[3] * 0x1000000;
  }
  if (payload.length >= 2) {
    return payload[0] + payload[1] * 0x100;
  }
  if (payload.length === 1) return payload[0];
  return undefined;
}
