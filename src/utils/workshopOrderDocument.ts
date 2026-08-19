import { supabase } from '@/integrations/supabase/client';
import type { InvoiceData, InvoiceItem } from '@/utils/invoiceHtmlGenerator';
import { rozbijAdres } from '@/utils/adresKlienta';
import { tylkoWycenione } from '@/lib/orderItemPricing';
import { sortWorkshopOrderItems } from '@/hooks/useWorkshop';
import { robociznaPrzedCzesciami } from '@/lib/kolejnoscPozycji';

/**
 * Dokument warsztatowy dla klienta — kosztorys naprawy i potwierdzenie wykonania.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO TO ISTNIEJE
 * ═══════════════════════════════════════════════════════════════════════════
 * Warsztat wydaje klientowi DWIE kartki tej samej sprawy: najpierw kosztorys
 * naprawy, potem potwierdzenie wykonania usługi (albo fakturę). To ten sam
 * dokument — ta sama firma, ten sam pojazd, te same pozycje — różniący się
 * tytułem i tym, czy mówi o pracy planowanej, czy wykonanej.
 *
 * Do 19.08.2026 tak nie było. Potwierdzenie szło przez generator faktur, a
 * „Podgląd / Drukuj / Pobierz" przy kosztorysie otwierało STRONĘ KLIENTA
 * (`/warsztat/klient/<kod>`) — czyli podgląd tego, co klient dostaje SMS-em,
 * z zakładkami, banerem „Podgląd menedżera" i przyciskami do podpisu. Na
 * drukarce wychodziły z tego trzy strony zrzutu ekranu zamiast dokumentu.
 *
 * Teraz oba dokumenty składa ta sama funkcja i rysuje ten sam generator.
 */

export type RodzajDokumentu = 'repair_estimate' | 'service_confirmation';

/** Dane sprzedawcy (nagłówek dokumentu) dla zalogowanego warsztatu. */
export async function daneSprzedawcy() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { companyData: null as any, logoUrl: '' };

  const { data: cs } = await (supabase as any)
    .from('company_settings')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle();
  let companyData: any = cs;
  let logoUrl = '';

  const { data: invCompany } = await (supabase as any)
    .from('user_invoice_companies')
    .select('logo_url, name, nip, address_street, address_building_number, address_city, address_postal_code, email, phone')
    .eq('user_id', session.user.id)
    .eq('is_default', true)
    .maybeSingle();
  if (invCompany?.logo_url) logoUrl = invCompany.logo_url;
  if (invCompany && !companyData) companyData = invCompany;

  if (!logoUrl) {
    // Konto może mieć więcej niż jeden warsztat (plan Sieci). `maybeSingle`
    // zwraca wtedy BŁĄD, nie pierwszy wiersz — ekran się wywala. Bierzemy
    // najstarszy i tak samo we wszystkich miejscach, żeby różne ekrany
    // nie pokazywały różnych firm.
    const { data: sp } = await supabase
      .from('service_providers').select('logo_url').eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (sp?.logo_url) logoUrl = sp.logo_url;
  }
  if (!logoUrl) {
    const { data: ws } = await (supabase as any)
      .from('workshop_settings').select('logo_url').eq('user_id', session.user.id).maybeSingle();
    if (ws?.logo_url) logoUrl = ws.logo_url;
  }

  return { companyData, logoUrl };
}

/**
 * Stawka VAT pozycji liczona z kwot, nie zgadywana.
 *
 * Wcześniej wpisywaliśmy tu na sztywno „23" — na dokumencie z pozycją zwolnioną
 * albo 8-procentową wychodziła z tego nieprawdziwa tabela stawek.
 */
function stawkaVat(netto: number, brutto: number): string {
  if (!netto) return '23';
  return String(Math.round(((brutto / netto) - 1) * 100));
}

/** Pozycje w tej samej kolejności, w jakiej warsztat widzi je w zleceniu. */
function wgKartyZlecenia(items: any[]): any[] {
  return robociznaPrzedCzesciami(sortWorkshopOrderItems(items));
}

function pozycje(items: any[]): InvoiceItem[] {
  return items.map((item: any) => {
    const qty = item.quantity || 1;
    const unitNet = item.unit_price_net || 0;
    const unitGross = item.unit_price_gross || 0;
    const grossAmount = item.total_gross ?? qty * unitGross;
    const netAmount = item.total_net ?? qty * unitNet;
    return {
      name: item.name || '',
      quantity: qty,
      unit: item.unit || 'usł.',
      unit_net_price: unitNet,
      vat_rate: stawkaVat(netAmount, grossAmount),
      net_amount: netAmount,
      vat_amount: grossAmount - netAmount,
      gross_amount: grossAmount,
    };
  });
}

/**
 * Składa dokument ze zlecenia warsztatowego.
 *
 * `rodzaj` decyduje wyłącznie o tytule, numerze, dacie i o tym, KTÓRE pozycje
 * wchodzą:
 *   • kosztorys — tylko pozycje WYCENIONE, w tej samej kolejności, co u klienta.
 *     Pozycja bez ceny (NULL) czeka jeszcze na wycenę; na kosztorysie wyszłaby
 *     jako 0,00 zł, czyli „gratis" — i wróciłaby reklamacją, gdy kwota się pojawi.
 *   • potwierdzenie — wszystkie pozycje zlecenia, bo opisuje pracę wykonaną.
 */
export async function zbudujDokumentZlecenia(
  order: any,
  rodzaj: RodzajDokumentu,
): Promise<InvoiceData> {
  const { data: orderItems } = await (supabase as any)
    .from('workshop_order_items')
    .select('*')
    .eq('order_id', order.id)
    .order('sort_order');

  const surowe = orderItems || order.items || [];
  const uporzadkowane = wgKartyZlecenia(surowe);
  const wybrane = rodzaj === 'repair_estimate'
    ? tylkoWycenione(uporzadkowane)
    : uporzadkowane;

  const { companyData, logoUrl } = await daneSprzedawcy();

  const buyer: any = { name: '' };
  if (order.client) {
    buyer.name = order.client.client_type === 'company'
      ? order.client.company_name
      : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim();
    buyer.nip = order.client.nip || '';
    // `order.client.address` to kolumna, której nie ma — kartoteka trzyma adres
    // sklejony w `street`.
    const adres = rozbijAdres(order.client.street);
    buyer.address_street = adres.ulica;
    buyer.address_building_number = adres.numerBudynku;
    buyer.address_apartment_number = adres.numerLokalu;
    buyer.address_city = order.client.city || '';
    buyer.address_postal_code = order.client.postal_code || '';
  }

  const opisPojazdu = order.vehicle
    ? `Pojazd: ${order.vehicle.brand || ''} ${order.vehicle.model || ''}, Nr rej: ${order.vehicle.plate || ''}`
    : '';
  const numerZlecenia = order.order_number ? `Zlecenie nr ${order.order_number}` : '';
  const notatki = [opisPojazdu, numerZlecenia].filter(Boolean).join(' · ');

  /**
   * Data dokumentu.
   *
   * 🔴 Kosztorys opisuje pracę PLANOWANĄ, więc jego datą jest dzień sporządzenia.
   * Potwierdzenie opisuje pracę WYKONANĄ — datą jest dzień zakończenia naprawy.
   * Wszystkie trzy daty były kiedyś ustawiane na dziś i potwierdzenie do naprawy
   * z marca drukowało się z datą sierpniową.
   */
  const data = rodzaj === 'repair_estimate'
    ? new Date().toISOString().split('T')[0]
    : (order.completed_at || order.repaired_at || order.acceptance_date || new Date().toISOString())
        .toString().split('T')[0];

  const prefiks = rodzaj === 'repair_estimate' ? 'KOS' : 'PWU';

  const miasto = companyData?.city || companyData?.address_city || '';

  return {
    invoice_number: `${prefiks}/${order.order_number || 'dok'}`,
    type: rodzaj,
    // „Warszawa, 19.08.2026" zamiast samej daty — dokument mówi, GDZIE go
    // wystawiono, tak jak każdy papier wychodzący z warsztatu.
    issue_place: miasto,
    issue_date: data,
    sale_date: data,
    due_date: data,
    payment_method: 'cash',
    notes: notatki,
    currency: 'PLN',
    paid_amount: 0,
    is_fully_paid: rodzaj === 'service_confirmation',
    items: pozycje(wybrane),
    seller: {
      name: companyData?.company_name || companyData?.name || '',
      nip: companyData?.nip || '',
      address_street: companyData?.street || companyData?.address_street || companyData?.address || '',
      address_building_number: companyData?.building_number || companyData?.address_building_number || '',
      address_apartment_number: companyData?.apartment_number || companyData?.address_apartment_number || '',
      address_city: companyData?.city || companyData?.address_city || '',
      address_postal_code: companyData?.postal_code || companyData?.address_postal_code || '',
      email: companyData?.email || '',
      phone: companyData?.phone || '',
      bank_name: companyData?.bank_name || '',
      bank_account: companyData?.bank_account || '',
      logo_url: logoUrl || companyData?.logo_url || '',
    },
    buyer,
  };
}
