import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from 'react-i18next';

const LanguageSelector = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const currentLanguage = i18n.language.toUpperCase();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const languages = [
    { code: "PL", name: "Polski", flag: "🇵🇱" },
    { code: "EN", name: "English", flag: "🇬🇧" },
    { code: "RU", name: "Русский", flag: "🇷🇺" },
    { code: "UA", name: "Українська", flag: "🇺🇦" },
    { code: "KZ", name: "Қазақша", flag: "🇰🇿" },
  ];

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode.toLowerCase());
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
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
        <div 
          className="absolute top-full right-0 mt-2 py-2 min-w-[160px] bg-white dark:bg-gray-800 rounded-lg border border-border shadow-xl"
          style={{ zIndex: 9999, pointerEvents: 'auto' }}
        >
          {languages.map((language) => (
            <button
              key={language.code}
              type="button"
              onClick={() => handleLanguageChange(language.code)}
              className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 cursor-pointer transition-colors ${
                currentLanguage === language.code 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "hover:bg-gray-100 dark:hover:bg-gray-700 text-foreground"
              }`}
              style={{ pointerEvents: 'auto' }}
            >
              <span className="text-lg">{language.flag}</span>
              <span>{language.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
