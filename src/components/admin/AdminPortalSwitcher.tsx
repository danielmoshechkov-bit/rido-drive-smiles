import { useNavigate, useLocation } from 'react-router-dom';
import { Building2, Car, ShoppingCart, ChevronDown, Map } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Portal {
  id: string;
  name: string;
  icon: React.ElementType;
  path: string;
  description: string;
}

const portals: Portal[] = [
  {
    id: 'fleet',
    name: 'Flota i Kierowcy',
    icon: Car,
    path: '/admin/dashboard',
    description: 'Zarządzanie flotami i kierowcami',
  },
  {
    id: 'realestate',
    name: 'Nieruchomości',
    icon: Building2,
    path: '/admin/nieruchomosci',
    description: 'Zarządzanie agencjami i ogłoszeniami',
  },
  {
    id: 'marketplace',
    name: 'Marketplace Pojazdów',
    icon: ShoppingCart,
    path: '/admin/marketplace',
    description: 'Zarządzanie giełdą pojazdów',
  },
  {
    id: 'maps',
    name: 'Mapy',
    icon: Map,
    path: '/admin/mapy',
    description: 'Zarządzanie modułem map',
  },
];

export function AdminPortalSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();

  const getCurrentPortal = () => {
    if (location.pathname.includes('/admin/nieruchomosci')) {
      return portals.find((p) => p.id === 'realestate');
    }
    if (location.pathname.includes('/admin/marketplace')) {
      return portals.find((p) => p.id === 'marketplace');
    }
    if (location.pathname.includes('/admin/mapy')) {
      return portals.find((p) => p.id === 'maps');
    }
    return portals.find((p) => p.id === 'fleet');
  };

  const currentPortal = getCurrentPortal();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 rounded-xl border-primary/20 bg-primary/5 hover:bg-primary/10"
        >
          {currentPortal && (
            <>
              <currentPortal.icon className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline font-medium">
                {currentPortal.name}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {portals.map((portal) => {
          const Icon = portal.icon;
          const isActive = currentPortal?.id === portal.id;

          return (
            <DropdownMenuItem
              key={portal.id}
              onClick={() => navigate(portal.path)}
              className={cn(
                'flex items-start gap-3 p-3 cursor-pointer',
                isActive && 'bg-primary/10'
              )}
            >
              <div
                className={cn(
                  'rounded-lg p-2',
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-muted'
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{portal.name}</div>
                <div className="text-xs text-muted-foreground">
                  {portal.description}
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
