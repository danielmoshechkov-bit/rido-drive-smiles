import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Building2, User, Mail, Phone, MapPin, FileText, ShieldCheck } from "lucide-react";
import { Step3Account } from "@/components/fleet/Step3Account";

interface FieldErrors {
  [key: string]: string | undefined;
}

export default function FleetRegister() {
  const navigate = useNavigate();
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
      if (!formData.company_name.trim()) errors.company_name = "Nazwa firmy jest wymagana";
      if (!formData.nip.trim()) {
        errors.nip = "NIP jest wymagany";
      } else if (!/^\d{10}$/.test(formData.nip.replace(/[\s-]/g, ""))) {
        errors.nip = "NIP musi mieć 10 cyfr";
      }
      if (!formData.address_city.trim()) errors.address_city = "Miasto jest wymagane";
    }
    
    if (currentStep === 2) {
      if (!formData.contact_name.trim()) errors.contact_name = "Imię i nazwisko jest wymagane";
      if (!formData.contact_email.trim()) {
        errors.contact_email = "Email jest wymagany";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contact_email)) {
        errors.contact_email = "Niepoprawny format email";
      }
      if (!formData.contact_phone.trim()) errors.contact_phone = "Telefon jest wymagany";
    }
    
    // Step 3 validation only for new users
    if (currentStep === 3 && !isExistingUser) {
      if (!formData.email.trim()) {
        errors.email = "Email do logowania jest wymagany";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        errors.email = "Niepoprawny format email";
      }
      if (formData.password.length < 6) errors.password = "Hasło musi mieć minimum 6 znaków";
      if (formData.password !== formData.confirmPassword) errors.confirmPassword = "Hasła nie są takie same";
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
      toast.error("Potwierdź, że nie jesteś robotem");
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await supabase.functions.invoke("register-fleet", {
        body: {
          company_name: formData.company_name,
          company_short_name: formData.company_short_name || formData.company_name.slice(0, 20),
          nip: formData.nip.replace(/[\s-]/g, ""),
          address: `${formData.address_street} ${formData.address_number}`.trim(),
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
      
      toast.success("Flota została zarejestrowana!");
      navigate("/fleet/dashboard");
    } catch (error: any) {
      console.error("Fleet registration error:", error);
      toast.error(error.message || "Błąd rejestracji. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isHuman) {
      toast.error("Potwierdź, że nie jesteś robotem");
      return;
    }
    
    if (!validateStep(3)) return;
    
    if (!formData.acceptTerms || !formData.acceptRodo) {
      toast.error("Musisz zaakceptować regulamin i politykę prywatności");
      return;
    }

    setLoading(true);

    try {
      const response = await supabase.functions.invoke("register-fleet", {
        body: {
          company_name: formData.company_name,
          company_short_name: formData.company_short_name || formData.company_name.slice(0, 20),
          nip: formData.nip.replace(/[\s-]/g, ""),
          address: `${formData.address_street} ${formData.address_number}`.trim(),
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

      if (response.error) throw new Error(response.error.message);

      // Redirect to success page
      navigate("/fleet/rejestracja-sukces");
    } catch (error: any) {
      console.error("Fleet registration error:", error);
      toast.error(error.message || "Błąd rejestracji. Spróbuj ponownie.");
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
        <Button 
          variant="ghost" 
          onClick={() => isExistingUser ? navigate("/klient") : navigate("/fleet")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Powrót
        </Button>

        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 bg-primary rounded-xl flex items-center justify-center">
                <Building2 className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl">Zarejestruj flotę</CardTitle>
            <CardDescription>
              {isExistingUser ? (
                <>Krok {step} z 2: {step === 1 && "Dane firmy"}{step === 2 && "Osoba kontaktowa"}</>
              ) : (
                <>Krok {step} z 3: {step === 1 && "Dane firmy"}{step === 2 && "Osoba kontaktowa"}{step === 3 && "Konto administratora"}</>
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
                  {renderField("company_name", "Nazwa firmy", <Building2 className="h-4 w-4" />, "text", "Taxi Partner Sp. z o.o.")}
                  {renderField("company_short_name", "Nazwa skrócona", <FileText className="h-4 w-4" />, "text", "TaxiPartner", false)}
                  {renderField("nip", "NIP", <FileText className="h-4 w-4" />, "text", "1234567890")}
                  
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      {renderField("address_street", "Ulica", <MapPin className="h-4 w-4" />, "text", "ul. Główna", false)}
                    </div>
                    <div>
                      {renderField("address_number", "Nr", <MapPin className="h-4 w-4" />, "text", "10", false)}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {renderField("address_city", "Miasto", <MapPin className="h-4 w-4" />, "text", "Warszawa")}
                    {renderField("address_postal_code", "Kod pocztowy", <MapPin className="h-4 w-4" />, "text", "00-001", false)}
                  </div>
                </>
              )}

              {/* Step 2: Contact Person */}
              {step === 2 && (
                <>
                  <div className="p-4 bg-muted rounded-lg mb-4">
                    <h4 className="font-medium mb-1">Osoba kontaktowa</h4>
                    <p className="text-sm text-muted-foreground">Główny kontakt do spraw administracyjnych floty</p>
                  </div>
                  
                  {renderField("contact_name", "Imię i nazwisko", <User className="h-4 w-4" />, "text", "Jan Kowalski")}
                  {renderField("contact_email", "Email", <Mail className="h-4 w-4" />, "email", "jan@firma.pl")}
                  {renderField("contact_phone", "Telefon", <Phone className="h-4 w-4" />, "tel", "+48 123 456 789")}
                  
                  <div className="p-4 bg-muted rounded-lg mt-6 mb-4">
                    <h4 className="font-medium mb-1">Kontakt dla kierowców</h4>
                    <p className="text-sm text-muted-foreground">Osoba do bezpośredniego kontaktu z kierowcami (opcjonalnie)</p>
                  </div>
                  
                  {renderField("driver_contact_name", "Imię", <User className="h-4 w-4" />, "text", "Anna", false)}
                  {renderField("driver_contact_phone", "Telefon", <Phone className="h-4 w-4" />, "tel", "+48 987 654 321", false)}
                  
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
                          <label htmlFor="human" className="text-sm font-medium">Nie jestem robotem</label>
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
                    Wstecz
                  </Button>
                )}
                
                {/* For existing users: show "Zarejestruj flotę" on step 2 */}
                {isExistingUser ? (
                  step === 2 ? (
                    <Button type="button" onClick={handleNext} className="flex-1" disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Rejestracja...
                        </>
                      ) : (
                        "Zarejestruj flotę"
                      )}
                    </Button>
                  ) : (
                    <Button type="button" onClick={handleNext} className="flex-1">
                      Dalej
                    </Button>
                  )
                ) : (
                  // For new users: step 3 is the last step
                  step < 3 ? (
                    <Button type="button" onClick={handleNext} className="flex-1">
                      Dalej
                    </Button>
                  ) : (
                    <Button type="submit" className="flex-1" disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Rejestracja...
                        </>
                      ) : (
                        "Zarejestruj flotę"
                      )}
                    </Button>
                  )
                )}
              </div>

              {!isExistingUser && (
                <p className="text-center text-sm text-muted-foreground pt-2">
                  Masz już konto?{" "}
                  <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/auth")}>
                    Zaloguj się
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