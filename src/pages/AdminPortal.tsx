import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { UniversalSubTabBar } from '@/components/UniversalSubTabBar';
import { AdminPortalSwitcher } from '@/components/admin/AdminPortalSwitcher';
import { AISettingsPanel } from '@/components/ai/AISettingsPanel';
import { FeatureTogglesManagement } from '@/components/FeatureTogglesManagement';
import { UserRolesManager } from '@/components/UserRolesManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Globe, Settings, Palette, Percent, Users, Wrench } from 'lucide-react';
import { toast } from 'sonner';

interface CommissionSettings {
  id: string;
  commission_percent: number;
  is_enabled: boolean;
  min_amount: number | null;
  max_amount: number | null;
}

export default function AdminPortal() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('api');
  
  // Commission settings state
  const [commission, setCommission] = useState<CommissionSettings | null>(null);
  const [savingCommission, setSavingCommission] = useState(false);

  useEffect(() => {
    checkAdmin();
    loadCommissionSettings();
  }, []);

  const checkAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      // Check if user is admin (daniel.moshechkov@gmail.com)
      if (user.email === 'daniel.moshechkov@gmail.com') {
        setIsAdmin(true);
      } else {
        // Check user_roles table for admin role
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

  const subTabs = [
    { value: 'api', label: 'API i Integracje', visible: true },
    { value: 'features', label: 'Funkcje portalu', visible: true },
    { value: 'services', label: 'Usługi i Prowizje', visible: true },
    { value: 'branding', label: 'Wygląd', visible: true },
    { value: 'users', label: 'Użytkownicy systemu', visible: true },
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
            <Globe className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Admin Portalu GetRido</h1>
          </div>
          <p className="text-muted-foreground">
            Globalne ustawienia portalu, API, funkcje i prowizje
          </p>
        </div>

        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />

        <div className="mt-6">
          {/* API & Integrations Tab */}
          {activeSubTab === 'api' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Ustawienia AI
                  </CardTitle>
                  <CardDescription>
                    Konfiguracja kluczy API dla OpenAI, Gemini i innych usług AI
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AISettingsPanel />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Feature Toggles Tab */}
          {activeSubTab === 'features' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-5 w-5" />
                    Funkcje portalu
                  </CardTitle>
                  <CardDescription>
                    Włączanie i wyłączanie modułów portalu
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FeatureTogglesManagement />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Services & Commissions Tab */}
          {activeSubTab === 'services' && (
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

              <Card>
                <CardHeader>
                  <CardTitle>Statystyki usług</CardTitle>
                  <CardDescription>
                    Przegląd przychodów z prowizji (wkrótce)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    <Wrench className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>Statystyki będą dostępne po uruchomieniu modułu usług</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Branding Tab */}
          {activeSubTab === 'branding' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="h-5 w-5" />
                    Wygląd portalu
                  </CardTitle>
                  <CardDescription>
                    Personalizacja logo, kolorów i brandingu
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    <Palette className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>Ustawienia wyglądu wkrótce</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Users Tab */}
          {activeSubTab === 'users' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Administratorzy systemu
                  </CardTitle>
                  <CardDescription>
                    Zarządzanie uprawnieniami administratorów
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <UserRolesManager />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
