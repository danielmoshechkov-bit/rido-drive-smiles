import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mail, Plus, Trash2, Copy, Check, Loader2 } from 'lucide-react';

interface EmailConfig {
  id: string;
  email_address: string;
  webhook_secret: string;
  is_active: boolean;
  last_check_at: string | null;
}

export function InvoiceEmailSetup() {
  const [configs, setConfigs] = useState<EmailConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('invoice_email_configs')
      .select('*')
      .order('created_at', { ascending: false }) as any;

    setConfigs(data || []);
    setLoading(false);
  };

  const addConfig = async () => {
    if (!newEmail) return;
    setAdding(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('invoice_email_configs').insert({
      user_id: user.id,
      email_address: newEmail,
    } as any);

    if (error) {
      toast.error('Błąd: ' + error.message);
    } else {
      toast.success('Skrzynka dodana');
      setNewEmail('');
      loadConfigs();
    }
    setAdding(false);
  };

  const removeConfig = async (id: string) => {
    await supabase.from('invoice_email_configs').delete().eq('id', id) as any;
    toast.success('Usunięto');
    loadConfigs();
  };

  const copyWebhookUrl = (config: EmailConfig) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invoice-email-webhook`;
    navigator.clipboard.writeText(url);
    setCopiedId(config.id);
    toast.success('Skopiowano URL webhook');
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return <Loader2 className="h-6 w-6 animate-spin mx-auto my-4" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Skrzynka email do faktur
        </CardTitle>
        <CardDescription>
          Podaj adres email, na który przychodzą faktury. System automatycznie je odczyta, 
          zaksięguje i wyśle powiadomienie do sprawdzenia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new email */}
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="faktury@twoja-firma.pl"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            className="max-w-xs"
          />
          <Button onClick={addConfig} disabled={adding || !newEmail} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Dodaj
          </Button>
        </div>

        {/* Existing configs */}
        {configs.map(config => (
          <div key={config.id} className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">{config.email_address}</p>
                <p className="text-xs text-muted-foreground">
                  {config.last_check_at
                    ? `Ostatnie sprawdzenie: ${new Date(config.last_check_at).toLocaleString('pl')}`
                    : 'Jeszcze nie sprawdzano'}
                </p>
              </div>
              <Badge variant={config.is_active ? 'default' : 'secondary'}>
                {config.is_active ? 'Aktywna' : 'Nieaktywna'}
              </Badge>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => copyWebhookUrl(config)}>
                {copiedId === config.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeConfig(config.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}

        {/* Instructions */}
        <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-2">
          <p className="font-medium">Jak to działa?</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
            <li>Dodaj adres email, na który przychodzą faktury od dostawców</li>
            <li>Ustaw przekierowanie (forward) z tej skrzynki na webhook URL</li>
            <li>Każda faktura (PDF/zdjęcie w załączniku) zostanie automatycznie odczytana przez AI</li>
            <li>Otrzymasz powiadomienie do sprawdzenia i zatwierdzenia faktury</li>
            <li>Po zatwierdzeniu faktura zostanie zaksięgowana (opcjonalnie: dodana do magazynu)</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
