import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files
import pl from './locales/pl.json';
import en from './locales/en.json';
import ru from './locales/ru.json';
import ua from './locales/ua.json';
import kz from './locales/kz.json';

const resources = {
  pl: { translation: pl },
  en: { translation: en },
  ru: { translation: ru },
  ua: { translation: ua },
  kz: { translation: kz },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'pl', // default language
    fallbackLng: 'pl',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;