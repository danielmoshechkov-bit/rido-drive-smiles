import DOMPurify, { type Config } from 'dompurify';

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

const FORBIDDEN_TAGS = [
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'template',
  'base',
  'link',
  'meta',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
] as const;

const FORBIDDEN_ATTRIBUTES = [
  'style',
  'srcdoc',
  'form',
  'formaction',
  'action',
  'method',
  'ping',
  'integrity',
  'nonce',
  'id',
  'name',
  'slot',
  'xmlns',
  'xlink:href',
] as const;

const RICH_TEXT_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'small',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote',
  'pre', 'code', 'hr', 'a',
];

const DOCUMENT_TAGS = [
  ...RICH_TEXT_TAGS,
  'div', 'span', 'mark',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'img',
];

const SAFE_URI = /^(?:(?:https?|mailto|tel):|#|\/(?!\/)|\.\.?\/)/i;
const SAFE_IMAGE_URI = /^(?:(?:https?):|blob:|\/(?!\/)|\.\.?\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i;

const BASE_CONFIG: Config = {
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
  ALLOW_SELF_CLOSE_IN_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  ALLOWED_NAMESPACES: [HTML_NAMESPACE],
  ALLOWED_URI_REGEXP: SAFE_URI,
  FORBID_ATTR: [...FORBIDDEN_ATTRIBUTES],
  FORBID_TAGS: [...FORBIDDEN_TAGS],
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false,
  SANITIZE_DOM: true,
  SANITIZE_NAMED_PROPS: true,
};

const RICH_TEXT_CONFIG: Config = {
  ...BASE_CONFIG,
  ALLOWED_TAGS: RICH_TEXT_TAGS,
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
};

const DOCUMENT_CONFIG: Config = {
  ...BASE_CONFIG,
  ALLOWED_TAGS: DOCUMENT_TAGS,
  ALLOWED_ATTR: [
    'href', 'title', 'target', 'rel',
    'colspan', 'rowspan', 'scope',
    'src', 'alt', 'width', 'height',
  ],
};

const WEBSITE_PREVIEW_CONFIG: Config = {
  ...DOCUMENT_CONFIG,
  ALLOWED_TAGS: [
    ...DOCUMENT_TAGS,
    'html', 'head', 'title', 'body',
    'header', 'footer', 'main', 'nav', 'section', 'article', 'aside',
    'figure', 'figcaption', 'address', 'dl', 'dt', 'dd',
  ],
  ALLOWED_ATTR: [
    ...(DOCUMENT_CONFIG.ALLOWED_ATTR || []),
    'class', 'role', 'dir', 'lang',
  ],
  WHOLE_DOCUMENT: true,
};

function compactUri(value: string): string {
  return [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 0x20 && (code < 0x7f || code > 0x9f);
    })
    .join('')
    .toLowerCase();
}

function isSafeUri(value: string): boolean {
  return SAFE_URI.test(compactUri(value));
}

function isSafeImageUri(value: string): boolean {
  return SAFE_IMAGE_URI.test(compactUri(value));
}

export function escapeHtmlText(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hardenElement(element: Element): void {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith('on') || (FORBIDDEN_ATTRIBUTES as readonly string[]).includes(name)) {
      element.removeAttribute(attribute.name);
    }
  }

  if (element instanceof HTMLAnchorElement) {
    const href = element.getAttribute('href');
    if (href && !isSafeUri(href)) element.removeAttribute('href');

    if (element.getAttribute('target') === '_blank') {
      element.setAttribute('rel', 'noopener noreferrer');
    } else {
      element.removeAttribute('target');
      element.removeAttribute('rel');
    }
  }

  if (element instanceof HTMLImageElement) {
    const src = element.getAttribute('src');
    if (!src || !isSafeImageUri(src)) element.removeAttribute('src');
    element.removeAttribute('srcset');
  }
}

function hardenFragment(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('*').forEach(hardenElement);
  return template.innerHTML;
}

function sanitize(html: unknown, config: Config): string {
  const dirty = typeof html === 'string' ? html : '';
  const purified = String(DOMPurify.sanitize(dirty, config));
  return hardenFragment(purified);
}

/** HTML z opisów i odpowiedzi AI: wyłącznie podstawowe formatowanie tekstu. */
export function sanitizeRichTextHtml(html: unknown): string {
  return sanitize(html, RICH_TEXT_CONFIG);
}

/** HTML dokumentów historycznych i generowanych: semantyka dokumentu bez aktywnej treści i CSS. */
export function sanitizeDocumentHtml(html: unknown): string {
  return sanitize(html, DOCUMENT_CONFIG);
}

/** Podświetlenie placeholderów jest dodawane przed końcową sanitizacją całego fragmentu. */
export function sanitizeTemplatePreviewHtml(html: unknown): string {
  const source = typeof html === 'string' ? html : '';
  return sanitizeDocumentHtml(source.replace(/\{\{([A-Z0-9_]+)\}\}/g, '<mark>{{$1}}</mark>'));
}

/**
 * Podgląd strony AI działa w sandboxowanym iframe. Style i aktywna treść są celowo
 * usuwane; pełny wizualny renderer wymaga osobnego originu i CSP przed przywróceniem CSS.
 */
export function sanitizeIsolatedPreviewHtml(html: unknown): string {
  const dirty = typeof html === 'string' ? html : '';
  const purified = String(DOMPurify.sanitize(dirty, WEBSITE_PREVIEW_CONFIG));
  const parsed = new DOMParser().parseFromString(purified, 'text/html');
  parsed.querySelectorAll('*').forEach(hardenElement);

  const csp = parsed.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "default-src 'none'; img-src data: blob: https: http:; style-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; media-src 'none'; font-src 'none'; form-action 'none'; base-uri 'none'";
  parsed.head.prepend(csp);

  return `<!doctype html>${parsed.documentElement.outerHTML}`;
}

/** Buduje kompletny dokument do document.write i sanityzuje również title oraz wrappery. */
export function createSanitizedPrintDocument(title: unknown, bodyHtml: unknown): string {
  const safeTitle = escapeHtmlText(title);
  const safeBody = sanitizeDocumentHtml(bodyHtml);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"><title>${safeTitle}</title></head><body>${safeBody}</body></html>`;
}

/** Zastępuje zawartość już otwartego okna wyłącznie oczyszczonym dokumentem. */
export function writeSanitizedDocumentToWindow(
  printWindow: Window,
  title: unknown,
  bodyHtml: unknown,
): boolean {
  try {
    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(createSanitizedPrintDocument(title, bodyHtml));
    printWindow.document.close();
    return true;
  } catch {
    printWindow.close();
    return false;
  }
}

/** Otwiera wydruk zachowując uchwyt tylko na czas zapisu i odcinając window.opener. */
export function openSanitizedPrintWindow(title: unknown, bodyHtml: unknown): boolean {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  if (!writeSanitizedDocumentToWindow(printWindow, title, bodyHtml)) return false;
  printWindow.focus();
  printWindow.print();
  return true;
}
