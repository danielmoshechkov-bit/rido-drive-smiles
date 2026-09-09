import { opisRozmiaru } from './tireStorageFormat';

/**
 * HTML pokwitowania przechowania — jeden dokument, dwa zastosowania:
 * wydruk z przegladarki i zalacznik PDF w mailu.
 *
 * Wlasny plik, bo korzysta z niego panel (wydruk) i okno potwierdzenia
 * (mail). Trzymanie go w panelu oznaczaloby, ze okno importuje panel,
 * a panel okno — uklad, ktory potrafi dac `undefined` w przegladarce
 * mimo poprawnej kompilacji.
 */
export function buildStorageReceiptHtml(
  record: any,
  kind: 'przyjęcia' | 'wydania',
  header: {
    companyName?: string | null; nip?: string | null; address?: string | null;
    logoUrl?: string | null; phone?: string | null; website?: string | null;
  } = {},
) {
  const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const client = record.client_name
    || [record.workshop_clients?.first_name, record.workshop_clients?.last_name].filter(Boolean).join(' ')
    || '—';
  const vehicle = record.workshop_vehicles
    ? [record.workshop_vehicles.brand, record.workshop_vehicles.model, record.workshop_vehicles.plate].filter(Boolean).join(' ')
    : '—';
  const seasons: Record<string, string> = { letnie: 'letnie', zimowe: 'zimowe', calorocze: 'całoroczne' };
  const row = (label: string, value: unknown) =>
    `<tr><td class="k">${esc(label)}</td><td>${esc(value) || '—'}</td></tr>`;

  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>Pokwitowanie ${esc(kind)} opon</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #111; font-size: 13px; }
  .banner { border: 2px solid #111; padding: 8px 12px; text-align: center; font-weight: 700; letter-spacing: 1px; }
  h1 { font-size: 16px; margin: 18px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  td { border-bottom: 1px solid #ddd; padding: 6px 4px; vertical-align: top; }
  td.k { width: 34%; color: #555; }
  .sign { margin-top: 46px; display: flex; justify-content: space-between; gap: 40px; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 6px; text-align: center; font-size: 11px; color: #555; }
  .footer { margin-top: 20px; font-size: 11px; color: #555; line-height: 1.6; }
  /* Logo stalo nad banerem i zabieralo gorna czesc kartki. Teraz stoi obok
     danych firmy i dopasowuje sie wysokoscia do tego bloku. */
  .naglowek { display: flex; align-items: stretch; justify-content: space-between;
              gap: 20px; margin: 14px 0 4px; }
  .firma { font-size: 12px; color: #555; line-height: 1.55; }
  .firma .nazwa { font-size: 16px; font-weight: 700; color: #111; margin-bottom: 3px; }
  .logo { display: flex; align-items: center; justify-content: flex-end; flex-shrink: 0; }
  .logo img { max-height: 74px; max-width: 190px; object-fit: contain; }
  @media print { body { margin: 10mm; } }
</style></head>
<body>
  <div class="banner">POKWITOWANIE ${esc(kind.toUpperCase())} OPON DO PRZECHOWANIA</div>
  <div class="naglowek">
    <div class="firma">
      ${header.companyName ? `<div class="nazwa">${esc(header.companyName)}</div>` : ''}
      ${header.address ? `<div>${esc(header.address)}</div>` : ''}
      ${header.phone ? `<div>tel. ${esc(header.phone)}</div>` : ''}
      ${header.website ? `<div>${esc(header.website)}</div>` : ''}
      ${header.nip ? `<div>NIP: ${esc(header.nip)}</div>` : ''}
    </div>
    ${header.logoUrl ? `<div class="logo"><img src="${esc(header.logoUrl)}" alt="" /></div>` : ''}
  </div>
  <h1>Nr miejsca: ${esc(record.storage_number || '—')}</h1>
  <table>
    ${row('Klient', client)}
    ${row('Telefon', record.client_phone)}
    ${row('Pojazd', vehicle)}
    ${row('Opony', [record.tire_brand, record.tire_model].filter(Boolean).join(' '))}
    ${row('Rozmiar', opisRozmiaru(record))}
    ${(() => {
      const b = [
        ['LP', record.tread_lp_mm], ['PP', record.tread_pp_mm],
        ['LT', record.tread_lt_mm], ['PT', record.tread_pt_mm],
      ].filter(([, v]) => v != null);
      return b.length ? row('Bieżnik', b.map(([k, v]) => `${k}: ${v} mm`).join(' · ')) : '';
    })()}
    ${row('Sezon', seasons[record.season] ?? record.season)}
    ${row('Liczba sztuk', record.quantity ?? 4)}
    ${row('Głębokość bieżnika', record.tread_depth_mm ? `${record.tread_depth_mm} mm` : '')}
    ${row('DOT', record.dot_code)}
    ${row('Stan', record.condition)}
    ${row('Data przyjęcia', record.stored_at ? new Date(record.stored_at).toLocaleDateString('pl-PL') : '')}
    ${row('Termin odbioru', record.pickup_deadline ? new Date(record.pickup_deadline).toLocaleDateString('pl-PL') : '')}
    ${kind === 'wydania' ? row('Data wydania', record.pickup_at ? new Date(record.pickup_at).toLocaleDateString('pl-PL') : new Date().toLocaleDateString('pl-PL')) : ''}
    ${row('Koszt przechowania', record.cena_za_okres && record.okres_miesiecy
      ? `${Number(record.cena_za_okres).toFixed(2)} zł za ${record.okres_miesiecy} mies. (każdy rozpoczęty okres płatny)`
      : record.storage_cost ? `${Number(record.storage_cost).toFixed(2)} zł` : '')}
    ${row('Lokalizacja', record.location_name)}
    ${row('Uwagi', record.notes)}
  </table>
  <div class="sign">
    <div>podpis klienta</div>
    <div>podpis przyjmującego</div>
  </div>
  <div class="footer">
    Dokument potwierdza ${kind === 'przyjęcia' ? 'przyjęcie opon do przechowania' : 'wydanie opon właścicielowi'}.
    Wygenerowano w GetRido: ${esc(new Date().toLocaleString('pl-PL'))}
  </div>
</body></html>`;

  return html;
}

