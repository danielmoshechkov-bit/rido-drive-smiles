import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useTranslation } from 'react-i18next';

const LanguageSelector = () => {
  const { i18n } = useTranslation();
  const currentLanguage = i18n.language.toUpperCase();

  const languages = [
    { code: "PL", name: "Polski", flag: "🇵🇱" },
    { code: "EN", name: "English", flag: "🇬🇧" },
    { code: "RU", name: "Русский", flag: "🇷🇺" },
    { code: "UA", name: "Українська", flag: "🇺🇦" },
    { code: "KZ", name: "Қазақша", flag: "🇰🇿" },
  ];

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode.toLowerCase());
  };

  const currentLang = languages.find(lang => lang.code === currentLanguage);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2 min-w-[80px]">
          <span>{currentLang?.flag}</span>
          <span className="text-xs">{currentLanguage}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="min-w-[160px] bg-background border border-border shadow-xl"
        sideOffset={5}
      >
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            className={`cursor-pointer ${
              currentLanguage === language.code 
                ? "bg-primary/10 text-primary font-medium" 
                : ""
            }`}
          >
            <span className="text-lg mr-3">{language.flag}</span>
            <span>{language.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSelector;
