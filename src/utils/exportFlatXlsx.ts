import { strToU8, zipSync } from 'fflate';

export const MAX_XLSX_ROWS = 10_000;
export const MAX_XLSX_COLUMNS = 256;
export const MAX_XLSX_TEXT_LENGTH = 500;

export type FlatXlsxRow = Record<string, unknown>;

interface FlatXlsxOptions {
  sheetName?: string;
}

const XML_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const FORMULA_PREFIX = /^\s*[=+\-@]/;
const INVALID_SHEET_NAME_CHARACTERS = /[\\/*?:\[\]]/g;
const INVALID_FILE_NAME_CHARACTERS = /[\u0000-\u001F\u007F<>:"/\\|?*]/g;

export const escapeXlsxXml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export const sanitizeSpreadsheetText = (value: unknown): string => {
  const normalized = String(value ?? '').replace(XML_CONTROL_CHARACTERS, ' ');
  const truncated = Array.from(normalized).slice(0, MAX_XLSX_TEXT_LENGTH).join('');

  // Obrona warstwowa. Writer nigdy nie tworzy komórki z formułą, ale prefiks
  // zabezpiecza też plik po ewentualnej późniejszej konwersji do CSV.
  return FORMULA_PREFIX.test(truncated) ? `'${truncated}` : truncated;
};

const sanitizeSheetName = (value: unknown): string => {
  const sanitized = sanitizeSpreadsheetText(value)
    .replace(INVALID_SHEET_NAME_CHARACTERS, ' ')
    .trim();
  return Array.from(sanitized || 'Arkusz1').slice(0, 31).join('');
};

const sanitizeFileName = (value: string): string => {
  const sanitized = value
    .replace(INVALID_FILE_NAME_CHARACTERS, '_')
    .trim()
    .slice(0, 120);
  const baseName = sanitized || 'eksport.xlsx';
  return baseName.toLowerCase().endsWith('.xlsx') ? baseName : `${baseName}.xlsx`;
};

const columnName = (columnIndex: number): string => {
  let current = columnIndex + 1;
  let result = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
};

const inlineStringCell = (reference: string, value: unknown): string => {
  const text = escapeXlsxXml(sanitizeSpreadsheetText(value));
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
};

const dataCell = (reference: string, value: unknown): string => {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? `<c r="${reference}" t="n"><v>${value}</v></c>`
      : inlineStringCell(reference, '');
  }

  if (typeof value === 'boolean') {
    return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }

  return inlineStringCell(reference, value);
};

const worksheetXml = (rows: FlatXlsxRow[]): string => {
  if (rows.length === 0) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>';
  }

  const columns = Object.keys(rows[0]);
  if (columns.length > MAX_XLSX_COLUMNS) {
    throw new RangeError(`Eksport może zawierać maksymalnie ${MAX_XLSX_COLUMNS} kolumn.`);
  }

  const headerCells = columns
    .map((column, index) => inlineStringCell(`${columnName(index)}1`, column))
    .join('');
  const xmlRows = [`<row r="1">${headerCells}</row>`];

  rows.forEach((row, rowIndex) => {
    const excelRow = rowIndex + 2;
    const cells = columns.map((column, columnIndex) => {
      const value = Object.prototype.hasOwnProperty.call(row, column) ? row[column] : '';
      return dataCell(`${columnName(columnIndex)}${excelRow}`, value);
    }).join('');
    xmlRows.push(`<row r="${excelRow}">${cells}</row>`);
  });

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<sheetData>${xmlRows.join('')}</sheetData>`
    + '</worksheet>';
};

export const createFlatXlsxArchive = (
  rows: FlatXlsxRow[],
  options: FlatXlsxOptions = {},
): Uint8Array => {
  if (!Array.isArray(rows)) {
    throw new TypeError('Dane eksportu muszą być tablicą.');
  }
  if (rows.length > MAX_XLSX_ROWS) {
    throw new RangeError(`Eksport może zawierać maksymalnie ${MAX_XLSX_ROWS} wierszy.`);
  }

  const sheetName = escapeXlsxXml(sanitizeSheetName(options.sheetName ?? 'Arkusz1'));
  const files = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
      + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>`
      + '</workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '</Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(worksheetXml(rows)),
  };

  return zipSync(files, { level: 6 });
};

export const downloadFlatXlsx = (
  rows: FlatXlsxRow[],
  fileName: string,
  options: FlatXlsxOptions = {},
): void => {
  const archive = createFlatXlsxArchive(rows, options);
  const blob = new Blob([archive], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  try {
    link.href = url;
    link.download = sanitizeFileName(fileName);
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
};
