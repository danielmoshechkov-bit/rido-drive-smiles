import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SignaturePad } from "@/components/fleet/SignaturePad";
import {
  FileText, AlertCircle, CheckCircle, ChevronRight, ChevronLeft, 
  Loader2, PenTool, Eye, Car, User, CreditCard
} from "lucide-react";

interface PendingDocument {
  id: string;
  template_code: string;
  template_name: string;
  status: string;
  fleet_id: string;
  contract_number: string | null;
  filled_data: any;
  created_at: string;
}

interface DriverDocumentSigningFlowProps {
  driverId: string;
  onComplete?: () => void;
}

const STEPS = [
  { id: 'personal', label: 'Dane osobowe', icon: User },
  { id: 'vehicle', label: 'Dane pojazdu', icon: Car },
  { id: 'payment', label: 'Forma rozliczenia', icon: CreditCard },
  { id: 'preview', label: 'Podgląd umowy', icon: Eye },
  { id: 'sign', label: 'Podpis', icon: PenTool },
];

export function DriverDocumentSigningFlow({ driverId, onComplete }: DriverDocumentSigningFlowProps) {
  const [pendingDocs, setPendingDocs] = useState<PendingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDoc, setActiveDoc] = useState<PendingDocument | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    full_name: '',
    pesel: '',
    // Adres zameldowania
    reg_street: '',
    reg_house: '',
    reg_apartment: '',
    reg_postal_code: '',
    reg_city: '',
    // Adres korespondencyjny
    corr_same_as_reg: true,
    corr_street: '',
    corr_house: '',
    corr_apartment: '',
    corr_postal_code: '',
    corr_city: '',
    // Adres zamieszkania
    res_same_as_reg: true,
    res_street: '',
    res_house: '',
    res_apartment: '',
    res_postal_code: '',
    res_city: '',
    // Vehicle
    car_brand: '',
    car_model: '',
    car_year: '',
    car_vin: '',
    car_color: '',
    car_registration: '',
    // Payment
    payment_method: 'transfer' as 'transfer' | 'cash',
    bank_account: '',
  });

  const [fleetData, setFleetData] = useState<any>(null);
  const [fleetSignature, setFleetSignature] = useState<{ signature_url: string | null; stamp_url: string | null } | null>(null);

  useEffect(() => {
    loadPendingDocuments();
    loadDriverData();
  }, [driverId]);

  const loadPendingDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('driver_document_requests' as any)
      .select('*')
      .eq('driver_id', driverId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPendingDocs(data as any as PendingDocument[]);
      // Load fleet data for first doc
      if (data.length > 0) {
        const fleetId = (data[0] as any).fleet_id;
        if (fleetId) {
          const { data: fleet } = await supabase
            .from('fleets')
            .select('name, nip, address, city, postal_code, krs, owner_name, logo_url')
            .eq('id', fleetId)
            .single();
          setFleetData(fleet);

          // Load fleet signature
          const { data: sig } = await (supabase as any)
            .from('fleet_signatures')
            .select('signature_url, stamp_url')
            .eq('fleet_id', fleetId)
            .eq('is_active', true)
            .maybeSingle();
          if (sig) setFleetSignature(sig);
        }
      }
    }
    setLoading(false);
  };

  const loadDriverData = async () => {
    const { data: driver } = await supabase
      .from('drivers')
      .select('first_name, last_name, email, phone, iban')
      .eq('id', driverId)
      .single();

    if (driver) {
      setFormData(prev => ({
        ...prev,
        full_name: `${driver.first_name || ''} ${driver.last_name || ''}`.trim(),
        bank_account: driver.iban || '',
      }));
    }

    const { data: assignments } = await supabase
      .from('vehicle_driver_assignments' as any)
      .select('vehicles(brand, model, year, vin, color, registration_number)')
      .eq('driver_id', driverId)
      .eq('status', 'active')
      .limit(1);

    if (assignments && assignments.length > 0) {
      const vehicle = (assignments[0] as any).vehicles;
      if (vehicle) {
        setFormData(prev => ({
          ...prev,
          car_brand: vehicle.brand || '',
          car_model: vehicle.model || '',
          car_year: vehicle.year?.toString() || '',
          car_vin: vehicle.vin || '',
          car_color: vehicle.color || '',
          car_registration: vehicle.registration_number || '',
        }));
      }
    }
  };

  const updateField = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const getRegisteredAddress = () =>
    `${formData.reg_street} ${formData.reg_house}${formData.reg_apartment ? '/' + formData.reg_apartment : ''}, ${formData.reg_postal_code} ${formData.reg_city}`;

  const getCorrespondenceAddress = () => {
    if (formData.corr_same_as_reg) return getRegisteredAddress();
    return `${formData.corr_street} ${formData.corr_house}${formData.corr_apartment ? '/' + formData.corr_apartment : ''}, ${formData.corr_postal_code} ${formData.corr_city}`;
  };

  const getResidentialAddress = () => {
    if (formData.res_same_as_reg) return getRegisteredAddress();
    return `${formData.res_street} ${formData.res_house}${formData.res_apartment ? '/' + formData.res_apartment : ''}, ${formData.res_postal_code} ${formData.res_city}`;
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: {
        const peselDigits = formData.pesel.replace(/\D/g, '');
        return formData.full_name && peselDigits.length === 11 && formData.reg_street && formData.reg_house && formData.reg_postal_code && formData.reg_city
          && (formData.corr_same_as_reg || (formData.corr_street && formData.corr_house && formData.corr_postal_code && formData.corr_city))
          && (formData.res_same_as_reg || (formData.res_street && formData.res_house && formData.res_postal_code && formData.res_city));
      }
      case 1: {
        const vinClean = formData.car_vin.replace(/\s/g, '');
        return formData.car_brand && formData.car_model && vinClean.length === 17 && formData.car_registration;
      }
      case 2: {
        if (formData.payment_method === 'cash') return true;
        const ibanClean = formData.bank_account.replace(/\s/g, '');
        return (ibanClean.length === 26 && /^\d+$/.test(ibanClean)) || (ibanClean.length === 28 && /^PL\d{26}$/i.test(ibanClean));
      }
      case 3:
        return true;
      default:
        return false;
    }
  };

  const generateContractNumber = async (): Promise<string> => {
    const now = new Date();
    const year = now.getFullYear();
    // Get current max contract number for this year from all requests
    const { data } = await supabase
      .from('driver_document_requests' as any)
      .select('contract_number')
      .not('contract_number', 'is', null);
    
    let maxNum = 0;
    if (data) {
      for (const row of data as any[]) {
        const cn = row.contract_number as string;
        if (cn && cn.endsWith(`/${year}`)) {
          const num = parseInt(cn.split('/')[0], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
    return `${maxNum + 1}/${year}`;
  };

  const handleSign = async (signatureDataUrl: string) => {
    if (!activeDoc) return;
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || driverId;
      
      const blob = await fetch(signatureDataUrl).then(r => r.blob());
      const path = `${userId}/${activeDoc.id}_signature_${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from('driver-documents')
        .upload(path, blob, { contentType: 'image/png' });

      let signatureUrl = '';
      if (uploadError) {
        console.error('Signature upload error:', uploadError);
        toast.error('Błąd uploadu podpisu, ale umowa zostanie zapisana');
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('driver-documents')
          .getPublicUrl(path);
        signatureUrl = publicUrl;
      }

      const contractNumber = activeDoc.contract_number || await generateContractNumber();

      const filledData = {
        ...formData,
        registered_address: getRegisteredAddress(),
        correspondence_address: getCorrespondenceAddress(),
        residential_address: getResidentialAddress(),
      };

      const { error } = await supabase
        .from('driver_document_requests' as any)
        .update({
          status: 'signed',
          filled_data: filledData,
          contract_number: contractNumber,
          signed_at: new Date().toISOString(),
          signature_url: signatureUrl,
          signature_ip: 'browser',
          signature_user_agent: navigator.userAgent,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', activeDoc.id);

      if (error) throw error;

      await supabase
        .from('drivers')
        .update({
          iban: formData.bank_account || null,
          payment_method: formData.payment_method,
        } as any)
        .eq('id', driverId);

      toast.success('Umowa podpisana pomyślnie!');
      setActiveDoc(null);
      setCurrentStep(0);
      loadPendingDocuments();
      onComplete?.();
    } catch (error: any) {
      toast.error('Błąd zapisywania: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const getContractPreviewHtml = () => {
    if (!activeDoc) return '';
    const contractNum = activeDoc.contract_number || '(zostanie nadany automatycznie)';
    const today = new Date().toLocaleDateString('pl-PL');
    const fleetName = fleetData?.name || '[Nazwa Partnera Flotowego]';
    const fleetAddress = fleetData?.address ? `${fleetData.address}${fleetData.postal_code ? ', ' + fleetData.postal_code : ''} ${fleetData.city || ''}` : '……………………………………………………………';
    const fleetNip = fleetData?.nip || '…………………………………';
    const fleetKrs = fleetData?.krs || '…………………………………';
    const fleetOwner = fleetData?.owner_name || '……………………………………………';
    const fleetLogoUrl = (fleetData as any)?.logo_url || null;
    const fleetSigUrl = fleetSignature?.signature_url || null;
    const fleetStampUrl = fleetSignature?.stamp_url || null;

    return `
<div style="font-family: 'Times New Roman', Georgia, serif; max-width: 700px; margin: 0 auto; padding: 30px; font-size: 13px; line-height: 1.8; color: #1a1a1a;">
  
  ${fleetLogoUrl ? `<div style="text-align: center; margin-bottom: 20px;"><img src="${fleetLogoUrl}" alt="Logo" style="max-height: 60px; max-width: 200px; object-fit: contain;" /></div>` : ''}

  <h1 style="text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 5px; letter-spacing: 2px;">UMOWA NAJMU POJAZDU</h1>
  <p style="text-align: center; font-size: 14px; font-weight: bold; margin-bottom: 25px;">Nr ${contractNum}</p>
  
  <p style="text-align: center; margin-bottom: 30px;">zawarta w dniu <strong>${today}</strong> pomiędzy:</p>
  
  <div style="margin-bottom: 20px; padding: 15px; border-left: 3px solid #333;">
    <p style="margin: 0;"><strong>${fleetName}</strong></p>
    <p style="margin: 2px 0;">z siedzibą: ${fleetAddress}</p>
    <p style="margin: 2px 0;">NIP: ${fleetNip}</p>
    <p style="margin: 2px 0;">KRS / CEIDG: ${fleetKrs}</p>
    <p style="margin: 2px 0;">reprezentowaną przez: ${fleetOwner}</p>
    <p style="margin: 5px 0 0; font-style: italic;">zwaną dalej „Najemcą"</p>
  </div>
  
  <p style="text-align: center; margin: 15px 0;">a</p>
  
  <div style="margin-bottom: 25px; padding: 15px; border-left: 3px solid #333;">
    <p style="margin: 0;">Panem/Panią: <strong>${formData.full_name}</strong></p>
    <p style="margin: 2px 0;">PESEL: ${formData.pesel}</p>
    <p style="margin: 2px 0;">adres zameldowania: ${getRegisteredAddress()}</p>
    ${!formData.res_same_as_reg ? `<p style="margin: 2px 0;">adres zamieszkania: ${getResidentialAddress()}</p>` : ''}
    ${!formData.corr_same_as_reg ? `<p style="margin: 2px 0;">adres korespondencyjny: ${getCorrespondenceAddress()}</p>` : ''}
    <p style="margin: 5px 0 0; font-style: italic;">zwanym/ą dalej „Wynajmującym"</p>
  </div>

  <hr style="border: none; border-top: 1px solid #ccc; margin: 25px 0;" />

  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§1 Przedmiot umowy</h2>
  <p>Wynajmujący oddaje Najemcy do używania pojazd:</p>
  <table style="width: 100%; border-collapse: collapse; margin: 10px 0; border: 1px solid #ddd;">
    <tr style="background: #f5f5f5;"><td style="padding: 6px 12px; border: 1px solid #ddd; width: 180px;"><strong>Marka:</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;">${formData.car_brand}</td></tr>
    <tr><td style="padding: 6px 12px; border: 1px solid #ddd;"><strong>Model:</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;">${formData.car_model}</td></tr>
    <tr style="background: #f5f5f5;"><td style="padding: 6px 12px; border: 1px solid #ddd;"><strong>Numer VIN:</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;">${formData.car_vin}</td></tr>
    <tr><td style="padding: 6px 12px; border: 1px solid #ddd;"><strong>Numer rejestracyjny:</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;">${formData.car_registration}</td></tr>
  </table>
  <p>Wynajmujący oświadcza, że:</p>
  <p style="margin-left: 20px;">a) jest właścicielem pojazdu lub posiada tytuł prawny do jego wynajmu,</p>
  <p style="margin-left: 20px;">b) pojazd jest sprawny technicznie i dopuszczony do ruchu,</p>
  <p style="margin-left: 20px;">c) pojazd posiada wymagane badania techniczne oraz ubezpieczenie OC,</p>
  <p style="margin-left: 20px;">d) pojazd spełnia wymogi przewidziane przepisami prawa dla świadczenia usług przewozowych (jeżeli dotyczy).</p>

  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§2 Cel najmu</h2>
  <p>Pojazd zostaje oddany w najem w celu wykorzystania go do świadczenia usług przewozowych za pośrednictwem aplikacji transportowych.</p>
  <p>Umowa ma charakter cywilnoprawny i nie stanowi umowy o pracę.</p>

  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§3 Okres obowiązywania</h2>
  <p>1. Umowa zawarta na czas nieokreślony.</p>
  <p>2. Każda ze stron może wypowiedzieć umowę z 7-dniowym okresem wypowiedzenia.</p>
  <p>3. Najemca może rozwiązać umowę ze skutkiem natychmiastowym w przypadku utraty przez pojazd zdolności do wykonywania usług przewozowych.</p>

  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§4 Czynsz</h2>
  <p>1. Czynsz najmu ustalany jest miesięcznie.</p>
  <p>2. Wysokość czynszu może być uzależniona od poziomu eksploatacji pojazdu.</p>
  <p>3. Czynsz może być wypłacany w formie zaliczek tygodniowych.</p>
  <p>4. Brak eksploatacji pojazdu nie rodzi roszczenia o minimalny czynsz.</p>
  <p>5. Ostateczne rozliczenie następuje do 10 dnia miesiąca następującego po miesiącu rozliczeniowym.</p>
  <p>6. Czynsz będzie płatny ${formData.payment_method === 'transfer' ? 'przelewem na rachunek bankowy Wynajmującego nr: <strong>' + formData.bank_account + '</strong>' : 'gotówką'}.</p>

  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§5 Odpowiedzialność</h2>
  <p>1. Wynajmujący ponosi odpowiedzialność za stan techniczny pojazdu.</p>
  <p>2. Mandaty, kary administracyjne oraz inne należności wynikające z eksploatacji pojazdu obciążają Wynajmującego, chyba że wynikają z winy Najemcy.</p>
  <p>3. Wynajmujący zobowiązuje się do niezwłocznego usuwania usterek uniemożliwiających korzystanie z pojazdu.</p>

  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§6 Odpowiedzialność podatkowa</h2>
  <p>1. Czynsz stanowi przychód Wynajmującego.</p>
  <p>2. Wynajmujący zobowiązuje się do samodzielnego rozliczania podatku dochodowego zgodnie z obowiązującymi przepisami.</p>
  <p>3. Najemca nie pełni funkcji płatnika podatku dochodowego od czynszu.</p>

  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§7 Postanowienia końcowe</h2>
  <p>1. W sprawach nieuregulowanych zastosowanie mają przepisy Kodeksu cywilnego.</p>
  <p>2. Zmiany wymagają formy pisemnej.</p>
  <p>3. Spory rozstrzyga sąd właściwy dla siedziby Najemcy.</p>
  <p>4. Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze Stron.</p>

  <div style="display: flex; justify-content: space-between; margin-top: 60px; padding-top: 20px; border-top: 1px solid #eee;">
    <div style="text-align: center; width: 40%;">
      <p style="margin-bottom: 10px; font-weight: bold;">Wynajmujący</p>
      <p style="color: #888; font-size: 11px; margin-bottom: 15px;">(kierowca / właściciel pojazdu)</p>
      <div style="min-height: 60px; display: flex; align-items: center; justify-content: center;">
        <p style="color: #aaa;">……………………………………</p>
      </div>
    </div>
    <div style="text-align: center; width: 20%;">
      ${fleetStampUrl ? `<div style="display: flex; align-items: center; justify-content: center; height: 100%;"><img src="${fleetStampUrl}" alt="Pieczątka" style="max-height: 50px;" /></div>` : ''}
    </div>
    <div style="text-align: center; width: 40%;">
      <p style="margin-bottom: 10px; font-weight: bold;">Najemca</p>
      <p style="color: #888; font-size: 11px; margin-bottom: 15px;">${fleetName}</p>
      <div style="min-height: 60px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;">
        ${fleetSigUrl ? `<img src="${fleetSigUrl}" alt="Podpis" style="max-height: 50px;" />` : '<p style="color: #aaa;">……………………………………</p>'}
      </div>
    </div>
  </div>
</div>`;
  };

  const renderAddressBlock = (prefix: string, label: string) => (
    <div className="space-y-3">
      <h4 className="font-medium text-sm">{label}</h4>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Ulica *</Label>
          <Input value={(formData as any)[`${prefix}_street`]} onChange={e => updateField(`${prefix}_street`, e.target.value)} placeholder="ul. Przykładowa" />
        </div>
        <div>
          <Label>Nr domu *</Label>
          <Input value={(formData as any)[`${prefix}_house`]} onChange={e => updateField(`${prefix}_house`, e.target.value)} placeholder="10" />
        </div>
        <div>
          <Label>Nr lokalu</Label>
          <Input value={(formData as any)[`${prefix}_apartment`]} onChange={e => updateField(`${prefix}_apartment`, e.target.value)} placeholder="5" />
        </div>
        <div>
          <Label>Kod pocztowy *</Label>
          <Input value={(formData as any)[`${prefix}_postal_code`]} onChange={e => {
            const digits = e.target.value.replace(/\D/g, '');
            const formatted = digits.length > 2 ? `${digits.substring(0, 2)}-${digits.substring(2, 5)}` : digits;
            updateField(`${prefix}_postal_code`, formatted);
          }} placeholder="00-000" maxLength={6} />
        </div>
        <div>
          <Label>Miasto *</Label>
          <Input value={(formData as any)[`${prefix}_city`]} onChange={e => updateField(`${prefix}_city`, e.target.value)} placeholder="Warszawa" />
        </div>
      </div>
    </div>
  );

  if (loading) return null;
  if (pendingDocs.length === 0) return null;

  return (
    <>
      {/* Notification Banner */}
      <Card className="border-2 border-orange-400 bg-orange-50 dark:bg-orange-950/20 mb-6">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-orange-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-orange-800 dark:text-orange-200">
                Wymagane dokumenty do wypełnienia
              </h3>
              <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                W celu kontynuacji współpracy, niezbędne jest wypełnienie poniższych dokumentów.
              </p>
              <div className="mt-3 space-y-2">
                {pendingDocs.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between bg-white dark:bg-background rounded-lg p-3 border">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">{doc.template_name}</p>
                        <p className="text-xs text-muted-foreground">Oczekuje na wypełnienie</p>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => { setActiveDoc(doc); setCurrentStep(0); }} className="gap-1">
                      Wypełnij <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Signing Flow Dialog */}
      <Dialog open={!!activeDoc} onOpenChange={(open) => { if (!open) setActiveDoc(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Umowa Najmu Pojazdu
            </DialogTitle>
          </DialogHeader>

          {/* Step Progress */}
          <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = idx === currentStep;
              const isDone = idx < currentStep;
              return (
                <div key={step.id} className="flex items-center gap-1 shrink-0">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isActive ? 'bg-primary text-primary-foreground' : 
                    isDone ? 'bg-primary/20 text-primary' : 
                    'bg-muted text-muted-foreground'
                  }`}>
                    {isDone ? <CheckCircle className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{step.label}</span>
                  </div>
                  {idx < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                </div>
              );
            })}
          </div>

          {/* Step 0 - Personal data with addresses */}
          {currentStep === 0 && (
            <div className="space-y-5">
              <h3 className="font-semibold flex items-center gap-2">
                <User className="h-5 w-5" />
                Dane osobowe Wynajmującego
              </h3>
              <div className="space-y-3">
                <div>
                  <Label>Imię i nazwisko *</Label>
                  <Input value={formData.full_name} onChange={e => updateField('full_name', e.target.value)} placeholder="Jan Kowalski" />
                </div>
                <div>
                  <Label>PESEL *</Label>
                  <Input value={formData.pesel} onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    updateField('pesel', val);
                  }} placeholder="00000000000" maxLength={11} />
                  {formData.pesel && formData.pesel.length > 0 && formData.pesel.length !== 11 && (
                    <p className="text-xs text-destructive mt-1">PESEL musi mieć dokładnie 11 cyfr (wpisano: {formData.pesel.length})</p>
                  )}
                </div>
              </div>

              {/* Adres zameldowania */}
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                {renderAddressBlock('reg', '📍 Adres zameldowania')}
              </div>

              {/* Adres korespondencyjny */}
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">📬 Adres korespondencyjny</h4>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <Checkbox 
                      checked={formData.corr_same_as_reg} 
                      onCheckedChange={(checked) => updateField('corr_same_as_reg', !!checked)}
                    />
                    Taki sam jak zameldowania
                  </label>
                </div>
                {!formData.corr_same_as_reg && renderAddressBlock('corr', '')}
                {formData.corr_same_as_reg && (
                  <p className="text-xs text-muted-foreground italic">Zostanie użyty adres zameldowania</p>
                )}
              </div>

              {/* Adres zamieszkania */}
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">🏠 Adres zamieszkania</h4>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <Checkbox 
                      checked={formData.res_same_as_reg} 
                      onCheckedChange={(checked) => updateField('res_same_as_reg', !!checked)}
                    />
                    Taki sam jak zameldowania
                  </label>
                </div>
                {!formData.res_same_as_reg && renderAddressBlock('res', '')}
                {formData.res_same_as_reg && (
                  <p className="text-xs text-muted-foreground italic">Zostanie użyty adres zameldowania</p>
                )}
              </div>
            </div>
          )}

          {/* Step 1 - Vehicle */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Car className="h-5 w-5" />
                Dane pojazdu
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Marka *</Label>
                  <Input value={formData.car_brand} onChange={e => updateField('car_brand', e.target.value)} placeholder="Toyota" />
                </div>
                <div>
                  <Label>Model *</Label>
                  <Input value={formData.car_model} onChange={e => updateField('car_model', e.target.value)} placeholder="Camry" />
                </div>
                <div>
                  <Label>Rok produkcji</Label>
                  <Input value={formData.car_year} onChange={e => updateField('car_year', e.target.value)} placeholder="2023" />
                </div>
                <div>
                  <Label>Kolor</Label>
                  <Input value={formData.car_color} onChange={e => updateField('car_color', e.target.value)} placeholder="Czarny" />
                </div>
                <div>
                  <Label>Numer VIN *</Label>
                  <Input value={formData.car_vin} onChange={e => updateField('car_vin', e.target.value.toUpperCase())} placeholder="JTDBR32E860..." maxLength={17} />
                  {formData.car_vin && formData.car_vin.replace(/\s/g, '').length !== 17 && (
                    <p className="text-xs text-destructive mt-1">VIN musi mieć dokładnie 17 znaków (wpisano: {formData.car_vin.replace(/\s/g, '').length})</p>
                  )}
                </div>
                <div>
                  <Label>Nr rejestracyjny *</Label>
                  <Input value={formData.car_registration} onChange={e => updateField('car_registration', e.target.value)} placeholder="WA 12345" />
                </div>
              </div>
            </div>
          )}

          {/* Step 2 - Payment */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Forma rozliczenia
              </h3>
              <div className="space-y-3">
                <div>
                  <Label>Metoda płatności *</Label>
                  <Select value={formData.payment_method} onValueChange={v => updateField('payment_method', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transfer">Przelew bankowy</SelectItem>
                      <SelectItem value="cash">Gotówka</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.payment_method === 'transfer' && (
                  <div>
                    <Label>Numer konta bankowego (IBAN) *</Label>
                    <Input value={formData.bank_account} onChange={e => {
                      // Format IBAN: remove non-alphanumeric, group in 4s
                      const cleaned = e.target.value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                      const parts: string[] = [];
                      for (let i = 0; i < cleaned.length; i += 4) {
                        parts.push(cleaned.slice(i, i + 4));
                      }
                      updateField('bank_account', parts.join(' '));
                    }} placeholder="PL 0000 0000 0000 0000 0000 0000" maxLength={39} />
                    {formData.bank_account && (() => {
                      const cleaned = formData.bank_account.replace(/\s/g, '');
                      const isValid = (cleaned.length === 26 && /^\d+$/.test(cleaned)) || (cleaned.length === 28 && /^PL\d{26}$/i.test(cleaned));
                      if (!isValid && cleaned.length > 0) return <p className="text-xs text-destructive mt-1">Nieprawidłowy format IBAN (26 cyfr lub PL + 26 cyfr). Wpisano: {cleaned.length} znaków</p>;
                      return null;
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3 - Preview */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Podgląd umowy
              </h3>
              <div 
                className="border rounded-lg p-4 max-h-[50vh] overflow-y-auto bg-white dark:bg-muted/30 text-sm"
                dangerouslySetInnerHTML={{ __html: getContractPreviewHtml() }} 
              />
              <p className="text-xs text-muted-foreground text-center">
                Sprawdź poprawność danych przed podpisaniem. Możesz wrócić do poprzednich kroków, aby je zmienić.
              </p>
            </div>
          )}

          {/* Step 4 - Signature */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <PenTool className="h-5 w-5" />
                Podpis dokumentu
              </h3>
              <p className="text-sm text-muted-foreground">
                Złóż podpis palcem lub rysikiem poniżej. Podpisując potwierdzasz zapoznanie się z treścią umowy i akceptujesz jej warunki.
              </p>
              {saving ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-3">Zapisywanie umowy...</span>
                </div>
              ) : (
                <SignaturePad 
                  onSign={handleSign} 
                  onCancel={() => setCurrentStep(3)}
                  title="Podpis Wynajmującego"
                />
              )}
            </div>
          )}

          {/* Navigation */}
          {currentStep < 4 && (
            <DialogFooter className="flex justify-between mt-4">
              <Button variant="outline" onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Wstecz
              </Button>
              <Button onClick={() => setCurrentStep(currentStep + 1)} disabled={!canProceed()}>
                {currentStep === 3 ? 'Przejdź do podpisu' : 'Dalej'}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
