import { useTranslation } from 'react-i18next';
import { PORTAL_LANGS, setLang } from '@/i18n';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = PORTAL_LANGS.find(l => l.code === i18n.language) || PORTAL_LANGS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="flex items-center gap-1.5 px-2 h-8">
          <Globe className="h-3.5 w-3.5" />
          <span className="text-base leading-none">{current.flag}</span>
          <span className="text-xs font-medium uppercase hidden sm:inline">{current.code}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {PORTAL_LANGS.map(lang => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLang(lang.code)}
            className={i18n.language === lang.code ? 'bg-primary/10 font-medium' : ''}
          >
            <span className="mr-2 text-base">{lang.flag}</span>
            {lang.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
