// Grupowanie faktur: oryginał + jego korekty pod spodem.
// Korekta wskazuje na oryginał kluczem (np. corrected_ksef_number → ksef_number,
// albo corrected_invoice_id → id / corrected_ksef_reference → ksef_reference).

export interface InvoiceGroup<T> {
  original: T;
  corrections: T[];
}

/**
 * @param items lista (posortowana jak ma się wyświetlać)
 * @param getOwnKeys klucze, po których KOREKTA może wskazać TEN element jako oryginał
 * @param getParentKey klucz oryginału, który dany element koryguje (null = nie jest korektą)
 */
export function groupByCorrections<T extends { id: string }>(
  items: T[],
  getOwnKeys: (item: T) => (string | null | undefined)[],
  getParentKey: (item: T) => string | null | undefined,
): InvoiceGroup<T>[] {
  const byKey = new Map<string, T>();
  for (const it of items) {
    for (const k of getOwnKeys(it)) {
      if (k) byKey.set(k, it);
    }
  }

  const correctionsOf = new Map<string, T[]>();
  const usedAsCorrection = new Set<string>();
  for (const it of items) {
    const pk = getParentKey(it);
    if (!pk) continue;
    const parent = byKey.get(pk);
    if (parent && parent.id !== it.id && !usedAsCorrection.has(it.id)) {
      const arr = correctionsOf.get(parent.id) || [];
      arr.push(it);
      correctionsOf.set(parent.id, arr);
      usedAsCorrection.add(it.id);
    }
  }

  // Oryginały (oraz korekty-sieroty, których oryginału nie ma w bieżącej liście) jako głowy grup
  const groups: InvoiceGroup<T>[] = [];
  for (const it of items) {
    if (usedAsCorrection.has(it.id)) continue;
    groups.push({ original: it, corrections: correctionsOf.get(it.id) || [] });
  }
  return groups;
}
