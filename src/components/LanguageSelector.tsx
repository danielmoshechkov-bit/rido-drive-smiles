import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

const LanguageSelector = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { i18n } = useTranslation();

  const languages = [
    { code: "pl", name: "Polski", flag: "🇵🇱" },
    { code: "en", name: "English", flag: "🇬🇧" },
    { code: "ru", name: "Русский", flag: "🇷🇺" },
    { code: "ua", name: "Українська", flag: "🇺🇦" },
    { code: "kz", name: "Қазақша", flag: "🇰🇿" },
  ];

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setIsOpen(false);
  };

  const currentLanguage = i18n.language.toUpperCase();

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 min-w-[80px]"
      >
        <span>{languages.find(lang => lang.code === i18n.language)?.flag}</span>
        <span className="text-xs">{currentLanguage}</span>
      </Button>

      {isOpen && (
        <Card className="absolute top-full right-0 mt-2 py-2 z-50 min-w-[120px]">
          {languages.map((language) => (
            <button
              key={language.code}
              onClick={() => handleLanguageChange(language.code)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 ${
                i18n.language === language.code ? "bg-muted" : ""
              }`}
            >
              <span>{language.flag}</span>
              <span>{language.name}</span>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
};

export default LanguageSelector;