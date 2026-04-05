import { useNavigate, useLocation } from 'react-router-dom';
import { Building2, Car, ShoppingCart, ChevronDown, Map, Globe, Wrench, Calculator, Briefcase, Brain, Shield, Bot, Megaphone } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Portal {
  id: string;
  name: string;
  icon: React.ElementType;
  path: string;
  description: string;
  isGlobal?: boolean;
}

const portals: Portal[] = [
  {
    id: 'portal',
    name: 'Portal GetRido',
    icon: Globe,
    path: '/admin/portal',
    description: 'Globalne ustawienia portalu',
    isGlobal: true,
  },
  {
    id: 'ai-brain',
    name: 'Centrum AI',
    icon: Brain,
    path: '/admin/ai',
    description: 'Mózg platformy – klucze API, routing AI',
    isGlobal: true,
  },
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
    id: 'ridomarket',
    name: 'RidoMarket',
    icon: ShoppingCart,
    path: '/admin/ridomarket',
    description: 'Ogłoszenia ogólne — marketplace z AI',
  },
  {
    id: 'maps',
    name: 'Mapy',
    icon: Map,
    path: '/admin/mapy',
    description: 'Zarządzanie modułem map',
  },
  {
    id: 'services',
    name: 'Usługi',
    icon: Wrench,
    path: '/admin/uslugi',
    description: 'Zarządzanie usługami i wykonawcami',
  },
  {
    id: 'sales',
    name: 'Sprzedaż / CRM',
    icon: Briefcase,
    path: '/sprzedaz',
    description: 'Panel handlowca i CRM',
  },
  {
    id: 'accounting',
    name: 'Księgowość',
    icon: Calculator,
    path: '/ksiegowosc',
    description: 'Panel księgowy i faktury',
  },
  {
    id: 'ksef',
    name: 'KSeF',
    icon: Shield,
    path: '/admin/portal?tab=ksef-admin',
    description: 'Monitor KSeF i zarządzanie firmami',
  },
  {
    id: 'ai-agents',
    name: 'Agenci AI',
    icon: Bot,
    path: '/admin/agenci-ai',
    description: 'Zarządzanie agentami AI systemu',
  },
  {
    id: 'marketing',
    name: 'Marketing Agency',
    icon: Megaphone,
    path: '/admin/marketing',
    description: 'Agencja reklamowa i kampanie AI',
  },
];

export function AdminPortalSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();

  const getCurrentPortal = () => {
    if (location.pathname.includes('/admin/marketing')) {
      return portals.find((p) => p.id === 'marketing');
    }
    if (location.pathname.includes('/admin/agenci-ai')) {
      return portals.find((p) => p.id === 'ai-agents');
    }
    if (location.pathname.includes('/admin/ai')) {
      return portals.find((p) => p.id === 'ai-brain');
    }
    if (location.pathname.includes('/admin/portal')) {
      return portals.find((p) => p.id === 'portal');
    }
    if (location.pathname.includes('/admin/nieruchomosci')) {
      return portals.find((p) => p.id === 'realestate');
    }
    if (location.pathname.includes('/admin/ridomarket')) {
      return portals.find((p) => p.id === 'ridomarket');
    }
    if (location.pathname.includes('/admin/marketplace')) {
      return portals.find((p) => p.id === 'marketplace');
    }
    if (location.pathname.includes('/admin/mapy')) {
      return portals.find((p) => p.id === 'maps');
    }
    if (location.pathname.includes('/admin/uslugi')) {
      return portals.find((p) => p.id === 'services');
    }
    if (location.pathname.includes('/ksiegowosc')) {
      return portals.find((p) => p.id === 'accounting');
    }
    if (location.pathname.includes('/sprzedaz') || location.pathname.includes('/handlowiec')) {
      return portals.find((p) => p.id === 'sales');
    }
    if (location.search.includes('tab=ksef-admin')) {
      return portals.find((p) => p.id === 'ksef');
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
      <DropdownMenuContent align="start" className="w-64 max-h-[70vh] overflow-y-auto p-0">
        <div className="max-h-[70vh] overflow-y-auto p-1">
        {portals.filter(p => p.isGlobal).map((portal) => {
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
        
        <DropdownMenuSeparator />
        {portals.filter(p => !p.isGlobal).map((portal) => {
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
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
