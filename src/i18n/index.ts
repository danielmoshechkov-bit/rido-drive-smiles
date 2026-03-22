import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import pl from './locales/pl.json';
import en from './locales/en.json';
import ru from './locales/ru.json';
import ua from './locales/ua.json';
import kz from './locales/kz.json';
import de from './locales/de.json';
import vi from './locales/vi.json';

const resources = {
  pl: { translation: pl },
  en: { translation: en },
  ru: { translation: ru },
  ua: { translation: ua },
  kz: { translation: kz },
  de: { translation: de },
  vi: { translation: vi },
};

function detectLang(): string {
  try {
    const saved = localStorage.getItem('rido_lang');
    if (saved && resources[saved as keyof typeof resources]) return saved;
  } catch {}
  const browser = navigator.language?.slice(0, 2).toLowerCase();
  return resources[browser as keyof typeof resources] ? browser : 'pl';
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: detectLang(),
    fallbackLng: 'pl',
    interpolation: { escapeValue: false },
  });

export const PORTAL_LANGS = [
  { code: 'pl', name: 'Polski',      flag: '🇵🇱' },
  { code: 'en', name: 'English',     flag: '🇬🇧' },
  { code: 'ru', name: 'Русский',     flag: '🇷🇺' },
  { code: 'ua', name: 'Українська',  flag: '🇺🇦' },
  { code: 'de', name: 'Deutsch',     flag: '🇩🇪' },
  { code: 'vi', name: 'Tiếng Việt',  flag: '🇻🇳' },
];

export const ALL_TRANSLATION_LANGS = [
  'pl','en','ru','ua','de','vi','ro','tr','zh','ar','fr','es','it','sk','cs'
];

export function setLang(code: string) {
  i18n.changeLanguage(code);
  localStorage.setItem('rido_lang', code);
}

export default i18n;
