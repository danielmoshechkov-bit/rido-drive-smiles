// Czysty, drukowalny HTML raportu "Rozliczenie zleceń" (A4 pionowo).
// Otwierany w nowym oknie przez printHtmlDocument() — spójnie z fakturami
// (src/utils/invoiceHtmlGenerator.ts). Bez Reacta i bez zależności, żeby
// druk nie ciągnął chrome aplikacji (filtry/menu/kafelki).

export interface OrdersReportSummary {
  revenue: number;
  parts: number;
  cost: number;
  profit: number;
  paid: number;
}

export interface OrdersReportRow {
  number: string;
  date: string;     // 'dd.MM.yyyy' lub '—'
  client: string;
  status: string;
  revenue: number;
  parts: number;
  cost: number;
  profit: number;
  paid: number;
}

export interface OrdersReportPrintData {
  workshopName: string;
  periodFrom: string;   // 'dd.MM.yyyy'
  periodTo: string;     // 'dd.MM.yyyy'
  generatedAt: string;  // 'dd.MM.yyyy HH:mm'
  priceMode: 'netto' | 'brutto';
  dateBasis: 'created' | 'completed';
  summary: OrdersReportSummary;
  payByMethod: { label: string; amount: number }[];
  orders: OrdersReportRow[];
  includeList: boolean;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));

const money = (n: number) =>
  (Number(n) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildOrdersReportHtml(data: OrdersReportPrintData): string {
  const { summary, payByMethod, orders, includeList } = data;
  const basisLabel = data.dateBasis === 'completed' ? 'Zakończenia' : 'Utworzenia';
  const priceLabel = data.priceMode === 'brutto' ? 'Brutto' : 'Netto';

  const summaryCards = [
    { label: 'Przychód', value: summary.revenue, cls: '' },
    { label: 'Części', value: summary.parts, cls: '' },
    { label: 'Koszt (zakupy)', value: summary.cost, cls: '' },
    { label: 'Zysk', value: summary.profit, cls: summary.profit >= 0 ? 'pos' : 'neg' },
    { label: 'Zapłacono', value: summary.paid, cls: '' },
  ];

  const summaryHtml = summaryCards
    .map((c) => `<div class="card"><div class="card-label">${esc(c.label)}</div><div class="card-value ${c.cls}">${money(c.value)}</div></div>`)
    .join('');

  const payHtml = payByMethod.length
    ? `<div class="pay">
         <span class="pay-title">Jak płacili:</span>
         ${payByMethod.map((p) => `<span class="pay-item">${esc(p.label)}: <b>${money(p.amount)}</b></span>`).join('')}
       </div>`
    : '';

  const listHtml = includeList
    ? `<h2 class="section">Lista zleceń</h2>
       <table class="orders">
         <thead>
           <tr>
             <th class="l">Nr</th>
             <th class="l">Data</th>
             <th class="l">Klient</th>
             <th class="l">Status</th>
             <th class="r">Przychód</th>
             <th class="r">Części</th>
             <th class="r">Koszt</th>
             <th class="r">Zysk</th>
             <th class="r">Zapłacono</th>
           </tr>
         </thead>
         <tbody>
           ${orders.map((o) => `
             <tr>
               <td class="l">${esc(o.number)}</td>
               <td class="l">${esc(o.date)}</td>
               <td class="l">${esc(o.client)}</td>
               <td class="l">${esc(o.status)}</td>
               <td class="r">${money(o.revenue)}</td>
               <td class="r">${money(o.parts)}</td>
               <td class="r">${money(o.cost)}</td>
               <td class="r ${o.profit >= 0 ? 'pos' : 'neg'}">${money(o.profit)}</td>
               <td class="r">${money(o.paid)}</td>
             </tr>`).join('')}
           <tr class="sum">
             <td class="l" colspan="4">Suma</td>
             <td class="r">${money(summary.revenue)}</td>
             <td class="r">${money(summary.parts)}</td>
             <td class="r">${money(summary.cost)}</td>
             <td class="r ${summary.profit >= 0 ? 'pos' : 'neg'}">${money(summary.profit)}</td>
             <td class="r">${money(summary.paid)}</td>
           </tr>
         </tbody>
       </table>`
    : '';

  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<title>Rozliczenie zleceń — ${esc(data.workshopName)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; margin: 0; font-size: 12px; }
  .head { border-bottom: 2px solid #222; padding-bottom: 10px; margin-bottom: 16px; }
  .head h1 { margin: 0 0 4px; font-size: 20px; }
  .head .title { font-size: 13px; color: #444; margin: 0 0 8px; }
  .meta { font-size: 11px; color: #555; display: flex; flex-wrap: wrap; gap: 4px 18px; }
  .meta b { color: #222; }
  .cards { display: flex; gap: 8px; margin-bottom: 14px; }
  .card { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; }
  .card-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .3px; }
  .card-value { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 2px; }
  .pos { color: #15803d; }
  .neg { color: #b91c1c; }
  .pay { font-size: 11px; color: #444; margin-bottom: 16px; padding: 8px 10px; background: #f6f6f6; border-radius: 6px; }
  .pay-title { color: #666; margin-right: 8px; }
  .pay-item { margin-right: 14px; }
  .section { font-size: 13px; margin: 18px 0 8px; }
  table.orders { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.orders th, table.orders td { padding: 5px 6px; border-bottom: 1px solid #eee; }
  table.orders thead th { border-bottom: 1.5px solid #888; background: #f3f3f3; font-weight: 600; }
  table.orders .l { text-align: left; }
  table.orders .r { text-align: right; font-variant-numeric: tabular-nums; }
  table.orders tr.sum td { border-top: 1.5px solid #888; border-bottom: none; font-weight: 700; background: #f3f3f3; }
  tr { page-break-inside: avoid; }
  .foot { margin-top: 20px; font-size: 10px; color: #999; text-align: right; }
</style>
</head>
<body>
  <div class="head">
    <h1>${esc(data.workshopName)}</h1>
    <p class="title">Rozliczenie zleceń</p>
    <div class="meta">
      <span><b>Okres:</b> ${esc(data.periodFrom)} – ${esc(data.periodTo)}</span>
      <span><b>Licz po:</b> ${esc(basisLabel)}</span>
      <span><b>Ceny:</b> ${esc(priceLabel)}</span>
      <span><b>Wygenerowano:</b> ${esc(data.generatedAt)}</span>
    </div>
  </div>

  <div class="cards">${summaryHtml}</div>
  ${payHtml}
  ${listHtml}

  <div class="foot">GetRido — wygenerowano automatycznie</div>
</body>
</html>`;
}
