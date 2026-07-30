/**
 * Wydruk KOPII paragonu — dokument NIEFISKALNY generowany przez GetRido.
 *
 * Dlaczego nie z pamięci drukarki: protokół ElzabESC nie ma komendy wydruku kopii
 * z pamięci chronionej (kopia elektroniczna jest funkcją menu urządzenia, ewentualnie
 * protokołu STX). Ponowne wysłanie paragonu na drukarkę byłoby DRUGĄ SPRZEDAŻĄ i
 * podwoiłoby obrót — dlatego kopia powstaje wyłącznie ze snapshotu w `fiscal_receipts`
 * i nigdy nie dotyka urządzenia fiskalnego.
 */

import type { FiscalReceiptRow } from '@/hooks/useFiscal';
import { formatPln } from './fiscal';

export interface CopyHeader {
  companyName?: string | null;
  nip?: string | null;
  address?: string | null;
  documentLabel?: string | null;
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

  const printWindow = window.open('', '_blank', 'width=720,height=900');
  if (!printWindow) {
    throw new Error('Przeglądarka zablokowała okno wydruku. Zezwól na wyskakujące okna dla tej strony.');
  }
  printWindow.document.write(html);
  printWindow.document.close();
}
