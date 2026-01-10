import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  ArrowLeft, ArrowRight, Upload, CheckCircle2, FileText, 
  Car, User, MapPin, Shield, Loader2, Building2, X
} from "lucide-react";

interface City {
  id: string;
  name: string;
}

interface DocumentType {
  id: string;
  name: string;
  required: boolean;
}

interface DriverOnboardingWizardProps {
  profile: {
    first_name: string;
    last_name: string | null;
    email: string;
    phone: string;
  };
  onComplete: () => void;
  onCancel: () => void;
}

interface FormData {
  // Step 1 - Basic
  fleet_nip: string;
  city_id: string;
  payment_method: "transfer" | "cash" | "b2b";
  iban: string;
  
  // Step 2 - Personal & License
  pesel: string;
  license_number: string;
  license_expiry_date: string;
  license_is_unlimited: boolean;
  license_issue_date: string;
  is_foreigner: boolean;
  
  // Step 3 - Addresses
  address_street: string;
  address_city: string;
  address_postal_code: string;
  correspondence_same: boolean;
  correspondence_street: string;
  correspondence_city: string;
  correspondence_postal_code: string;
  
  // Step 4 - Consents
  rodo_consent_data_storage: boolean;
  rodo_consent_data_sharing: boolean;
}

interface DocumentFile {
  type: string;
  file: File | null;
  expiryDate?: string;
  issueDate?: string;
}

export function DriverOnboardingWizard({ profile, onComplete, onCancel }: DriverOnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [cities, setCities] = useState<City[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [fleetInfo, setFleetInfo] = useState<{ id: string; name: string } | null>(null);
  const [fleetError, setFleetError] = useState<string>("");
  const [fleetPaymentSettings, setFleetPaymentSettings] = useState<{
    cash_enabled: boolean;
    cash_pickup_day: string | null;
    cash_pickup_location: string | null;
    cash_pickup_address: string | null;
    b2b_enabled: boolean;
    transfer_enabled: boolean;
  } | null>(null);
  
  const [formData, setFormData] = useState<FormData>({
    fleet_nip: "",
    city_id: "",
    payment_method: "transfer",
    iban: "",
    pesel: "",
    license_number: "",
    license_expiry_date: "",
    license_is_unlimited: false,
    license_issue_date: "",
    is_foreigner: false,
    address_street: "",
    address_city: "",
    address_postal_code: "",
    correspondence_same: true,
    correspondence_street: "",
    correspondence_city: "",
    correspondence_postal_code: "",
    rodo_consent_data_storage: false,
    rodo_consent_data_sharing: false,
  });

  const [documents, setDocuments] = useState<DocumentFile[]>([
    { type: "Prawo jazdy - przód", file: null },
    { type: "Prawo jazdy - tył", file: null },
    { type: "Badanie lekarskie", file: null, expiryDate: "" },
    { type: "Badanie psychologiczne", file: null, expiryDate: "" },
    { type: "Zaświadczenie o niekaralności", file: null, issueDate: "" },
    { type: "Identyfikator taxi - przód", file: null },
    { type: "Identyfikator taxi - tył", file: null },
  ]);

  const [foreignerDocs, setForeignerDocs] = useState<DocumentFile[]>([
    { type: "Niekaralność z kraju pochodzenia", file: null },
    { type: "Tłumaczenie przysięgłe niekaralności", file: null },
  ]);

  useEffect(() => {
    const loadData = async () => {
      const [citiesRes, docTypesRes] = await Promise.all([
        supabase.from("cities").select("id, name").order("name"),
        supabase.from("document_types").select("id, name, required")
      ]);
      
      if (citiesRes.data) setCities(citiesRes.data);
      if (docTypesRes.data) setDocumentTypes(docTypesRes.data);
    };
    loadData();
  }, []);

  const verifyFleetNip = async (nip: string) => {
    const cleanNip = nip.replace(/\s|-/g, "");
    if (cleanNip.length < 10) {
      setFleetInfo(null);
      setFleetError("");
      setFleetPaymentSettings(null);
      return;
    }

    const { data, error } = await supabase
      .from("fleets")
      .select("id, name, cash_enabled, cash_pickup_day, cash_pickup_location, cash_pickup_address, b2b_enabled, transfer_enabled")
      .eq("nip", cleanNip)
      .maybeSingle();

    if (error || !data) {
      setFleetInfo(null);
      setFleetError("Nie znaleziono floty o podanym NIP");
      setFleetPaymentSettings(null);
    } else {
      setFleetInfo({ id: data.id, name: data.name });
      setFleetError("");
      setFleetPaymentSettings({
        cash_enabled: (data as any).cash_enabled ?? false,
        cash_pickup_day: (data as any).cash_pickup_day ?? null,
        cash_pickup_location: (data as any).cash_pickup_location ?? null,
        cash_pickup_address: (data as any).cash_pickup_address ?? null,
        b2b_enabled: (data as any).b2b_enabled ?? false,
        transfer_enabled: (data as any).transfer_enabled ?? true,
      });
    }
  };

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (field === "fleet_nip") {
      verifyFleetNip(value);
    }
  };

  const handleDocumentChange = (index: number, file: File | null, isForeigner = false) => {
    if (isForeigner) {
      setForeignerDocs(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], file };
        return updated;
      });
    } else {
      setDocuments(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], file };
        return updated;
      });
    }
  };

  const handleDocumentDateChange = (index: number, field: "expiryDate" | "issueDate", value: string, isForeigner = false) => {
    if (isForeigner) {
      setForeignerDocs(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
    } else {
      setDocuments(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
    }
  };

  const validateStep1 = () => {
    if (!formData.city_id) {
      toast.error("Wybierz miasto");
      return false;
    }
    if (formData.payment_method === "transfer" && !formData.iban) {
      toast.error("Podaj numer konta IBAN");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!formData.pesel || formData.pesel.length !== 11) {
      toast.error("Podaj prawidłowy numer PESEL (11 cyfr)");
      return false;
    }
    if (!formData.license_number) {
      toast.error("Podaj numer prawa jazdy");
      return false;
    }
    if (!formData.license_is_unlimited && !formData.license_expiry_date) {
      toast.error("Podaj datę ważności prawa jazdy");
      return false;
    }
    if (formData.license_is_unlimited && !formData.license_issue_date) {
      toast.error("Podaj datę wydania prawa jazdy");
      return false;
    }
    
    // Check required documents
    const licenseFront = documents.find(d => d.type === "Prawo jazdy - przód");
    const licenseBack = documents.find(d => d.type === "Prawo jazdy - tył");
    if (!licenseFront?.file || !licenseBack?.file) {
      toast.error("Dodaj zdjęcia prawa jazdy (przód i tył)");
      return false;
    }
    
    const medical = documents.find(d => d.type === "Badanie lekarskie");
    if (!medical?.file || !medical?.expiryDate) {
      toast.error("Dodaj badanie lekarskie z datą ważności");
      return false;
    }
    
    const psychological = documents.find(d => d.type === "Badanie psychologiczne");
    if (!psychological?.file || !psychological?.expiryDate) {
      toast.error("Dodaj badanie psychologiczne z datą ważności");
      return false;
    }
    
    return true;
  };

  const validateStep3 = () => {
    if (!formData.address_street || !formData.address_city || !formData.address_postal_code) {
      toast.error("Wypełnij adres zamieszkania");
      return false;
    }
    if (!formData.correspondence_same) {
      if (!formData.correspondence_street || !formData.correspondence_city || !formData.correspondence_postal_code) {
        toast.error("Wypełnij adres korespondencyjny");
        return false;
      }
    }
    return true;
  };

  const validateStep4 = () => {
    if (!formData.rodo_consent_data_storage) {
      toast.error("Wymagana zgoda na przechowywanie danych");
      return false;
    }
    if (!formData.rodo_consent_data_sharing) {
      toast.error("Wymagana zgoda na przekazywanie danych");
      return false;
    }
    return true;
  };

  const nextStep = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    setStep(prev => Math.min(prev + 1, 4));
  };

  const prevStep = () => {
    setStep(prev => Math.max(prev - 1, 1));
  };

  const uploadDocument = async (driverId: string, userId: string, doc: DocumentFile) => {
    if (!doc.file) return null;
    
    const fileExt = doc.file.name.split(".").pop();
    const fileName = `${userId}/${doc.type.replace(/\s/g, "_")}_${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from("driver-documents")
      .upload(fileName, doc.file);
    
    if (uploadError) {
      console.error("Upload error:", uploadError);
      return null;
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from("driver-documents")
      .getPublicUrl(fileName);
    
    // Find document type id
    const docType = documentTypes.find(dt => dt.name === doc.type);
    
    if (docType) {
      await supabase.from("driver_documents").insert({
        driver_id: driverId,
        document_type_id: docType.id,
        file_url: publicUrl,
        file_name: doc.file.name,
        expires_at: doc.expiryDate || null,
        status: "pending"
      });
    }
    
    return publicUrl;
  };

  const handleSubmit = async () => {
    if (!validateStep4()) return;
    
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Brak sesji użytkownika");
        return;
      }

      // Create driver record
      const driverData: any = {
        first_name: profile.first_name,
        last_name: profile.last_name || '',
        email: profile.email,
        phone: profile.phone,
        city_id: formData.city_id,
        payment_method: formData.payment_method,
        iban: formData.payment_method === "transfer" ? formData.iban : null,
        fleet_id: fleetInfo?.id || null,
        pesel: formData.pesel,
        license_number: formData.license_number,
        license_expiry_date: formData.license_is_unlimited ? null : formData.license_expiry_date,
        license_is_unlimited: formData.license_is_unlimited,
        license_issue_date: formData.license_issue_date || null,
        is_foreigner: formData.is_foreigner,
        address_street: formData.address_street,
        address_city: formData.address_city,
        address_postal_code: formData.address_postal_code,
        correspondence_street: formData.correspondence_same ? formData.address_street : formData.correspondence_street,
        correspondence_city: formData.correspondence_same ? formData.address_city : formData.correspondence_city,
        correspondence_postal_code: formData.correspondence_same ? formData.address_postal_code : formData.correspondence_postal_code,
        rodo_consent_data_storage: formData.rodo_consent_data_storage,
        rodo_consent_data_sharing: formData.rodo_consent_data_sharing,
        rodo_consent_date: new Date().toISOString(),
      };

      const { data: driver, error: driverError } = await supabase
        .from("drivers")
        .insert(driverData)
        .select()
        .single();

      if (driverError) {
        console.error("Driver creation error:", driverError);
        toast.error("Błąd tworzenia profilu kierowcy");
        return;
      }

      // Link auth user to driver
      const { error: linkError } = await supabase.rpc('link_auth_user_to_driver', {
        p_user_id: session.user.id,
        p_driver_id: driver.id
      });

      if (linkError) {
        console.error("Link error:", linkError);
        toast.error("Błąd powiązania konta");
        return;
      }

      // Upload documents
      const allDocs = [...documents, ...(formData.is_foreigner ? foreignerDocs : [])];
      for (const doc of allDocs) {
        if (doc.file) {
          await uploadDocument(driver.id, session.user.id, doc);
        }
      }

      toast.success(fleetInfo 
        ? `Zarejestrowano jako kierowca w flocie ${fleetInfo.name}!` 
        : "Rejestracja zakończona pomyślnie!");
      
      onComplete();
    } catch (error) {
      console.error("Registration error:", error);
      toast.error("Błąd rejestracji kierowcy");
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitles = [
    { num: 1, title: "Dane podstawowe", icon: User },
    { num: 2, title: "Dokumenty", icon: FileText },
    { num: 3, title: "Adres", icon: MapPin },
    { num: 4, title: "Zgody RODO", icon: Shield },
  ];

  return (
    <div className="space-y-6">
      {/* Progress Steps - Clickable */}
      <div className="flex items-center justify-between mb-8">
        {stepTitles.map((s, i) => (
          <div key={s.num} className="flex items-center flex-1">
            <div 
              className={`flex items-center gap-2 cursor-pointer transition-transform hover:scale-105 ${step >= s.num ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => {
                // Can always go back
                if (s.num < step) {
                  setStep(s.num);
                } else if (s.num === step + 1) {
                  // Next step - validate current
                  if (step === 1 && validateStep1()) setStep(s.num);
                  if (step === 2 && validateStep2()) setStep(s.num);
                  if (step === 3 && validateStep3()) setStep(s.num);
                }
              }}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 
                ${step >= s.num ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground'}`}>
                {step > s.num ? <CheckCircle2 className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
              </div>
              <span className="text-sm font-medium hidden sm:block">{s.title}</span>
            </div>
            {i < stepTitles.length - 1 && (
              <div className={`flex-1 h-1 mx-4 rounded ${step > s.num ? 'bg-primary' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1 - Basic Info */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Dane podstawowe
            </CardTitle>
            <CardDescription>
              Podaj podstawowe informacje potrzebne do rejestracji
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Fleet NIP */}
            <div className="space-y-2">
              <Label>NIP partnera flotowego (opcjonalnie)</Label>
              <Input
                placeholder="Np. 1234567890"
                value={formData.fleet_nip}
                onChange={(e) => handleInputChange("fleet_nip", e.target.value)}
                className="max-w-xs"
              />
              {fleetInfo && (
                <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg max-w-md">
                  <Building2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-sm text-green-700">Dołączysz do floty: <strong>{fleetInfo.name}</strong></span>
                </div>
              )}
              {fleetError && (
                <p className="text-sm text-destructive">{fleetError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Jeśli nie podasz NIP, zostaniesz zarejestrowany bez przypisania do floty.
              </p>
            </div>

            {/* City */}
            <div className="space-y-2">
              <Label>Miasto *</Label>
              <Select
                value={formData.city_id}
                onValueChange={(v) => handleInputChange("city_id", v)}
              >
                <SelectTrigger className="max-w-xs">
                  <SelectValue placeholder="Wybierz miasto" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((city) => (
                    <SelectItem key={city.id} value={city.id}>
                      {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label>Metoda płatności *</Label>
              {/* Without fleet NIP - only show transfer */}
              {!fleetPaymentSettings ? (
                <RadioGroup
                  value="transfer"
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="transfer" id="transfer" />
                    <Label htmlFor="transfer">Przelew</Label>
                  </div>
                </RadioGroup>
              ) : (
                /* With fleet NIP - show fleet's enabled payment methods */
                <RadioGroup
                  value={formData.payment_method}
                  onValueChange={(v) => handleInputChange("payment_method", v as any)}
                  className="flex gap-4"
                >
                  {fleetPaymentSettings.transfer_enabled && (
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="transfer" id="transfer" />
                      <Label htmlFor="transfer">Przelew</Label>
                    </div>
                  )}
                  {fleetPaymentSettings.cash_enabled && (
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="cash" id="cash" />
                      <Label htmlFor="cash">Gotówka</Label>
                    </div>
                  )}
                  {fleetPaymentSettings.b2b_enabled && (
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="b2b" id="b2b" />
                      <Label htmlFor="b2b">B2B (faktura)</Label>
                    </div>
                  )}
                </RadioGroup>
              )}
              {!fleetPaymentSettings && (
                <p className="text-xs text-muted-foreground">
                  Podaj NIP partnera flotowego, aby zobaczyć dostępne metody płatności
                </p>
              )}
            </div>

            {formData.payment_method === "transfer" && (
              <div className="space-y-2">
                <Label>Numer konta IBAN *</Label>
                <Input
                  placeholder="PL00 0000 0000 0000 0000 0000 0000"
                  value={formData.iban}
                  onChange={(e) => handleInputChange("iban", e.target.value)}
                />
              </div>
            )}

            {formData.payment_method === "cash" && fleetPaymentSettings?.cash_enabled && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                💵 Gotówka do odbioru w każdy <strong>{fleetPaymentSettings.cash_pickup_day || 'wtorek'}</strong>
                {fleetPaymentSettings.cash_pickup_location === 'delivery' && fleetPaymentSettings.cash_pickup_address
                  ? <> - dostawa pod adres: <strong>{fleetPaymentSettings.cash_pickup_address}</strong></>
                  : <> w biurze floty</>
                }
              </div>
            )}

            {formData.payment_method === "cash" && !fleetPaymentSettings && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                💵 Szczegóły odbioru gotówki zostaną ustalone po rejestracji
              </div>
            )}

            {formData.payment_method === "b2b" && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm">
                📋 Rozliczenia B2B - będziesz mógł przesyłać faktury po rejestracji
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2 - Personal & Documents */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Dane osobowe i dokumenty
            </CardTitle>
            <CardDescription>
              Podaj dane osobowe i załącz wymagane dokumenty
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* PESEL */}
            <div className="space-y-2">
              <Label>PESEL *</Label>
              <Input
                placeholder="00000000000"
                maxLength={11}
                value={formData.pesel}
                onChange={(e) => handleInputChange("pesel", e.target.value.replace(/\D/g, ""))}
              />
            </div>

            {/* License Number */}
            <div className="space-y-2">
              <Label>Numer prawa jazdy *</Label>
              <Input
                placeholder="Np. ABC123456"
                value={formData.license_number}
                onChange={(e) => handleInputChange("license_number", e.target.value.toUpperCase())}
              />
            </div>

            {/* License Validity */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="unlimited"
                checked={formData.license_is_unlimited}
                onCheckedChange={(c) => handleInputChange("license_is_unlimited", c)}
              />
              <Label htmlFor="unlimited">Prawo jazdy bezterminowe</Label>
            </div>

            {!formData.license_is_unlimited ? (
              <div className="space-y-2">
                <Label>Data ważności prawa jazdy *</Label>
                <Input
                  type="date"
                  value={formData.license_expiry_date}
                  onChange={(e) => handleInputChange("license_expiry_date", e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Data wydania prawa jazdy *</Label>
                <Input
                  type="date"
                  value={formData.license_issue_date}
                  onChange={(e) => handleInputChange("license_issue_date", e.target.value)}
                />
              </div>
            )}

            {/* License Photos */}
            <div className="grid md:grid-cols-2 gap-4">
              {documents.slice(0, 2).map((doc, idx) => (
                <div key={doc.type} className="space-y-2">
                  <Label>{doc.type} *</Label>
                  <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                    {doc.file ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-green-600 truncate">{doc.file.name}</span>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDocumentChange(idx, null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <span className="text-sm text-muted-foreground">Kliknij aby dodać</span>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => handleDocumentChange(idx, e.target.files?.[0] || null)}
                        />
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Medical & Psychological */}
            {documents.slice(2, 4).map((doc, idx) => (
              <div key={doc.type} className="space-y-2 p-4 border rounded-lg">
                <Label>{doc.type} *</Label>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Data ważności</Label>
                    <Input
                      type="date"
                      value={doc.expiryDate || ""}
                      onChange={(e) => handleDocumentDateChange(idx + 2, "expiryDate", e.target.value)}
                    />
                  </div>
                  <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                    {doc.file ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-green-600 truncate">{doc.file.name}</span>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDocumentChange(idx + 2, null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => handleDocumentChange(idx + 2, e.target.files?.[0] || null)}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Criminal Record (optional) */}
            <div className="space-y-2 p-4 border rounded-lg bg-muted/20">
              <div className="flex items-center justify-between">
                <Label>Zaświadczenie o niekaralności</Label>
                <Badge variant="secondary">Opcjonalne</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-2">Maksymalnie 1 miesiąc ważności</p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Data wydania</Label>
                  <Input
                    type="date"
                    value={documents[4].issueDate || ""}
                    onChange={(e) => handleDocumentDateChange(4, "issueDate", e.target.value)}
                  />
                </div>
                <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                  {documents[4].file ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-green-600 truncate">{documents[4].file.name}</span>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDocumentChange(4, null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => handleDocumentChange(4, e.target.files?.[0] || null)}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Foreigner checkbox */}
            <div className="flex items-center gap-2 p-3 border rounded-lg">
              <Checkbox
                id="foreigner"
                checked={formData.is_foreigner}
                onCheckedChange={(c) => handleInputChange("is_foreigner", c)}
              />
              <Label htmlFor="foreigner">Jestem obcokrajowcem</Label>
            </div>

            {/* Foreigner documents */}
            {formData.is_foreigner && (
              <div className="space-y-4 p-4 border border-orange-500/20 rounded-lg bg-orange-500/5">
                <h4 className="font-medium text-orange-700">Dokumenty dla obcokrajowców</h4>
                {foreignerDocs.map((doc, idx) => (
                  <div key={doc.type} className="space-y-2">
                    <Label>{doc.type}</Label>
                    <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                      {doc.file ? (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-green-600 truncate">{doc.file.name}</span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDocumentChange(idx, null, true)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            multiple
                            className="hidden"
                            onChange={(e) => handleDocumentChange(idx, e.target.files?.[0] || null, true)}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Taxi ID (optional) */}
            <div className="space-y-2 p-4 border rounded-lg bg-muted/20">
              <div className="flex items-center justify-between">
                <Label>Identyfikator taxi</Label>
                <Badge variant="secondary">Opcjonalne</Badge>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {documents.slice(5, 7).map((doc, idx) => (
                  <div key={doc.type} className="space-y-2">
                    <Label className="text-sm">{doc.type.replace("Identyfikator taxi - ", "")}</Label>
                    <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                      {doc.file ? (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-green-600 truncate">{doc.file.name}</span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDocumentChange(idx + 5, null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            onChange={(e) => handleDocumentChange(idx + 5, e.target.files?.[0] || null)}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 - Addresses */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Adresy
            </CardTitle>
            <CardDescription>
              Podaj adres zamieszkania i adres korespondencyjny
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h4 className="font-medium">Adres zamieszkania</h4>
              <div className="space-y-2">
                <Label>Ulica i numer *</Label>
                <Input
                  placeholder="Np. ul. Główna 15/3"
                  value={formData.address_street}
                  onChange={(e) => handleInputChange("address_street", e.target.value)}
                />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Miasto *</Label>
                  <Input
                    placeholder="Np. Warszawa"
                    value={formData.address_city}
                    onChange={(e) => handleInputChange("address_city", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Kod pocztowy *</Label>
                  <Input
                    placeholder="00-000"
                    value={formData.address_postal_code}
                    onChange={(e) => handleInputChange("address_postal_code", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 border rounded-lg">
              <Checkbox
                id="correspondence_same"
                checked={formData.correspondence_same}
                onCheckedChange={(c) => handleInputChange("correspondence_same", c)}
              />
              <Label htmlFor="correspondence_same">Adres korespondencyjny taki sam jak zamieszkania</Label>
            </div>

            {!formData.correspondence_same && (
              <div className="space-y-4 p-4 border rounded-lg">
                <h4 className="font-medium">Adres korespondencyjny</h4>
                <div className="space-y-2">
                  <Label>Ulica i numer *</Label>
                  <Input
                    placeholder="Np. ul. Główna 15/3"
                    value={formData.correspondence_street}
                    onChange={(e) => handleInputChange("correspondence_street", e.target.value)}
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Miasto *</Label>
                    <Input
                      placeholder="Np. Warszawa"
                      value={formData.correspondence_city}
                      onChange={(e) => handleInputChange("correspondence_city", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Kod pocztowy *</Label>
                    <Input
                      placeholder="00-000"
                      value={formData.correspondence_postal_code}
                      onChange={(e) => handleInputChange("correspondence_postal_code", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4 - RODO Consents */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Zgody RODO
            </CardTitle>
            <CardDescription>
              Wymagane zgody na przetwarzanie danych osobowych
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 border rounded-lg">
                <Checkbox
                  id="consent_storage"
                  checked={formData.rodo_consent_data_storage}
                  onCheckedChange={(c) => handleInputChange("rodo_consent_data_storage", c)}
                />
                <div className="space-y-1">
                  <Label htmlFor="consent_storage" className="font-medium">
                    Zgoda na przechowywanie danych osobowych *
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Wyrażam zgodę na przechowywanie moich danych osobowych (imię, nazwisko, PESEL, 
                    adres, dokumenty) zgodnie z Rozporządzeniem RODO w celu realizacji usług 
                    przewozowych i rozliczeń.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 border rounded-lg">
                <Checkbox
                  id="consent_sharing"
                  checked={formData.rodo_consent_data_sharing}
                  onCheckedChange={(c) => handleInputChange("rodo_consent_data_sharing", c)}
                />
                <div className="space-y-1">
                  <Label htmlFor="consent_sharing" className="font-medium">
                    Zgoda na przekazywanie danych podmiotom powiązanym *
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Wyrażam zgodę na przekazywanie moich danych osobowych podmiotom powiązanym 
                    (flota, partner flotowy, ubezpieczyciel, platforma przewozowa) w zakresie 
                    niezbędnym do świadczenia usług i realizacji umów.
                  </p>
                </div>
              </div>
            </div>

            {fleetInfo && (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="flex items-center gap-2 text-green-700">
                  <Building2 className="h-5 w-5" />
                  <span className="font-medium">Po rejestracji dołączysz do floty: {fleetInfo.name}</span>
                </div>
              </div>
            )}

            {!fleetInfo && formData.fleet_nip === "" && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  ℹ️ Rejestrujesz się bez przypisania do floty. Możesz dołączyć do floty później 
                  przez zaproszenie od partnera flotowego.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <div>
          {step > 1 ? (
            <Button variant="outline" onClick={prevStep} disabled={submitting}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Wstecz
            </Button>
          ) : (
            <Button variant="ghost" onClick={onCancel} disabled={submitting}>
              Anuluj
            </Button>
          )}
        </div>
        
        <div>
          {step < 4 ? (
            <Button onClick={nextStep}>
              Dalej
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rejestracja...
                </>
              ) : (
                "Zarejestruj się"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
