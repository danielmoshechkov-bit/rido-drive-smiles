/**
 * Drukowanie dokumentu HTML bez `document.write` i bez wyskakującego okna.
 *
 * `win.document.write(html)` wykonuje wszystko, co jest w tym HTML-u — łącznie ze
 * skryptami i atrybutami zdarzeń wstrzykniętymi przez dane użytkownika. Ten sam
 * dokument wrzucony do `srcdoc` sandboxowanej ramki jest tylko wyświetlany:
 * bez `allow-scripts` przeglądarka nie uruchomi ani `<script>`, ani `onerror=`.
 *
 * `allow-same-origin` jest potrzebne, żeby strona mogła wywołać `print()` na
 * ramce — samo w sobie nie włącza skryptów. `allow-modals` przepuszcza okno
 * drukowania.
 *
 * Ten wzorzec działa już w `InvoicePreviewModal.handlePrint`; tutaj jest
 * wydzielony, żeby nie kopiować go po kolejnych modułach.
 */
export function printHtmlInIframe(html: string): boolean {
  if (typeof document === 'undefined') return false;

  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = html;

  let finished = false;
  const remove = () => {
    if (finished) return;
    finished = true;
    // Chwila zwłoki: usunięcie ramki w trakcie print() przerywa wydruk.
    setTimeout(() => frame.remove(), 1000);
  };

  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) {
      frame.remove();
      return;
    }
    // Odrobina czasu na logo i czcionki, inaczej drukarka dostaje pusty nagłówek.
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch (e) {
        console.warn('Nie udało się otworzyć okna wydruku:', e);
      }
      remove();
    }, 350);
  };

  document.body.appendChild(frame);
  return true;
}
