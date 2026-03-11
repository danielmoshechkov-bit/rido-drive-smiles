import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  PenTool, 
  Save, 
  Trash2, 
  Loader2, 
  CheckCircle,
  AlertCircle,
  Stamp,
  Upload,
  Building2,
  UserCog
} from "lucide-react";
import { AccountSettingsTab } from "./AccountSettingsTab";
import { formatPostalCode } from "@/utils/formatters";

// Polish postal code to city mapping
const POSTAL_CODE_MAP: Record<string, string> = {
  '00': 'Warszawa', '01': 'Warszawa', '02': 'Warszawa', '03': 'Warszawa', '04': 'Warszawa',
  '30': 'Kraków', '31': 'Kraków', '50': 'Wrocław', '51': 'Wrocław',
  '60': 'Poznań', '61': 'Poznań', '80': 'Gdańsk', '81': 'Gdynia',
  '90': 'Łódź', '91': 'Łódź', '92': 'Łódź', '40': 'Katowice',
  '70': 'Szczecin', '71': 'Szczecin', '20': 'Lublin', '35': 'Rzeszów',
  '15': 'Białystok', '25': 'Kielce', '45': 'Opole', '10': 'Olsztyn',
  '85': 'Bydgoszcz', '87': 'Toruń', '65': 'Zielona Góra', '75': 'Koszalin',
};

const LEGAL_FORMS = [
  { value: 'jdg', label: 'Jednoosobowa działalność gospodarcza (JDG)', registry: 'ceidg' },
  { value: 'sp_zoo', label: 'Spółka z o.o.', registry: 'krs' },
  { value: 'sp_jawna', label: 'Spółka jawna', registry: 'krs' },
  { value: 'sp_komandytowa', label: 'Spółka komandytowa', registry: 'krs' },
  { value: 'sa', label: 'Spółka akcyjna', registry: 'krs' },
  { value: 'other', label: 'Inna forma prawna', registry: 'krs' },
];

interface FleetContractSettingsProps {
  fleetId: string;
}

export function FleetContractSettings({ fleetId }: FleetContractSettingsProps) {
  const [settingsTab, setSettingsTab] = useState('company');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [autoSignEnabled, setAutoSignEnabled] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  
  // Company data
  const [companyData, setCompanyData] = useState({
    name: '', nip: '', krs: '', legal_form: 'sp_zoo',
    street: '', building_number: '', apartment_number: '',
    postal_code: '', city: '', owner_name: ''
  });
  const [savingCompany, setSavingCompany] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const stampInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const selectedLegalForm = LEGAL_FORMS.find(f => f.value === companyData.legal_form);
  const registryType = selectedLegalForm?.registry || 'krs';
  const registryLabel = registryType === 'ceidg' ? 'Nr CEIDG' : 'Nr KRS';

  useEffect(() => {
    loadAll();
  }, [fleetId]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadSignature(), loadFleetData()]);
    setLoading(false);
  };

  const loadSignature = async () => {
    try {
      const supabaseAny = supabase as any;
      const { data, error } = await supabaseAny
        .from("fleet_signatures")
        .select("*")
        .eq("fleet_id", fleetId)
        .eq("is_active", true)
        .single();
      if (!error && data) {
        setSignatureUrl(data.signature_url);
        setStampUrl(data.stamp_url || null);
        setAutoSignEnabled(data.auto_sign_enabled !== false);
      }
    } catch {}
  };

  const loadFleetData = async () => {
    const { data } = await supabase
      .from('fleets')
      .select('name, nip, krs, address, city, postal_code, owner_name, logo_url')
      .eq('id', fleetId)
      .single();
    if (data) {
      const d = data as any;
      // Parse address into street + building_number + apartment_number
      const addressParts = parseAddress(d.address || '');
      // Determine legal form from krs value
      const legalForm = d.krs?.startsWith('CEIDG') ? 'jdg' : 'sp_zoo';
      setCompanyData({
        name: d.name || '',
        nip: d.nip || '',
        krs: d.krs?.replace(/^(CEIDG:|KRS:)\s*/i, '') || '',
        legal_form: legalForm,
        street: addressParts.street,
        building_number: addressParts.building,
        apartment_number: addressParts.apartment,
        postal_code: d.postal_code || '',
        city: d.city || '',
        owner_name: d.owner_name || '',
      });
      setLogoUrl(d.logo_url || null);
    }
  };

  const parseAddress = (address: string) => {
    // Try to parse "ul. Przykładowa 1/2" or "ul. Przykładowa 1"
    const match = address.match(/^(.+?)\s+(\d+\S*?)(?:\/(\S+))?$/);
    if (match) {
      return { street: match[1], building: match[2], apartment: match[3] || '' };
    }
    return { street: address, building: '', apartment: '' };
  };

  const buildAddress = () => {
    let addr = companyData.street;
    if (companyData.building_number) {
      addr += ` ${companyData.building_number}`;
      if (companyData.apartment_number) {
        addr += `/${companyData.apartment_number}`;
      }
    }
    return addr;
  };

  const handlePostalCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '');
    let formatted = digits;
    if (digits.length > 2) {
      formatted = `${digits.substring(0, 2)}-${digits.substring(2, 5)}`;
    }
    setCompanyData(p => ({ ...p, postal_code: formatted }));
    
    // Auto-suggest city
    const prefix = digits.substring(0, 2);
    if (prefix.length === 2 && POSTAL_CODE_MAP[prefix] && !companyData.city) {
      setCompanyData(p => ({ ...p, postal_code: formatted, city: POSTAL_CODE_MAP[prefix] }));
    }
  };

  const saveCompanyData = async () => {
    setSavingCompany(true);
    try {
      const krsValue = registryType === 'ceidg' 
        ? `CEIDG: ${companyData.krs}` 
        : `KRS: ${companyData.krs}`;
      
      await supabase.from('fleets').update({
        name: companyData.name,
        nip: companyData.nip,
        krs: companyData.krs ? krsValue : '',
        address: buildAddress(),
        city: companyData.city,
        postal_code: companyData.postal_code,
        owner_name: companyData.owner_name,
      } as any).eq('id', fleetId);
      toast.success("Dane firmy zapisane!");
    } catch { toast.error("Błąd zapisu"); }
    finally { setSavingCompany(false); }
  };

  // Canvas drawing functions
  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => { if (isDrawing) initCanvas(); }, [isDrawing]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    isDrawingRef.current = true;
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) { ctx.beginPath(); ctx.moveTo(x, y); }
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) { ctx.lineTo(x, y); ctx.stroke(); }
  };
  const stopDrawing = () => { isDrawingRef.current = false; };
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const saveSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `fleet_signatures/${fleetId}/${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from("driver-documents").upload(fileName, blob, { contentType: "image/png" });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("driver-documents").getPublicUrl(fileName);
      const supabaseAny = supabase as any;
      await supabaseAny.from("fleet_signatures").upsert({ fleet_id: fleetId, signature_url: publicUrl, is_active: true, auto_sign_enabled: autoSignEnabled }, { onConflict: "fleet_id" });
      setSignatureUrl(publicUrl);
      setIsDrawing(false);
      toast.success("Podpis został zapisany!");
    } catch (error: any) { toast.error("Błąd zapisywania podpisu"); }
    finally { setSaving(false); }
  };

  const deleteSignature = async () => {
    if (!confirm("Czy na pewno chcesz usunąć zapisany podpis?")) return;
    setSaving(true);
    try {
      const supabaseAny = supabase as any;
      await supabaseAny.from("fleet_signatures").update({ is_active: false }).eq("fleet_id", fleetId);
      setSignatureUrl(null);
      toast.success("Podpis został usunięty");
    } catch { toast.error("Błąd usuwania podpisu"); }
    finally { setSaving(false); }
  };

  const updateAutoSign = async (enabled: boolean) => {
    setAutoSignEnabled(enabled);
    try {
      const supabaseAny = supabase as any;
      await supabaseAny.from("fleet_signatures").update({ auto_sign_enabled: enabled }).eq("fleet_id", fleetId).eq("is_active", true);
      toast.success(enabled ? "Auto-podpis włączony" : "Auto-podpis wyłączony");
    } catch { toast.error("Błąd aktualizacji ustawień"); }
  };

  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingStamp(true);
    try {
      const fileName = `fleet_stamps/${fleetId}/${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from("driver-documents").upload(fileName, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("driver-documents").getPublicUrl(fileName);
      const supabaseAny = supabase as any;
      await supabaseAny.from("fleet_signatures").upsert({ fleet_id: fleetId, stamp_url: publicUrl, is_active: true }, { onConflict: "fleet_id" });
      setStampUrl(publicUrl);
      toast.success("Pieczątka została zapisana!");
    } catch { toast.error("Błąd wgrywania pieczątki"); }
    finally { setUploadingStamp(false); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const fileName = `fleet_logos/${fleetId}/${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from("driver-documents").upload(fileName, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("driver-documents").getPublicUrl(fileName);
      await supabase.from('fleets').update({ logo_url: publicUrl } as any).eq('id', fleetId);
      setLogoUrl(publicUrl);
      toast.success("Logo zostało zapisane!");
    } catch { toast.error("Błąd wgrywania logo"); }
    finally { setUploadingLogo(false); }
  };

  const deleteLogo = async () => {
    if (!confirm("Czy na pewno chcesz usunąć logo?")) return;
    setSaving(true);
    try {
      await supabase.from('fleets').update({ logo_url: null } as any).eq('id', fleetId);
      setLogoUrl(null);
      toast.success("Logo zostało usunięte");
    } catch { toast.error("Błąd usuwania logo"); }
    finally { setSaving(false); }
  };

  const deleteStamp = async () => {
    if (!confirm("Czy na pewno chcesz usunąć pieczątkę?")) return;
    setSaving(true);
    try {
      const supabaseAny = supabase as any;
      await supabaseAny.from("fleet_signatures").update({ stamp_url: null }).eq("fleet_id", fleetId);
      setStampUrl(null);
      toast.success("Pieczątka została usunięta");
    } catch { toast.error("Błąd usuwania pieczątki"); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={settingsTab} onValueChange={setSettingsTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="company" className="gap-1"><Building2 className="h-3.5 w-3.5" /> Dane firmy</TabsTrigger>
          <TabsTrigger value="documents" className="gap-1"><PenTool className="h-3.5 w-3.5" /> Ustawienia umów</TabsTrigger>
        </TabsList>

        {/* Company Data Tab */}
        <TabsContent value="company" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Dane firmy
              </CardTitle>
              <CardDescription>Dane potrzebne do generowania umów najmu</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nazwa firmy *</Label>
                  <Input value={companyData.name} onChange={e => setCompanyData(p => ({...p, name: e.target.value}))} placeholder="np. Car4Ride sp. z o.o." />
                </div>
                <div className="space-y-2">
                  <Label>NIP *</Label>
                  <Input value={companyData.nip} onChange={e => setCompanyData(p => ({...p, nip: e.target.value}))} placeholder="np. 5223252793" />
                </div>
                <div className="space-y-2">
                  <Label>Forma prawna</Label>
                  <Select value={companyData.legal_form} onValueChange={v => setCompanyData(p => ({...p, legal_form: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEGAL_FORMS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{registryLabel}</Label>
                  <Input value={companyData.krs} onChange={e => setCompanyData(p => ({...p, krs: e.target.value}))} placeholder={registryType === 'ceidg' ? 'np. 12345678901' : 'np. 0000123456'} />
                </div>
                <div className="space-y-2">
                  <Label>Reprezentant *</Label>
                  <Input value={companyData.owner_name} onChange={e => setCompanyData(p => ({...p, owner_name: e.target.value}))} placeholder="Imię i nazwisko" />
                </div>
              </div>

              {/* Structured address */}
              <div className="border-t pt-4 mt-4">
                <Label className="text-sm font-semibold mb-3 block">Adres siedziby</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Ulica *</Label>
                    <Input value={companyData.street} onChange={e => setCompanyData(p => ({...p, street: e.target.value}))} placeholder="ul. Przykładowa" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Nr budynku *</Label>
                      <Input value={companyData.building_number} onChange={e => setCompanyData(p => ({...p, building_number: e.target.value}))} placeholder="1A" />
                    </div>
                    <div className="space-y-2">
                      <Label>Nr lokalu</Label>
                      <Input value={companyData.apartment_number} onChange={e => setCompanyData(p => ({...p, apartment_number: e.target.value}))} placeholder="(opcjonalnie)" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Kod pocztowy</Label>
                    <Input 
                      value={companyData.postal_code} 
                      onChange={e => handlePostalCodeChange(e.target.value)} 
                      placeholder="00-000" 
                      maxLength={6} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Miasto</Label>
                    <Input value={companyData.city} onChange={e => setCompanyData(p => ({...p, city: e.target.value}))} placeholder="Warszawa" />
                  </div>
                </div>
              </div>

              <Button onClick={saveCompanyData} disabled={savingCompany} className="gap-2">
                {savingCompany ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Zapisz dane firmy
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Document Settings Tab */}
        <TabsContent value="documents" className="space-y-4 mt-4">
          {/* 3 cards side by side */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Logo */}
            <Card className="flex flex-col aspect-square md:aspect-auto">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Logo firmy
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col items-center justify-center space-y-3">
                {logoUrl ? (
                  <>
                    <div className="border rounded-lg p-3 bg-white w-full flex items-center justify-center aspect-square max-h-[120px]">
                      <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                    </div>
                    <div className="flex gap-1 w-full">
                      <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="flex-1 text-xs gap-1">
                        <Upload className="h-3 w-3" /> Zmień
                      </Button>
                      <Button variant="ghost" size="sm" onClick={deleteLogo} disabled={saving} className="text-destructive hover:text-destructive text-xs">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground mb-2">Brak logo</p>
                    <Button size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="gap-1 text-xs">
                      {uploadingLogo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      Wgraj logo
                    </Button>
                  </div>
                )}
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              </CardContent>
            </Card>

            {/* Signature */}
            <Card className="flex flex-col aspect-square md:aspect-auto">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <PenTool className="h-4 w-4" />
                  Podpis
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col items-center justify-center space-y-3">
                {signatureUrl && !isDrawing ? (
                  <>
                    <div className="border rounded-lg p-3 bg-white w-full flex items-center justify-center aspect-square max-h-[120px]">
                      <img src={signatureUrl} alt="Podpis" className="max-h-full max-w-full object-contain" />
                    </div>
                    <div className="flex gap-1 w-full">
                      <Button variant="outline" size="sm" onClick={() => setIsDrawing(true)} className="flex-1 text-xs gap-1">
                        <PenTool className="h-3 w-3" /> Zmień
                      </Button>
                      <Button variant="ghost" size="sm" onClick={deleteSignature} disabled={saving} className="text-destructive hover:text-destructive text-xs">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                ) : isDrawing ? (
                  <div className="w-full space-y-2">
                    <div className="border-2 border-dashed border-primary/50 rounded-lg overflow-hidden">
                      <canvas ref={canvasRef} className="w-full h-28 bg-white cursor-crosshair touch-none"
                        onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={clearCanvas} className="text-xs"><Trash2 className="h-3 w-3" /></Button>
                      <Button variant="outline" size="sm" onClick={() => setIsDrawing(false)} className="text-xs">Anuluj</Button>
                      <Button size="sm" onClick={saveSignature} disabled={saving} className="flex-1 text-xs gap-1">
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Zapisz
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground mb-2">Brak podpisu</p>
                    <Button size="sm" onClick={() => setIsDrawing(true)} className="gap-1 text-xs">
                      <PenTool className="h-3 w-3" /> Dodaj podpis
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stamp */}
            <Card className="flex flex-col aspect-square md:aspect-auto">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Stamp className="h-4 w-4" />
                  Pieczątka
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col items-center justify-center space-y-3">
                {stampUrl ? (
                  <>
                    <div className="border rounded-lg p-3 bg-white w-full flex items-center justify-center aspect-square max-h-[120px]">
                      <img src={stampUrl} alt="Pieczątka" className="max-h-full max-w-full object-contain" />
                    </div>
                    <div className="flex gap-1 w-full">
                      <Button variant="outline" size="sm" onClick={() => stampInputRef.current?.click()} disabled={uploadingStamp} className="flex-1 text-xs gap-1">
                        <Upload className="h-3 w-3" /> Zmień
                      </Button>
                      <Button variant="ghost" size="sm" onClick={deleteStamp} disabled={saving} className="text-destructive hover:text-destructive text-xs">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground mb-2">Brak pieczątki</p>
                    <Button size="sm" onClick={() => stampInputRef.current?.click()} disabled={uploadingStamp} className="gap-1 text-xs">
                      {uploadingStamp ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      Wgraj pieczątkę
                    </Button>
                  </div>
                )}
                <input ref={stampInputRef} type="file" accept="image/*" className="hidden" onChange={handleStampUpload} />
              </CardContent>
            </Card>
          </div>

          {/* Auto-sign toggle */}
          {signatureUrl && (
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <Switch id="auto-sign" checked={autoSignEnabled} onCheckedChange={updateAutoSign} />
                  <Label htmlFor="auto-sign" className="cursor-pointer">Automatycznie podpisuj umowy</Label>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
