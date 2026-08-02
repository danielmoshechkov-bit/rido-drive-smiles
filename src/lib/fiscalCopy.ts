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
  /** Logo firmy — to samo, które warsztat wgrał w ustawieniach. */
  logoUrl?: string | null;
}

/**
 * Logo nad nagłówkiem dokumentu.
 *
 * Klient rozpoznaje warsztat po znaku, nie po numerze NIP — a te dokumenty (kopia paragonu,
 * protokół zwrotu, pokwitowanie) trafiają wprost do jego rąk. Wysokość ograniczona, żeby
 * logo nie zjadło połowy kartki.
 */
function logoBlock(header: CopyHeader): string {
  if (!header.logoUrl) return '';
  return `<div style="text-align:center;margin-bottom:10px">
    <img src="${escapeHtml(header.logoUrl)}" alt="" style="max-height:70px;max-width:60%;object-fit:contain" />
  </div>`;
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
  ${logoBlock(header)}
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
  ${logoBlock(header)}
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

const REGISTER_STYLE = `
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 18px; color: #111; font-size: 11px; }
  .banner { border: 2px solid #111; padding: 8px 12px; text-align: center; font-weight: 700; letter-spacing: 1px; }
  h1 { font-size: 15px; margin: 14px 0 4px; }
  .muted { color: #555; font-size: 11px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #bbb; padding: 4px 5px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; font-size: 10px; }
  .num { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: 700; background: #f8f8f8; }
  .sign { margin-top: 40px; display: flex; justify-content: flex-end; }
  .sign div { width: 240px; border-top: 1px solid #111; padding-top: 6px; text-align: center; font-size: 10px; color: #555; }
  .footer { margin-top: 16px; font-size: 10px; color: #555; line-height: 1.5; }
  @media print { body { margin: 8mm; } @page { size: A4 landscape; } }
`;

function registerHeader(header: CopyHeader, title: string, subtitle: string): string {
  return `${logoBlock(header)}<div class="banner">${escapeHtml(title)}</div>
  <h1>${escapeHtml(header.companyName ?? '')}</h1>
  <div class="muted">
    ${header.address ? escapeHtml(header.address) + '<br>' : ''}
    ${header.nip ? 'NIP: ' + escapeHtml(header.nip) + '<br>' : ''}
    ${escapeHtml(subtitle)}
  </div>`;
}

/**
 * EWIDENCJA ZWROTÓW I UZNANYCH REKLAMACJI — wydruk zbiorczy dla księgowej/kontroli.
 *
 * Kolumny odpowiadają kolejnym punktom § 3 ust. 3 rozporządzenia, żeby dokument dało się
 * czytać obok przepisu. Podstawą jest DATA SPRZEDAŻY, nie data zwrotu — zwrot pomniejsza
 * obrót w okresie pierwotnej sprzedaży i to ta data decyduje, do którego JPK_V7 trafi.
 */
export function printReturnsRegister(
  rows: FiscalReturnRow[],
  header: CopyHeader = {},
  period?: { from?: string; to?: string },
): void {
  const reasonLabels: Record<string, string> = {
    zwrot_towaru: 'Zwrot towaru',
    reklamacja: 'Reklamacja',
    pomylka_kasjera: 'Pomyłka kasjera',
  };

  const total = rows.reduce((sum, row) => sum + row.amount_grosze, 0);
  const vatTotal = rows.reduce(
    (sum, row) => sum + Object.values(row.vat_breakdown ?? {}).reduce((s, v) => s + Number(v), 0),
    0,
  );

  const body = rows
    .map((row) => {
      const names = (row.items ?? []).map((item) => item.name).join(', ');
      const vat = Object.values(row.vat_breakdown ?? {}).reduce((s, v) => s + Number(v), 0);
      return `<tr>
        <td>${escapeHtml(row.return_number)}</td>
        <td>${escapeHtml(new Date((row as any).sale_date ?? row.returned_at).toLocaleDateString('pl-PL'))}</td>
        <td>${escapeHtml(new Date(row.returned_at).toLocaleDateString('pl-PL'))}</td>
        <td>${escapeHtml(names || '—')}</td>
        <td>${escapeHtml(reasonLabels[row.reason] ?? row.reason)}${row.reason_note ? ' — ' + escapeHtml(row.reason_note) : ''}</td>
        <td>${escapeHtml((row as any).return_type === 'partial' ? 'część należności' : 'całość należności')}</td>
        <td class="num">${formatPln(row.amount_grosze)}</td>
        <td class="num">${formatPln(vat)}</td>
        <td>nr ${escapeHtml((row as any).receipt_number ?? '—')}</td>
        <td>${escapeHtml(row.customer_name ?? '—')}</td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>Ewidencja zwrotów</title><style>${REGISTER_STYLE}</style></head>
<body>
  ${registerHeader(
    header,
    'EWIDENCJA ZWROTÓW TOWARÓW I UZNANYCH REKLAMACJI',
    `Okres: ${period?.from ? new Date(period.from).toLocaleDateString('pl-PL') : 'od początku'} – ${
      period?.to ? new Date(period.to).toLocaleDateString('pl-PL') : 'do dziś'
    } · liczba wpisów: ${rows.length}`,
  )}

  <table>
    <thead><tr>
      <th>Nr wpisu</th><th>Data sprzedaży</th><th>Data zwrotu</th><th>Nazwa towaru / usługi</th>
      <th>Przyczyna</th><th>Zakres</th><th class="num">Zwrócona kwota brutto</th><th class="num">w tym VAT</th>
      <th>Dokument sprzedaży</th><th>Nabywca</th>
    </tr></thead>
    <tbody>${body || '<tr><td colspan="10">Brak wpisów w wybranym okresie.</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="6">RAZEM</td>
      <td class="num">${formatPln(total)}</td>
      <td class="num">${formatPln(vatTotal)}</td>
      <td colspan="2"></td>
    </tr></tfoot>
  </table>

  <div class="sign"><div>podpis osoby sporządzającej</div></div>

  <div class="footer">
    Ewidencja prowadzona zgodnie z § 3 ust. 3 rozporządzenia w sprawie kas rejestrujących, odrębnie od
    ewidencji oczywistych pomyłek. Do każdego wpisu dołączony jest protokół podpisany przez sprzedawcę
    i nabywcę oraz dokument potwierdzający sprzedaż. Kwoty pomniejszają obrót w dacie sprzedaży.<br>
    Wygenerowano w GetRido: ${escapeHtml(new Date().toLocaleString('pl-PL'))}
  </div>

  <script>window.onload = () => window.print();</script>
</body></html>`;

  openPrintWindow(html, 1000);
}

/**
 * EWIDENCJA OCZYWISTYCH POMYŁEK — wydruk zbiorczy.
 * Odrębny dokument od ewidencji zwrotów; prawo zabrania prowadzenia ich razem.
 */
export function printCorrectionsRegister(
  rows: FiscalCorrectionRow[],
  header: CopyHeader = {},
  period?: { from?: string; to?: string },
): void {
  const total = rows.reduce((sum, row) => sum + row.wrong_amount_grosze, 0);
  const vatTotal = rows.reduce((sum, row) => sum + row.wrong_vat_grosze, 0);

  const body = rows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.correction_number)}</td>
        <td>${escapeHtml(new Date(row.sale_date ?? row.corrected_at).toLocaleDateString('pl-PL'))}</td>
        <td>${escapeHtml(new Date(row.corrected_at).toLocaleDateString('pl-PL'))}</td>
        <td class="num">${formatPln(row.wrong_amount_grosze)}</td>
        <td class="num">${formatPln(row.wrong_vat_grosze)}</td>
        <td>${escapeHtml(row.reason_note)}</td>
        <td>nr ${escapeHtml(row.receipt_number ?? '—')}</td>
        <td>${row.original_receipt_attached ? 'dołączony' : 'BRAK'}</td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>Ewidencja pomyłek</title><style>${REGISTER_STYLE}</style></head>
<body>
  ${registerHeader(
    header,
    'EWIDENCJA OCZYWISTYCH POMYŁEK',
    `Okres: ${period?.from ? new Date(period.from).toLocaleDateString('pl-PL') : 'od początku'} – ${
      period?.to ? new Date(period.to).toLocaleDateString('pl-PL') : 'do dziś'
    } · liczba wpisów: ${rows.length}`,
  )}

  <table>
    <thead><tr>
      <th>Nr wpisu</th><th>Data sprzedaży</th><th>Data ujęcia</th>
      <th class="num">Błędna sprzedaż brutto</th><th class="num">w tym VAT</th>
      <th>Opis okoliczności i przyczyny pomyłki</th><th>Dokument sprzedaży</th><th>Oryginał paragonu</th>
    </tr></thead>
    <tbody>${body || '<tr><td colspan="8">Brak wpisów w wybranym okresie.</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="3">RAZEM</td>
      <td class="num">${formatPln(total)}</td>
      <td class="num">${formatPln(vatTotal)}</td>
      <td colspan="3"></td>
    </tr></tfoot>
  </table>

  <div class="sign"><div>podpis osoby sporządzającej</div></div>

  <div class="footer">
    Ewidencja prowadzona zgodnie z § 3 ust. 4 rozporządzenia w sprawie kas rejestrujących, odrębnie od
    ewidencji zwrotów i uznanych reklamacji. Do każdego wpisu dołączony jest oryginał paragonu fiskalnego,
    a sprzedaż została zaewidencjonowana ponownie w prawidłowej wysokości.<br>
    Wygenerowano w GetRido: ${escapeHtml(new Date().toLocaleString('pl-PL'))}
  </div>

  <script>window.onload = () => window.print();</script>
</body></html>`;

  openPrintWindow(html, 1000);
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
  ${logoBlock(header)}
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
