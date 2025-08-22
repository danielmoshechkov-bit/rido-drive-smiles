import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export const useDocumentTitle = () => {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.title = t('meta.title');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
    document.querySelector('meta[name="keywords"]')?.setAttribute('content', t('meta.keywords'));
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', t('meta.title'));
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', t('meta.description'));
  }, [t, i18n.language]);
};