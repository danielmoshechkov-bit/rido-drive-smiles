import assert from 'node:assert/strict';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import {
  createFlatXlsxArchive,
  MAX_XLSX_ROWS,
  MAX_XLSX_TEXT_LENGTH,
  sanitizeSpreadsheetText,
} from '../../src/utils/exportFlatXlsx.ts';

const unzipText = (archive) => Object.fromEntries(
  Object.entries(unzipSync(archive)).map(([path, bytes]) => [path, strFromU8(bytes)]),
);

test('writer zachowuje Unicode, escapuje XML i neutralizuje formuły', () => {
  const malicious = '=HYPERLINK("javascript:alert(1)","kliknij")';
  const files = unzipText(createFlatXlsxArchive([{
    'Nazwa & <tag>': 'Żółć 😀 & <script>alert(1)</script>',
    Formula: malicious,
  }], { sheetName: 'Rozliczenia & test' }));
  const worksheet = files['xl/worksheets/sheet1.xml'];
  const workbook = files['xl/workbook.xml'];

  assert.match(worksheet, /Żółć 😀 &amp; &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(worksheet, /Nazwa &amp; &lt;tag&gt;/);
  assert.match(worksheet, /&apos;=HYPERLINK\(&quot;javascript:alert\(1\)&quot;,&quot;kliknij&quot;\)/);
  assert.match(workbook, /name="Rozliczenia &amp; test"/);
  assert.doesNotMatch(worksheet, /<script|<f[ >]|<hyperlinks?>/i);
});

test('writer nie serializuje NaN ani Infinity jako wartości liczbowe', () => {
  const files = unzipText(createFlatXlsxArchive([{
    Valid: 12.5,
    NotANumber: Number.NaN,
    PositiveInfinity: Number.POSITIVE_INFINITY,
    NegativeInfinity: Number.NEGATIVE_INFINITY,
  }]));
  const worksheet = files['xl/worksheets/sheet1.xml'];

  assert.match(worksheet, /t="n"><v>12\.5<\/v>/);
  assert.doesNotMatch(worksheet, /<v>[+-]?(?:NaN|Infinity)<\/v>/);
});

test('pusty eksport tworzy minimalny poprawny pakiet bez aktywnej treści', () => {
  const files = unzipText(createFlatXlsxArchive([]));

  assert.deepEqual(Object.keys(files).sort(), [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/_rels/workbook.xml.rels',
    'xl/workbook.xml',
    'xl/worksheets/sheet1.xml',
  ]);
  assert.match(files['xl/worksheets/sheet1.xml'], /<sheetData\/>/);

  for (const content of Object.values(files)) {
    assert.doesNotMatch(content, /TargetMode=["']External["']|vbaProject|macroEnabled|<hyperlinks?>|<f[ >]/i);
  }
});

test('tekst jest ograniczany do 500 punktów Unicode bez przecięcia emoji', () => {
  const input = `${'ą'.repeat(MAX_XLSX_TEXT_LENGTH - 1)}😀X`;
  const sanitized = sanitizeSpreadsheetText(input);

  assert.equal(Array.from(sanitized).length, MAX_XLSX_TEXT_LENGTH);
  assert.ok(sanitized.endsWith('😀'));
  assert.doesNotMatch(sanitized, /X$/);
});

test('writer odrzuca eksport powyżej 10 000 wierszy przed budowaniem XML', () => {
  const oversized = Array.from({ length: MAX_XLSX_ROWS + 1 }, () => ({}));
  assert.throws(
    () => createFlatXlsxArchive(oversized),
    /maksymalnie 10000 wierszy/,
  );
});
