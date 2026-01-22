import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useFeatureToggles } from '@/hooks/useFeatureToggles';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { UserDropdown } from '@/components/UserDropdown';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Building2, 
  FileText, 
  FolderOpen, 
  Settings, 
  PieChart, 
  Download,
  Plus,
  Receipt,
  Calculator,
  Loader2,
  Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { InvoicesList } from '@/components/accounting/InvoicesList';
import { EntitiesManager } from '@/components/accounting/EntitiesManager';

interface Entity {
  id: string;
  name: string;
  short_name: string | null;
  nip: string | null;
  regon: string | null;
  krs: string | null;
  type: string;
  vat_payer: boolean;
  address_street: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  email: string | null;
  phone: string | null;
  bank_account: string | null;
  bank_name: string | null;
  logo_url: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string | null;
  issue_date: string;
  due_date: string;
  gross_amount: number;
  net_amount: number;
  vat_amount: number;
  status: string;
  type: string;
  payment_method: string | null;
  pdf_url: string | null;
  buyer_snapshot: any;
  recipient_id: string | null;
  entity_id: string;
}

export default function AccountingDashboard() {
  const navigate = useNavigate();
  const { role, roles, loading: roleLoading, isAdmin } = useUserRole();
  const { features, loading: featuresLoading } = useFeatureToggles();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [user, setUser] = useState<any>(null);

  const canAccessAccounting = isAdmin || roles.includes('accounting_admin' as any);
  const isModuleEnabled = features.module_accounting_enabled;

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }
      setUser(user);
    };
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (!roleLoading && !canAccessAccounting && !isAdmin) {
      toast.error('Brak dostępu do panelu księgowego');
      navigate('/');
    }
  }, [roleLoading, canAccessAccounting, isAdmin, navigate]);

  useEffect(() => {
    if (user && canAccessAccounting) {
      fetchEntities();
    }
  }, [user, canAccessAccounting]);

  useEffect(() => {
    if (selectedEntityId) {
      fetchInvoices(selectedEntityId);
    }
  }, [selectedEntityId]);

  const fetchEntities = async () => {
    try {
      const { data, error } = await supabase
        .from('entities')
        .select('*')
        .order('name');

      if (error) throw error;
      setEntities(data || []);
      if (data && data.length > 0 && !selectedEntityId) {
        setSelectedEntityId(data[0].id);
      }
    } catch (error: any) {
      console.error('Error fetching entities:', error);
      toast.error('Błąd ładowania firm');
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoices = async (entityId: string) => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('entity_id', entityId)
        .order('issue_date', { ascending: false })
        .limit(50);

      if (error) throw error;
      setInvoices(data || []);
    } catch (error: any) {
      console.error('Error fetching invoices:', error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      draft: 'secondary',
      issued: 'default',
      sent: 'default',
      paid: 'outline',
      overdue: 'destructive',
      cancelled: 'secondary'
    };
    const labels: Record<string, string> = {
      draft: 'Robocza',
      issued: 'Wystawiona',
      sent: 'Wysłana',
      paid: 'Opłacona',
      partially_paid: 'Częściowo',
      overdue: 'Zaległa',
      cancelled: 'Anulowana'
    };
    return <Badge variant={variants[status] || 'outline'}>{labels[status] || status}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      invoice: 'VAT',
      proforma: 'Proforma',
      correction: 'Korekta',
      receipt: 'Rachunek'
    };
    return <Badge variant="outline">{labels[type] || type}</Badge>;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pl-PL');
  };

  if (roleLoading || featuresLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isModuleEnabled && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <CardTitle>Moduł niedostępny</CardTitle>
            <CardDescription>
              Moduł księgowy jest obecnie wyłączony. Skontaktuj się z administratorem, aby go włączyć.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => navigate('/')}>Wróć do strony głównej</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <UniversalHomeButton />
            <div className="hidden md:block">
              <h1 className="text-lg font-semibold">Panel Księgowy</h1>
              <p className="text-xs text-muted-foreground">Zarządzanie fakturami i dokumentami</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Entity Selector */}
            {entities.length > 0 && (
              <select
                value={selectedEntityId || ''}
                onChange={(e) => setSelectedEntityId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.short_name || entity.name}
                  </option>
                ))}
              </select>
            )}
            
            <UserDropdown 
              userName={user?.email?.split('@')[0] || 'Użytkownik'} 
              userEmail={user?.email || ''} 
              onLogout={handleLogout}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6 px-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 gap-1">
            <TabsTrigger value="overview" className="gap-2">
              <PieChart className="h-4 w-4" />
              <span className="hidden sm:inline">Przegląd</span>
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Faktury</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2">
              <FolderOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Dokumenty</span>
            </TabsTrigger>
            <TabsTrigger value="entities" className="gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Firmy</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2">
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">Raporty</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Ustawienia</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Faktury (miesiąc)</CardTitle>
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{invoices.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {invoices.filter(i => i.status === 'paid').length} opłaconych
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Przychód brutto</CardTitle>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(invoices.reduce((sum, i) => sum + (i.gross_amount || 0), 0))}
                  </div>
                  <p className="text-xs text-muted-foreground">Suma faktur</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Do zapłaty</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {invoices.filter(i => i.status === 'overdue').length}
                  </div>
                  <p className="text-xs text-muted-foreground">Zaległe faktury</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Firmy</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{entities.length}</div>
                  <p className="text-xs text-muted-foreground">Przypisane podmioty</p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Szybkie akcje</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nowa faktura
                </Button>
                <Button variant="outline" className="gap-2">
                  <FolderOpen className="h-4 w-4" />
                  Wgraj dokument
                </Button>
                <Button variant="outline" className="gap-2">
                  <Download className="h-4 w-4" />
                  Eksport CSV
                </Button>
                <Button variant="outline" className="gap-2">
                  <Building2 className="h-4 w-4" />
                  Dodaj firmę
                </Button>
              </CardContent>
            </Card>

            {/* Recent Invoices */}
            <Card>
              <CardHeader>
                <CardTitle>Ostatnie faktury</CardTitle>
                <CardDescription>Najnowsze dokumenty sprzedażowe</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : invoices.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Brak faktur</p>
                    <p className="text-sm">Kliknij "Nowa faktura" aby wystawić pierwszą fakturę</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {invoices.slice(0, 5).map((invoice) => (
                      <div 
                        key={invoice.id} 
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{invoice.invoice_number}</p>
                            <p className="text-sm text-muted-foreground">{formatDate(invoice.issue_date)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {getTypeBadge(invoice.type)}
                          {getStatusBadge(invoice.status)}
                          <span className="font-medium">{formatCurrency(invoice.gross_amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-4">
            {selectedEntityId && (
              <InvoicesList
                entityId={selectedEntityId}
                invoices={invoices}
                loading={loading}
                onRefresh={() => fetchInvoices(selectedEntityId)}
              />
            )}
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Dokumenty kosztowe</h2>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Wgraj dokument
              </Button>
            </div>
            
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12 text-muted-foreground">
                  <FolderOpen className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Inbox dokumentów</p>
                  <p className="text-sm mb-4">Wgraj faktury kosztowe, paragony i inne dokumenty</p>
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Wgraj PDF lub zdjęcie
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Entities Tab */}
          <TabsContent value="entities" className="space-y-4">
            <EntitiesManager
              entities={entities}
              loading={loading}
              onRefresh={fetchEntities}
            />
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-4">
            <h2 className="text-xl font-semibold">Raporty i analizy</h2>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    Rejestr VAT
                  </CardTitle>
                  <CardDescription>Sprzedaż i zakupy z podziałem na stawki VAT</CardDescription>
                </CardHeader>
              </Card>
              
              <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Przychody / Koszty
                  </CardTitle>
                  <CardDescription>Podsumowanie przychodów i kosztów</CardDescription>
                </CardHeader>
              </Card>
              
              <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Kontrahenci
                  </CardTitle>
                  <CardDescription>Analiza obrotów z kontrahentami</CardDescription>
                </CardHeader>
              </Card>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <h2 className="text-xl font-semibold">Ustawienia</h2>
            
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Serie numeracji</CardTitle>
                  <CardDescription>Zarządzaj wzorcami numeracji faktur</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">Konfiguruj serie</Button>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Dane firmy</CardTitle>
                  <CardDescription>Edytuj dane wystawcy na fakturach</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">Edytuj dane</Button>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Szablony faktur</CardTitle>
                  <CardDescription>Dostosuj wygląd PDF faktur</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">Edytuj szablon</Button>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Integracje</CardTitle>
                  <CardDescription>KSeF, email, eksporty</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">Konfiguruj</Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
