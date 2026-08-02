// Grupy główne katalogu usług (Auto, Dom, Beauty, ...) i przypisane do nich
// slugi podkategorii z tabeli `service_categories`.
// Jedno źródło prawdy dla portalu (/uslugi) i panelu usługodawcy (Moje usługi).

export interface ServiceCategoryGroup {
  id: string;
  name: string;
  slugs: string[];
}

export const SERVICE_CATEGORY_GROUPS: ServiceCategoryGroup[] = [
  {
    id: 'auto',
    name: 'Auto — motoryzacja',
    slugs: [
      'warsztat', 'mechanika', 'detailing', 'myjnia', 'wulkanizacja', 'klimatyzacja',
      'elektryka-auto', 'blacharstwo', 'auto-szyby', 'serwis-lpg', 'przeglady', 'holowanie', 'ppf',
    ],
  },
  { id: 'dom', name: 'Dom — remonty i wnętrza', slugs: ['sprzatanie', 'remonty', 'budowlanka', 'projektanci'] },
  { id: 'beauty', name: 'Beauty', slugs: [] },
  { id: 'zdrowie', name: 'Zdrowie', slugs: [] },
  { id: 'ekspert', name: 'Ekspert — usługi profesjonalne', slugs: [] },
  { id: 'dostawy', name: 'Dostawy i transport', slugs: ['przeprowadzki'] },
  { id: 'fachowiec', name: 'Fachowiec', slugs: ['hydraulik', 'elektryk', 'zlota-raczka', 'ogrodnik'] },
];

export const OTHER_GROUP: ServiceCategoryGroup = { id: 'inne', name: 'Pozostałe', slugs: [] };

export function groupIdForSlug(slug: string): string {
  return SERVICE_CATEGORY_GROUPS.find(g => g.slugs.includes(slug))?.id ?? OTHER_GROUP.id;
}

/** Dzieli listę kategorii portalu na grupy główne (tylko te, które mają pozycje). */
export function groupCategories<T extends { slug: string }>(
  categories: T[],
): { group: ServiceCategoryGroup; items: T[] }[] {
  const out: { group: ServiceCategoryGroup; items: T[] }[] = [];
  for (const g of SERVICE_CATEGORY_GROUPS) {
    const items = categories.filter(c => g.slugs.includes(c.slug));
    if (items.length) out.push({ group: g, items });
  }
  const rest = categories.filter(c => groupIdForSlug(c.slug) === OTHER_GROUP.id);
  if (rest.length) out.push({ group: OTHER_GROUP, items: rest });
  return out;
}
