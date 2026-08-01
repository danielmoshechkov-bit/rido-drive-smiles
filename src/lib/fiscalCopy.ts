/**
 * Wydruk KOPII paragonu — dokument NIEFISKALNY generowany przez GetRido.
 *
 * Dlaczego nie z pamięci drukarki: protokół ElzabESC nie ma komendy wydruku kopii
 * z pamięci chronionej (kopia elektroniczna jest funkcją menu urządzenia, ewentualnie
 * protokołu STX). Ponowne wysłanie paragonu na drukarkę byłoby DRUGĄ SPRZEDAŻĄ i
 * podwoiłoby obrót — dlatego kopia powstaje wyłącznie ze snapshotu w `fiscal_receipts`
 * i nigdy nie dotyka urządzenia fiskalnego.
 */

import type { FiscalCorrectionRow, FiscalReceiptRow, FiscalReturnRow } from '@/hooks/useFiscal';
import { formatPln } from './fiscal';

export interface CopyHeader {
  companyName?: string | null;
  nip?: string | null;
  address?: string | null;
  documentLabel?: string | null;
}

/** Wspólne otwarcie okna wydruku — jedno miejsce na komunikat o blokadzie pop-upów. */
function openPrintWindow(html: string, width = 760): void {
  const printWindow = window.open('', '_blank', `width=${width},height=900`);
  if (!printWindow) {
    throw new Error('Przeglądarka zablokowała okno wydruku. Zezwól na wyskakujące okna dla tej strony.');
  }
  printWindow.document.write(html);
  printWindow.document.close();
}

function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function itemRows(receipt: FiscalReceiptRow): string {
  const items = Array.isArray(receipt.items) ? (receipt.items as any[]) : [];
  return items
    .map((item) => {
      const quantity = Number(item?.quantity) || 0;
      const unitPrice = Number(item?.unitPrice) || 0;
      const value = Math.round(unitPrice * 100 * quantity);
      return `<tr>
        <td>${escapeHtml(item?.name)}</td>
        <td class="num">${quantity} ${escapeHtml(item?.unit ?? '')}</td>
        <td class="num">${formatPln(Math.round(unitPrice * 100))}</td>
        <td class="num">${escapeHtml(item?.vatRate === 'zw' ? 'zw.' : `${item?.vatRate}%`)}</td>
        <td class="num">${formatPln(value)}</td>
      </tr>`;
    })
    .join('');
}

/** Otwiera okno wydruku z kopią paragonu. */
export function printReceiptCopy(receipt: FiscalReceiptRow, header: CopyHeader = {}): void {
  const printedAt = receipt.printed_at ?? receipt.created_at;
  const date = new Date(printedAt).toLocaleString('pl-PL', { dateStyle: 'long', timeStyle: 'short' });
  const payments = Array.isArray(receipt.payments) ? receipt.payments : [];

  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>Kopia paragonu ${escapeHtml(receipt.printer_receipt_number ?? '')}</title>
<style>
  body { font-family: ui-monospace, "SF Mono", Menlo, monospace; margin: 24px; color: #111; }
  .banner { border: 2px solid #111; padding: 8px 12px; text-align: center; font-weight: 700; letter-spacing: 1px; }
  .muted { color: #555; font-size: 12px; }
  h1 { font-size: 16px; margin: 18px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 4px; text-align: left; }
  .num { text-align: right; white-space: nowrap; }
  tfoot td { border-top: 2px solid #111; border-bottom: none; font-weight: 700; font-size: 15px; }
  .footer { margin-top: 24px; font-size: 11px; color: #555; line-height: 1.6; }
  @media print { body { margin: 8mm; } }
</style></head>
<body>
  <div class="banner">KOPIA — DOKUMENT NIEFISKALNY</div>

  <h1>${escapeHtml(header.companyName ?? '')}</h1>
  <div class="muted">
    ${header.address ? escapeHtml(header.address) + '<br>' : ''}
    ${header.nip ? 'NIP: ' + escapeHtml(header.nip) : ''}
  </div>

  <h1>Kopia paragonu fiskalnego nr ${escapeHtml(receipt.printer_receipt_number ?? '—')}</h1>
  <div class="muted">
    Data wystawienia oryginału: ${escapeHtml(date)}<br>
    ${header.documentLabel ? 'Dokument źródłowy: ' + escapeHtml(header.documentLabel) + '<br>' : ''}
    ${receipt.printer_mode === 'training' ? 'Oryginał wydrukowany w trybie szkoleniowym (niefiskalny).<br>' : ''}
  </div>

  <table>
    <thead><tr><th>Nazwa</th><th class="num">Ilość</th><th class="num">Cena</th><th class="num">VAT</th><th class="num">Wartość</th></tr></thead>
    <tbody>${itemRows(receipt)}</tbody>
    <tfoot><tr><td colspan="4">RAZEM</td><td class="num">${formatPln(receipt.total_grosze)}</td></tr></tfoot>
  </table>

  <div class="muted" style="margin-top:10px">
    Forma płatności: ${escapeHtml(payments.map((p) => `${p.name} ${p.amount.toFixed(2)} zł`).join(', ') || '—')}
  </div>

  <div class="footer">
    Niniejszy dokument jest kopią paragonu fiskalnego wystawionego na kasie/drukarce fiskalnej.<br>
    Nie jest dokumentem fiskalnym i nie stanowi podstawy do rejestracji obrotu ani odliczenia podatku.<br>
    Wygenerowano w GetRido: ${escapeHtml(new Date().toLocaleString('pl-PL'))}
  </div>

  <script>window.onload = () => window.print();</script>
</body></html>`;

  openPrintWindow(html, 720);
}


/**
 * PROTOKÓŁ ZWROTU/REKLAMACJI — dokument niefiskalny do podpisu przez klienta.
 * Wymagany przez rozporządzenie o kasach jako część ewidencji zwrotów.
 */
export function printReturnProtocol(
  ret: FiscalReturnRow,
  receipt: FiscalReceiptRow | null,
  header: CopyHeader = {},
): void {
  const items = Array.isArray(ret.items) ? ret.items : [];
  const rows = items
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.name)}</td>
        <td class="num">${item.quantity}</td>
        <td class="num">${formatPln(Math.round(Number(item.unitPrice) * 100))}</td>
        <td class="num">${escapeHtml(item.vatRate === 'zw' ? 'zw.' : `${item.vatRate}%`)}</td>
        <td class="num">${formatPln(Math.round(Number(item.amount) * 100))}</td>
      </tr>`,
    )
    .join('');

  const vatRows = Object.entries(ret.vat_breakdown ?? {})
    .map(([rate, grosze]) => `<tr><td>Stawka ${escapeHtml(rate === 'zw' ? 'zw.' : `${rate}%`)}</td><td class="num">${formatPln(Number(grosze))}</td></tr>`)
    .join('');

  const reasonLabels: Record<string, string> = {
    zwrot_towaru: 'Zwrot towaru',
    reklamacja: 'Reklamacja',
    pomylka_kasjera: 'Pomyłka kasjera',
  };

  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>Protokół zwrotu ${escapeHtml(ret.return_number)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #111; font-size: 13px; }
  .banner { border: 2px solid #111; padding: 8px 12px; text-align: center; font-weight: 700; letter-spacing: 1px; }
  h1 { font-size: 17px; margin: 18px 0 6px; }
  .muted { color: #555; font-size: 12px; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 4px; text-align: left; }
  .num { text-align: right; white-space: nowrap; }
  tfoot td { border-top: 2px solid #111; border-bottom: none; font-weight: 700; font-size: 15px; }
  .sign { margin-top: 46px; display: flex; justify-content: space-between; gap: 40px; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 6px; text-align: center; font-size: 11px; color: #555; }
  .footer { margin-top: 22px; font-size: 11px; color: #555; line-height: 1.6; }
  @media print { body { margin: 10mm; } }
</style></head>
<body>
  <div class="banner">PROTOKÓŁ ZWROTU / REKLAMACJI — DOKUMENT NIEFISKALNY</div>

  <h1>${escapeHtml(header.companyName ?? '')}</h1>
  <div class="muted">
    ${header.address ? escapeHtml(header.address) + '<br>' : ''}
    ${header.nip ? 'NIP: ' + escapeHtml(header.nip) : ''}
  </div>

  <h1>Zwrot nr ${escapeHtml(ret.return_number)}</h1>
  <div class="muted">
    Data zwrotu: ${escapeHtml(new Date(ret.returned_at).toLocaleDateString('pl-PL'))}<br>
    Powód: ${escapeHtml(reasonLabels[ret.reason] ?? ret.reason)}${ret.reason_note ? ' — ' + escapeHtml(ret.reason_note) : ''}<br>
    Paragon fiskalny nr: ${escapeHtml(receipt?.printer_receipt_number ?? '—')}
    z dnia ${escapeHtml(new Date(receipt?.printed_at ?? receipt?.created_at ?? ret.created_at).toLocaleString('pl-PL'))}<br>
    ${header.documentLabel ? 'Dokument źródłowy: ' + escapeHtml(header.documentLabel) + '<br>' : ''}
    Klient: ${escapeHtml(ret.customer_name ?? '—')}${ret.customer_document ? ', dokument: ' + escapeHtml(ret.customer_document) : ''}
  </div>

  <table>
    <thead><tr><th>Pozycja</th><th class="num">Ilość</th><th class="num">Cena</th><th class="num">VAT</th><th class="num">Wartość</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="4">KWOTA ZWROTU</td><td class="num">${formatPln(ret.amount_grosze)}</td></tr></tfoot>
  </table>

  ${vatRows ? `<table style="width:auto;margin-top:14px"><tbody>${vatRows}</tbody></table>` : ''}

  <div class="sign">
    <div>podpis klienta</div>
    <div>podpis sprzedawcy</div>
  </div>

  <div class="footer">
    Zwrot ujęty w ewidencji zwrotów i uznanych reklamacji prowadzonej zgodnie z rozporządzeniem
    w sprawie kas rejestrujących. Oryginalny paragon fiskalny pozostaje bez zmian —
    dokument nie jest dokumentem fiskalnym i nie był drukowany na kasie.<br>
    Wygenerowano w GetRido: ${escapeHtml(new Date().toLocaleString('pl-PL'))}
  </div>

  <script>window.onload = () => window.print();</script>
</body></html>`;

  openPrintWindow(html);
}

/**
 * DOWÓD WEWNĘTRZNY do ewidencji oczywistych pomyłek (odrębnej od ewidencji zwrotów).
 *
 * Rozporządzenie wymaga tu opisu okoliczności i przyczyny pomyłki oraz DOŁĄCZENIA
 * ORYGINAŁU paragonu — nie podpisu klienta (ten jest wymogiem protokołu zwrotu).
 * Dlatego dokument podpisują kasjer i osoba upoważniona, a nie nabywca: pomyłka jest
 * zdarzeniem po stronie sprzedawcy i klient może już dawno wyjść ze sklepu.
 */
export function printCorrectionProtocol(
  correction: FiscalCorrectionRow,
  receipt: FiscalReceiptRow | null,
  header: CopyHeader = {},
): void {
  const items = Array.isArray(correction.items) ? (correction.items as any[]) : [];
  const rows = items
    .map((item) => {
      const quantity = Number(item?.quantity) || 0;
      const unitPrice = Number(item?.unitPrice) || 0;
      return `<tr>
        <td>${escapeHtml(item?.name)}</td>
        <td class="num">${quantity} ${escapeHtml(item?.unit ?? '')}</td>
        <td class="num">${formatPln(Math.round(unitPrice * 100))}</td>
        <td class="num">${escapeHtml(item?.vatRate === 'zw' ? 'zw.' : `${item?.vatRate}%`)}</td>
        <td class="num">${formatPln(Math.round(unitPrice * 100 * quantity))}</td>
      </tr>`;
    })
    .join('');

  const vatRows = Object.entries(correction.vat_breakdown ?? {})
    .map(
      ([rate, grosze]) =>
        `<tr><td>Stawka ${escapeHtml(rate === 'zw' ? 'zw.' : `${rate}%`)}</td><td class="num">${formatPln(Number(grosze))}</td></tr>`,
    )
    .join('');

  const saleDate = correction.sale_date ?? receipt?.printed_at ?? receipt?.created_at ?? correction.created_at;

  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>Dowód wewnętrzny ${escapeHtml(correction.correction_number)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #111; font-size: 13px; }
  .banner { border: 2px solid #111; padding: 8px 12px; text-align: center; font-weight: 700; letter-spacing: 1px; }
  h1 { font-size: 17px; margin: 18px 0 6px; }
  .muted { color: #555; font-size: 12px; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 4px; text-align: left; }
  .num { text-align: right; white-space: nowrap; }
  tfoot td { border-top: 2px solid #111; border-bottom: none; font-weight: 700; font-size: 15px; }
  .box { margin-top: 16px; border: 1px solid #111; padding: 10px 12px; }
  .box b { display: block; margin-bottom: 4px; font-size: 12px; }
  .attach { margin-top: 16px; border: 1px dashed #111; padding: 10px 12px; font-size: 12px; }
  .sign { margin-top: 46px; display: flex; justify-content: space-between; gap: 40px; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 6px; text-align: center; font-size: 11px; color: #555; }
  .footer { margin-top: 22px; font-size: 11px; color: #555; line-height: 1.6; }
  @media print { body { margin: 10mm; } }
</style></head>
<body>
  <div class="banner">DOWÓD WEWNĘTRZNY — EWIDENCJA OCZYWISTYCH POMYŁEK</div>

  <h1>${escapeHtml(header.companyName ?? '')}</h1>
  <div class="muted">
    ${header.address ? escapeHtml(header.address) + '<br>' : ''}
    ${header.nip ? 'NIP: ' + escapeHtml(header.nip) : ''}
  </div>

  <h1>Korekta pomyłki nr ${escapeHtml(correction.correction_number)}</h1>
  <div class="muted">
    Data ujęcia w ewidencji: ${escapeHtml(new Date(correction.corrected_at).toLocaleDateString('pl-PL'))}<br>
    Paragon fiskalny nr: ${escapeHtml(correction.receipt_number ?? receipt?.printer_receipt_number ?? '—')}
    z dnia ${escapeHtml(new Date(saleDate).toLocaleString('pl-PL'))}<br>
    ${header.documentLabel ? 'Dokument źródłowy: ' + escapeHtml(header.documentLabel) + '<br>' : ''}
    ${receipt?.printer_mode === 'training' ? 'Paragon wydrukowany w trybie szkoleniowym (niefiskalny).<br>' : ''}
  </div>

  ${rows ? `<table>
    <thead><tr><th>Błędnie zaewidencjonowana pozycja</th><th class="num">Ilość</th><th class="num">Cena</th><th class="num">VAT</th><th class="num">Wartość</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="4">WARTOŚĆ SPRZEDAŻY BRUTTO BŁĘDNIE ZAEWIDENCJONOWANEJ</td><td class="num">${formatPln(correction.wrong_amount_grosze)}</td></tr></tfoot>
  </table>` : `<div class="box"><b>Wartość sprzedaży brutto błędnie zaewidencjonowanej</b>${formatPln(correction.wrong_amount_grosze)}</div>`}

  <table style="width:auto;margin-top:14px"><tbody>
    ${vatRows}
    <tr><td><b>Podatek należny</b></td><td class="num"><b>${formatPln(correction.wrong_vat_grosze)}</b></td></tr>
  </tbody></table>

  <div class="box">
    <b>Opis okoliczności i przyczyny popełnienia pomyłki</b>
    ${escapeHtml(correction.reason_note) || '—'}
  </div>

  <div class="attach">
    ${correction.original_receipt_attached
      ? '☑ Oryginał paragonu fiskalnego dołączony do niniejszego dowodu wewnętrznego.'
      : '☐ Dołączyć oryginał paragonu fiskalnego do niniejszego dowodu wewnętrznego.'}
  </div>

  <div class="sign">
    <div>podpis kasjera</div>
    <div>podpis osoby upoważnionej</div>
  </div>

  <div class="footer">
    Dokument sporządzony do ewidencji oczywistych pomyłek, prowadzonej odrębnie od ewidencji zwrotów
    i uznanych reklamacji, zgodnie z rozporządzeniem w sprawie kas rejestrujących.
    Paragon fiskalny pozostaje bez zmian — dokument nie jest dokumentem fiskalnym i nie był drukowany na kasie.
    Po ujęciu pomyłki sprzedaż należy zaewidencjonować ponownie w prawidłowej wysokości.<br>
    Wygenerowano w GetRido: ${escapeHtml(new Date().toLocaleString('pl-PL'))}
  </div>

  <script>window.onload = () => window.print();</script>
</body></html>`;

  openPrintWindow(html);
}
