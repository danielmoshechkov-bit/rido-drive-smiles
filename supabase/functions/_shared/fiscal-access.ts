/**
 * Wspólna warstwa dostępu dla edge functions modułu fiskalnego.
 *
 * Uwaga: config.toml ustawia verify_jwt = false, więc KAŻDA funkcja musi sama
 * uwierzytelnić wywołującego. Dopuszczamy dwa rodzaje wywołań:
 *   • użytkownik (JWT z sesji) — sprawdzamy członkostwo w tenancie,
 *   • wywołanie wewnętrzne kluczem service_role (cron, auto-raport dobowy) —
 *     wtedy providerId musi być podany wprost.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';
import type { Codepage, VatMap } from './elzab/index.ts';

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Odpowiedź błędu w jednolitym formacie: kod techniczny + komunikat po polsku. */
export const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  json({ ok: false, code, message, ...extra }, status);

export interface Caller {
  userId: string | null;
  /** true = wywołanie wewnętrzne kluczem service_role. */
  isService: boolean;
}

export interface FiscalPrinterRow {
  id: string;
  provider_id: string;
  name: string;
  host: string;
  port: number;
  mode: 'training' | 'fiscal';
  vat_map: VatMap;
  codepage: Codepage;
  item_name_length: 28 | 40;
  default_unit: string;
  command_timeout_ms: number;
  is_active: boolean;
  connection_mode: 'direct' | 'tunnel';
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/** Rozpoznaje wywołującego na podstawie nagłówka Authorization. */
export async function resolveCaller(req: Request): Promise<Caller | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return { userId: null, isService: true };
  }

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await userClient.auth.getUser(token);
  return data?.user ? { userId: data.user.id, isService: false } : null;
}

/**
 * Sprawdza, czy użytkownik należy do tenanta (właściciel albo aktywny pracownik).
 * Odpowiednik funkcji SQL is_fiscal_provider_member — tutaj liczone kluczem service_role,
 * bo auth.uid() nie jest dostępne po stronie edge function.
 */
export async function hasProviderAccess(
  admin: SupabaseClient,
  userId: string,
  providerId: string,
): Promise<boolean> {
  const { data: owned } = await admin
    .from('service_providers')
    .select('id')
    .eq('id', providerId)
    .eq('user_id', userId)
    .maybeSingle();
  if (owned) return true;

  const { data: employee } = await admin
    .from('workshop_employees')
    .select('id, is_active')
    .eq('provider_id', providerId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(employee && employee.is_active !== false);
}

/** Tenant do użycia: podany wprost albo pierwszy warsztat użytkownika. */
export async function resolveProviderId(
  admin: SupabaseClient,
  caller: Caller,
  requested?: string,
): Promise<{ providerId: string } | { error: Response }> {
  if (caller.isService) {
    if (!requested) {
      return { error: fail(400, 'PROVIDER_REQUIRED', 'Wywołanie wewnętrzne wymaga podania providerId.') };
    }
    return { providerId: requested };
  }

  const userId = caller.userId!;
  if (requested) {
    const allowed = await hasProviderAccess(admin, userId, requested);
    if (!allowed) {
      return { error: fail(403, 'FORBIDDEN', 'Brak dostępu do tej firmy.') };
    }
    return { providerId: requested };
  }

  const { data } = await admin
    .from('service_providers')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) {
    return { error: fail(403, 'NO_PROVIDER', 'Twoje konto nie jest powiązane z żadną firmą.') };
  }
  return { providerId: data.id as string };
}

/** Konfiguracja drukarki: wskazana albo domyślna aktywna dla tenanta. */
export async function loadPrinter(
  admin: SupabaseClient,
  providerId: string,
  printerId?: string,
): Promise<{ printer: FiscalPrinterRow } | { error: Response }> {
  let query = admin.from('fiscal_printers').select('*').eq('provider_id', providerId).eq('is_active', true);
  query = printerId ? query.eq('id', printerId) : query.eq('is_default', true);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) {
    return { error: fail(500, 'DB_ERROR', `Nie udało się odczytać konfiguracji drukarki: ${error.message}`) };
  }
  if (!data) {
    return {
      error: fail(
        404,
        'NO_PRINTER',
        'Nie skonfigurowano drukarki fiskalnej. Dodaj ją w Ustawieniach → Fiskalizacja.',
      ),
    };
  }
  return { printer: data as unknown as FiscalPrinterRow };
}

/** Zapisuje wynik kontaktu z drukarką (heartbeat pokazywany w UI). */
export async function updatePrinterStatus(
  admin: SupabaseClient,
  printerId: string,
  patch: {
    status: 'online' | 'offline' | 'error';
    message?: string | null;
    clock?: string | null;
    dayReportAt?: string | null;
  },
): Promise<void> {
  const update: Record<string, unknown> = {
    last_status: patch.status,
    last_status_message: patch.message ?? null,
  };
  if (patch.status === 'online') update.last_seen_at = new Date().toISOString();
  if (patch.clock !== undefined) update.last_clock = patch.clock;
  if (patch.dayReportAt) update.last_day_report_at = patch.dayReportAt;

  await admin.from('fiscal_printers').update(update).eq('id', printerId);
}

export interface ExistingReceipt {
  id: string;
  status: string;
  printer_receipt_number: number | null;
  total_grosze: number;
  printed_at: string | null;
  created_at: string;
  printer_number_before: number | null;
}

/**
 * Szuka paragonu, który blokuje ponowną fiskalizację dokumentu.
 * Blokują wyłącznie statusy 'printed' (paragon wyszedł) i 'printing' (trwa rezerwacja).
 * 'failed' i 'cancelled' oznaczają, że obrót NIE został zarejestrowany — wtedy wolno ponowić.
 */
export async function findBlockingReceipt(
  admin: SupabaseClient,
  documentType: string,
  documentId: string,
): Promise<ExistingReceipt | null> {
  const { data } = await admin
    .from('fiscal_receipts')
    .select('id, status, printer_receipt_number, total_grosze, printed_at, created_at, printer_number_before')
    .eq('document_type', documentType)
    .eq('document_id', documentId)
    .in('status', ['printing', 'printed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ExistingReceipt) ?? null;
}

/** Ile minut wisi rezerwacja — po tym czasie UI proponuje rozstrzygnięcie. */
export const STALE_PRINTING_MINUTES = 5;

export function isStalePrinting(receipt: ExistingReceipt): boolean {
  if (receipt.status !== 'printing') return false;
  return Date.now() - new Date(receipt.created_at).getTime() > STALE_PRINTING_MINUTES * 60_000;
}

/** Odmowa ponownej fiskalizacji — z danymi paragonu, który już istnieje. */
export function alreadyFiscalizedResponse(receipt: ExistingReceipt): Response {
  if (receipt.status === 'printing') {
    const stale = isStalePrinting(receipt);
    return json(
      {
        ok: false,
        code: stale ? 'FISCALIZATION_STUCK' : 'FISCALIZATION_IN_PROGRESS',
        message: stale
          ? 'Poprzednia próba fiskalizacji nie zakończyła się jednoznacznie. Sprawdź, czy paragon wyszedł z drukarki, i rozstrzygnij ją przed kolejną próbą.'
          : 'Trwa już fiskalizacja tego dokumentu. Poczekaj na zakończenie wydruku.',
        receipt,
      },
      409,
    );
  }

  const when = receipt.printed_at ?? receipt.created_at;
  const date = new Date(when).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  return json(
    {
      ok: false,
      code: 'ALREADY_FISCALIZED',
      message:
        `Do tego dokumentu wystawiono już paragon fiskalny nr ${receipt.printer_receipt_number ?? '—'} ` +
        `dnia ${date} na kwotę ${(receipt.total_grosze / 100).toFixed(2)} zł — nie można wystawić drugiego. ` +
        'Użyj opcji „Drukuj kopię".',
      receipt,
    },
    409,
  );
}

/** Czy błąd pochodzi z unikalnego indeksu blokującego podwójną fiskalizację. */
export function isDuplicateReceiptError(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '23505' || Boolean(error?.message?.includes('idx_fiscal_receipts_one_per_document'));
}

/** Wspólna obsługa preflight CORS. */
export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null;
}
