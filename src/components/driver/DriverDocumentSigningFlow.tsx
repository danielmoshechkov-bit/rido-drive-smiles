import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

// Steps for the rental contract
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
    // Personal
    full_name: '',
    pesel: '',
    address: '',
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
    }
    setLoading(false);
  };

  const loadDriverData = async () => {
    // Pre-fill with existing driver data
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

    // Check for assigned vehicles
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

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: // Personal
        return formData.full_name && formData.pesel && formData.address;
      case 1: // Vehicle
        return formData.car_brand && formData.car_model && formData.car_vin && formData.car_registration;
      case 2: // Payment
        return formData.payment_method === 'cash' || (formData.payment_method === 'transfer' && formData.bank_account);
      case 3: // Preview
        return true;
      default:
        return false;
    }
  };

  const handleSign = async (signatureDataUrl: string) => {
    if (!activeDoc) return;
    setSaving(true);

    try {
      // Upload signature image
      const blob = await fetch(signatureDataUrl).then(r => r.blob());
      const path = `signatures/${driverId}/${activeDoc.id}_${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from('driver-documents')
        .upload(path, blob, { contentType: 'image/png' });

      let signatureUrl = '';
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('driver-documents')
          .getPublicUrl(path);
        signatureUrl = publicUrl;
      }

      // Update the document request with filled data and signature
      const { error } = await supabase
        .from('driver_document_requests' as any)
        .update({
          status: 'signed',
          filled_data: formData,
          signed_at: new Date().toISOString(),
          signature_url: signatureUrl,
          signature_ip: 'browser',
          signature_user_agent: navigator.userAgent,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', activeDoc.id);

      if (error) throw error;

      // Also update driver record with new data
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
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; font-size: 14px; line-height: 1.6;">
        <h2 style="text-align: center;">UMOWA NAJMU POJAZDU</h2>
        <p style="text-align: center;">${activeDoc.contract_number ? `Nr ${activeDoc.contract_number}` : ''}</p>
        
        <h3>§1 Strony umowy</h3>
        <p><strong>Najemca (Partner Flotowy):</strong> [dane floty]</p>
        <p><strong>Wynajmujący:</strong><br/>
        ${formData.full_name}<br/>
        PESEL: ${formData.pesel}<br/>
        Adres: ${formData.address}</p>
        
        <h3>§2 Przedmiot umowy</h3>
        <p>Marka: ${formData.car_brand}<br/>
        Model: ${formData.car_model}<br/>
        Rok: ${formData.car_year}<br/>
        VIN: ${formData.car_vin}<br/>
        Kolor: ${formData.car_color}<br/>
        Nr rejestracyjny: ${formData.car_registration}</p>
        
        <h3>§3 Okres trwania</h3>
        <p>Umowa na czas nieokreślony. Wypowiedzenie z 7-dniowym okresem.</p>
        
        <h3>§4 Czynsz najmu</h3>
        <p>Rozliczenie: ${formData.payment_method === 'transfer' ? 'Przelew bankowy' : 'Gotówka'}</p>
        ${formData.payment_method === 'transfer' ? `<p>Nr konta: ${formData.bank_account}</p>` : ''}
        
        <h3>§5 Obowiązki Wynajmującego</h3>
        <p>Utrzymywanie pojazdu, zapewnienie badań technicznych i OC.</p>
        
        <h3>§6 Odpowiedzialność podatkowa</h3>
        <p>Czynsz stanowi przychód Wynajmującego. Samodzielne rozliczenie podatku.</p>
        
        <h3>§7 Postanowienia końcowe</h3>
        <p>Zastosowanie przepisów KC. Zmiany wymagają formy pisemnej.</p>
      </div>
    `;
  };

  if (loading) {
    return null;
  }

  if (pendingDocs.length === 0) {
    return null;
  }

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
                        <p className="text-xs text-muted-foreground">
                          {doc.contract_number ? `Nr ${doc.contract_number}` : 'Oczekuje na wypełnienie'}
                        </p>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => { setActiveDoc(doc); setCurrentStep(0); }}
                      className="gap-1"
                    >
                      Wypełnij
                      <ChevronRight className="h-4 w-4" />
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
              {activeDoc?.template_name}
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

          {/* Step Content */}
          {currentStep === 0 && (
            <div className="space-y-4">
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
                  <Input value={formData.pesel} onChange={e => updateField('pesel', e.target.value)} placeholder="00000000000" maxLength={11} />
                </div>
                <div>
                  <Label>Adres zamieszkania *</Label>
                  <Input value={formData.address} onChange={e => updateField('address', e.target.value)} placeholder="ul. Przykładowa 1, 00-000 Warszawa" />
                </div>
              </div>
            </div>
          )}

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
                  <Input value={formData.car_vin} onChange={e => updateField('car_vin', e.target.value)} placeholder="JTDBR32E860..." maxLength={17} />
                </div>
                <div>
                  <Label>Nr rejestracyjny *</Label>
                  <Input value={formData.car_registration} onChange={e => updateField('car_registration', e.target.value)} placeholder="WA 12345" />
                </div>
              </div>
            </div>
          )}

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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transfer">Przelew bankowy</SelectItem>
                      <SelectItem value="cash">Gotówka</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.payment_method === 'transfer' && (
                  <div>
                    <Label>Numer konta bankowego (IBAN) *</Label>
                    <Input 
                      value={formData.bank_account} 
                      onChange={e => updateField('bank_account', e.target.value)} 
                      placeholder="PL 00 0000 0000 0000 0000 0000 0000" 
                    />
                  </div>
                )}
              </div>
            </div>
          )}

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
              <Button 
                variant="outline" 
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Wstecz
              </Button>
              <Button 
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={!canProceed()}
              >
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
