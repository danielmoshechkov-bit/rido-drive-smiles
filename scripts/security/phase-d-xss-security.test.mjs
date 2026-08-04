import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const sanitizerPath = 'src/security/htmlSanitizer.ts';
const sinkFiles = [
  'src/pages/PropertyDetailPage.tsx',
  'src/pages/RentalContractPortal.tsx',
  'src/components/fleet-documents/FillAndSendPanel.tsx',
  'src/components/fleet-documents/TemplatePreviewModal.tsx',
  'src/components/rental/RentalDocuments.tsx',
  'src/components/rental/RentalBookingWorkspace.tsx',
  'src/components/DocumentsManagement.tsx',
  'src/components/workspace/WorkspaceDocsView.tsx',
  'src/components/website-builder/PreviewStep.tsx',
];

test('central sanitizer uses DOMPurify with an explicit HTML-only allowlist', async () => {
  const source = await read(sanitizerPath);
  assert.match(source, /import DOMPurify/);
  assert.match(source, /ALLOWED_TAGS:/);
  assert.match(source, /ALLOWED_ATTR:/);
  assert.match(source, /ALLOWED_NAMESPACES:\s*\[HTML_NAMESPACE\]/);
  assert.match(source, /ALLOW_DATA_ATTR:\s*false/);
  assert.match(source, /ALLOW_UNKNOWN_PROTOCOLS:\s*false/);
});

test('stored XSS active-content families are explicitly forbidden', async () => {
  const source = await read(sanitizerPath);
  for (const tag of ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'form']) {
    assert.match(source, new RegExp(`['"]${tag}['"]`), `missing forbidden tag: ${tag}`);
  }
  for (const attribute of ['style', 'srcdoc', 'formaction', 'xlink:href']) {
    assert.match(source, new RegExp(`['"]${attribute.replace(':', '\\:')}['"]`), `missing forbidden attribute: ${attribute}`);
  }
  assert.match(source, /name\.startsWith\(['"]on['"]\)/);
});

test('reflected XSS URL payloads are rejected by positive URI allowlists', async () => {
  const source = await read(sanitizerPath);
  assert.match(source, /const SAFE_URI = \/\^/);
  assert.match(source, /const SAFE_IMAGE_URI = \/\^/);
  assert.doesNotMatch(source.match(/const SAFE_URI = .*;/)?.[0] || '', /javascript|vbscript/);
  assert.doesNotMatch(source.match(/const SAFE_IMAGE_URI = .*;/)?.[0] || '', /svg\+xml/);
  assert.match(source, /code > 0x20 && \(code < 0x7f \|\| code > 0x9f\)/);
});

test('historical and AI HTML sinks call the central sanitizer', async () => {
  const expectations = new Map([
    ['src/pages/PropertyDetailPage.tsx', /sanitizeRichTextHtml\(listing\.aiDescriptionHtml\)/],
    ['src/pages/RentalContractPortal.tsx', /sanitizeDocumentHtml\(data\.instance\.filled_content\)/],
    ['src/components/fleet-documents/TemplatePreviewModal.tsx', /sanitizeTemplatePreviewHtml\(template\.content\)/],
    ['src/components/rental/RentalDocuments.tsx', /sanitizeDocumentHtml\(preview\)/],
    ['src/components/rental/RentalBookingWorkspace.tsx', /sanitizeDocumentHtml\(preview\)/],
    ['src/components/DocumentsManagement.tsx', /sanitizeDocumentHtml\(generateContractHtml\(previewContract\)\)/],
  ]);

  for (const [path, pattern] of expectations) {
    assert.match(await read(path), pattern, `${path} bypasses sanitization`);
  }
});

test('newly stored fleet and rental contract HTML is sanitized before insert', async () => {
  const fleet = await read('src/components/fleet-documents/FillAndSendPanel.tsx');
  assert.match(fleet, /const safeFilledContent = useMemo\([\s\S]*sanitizeDocumentHtml\(filledContent\)/);
  assert.match(fleet, /filled_content:\s*safeFilledContent/);

  const rental = await read('src/components/rental/RentalDocuments.tsx');
  assert.match(rental, /html:\s*sanitizeDocumentHtml\(generateRentalContractHtml\(filled\)\)/);
  assert.match(rental, /filled_content:\s*r\.html/);
});

test('print windows receive only a complete sanitized document and lose opener', async () => {
  const sanitizer = await read(sanitizerPath);
  assert.match(sanitizer, /printWindow\.opener = null/);
  assert.match(sanitizer, /document\.write\(createSanitizedPrintDocument\(title, bodyHtml\)\)/);

  for (const path of [
    'src/components/fleet-documents/FillAndSendPanel.tsx',
    'src/components/DocumentsManagement.tsx',
    'src/components/workspace/WorkspaceDocsView.tsx',
  ]) {
    const source = await read(path);
    assert.match(source, /openSanitizedPrintWindow\(/, `${path} does not use safe print helper`);
    assert.doesNotMatch(source, /document\.write\(/, `${path} still writes an unsanitized fragment`);
  }
});

test('AI website srcDoc is sanitized and sandboxed without scripts or same-origin', async () => {
  const source = await read('src/components/website-builder/PreviewStep.tsx');
  assert.match(source, /sanitizeIsolatedPreviewHtml\(generatedHtml\)/);
  assert.match(source, /srcDoc=\{safeGeneratedHtml\}/);
  assert.match(source, /sandbox=""/);
  assert.doesNotMatch(source, /allow-scripts|allow-same-origin/);
  assert.match(source, /referrerPolicy="no-referrer"/);
});

test('all scoped HTML injection sites have an explicit protection boundary', async () => {
  const sources = await Promise.all(sinkFiles.map(async (path) => [path, await read(path)]));
  for (const [path, source] of sources) {
    const directWrites = [...source.matchAll(/document\.write\(/g)];
    assert.equal(directWrites.length, 0, `${path} contains direct document.write`);

    if (source.includes('dangerouslySetInnerHTML')) {
      assert.match(source, /sanitize(?:RichText|Document|TemplatePreview)Html|highlightedPreview/,
        `${path} has an unguarded dangerouslySetInnerHTML`);
    }
  }
});
