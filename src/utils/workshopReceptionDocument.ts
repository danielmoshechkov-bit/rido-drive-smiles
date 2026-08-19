import { supabase } from '@/integrations/supabase/client';
import { daneSprzedawcy } from '@/utils/workshopOrderDocument';
import { sortWorkshopOrderItems } from '@/hooks/useWorkshop';
import { toRobocizna } from '@/lib/kolejnoscPozycji';
import type { DaneProtokolu, ZdjecieProtokolu } from '@/utils/receptionProtocolHtml';

/**
 * Zebranie danych do protokołu przyjęcia pojazdu.
 *
 * Wszystko, co ma być na kartce, musi być W KARTCE: zdjęcia i logo lądują
 * w dokumencie jako data-URI. Serwerowy generator PDF nie ma sesji użytkownika,
 * więc podpisanego linku do prywatnego kubełka i tak by nie otworzył — a wydruk
 * z pustymi ramkami zamiast zdjęć jest gorszy niż wydruk bez zdjęć.
 */

/** Pobiera plik i zamienia na data-URI. Zwraca null, gdy się nie udało. */
async function jakoDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Zdjęcia z przyjęcia — pomniejszone.
 *
 * Bierzemy wersję przeskalowaną przez Supabase (szerokość 900), a nie oryginał
 * z telefonu: sześć zdjęć po 4 MB w jednym dokumencie to PDF, którego nie da
 * się wysłać mailem ani wydrukować bez czekania.
 */
async function zdjeciaPrzyjecia(orderId: string): Promise<ZdjecieProtokolu[]> {
  const { data: pliki } = await (supabase as any)
    .from('workshop_order_files')
    .select('file_name, file_url, file_type, created_at')
    .eq('order_id', orderId)
    .eq('file_type', 'intake_photo')
    .order('created_at');

  const wynik: ZdjecieProtokolu[] = [];
  for (const p of pliki || []) {
    const { data: sig } = await supabase.storage
      .from('workshop-order-photos')
      .createSignedUrl(p.file_url, 3600, { transform: { width: 900, quality: 70 } });
    if (!sig?.signedUrl) continue;
    const obraz = await jakoDataUri(sig.signedUrl);
    if (!obraz) continue;
    wynik.push({ podpis: String(p.file_name || '').replace(/\.[a-z0-9]+$/i, ''), obraz });
  }
  return wynik;
}

export async function zbudujProtokolPrzyjecia(order: any): Promise<DaneProtokolu> {
  const { companyData, logoUrl } = await daneSprzedawcy();

  const { data: pozycje } = await (supabase as any)
    .from('workshop_order_items')
    .select('name, item_type, sort_order, created_at')
    .eq('order_id', order.id)
    .order('sort_order');

  // Na protokole jest ZAKRES PRAC, nie lista części — o częściach klient
  // dowiaduje się z kosztorysu, razem z ceną.
  const zakres = sortWorkshopOrderItems(pozycje || order.items || [])
    .filter(toRobocizna)
    .map((i: any) => String(i?.name || '').trim())
    .filter(Boolean);

  const klientNazwa = order.client
    ? (order.client.client_type === 'company'
      ? order.client.company_name
      : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim())
    : '';

  const adresWarsztatu = [
    [companyData?.street || companyData?.address_street || companyData?.address, companyData?.building_number]
      .filter(Boolean).join(' '),
    [companyData?.postal_code || companyData?.address_postal_code, companyData?.city || companyData?.address_city]
      .filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');

  const logo = logoUrl || companyData?.logo_url || '';

  return {
    numer: `PP/${order.order_number || 'dok'}`,
    // Protokół opisuje chwilę PRZYJĘCIA auta, więc datą jest dzień przyjęcia,
    // a nie dzień, w którym ktoś nacisnął „Drukuj".
    data: (order.acceptance_date || order.created_at || new Date().toISOString()).toString(),
    miasto: companyData?.city || companyData?.address_city || '',
    logo: (logo && (await jakoDataUri(logo))) || logo || '',
    warsztat: {
      nazwa: companyData?.company_name || companyData?.name || '',
      nip: companyData?.nip || '',
      adres: adresWarsztatu,
      telefon: companyData?.phone || '',
      email: companyData?.email || '',
    },
    klient: {
      nazwa: klientNazwa,
      nip: order.client?.nip || '',
      adres: [order.client?.street, [order.client?.postal_code, order.client?.city].filter(Boolean).join(' ')]
        .filter(Boolean).join(', '),
      telefon: order.client?.phone || '',
      email: order.client?.email || '',
    },
    pojazd: {
      marka: order.vehicle?.brand || '',
      model: order.vehicle?.model || '',
      nrRej: order.vehicle?.plate || '',
      vin: order.vehicle?.vin || '',
      rocznik: order.vehicle?.year || '',
      przebieg: order.mileage || '',
      poziomPaliwa: order.fuel_level || '',
    },
    opisZlecenia: order.description || '',
    opisUszkodzen: order.damage_description || '',
    zakres,
    // Te same pięć ustaleń, które warsztat zaznacza przy zakładaniu zlecenia
    // i które klient widzi na swojej karcie — kolejność ta sama, żeby dało się
    // porównać kartkę z ekranem bez szukania.
    ustalenia: [
      { etykieta: 'Zgoda na jazdę próbną', tak: !!order.test_drive_consent },
      { etykieta: 'Zwrot wymienionych części klientowi', tak: !!order.return_parts_to_client },
      { etykieta: 'Dowód rejestracyjny pozostawiony w warsztacie', tak: !!order.registration_document },
      { etykieta: 'Zgoda na uzupełnienie płynów', tak: !!order.top_up_fluids },
      { etykieta: 'Zgoda na wymianę przepalonych żarówek', tak: !!order.top_up_lights },
    ],
    zdjecia: await zdjeciaPrzyjecia(order.id),
    przyjmujacy: order.worker || '',
  };
}
