import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, User, Shield, Building } from "lucide-react";
import { useGlobalDropdown } from "@/hooks/useGlobalDropdown";
import { useEffect } from "react";

interface UserDropdownProps {
  userName: string;
  userRole: string;
  userEmail?: string;
  fleetName?: string;
}

export const UserDropdown = ({ userName, userRole, userEmail, fleetName }: UserDropdownProps) => {
  const { openDropdown, setOpenDropdown } = useGlobalDropdown();
  const dropdownId = "user-dropdown";
  const isOpen = openDropdown === dropdownId;

  const handleOpenChange = (open: boolean) => {
    setOpenDropdown(open ? dropdownId : null);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <span className="text-xs">{userName}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-card z-50">
        <DropdownMenuLabel>Informacje o koncie</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {userEmail && (
          <DropdownMenuItem disabled>
            <User className="mr-2 h-4 w-4" />
            <span className="text-xs">{userEmail}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled>
          <Shield className="mr-2 h-4 w-4" />
          <span className="text-xs">Rola: {userRole}</span>
        </DropdownMenuItem>
        {fleetName && (
          <DropdownMenuItem disabled>
            <Building className="mr-2 h-4 w-4" />
            <span className="text-xs">Flota: {fleetName}</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
