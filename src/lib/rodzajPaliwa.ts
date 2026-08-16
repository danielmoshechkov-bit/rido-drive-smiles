/**
 * Rodzaj paliwa z rejestru → pozycja z naszej listy wyboru.
 *
 * Rejestr oddaje to na kilka sposobów: pełnym słowem („PETROL", „OLEJ NAPĘDOWY"),
 * po polsku, albo jedną literą („H" = hybryda, „P" = petrol, „D" = diesel).
 * Wpisywaliśmy tę wartość wprost do pola wyboru, więc gdy nie pasowała do żadnej
 * pozycji — a „H" nie pasuje — pole zostawało PUSTE, mimo że dane przyszły.
 *
 * Czego nie rozumiemy, tego nie wstawiamy: null zostawia pole puste, zamiast
 * wpisywać do niego wartość spoza listy, która i tak nie da się pokazać.
 */
export const RODZAJE_PALIWA = ['Benzyna', 'Diesel', 'LPG', 'Elektryczny', 'Hybryda', 'Wodór', 'CNG'];

export function naszRodzajPaliwa(surowy: unknown): string | null {
  const t = String(surowy ?? '').trim().toLowerCase();
  if (!t) return null;
  const dokladny = RODZAJE_PALIWA.find((f) => f.toLowerCase() === t);
  if (dokladny) return dokladny;
  if (/^(h|hev|phev)$/.test(t) || t.includes('hyb')) return 'Hybryda';
  if (/^d$/.test(t) || t.includes('diesel') || t.includes('olej')) return 'Diesel';
  if (/^(p|b)$/.test(t) || t.includes('petrol') || t.includes('benz') || t.includes('gasoline')) return 'Benzyna';
  if (/^(e|ev|bev)$/.test(t) || t.includes('electric') || t.includes('elektr') || t.includes('energia')) return 'Elektryczny';
  if (t.includes('lpg') || t.startsWith('gaz')) return 'LPG';
  if (t.includes('cng') || t.includes('spręż')) return 'CNG';
  if (t.includes('wod') || t.includes('hydrogen')) return 'Wodór';
  return null;
}
