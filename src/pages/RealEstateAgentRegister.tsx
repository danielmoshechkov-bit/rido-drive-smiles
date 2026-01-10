import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, User, Users, FileCheck, Mail, AlertCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FormData {
  // Company
  companyName: string;
  companyShortName: string;
  companyNip: string;
  companyRegon: string;
  companyStreet: string;
  companyBuildingNumber: string;
  companyApartmentNumber: string;
  companyCity: string;
  companyPostalCode: string;
  
  // Owner (no email/password - using logged in user)
  ownerFirstName: string;
  ownerLastName: string;
  ownerPhone: string;
  
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
  companyShortName: "",
  companyNip: "",
  companyRegon: "",
  companyStreet: "",
  companyBuildingNumber: "",
  companyApartmentNumber: "",
  companyCity: "",
  companyPostalCode: "",
  ownerFirstName: "",
  ownerLastName: "",
  ownerPhone: "",
  guardianFirstName: "",
  guardianLastName: "",
  guardianPhone: "",
  guardianEmail: "",
  termsAccepted: false,
  exclusivityAccepted: false,
};

const STEPS = [
  { title: "Dane firmy", icon: Building2 },
  { title: "Właściciel", icon: User },
  { title: "Opiekun", icon: Users },
  { title: "Potwierdzenie", icon: FileCheck },
];

export default function RealEstateAgentRegister() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if user is logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Musisz być zalogowany, aby zarejestrować agencję.");
        navigate("/auth");
        return;
      }
      setLoggedInEmail(user.email || null);
      setCheckingAuth(false);
    };
    checkAuth();
  }, [navigate]);

  const formatPostalCode = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, "");
    // Format as XX-XXX
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}`;
  };

  const updateField = (field: keyof FormData, value: string | boolean) => {
    let processedValue = value;
    
    // Auto-format postal code
    if (field === "companyPostalCode" && typeof value === "string") {
      processedValue = formatPostalCode(value);
    }
    
    setFormData(prev => ({ ...prev, [field]: processedValue }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (step === 1) {
      if (!formData.companyName.trim()) newErrors.companyName = "Nazwa firmy jest wymagana";
      if (!formData.companyNip.trim()) {
        newErrors.companyNip = "NIP jest wymagany";
      } else {
        const nipClean = formData.companyNip.replace(/[- ]/g, "");
        if (!/^\d{10}$/.test(nipClean)) {
          newErrors.companyNip = "NIP musi mieć 10 cyfr";
        }
      }
      if (!formData.companyStreet.trim()) newErrors.companyStreet = "Ulica jest wymagana";
      if (!formData.companyBuildingNumber.trim()) newErrors.companyBuildingNumber = "Nr budynku jest wymagany";
      if (!formData.companyCity.trim()) newErrors.companyCity = "Miasto jest wymagane";
      if (!formData.companyPostalCode.trim()) {
        newErrors.companyPostalCode = "Kod pocztowy jest wymagany";
      } else if (!/^\d{2}-\d{3}$/.test(formData.companyPostalCode)) {
        newErrors.companyPostalCode = "Format: XX-XXX";
      }
    }

    if (step === 2) {
      if (!formData.ownerFirstName.trim()) newErrors.ownerFirstName = "Imię jest wymagane";
      if (!formData.ownerLastName.trim()) newErrors.ownerLastName = "Nazwisko jest wymagane";
      if (!formData.ownerPhone.trim()) newErrors.ownerPhone = "Telefon jest wymagany";
    }

    // Step 3 - guardian is optional, only validate if any field is filled
    if (step === 3) {
      const hasAnyGuardianData = formData.guardianFirstName || formData.guardianLastName || 
                                  formData.guardianPhone || formData.guardianEmail;
      if (hasAnyGuardianData) {
        if (formData.guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.guardianEmail)) {
          newErrors.guardianEmail = "Nieprawidłowy format email";
        }
      }
    }

    if (step === 4) {
      if (!formData.termsAccepted) newErrors.termsAccepted = "Musisz zaakceptować regulamin";
      if (!formData.exclusivityAccepted) newErrors.exclusivityAccepted = "Musisz zaakceptować oświadczenie o wyłączności";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(4)) return;

    setLoading(true);
    try {
      // Get the logged-in user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Musisz być zalogowany, aby zarejestrować agencję.");
        navigate("/auth");
        return;
      }

      // Check if user already has an agent profile
      const { data: existingAgent } = await supabase
        .from("real_estate_agents")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingAgent) {
        toast.error("Masz już zarejestrowaną agencję.");
        navigate("/nieruchomosci/agent/panel");
        return;
      }

      // Create agent profile using the logged-in user's ID
      const { error: agentError } = await supabase
        .from("real_estate_agents")
        .insert([{
          user_id: user.id,
          company_name: formData.companyName.trim(),
          company_short_name: formData.companyShortName.trim() || null,
          company_nip: formData.companyNip.replace(/[- ]/g, ""),
          company_regon: formData.companyRegon.trim() || null,
          company_address: `${formData.companyStreet.trim()} ${formData.companyBuildingNumber.trim()}${formData.companyApartmentNumber ? '/' + formData.companyApartmentNumber.trim() : ''}`,
          company_street: formData.companyStreet.trim(),
          company_building_number: formData.companyBuildingNumber.trim(),
          company_apartment_number: formData.companyApartmentNumber.trim() || null,
          company_city: formData.companyCity.trim(),
          company_postal_code: formData.companyPostalCode,
          owner_first_name: formData.ownerFirstName.trim(),
          owner_last_name: formData.ownerLastName.trim(),
          owner_phone: formData.ownerPhone.trim(),
          owner_email: user.email,
          guardian_first_name: formData.guardianFirstName.trim() || null,
          guardian_last_name: formData.guardianLastName.trim() || null,
          guardian_phone: formData.guardianPhone.trim() || null,
          guardian_email: formData.guardianEmail.trim() || null,
          status: "pending",
        }]);

      if (agentError) throw agentError;

      // Add real_estate_agent role
      await supabase
        .from("user_roles")
        .insert({
          user_id: user.id,
          role: "real_estate_agent",
        });

      toast.success("Agencja została zarejestrowana! Oczekuj na weryfikację.");
      navigate("/nieruchomosci/agent/panel");
      
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
                placeholder="Pełna nazwa firmy"
                className={errors.companyName ? "border-destructive" : ""}
              />
              {errors.companyName && (
                <p className="text-destructive text-sm mt-1">{errors.companyName}</p>
              )}
            </div>

            <div>
              <Label htmlFor="companyShortName">Nazwa skrócona</Label>
              <Input
                id="companyShortName"
                value={formData.companyShortName}
                onChange={(e) => updateField("companyShortName", e.target.value)}
                placeholder="Np. ABC Nieruchomości"
              />
              <p className="text-muted-foreground text-xs mt-1">
                Widoczna dla użytkowników portalu
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="companyNip">NIP *</Label>
                <Input
                  id="companyNip"
                  value={formData.companyNip}
                  onChange={(e) => updateField("companyNip", e.target.value)}
                  placeholder="0000000000"
                  maxLength={13}
                  className={errors.companyNip ? "border-destructive" : ""}
                />
                {errors.companyNip && (
                  <p className="text-destructive text-sm mt-1">{errors.companyNip}</p>
                )}
              </div>
              <div>
                <Label htmlFor="companyRegon">REGON</Label>
                <Input
                  id="companyRegon"
                  value={formData.companyRegon}
                  onChange={(e) => updateField("companyRegon", e.target.value)}
                  placeholder="000000000"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="companyStreet">Ulica *</Label>
              <Input
                id="companyStreet"
                value={formData.companyStreet}
                onChange={(e) => updateField("companyStreet", e.target.value)}
                placeholder="Nazwa ulicy"
                className={errors.companyStreet ? "border-destructive" : ""}
              />
              {errors.companyStreet && (
                <p className="text-destructive text-sm mt-1">{errors.companyStreet}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="companyBuildingNumber">Nr budynku *</Label>
                <Input
                  id="companyBuildingNumber"
                  value={formData.companyBuildingNumber}
                  onChange={(e) => updateField("companyBuildingNumber", e.target.value)}
                  placeholder="12A"
                  className={errors.companyBuildingNumber ? "border-destructive" : ""}
                />
                {errors.companyBuildingNumber && (
                  <p className="text-destructive text-sm mt-1">{errors.companyBuildingNumber}</p>
                )}
              </div>
              <div>
                <Label htmlFor="companyApartmentNumber">Nr lokalu</Label>
                <Input
                  id="companyApartmentNumber"
                  value={formData.companyApartmentNumber}
                  onChange={(e) => updateField("companyApartmentNumber", e.target.value)}
                  placeholder="5"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="companyCity">Miasto *</Label>
                <Input
                  id="companyCity"
                  value={formData.companyCity}
                  onChange={(e) => updateField("companyCity", e.target.value)}
                  placeholder="Warszawa"
                  className={errors.companyCity ? "border-destructive" : ""}
                />
                {errors.companyCity && (
                  <p className="text-destructive text-sm mt-1">{errors.companyCity}</p>
                )}
              </div>
              <div>
                <Label htmlFor="companyPostalCode">Kod pocztowy *</Label>
                <Input
                  id="companyPostalCode"
                  value={formData.companyPostalCode}
                  onChange={(e) => updateField("companyPostalCode", e.target.value)}
                  placeholder="00-000"
                  maxLength={6}
                  className={errors.companyPostalCode ? "border-destructive" : ""}
                />
                {errors.companyPostalCode && (
                  <p className="text-destructive text-sm mt-1">{errors.companyPostalCode}</p>
                )}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>
                Email właściciela: <strong>{loggedInEmail}</strong>
                <br />
                <span className="text-muted-foreground text-xs">
                  (pobrane z Twojego zalogowanego konta)
                </span>
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ownerFirstName">Imię *</Label>
                <Input
                  id="ownerFirstName"
                  value={formData.ownerFirstName}
                  onChange={(e) => updateField("ownerFirstName", e.target.value)}
                  placeholder="Jan"
                  className={errors.ownerFirstName ? "border-destructive" : ""}
                />
                {errors.ownerFirstName && (
                  <p className="text-destructive text-sm mt-1">{errors.ownerFirstName}</p>
                )}
              </div>
              <div>
                <Label htmlFor="ownerLastName">Nazwisko *</Label>
                <Input
                  id="ownerLastName"
                  value={formData.ownerLastName}
                  onChange={(e) => updateField("ownerLastName", e.target.value)}
                  placeholder="Kowalski"
                  className={errors.ownerLastName ? "border-destructive" : ""}
                />
                {errors.ownerLastName && (
                  <p className="text-destructive text-sm mt-1">{errors.ownerLastName}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="ownerPhone">Telefon *</Label>
              <Input
                id="ownerPhone"
                value={formData.ownerPhone}
                onChange={(e) => updateField("ownerPhone", e.target.value)}
                placeholder="+48 123 456 789"
                className={errors.ownerPhone ? "border-destructive" : ""}
              />
              {errors.ownerPhone && (
                <p className="text-destructive text-sm mt-1">{errors.ownerPhone}</p>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Dane opiekuna są opcjonalne. Opiekun to osoba, którą możemy kontaktować w sprawach technicznych.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="guardianFirstName">Imię</Label>
                <Input
                  id="guardianFirstName"
                  value={formData.guardianFirstName}
                  onChange={(e) => updateField("guardianFirstName", e.target.value)}
                  placeholder="Anna"
                />
              </div>
              <div>
                <Label htmlFor="guardianLastName">Nazwisko</Label>
                <Input
                  id="guardianLastName"
                  value={formData.guardianLastName}
                  onChange={(e) => updateField("guardianLastName", e.target.value)}
                  placeholder="Nowak"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="guardianPhone">Telefon</Label>
              <Input
                id="guardianPhone"
                value={formData.guardianPhone}
                onChange={(e) => updateField("guardianPhone", e.target.value)}
                placeholder="+48 987 654 321"
              />
            </div>

            <div>
              <Label htmlFor="guardianEmail">Email</Label>
              <Input
                id="guardianEmail"
                type="email"
                value={formData.guardianEmail}
                onChange={(e) => updateField("guardianEmail", e.target.value)}
                placeholder="anna.nowak@firma.pl"
                className={errors.guardianEmail ? "border-destructive" : ""}
              />
              {errors.guardianEmail && (
                <p className="text-destructive text-sm mt-1">{errors.guardianEmail}</p>
              )}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            {/* Summary */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Podsumowanie</h3>
              
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="font-medium">{formData.companyName}</p>
                {formData.companyShortName && (
                  <p className="text-sm text-muted-foreground">({formData.companyShortName})</p>
                )}
                <p className="text-sm">NIP: {formData.companyNip}</p>
                <p className="text-sm">
                  {formData.companyStreet} {formData.companyBuildingNumber}
                  {formData.companyApartmentNumber && `/${formData.companyApartmentNumber}`}
                </p>
                <p className="text-sm">{formData.companyPostalCode} {formData.companyCity}</p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                <p className="font-medium">Właściciel</p>
                <p className="text-sm">{formData.ownerFirstName} {formData.ownerLastName}</p>
                <p className="text-sm">{loggedInEmail}</p>
                <p className="text-sm">{formData.ownerPhone}</p>
              </div>

              {(formData.guardianFirstName || formData.guardianLastName) && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                  <p className="font-medium">Opiekun</p>
                  <p className="text-sm">{formData.guardianFirstName} {formData.guardianLastName}</p>
                  {formData.guardianEmail && <p className="text-sm">{formData.guardianEmail}</p>}
                  {formData.guardianPhone && <p className="text-sm">{formData.guardianPhone}</p>}
                </div>
              )}
            </div>

            {/* Warning */}
            <Alert variant="destructive" className="border-orange-500/50 bg-orange-500/10">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <AlertDescription className="text-orange-700">
                <strong>Ważne!</strong> Na portalu RIDO Nieruchomości możesz dodawać 
                tylko ogłoszenia na wyłączność Twojej agencji. Złamanie tej zasady 
                skutkuje blokadą konta.
              </AlertDescription>
            </Alert>

            {/* Consents */}
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="termsAccepted"
                  checked={formData.termsAccepted}
                  onCheckedChange={(checked) => updateField("termsAccepted", checked as boolean)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="termsAccepted"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Akceptuję regulamin serwisu *
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Zapoznałem się z regulaminem i akceptuję jego postanowienia.
                  </p>
                  {errors.termsAccepted && (
                    <p className="text-destructive text-xs">{errors.termsAccepted}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="exclusivityAccepted"
                  checked={formData.exclusivityAccepted}
                  onCheckedChange={(checked) => updateField("exclusivityAccepted", checked as boolean)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="exclusivityAccepted"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Oświadczenie o wyłączności *
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Oświadczam, że publikowane przeze mnie oferty będą dotyczyć nieruchomości,
                    do których posiadam wyłączne prawo prezentacji (umowa na wyłączność lub
                    własność).
                  </p>
                  {errors.exclusivityAccepted && (
                    <p className="text-destructive text-xs">{errors.exclusivityAccepted}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Back button */}
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Wróć
        </Button>

        {/* Progress steps */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const stepNumber = index + 1;
            const isActive = stepNumber === currentStep;
            const isCompleted = stepNumber < currentStep;

            return (
              <div key={index} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isCompleted
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <StepIcon className="h-5 w-5" />
                  </div>
                  <span className="text-xs mt-1 text-center hidden sm:block">
                    {step.title}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`w-12 sm:w-24 h-0.5 mx-2 ${
                      isCompleted ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Form card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {React.createElement(STEPS[currentStep - 1].icon, { className: "h-5 w-5" })}
              {STEPS[currentStep - 1].title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderStepContent()}

            {/* Navigation buttons */}
            <div className="flex justify-between mt-8">
              <Button
                variant="outline"
                onClick={prevStep}
                disabled={currentStep === 1}
              >
                Wstecz
              </Button>

              {currentStep < STEPS.length ? (
                <Button onClick={nextStep}>
                  Dalej
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? "Rejestruję..." : "Zarejestruj agencję"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
