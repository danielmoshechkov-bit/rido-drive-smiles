import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import logo from '@/assets/logo.svg';

/**
 * Brandowany loader pokazywany przy tłumaczeniu treści na żywo (języki spoza
 * bazowych PL/EN/RU/UA, dla których nie ma jeszcze pre-tłumaczenia w cache).
 * Zamiast "flasha" języka źródłowego klient/użytkownik widzi nasze logo + spinner,
 * a po przetłumaczeniu (zapisanym do cache) treść pojawia się od razu.
 */
export function TranslationLoader({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-16 text-center ${className}`}>
      <img src={logo} alt="GetRido" className="h-9 w-auto opacity-90" />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        {t('workshop.translation.loading', 'Tłumaczę treść…')}
      </div>
    </div>
  );
}
