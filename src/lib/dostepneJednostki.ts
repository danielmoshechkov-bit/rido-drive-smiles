import { supabase } from '@/integrations/supabase/client';

/**
 * Ile jednostek klient realnie może wydać — JEDNO miejsce dla całego interfejsu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POWÓD POWSTANIA (17.08.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * Jedno konto pokazywało trzy różne salda sprawdzeń VIN w tej samej aplikacji:
 *   • 58 — stan faktyczny w `billing_addon_packs`,
 *   • 39 — modal „Dodaj nowy pojazd", czytający `vehicle_lookup_credits`,
 *          czyli STARE SALDO OSOBISTE użytkownika,
 *   • 0  — górny pasek, który szedł przez `check_usage` (wtedy jeszcze
 *          zwracające zero przy braku subskrypcji).
 *
 * Licznik, który kłamie, jest gorszy niż jego brak: klient widzi trzy liczby
 * i przestaje ufać wszystkim, także tym poprawnym. Dlatego nie poprawiamy
 * liczników po kolei — zostaje jedna funkcja i wszyscy ją wołają.
 *
 * ŹRÓDŁEM PRAWDY JEST `check_usage`: pula z planu plus paczki, po odjęciu
 * zużycia. To ta sama funkcja, którą przy wydawaniu jednostki pyta
 * `billing_consume`, więc licznik i wysyłka nie mogą się rozjechać.
 */

/** `null` znaczy „bez limitu w planie" — interfejs pokazuje wtedy znak nieskończoności. */
export type Dostepne = number | null;

/**
 * Warsztat zalogowanego użytkownika (najstarszy, gdy jest ich kilka).
 *
 * Kolejność `created_at` powtórzona wszędzie tak samo — inaczej różne ekrany
 * pokazywałyby salda różnych firm tego samego właściciela.
 */
export async function warsztatUzytkownika(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('service_providers')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function przezCheckUsage(providerId: string, cecha: string): Promise<Dostepne> {
  const { data, error } = await (supabase as any).rpc('check_usage', {
    p_subscriber_type: 'service_provider',
    p_subscriber_id: providerId,
    p_feature_key: cecha,
    p_amount: 1,
  });

  if (error) {
    // Fail-closed w liczniku: lepiej pokazać zero i pozwolić klientowi
    // doładować, niż pokazać liczbę, której nie da się wydać.
    console.warn('dostepneJednostki:', error.message);
    return 0;
  }

  const stan = data as Record<string, unknown> | null;
  if (!stan) return 0;
  if (stan.reason === 'unlimited') return null;

  const limit = Number(stan.limit ?? 0);
  const uzyte = Number(stan.used ?? 0);
  const paczki = Number(stan.packs_remaining ?? 0);
  return Math.max(limit - uzyte, 0) + paczki;
}

/**
 * Dostępne jednostki DOWOLNEJ cechy rozliczanej.
 *
 * Uogólnienie `dostepneSprawdzeniaVin` i `dostepneSms`, żeby kolejna jednostka
 * (minuty agenta, pytania AI) nie wymagała pisania trzeciej kopii tego samego.
 * Obie funkcje niżej zostają jako nazwane skróty — czytelniej w miejscu użycia.
 */
export async function dostepneJednostkiCechy(userId: string, cecha: string): Promise<Dostepne> {
  const providerId = await warsztatUzytkownika(userId);

  // Bez warsztatu jedyną jednostką z osobnym saldem są sprawdzenia pojazdu
  // (portal klienta, flota). Reszta jest rozliczana wyłącznie na warsztacie.
  if (!providerId) {
    if (cecha !== 'vehicle_lookup') return 0;
    const { data } = await supabase
      .from('vehicle_lookup_credits')
      .select('remaining_credits')
      .eq('user_id', userId)
      .maybeSingle();
    return Number(data?.remaining_credits ?? 0);
  }

  return przezCheckUsage(providerId, cecha);
}

/**
 * Sprawdzenia pojazdu dostępne dla zalogowanego użytkownika.
 *
 * Użytkownik BEZ warsztatu (portal klienta, flota) ma nadal własne saldo
 * w `vehicle_lookup_credits` i to ono jest dla niego prawdą — migracja 4.12
 * przeniosła do puli firmy wyłącznie kredyty WŁAŚCICIELI warsztatów.
 */
export const dostepneSprawdzeniaVin = (userId: string) =>
  dostepneJednostkiCechy(userId, 'vehicle_lookup');

/** SMS-y dostępne dla warsztatu zalogowanego użytkownika. */
export const dostepneSms = (userId: string) =>
  dostepneJednostkiCechy(userId, 'sms');
