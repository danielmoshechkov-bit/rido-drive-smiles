import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Building2, User, Mail, Phone, MapPin, FileText, ShieldCheck, Search } from "lucide-react";
import { useGusLookup } from "@/hooks/useGusLookup";
import { Step3Account } from "@/components/fleet/Step3Account";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";

interface FieldErrors {
  [key: string]: string | undefined;
}

export default function FleetRegister() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isHuman, setIsHuman] = useState(false);
  const [step, setStep] = useState(1);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isExistingUser, setIsExistingUser] = useState(false);
  
  const [formData, setFormData] = useState({
    // Dane firmy
    company_name: "",
    company_short_name: "",
    nip: "",
    address_street: "",
    address_number: "",
    address_apartment: "",
    address_city: "",
    address_postal_code: "",
    
    // Osoba kontaktowa
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    
    // Osoba dla kierowców
    driver_contact_name: "",
    driver_contact_phone: "",
    
    // Konto (not needed for existing users)
    email: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
    acceptRodo: false,
  });

  const { lookup: gusLookup, loading: gusLoading } = useGusLookup();

  const fetchCompanyFromGus = async () => {
    const company = await gusLookup(formData.nip);
    if (!company) {
      toast.error(t("fleetRegister.gusNotFound", "Nie znaleziono firmy w GUS"));
      return;
    }
    setFormData(prev => ({
      ...prev,
      company_name: company.nazwa || prev.company_name,
      company_short_name: prev.company_short_name || company.nazwa_skrocona || "",
      nip: company.nip,
      address_street: company.ulica || prev.address_street,
      address_number: company.nr_domu || prev.address_number,
      address_apartment: company.nr_lokalu || prev.address_apartment,
      address_city: company.miasto || prev.address_city,
      address_postal_code: company.kod_pocztowy || prev.address_postal_code,
    }));
    toast.success(t("fleetRegister.gusFetched", "Dane firmy pobrane z GUS"));
  };

  const formatPostalCode = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 5);
    if (digits.length > 2) {
      return digits.slice(0, 2) + "-" + digits.slice(2);
    }
    return digits;
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setCurrentUser(session.user);
        setIsExistingUser(true);
        
        // Pre-fill contact info from user metadata
        const firstName = session.user.user_metadata?.first_name || '';
        const lastName = session.user.user_metadata?.last_name || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ');
        
        setFormData(prev => ({
          ...prev,
          contact_email: session.user.email || '',
          contact_name: fullName || prev.contact_name,
        }));
        
        // Check if user already has fleet role
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .in("role", ["fleet_settlement", "fleet_rental"])
          .then(({ data }) => {
            if (data && data.length > 0) {
              navigate("/fleet/dashboard");
            }
          });
      }
    });
  }, [navigate]);

  const validateStep = (currentStep: number): boolean => {
    const errors: FieldErrors = {};
    
    if (currentStep === 1) {
      if (!formData.company_name.trim()) errors.company_name = t("fleetRegister.companyNameRequired");
      if (!formData.nip.trim()) {
        errors.nip = t("fleetRegister.nipRequired");
      } else if (!/^\d{10}$/.test(formData.nip.replace(/[\s-]/g, ""))) {
        errors.nip = t("fleetRegister.nipFormat");
      }
      if (!formData.address_street.trim()) errors.address_street = t("fleetRegister.streetRequired");
      if (!formData.address_number.trim()) errors.address_number = t("fleetRegister.houseNumberRequired");
      if (!formData.address_city.trim()) errors.address_city = t("fleetRegister.cityRequired");
    }
    
    if (currentStep === 2) {
      if (!formData.contact_name.trim()) errors.contact_name = t("fleetRegister.fullNameRequired");
      if (!formData.contact_email.trim()) {
        errors.contact_email = t("register.emailRequired");
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contact_email)) {
        errors.contact_email = t("register.emailInvalid");
      }
      if (!formData.contact_phone.trim()) errors.contact_phone = t("fleetRegister.phoneRequired");
    }
    
    // Step 3 validation only for new users
    if (currentStep === 3 && !isExistingUser) {
      if (!formData.email.trim()) {
        errors.email = t("fleetRegister.loginEmailRequired");
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        errors.email = t("register.emailInvalid");
      }
      if (formData.password.length < 6) errors.password = t("register.passwordMinLength");
      if (formData.password !== formData.confirmPassword) errors.confirmPassword = t("register.passwordsMismatch");
    }
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      // For existing users, skip step 3 (go directly from step 2 to submit)
      if (step === 2 && isExistingUser) {
        // Trigger form submission directly
        handleSubmitExistingUser();
      } else {
        setStep(step + 1);
      }
    }
  };
  
  const handleSubmitExistingUser = async () => {
    if (!isHuman) {
      toast.error(t("register.confirmNotRobot"));
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await supabase.functions.invoke("register-fleet", {
        body: {
          company_name: formData.company_name,
          company_short_name: formData.company_short_name || formData.company_name.slice(0, 20),
          nip: formData.nip.replace(/[\s-]/g, ""),
          address: `${formData.address_street} ${formData.address_number}${formData.address_apartment ? '/' + formData.address_apartment : ''}`.trim(),
          city: formData.address_city,
          postal_code: formData.address_postal_code,
          contact_name: formData.contact_name,
          contact_email: formData.contact_email,
          contact_phone: formData.contact_phone,
          driver_contact_name: formData.driver_contact_name,
          driver_contact_phone: formData.driver_contact_phone,
          // For existing user - pass their user ID
          existing_user_id: currentUser?.id,
        },
      });
      
      if (response.data?.error) {
        if (response.data.field) {
          setFieldErrors({ [response.data.field]: response.data.error });
          if (['company_name', 'nip'].includes(response.data.field)) setStep(1);
          else if (['contact_name', 'contact_email', 'contact_phone'].includes(response.data.field)) setStep(2);
        } else {
          toast.error(response.data.error);
        }
        return;
      }
      
      if (response.error) throw new Error(response.error.message);
      
      toast.success(t("fleetRegister.fleetRegistered"));
      navigate("/fleet/dashboard");
    } catch (error: any) {
      console.error("Fleet registration error:", error);
      toast.error(error.message || t("register.errorRetry"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isHuman) {
      toast.error(t("register.confirmNotRobot"));
      return;
    }
    
    if (!validateStep(3)) return;
    
    if (!formData.acceptTerms || !formData.acceptRodo) {
      toast.error(t("register.mustAcceptTermsAndPrivacy"));
      return;
    }

    setLoading(true);

    try {
      const response = await supabase.functions.invoke("register-fleet", {
        body: {
          company_name: formData.company_name,
          company_short_name: formData.company_short_name || formData.company_name.slice(0, 20),
          nip: formData.nip.replace(/[\s-]/g, ""),
          address: `${formData.address_street} ${formData.address_number}${formData.address_apartment ? '/' + formData.address_apartment : ''}`.trim(),
          city: formData.address_city,
          postal_code: formData.address_postal_code,
          contact_name: formData.contact_name,
          contact_email: formData.contact_email,
          contact_phone: formData.contact_phone,
          driver_contact_name: formData.driver_contact_name,
          driver_contact_phone: formData.driver_contact_phone,
          email: formData.email,
          password: formData.password,
        },
      });

      if (response.data?.error) {
        if (response.data.field) {
          setFieldErrors({ [response.data.field]: response.data.error });
          // Go back to relevant step
          if (['company_name', 'nip'].includes(response.data.field)) setStep(1);
          else if (['contact_name', 'contact_email', 'contact_phone'].includes(response.data.field)) setStep(2);
          else setStep(3);
        } else {
          toast.error(response.data.error);
        }
        return;
      }

      if (response.error) {
        console.error("Fleet registration invoke error:", response.error);
        throw new Error(typeof response.error === 'string' ? response.error : response.error.message || t("register.error"));
      }

      // Redirect to success page
      navigate("/fleet/rejestracja-sukces");
    } catch (error: any) {
      console.error("Fleet registration error:", error);
      toast.error(error.message || t("register.errorRetry"));
    } finally {
      setLoading(false);
    }
  };

  const renderField = (
    name: keyof typeof formData,
    label: string,
    icon: React.ReactNode,
    type = "text",
    placeholder = "",
    required = true
  ) => (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}{required && " *"}</Label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground">
          {icon}
        </div>
        <Input
          id={name}
          type={type}
          value={formData[name] as string}
          onChange={(e) => {
            setFormData({ ...formData, [name]: e.target.value });
            if (fieldErrors[name]) setFieldErrors({ ...fieldErrors, [name]: undefined });
          }}
          placeholder={placeholder}
          className={`pl-10 ${fieldErrors[name] ? 'border-destructive ring-1 ring-destructive' : ''}`}
          required={required}
        />
      </div>
      {fieldErrors[name] && (
        <p className="text-sm text-destructive">{fieldErrors[name]}</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            onClick={() => isExistingUser ? navigate("/klient") : navigate("/fleet")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("common.back")}
          </Button>
          <LanguageSwitcher variant="outline" />
        </div>

        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 bg-primary rounded-xl flex items-center justify-center">
                <Building2 className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl">{t("fleetRegister.title")}</CardTitle>
            <CardDescription>
              {isExistingUser ? (
                <>{t("fleetRegister.stepOf", { step, total: 2 })} {step === 1 && t("fleetRegister.companyData")}{step === 2 && t("fleetRegister.contactPerson")}</>
              ) : (
                <>{t("fleetRegister.stepOf", { step, total: 3 })} {step === 1 && t("fleetRegister.companyData")}{step === 2 && t("fleetRegister.contactPerson")}{step === 3 && t("fleetRegister.adminAccount")}</>
              )}
            </CardDescription>
            
            {/* Progress bar */}
            <div className="flex gap-2 mt-4">
              {(isExistingUser ? [1, 2] : [1, 2, 3]).map((s) => (
                <div 
                  key={s} 
                  className={`h-2 flex-1 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-muted'}`}
                />
              ))}
            </div>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Step 1: Company Data */}
              {step === 1 && (
                <>
                  {renderField("company_name", t("fleetRegister.companyName"), <Building2 className="h-4 w-4" />, "text", "Taxi Partner Sp. z o.o.")}
                  {renderField("company_short_name", t("fleetRegister.companyShortName"), <FileText className="h-4 w-4" />, "text", "TaxiPartner", false)}
                  <div className="space-y-2">
                    <Label htmlFor="nip">{t("fleetRegister.nip")} *</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground">
                          <FileText className="h-4 w-4" />
                        </div>
                        <Input
                          id="nip"
                          type="text"
                          value={formData.nip}
                          onChange={(e) => {
                            setFormData({ ...formData, nip: e.target.value });
                            if (fieldErrors.nip) setFieldErrors({ ...fieldErrors, nip: undefined });
                          }}
                          placeholder="1234567890"
                          className={`pl-10 ${fieldErrors.nip ? 'border-destructive ring-1 ring-destructive' : ''}`}
                          required
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={fetchCompanyFromGus}
                        disabled={gusLoading || formData.nip.replace(/\D/g, "").length < 10}
                        title={t("fleetRegister.gusLookup", "Pobierz dane firmy z GUS")}
                      >
                        {gusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </Button>
                    </div>
                    {fieldErrors.nip && (
                      <p className="text-sm text-destructive">{fieldErrors.nip}</p>
                    )}
                  </div>

                  {renderField("address_street", t("fleetRegister.street"), <MapPin className="h-4 w-4" />, "text", t("fleetRegister.streetExample"))}

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      {renderField("address_number", t("fleetRegister.houseNumber"), <MapPin className="h-4 w-4" />, "text", "10")}
                    </div>
                    <div>
                      {renderField("address_apartment", t("fleetRegister.apartmentNumber"), <MapPin className="h-4 w-4" />, "text", "5", false)}
                    </div>
                    <div>
                      <div className="space-y-2">
                        <Label htmlFor="address_postal_code">{t("fleetRegister.postalCode")} *</Label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                          </div>
                          <Input
                            id="address_postal_code"
                            type="text"
                            value={formData.address_postal_code}
                            onChange={(e) => {
                              const formatted = formatPostalCode(e.target.value);
                              setFormData({ ...formData, address_postal_code: formatted });
                            }}
                            placeholder="00-000"
                            className="pl-10"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {renderField("address_city", t("register.city"), <MapPin className="h-4 w-4" />, "text", t("contact.placeholders.city"))}
                </>
              )}

              {/* Step 2: Contact Person */}
              {step === 2 && (
                <>
                  <div className="p-4 bg-muted rounded-lg mb-4">
                    <h4 className="font-medium mb-1">{t("fleetRegister.contactPerson")}</h4>
                    <p className="text-sm text-muted-foreground">{t("fleetRegister.contactPersonDesc")}</p>
                  </div>

                  {renderField("contact_name", t("contact.name"), <User className="h-4 w-4" />, "text", t("contact.placeholders.name"))}
                  {renderField("contact_email", t("register.email"), <Mail className="h-4 w-4" />, "email", t("fleetRegister.companyEmailExample"))}
                  {renderField("contact_phone", t("register.phone"), <Phone className="h-4 w-4" />, "tel", t("register.phonePlaceholder"))}

                  <div className="p-4 bg-muted rounded-lg mt-6 mb-4">
                    <h4 className="font-medium mb-1">{t("fleetRegister.driverContact")}</h4>
                    <p className="text-sm text-muted-foreground">{t("fleetRegister.driverContactDesc")}</p>
                  </div>

                  {renderField("driver_contact_name", t("register.firstName"), <User className="h-4 w-4" />, "text", t("fleetRegister.driverNameExample"), false)}
                  {renderField("driver_contact_phone", t("register.phone"), <Phone className="h-4 w-4" />, "tel", "+48 987 654 321", false)}
                  
                  {/* For existing users - show human check on step 2 */}
                  {isExistingUser && (
                    <div className="space-y-3 pt-4">
                      <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg border">
                        <Checkbox
                          id="human"
                          checked={isHuman}
                          onCheckedChange={(checked) => setIsHuman(checked === true)}
                        />
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-500" />
                          <label htmlFor="human" className="text-sm font-medium">{t("register.notRobot")}</label>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Step 3: Account */}
              {step === 3 && (
                <Step3Account
                  formData={formData}
                  setFormData={setFormData}
                  fieldErrors={fieldErrors}
                  setFieldErrors={setFieldErrors}
                  isHuman={isHuman}
                  setIsHuman={setIsHuman}
                  renderField={renderField}
                />
              )}

              {/* Navigation buttons */}
              <div className="flex gap-3 pt-4">
                {step > 1 && (
                  <Button type="button" variant="outline" onClick={() => setStep(step - 1)} className="flex-1">
                    {t("fleetRegister.previous")}
                  </Button>
                )}
                
                {/* For existing users: show "Zarejestruj flotę" on step 2 */}
                {isExistingUser ? (
                  step === 2 ? (
                    <Button type="button" onClick={handleNext} className="flex-1" disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t("register.registering")}
                        </>
                      ) : (
                        t("fleetRegister.registerFleet")
                      )}
                    </Button>
                  ) : (
                    <Button type="button" onClick={handleNext} className="flex-1">
                      {t("fleetRegister.next")}
                    </Button>
                  )
                ) : (
                  // For new users: step 3 is the last step
                  step < 3 ? (
                    <Button type="button" onClick={handleNext} className="flex-1">
                      {t("fleetRegister.next")}
                    </Button>
                  ) : (
                    <Button type="submit" className="flex-1" disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t("register.registering")}
                        </>
                      ) : (
                        t("fleetRegister.registerFleet")
                      )}
                    </Button>
                  )
                )}
              </div>

              {!isExistingUser && (
                <p className="text-center text-sm text-muted-foreground pt-2">
                  {t("register.hasAccount")}{" "}
                  <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/auth")}>
                    {t("register.login")}
                  </Button>
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}