import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const documentSinkExpectations = new Map([
  [
    'src/components/fleet/RentalContractSignatureFlow.tsx',
    /dangerouslySetInnerHTML=\{\{ __html: sanitizeDocumentHtml\(contractHtml\) \}\}/,
  ],
  [
    'src/components/fleet/RentalContractViewer.tsx',
    /dangerouslySetInnerHTML=\{\{[\s\S]*?__html: sanitizeDocumentHtml\([\s\S]*?generateRentalContractHtml\(contractData\)[\s\S]*?\)[\s\S]*?\}\}/,
  ],
  [
    'src/components/driver/DriverDocumentSigningFlow.tsx',
    /dangerouslySetInnerHTML=\{\{ __html: sanitizeDocumentHtml\(getContractPreviewHtml\(\)\) \}\}/,
  ],
  [
    'src/components/driver/DriverContractsView.tsx',
    /dangerouslySetInnerHTML=\{\{[\s\S]*?__html: sanitizeDocumentHtml\([\s\S]*?contractHtml[\s\S]*?\)[\s\S]*?\}\}/,
  ],
  [
    'src/components/driver/DriverDocumentsPanel.tsx',
    /dangerouslySetInnerHTML=\{\{ __html: sanitizeDocumentHtml\(generateContractHtml\(previewContract\)\) \}\}/,
  ],
  [
    'src/components/EmailSettings.tsx',
    /dangerouslySetInnerHTML=\{\{ __html: sanitizeDocumentHtml\(getPreviewHtml\(\)\) \}\}/,
  ],
]);

test('podglądy umów i szablonu e-mail sanitizują HTML bezpośrednio przy sinku', async () => {
  for (const [path, expectedBoundary] of documentSinkExpectations) {
    const source = await read(path);
    assert.match(source, /import \{[^}]*sanitizeDocumentHtml[^}]*\} from ['"]@\/security\/htmlSanitizer['"]/);
    assert.match(source, expectedBoundary, `${path} omija sanitizeDocumentHtml przy renderowaniu`);
  }
});

test('HTML tłumaczeń ma ograniczoną allowlistę rich text', async () => {
  const source = await read('src/pages/ServiceProviderDashboard.tsx');

  assert.match(source, /import \{ sanitizeRichTextHtml \} from ['"]@\/security\/htmlSanitizer['"]/);
  assert.match(source, /__html: sanitizeRichTextHtml\(t\('sp\.services\.firstPhotoMain'\)\)/);
  assert.match(source, /__html: sanitizeRichTextHtml\(t\('sp\.activation\.descHint'\)\)/);
  assert.equal((source.match(/dangerouslySetInnerHTML/g) || []).length, 2);
});

test('wydruk dokumentu korzysta z kompletnego sanityzowanego dokumentu', async () => {
  const source = await read('src/components/driver/DriverDocumentsPanel.tsx');

  assert.match(source, /openSanitizedPrintWindow\([\s\S]*?generateContractHtml\(contract\)/);
  assert.doesNotMatch(source, /document\.write\(/);
  assert.doesNotMatch(source, /window\.open\(/);
});

test('żaden objęty zakresem sink nie renderuje surowego HTML', async () => {
  const paths = [
    ...documentSinkExpectations.keys(),
    'src/pages/ServiceProviderDashboard.tsx',
  ];

  for (const path of paths) {
    const source = await read(path);
    const sinkCount = (source.match(/dangerouslySetInnerHTML/g) || []).length;
    const sanitizerCallCount = (source.match(/__html:\s*sanitize(?:Document|RichText)Html\(/g) || []).length;

    assert.equal(sanitizerCallCount, sinkCount, `${path} zawiera sink bez bezpośredniego sanitizera`);
    assert.doesNotMatch(source, /document\.write\(/, `${path} zawiera bezpośredni document.write`);
  }
});

test('wspólny sanitizer blokuje aktywną treść używaną w payloadach stored/reflected XSS', async () => {
  const source = await read('src/security/htmlSanitizer.ts');

  for (const token of ['script', 'iframe', 'object', 'embed', 'svg', 'style', 'srcdoc', 'formaction']) {
    assert.match(source, new RegExp(`['"]${token}['"]`), `brak blokady ${token}`);
  }
  assert.match(source, /name\.startsWith\(['"]on['"]\)/);
  assert.match(source, /ALLOW_UNKNOWN_PROTOCOLS:\s*false/);
  assert.match(source, /SANITIZE_NAMED_PROPS:\s*true/);
});
