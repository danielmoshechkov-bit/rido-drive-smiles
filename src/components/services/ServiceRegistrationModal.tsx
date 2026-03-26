import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, User, Upload, Camera, CheckCircle, Shield, ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceRegistrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
}

type AccountType = 'business' | 'private' | null;
type Step = 'choose' | 'form' | 'success';

export function ServiceRegistrationModal({ open, onOpenChange, user }: ServiceRegistrationModalProps) {
  const [accountType, setAccountType] = useState<AccountType>(null);
  const [step, setStep] = useState<Step>('choose');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Business form
  const [bizForm, setBizForm] = useState({
    companyName: '', nip: '', regon: '', krs: '',
    address: '', city: '', postalCode: '',
    ownerFirstName: '', ownerLastName: '', ownerPhone: '', ownerEmail: '',
    serviceType: '', description: ''
  });

  // Private form
  const [privForm, setPrivForm] = useState({
    firstName: '', lastName: '', phone: '', email: '',
    pesel: '', idNumber: '', registeredAddress: '',
    serviceType: '', description: ''
  });

  // File uploads
  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const idFrontRef = useRef<HTMLInputElement>(null);
  const idBackRef = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep('choose');
      setAccountType(null);
      setBizForm({ companyName: '', nip: '', regon: '', krs: '', address: '', city: '', postalCode: '', ownerFirstName: '', ownerLastName: '', ownerPhone: '', ownerEmail: '', serviceType: '', description: '' });
      setPrivForm({ firstName: '', lastName: '', phone: '', email: '', pesel: '', idNumber: '', registeredAddress: '', serviceType: '', description: '' });
      setIdFrontFile(null); setIdBackFile(null); setSelfieFile(null);
    }, 300);
  };

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${folder}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('verification-documents').upload(path, file);
    if (error) { console.error('Upload error:', error); return null; }
    return path;
  };

  const handleBusinessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bizForm.companyName || !bizForm.nip || !bizForm.ownerFirstName || !bizForm.ownerLastName || !bizForm.ownerPhone || !bizForm.ownerEmail || !bizForm.serviceType) {
      toast.error('Wypełnij wszystkie wymagane pola'); return;
    }
    if (!idFrontFile || !idBackFile || !selfieFile) {
      toast.error('Dodaj zdjęcia dokumentu i selfie'); return;
    }

    setIsSubmitting(true);
    try {
      const [frontUrl, backUrl, selfUrl] = await Promise.all([
        uploadFile(idFrontFile, 'id_front'),
        uploadFile(idBackFile, 'id_back'),
        uploadFile(selfieFile, 'selfie')
      ]);

      // Create service provider
      const { data: provider, error: provError } = await supabase.from('service_providers').insert({
        company_name: bizForm.companyName,
        company_nip: bizForm.nip,
        company_regon: bizForm.regon || null,
        company_address: bizForm.address,
        company_city: bizForm.city,
        company_postal_code: bizForm.postalCode,
        owner_first_name: bizForm.ownerFirstName,
        owner_last_name: bizForm.ownerLastName,
        owner_phone: bizForm.ownerPhone,
        owner_email: bizForm.ownerEmail,
        description: bizForm.description || null,
        user_id: user.id,
        status: 'pending'
      }).select('id').single();

      if (provError) throw provError;

      // Create verification record
      await supabase.from('service_provider_verifications').insert({
        user_id: user.id,
        provider_id: provider.id,
        account_type: 'business',
        krs_number: bizForm.krs || null,
        ceidg_nip: bizForm.nip,
        id_front_url: frontUrl,
        id_back_url: backUrl,
        selfie_url: selfUrl,
        verification_status: 'pending'
      });

      // Also insert request for admin notification
      await supabase.from('service_provider_requests').insert({
        first_name: bizForm.ownerFirstName,
        last_name: bizForm.ownerLastName,
        phone: bizForm.ownerPhone,
        email: bizForm.ownerEmail,
        service_type: bizForm.serviceType,
        description: `[FIRMA] ${bizForm.companyName}, NIP: ${bizForm.nip}${bizForm.krs ? `, KRS: ${bizForm.krs}` : ''}. ${bizForm.description || ''}`,
        status: 'pending'
      });

      setStep('success');
      toast.success('Zgłoszenie wysłane do weryfikacji!');
    } catch (error: any) {
      console.error('Registration error:', error);
      toast.error(error.message || 'Błąd rejestracji');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!privForm.firstName || !privForm.lastName || !privForm.phone || !privForm.email || !privForm.pesel || !privForm.idNumber || !privForm.registeredAddress || !privForm.serviceType) {
      toast.error('Wypełnij wszystkie wymagane pola'); return;
    }
    if (!idFrontFile || !idBackFile || !selfieFile) {
      toast.error('Dodaj zdjęcia dokumentu i selfie'); return;
    }

    setIsSubmitting(true);
    try {
      const [frontUrl, backUrl, selfUrl] = await Promise.all([
        uploadFile(idFrontFile, 'id_front'),
        uploadFile(idBackFile, 'id_back'),
        uploadFile(selfieFile, 'selfie')
      ]);

      // Create service provider as private person
      const { data: provider, error: provError } = await supabase.from('service_providers').insert({
        company_name: `${privForm.firstName} ${privForm.lastName}`,
        owner_first_name: privForm.firstName,
        owner_last_name: privForm.lastName,
        owner_phone: privForm.phone,
        owner_email: privForm.email,
        description: privForm.description || null,
        user_id: user.id,
        status: 'pending'
      }).select('id').single();

      if (provError) throw provError;

      // Create verification record
      await supabase.from('service_provider_verifications').insert({
        user_id: user.id,
        provider_id: provider.id,
        account_type: 'private',
        pesel: privForm.pesel,
        id_number: privForm.idNumber,
        registered_address: privForm.registeredAddress,
        id_front_url: frontUrl,
        id_back_url: backUrl,
        selfie_url: selfUrl,
        verification_status: 'pending'
      });

      // Admin notification
      await supabase.from('service_provider_requests').insert({
        first_name: privForm.firstName,
        last_name: privForm.lastName,
        phone: privForm.phone,
        email: privForm.email,
        service_type: privForm.serviceType,
        description: `[OSOBA PRYWATNA] PESEL: ${privForm.pesel}, Dowód: ${privForm.idNumber}. ${privForm.description || ''}`,
        status: 'pending'
      });

      setStep('success');
      toast.success('Zgłoszenie wysłane do weryfikacji!');
    } catch (error: any) {
      console.error('Registration error:', error);
      toast.error(error.message || 'Błąd rejestracji');
    } finally {
      setIsSubmitting(false);
    }
  };

  const FileUploadButton = ({ label, file, inputRef, onFileChange, icon: Icon }: {
    label: string; file: File | null; inputRef: React.RefObject<HTMLInputElement>;
    onFileChange: (f: File | null) => void; icon: React.ElementType;
  }) => (
    <div>
      <Label className="text-sm">{label} *</Label>
      <input type="file" accept="image/*" capture="environment" ref={inputRef} className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
      <Button type="button" variant="outline" className={cn("w-full mt-1 h-16 flex flex-col gap-1", file && "border-emerald-500 bg-emerald-50 text-emerald-700")}
        onClick={() => inputRef.current?.click()}>
        {file ? <><CheckCircle className="h-5 w-5" /><span className="text-xs truncate max-w-full">{file.name}</span></> 
             : <><Icon className="h-5 w-5" /><span className="text-xs">Wybierz plik</span></>}
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {step === 'choose' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">Rejestracja usługodawcy</DialogTitle>
              <DialogDescription>Wybierz rodzaj konta, na które chcesz się zarejestrować</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Card className="cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all border-2 hover:border-primary"
                onClick={() => { setAccountType('business'); setStep('form'); }}>
                <CardContent className="p-6 text-center">
                  <Building2 className="h-10 w-10 mx-auto mb-3 text-primary" />
                  <h3 className="font-bold text-lg">Firma</h3>
                  <p className="text-xs text-muted-foreground mt-1">Sp. z o.o., działalność gospodarcza</p>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all border-2 hover:border-primary"
                onClick={() => { setAccountType('private'); setStep('form'); }}>
                <CardContent className="p-6 text-center">
                  <User className="h-10 w-10 mx-auto mb-3 text-primary" />
                  <h3 className="font-bold text-lg">Osoba prywatna</h3>
                  <p className="text-xs text-muted-foreground mt-1">Bez działalności gospodarczej</p>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {step === 'form' && accountType === 'business' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setStep('choose')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <DialogTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" /> Rejestracja firmy
                  </DialogTitle>
                  <DialogDescription>Wypełnij dane firmy i właściciela</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={handleBusinessSubmit} className="space-y-3 mt-2">
              <div className="space-y-1.5">
                <Label>Nazwa firmy *</Label>
                <Input value={bizForm.companyName} onChange={e => setBizForm({...bizForm, companyName: e.target.value})} placeholder="Nazwa Sp. z o.o." required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>NIP *</Label>
                  <Input value={bizForm.nip} onChange={e => setBizForm({...bizForm, nip: e.target.value})} placeholder="1234567890" required />
                </div>
                <div className="space-y-1.5">
                  <Label>REGON</Label>
                  <Input value={bizForm.regon} onChange={e => setBizForm({...bizForm, regon: e.target.value})} placeholder="123456789" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>KRS (sp. z o.o.) / NIP CEIDG (działalność)</Label>
                <Input value={bizForm.krs} onChange={e => setBizForm({...bizForm, krs: e.target.value})} placeholder="Wpisz KRS lub NIP z CEIDG" />
                <p className="text-[11px] text-muted-foreground">Sp. z o.o. → KRS, Działalność → NIP do sprawdzenia w CEIDG</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Adres</Label>
                  <Input value={bizForm.address} onChange={e => setBizForm({...bizForm, address: e.target.value})} placeholder="ul. Przykładowa 1" />
                </div>
                <div className="space-y-1.5">
                  <Label>Kod pocztowy</Label>
                  <Input value={bizForm.postalCode} onChange={e => setBizForm({...bizForm, postalCode: e.target.value})} placeholder="00-000" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Miasto</Label>
                <Input value={bizForm.city} onChange={e => setBizForm({...bizForm, city: e.target.value})} placeholder="Warszawa" />
              </div>

              <div className="border-t pt-3 mt-3">
                <p className="font-semibold text-sm mb-2">Dane właściciela firmy</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Imię *</Label>
                  <Input value={bizForm.ownerFirstName} onChange={e => setBizForm({...bizForm, ownerFirstName: e.target.value})} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Nazwisko *</Label>
                  <Input value={bizForm.ownerLastName} onChange={e => setBizForm({...bizForm, ownerLastName: e.target.value})} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Telefon *</Label>
                  <Input type="tel" value={bizForm.ownerPhone} onChange={e => setBizForm({...bizForm, ownerPhone: e.target.value})} placeholder="+48 123 456 789" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Email *</Label>
                  <Input type="email" value={bizForm.ownerEmail} onChange={e => setBizForm({...bizForm, ownerEmail: e.target.value})} placeholder="wpisz swój adres email" required />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Rodzaj usługi *</Label>
                <Input value={bizForm.serviceType} onChange={e => setBizForm({...bizForm, serviceType: e.target.value})} placeholder="np. Hydraulik, Detailing, Serwis..." required />
              </div>
              <div className="space-y-1.5">
                <Label>Opis usługi</Label>
                <Textarea value={bizForm.description} onChange={e => setBizForm({...bizForm, description: e.target.value})} placeholder="Krótki opis działalności..." rows={2} />
              </div>

              <div className="border-t pt-3 mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <p className="font-semibold text-sm">Weryfikacja tożsamości właściciela</p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  W trosce o bezpieczeństwo naszych klientów prosimy o zdjęcia dowodu osobistego właściciela firmy oraz selfie do weryfikacji.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FileUploadButton label="Dowód — przód" file={idFrontFile} inputRef={idFrontRef} onFileChange={setIdFrontFile} icon={Upload} />
                <FileUploadButton label="Dowód — tył" file={idBackFile} inputRef={idBackRef} onFileChange={setIdBackFile} icon={Upload} />
                <FileUploadButton label="Selfie" file={selfieFile} inputRef={selfieRef} onFileChange={setSelfieFile} icon={Camera} />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Wysyłanie...</> : 'Wyślij zgłoszenie do weryfikacji'}
              </Button>
            </form>
          </>
        )}

        {step === 'form' && accountType === 'private' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setStep('choose')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <DialogTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" /> Rejestracja osoby prywatnej
                  </DialogTitle>
                  <DialogDescription>Wypełnij swoje dane osobowe</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={handlePrivateSubmit} className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Imię *</Label>
                  <Input value={privForm.firstName} onChange={e => setPrivForm({...privForm, firstName: e.target.value})} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Nazwisko *</Label>
                  <Input value={privForm.lastName} onChange={e => setPrivForm({...privForm, lastName: e.target.value})} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Telefon *</Label>
                  <Input type="tel" value={privForm.phone} onChange={e => setPrivForm({...privForm, phone: e.target.value})} placeholder="+48 123 456 789" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Email *</Label>
                  <Input type="email" value={privForm.email} onChange={e => setPrivForm({...privForm, email: e.target.value})} placeholder="wpisz swój adres email" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>PESEL *</Label>
                  <Input value={privForm.pesel} onChange={e => setPrivForm({...privForm, pesel: e.target.value})} placeholder="12345678901" maxLength={11} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Nr dowodu osobistego *</Label>
                  <Input value={privForm.idNumber} onChange={e => setPrivForm({...privForm, idNumber: e.target.value})} placeholder="ABC123456" required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Adres zameldowania *</Label>
                <Input value={privForm.registeredAddress} onChange={e => setPrivForm({...privForm, registeredAddress: e.target.value})} placeholder="ul. Przykładowa 1, 00-000 Warszawa" required />
              </div>

              <div className="space-y-1.5">
                <Label>Rodzaj usługi *</Label>
                <Input value={privForm.serviceType} onChange={e => setPrivForm({...privForm, serviceType: e.target.value})} placeholder="np. Korepetycje, Sprzątanie, Opieka..." required />
              </div>
              <div className="space-y-1.5">
                <Label>Opis usługi</Label>
                <Textarea value={privForm.description} onChange={e => setPrivForm({...privForm, description: e.target.value})} placeholder="Krótki opis usługi..." rows={2} />
              </div>

              <div className="border-t pt-3 mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <p className="font-semibold text-sm">Weryfikacja tożsamości</p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  W trosce o bezpieczeństwo naszych klientów potrzebujemy zdjęcia Twojego dowodu osobistego (przód i tył) oraz selfie, aby potwierdzić, że osoba na dokumencie to Ty.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FileUploadButton label="Dowód — przód" file={idFrontFile} inputRef={idFrontRef} onFileChange={setIdFrontFile} icon={Upload} />
                <FileUploadButton label="Dowód — tył" file={idBackFile} inputRef={idBackRef} onFileChange={setIdBackFile} icon={Upload} />
                <FileUploadButton label="Selfie" file={selfieFile} inputRef={selfieRef} onFileChange={setSelfieFile} icon={Camera} />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Wysyłanie...</> : 'Wyślij zgłoszenie do weryfikacji'}
              </Button>
            </form>
          </>
        )}

        {step === 'success' && (
          <div className="py-8 text-center">
            <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Zgłoszenie wysłane!</h3>
            <p className="text-muted-foreground mb-2">
              Twoje dane zostały przesłane do weryfikacji. {accountType === 'business' 
                ? 'Sprawdzimy dane firmy w KRS/CEIDG i porównamy z dokumentem tożsamości.'
                : 'Sprawdzimy Twoje dane osobowe i porównamy z dokumentem tożsamości.'}
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Otrzymasz email z potwierdzeniem po zakończeniu weryfikacji. Zwykle trwa to do 24 godzin.
            </p>
            <Button onClick={handleClose}>Zamknij</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
