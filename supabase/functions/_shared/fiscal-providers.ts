/**
 * Kontrakty dostawców zewnętrznych modułu fiskalnego — SZKIELET (Fazy 2 i 3).
 *
 * Celowo bez implementacji: dostawcy nie są jeszcze wybrani. Interfejsy istnieją po to,
 * żeby reszta modułu (edge functions, UI, tabele) była już napisana „pod wtyczkę",
 * a dołożenie konkretnego dostawcy nie wymagało przeprojektowania przepływu.
 */

import type { ReceiptItem, ReceiptPayment } from './elzab/index.ts';

// ─────────────────────────────────────────────────────────────────────
// FAZA 2 — E-PARAGON
//
// Protokół ElzabESC NIE zawiera komend e-paragonu. Na Zecie e-paragon idzie
// przez protokół STX + repozytorium/HUB:
//   • MojaKasa.Online (ELZAB) — własny HUB producenta,
//   • integrator zewnętrzny (np. Paragony.pl) — API zwraca e-paragon jako JSON/PDF
//     i sam wysyła go klientowi mailem.
//
// TODO(faza-2): po wyborze HUB-a zaimplementować EReceiptProvider i podpiąć go
// w fiscalize-receipt zaraz po udanym wydruku (status w tabeli fiscal_ereceipts).
// Wymagane przed uruchomieniem: zgoda klienta (consent_given) + kanał (e-mail/telefon).
// ─────────────────────────────────────────────────────────────────────

export interface EReceiptRecipient {
  email?: string;
  phone?: string;
  /** Bez zgody nie wysyłamy — pole zapisywane w fiscal_ereceipts.consent_given. */
  consentGiven: boolean;
}

export interface EReceiptRequest {
  receiptId: string;
  items: ReceiptItem[];
  payments: ReceiptPayment[];
  totalGrosze: number;
  issuedAt: string;
  recipient: EReceiptRecipient;
  /** Numer paragonu z drukarki — spina e-paragon z wydrukiem papierowym. */
  printerReceiptNumber?: number | null;
}

export interface EReceiptResult {
  status: 'sent' | 'delivered' | 'failed' | 'skipped';
  externalId?: string;
  /** Link do e-paragonu (PDF/JSON) po stronie HUB-a. */
  externalUrl?: string;
  error?: string;
  raw?: unknown;
}

export interface EReceiptProvider {
  /** Identyfikator zgodny z kolumną fiscal_ereceipts.provider. */
  readonly name: 'hub_elzab' | 'external_hub' | 'custom';
  send(request: EReceiptRequest): Promise<EReceiptResult>;
  /** Odpytanie o status, gdy HUB potwierdza doręczenie asynchronicznie. */
  checkStatus?(externalId: string): Promise<EReceiptResult>;
}

// ─────────────────────────────────────────────────────────────────────
// FAZA 3 — PŁATNOŚĆ KARTĄ (terminal / SoftPOS)
//
// Docelowy przepływ: GetRido tworzy intencję płatności (fiscal_payment_intents)
// → terminal pobiera kwotę → callback ustawia status 'paid' → DOPIERO WTEDY
// wołamy fiscalize-receipt. Fiskalizacja nigdy nie wyprzedza płatności.
//
// TODO(faza-3): po wyborze dostawcy (PolCard / PeP / eService / SoftPOS)
// zaimplementować PaymentTerminal + edge function przyjmującą callback,
// która po statusie 'paid' wywołuje fiskalizację z paymentRef = intent.id.
// ─────────────────────────────────────────────────────────────────────

export interface PaymentIntentRequest {
  intentId: string;
  amountGrosze: number;
  /** Luźny identyfikator dokumentu — moduł nie zna tabel branżowych. */
  documentType: string;
  documentId?: string;
  terminalId?: string;
  description?: string;
}

export type PaymentIntentStatus = 'pending' | 'authorized' | 'paid' | 'declined' | 'cancelled' | 'expired';

export interface PaymentIntentResult {
  status: PaymentIntentStatus;
  externalId?: string;
  authorizationCode?: string;
  error?: string;
  raw?: unknown;
}

export interface PaymentTerminal {
  readonly name: 'polcard' | 'pep' | 'eservice' | 'softpos' | 'manual';
  /** Wysyła kwotę na terminal i zwraca stan początkowy (zwykle 'pending'). */
  charge(request: PaymentIntentRequest): Promise<PaymentIntentResult>;
  /** Odpytanie o stan transakcji (dla terminali bez callbacku). */
  status?(externalId: string): Promise<PaymentIntentResult>;
  /** Anulowanie/zwrot przed rozliczeniem doby. */
  cancel?(externalId: string): Promise<PaymentIntentResult>;
}
