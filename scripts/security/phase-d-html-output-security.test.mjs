import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const read = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

function sourceFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) result.push(...sourceFiles(absolute));
    else if (/\.(?:ts|tsx)$/.test(entry)) result.push(absolute);
  }
  return result;
}

test("bezpośredni document.write istnieje wyłącznie wewnątrz centralnej granicy", () => {
  const unsafe = sourceFiles(join(ROOT, "src"))
    .filter((path) => path.endsWith("htmlSanitizer.ts") === false)
    .filter((path) => /document\.write\s*\(/.test(readFileSync(path, "utf8")));
  assert.deepEqual(unsafe, []);
});

test("generatory raportów i PDF przekazują HTML do centralnego sanitizera", () => {
  const expectations = new Map([
    ["src/utils/invoiceHtmlGenerator.ts", /writeSanitizedDocumentToWindow\(printWindow/],
    ["src/components/fleet/BankTransferExportDialog.tsx", /innerHTML = sanitizeDocumentHtml\(htmlContent\)/],
    ["src/components/FleetSettlementsView.tsx", /innerHTML = sanitizeDocumentHtml\(htmlContent\)/],
    ["src/components/inventory/InventoryStocktaking.tsx", /openSanitizedPrintWindow\('Inwentaryzacja', html\)/],
    ["src/components/accounting/MonthlyExportEmail.tsx", /openSanitizedPrintWindow\(`Raport/],
    ["src/components/workshop/WorkshopMechanicCardDialog.tsx", /writeSanitizedDocumentToWindow\(/],
    ["src/components/workshop/WorkshopOrdersList.tsx", /printHtmlDocument\(html\)/],
    ["src/components/invoices/InvoiceDetailSheet.tsx", /printHtmlDocument\(html\)/],
    ["src/components/invoices/InvoiceListWithActions.tsx", /printHtmlDocument\(html\)/],
  ]);

  for (const [path, pattern] of expectations) {
    assert.match(read(path), pattern, `${path}: brak bezpiecznej granicy HTML`);
  }
});

test("podgląd faktury jest sanitizowany i izolowany bez same-origin", () => {
  const source = read("src/components/invoices/InvoicePreviewModal.tsx");
  assert.match(source, /sanitizeIsolatedPreviewHtml\(open \? generateInvoiceHtml\(invoiceData\) : ''\)/);
  assert.match(source, /srcDoc=\{safePreviewHtml\}/);
  assert.match(source, /sandbox=""/);
  assert.doesNotMatch(source, /sandbox="[^"]*allow-same-origin/);
  assert.match(source, /referrerPolicy="no-referrer"/);
});

test("style wykresu nie używa już surowego sinka HTML i waliduje tokeny CSS", () => {
  const source = read("src/components/ui/chart.tsx");
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.match(source, /id\.replace\(\/\[\^a-zA-Z0-9_-/);
  assert.match(source, /\^\[a-zA-Z0-9#\(\),\.%\\s_-\]\+\$/);
  assert.match(source, /return <style>\{css\}<\/style>/);
});

test("HTML modelu AI jest zamieniany w escapowany tekst przed zapisem", () => {
  const source = read("supabase/functions/parse-listing-ai/index.ts");
  assert.match(source, /function aiTextAsSafeHtml/);
  assert.match(source, /escapeHtmlText\(plainText\)/);
  assert.match(source, /ai_description_html:\s*aiTextAsSafeHtml\(parsed\.description_formatted\)/);
  assert.doesNotMatch(source, /ai_description_html:\s*parsed\.description_formatted/);
});

test("dokument wydruku ma CSP bez sieci i zewnętrznych obrazów", () => {
  const source = read("src/security/htmlSanitizer.ts");
  assert.match(source, /default-src 'none'; img-src data: blob:;/);
  assert.match(source, /connect-src 'none'/);
  assert.match(source, /form-action 'none'/);
  assert.match(source, /safeBody = sanitizeDocumentHtml\(bodyHtml\)/);
});
