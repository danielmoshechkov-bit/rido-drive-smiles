import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Mail } from 'lucide-react';

const ROLES = [
  { value: 'mechanic', label: 'Mechanik' },
  { value: 'reception', label: 'Recepcja' },
  { value: 'manager', label: 'Kierownik' },
];
const LANGS = [
  { value: 'pl', label: 'Polski' },
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
  { value: 'ua', label: 'Українська' },
  { value: 'de', label: 'Deutsch' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  providerId: string;
  onSent?: () => void;
}

export const WorkshopInviteEmployeeDialog = ({ open, onOpenChange, providerId, onSent }: Props) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('mechanic');
  const [lang, setLang] = useState('pl');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!email.trim() || !email.includes('@')) {
      toast.error('Podaj prawidłowy email');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('workshop-invite-employee', {
        body: { email: email.trim().toLowerCase(), provider_id: providerId, role, language_preference: lang },
      });
      if (error) throw error;
      if ((data as any)?.action_link && !(data as any)?.email_sent) {
        await navigator.clipboard.writeText((data as any).action_link);
        toast.success('Link zaproszenia skopiowany do schowka');
      } else {
        toast.success(`Zaproszenie wysłane na ${email}`);
      }
      setEmail('');
      onSent?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Błąd wysyłki zaproszenia');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /> Zaproś pracownika</DialogTitle>
          <DialogDescription>Pracownik otrzyma email z linkiem do utworzenia konta i akceptacji zaproszenia.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Email pracownika *</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="pracownik@firma.pl" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Rola</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Język</Label>
              <Select value={lang} onValueChange={setLang}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LANGS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button onClick={send} disabled={sending}>
            {sending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Wyślij zaproszenie
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
