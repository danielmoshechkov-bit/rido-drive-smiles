import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isPast, addDays } from "date-fns";
import { pl } from "date-fns/locale";
import { 
  FileText, Download, Calendar, CheckCircle, Clock, AlertTriangle, Eye, Trash2,
  Plus, Loader2, PenTool
} from "lucide-react";

interface DocumentType {
  id: string;
  name: string;
  required: boolean;
}

interface DriverDocument {
  id: string;
  file_url: string | null;
  file_name: string | null;
  expires_at: string | null;
  status: string | null;
  created_at: string;
  document_types: DocumentType | null;
}

interface DriverDocumentsPanelProps {
  driverId: string;
}

export function DriverDocumentsPanel({ driverId }: DriverDocumentsPanelProps) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<DriverDocument[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<DriverDocument | null>(null);
  const [signedContracts, setSignedContracts] = useState<any[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [previewContract, setPreviewContract] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("upload");
  const [fleetData, setFleetData] = useState<any>(null);
  const [fleetSignature, setFleetSignature] = useState<any>(null);

  useEffect(() => {
    loadDocumentTypes();
    loadDocuments();
    loadSignedContracts();
  }, [driverId]);

  const loadDocumentTypes = async () => {
    const { data } = await supabase.from("document_types").select("id, name, required").order("name");
    if (data) {
      setDocumentTypes(data);
      if (data.length > 0 && !selectedTypeId) setSelectedTypeId(data[0].id);
    }
  };

  const loadDocuments = async () => {
    setLoadingDocs(true);
    const { data, error } = await supabase
      .from("driver_documents")
      .select(`id, file_url, file_name, expires_at, status, created_at, document_types (id, name, required)`)
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false });
    if (!error && data) setDocs(data as unknown as DriverDocument[]);
    setLoadingDocs(false);
  };

  const handleUpload = async () => {
    if (!file || !selectedTypeId) return;
    setLoading(true);
    try {
      const path = `${driverId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("driver-documents").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("driver-documents").getPublicUrl(path);
      const { error } = await supabase.from("driver_documents").insert([{ driver_id: driverId, document_type_id: selectedTypeId, file_url: publicUrl, file_name: file.name, expires_at: expiresAt || null }]);
      if (error) throw error;
      toast.success("Dokument dodany pomyślnie");
      setFile(null); setExpiresAt(""); loadDocuments();
    } catch (error: any) { toast.error(error.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten dokument?")) return;
    try {
      const { error } = await supabase.from("driver_documents").delete().eq("id", docId);
      if (error) throw error;
      toast.success("Dokument usunięty"); loadDocuments();
    } catch (error: any) { toast.error(error.message); }
  };

  const getStatusBadge = (doc: DriverDocument) => {
    if (!doc.expires_at) return <Badge variant="secondary" className="gap-1 text-xs"><Clock className="h-3 w-3" />Brak daty</Badge>;
    const expiryDate = new Date(doc.expires_at);
    if (isPast(expiryDate)) return <Badge variant="destructive" className="gap-1 text-xs"><AlertTriangle className="h-3 w-3" />Wygasły</Badge>;
    if (expiryDate <= addDays(new Date(), 30)) return <Badge className="gap-1 text-xs bg-orange-500/10 text-orange-700 border-orange-500/20"><AlertTriangle className="h-3 w-3" />Wygasa wkrótce</Badge>;
    return <Badge className="gap-1 text-xs bg-green-500/10 text-green-700 border-green-500/20"><CheckCircle className="h-3 w-3" />Aktualny</Badge>;
  };

  const isPreviewable = (url: string | null) => { if (!url) return false; const ext = url.split('.').pop()?.toLowerCase(); return ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || ''); };
  const isPdf = (url: string | null) => url?.toLowerCase().endsWith('.pdf') || false;

  const loadSignedContracts = async () => {
    setLoadingContracts(true);
    const { data } = await supabase
      .from('driver_document_requests' as any)
      .select('*')
      .eq('driver_id', driverId)
      .in('status', ['signed', 'completed'])
      .order('signed_at', { ascending: false });
    const contracts = (data || []) as any[];
    setSignedContracts(contracts);

    // Load fleet data for contract preview
    if (contracts.length > 0 && contracts[0].fleet_id) {
      const fleetId = contracts[0].fleet_id;
      const { data: fleet } = await supabase.from('fleets').select('name, nip, address, city, postal_code, krs, owner_name, logo_url').eq('id', fleetId).single();
      setFleetData(fleet);
      const { data: sig } = await (supabase as any).from('fleet_signatures').select('signature_url, stamp_url').eq('fleet_id', fleetId).eq('is_active', true).maybeSingle();
      if (sig) setFleetSignature(sig);
    }
    setLoadingContracts(false);
  };

  const generateContractHtml = (contract: any) => {
    const fd = contract.filled_data || {};
    const signedDate = contract.signed_at ? format(new Date(contract.signed_at), 'dd.MM.yyyy') : '';
    const fName = fleetData?.name || '';
    const fAddress = fleetData?.address ? `${fleetData.address}${fleetData.postal_code ? ', ' + fleetData.postal_code : ''} ${fleetData.city || ''}` : '';
    const fNip = fleetData?.nip || '';
    const fKrs = fleetData?.krs || '';
    const fOwner = fleetData?.owner_name || '';
    const logoUrl = (fleetData as any)?.logo_url || null;
    const sigUrl = fleetSignature?.signature_url || null;
    const stampUrl = fleetSignature?.stamp_url || null;

    return `
<div style="font-family: 'Times New Roman', Georgia, serif; max-width: 700px; margin: 0 auto; padding: 30px; font-size: 13px; line-height: 1.8; color: #1a1a1a;">
  ${logoUrl ? `<div style="text-align: center; margin-bottom: 20px;"><img src="${logoUrl}" alt="Logo" style="max-height: 60px; max-width: 200px; object-fit: contain;" /></div>` : ''}
  <h1 style="text-align: center; font-size: 18px; font-weight: bold; letter-spacing: 2px;">UMOWA NAJMU POJAZDU</h1>
  <p style="text-align: center; font-size: 14px; font-weight: bold; margin-bottom: 25px;">Nr ${contract.contract_number || '—'}</p>
  <p style="text-align: center; margin-bottom: 30px;">zawarta w dniu <strong>${signedDate}</strong> pomiędzy:</p>
  <div style="margin-bottom: 20px; padding: 15px; border-left: 3px solid #333;">
    <p style="margin: 0;"><strong>${fName}</strong></p>
    <p style="margin: 2px 0;">z siedzibą: ${fAddress}</p>
    <p style="margin: 2px 0;">NIP: ${fNip}</p>
    <p style="margin: 2px 0;">KRS / CEIDG: ${fKrs}</p>
    <p style="margin: 2px 0;">reprezentowaną przez: ${fOwner}</p>
    <p style="margin: 5px 0 0; font-style: italic;">zwaną dalej „Najemcą"</p>
  </div>
  <p style="text-align: center; margin: 15px 0;">a</p>
  <div style="margin-bottom: 25px; padding: 15px; border-left: 3px solid #333;">
    <p style="margin: 0;">Panem/Panią: <strong>${fd.full_name || '—'}</strong></p>
    <p style="margin: 2px 0;">PESEL: ${fd.pesel || '—'}</p>
    <p style="margin: 2px 0;">adres zameldowania: ${fd.registered_address || '—'}</p>
    <p style="margin: 2px 0;">adres zamieszkania: ${fd.residential_address || fd.registered_address || '—'}</p>
    <p style="margin: 5px 0 0; font-style: italic;">zwanym/ą dalej „Wynajmującym"</p>
  </div>
  <hr style="border: none; border-top: 1px solid #ccc; margin: 25px 0;" />
  <h2 style="text-align: center; font-size: 14px; margin-top: 25px;">§1 Przedmiot umowy</h2>
  <p>Wynajmujący oddaje Najemcy do używania pojazd:</p>
  <table style="width: 100%; border-collapse: collapse; margin: 10px 0; border: 1px solid #ddd;">
    <tr style="background: #f5f5f5;"><td style="padding: 6px 12px; border: 1px solid #ddd; width: 180px;"><strong>Marka:</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;">${fd.car_brand || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; border: 1px solid #ddd;"><strong>Model:</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;">${fd.car_model || '—'}</td></tr>
    <tr style="background: #f5f5f5;"><td style="padding: 6px 12px; border: 1px solid #ddd;"><strong>Numer VIN:</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;">${fd.car_vin || '—'}</td></tr>
    <tr><td style="padding: 6px 12px; border: 1px solid #ddd;"><strong>Nr rejestracyjny:</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;">${fd.car_registration || '—'}</td></tr>
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
  <p>6. Czynsz będzie płatny ${fd.payment_method === 'transfer' ? 'przelewem na rachunek bankowy Wynajmującego nr: <strong>' + (fd.bank_account || '') + '</strong>' : 'gotówką'}.</p>
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
      <p style="color: #888; font-size: 11px; margin-bottom: 5px;">${fd.full_name || '—'}</p>
      <div style="min-height: 60px; display: flex; align-items: center; justify-content: center;">
        ${contract.signature_url ? `<img src="${contract.signature_url}" alt="Podpis kierowcy" style="max-height: 50px;" />` : '<p style="color: #aaa;">……………………………………</p>'}
      </div>
      ${contract.signed_at ? `<p style="color: #888; font-size: 10px;">Podpisano: ${format(new Date(contract.signed_at), 'dd.MM.yyyy HH:mm')}</p>` : ''}
    </div>
    <div style="text-align: center; width: 20%;">
      ${stampUrl ? `<div style="display: flex; align-items: center; justify-content: center; height: 100%;"><img src="${stampUrl}" alt="Pieczątka" style="max-height: 50px;" /></div>` : ''}
    </div>
    <div style="text-align: center; width: 40%;">
      <p style="margin-bottom: 10px; font-weight: bold;">Najemca</p>
      <p style="color: #888; font-size: 11px; margin-bottom: 5px;">${fName}</p>
      <div style="min-height: 60px; display: flex; align-items: center; justify-content: center;">
        ${sigUrl ? `<img src="${sigUrl}" alt="Podpis" style="max-height: 50px;" />` : '<p style="color: #aaa;">……………………………………</p>'}
      </div>
    </div>
  </div>
</div>`;
  };

  const handlePrintContract = (contract: any) => {
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(`<html><head><title>Umowa ${contract.contract_number || ''}</title></head><body>${generateContractHtml(contract)}</body></html>`);
      w.document.close();
      w.print();
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">Dodaj dokument</TabsTrigger>
          <TabsTrigger value="signed" className="gap-1">
            <PenTool className="h-3.5 w-3.5" />
            Podpisane dokumenty
            {signedContracts.length > 0 && (
              <Badge variant="default" className="ml-1 h-5 px-1.5 text-[10px]">{signedContracts.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          {/* Add Document Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Dodaj dokument</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-2">
                  <Label>Typ dokumentu</Label>
                  <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
                    <SelectTrigger><SelectValue placeholder="Wybierz typ dokumentu" /></SelectTrigger>
                    <SelectContent>
                      {documentTypes.map(dt => (
                        <SelectItem key={dt.id} value={dt.id}>{dt.name} {dt.required && <span className="text-destructive">*</span>}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data ważności</Label>
                  <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Plik</Label>
                  <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </div>
                <div className="space-y-2">
                  <Label className="invisible">Akcja</Label>
                  <Button onClick={handleUpload} disabled={!file || !selectedTypeId || loading} className="w-full">
                    {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Dodawanie...</> : <><Plus className="h-4 w-4 mr-2" />Dodaj dokument</>}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {docs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Brak dokumentów</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {docs.map((doc) => (
                <Card key={doc.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setPreviewDoc(doc)}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-3 rounded-lg bg-primary/10 shrink-0"><FileText className="h-6 w-6 text-primary" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{doc.document_types?.name || "Dokument"}</p>
                        {doc.expires_at && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Calendar className="h-3 w-3" />Ważny do: {format(new Date(doc.expires_at), "d MMM yyyy", { locale: pl })}</p>}
                        <p className="text-xs text-muted-foreground mt-1">Dodano: {format(new Date(doc.created_at), "d MMM yyyy", { locale: pl })}</p>
                        <div className="mt-2">{getStatusBadge(doc)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc); }} className="flex-1"><Eye className="h-3 w-3 mr-1" />Podgląd</Button>
                      <Button variant="outline" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                        <a href={doc.file_url || "#"} target="_blank" rel="noreferrer" download><Download className="h-3 w-3" /></a>
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Preview Modal for uploaded docs */}
          <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
            <DialogContent className="max-w-4xl max-h-[90vh]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />{previewDoc?.document_types?.name || "Dokument"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-4 text-sm">
                  {previewDoc?.expires_at && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>Ważny do: {format(new Date(previewDoc.expires_at), "d MMMM yyyy", { locale: pl })}</span>
                      {previewDoc && getStatusBadge(previewDoc)}
                    </div>
                  )}
                </div>
                <div className="border rounded-lg overflow-hidden bg-muted/30">
                  {previewDoc?.file_url && isPreviewable(previewDoc.file_url) ? (
                    isPdf(previewDoc.file_url) ? (
                      <iframe src={previewDoc.file_url} className="w-full h-[60vh]" title="Document preview" />
                    ) : (
                      <div className="flex items-center justify-center p-4"><img src={previewDoc.file_url} alt="Document preview" className="max-w-full max-h-[60vh] object-contain" /></div>
                    )
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                      <FileText className="h-16 w-16 mb-4 opacity-50" />
                      <p>Podgląd niedostępny</p>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setPreviewDoc(null)}>Zamknij</Button>
                  {previewDoc?.file_url && <Button asChild><a href={previewDoc.file_url} target="_blank" rel="noreferrer" download><Download className="h-4 w-4 mr-2" />Pobierz</a></Button>}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Signed Contracts Tab */}
        <TabsContent value="signed" className="space-y-4">
          {loadingContracts ? (
            <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : signedContracts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <PenTool className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Brak podpisanych dokumentów</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {signedContracts.map((contract: any) => (
                <Card key={contract.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle className="h-5 w-5 text-green-600" /></div>
                        <div>
                          <p className="font-medium text-sm">{contract.template_name || 'Umowa najmu pojazdu'}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {contract.contract_number && <Badge variant="outline" className="text-[10px]">Nr {contract.contract_number}</Badge>}
                            <span className="text-xs text-muted-foreground">
                              Podpisana: {contract.signed_at ? format(new Date(contract.signed_at), 'dd.MM.yyyy HH:mm', { locale: pl }) : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => setPreviewContract(contract)}>
                          <Eye className="h-3.5 w-3.5" /> Podgląd
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => handlePrintContract(contract)}>
                          <Download className="h-3.5 w-3.5" /> Pobierz
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Contract Preview Modal */}
      <Dialog open={!!previewContract} onOpenChange={() => setPreviewContract(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {previewContract?.template_name || 'Umowa najmu pojazdu'}
              {previewContract?.contract_number && <Badge variant="outline" className="ml-2">Nr {previewContract.contract_number}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {previewContract && (
            <div className="border rounded-lg p-4 bg-white dark:bg-muted/30 text-sm" dangerouslySetInnerHTML={{ __html: generateContractHtml(previewContract) }} />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPreviewContract(null)}>Zamknij</Button>
            <Button onClick={() => previewContract && handlePrintContract(previewContract)} className="gap-1">
              <Download className="h-4 w-4" /> Drukuj / Pobierz PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
