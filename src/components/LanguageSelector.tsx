import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const LanguageSelector = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState("PL");

  const languages = [
    { code: "PL", name: "Polski", flag: "🇵🇱" },
    { code: "EN", name: "English", flag: "🇬🇧" },
    { code: "RU", name: "Русский", flag: "🇷🇺" },
    { code: "UA", name: "Українська", flag: "🇺🇦" },
    { code: "KZ", name: "Қазақша", flag: "🇰🇿" },
  ];

  const handleLanguageChange = (langCode: string) => {
    setCurrentLanguage(langCode);
    setIsOpen(false);
    // Here you would implement actual language switching logic
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 min-w-[80px]"
      >
        <span>{languages.find(lang => lang.code === currentLanguage)?.flag}</span>
        <span className="text-xs">{currentLanguage}</span>
      </Button>

      {isOpen && (
        <Card className="absolute top-full right-0 mt-2 py-2 z-50 min-w-[120px]">
          {languages.map((language) => (
            <button
              key={language.code}
              onClick={() => handleLanguageChange(language.code)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 ${
                currentLanguage === language.code ? "bg-muted" : ""
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