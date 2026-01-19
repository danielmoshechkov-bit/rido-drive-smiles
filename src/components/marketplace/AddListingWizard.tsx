import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Car, Building2, Wrench, ArrowRight, ArrowLeft, X,
  CheckCircle2, AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";

interface AddListingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  accountMode: string;
  profile: {
    id: string;
    company_name?: string | null;
    company_nip?: string | null;
    company_address?: string | null;
    company_city?: string | null;
    company_contact_person?: string | null;
    company_contact_phone?: string | null;
  } | null;
  onProfileUpdate: (data: any) => void;
}

export function AddListingWizard({ 
  isOpen, 
  onClose, 
  accountMode, 
  profile,
  onProfileUpdate 
}: AddListingWizardProps) {
  const navigate = useNavigate();
  const { features } = useFeatureToggles();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  
  // Company data form (for business accounts)
  const [companyData, setCompanyData] = useState({
    company_name: profile?.company_name || "",
    company_nip: profile?.company_nip || "",
    company_address: profile?.company_address || "",
    company_city: profile?.company_city || "",
    company_contact_person: profile?.company_contact_person || "",
    company_contact_phone: profile?.company_contact_phone || "",
  });

  const [listingType, setListingType] = useState<'sales' | 'services' | null>(null);

  const needsCompanyData = accountMode === 'business' && !profile?.company_nip;
  const startStep = needsCompanyData ? 1 : 2;

  const handleSaveCompanyData = async () => {
    if (!companyData.company_name || !companyData.company_nip) {
      toast.error("Wypełnij wymagane pola: Nazwa firmy i NIP");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("marketplace_user_profiles")
        .update({
          company_name: companyData.company_name,
          company_nip: companyData.company_nip,
          company_address: companyData.company_address,
          company_city: companyData.company_city,
          company_contact_person: companyData.company_contact_person,
          company_contact_phone: companyData.company_contact_phone,
        })
        .eq("id", profile?.id);

      if (error) throw error;

      onProfileUpdate(companyData);
      setStep(2);
    } catch (error) {
      console.error("Error saving company data:", error);
      toast.error("Błąd zapisywania danych firmy");
    } finally {
      setSaving(false);
    }
  };

  const handleSelectListingType = (type: 'sales' | 'services') => {
    if (type === 'services') {
      const servicesEnabled = features.vehicle_marketplace_services_enabled;
      if (!servicesEnabled) {
        toast.info("Przepraszamy, usługi są w budowie. Wkrótce dostępne!", {
          duration: 5000,
          icon: <AlertCircle className="h-5 w-5" />
        });
        return;
      }
    }
    
    setListingType(type);
    setStep(3);
  };

  const handleSelectCategory = (category: string) => {
    onClose();
    
    if (category === 'vehicles') {
      navigate('/gielda/dodaj-pojazd');
    } else if (category === 'realestate') {
      navigate('/nieruchomosci/dodaj');
    }
  };

  const resetAndClose = () => {
    setStep(startStep);
    setListingType(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && resetAndClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 1 && "Dane firmy"}
            {step === 2 && "Typ ogłoszenia"}
            {step === 3 && "Wybierz kategorię"}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Uzupełnij dane firmy, aby móc wystawiać ogłoszenia"}
            {step === 2 && "Co chcesz ogłosić?"}
            {step === 3 && "Wybierz kategorię dla swojego ogłoszenia"}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex gap-2 mb-4">
          {[needsCompanyData ? 1 : null, 2, 3].filter(Boolean).map((s, i) => (
            <div 
              key={i} 
              className={`h-1.5 flex-1 rounded-full transition-colors ${(s as number) <= step ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>

        {/* Step 1: Company Data (only for business without data) */}
        {step === 1 && needsCompanyData && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nazwa firmy *</Label>
                <Input
                  value={companyData.company_name}
                  onChange={(e) => setCompanyData({ ...companyData, company_name: e.target.value })}
                  placeholder="Firma Sp. z o.o."
                />
              </div>
              <div className="space-y-2">
                <Label>NIP *</Label>
                <Input
                  value={companyData.company_nip}
                  onChange={(e) => setCompanyData({ ...companyData, company_nip: e.target.value })}
                  placeholder="1234567890"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Adres</Label>
                <Input
                  value={companyData.company_address}
                  onChange={(e) => setCompanyData({ ...companyData, company_address: e.target.value })}
                  placeholder="ul. Główna 1"
                />
              </div>
              <div className="space-y-2">
                <Label>Miasto</Label>
                <Input
                  value={companyData.company_city}
                  onChange={(e) => setCompanyData({ ...companyData, company_city: e.target.value })}
                  placeholder="Warszawa"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Osoba kontaktowa</Label>
                <Input
                  value={companyData.company_contact_person}
                  onChange={(e) => setCompanyData({ ...companyData, company_contact_person: e.target.value })}
                  placeholder="Jan Kowalski"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefon kontaktowy</Label>
                <Input
                  value={companyData.company_contact_phone}
                  onChange={(e) => setCompanyData({ ...companyData, company_contact_phone: e.target.value })}
                  placeholder="+48 123 456 789"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={resetAndClose}>
                Anuluj
              </Button>
              <Button onClick={handleSaveCompanyData} disabled={saving}>
                {saving ? "Zapisywanie..." : "Dalej"}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Listing Type */}
        {step === 2 && (
          <div className="grid grid-cols-2 gap-4">
            <Card 
              className="cursor-pointer hover:border-primary hover:shadow-lg transition-all group"
              onClick={() => handleSelectListingType('sales')}
            >
              <CardContent className="p-6 text-center">
                <div className="h-16 w-16 mx-auto mb-4 bg-primary/10 rounded-2xl flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Car className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">Sprzedaż</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Pojazdy, nieruchomości i inne
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:border-primary hover:shadow-lg transition-all group relative"
              onClick={() => handleSelectListingType('services')}
            >
              <CardContent className="p-6 text-center">
                <div className="h-16 w-16 mx-auto mb-4 bg-orange-500/10 rounded-2xl flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                  <Wrench className="h-8 w-8 text-orange-500" />
                </div>
                <h3 className="font-semibold text-lg">Usługi</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Warsztaty, myjnie, serwis
                </p>
                {!features.vehicle_marketplace_services_enabled && (
                  <span className="absolute top-2 right-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                    Wkrótce
                  </span>
                )}
              </CardContent>
            </Card>

            <div className="col-span-2 flex justify-start pt-2">
              <Button variant="ghost" onClick={resetAndClose}>
                <X className="h-4 w-4 mr-2" />
                Anuluj
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Category Selection */}
        {step === 3 && listingType === 'sales' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card 
                className="cursor-pointer hover:border-primary hover:shadow-lg transition-all group"
                onClick={() => handleSelectCategory('vehicles')}
              >
                <CardContent className="p-6 text-center">
                  <div className="h-16 w-16 mx-auto mb-4 bg-blue-500/10 rounded-2xl flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                    <Car className="h-8 w-8 text-blue-500" />
                  </div>
                  <h3 className="font-semibold">Giełda Aut</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Samochody osobowe i dostawcze
                  </p>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:border-primary hover:shadow-lg transition-all group"
                onClick={() => handleSelectCategory('realestate')}
              >
                <CardContent className="p-6 text-center">
                  <div className="h-16 w-16 mx-auto mb-4 bg-green-500/10 rounded-2xl flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                    <Building2 className="h-8 w-8 text-green-500" />
                  </div>
                  <h3 className="font-semibold">Nieruchomości</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Mieszkania, domy, działki
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Wstecz
              </Button>
              <Button variant="ghost" onClick={resetAndClose}>
                <X className="h-4 w-4 mr-2" />
                Anuluj
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}