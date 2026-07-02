import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, User, Users, FileCheck, Mail, AlertCircle, AlertTriangle } from "lucide-react";
import { NipLookupField } from "@/components/shared/NipLookupField";
import { GusCompanyData } from "@/hooks/useGusLookup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";

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
  { titleKey: "fleetRegister.companyData", icon: Building2 },
  { titleKey: "reAgentRegister.stepOwner", icon: User },
  { titleKey: "common.supervisor", icon: Users },
  { titleKey: "reAgentRegister.stepConfirmation", icon: FileCheck },
];

export default function RealEstateAgentRegister() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if user is logged in on mount - use getSession for fresh data
  useEffect(() => {
    const checkAuth = async () => {
      // Use getSession to get the current session from server (not cached)
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        toast.error(t('reAgentRegister.mustBeLoggedIn'));
        navigate("/auth");
        return;
      }
      
      // Check if user already has an agent profile
      const { data: existingAgent } = await supabase
        .from("real_estate_agents")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (existingAgent) {
        toast.info(t('reAgentRegister.alreadyRegistered'));
        navigate("/nieruchomosci/agent/panel");
        return;
      }
      
      setLoggedInEmail(session.user.email || null);
      setCheckingAuth(false);
    };
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        navigate("/auth");
      } else if (session) {
        setLoggedInEmail(session.user.email || null);
      }
    });
    
    checkAuth();
    
    return () => subscription.unsubscribe();
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
      if (!formData.companyName.trim()) newErrors.companyName = t('fleetRegister.companyNameRequired');
      if (!formData.companyNip.trim()) {
        newErrors.companyNip = t('fleetRegister.nipRequired');
      } else {
        const nipClean = formData.companyNip.replace(/[- ]/g, "");
        if (!/^\d{10}$/.test(nipClean)) {
          newErrors.companyNip = t('fleetRegister.nipFormat');
        }
      }
      if (!formData.companyStreet.trim()) newErrors.companyStreet = t('fleetRegister.streetRequired');
      if (!formData.companyBuildingNumber.trim()) newErrors.companyBuildingNumber = t('reAgentRegister.buildingNumberRequired');
      if (!formData.companyCity.trim()) newErrors.companyCity = t('fleetRegister.cityRequired');
      if (!formData.companyPostalCode.trim()) {
        newErrors.companyPostalCode = t('reAgentRegister.postalCodeRequired');
      } else if (!/^\d{2}-\d{3}$/.test(formData.companyPostalCode)) {
        newErrors.companyPostalCode = t('reAgentRegister.postalCodeFormat');
      }
    }

    if (step === 2) {
      if (!formData.ownerFirstName.trim()) newErrors.ownerFirstName = t('register.firstNameRequired');
      if (!formData.ownerLastName.trim()) newErrors.ownerLastName = t('reAgentRegister.lastNameRequired');
      if (!formData.ownerPhone.trim()) newErrors.ownerPhone = t('fleetRegister.phoneRequired');
    }

    // Step 3 - guardian is optional, only validate if any field is filled
    if (step === 3) {
      const hasAnyGuardianData = formData.guardianFirstName || formData.guardianLastName || 
                                  formData.guardianPhone || formData.guardianEmail;
      if (hasAnyGuardianData) {
        if (formData.guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.guardianEmail)) {
          newErrors.guardianEmail = t('reAgentRegister.emailInvalid');
        }
      }
    }

    if (step === 4) {
      if (!formData.termsAccepted) newErrors.termsAccepted = t('reAgentRegister.termsRequired');
      if (!formData.exclusivityAccepted) newErrors.exclusivityAccepted = t('reAgentRegister.exclusivityRequired');
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

  const goToStep = (stepNumber: number) => {
    // Allow going back to any completed step immediately
    if (stepNumber < currentStep) {
      setCurrentStep(stepNumber);
      return;
    }
    
    // Already on this step
    if (stepNumber === currentStep) {
      return;
    }
    
    // To go forward, validate all previous steps
    for (let i = 1; i < stepNumber; i++) {
      if (!validateStep(i)) {
        setCurrentStep(i);
        toast.error(t('reAgentRegister.fillRequiredInStep', { step: t(STEPS[i - 1].titleKey) }));
        return;
      }
    }
    
    setCurrentStep(stepNumber);
  };

  const handleSubmit = async () => {
    if (!validateStep(4)) return;

    setLoading(true);
    try {
      // Get fresh session from server (not cached)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        toast.error(t('reAgentRegister.sessionExpired'));
        navigate("/auth");
        return;
      }
      
      const user = session.user;
      
      // Verify session matches displayed email
      if (user.email !== loggedInEmail) {
        console.warn("Session mismatch detected - using current session user:", user.email);
        setLoggedInEmail(user.email || null);
      }

      // Check if user already has an agent profile
      const { data: existingAgent } = await supabase
        .from("real_estate_agents")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingAgent) {
        toast.error(t('reAgentRegister.alreadyRegistered'));
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

      // Add real_estate_agent role (safe if it already exists)
      const { error: roleError } = await supabase
        .from("user_roles")
        .upsert({
          user_id: user.id,
          role: "real_estate_agent",
        }, { onConflict: "user_id,role" });

      if (roleError) {
        console.error("Failed to add real_estate_agent role:", roleError);
        // Rollback: delete the created agent record
        await supabase
          .from("real_estate_agents")
          .delete()
          .eq("user_id", user.id);
        throw new Error(t('reAgentRegister.rolePermissionFailed'));
      }

      toast.success(t('reAgentRegister.registrationSuccess'));
      navigate("/nieruchomosci/agent/panel");

    } catch (error: any) {
      console.error("Registration error:", error);
      toast.error(error.message || t('register.errorRetry'));
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            {/* NIP Lookup - auto-fills all company fields */}
            <NipLookupField
              label={t('reAgentRegister.nipLookupLabel')}
              onCompanyFound={(data: GusCompanyData) => {
                updateField("companyNip", data.nip);
                updateField("companyName", data.nazwa);
                updateField("companyRegon", data.regon);
                updateField("companyStreet", data.ulica);
                updateField("companyBuildingNumber", data.nr_domu);
                updateField("companyApartmentNumber", data.nr_lokalu);
                updateField("companyCity", data.miasto);
                updateField("companyPostalCode", data.kod_pocztowy);
              }}
            />

            <div>
              <Label htmlFor="companyName">{t('fleetRegister.companyName')} *</Label>
              <Input
                id="companyName"
                value={formData.companyName}
                onChange={(e) => updateField("companyName", e.target.value)}
                placeholder={t('reAgentRegister.companyNamePlaceholder')}
                className={errors.companyName ? "border-destructive" : ""}
              />
              {errors.companyName && (
                <p className="text-destructive text-sm mt-1">{errors.companyName}</p>
              )}
            </div>

            <div>
              <Label htmlFor="companyShortName">{t('fleetRegister.companyShortName')}</Label>
              <Input
                id="companyShortName"
                value={formData.companyShortName}
                onChange={(e) => updateField("companyShortName", e.target.value)}
                placeholder={t('reAgentRegister.companyShortNamePlaceholder')}
              />
              <p className="text-muted-foreground text-xs mt-1">
                {t('reAgentRegister.companyShortNameHint')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="companyNip">{t('fleetRegister.nip')} *</Label>
                <Input
                  id="companyNip"
                  value={formData.companyNip}
                  onChange={(e) => updateField("companyNip", e.target.value)}
                  placeholder="0000000000"
                  maxLength={13}
                  className={errors.companyNip ? "border-destructive" : ""}
                  readOnly
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
                  readOnly
                />
              </div>
            </div>

            <div>
              <Label htmlFor="companyStreet">{t('fleetRegister.street')} *</Label>
              <Input
                id="companyStreet"
                value={formData.companyStreet}
                onChange={(e) => updateField("companyStreet", e.target.value)}
                placeholder={t('reAgentRegister.streetPlaceholder')}
                className={errors.companyStreet ? "border-destructive" : ""}
              />
              {errors.companyStreet && (
                <p className="text-destructive text-sm mt-1">{errors.companyStreet}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="companyBuildingNumber">{t('reAgentRegister.buildingNumber')} *</Label>
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
                <Label htmlFor="companyApartmentNumber">{t('fleetRegister.apartmentNumber')}</Label>
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
                <Label htmlFor="companyCity">{t('register.city')} *</Label>
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
                <Label htmlFor="companyPostalCode">{t('fleetRegister.postalCode')} *</Label>
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
              <AlertDescription className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  {t('reAgentRegister.ownerEmailLabel')} <strong>{loggedInEmail}</strong>
                  <br />
                  <span className="text-muted-foreground text-xs">
                    {t('reAgentRegister.emailFromAccount')}
                  </span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  type="button"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate("/auth");
                  }}
                >
                  {t('reAgentRegister.changeAccount')}
                </Button>
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ownerFirstName">{t('register.firstName')} *</Label>
                <Input
                  id="ownerFirstName"
                  value={formData.ownerFirstName}
                  onChange={(e) => updateField("ownerFirstName", e.target.value)}
                  placeholder={t('register.firstNameExample')}
                  className={errors.ownerFirstName ? "border-destructive" : ""}
                />
                {errors.ownerFirstName && (
                  <p className="text-destructive text-sm mt-1">{errors.ownerFirstName}</p>
                )}
              </div>
              <div>
                <Label htmlFor="ownerLastName">{t('register.lastName')} *</Label>
                <Input
                  id="ownerLastName"
                  value={formData.ownerLastName}
                  onChange={(e) => updateField("ownerLastName", e.target.value)}
                  placeholder={t('register.lastNameExample')}
                  className={errors.ownerLastName ? "border-destructive" : ""}
                />
                {errors.ownerLastName && (
                  <p className="text-destructive text-sm mt-1">{errors.ownerLastName}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="ownerPhone">{t('register.phone')} *</Label>
              <Input
                id="ownerPhone"
                value={formData.ownerPhone}
                onChange={(e) => updateField("ownerPhone", e.target.value)}
                placeholder={t('register.phonePlaceholder')}
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
                {t('reAgentRegister.guardianOptionalInfo')}
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="guardianFirstName">{t('register.firstName')}</Label>
                <Input
                  id="guardianFirstName"
                  value={formData.guardianFirstName}
                  onChange={(e) => updateField("guardianFirstName", e.target.value)}
                  placeholder={t('fleetRegister.driverNameExample')}
                />
              </div>
              <div>
                <Label htmlFor="guardianLastName">{t('register.lastName')}</Label>
                <Input
                  id="guardianLastName"
                  value={formData.guardianLastName}
                  onChange={(e) => updateField("guardianLastName", e.target.value)}
                  placeholder={t('reAgentRegister.guardianLastNameExample')}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="guardianPhone">{t('register.phone')}</Label>
              <Input
                id="guardianPhone"
                value={formData.guardianPhone}
                onChange={(e) => updateField("guardianPhone", e.target.value)}
                placeholder={t('reAgentRegister.guardianPhoneExample')}
              />
            </div>

            <div>
              <Label htmlFor="guardianEmail">{t('reAgentRegister.emailLabel')}</Label>
              <Input
                id="guardianEmail"
                type="email"
                value={formData.guardianEmail}
                onChange={(e) => updateField("guardianEmail", e.target.value)}
                placeholder={t('reAgentRegister.guardianEmailExample')}
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
              <h3 className="font-semibold text-lg">{t('reAgentRegister.summary')}</h3>
              
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="font-medium">{formData.companyName}</p>
                {formData.companyShortName && (
                  <p className="text-sm text-muted-foreground">({formData.companyShortName})</p>
                )}
                <p className="text-sm">{t('fleetRegister.nip')}: {formData.companyNip}</p>
                <p className="text-sm">
                  {formData.companyStreet} {formData.companyBuildingNumber}
                  {formData.companyApartmentNumber && `/${formData.companyApartmentNumber}`}
                </p>
                <p className="text-sm">{formData.companyPostalCode} {formData.companyCity}</p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                <p className="font-medium">{t('reAgentRegister.stepOwner')}</p>
                <p className="text-sm">{formData.ownerFirstName} {formData.ownerLastName}</p>
                <p className="text-sm">{loggedInEmail}</p>
                <p className="text-sm">{formData.ownerPhone}</p>
              </div>

              {(formData.guardianFirstName || formData.guardianLastName) && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                  <p className="font-medium">{t('common.supervisor')}</p>
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
                <strong>{t('reAgentRegister.importantLabel')}</strong> {t('reAgentRegister.exclusivityWarning')}
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
                    {t('reAgentRegister.acceptTermsLabel')} *
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('reAgentRegister.acceptTermsHint')}
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
                    {t('reAgentRegister.exclusivityLabel')} *
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('reAgentRegister.exclusivityHint')}
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
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/nieruchomosci")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('reAgentRegister.backToMarketplace')}
          </Button>
          <LanguageSwitcher variant="outline" />
        </div>

        {/* Progress steps - clickable */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const stepNumber = index + 1;
            const isActive = stepNumber === currentStep;
            const isCompleted = stepNumber < currentStep;

            return (
              <div key={index} className="flex items-center">
                <button
                  type="button"
                  onClick={() => goToStep(stepNumber)}
                  className="flex flex-col items-center group cursor-pointer"
                  aria-label={t('reAgentRegister.goToStep', { step: t(step.titleKey) })}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isCompleted
                        ? "bg-primary/20 text-primary group-hover:bg-primary/30 group-hover:scale-110"
                        : "bg-muted text-muted-foreground group-hover:bg-muted/80"
                    }`}
                  >
                    <StepIcon className="h-5 w-5" />
                  </div>
                  <span className={`text-xs mt-1 text-center hidden sm:block transition-colors ${
                    isCompleted ? "text-primary group-hover:underline" : ""
                  }`}>
                    {t(step.titleKey)}
                  </span>
                </button>
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
              {t(STEPS[currentStep - 1].titleKey)}
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
                {t('fleetRegister.previous')}
              </Button>

              {currentStep < STEPS.length ? (
                <Button onClick={nextStep}>
                  {t('fleetRegister.next')}
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? t('reAgentRegister.registering') : t('reAgentRegister.submitButton')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
