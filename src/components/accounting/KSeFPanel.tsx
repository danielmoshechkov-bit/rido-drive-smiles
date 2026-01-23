import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Settings,
  Download,
  Eye,
  Loader2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

interface KSeFSettings {
  id?: string;
  entity_id: string;
  is_enabled: boolean;
  environment: 'demo' | 'production';
  token_encrypted?: string;
  auto_send: boolean;
}

interface KSeFTransmission {
  id: string;
  invoice_id: string;
  direction: string;
  ksef_reference_number: string | null;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  ksef_status: string | null;
  ksef_reference: string | null;
  buyer_snapshot: any;
}

interface KSeFPanelProps {
  entityId: string;
}

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: 'Oczekuje', icon: Clock, color: 'text-yellow-500' },
  sent: { label: 'Wysłano', icon: Send, color: 'text-blue-500' },
  accepted: { label: 'Zaakceptowano', icon: CheckCircle, color: 'text-green-500' },
  rejected: { label: 'Odrzucono', icon: XCircle, color: 'text-red-500' },
  error: { label: 'Błąd', icon: AlertTriangle, color: 'text-red-500' },
};

export function KSeFPanel({ entityId }: KSeFPanelProps) {
  const [settings, setSettings] = useState<KSeFSettings>({
    entity_id: entityId,
    is_enabled: false,
    environment: 'demo',
    auto_send: false,
  });
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [transmissions, setTransmissions] = useState<KSeFTransmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [showXmlModal, setShowXmlModal] = useState(false);
  const [currentXml, setCurrentXml] = useState('');

  useEffect(() => {
    fetchSettings();
    fetchInvoices();
    fetchTransmissions();
  }, [entityId]);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase.functions.invoke('ksef-integration', {
        body: { action: 'get_settings', entity_id: entityId }
      });
      if (data?.settings) {
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Error fetching KSeF settings:', error);
    }
  };

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, issue_date, ksef_status, ksef_reference, buyer_snapshot')
        .eq('entity_id', entityId)
        .eq('status', 'issued')
        .order('issue_date', { ascending: false })
        .limit(50);

      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransmissions = async () => {
    try {
      const { data, error } = await supabase
        .from('ksef_transmissions')
        .select('*')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setTransmissions(data || []);
    } catch (error) {
      console.error('Error fetching transmissions:', error);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('ksef-integration', {
        body: {
          action: 'save_settings',
          entity_id: entityId,
          is_enabled: settings.is_enabled,
          environment: settings.environment,
          token: settings.token_encrypted,
          auto_send: settings.auto_send,
        }
      });

      if (error) throw error;

      toast({ title: 'Zapisano', description: 'Ustawienia KSeF zostały zaktualizowane' });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({ title: 'Błąd', description: 'Nie udało się zapisać ustawień', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSendToKSeF = async (invoiceId: string) => {
    setSending(invoiceId);
    try {
      const { data, error } = await supabase.functions.invoke('ksef-integration', {
        body: { action: 'send', invoice_id: invoiceId }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Wysłano do KSeF',
          description: data.demo
            ? `Tryb demo - numer KSeF: ${data.ksef_reference}`
            : `Numer KSeF: ${data.ksef_reference}`,
        });
        fetchInvoices();
        fetchTransmissions();
      } else {
        toast({ title: 'Błąd', description: data.error, variant: 'destructive' });
      }
    } catch (error: any) {
      console.error('Error sending to KSeF:', error);
      toast({ title: 'Błąd', description: error.message, variant: 'destructive' });
    } finally {
      setSending(null);
    }
  };

  const handleGenerateXml = async (invoiceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('ksef-integration', {
        body: { action: 'generate_xml', invoice_id: invoiceId }
      });

      if (error) throw error;

      setCurrentXml(data.xml);
      setShowXmlModal(true);
    } catch (error) {
      console.error('Error generating XML:', error);
      toast({ title: 'Błąd', description: 'Nie udało się wygenerować XML', variant: 'destructive' });
    }
  };

  const getKSeFStatus = (invoice: Invoice) => {
    if (invoice.ksef_reference) {
      return { status: 'accepted', reference: invoice.ksef_reference };
    }
    if (invoice.ksef_status) {
      return { status: invoice.ksef_status, reference: null };
    }
    return { status: 'none', reference: null };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">
            <FileText className="h-4 w-4 mr-2" />
            Faktury
          </TabsTrigger>
          <TabsTrigger value="transmissions">
            <Send className="h-4 w-4 mr-2" />
            Transmisje
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            Ustawienia
          </TabsTrigger>
        </TabsList>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Faktury do wysyłki KSeF</CardTitle>
                <CardDescription>
                  Wyślij wystawione faktury do Krajowego Systemu e-Faktur
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchInvoices}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Odśwież
              </Button>
            </CardHeader>
            <CardContent>
              {!settings.is_enabled && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <span className="text-yellow-800 dark:text-yellow-200">
                      KSeF nie jest włączony. Przejdź do zakładki Ustawienia, aby aktywować.
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {invoices.map((invoice) => {
                  const ksefStatus = getKSeFStatus(invoice);
                  const config = statusConfig[ksefStatus.status] || null;

                  return (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{invoice.invoice_number}</span>
                          {config && (
                            <Badge variant={ksefStatus.status === 'accepted' ? 'default' : 'secondary'}>
                              <config.icon className={`h-3 w-3 mr-1 ${config.color}`} />
                              {config.label}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {invoice.buyer_snapshot?.name || 'Brak nabywcy'}
                        </p>
                        {ksefStatus.reference && (
                          <p className="text-xs text-muted-foreground mt-1">
                            KSeF: {ksefStatus.reference}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleGenerateXml(invoice.id)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          XML
                        </Button>
                        {!ksefStatus.reference && settings.is_enabled && (
                          <Button
                            size="sm"
                            onClick={() => handleSendToKSeF(invoice.id)}
                            disabled={sending === invoice.id}
                          >
                            {sending === invoice.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Send className="h-4 w-4 mr-1" />
                                Wyślij do KSeF
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {invoices.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    Brak wystawionych faktur do wysyłki
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transmissions Tab */}
        <TabsContent value="transmissions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Historia transmisji KSeF</CardTitle>
              <CardDescription>
                Wszystkie wysyłki i odpowiedzi z Krajowego Systemu e-Faktur
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {transmissions.map((transmission) => {
                  const config = statusConfig[transmission.status] || statusConfig.pending;

                  return (
                    <div
                      key={transmission.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <config.icon className={`h-4 w-4 ${config.color}`} />
                          <span className="font-medium">{config.label}</span>
                          <Badge variant="outline">{transmission.direction}</Badge>
                        </div>
                        {transmission.ksef_reference_number && (
                          <p className="text-sm text-muted-foreground">
                            Numer KSeF: {transmission.ksef_reference_number}
                          </p>
                        )}
                        {transmission.error_message && (
                          <p className="text-sm text-red-500">{transmission.error_message}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(transmission.created_at).toLocaleString('pl-PL')}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {transmissions.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    Brak historii transmisji
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Konfiguracja KSeF</CardTitle>
              <CardDescription>
                Ustawienia integracji z Krajowym Systemem e-Faktur
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Włącz integrację KSeF</Label>
                  <p className="text-sm text-muted-foreground">
                    Aktywuj wysyłanie faktur do KSeF
                  </p>
                </div>
                <Switch
                  checked={settings.is_enabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, is_enabled: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label>Środowisko</Label>
                <Select
                  value={settings.environment}
                  onValueChange={(v: 'demo' | 'production') => setSettings({ ...settings, environment: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="demo">Demo (testowe)</SelectItem>
                    <SelectItem value="production">Produkcja</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Tryb demo symuluje wysyłkę bez połączenia z prawdziwym KSeF
                </p>
              </div>

              {settings.environment === 'production' && (
                <div className="space-y-2">
                  <Label>Token autoryzacyjny KSeF</Label>
                  <Input
                    type="password"
                    value={settings.token_encrypted || ''}
                    onChange={(e) => setSettings({ ...settings, token_encrypted: e.target.value })}
                    placeholder="Wprowadź token z portalu KSeF"
                  />
                  <p className="text-xs text-muted-foreground">
                    Token można wygenerować w panelu podatnika na stronie Ministerstwa Finansów
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <Label>Automatyczna wysyłka</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatycznie wysyłaj faktury po wystawieniu
                  </p>
                </div>
                <Switch
                  checked={settings.auto_send}
                  onCheckedChange={(checked) => setSettings({ ...settings, auto_send: checked })}
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                  Informacja o KSeF
                </h4>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• KSeF będzie obowiązkowy od lutego 2026</li>
                  <li>• Faktury wysłane do KSeF otrzymują unikalny numer</li>
                  <li>• W trybie demo faktury nie są wysyłane do prawdziwego systemu</li>
                  <li>• Produkcyjna integracja wymaga tokenu z portalu MF</li>
                </ul>
              </div>

              <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Zapisz ustawienia
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* XML Preview Modal */}
      <Dialog open={showXmlModal} onOpenChange={setShowXmlModal}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Podgląd XML FA(2)</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
              {currentXml}
            </pre>
          </ScrollArea>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(currentXml);
                toast({ title: 'Skopiowano', description: 'XML został skopiowany do schowka' });
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Kopiuj XML
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
