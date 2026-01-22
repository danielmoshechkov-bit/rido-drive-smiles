import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Building2, Search } from 'lucide-react';

interface RecipientEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  recipientId?: string | null;
  onSaved?: () => void;
}

export function RecipientEditor({ open, onOpenChange, entityId, recipientId, onSaved }: RecipientEditorProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchingNip, setSearchingNip] = useState(false);
  
  const [name, setName] = useState('');
  const [nip, setNip] = useState('');
  const [regon, setRegon] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [bankAccount, setBankAccount] = useState('');

  useEffect(() => {
    if (open) {
      if (recipientId) {
        fetchRecipient();
      } else {
        resetForm();
      }
    }
  }, [open, recipientId]);

  const resetForm = () => {
    setName('');
    setNip('');
    setRegon('');
    setEmail('');
    setPhone('');
    setAddressStreet('');
    setAddressCity('');
    setAddressPostalCode('');
    setBankAccount('');
  };

  const fetchRecipient = async () => {
    if (!recipientId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoice_recipients')
        .select('*')
        .eq('id', recipientId)
        .single();

      if (error) throw error;
      
      setName(data.name || '');
      setNip(data.nip || '');
      setRegon(''); // Not in current schema
      setEmail(data.email || '');
      setPhone(data.phone || '');
      setAddressStreet(data.address_street || '');
      setAddressCity(data.address_city || '');
      setAddressPostalCode(data.address_postal_code || '');
      setBankAccount(''); // Not in current schema
    } catch (error: any) {
      console.error('Error fetching recipient:', error);
      toast.error('Błąd ładowania kontrahenta');
    } finally {
      setLoading(false);
    }
  };

  const searchByNip = async () => {
    if (!nip || nip.length < 10) {
      toast.error('Podaj poprawny NIP (10 cyfr)');
      return;
    }

    setSearchingNip(true);
    try {
      // Try to fetch from REGON API (simplified - in production use real API)
      // For now, we'll just format the NIP
      const cleanNip = nip.replace(/[^0-9]/g, '');
      if (cleanNip.length !== 10) {
        toast.error('NIP musi mieć 10 cyfr');
        return;
      }
      
      toast.info('Wyszukiwanie w GUS... (wymaga integracji API)');
      // In production, call edge function to query REGON/GUS API
    } catch (error) {
      console.error('Error searching NIP:', error);
    } finally {
      setSearchingNip(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Nazwa kontrahenta jest wymagana');
      return;
    }

    setSaving(true);
    try {
      const recipientData = {
        entity_id: entityId,
        name: name.trim(),
        nip: nip.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address_street: addressStreet.trim() || null,
        address_city: addressCity.trim() || null,
        address_postal_code: addressPostalCode.trim() || null,
      };

      if (recipientId) {
        const { error } = await supabase
          .from('invoice_recipients')
          .update(recipientData)
          .eq('id', recipientId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('invoice_recipients')
          .insert(recipientData);
        if (error) throw error;
      }

      toast.success(recipientId ? 'Kontrahent zaktualizowany' : 'Kontrahent dodany');
      onSaved?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving recipient:', error);
      toast.error('Błąd zapisu: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {recipientId ? 'Edycja kontrahenta' : 'Nowy kontrahent'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nazwa firmy / Imię i nazwisko *</Label>
            <Input 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nazwa kontrahenta"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>NIP</Label>
              <div className="flex gap-2">
                <Input 
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                  placeholder="0000000000"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={searchByNip}
                  disabled={searchingNip}
                  title="Wyszukaj w GUS"
                >
                  {searchingNip ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>REGON</Label>
              <Input 
                value={regon}
                onChange={(e) => setRegon(e.target.value)}
                placeholder="000000000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ulica i numer</Label>
            <Input 
              value={addressStreet}
              onChange={(e) => setAddressStreet(e.target.value)}
              placeholder="ul. Przykładowa 1/2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Kod pocztowy</Label>
              <Input 
                value={addressPostalCode}
                onChange={(e) => setAddressPostalCode(e.target.value)}
                placeholder="00-000"
              />
            </div>
            <div className="space-y-2">
              <Label>Miasto</Label>
              <Input 
                value={addressCity}
                onChange={(e) => setAddressCity(e.target.value)}
                placeholder="Warszawa"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kontakt@firma.pl"
              />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+48 000 000 000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Numer konta bankowego</Label>
            <Input 
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              placeholder="PL00 0000 0000 0000 0000 0000 0000"
            />
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {recipientId ? 'Zapisz zmiany' : 'Dodaj kontrahenta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
