import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { UniversalSubTabBar } from '@/components/UniversalSubTabBar';
import { AdminPortalSwitcher } from '@/components/admin/AdminPortalSwitcher';
import { AdminUsersPanel } from '@/components/admin/AdminUsersPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Wrench, Percent, Tag, Users, Calendar, BarChart, Trash2, Database, Star, MapPin } from 'lucide-react';
import { toast } from 'sonner';

interface CommissionSettings {
  id: string;
  commission_percent: number;
  is_enabled: boolean;
  min_amount: number | null;
  max_amount: number | null;
}

interface ServiceProvider {
  id: string;
  company_name: string;
  company_city: string | null;
  rating_avg: number | null;
  rating_count: number;
  status: string;
  created_at: string;
  category?: { name: string };
}

interface ServiceBooking {
  id: string;
  booking_number: string;
  customer_name: string;
  scheduled_date: string;
  status: string;
  estimated_price: number | null;
  provider?: { company_name: string };
  service?: { name: string };
}

export default function AdminServices() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('commission');
  
  // Commission settings state
  const [commission, setCommission] = useState<CommissionSettings | null>(null);
  const [savingCommission, setSavingCommission] = useState(false);
  
  // Providers and bookings
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);
  
  // Demo data state
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [deletingDemo, setDeletingDemo] = useState(false);

  useEffect(() => {
    checkAdmin();
    loadCommissionSettings();
    loadProviders();
    loadBookings();
  }, []);

  const checkAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      if (user.email === 'daniel.moshechkov@gmail.com') {
        setIsAdmin(true);
      } else {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);
        
        const hasAdminRole = roles?.some(r => r.role === 'admin');
        if (!hasAdminRole) {
          navigate('/');
          return;
        }
        setIsAdmin(true);
      }
    } catch (error) {
      console.error('Error checking admin:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const loadCommissionSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('service_commission_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      if (data) {
        setCommission(data);
      }
    } catch (error) {
      console.error('Error loading commission settings:', error);
    }
  };

  const loadProviders = async () => {
    try {
      const { data } = await supabase
        .from('service_providers')
        .select('*, category:service_categories(name)')
        .order('created_at', { ascending: false });
      
      if (data) setProviders(data as ServiceProvider[]);
    } catch (error) {
      console.error('Error loading providers:', error);
    }
  };

  const loadBookings = async () => {
    try {
      const { data } = await supabase
        .from('service_bookings')
        .select('*, provider:service_providers(company_name), service:services(name)')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (data) setBookings(data as ServiceBooking[]);
    } catch (error) {
      console.error('Error loading bookings:', error);
    }
  };

  const saveCommissionSettings = async () => {
    if (!commission) return;
    setSavingCommission(true);
    try {
      const { error } = await supabase
        .from('service_commission_settings')
        .update({
          commission_percent: commission.commission_percent,
          is_enabled: commission.is_enabled,
          min_amount: commission.min_amount,
          max_amount: commission.max_amount,
        })
        .eq('id', commission.id);
      
      if (error) throw error;
      toast.success('Ustawienia prowizji zapisane');
    } catch (error) {
      console.error('Error saving commission:', error);
      toast.error('Błąd zapisu ustawień');
    } finally {
      setSavingCommission(false);
    }
  };

  const seedDemoData = async () => {
    setSeedingDemo(true);
    try {
      const { data, error } = await supabase.functions.invoke('seed-services-demo', {
        body: { action: 'create' }
      });
      
      if (error) throw error;
      toast.success(`Utworzono ${data.providersCreated || 0} przykładowych usługodawców`);
      loadProviders();
      loadBookings();
    } catch (error) {
      console.error('Error seeding demo:', error);
      toast.error('Błąd tworzenia danych przykładowych');
    } finally {
      setSeedingDemo(false);
    }
  };

  const deleteDemoData = async () => {
    setDeletingDemo(true);
    try {
      const { error } = await supabase.functions.invoke('seed-services-demo', {
        body: { action: 'delete' }
      });
      
      if (error) throw error;
      toast.success('Dane przykładowe usunięte');
      loadProviders();
      loadBookings();
    } catch (error) {
      console.error('Error deleting demo:', error);
      toast.error('Błąd usuwania danych przykładowych');
    } finally {
      setDeletingDemo(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      'new': 'secondary',
      'confirmed': 'default',
      'in_progress': 'default',
      'completed': 'outline',
      'cancelled': 'destructive',
      'active': 'default',
      'pending': 'secondary',
      'suspended': 'destructive'
    };
    const labels: Record<string, string> = {
      'new': 'Nowa',
      'confirmed': 'Potwierdzona',
      'in_progress': 'W trakcie',
      'completed': 'Zakończona',
      'cancelled': 'Anulowana',
      'active': 'Aktywny',
      'pending': 'Oczekuje',
      'suspended': 'Zawieszony'
    };
    return <Badge variant={variants[status] || 'outline'}>{labels[status] || status}</Badge>;
  };

  const subTabs = [
    { value: 'commission', label: 'Prowizje', visible: true },
    { value: 'providers', label: 'Wykonawcy', visible: true },
    { value: 'bookings', label: 'Rezerwacje', visible: true },
    { value: 'users', label: 'Użytkownicy', visible: true },
    { value: 'demo', label: 'Dane testowe', visible: true },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png"
              alt="RIDO"
              className="h-8 w-8 cursor-pointer"
              onClick={() => navigate('/easy')}
            />
            <AdminPortalSwitcher />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Wrench className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Zarządzanie Usługami</h1>
          </div>
          <p className="text-muted-foreground">
            Prowizje, wykonawcy, rezerwacje i użytkownicy
          </p>
        </div>

        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />

        <div className="mt-6">
          {/* Commission Tab */}
          {activeSubTab === 'commission' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Percent className="h-5 w-5" />
                    Ustawienia prowizji
                  </CardTitle>
                  <CardDescription>
                    Konfiguracja prowizji od usług
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {commission ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-medium">Prowizja aktywna</Label>
                          <p className="text-sm text-muted-foreground">
                            Włącz pobieranie prowizji od transakcji
                          </p>
                        </div>
                        <Switch
                          checked={commission.is_enabled}
                          onCheckedChange={(checked) => 
                            setCommission(prev => prev ? { ...prev, is_enabled: checked } : null)
                          }
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label>Procent prowizji (%)</Label>
                          <Input
                            type="number"
                            value={commission.commission_percent}
                            onChange={(e) => 
                              setCommission(prev => 
                                prev ? { ...prev, commission_percent: parseFloat(e.target.value) || 0 } : null
                              )
                            }
                            min={0}
                            max={100}
                          />
                        </div>
                        <div>
                          <Label>Minimalna kwota (zł)</Label>
                          <Input
                            type="number"
                            value={commission.min_amount || ''}
                            onChange={(e) => 
                              setCommission(prev => 
                                prev ? { ...prev, min_amount: parseFloat(e.target.value) || null } : null
                              )
                            }
                            placeholder="Brak limitu"
                          />
                        </div>
                        <div>
                          <Label>Maksymalna kwota (zł)</Label>
                          <Input
                            type="number"
                            value={commission.max_amount || ''}
                            onChange={(e) => 
                              setCommission(prev => 
                                prev ? { ...prev, max_amount: parseFloat(e.target.value) || null } : null
                              )
                            }
                            placeholder="Brak limitu"
                          />
                        </div>
                      </div>

                      <Button 
                        onClick={saveCommissionSettings}
                        disabled={savingCommission}
                      >
                        {savingCommission && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Zapisz ustawienia
                      </Button>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Ładowanie ustawień...</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Providers Tab */}
          {activeSubTab === 'providers' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Wykonawcy ({providers.length})
                </CardTitle>
                <CardDescription>
                  Lista usługodawców zarejestrowanych w systemie
                </CardDescription>
              </CardHeader>
              <CardContent>
                {providers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>Brak zarejestrowanych wykonawców</p>
                    <Button className="mt-4" onClick={() => setActiveSubTab('demo')}>
                      Utwórz dane testowe
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Firma</TableHead>
                          <TableHead>Kategoria</TableHead>
                          <TableHead>Lokalizacja</TableHead>
                          <TableHead>Ocena</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {providers.map(provider => (
                          <TableRow key={provider.id}>
                            <TableCell className="font-medium">{provider.company_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{provider.category?.name || '-'}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center text-sm text-muted-foreground">
                                <MapPin className="h-3.5 w-3.5 mr-1" />
                                {provider.company_city || '-'}
                              </div>
                            </TableCell>
                            <TableCell>
                              {provider.rating_avg ? (
                                <div className="flex items-center">
                                  <Star className="h-3.5 w-3.5 mr-1 fill-amber-400 text-amber-400" />
                                  {provider.rating_avg.toFixed(1)} ({provider.rating_count})
                                </div>
                              ) : '-'}
                            </TableCell>
                            <TableCell>{getStatusBadge(provider.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Bookings Tab */}
          {activeSubTab === 'bookings' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Rezerwacje ({bookings.length})
                </CardTitle>
                <CardDescription>
                  Przegląd wszystkich rezerwacji w systemie
                </CardDescription>
              </CardHeader>
              <CardContent>
                {bookings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>Brak rezerwacji</p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nr rezerwacji</TableHead>
                          <TableHead>Klient</TableHead>
                          <TableHead>Usługa</TableHead>
                          <TableHead>Wykonawca</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Kwota</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bookings.map(booking => (
                          <TableRow key={booking.id}>
                            <TableCell className="font-mono text-sm">{booking.booking_number}</TableCell>
                            <TableCell>{booking.customer_name}</TableCell>
                            <TableCell>{booking.service?.name || '-'}</TableCell>
                            <TableCell>{booking.provider?.company_name || '-'}</TableCell>
                            <TableCell>{new Date(booking.scheduled_date).toLocaleDateString('pl-PL')}</TableCell>
                            <TableCell>{booking.estimated_price ? `${booking.estimated_price} zł` : '-'}</TableCell>
                            <TableCell>{getStatusBadge(booking.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Users Tab */}
          {activeSubTab === 'users' && (
            <AdminUsersPanel
              title="Użytkownicy modułu Usług"
              description="Usługodawcy zarejestrowani w portalu usług"
              source="services"
            />
          )}

          {/* Demo Data Tab */}
          {activeSubTab === 'demo' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Dane testowe
                </CardTitle>
                <CardDescription>
                  Zarządzanie przykładowymi danymi do testowania portalu
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="border-2 border-dashed">
                    <CardContent className="p-6 text-center">
                      <Database className="h-12 w-12 mx-auto mb-4 text-primary" />
                      <h3 className="font-semibold mb-2">Utwórz dane przykładowe</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Utworzy 10 przykładowych usługodawców z usługami, rezerwacjami i recenzjami
                      </p>
                      <Button onClick={seedDemoData} disabled={seedingDemo}>
                        {seedingDemo && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Utwórz przykłady
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-dashed border-destructive/30">
                    <CardContent className="p-6 text-center">
                      <Trash2 className="h-12 w-12 mx-auto mb-4 text-destructive" />
                      <h3 className="font-semibold mb-2">Usuń dane przykładowe</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Usunie wszystkie dane z oznaczeniem "Demo" (usługodawcy, usługi, rezerwacje, recenzje)
                      </p>
                      <Button 
                        variant="destructive" 
                        onClick={deleteDemoData} 
                        disabled={deletingDemo}
                      >
                        {deletingDemo && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Usuń przykłady
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">Co zostanie utworzone:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• 10 usługodawców w różnych kategoriach (Sprzątanie, Warsztaty, Detailing, Złota rączka, Hydraulik)</li>
                    <li>• 25+ usług z cenami i czasem trwania</li>
                    <li>• 5 przykładowych rezerwacji w różnych statusach</li>
                    <li>• 20+ recenzji z ocenami i komentarzami</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
