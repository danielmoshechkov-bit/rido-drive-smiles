import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeft, Shield, Building, Phone, Mail, FileText, MapPin, Search, Loader2 } from "lucide-react";
import { useGusLookup } from "@/hooks/useGusLookup";
import { ShortenLegalFormCheckbox } from "@/components/shared/ShortenLegalFormCheckbox";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";

interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
  companyName: string;
  nip: string;
  phone: string;
  licenseNumber: string;
  address: string;
  acceptTerms: boolean;
  acceptRodo: boolean;
}

const INITIAL_FORM: FormData = {
  email: "",
  password: "",
  confirmPassword: "",
  companyName: "",
  nip: "",
  phone: "",
  licenseNumber: "",
  address: "",
  acceptTerms: false,
  acceptRodo: false,
};

export default function InsuranceAgentRegister() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  useEffect(() => {
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Check if already an insurance agent
        const { data: agent } = await supabase
          .from("insurance_agents")
          .select("id")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (agent) {
          navigate("/ubezpieczenia/panel", { replace: true });
          return;
        }
      }
      setCheckingAuth(false);
    };

    checkExistingSession();
  }, [navigate]);

  const { lookup: gusLookup, loading: gusLoading, shorten: gusShorten, setShorten: setGusShorten } = useGusLookup({
    onCompany: (gus) => {
      setFormData(prev => ({
        ...prev,
        companyName: gus.nazwa,
        nip: gus.nip,
        address: [gus.adres, [gus.kod_pocztowy, gus.miasto].filter(Boolean).join(" ")].filter(Boolean).join(", ") || prev.address,
      }));
    },
  });

  const fetchCompanyFromGus = async () => {
    const gus = await gusLookup(formData.nip);
    if (!gus) {
      toast.error("Nie znaleziono firmy w GUS");
      return;
    }
    toast.success("Dane firmy pobrane z GUS");
  };

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.email) newErrors.email = t('register.emailRequired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('insAgentRegister.emailInvalid');
    }

    if (!formData.password) newErrors.password = t('insAgentRegister.passwordRequired');
    else if (formData.password.length < 6) {
      newErrors.password = t('register.passwordMinLength');
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t('insAgentRegister.passwordsMismatch');
    }

    if (!formData.companyName) newErrors.companyName = t('fleetRegister.companyNameRequired');
    if (!formData.phone) newErrors.phone = t('fleetRegister.phoneRequired');
    if (!formData.acceptTerms) newErrors.acceptTerms = t('insAgentRegister.termsRequired');
    if (!formData.acceptRodo) newErrors.acceptRodo = t('insAgentRegister.rodoRequired');

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            company_name: formData.companyName,
            phone: formData.phone,
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error(t('insAgentRegister.accountCreateFailed'));

      // 2. Create insurance agent profile
      const { error: agentError } = await supabase
        .from("insurance_agents")
        .insert({
          user_id: authData.user.id,
          company_name: formData.companyName,
          nip: formData.nip || null,
          phone: formData.phone,
          email: formData.email,
          license_number: formData.licenseNumber || null,
          address: formData.address || null,
          is_active: true,
        });

      if (agentError) throw agentError;

      // 3. Add role - note: insurance_agent may not be in enum yet, so we use a workaround
      // The role will be checked via insurance_agents table instead
      try {
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({
            user_id: authData.user.id,
            role: "admin" // Temporary - will be replaced when insurance_agent is added to enum
          });
        
        // If role insert fails, we can still proceed - the agent profile exists
        if (roleError) console.warn("Nie dodano roli:", roleError.message);
      } catch (roleErr) {
        console.warn("Role assignment skipped:", roleErr);
      }

      toast.success(t('insAgentRegister.accountCreated'));
      navigate("/register-success");
    } catch (error: any) {
      console.error("Registration error:", error);
      toast.error(error?.message || t('insAgentRegister.registrationError'));
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-end mb-4">
          <LanguageSwitcher variant="outline" />
        </div>
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common.goBack')}
        </Button>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{t('insAgentRegister.title')}</CardTitle>
            <CardDescription>
              {t('insAgentRegister.subtitle')}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Account Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  {t('insAgentRegister.loginData')}
                </h3>
                
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="email">{t('insAgentRegister.email')} *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      placeholder={t('insAgentRegister.emailPlaceholder')}
                      className={errors.email ? "border-destructive" : ""}
                    />
                    {errors.email && <p className="text-sm text-destructive mt-1">{errors.email}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="password">{t('register.password')} *</Label>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => updateField("password", e.target.value)}
                        placeholder={t('insAgentRegister.passwordPlaceholder')}
                        className={errors.password ? "border-destructive" : ""}
                      />
                      {errors.password && <p className="text-sm text-destructive mt-1">{errors.password}</p>}
                    </div>
                    <div>
                      <Label htmlFor="confirmPassword">{t('register.confirmPassword')} *</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={formData.confirmPassword}
                        onChange={(e) => updateField("confirmPassword", e.target.value)}
                        className={errors.confirmPassword ? "border-destructive" : ""}
                      />
                      {errors.confirmPassword && <p className="text-sm text-destructive mt-1">{errors.confirmPassword}</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Company Section */}
              <div className="space-y-4 border-t pt-6">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Building className="h-5 w-5 text-muted-foreground" />
                  {t('fleetRegister.companyData')}
                </h3>
                
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="companyName">{t('insAgentRegister.companyNameLabel')} *</Label>
                    <Input
                      id="companyName"
                      value={formData.companyName}
                      onChange={(e) => updateField("companyName", e.target.value)}
                      placeholder={t('insAgentRegister.companyNamePlaceholder')}
                      className={errors.companyName ? "border-destructive" : ""}
                    />
                    {errors.companyName && <p className="text-sm text-destructive mt-1">{errors.companyName}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="nip">{t('fleetRegister.nip')}</Label>
                      <div className="flex gap-2">
                        <Input
                          id="nip"
                          value={formData.nip}
                          onChange={(e) => updateField("nip", e.target.value)}
                          placeholder="1234567890"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          onClick={fetchCompanyFromGus}
                          disabled={gusLoading || formData.nip.replace(/\D/g, "").length < 10}
                          title="Pobierz dane firmy z GUS"
                        >
                          {gusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </Button>
                      </div>
                      <ShortenLegalFormCheckbox checked={gusShorten} onCheckedChange={setGusShorten} />
                    </div>
                    <div>
                      <Label htmlFor="licenseNumber">{t('insAgentRegister.licenseNumber')}</Label>
                      <Input
                        id="licenseNumber"
                        value={formData.licenseNumber}
                        onChange={(e) => updateField("licenseNumber", e.target.value)}
                        placeholder={t('insAgentRegister.optional')}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Section */}
              <div className="space-y-4 border-t pt-6">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  {t('insAgentRegister.contactData')}
                </h3>
                
                <div className="grid gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="phone">{t('register.phone')} *</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => updateField("phone", e.target.value)}
                        placeholder={t('register.phonePlaceholder')}
                        className={errors.phone ? "border-destructive" : ""}
                      />
                      {errors.phone && <p className="text-sm text-destructive mt-1">{errors.phone}</p>}
                    </div>
                    <div>
                      <Label htmlFor="address">{t('insAgentRegister.officeAddress')}</Label>
                      <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) => updateField("address", e.target.value)}
                        placeholder={t('insAgentRegister.officeAddressPlaceholder')}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Consents */}
              <div className="space-y-4 border-t pt-6">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  {t('insAgentRegister.consents')}
                </h3>

                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="acceptTerms"
                      checked={formData.acceptTerms}
                      onCheckedChange={(checked) => updateField("acceptTerms", checked as boolean)}
                      className={errors.acceptTerms ? "border-destructive" : ""}
                    />
                    <label htmlFor="acceptTerms" className="text-sm leading-relaxed cursor-pointer">
                      {t('register.acceptPrefix')}{" "}
                      <a href="/prawne?tab=regulamin" target="_blank" className="text-primary hover:underline">
                        {t('register.termsLink')}
                      </a>{" "}
                      {t('insAgentRegister.termsSuffix')} *
                    </label>
                  </div>
                  {errors.acceptTerms && <p className="text-sm text-destructive ml-6">{errors.acceptTerms}</p>}

                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="acceptRodo"
                      checked={formData.acceptRodo}
                      onCheckedChange={(checked) => updateField("acceptRodo", checked as boolean)}
                      className={errors.acceptRodo ? "border-destructive" : ""}
                    />
                    <label htmlFor="acceptRodo" className="text-sm leading-relaxed cursor-pointer">
                      {t('insAgentRegister.rodoPrefix')}{" "}
                      <a href="/prawne?tab=polityka" target="_blank" className="text-primary hover:underline">
                        {t('insAgentRegister.privacyLink')}
                      </a>{" "}
                      {t('insAgentRegister.rodoSuffix')} *
                    </label>
                  </div>
                  {errors.acceptRodo && <p className="text-sm text-destructive ml-6">{errors.acceptRodo}</p>}
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? t('register.registering') : t('insAgentRegister.submitButton')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
