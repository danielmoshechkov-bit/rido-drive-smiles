import { pl, ru, uk, de, vi, kk, enUS, type Locale } from 'date-fns/locale';

/** Mapuje kod języka i18n na locale date-fns (do format()/formatDistance() itp.). */
const MAP: Record<string, Locale> = { pl, ru, ua: uk, uk, de, vi, kz: kk, en: enUS };

export function getDateLocale(lang?: string): Locale {
  const code = (lang || 'pl').slice(0, 2);
  return MAP[code] || pl;
}
