import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Building, ArrowLeft, ArrowRight, Check, AlertTriangle,
  User, Phone, Mail, MapPin, FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface FormData {
  // Company
  companyName: string;
  companyNip: string;
  companyRegon: string;
  companyAddress: string;
  companyCity: string;
  companyPostalCode: string;
  
  // Owner
  ownerFirstName: string;
  ownerLastName: string;
  ownerPhone: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerPasswordConfirm: string;
  
  // Guardian (optional)
  guardianFirstName: string;
  guardianLastName: string;
  guardianPhone: string;
  guardianEmail: string;
  
  // Consents
  termsAccepted: boolean;
  exclusivityAccepted: boolean;
}

const INITIAL_FORM_DATA: FormData = {
  companyName: "",
  companyNip: "",
  companyRegon: "",
  companyAddress: "",
  companyCity: "",
  companyPostalCode: "",
  ownerFirstName: "",
  ownerLastName: "",
  ownerPhone: "",
  ownerEmail: "",
  ownerPassword: "",
  ownerPasswordConfirm: "",
  guardianFirstName: "",
  guardianLastName: "",
  guardianPhone: "",
  guardianEmail: "",
  termsAccepted: false,
  exclusivityAccepted: false,
};

const STEPS = [
  { id: 1, title: "Dane firmy", icon: Building },
  { id: 2, title: "Właściciel", icon: User },
  { id: 3, title: "Opiekun", icon: Phone },
  { id: 4, title: "Potwierdzenie", icon: Check },
];

export default function RealEstateAgentRegister() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (step === 1) {
      if (!formData.companyName) newErrors.companyName = "Wymagane";
      if (!formData.companyNip) newErrors.companyNip = "Wymagane";
      if (formData.companyNip && !/^\d{10}$/.test(formData.companyNip.replace(/[- ]/g, ""))) {
        newErrors.companyNip = "NIP musi mieć 10 cyfr";
      }
      if (!formData.companyAddress) newErrors.companyAddress = "Wymagane";
      if (!formData.companyCity) newErrors.companyCity = "Wymagane";
    }

    if (step === 2) {
      if (!formData.ownerFirstName) newErrors.ownerFirstName = "Wymagane";
      if (!formData.ownerLastName) newErrors.ownerLastName = "Wymagane";
      if (!formData.ownerPhone) newErrors.ownerPhone = "Wymagane";
      if (!formData.ownerEmail) newErrors.ownerEmail = "Wymagane";
      if (formData.ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.ownerEmail)) {
        newErrors.ownerEmail = "Nieprawidłowy email";
      }
      if (!formData.ownerPassword) newErrors.ownerPassword = "Wymagane";
      if (formData.ownerPassword && formData.ownerPassword.length < 6) {
        newErrors.ownerPassword = "Min. 6 znaków";
      }
      if (formData.ownerPassword !== formData.ownerPasswordConfirm) {
        newErrors.ownerPasswordConfirm = "Hasła nie są identyczne";
      }
    }

    if (step === 4) {
      if (!formData.termsAccepted) newErrors.termsAccepted = "Musisz zaakceptować regulamin";
      if (!formData.exclusivityAccepted) newErrors.exclusivityAccepted = "Musisz zaakceptować zasady wyłączności";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 4));
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(4)) return;

    setLoading(true);
    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.ownerEmail,
        password: formData.ownerPassword,
        options: {
          data: {
            first_name: formData.ownerFirstName,
            last_name: formData.ownerLastName,
          },
        },
      });

      if (authError) throw authError;

      if (authData.user) {
        // 2. Create agent profile
        const { error: agentError } = await supabase
          .from("real_estate_agents" as any)
          .insert({
            user_id: authData.user.id,
            company_name: formData.companyName,
            company_nip: formData.companyNip.replace(/[- ]/g, ""),
            company_regon: formData.companyRegon || null,
            company_address: formData.companyAddress,
            company_city: formData.companyCity,
            company_postal_code: formData.companyPostalCode || null,
            owner_first_name: formData.ownerFirstName,
            owner_last_name: formData.ownerLastName,
            owner_phone: formData.ownerPhone,
            owner_email: formData.ownerEmail,
            guardian_first_name: formData.guardianFirstName || null,
            guardian_last_name: formData.guardianLastName || null,
            guardian_phone: formData.guardianPhone || null,
            guardian_email: formData.guardianEmail || null,
            status: "pending",
          });

        if (agentError) throw agentError;

        toast.success("Konto zostało utworzone! Sprawdź email, aby potwierdzić rejestrację.");
        navigate("/nieruchomosci");
      }
    } catch (error: any) {
      console.error("Registration error:", error);
      toast.error(error.message || "Błąd rejestracji. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="companyName">Nazwa firmy *</Label>
              <Input
                id="companyName"
                value={formData.companyName}
                onChange={(e) => updateField("companyName", e.target.value)}
                placeholder="np. Nieruchomości Premium Sp. z o.o."
                className={errors.companyName ? "border-destructive" : ""}
              />
              {errors.companyName && (
                <p className="text-xs text-destructive mt-1">{errors.companyName}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="companyNip">NIP *</Label>
                <Input
                  id="companyNip"
                  value={formData.companyNip}
                  onChange={(e) => updateField("companyNip", e.target.value)}
                  placeholder="1234567890"
                  className={errors.companyNip ? "border-destructive" : ""}
                />
                {errors.companyNip && (
                  <p className="text-xs text-destructive mt-1">{errors.companyNip}</p>
                )}
              </div>
              <div>
                <Label htmlFor="companyRegon">REGON</Label>
                <Input
                  id="companyRegon"
                  value={formData.companyRegon}
                  onChange={(e) => updateField("companyRegon", e.target.value)}
                  placeholder="Opcjonalnie"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="companyAddress">Adres *</Label>
              <Input
                id="companyAddress"
                value={formData.companyAddress}
                onChange={(e) => updateField("companyAddress", e.target.value)}
                placeholder="ul. Przykładowa 10/5"
                className={errors.companyAddress ? "border-destructive" : ""}
              />
              {errors.companyAddress && (
                <p className="text-xs text-destructive mt-1">{errors.companyAddress}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="companyCity">Miasto *</Label>
                <Input
                  id="companyCity"
                  value={formData.companyCity}
                  onChange={(e) => updateField("companyCity", e.target.value)}
                  placeholder="Kraków"
                  className={errors.companyCity ? "border-destructive" : ""}
                />
                {errors.companyCity && (
                  <p className="text-xs text-destructive mt-1">{errors.companyCity}</p>
                )}
              </div>
              <div>
                <Label htmlFor="companyPostalCode">Kod pocztowy</Label>
                <Input
                  id="companyPostalCode"
                  value={formData.companyPostalCode}
                  onChange={(e) => updateField("companyPostalCode", e.target.value)}
                  placeholder="00-000"
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ownerFirstName">Imię *</Label>
                <Input
                  id="ownerFirstName"
                  value={formData.ownerFirstName}
                  onChange={(e) => updateField("ownerFirstName", e.target.value)}
                  className={errors.ownerFirstName ? "border-destructive" : ""}
                />
                {errors.ownerFirstName && (
                  <p className="text-xs text-destructive mt-1">{errors.ownerFirstName}</p>
                )}
              </div>
              <div>
                <Label htmlFor="ownerLastName">Nazwisko *</Label>
                <Input
                  id="ownerLastName"
                  value={formData.ownerLastName}
                  onChange={(e) => updateField("ownerLastName", e.target.value)}
                  className={errors.ownerLastName ? "border-destructive" : ""}
                />
                {errors.ownerLastName && (
                  <p className="text-xs text-destructive mt-1">{errors.ownerLastName}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="ownerPhone">Telefon *</Label>
              <Input
                id="ownerPhone"
                type="tel"
                value={formData.ownerPhone}
                onChange={(e) => updateField("ownerPhone", e.target.value)}
                placeholder="+48 123 456 789"
                className={errors.ownerPhone ? "border-destructive" : ""}
              />
              {errors.ownerPhone && (
                <p className="text-xs text-destructive mt-1">{errors.ownerPhone}</p>
              )}
            </div>

            <div>
              <Label htmlFor="ownerEmail">Email (login) *</Label>
              <Input
                id="ownerEmail"
                type="email"
                value={formData.ownerEmail}
                onChange={(e) => updateField("ownerEmail", e.target.value)}
                placeholder="kontakt@firma.pl"
                className={errors.ownerEmail ? "border-destructive" : ""}
              />
              {errors.ownerEmail && (
                <p className="text-xs text-destructive mt-1">{errors.ownerEmail}</p>
              )}
            </div>

            <div>
              <Label htmlFor="ownerPassword">Hasło *</Label>
              <Input
                id="ownerPassword"
                type="password"
                value={formData.ownerPassword}
                onChange={(e) => updateField("ownerPassword", e.target.value)}
                placeholder="Min. 6 znaków"
                className={errors.ownerPassword ? "border-destructive" : ""}
              />
              {errors.ownerPassword && (
                <p className="text-xs text-destructive mt-1">{errors.ownerPassword}</p>
              )}
            </div>

            <div>
              <Label htmlFor="ownerPasswordConfirm">Powtórz hasło *</Label>
              <Input
                id="ownerPasswordConfirm"
                type="password"
                value={formData.ownerPasswordConfirm}
                onChange={(e) => updateField("ownerPasswordConfirm", e.target.value)}
                className={errors.ownerPasswordConfirm ? "border-destructive" : ""}
              />
              {errors.ownerPasswordConfirm && (
                <p className="text-xs text-destructive mt-1">{errors.ownerPasswordConfirm}</p>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <Alert>
              <Phone className="h-4 w-4" />
              <AlertDescription>
                Opiekun to osoba kontaktowa dla klientów. Jeśli właściciel jest 
                jednocześnie opiekunem, możesz pominąć ten krok.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="guardianFirstName">Imię opiekuna</Label>
                <Input
                  id="guardianFirstName"
                  value={formData.guardianFirstName}
                  onChange={(e) => updateField("guardianFirstName", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="guardianLastName">Nazwisko opiekuna</Label>
                <Input
                  id="guardianLastName"
                  value={formData.guardianLastName}
                  onChange={(e) => updateField("guardianLastName", e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="guardianPhone">Telefon opiekuna</Label>
              <Input
                id="guardianPhone"
                type="tel"
                value={formData.guardianPhone}
                onChange={(e) => updateField("guardianPhone", e.target.value)}
                placeholder="+48 123 456 789"
              />
            </div>

            <div>
              <Label htmlFor="guardianEmail">Email opiekuna</Label>
              <Input
                id="guardianEmail"
                type="email"
                value={formData.guardianEmail}
                onChange={(e) => updateField("guardianEmail", e.target.value)}
                placeholder="opiekun@firma.pl"
              />
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <h4 className="font-medium">Podsumowanie</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Firma:</span>
                <span className="font-medium">{formData.companyName}</span>
                <span className="text-muted-foreground">NIP:</span>
                <span className="font-medium">{formData.companyNip}</span>
                <span className="text-muted-foreground">Właściciel:</span>
                <span className="font-medium">{formData.ownerFirstName} {formData.ownerLastName}</span>
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium">{formData.ownerEmail}</span>
              </div>
            </div>

            {/* Consents */}
            <Alert variant="destructive" className="border-orange-500/50 bg-orange-500/10">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <AlertDescription className="text-orange-700">
                <strong>Ważne!</strong> Na portalu RIDO Nieruchomości możesz dodawać 
                tylko ogłoszenia na wyłączność Twojej agencji. Złamanie tej zasady 
                skutkuje blokadą konta.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="termsAccepted"
                  checked={formData.termsAccepted}
                  onCheckedChange={(checked) => updateField("termsAccepted", !!checked)}
                />
                <label htmlFor="termsAccepted" className="text-sm leading-tight cursor-pointer">
                  Akceptuję <a href="#" className="text-primary underline">regulamin</a> i{" "}
                  <a href="#" className="text-primary underline">politykę prywatności</a> portalu 
                  RIDO Nieruchomości. *
                </label>
              </div>
              {errors.termsAccepted && (
                <p className="text-xs text-destructive ml-7">{errors.termsAccepted}</p>
              )}

              <div className="flex items-start gap-3">
                <Checkbox
                  id="exclusivityAccepted"
                  checked={formData.exclusivityAccepted}
                  onCheckedChange={(checked) => updateField("exclusivityAccepted", !!checked)}
                />
                <label htmlFor="exclusivityAccepted" className="text-sm leading-tight cursor-pointer">
                  <strong>Oświadczam</strong>, że będę dodawał tylko nieruchomości, 
                  które są na wyłączność mojej agencji. Rozumiem, że złamanie tej 
                  zasady skutkuje blokadą konta lub karą finansową. *
                </label>
              </div>
              {errors.exclusivityAccepted && (
                <p className="text-xs text-destructive ml-7">{errors.exclusivityAccepted}</p>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate("/nieruchomosci")}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Powrót do portalu
        </Button>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = step.id === currentStep;
            const isCompleted = step.id < currentStep;

            return (
              <div key={step.id} className="flex items-center">
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all",
                    isCompleted && "bg-primary border-primary text-primary-foreground",
                    isActive && "border-primary text-primary",
                    !isActive && !isCompleted && "border-muted-foreground/30 text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <span
                  className={cn(
                    "hidden sm:block ml-2 text-sm font-medium",
                    isActive && "text-primary",
                    !isActive && "text-muted-foreground"
                  )}
                >
                  {step.title}
                </span>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "hidden sm:block w-8 md:w-16 h-0.5 mx-2",
                      isCompleted ? "bg-primary" : "bg-muted"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Form Card */}
        <Card>
          <CardHeader>
            <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
            <CardDescription>
              {currentStep === 1 && "Wprowadź dane swojej firmy"}
              {currentStep === 2 && "Dane właściciela agencji"}
              {currentStep === 3 && "Opcjonalnie: dane osoby kontaktowej"}
              {currentStep === 4 && "Przeczytaj i zaakceptuj warunki"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderStepContent()}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Wstecz
          </Button>

          {currentStep < 4 ? (
            <Button onClick={nextStep}>
              Dalej
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Rejestracja..." : "Zarejestruj agencję"}
              <Check className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}