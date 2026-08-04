// Kompatybilny, bezpieczny fallback. Publiczny endpoint PHP nie potrafi
// wiarygodnie zweryfikować JWT, tenanta ani uprawnienia do dokumentu, dlatego
// nie wysyłamy do niego HTML. Wywołujący otrzymuje null i korzysta z istniejącej
// ścieżki lokalnego podglądu/drukowania.
//
// Przywrócenie renderowania wymaga uwierzytelnionej funkcji serwerowej, która
// przyjmuje wyłącznie document_id, sama pobiera dane w tenant scope i generuje
// PDF z kontrolowanego szablonu. Nie wolno przywracać POST { html }.
export async function renderInvoicePdf(legacyHtml: string): Promise<string | null> {
  void legacyHtml;
  return null;
}
