import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  AlertCircle
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

  const handleSelectCategory = (category: string) => {
    if (category === 'services') {
      const servicesEnabled = features.vehicle_marketplace_services_enabled;
      if (!servicesEnabled) {
        toast.info("Przepraszamy, usługi są w budowie. Wkrótce dostępne!", {
          duration: 5000,
          icon: <AlertCircle className="h-5 w-5" />
        });
        return;
      }
      // TODO: Navigate to services page when ready
      toast.info("Usługi będą dostępne wkrótce");
      return;
    }
    
    onClose();
    
    if (category === 'vehicles') {
      navigate('/gielda/dodaj-pojazd');
    } else if (category === 'realestate') {
      navigate('/nieruchomosci/dodaj');
    }
  };

  const resetAndClose = () => {
    setStep(startStep);
    onClose();
  };

  const getTotalSteps = () => needsCompanyData ? 2 : 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && resetAndClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 1 && needsCompanyData && "Dane firmy"}
            {(step === 2 || !needsCompanyData) && "Wybierz kategorię"}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && needsCompanyData && "Uzupełnij dane firmy, aby móc wystawiać ogłoszenia"}
            {(step === 2 || !needsCompanyData) && "Co chcesz ogłosić?"}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        {getTotalSteps() > 1 && (
          <div className="flex gap-2 mb-4">
            {Array.from({ length: getTotalSteps() }).map((_, i) => (
              <div 
                key={i} 
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i + 1 <= (needsCompanyData ? step : 1) ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        )}

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

        {/* Step 2 (or Step 1 if no company data needed): Category Selection as Tiles */}
        {(step === 2 || !needsCompanyData) && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {/* Vehicles Tile */}
              <Card 
                className="cursor-pointer hover:border-primary hover:shadow-lg transition-all group"
                onClick={() => handleSelectCategory('vehicles')}
              >
                <CardContent className="p-6 text-center">
                  <div className="h-20 w-20 mx-auto mb-4 bg-blue-500/10 rounded-2xl flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                    <Car className="h-10 w-10 text-blue-500" />
                  </div>
                  <h3 className="font-semibold text-lg">Giełda Aut</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Samochody osobowe i dostawcze
                  </p>
                </CardContent>
              </Card>

              {/* Real Estate Tile */}
              <Card 
                className="cursor-pointer hover:border-primary hover:shadow-lg transition-all group"
                onClick={() => handleSelectCategory('realestate')}
              >
                <CardContent className="p-6 text-center">
                  <div className="h-20 w-20 mx-auto mb-4 bg-green-500/10 rounded-2xl flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                    <Building2 className="h-10 w-10 text-green-500" />
                  </div>
                  <h3 className="font-semibold text-lg">Nieruchomości</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Mieszkania, domy, działki
                  </p>
                </CardContent>
              </Card>

              {/* Services Tile */}
              <Card 
                className="cursor-pointer hover:border-primary hover:shadow-lg transition-all group relative"
                onClick={() => handleSelectCategory('services')}
              >
                <CardContent className="p-6 text-center">
                  <div className="h-20 w-20 mx-auto mb-4 bg-orange-500/10 rounded-2xl flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                    <Wrench className="h-10 w-10 text-orange-500" />
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
            </div>

            <div className="flex justify-between pt-2">
              {needsCompanyData && step === 2 && (
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Wstecz
                </Button>
              )}
              <Button variant="ghost" onClick={resetAndClose} className={needsCompanyData && step === 2 ? "" : "ml-auto"}>
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