import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, User, Shield, Building, LogOut, Globe } from "lucide-react";
import { useGlobalDropdown } from "@/hooks/useGlobalDropdown";
import { useTranslation } from 'react-i18next';

interface UserDropdownProps {
  userName: string;
  userRole: string;
  userEmail?: string;
  fleetName?: string;
  onLogout?: () => void;
  showLanguageInside?: boolean;
}

export const UserDropdown = ({ 
  userName, 
  userRole, 
  userEmail, 
  fleetName,
  onLogout,
  showLanguageInside = false 
}: UserDropdownProps) => {
  const { t, i18n } = useTranslation();
  const { openDropdown, setOpenDropdown } = useGlobalDropdown();
  const dropdownId = "user-dropdown";
  const isOpen = openDropdown === dropdownId;

  const handleOpenChange = (open: boolean) => {
    setOpenDropdown(open ? dropdownId : null);
  };

  const languages = [
    { code: "pl", name: "Polski", flag: "🇵🇱" },
    { code: "en", name: "English", flag: "🇬🇧" },
    { code: "ru", name: "Русский", flag: "🇷🇺" },
    { code: "ua", name: "Українська", flag: "🇺🇦" },
    { code: "kz", name: "Қазақша", flag: "🇰🇿" },
  ];

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <span className="text-xs">{userName}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-card z-50">
        <DropdownMenuLabel>{t('userDropdown.accountInfo')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* User Info */}
        {userEmail && (
          <DropdownMenuItem disabled>
            <User className="mr-2 h-4 w-4" />
            <span className="text-xs">{userEmail}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled>
          <Shield className="mr-2 h-4 w-4" />
          <span className="text-xs">{t('userDropdown.role')}: {userRole}</span>
        </DropdownMenuItem>
        {fleetName && (
          <DropdownMenuItem disabled>
            <Building className="mr-2 h-4 w-4" />
            <span className="text-xs">{t('userDropdown.fleet')}: {fleetName}</span>
          </DropdownMenuItem>
        )}
        
        {/* Language Selector (if enabled) */}
        {showLanguageInside && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {t('userDropdown.language')}
              </div>
            </DropdownMenuLabel>
            {languages.map((language) => (
              <DropdownMenuItem
                key={language.code}
                onClick={() => i18n.changeLanguage(language.code)}
                className={i18n.language === language.code ? "bg-muted" : ""}
              >
                <span className="mr-2">{language.flag}</span>
                <span className="text-xs">{language.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        
        {/* Logout */}
        {onLogout && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              <span className="text-xs">{t('userDropdown.logout')}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
