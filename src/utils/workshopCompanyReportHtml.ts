// Czysty, drukowalny HTML "Raportu działalności firmy" (A4 pionowo).
// Otwierany w nowym oknie przez printHtmlDocument() — spójnie z Raportem 1
// (workshopReportPrintHtml.ts) i fakturami.

export interface CompanyReportPrintData {
  workshopName: string;
  periodFrom: string;   // 'dd.MM.yyyy'
  periodTo: string;     // 'dd.MM.yyyy'
  generatedAt: string;  // 'dd.MM.yyyy HH:mm'
  statusLabel: string;  // od jakich statusów liczony przychód memoriałowy
  income: { cash: number; orders: number };
  costs: {
    labor: number; rent: number; fixedOther: number;
    purchases: number; ownerDraw: number; commissions: number; total: number;
  };
  laborBreakdown: { wyplaty: number; zaliczki: number; premie: number };
  plannedFixed?: number | null; // memoriałowa "planowana" opłata stała (info), bez wpływu na wynik
  resultCash: number;     // realne wpływy − koszty
  resultAccrual: number;  // przychód zleceń − koszty
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));

const money = (n: number) =>
  (Number(n) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildCompanyReportHtml(data: CompanyReportPrintData): string {
  const { income, costs, laborBreakdown: lb } = data;

  const row = (label: string, value: number, opts?: { strong?: boolean; cls?: string }) =>
    `<tr class="${opts?.strong ? 'strong' : ''}">
       <td class="l">${esc(label)}</td>
       <td class="r ${opts?.cls || ''}">${money(value)}</td>
     </tr>`;
  const subRow = (label: string) => `<tr class="sub"><td class="l" colspan="2">${esc(label)}</td></tr>`;

  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<title>Raport działalności — ${esc(data.workshopName)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; margin: 0; font-size: 12px; }
  .head { border-bottom: 2px solid #222; padding-bottom: 10px; margin-bottom: 16px; }
  .head h1 { margin: 0 0 4px; font-size: 20px; }
  .head .title { font-size: 13px; color: #444; margin: 0 0 8px; }
  .meta { font-size: 11px; color: #555; display: flex; flex-wrap: wrap; gap: 4px 18px; }
  .meta b { color: #222; }
  h2.section { font-size: 13px; margin: 18px 0 6px; }
  table.lines { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.lines td { padding: 5px 6px; border-bottom: 1px solid #eee; }
  table.lines .l { text-align: left; }
  table.lines .r { text-align: right; font-variant-numeric: tabular-nums; }
  table.lines tr.strong td { font-weight: 700; border-top: 1.5px solid #888; border-bottom: none; background: #f3f3f3; }
  table.lines tr.sub td { color: #777; font-size: 11px; padding-left: 22px; border-bottom: none; }
  .pos { color: #15803d; }
  .neg { color: #b91c1c; }
  .results { display: flex; gap: 10px; margin-top: 16px; }
  .res { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; }
  .res-label { font-size: 11px; color: #666; }
  .res-value { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 2px; }
  .res-note { font-size: 10px; color: #999; margin-top: 4px; }
  .foot { margin-top: 22px; font-size: 10px; color: #999; text-align: right; }
</style>
</head>
<body>
  <div class="head">
    <h1>${esc(data.workshopName)}</h1>
    <p class="title">Raport działalności firmy</p>
    <div class="meta">
      <span><b>Okres:</b> ${esc(data.periodFrom)} – ${esc(data.periodTo)}</span>
      <span><b>Przychód ze zleceń wg statusów:</b> ${esc(data.statusLabel)}</span>
      <span><b>Wygenerowano:</b> ${esc(data.generatedAt)}</span>
    </div>
  </div>

  <h2 class="section">Przychody</h2>
  <table class="lines">
    ${row('Realne wpływy (Kasa)', income.cash)}
    ${row('Przychód ze zleceń (wartość zleceń — memoriał)', income.orders)}
  </table>

  <h2 class="section">Koszty</h2>
  <table class="lines">
    ${row('Koszty pracownicze (wypłaty + zaliczki + premie)', costs.labor)}
    ${subRow(`wypłaty: ${money(lb.wyplaty)} · zaliczki: ${money(lb.zaliczki)} · premie: ${money(lb.premie)}`)}
    ${row('Czynsz', costs.rent)}
    ${row('Opłaty stałe (media, abonamenty itp.)', costs.fixedOther)}
    ${row('Zakupy / wydatki', costs.purchases)}
    ${row('Wypłaty z kasy / właściciela', costs.ownerDraw)}
    ${row('Prowizje portalu GetRido', costs.commissions)}
    ${row('Razem koszty', costs.total, { strong: true })}
  </table>
  ${data.plannedFixed != null ? `<p style="font-size:10px;color:#999;margin:6px 0 0">Planowane opłaty stałe na okres (memoriał, poza wynikiem): ${money(data.plannedFixed)}</p>` : ''}

  <div class="results">
    <div class="res">
      <div class="res-label">Wynik kasowy (realny)</div>
      <div class="res-value ${data.resultCash >= 0 ? 'pos' : 'neg'}">${money(data.resultCash)}</div>
      <div class="res-note">Realne wpływy − wszystkie koszty</div>
    </div>
    <div class="res">
      <div class="res-label">Wynik ze zleceń (memoriał)</div>
      <div class="res-value ${data.resultAccrual >= 0 ? 'pos' : 'neg'}">${money(data.resultAccrual)}</div>
      <div class="res-note">Przychód ze zleceń − wszystkie koszty</div>
    </div>
  </div>

  <div class="foot">GetRido — wygenerowano automatycznie</div>
</body>
</html>`;
}

// Pomijamy wiersz podlinii gdy value=NaN (sub-label tekstowy).
