import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { ChevronDown, User, Shield, Building, LogOut, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

interface UserDropdownProps {
  userName: string;
  userRole?: string;
  userEmail?: string;
  fleetName?: string;
  onLogout: () => void;
}

export const UserDropdown = ({ 
  userName, 
  userRole, 
  userEmail, 
  fleetName,
  onLogout
}: UserDropdownProps) => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

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

  const handleLogout = () => {
    setIsOpen(false);
    setTimeout(() => onLogout(), 100);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 h-9 px-3">
          <span className="text-xs font-medium max-w-[120px] truncate">{userName}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 bg-card border shadow-lg z-50">
        <DropdownMenuLabel className="font-semibold">
          Informacje o koncie
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {userEmail && (
          <DropdownMenuItem disabled className="opacity-70">
            <User className="mr-2 h-4 w-4" />
            <span className="text-xs truncate">{userEmail}</span>
          </DropdownMenuItem>
        )}
        
        {userRole && (
          <DropdownMenuItem disabled className="opacity-70">
            <Shield className="mr-2 h-4 w-4" />
            <span className="text-xs">Rola: {userRole}</span>
          </DropdownMenuItem>
        )}
        
        {fleetName && (
          <DropdownMenuItem disabled className="opacity-70">
            <Building className="mr-2 h-4 w-4" />
            <span className="text-xs truncate">Flota: {fleetName}</span>
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuLabel className="text-xs font-semibold flex items-center gap-2">
          <Globe className="h-3 w-3" />
          Język / Language
        </DropdownMenuLabel>
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            className={`text-xs cursor-pointer ${i18n.language === language.code ? "bg-muted font-semibold" : ""}`}
          >
            <span className="mr-2">{language.flag}</span>
            <span>{language.name}</span>
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          <span className="text-xs font-semibold">Wyloguj</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
