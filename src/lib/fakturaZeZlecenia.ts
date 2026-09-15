/**
 * PRZYGOTOWANIE FAKTURY ZE ZLECENIA WARSZTATU — JEDNO MIEJSCE NA TĘ DECYZJĘ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO WYCIĄGNIĘTE Z `WorkshopOrdersList`
 * ═══════════════════════════════════════════════════════════════════════════
 * Te same dokumenty wystawia się dziś z dwóch miejsc: z listy zleceń i z historii
 * zleceń przy pojeździe. Druga kopia tego składania znaczyłaby, że następna
 * poprawka (a były już dwie, obie kosztowne — patrz niżej) trafia do jednej
 * z nich, a klient wystawiający dokument drugą drogą dostaje starą usterkę.
 *
 * 🔴 DWIE POPRAWKI, KTÓRE MUSZĄ ZOSTAĆ W JEDNYM MIEJSCU:
 *
 * 1. `deleted_at IS NULL` przy szukaniu istniejącej faktury. Kasowanie faktury
 *    jest MIĘKKIE. Bez tego warunku warsztat, który skasował błędną fakturę,
 *    NIE MÓGŁ wystawić nowej — system pokazywał mu tę usuniętą.
 * 2. Adres nabywcy siedzi w `street` jednym ciągiem (ulica, numer domu i lokalu).
 *    Faktura — i KSeF — potrzebują ich osobno. Zanim to rozbito, na dokument
 *    szło samo miasto i kod, a użytkownik przy KAŻDEJ fakturze klikał lupę
 *    przy NIP-ie, mimo że dane leżały w kartotece.
 */

import { supabase } from '@/integrations/supabase/client';
import { rozbijAdres } from '@/utils/adresKlienta';

export interface PrzygotowanaFaktura {
  pozycje: Array<{
    name: string;
    quantity: number;
    unit: string;
    unit_net_price: number;
    unit_gross_price: number;
    vat_rate: string;
    discount_percent: number;
  }>;
  nabywca: Record<string, string>;
  uwagiPojazd: string;
  uwagiZlecenie: string;
}

/**
 * Faktura JUŻ WYSTAWIONA do tego zlecenia — albo `null`.
 *
 * To jest funkcja, na której stoi „wystaw ponownie tę samą fakturę": klient
 * dzwoni po dokument sprzed pół roku, a system ma go ODNALEŹĆ, nie wystawić
 * drugiego z nowym numerem.
 *
 * Korekty pomijamy świadomie — korekta jest osobnym dokumentem do faktury,
 * a nie tą fakturą.
 */
export async function znajdzFaktureZlecenia(orderId: string): Promise<any | null> {
  const { data } = await (supabase as any)
    .from('user_invoices')
    .select('*')
    .eq('workshop_order_id', orderId)
    .neq('is_correction', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Dane do NOWEJ faktury, gdy do zlecenia nie wystawiono jeszcze żadnej. */
export async function przygotujFaktureZeZlecenia(order: any): Promise<PrzygotowanaFaktura> {
  const { data: pozycjeZlecenia } = await (supabase as any)
    .from('workshop_order_items')
    .select('*')
    .eq('order_id', order.id)
    .order('sort_order');

  // Puste wiersze zestawienia (bez nazwy i bez ceny) NIE wchodzą na fakturę —
  // lądowały na PDF-ie i w KSeF jako „1 | 0,00 zł" bez nazwy.
  const pozycje = (pozycjeZlecenia || [])
    .filter((i: any) => (i.name || '').trim() || i.unit_price_net || i.unit_price_gross)
    .map((i: any) => ({
      name: i.name || '',
      quantity: i.quantity || 1,
      unit: i.unit || 'usł.',
      unit_net_price: i.unit_price_net || 0,
      unit_gross_price: i.unit_price_gross || 0,
      vat_rate: '23',
      discount_percent: i.discount_percent || 0,
    }));

  const nabywca: Record<string, string> = {};
  if (order.client) {
    nabywca.name = order.client.client_type === 'company'
      ? order.client.company_name
      : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim();
    nabywca.nip = order.client.nip || '';
    const adres = rozbijAdres(order.client.street);
    nabywca.address_street = adres.ulica;
    nabywca.address_building_number = adres.numerBudynku;
    nabywca.address_apartment_number = adres.numerLokalu;
    nabywca.address_city = order.client.city || '';
    nabywca.address_postal_code = order.client.postal_code || '';
    nabywca.country = order.client.country || 'Polska';
    nabywca.email = order.client.email || '';
  }

  const uwagiPojazd = order.vehicle
    ? [
        order.vehicle.brand ? `Marka: ${order.vehicle.brand}` : '',
        order.vehicle.model ? `Model: ${order.vehicle.model}` : '',
        order.vehicle.plate ? `Nr rej: ${order.vehicle.plate}` : '',
        order.vehicle.vin ? `VIN: ${order.vehicle.vin}` : '',
      ].filter(Boolean).join(', ')
    : '';

  return {
    pozycje,
    nabywca,
    uwagiPojazd,
    uwagiZlecenie: order.order_number ? `Do zlecenia: ${order.order_number}` : '',
  };
}
