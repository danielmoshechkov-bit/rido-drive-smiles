import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Receipt, Building2, FileText, Calculator, Users, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuthModal } from '@/components/auth/AuthModal';
import { cn } from '@/lib/utils';

// Import tile image
import tileInvoicing from '@/assets/tile-invoicing.jpg';

interface AccountingCategoryModalProps {
  trigger: React.ReactNode;
  user?: any;
}

const accountingServices = [
  {
    id: 'faktury',
    title: 'Program do Faktur',
    description: 'Wystawiaj faktury VAT, proformy i korekty online',
    icon: Receipt,
    requiresAuth: true
  },
  {
    id: 'koszty',
    title: 'Ewidencja Kosztów',
    description: 'Zarządzaj wydatkami i dokumentami kosztowymi',
    icon: FileText,
    requiresAuth: true
  },
  {
    id: 'kontrahenci',
    title: 'Baza Kontrahentów',
    description: 'Weryfikacja VAT, historia transakcji',
    icon: Users,
    requiresAuth: true
  },
  {
    id: 'raporty',
    title: 'Raporty i Analizy',
    description: 'Podsumowania miesięczne, statystyki',
    icon: Calculator,
    requiresAuth: true
  }
];

export function AccountingCategoryModal({ trigger, user }: AccountingCategoryModalProps) {
  const [open, setOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingService, setPendingService] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleServiceClick = (service: typeof accountingServices[0]) => {
    if (service.requiresAuth && !user) {
      setPendingService(service.id);
      setShowAuthModal(true);
      return;
    }

    // Navigate to client portal with appropriate tab
    setOpen(false);
    navigate('/klient?tab=ksiegowosc');
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    setOpen(false);
    navigate('/klient?tab=ksiegowosc');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Receipt className="h-6 w-6 text-primary" />
              Księgowość Online
            </DialogTitle>
          </DialogHeader>

          {/* Hero section */}
          <div className="relative h-32 rounded-lg overflow-hidden mb-4">
            <img 
              src={tileInvoicing} 
              alt="Księgowość" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-primary/80 to-primary/40 flex items-center px-6">
              <div className="text-white">
                <h3 className="text-lg font-bold">Darmowy Program do Faktur</h3>
                <p className="text-sm opacity-90">Profesjonalne faktury dla Twojej firmy</p>
              </div>
            </div>
          </div>

          {/* Services grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {accountingServices.map((service) => {
              const Icon = service.icon;
              return (
                <Card 
                  key={service.id}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
                    "group"
                  )}
                  onClick={() => handleServiceClick(service)}
                >
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm flex items-center gap-1">
                        {service.title}
                        <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {service.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* CTA for non-logged users */}
          {!user && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-2">
                Zaloguj się, aby korzystać z pełnych funkcji księgowości
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="text-primary font-medium text-sm hover:underline"
              >
                Zaloguj się lub zarejestruj →
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AuthModal 
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        onSuccess={handleAuthSuccess}
        customDescription="Zaloguj się, aby wystawiać faktury i zarządzać księgowością"
      />
    </>
  );
}
