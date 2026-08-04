import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getTrustedDocumentPreviewKind,
  getTrustedGoogleSheetsEmbedUrl,
  getTrustedPrivateDocumentUrl,
  getTrustedRelativeStorageObjectPath,
  getTrustedSupabaseObjectPath,
} from "../../src/security/trustedContentUrl.ts";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const SUPABASE_ORIGIN = "https://wclrrytmrscqvsyxyvnn.supabase.co";

test("podgląd przyjmuje wyłącznie podpisane HTTPS z dokładnego originu i bucketa", () => {
  const valid = `${SUPABASE_ORIGIN}/storage/v1/object/sign/documents/tenant-a/invoice.pdf?token=test-token`;
  assert.equal(getTrustedPrivateDocumentUrl(valid, ["documents"]), valid);
  assert.equal(getTrustedDocumentPreviewKind(valid), "pdf");

  for (const attack of [
    "javascript:parent.alert(1)//.pdf",
    "javascript:\nalert(1)//.pdf",
    `http://wclrrytmrscqvsyxyvnn.supabase.co/storage/v1/object/sign/documents/a.pdf?token=x`,
    `https://wclrrytmrscqvsyxyvnn.supabase.co.evil.example/storage/v1/object/sign/documents/a.pdf?token=x`,
    `https://user:password@wclrrytmrscqvsyxyvnn.supabase.co/storage/v1/object/sign/documents/a.pdf?token=x`,
    `${SUPABASE_ORIGIN}/storage/v1/object/public/documents/a.pdf`,
    `${SUPABASE_ORIGIN}/storage/v1/object/sign/documents/a.pdf`,
    `${SUPABASE_ORIGIN}/storage/v1/object/sign/workspace-files/a.pdf?token=x`,
  ]) {
    assert.equal(getTrustedPrivateDocumentUrl(attack, ["documents"]), null, attack);
  }
});

test("historyczny publiczny URL służy tylko do uzyskania ścieżki i świeżego signed URL", () => {
  const legacy = `${SUPABASE_ORIGIN}/storage/v1/object/public/documents/tenant-a/faktura%201.pdf`;
  assert.equal(getTrustedSupabaseObjectPath(legacy, "documents"), "tenant-a/faktura 1.pdf");
  assert.equal(getTrustedPrivateDocumentUrl(legacy, ["documents"]), null);
  assert.equal(getTrustedSupabaseObjectPath("https://evil.example/documents/a.pdf", "documents"), null);
  assert.equal(getTrustedSupabaseObjectPath(`${SUPABASE_ORIGIN}/storage/v1/object/public/documents/../secret.pdf`, "documents"), null);
  assert.equal(getTrustedRelativeStorageObjectPath("tenant-a/purchase-invoices/faktura.pdf"), "tenant-a/purchase-invoices/faktura.pdf");
  assert.equal(getTrustedRelativeStorageObjectPath("javascript:alert(1)//.pdf"), null);
  assert.equal(getTrustedRelativeStorageObjectPath("https://evil.example/a.pdf"), null);
  assert.equal(getTrustedRelativeStorageObjectPath("tenant-a/../secret.pdf"), null);
});

test("Google Sheets wymaga dokładnego originu i gałęzi spreadsheets", () => {
  const valid = getTrustedGoogleSheetsEmbedUrl("https://docs.google.com/spreadsheets/d/test-id/edit?usp=sharing#gid=1");
  assert.ok(valid);
  assert.equal(new URL(valid).origin, "https://docs.google.com");
  assert.equal(new URL(valid).pathname, "/spreadsheets/d/test-id/edit");
  assert.equal(new URL(valid).searchParams.get("rm"), "minimal");
  assert.equal(new URL(valid).hash, "");

  for (const attack of [
    "javascript:alert(1)",
    "http://docs.google.com/spreadsheets/d/test",
    "https://docs.google.com.evil.example/spreadsheets/d/test",
    "https://docs.google.com/document/d/test",
    "https://user:password@docs.google.com/spreadsheets/d/test",
  ]) {
    assert.equal(getTrustedGoogleSheetsEmbedUrl(attack), null, attack);
  }
});

test("sinki dokumentów nie renderują surowych URL i izolują każdy iframe", async () => {
  const files = [
    "src/components/driver/DriverDocumentsPanel.tsx",
    "src/components/driver/DriverDocumentsView.tsx",
    "src/components/accounting/ExpenseReviewPanel.tsx",
    "src/components/inventory/InventoryPurchaseOCR.tsx",
    "src/components/invoices/PurchaseInvoicesModule.tsx",
    "src/components/RidoSettings.tsx",
  ];

  for (const path of files) {
    const source = await read(path);
    assert.match(source, /getTrusted(?:PrivateDocumentUrl|GoogleSheetsEmbedUrl)/, path);
    for (const iframe of source.match(/<iframe[\s\S]*?>/g) || []) {
      assert.match(iframe, /sandbox=""/, `${path}: iframe bez pustego sandbox`);
      assert.match(iframe, /referrerPolicy="no-referrer"/, `${path}: iframe bez no-referrer`);
    }
  }

  const driverPanel = await read(files[0]);
  const driverView = await read(files[1]);
  const expense = await read(files[2]);
  const inventory = await read(files[3]);
  const purchaseInvoices = await read(files[4]);
  const settings = await read(files[5]);

  assert.doesNotMatch(driverPanel, /(?:src|href)=\{(?:previewDoc|doc)\.file_url/);
  assert.doesNotMatch(driverView, /(?:src|href)=\{(?:previewDoc|doc)\.file_url/);
  assert.doesNotMatch(expense, /src=\{doc\.file_url\}/);
  assert.doesNotMatch(inventory, /<object\b/);
  assert.doesNotMatch(inventory, /docs\.google\.com\/viewer/);
  assert.doesNotMatch(inventory, /setPreviewSignedUrl\(url\)/);
  assert.equal(
    purchaseInvoices.includes("if (/^https?:\\/\\//i.test(pdfUrl)) return pdfUrl"),
    false,
  );
  assert.doesNotMatch(purchaseInvoices, /src=\{pdfPreviewUrl\}/);
  assert.match(purchaseInvoices, /src=\{trustedPdfPreviewUrl\}/);
  assert.doesNotMatch(settings, /src=\{`\$\{selectedSheet\}/);
});
