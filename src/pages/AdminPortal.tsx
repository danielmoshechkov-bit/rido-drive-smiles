import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { UniversalSubTabBar } from '@/components/UniversalSubTabBar';
import { AdminPortalSwitcher } from '@/components/admin/AdminPortalSwitcher';
import { AISettingsPanel } from '@/components/ai/AISettingsPanel';
import { FeatureTogglesManagement } from '@/components/FeatureTogglesManagement';
import { UserRolesManager } from '@/components/UserRolesManager';
import { RegistryIntegrationsPanel } from '@/components/admin/RegistryIntegrationsPanel';
import { TTSSettingsPanel } from '@/components/admin/TTSSettingsPanel';
import { AccountingModuleSettings } from '@/components/admin/AccountingModuleSettings';
import { PortalCategoriesManager } from '@/components/admin/PortalCategoriesManager';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { MyGetRidoButton } from '@/components/MyGetRidoButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Globe, Settings, Palette, Users, Wrench, Volume2, Building2, Calculator, LayoutGrid } from 'lucide-react';

export default function AdminPortal() {
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('api');

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (!user) {
        navigate('/auth');
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  // Check admin access after roles are loaded
  useEffect(() => {
    if (!roleLoading && !loading && user) {
      if (!isAdmin) {
        navigate('/');
      }
    }
  }, [roleLoading, isAdmin, user, loading]);

  const subTabs = [
    { value: 'api', label: 'API i Integracje', visible: true },
    { value: 'voice', label: 'Głos i TTS', visible: true },
    { value: 'registries', label: 'Rejestry zewnętrzne', visible: true },
    { value: 'accounting', label: 'Moduł księgowy', visible: true },
    { value: 'features', label: 'Funkcje portalu', visible: true },
    { value: 'portals', label: 'Portale', visible: true },
    { value: 'branding', label: 'Wygląd', visible: true },
    { value: 'users', label: 'Użytkownicy systemu', visible: true },
  ];

  if (loading || roleLoading) {
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
            <UniversalHomeButton />
            <AdminPortalSwitcher />
          </div>
          <MyGetRidoButton user={user} />
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

          {/* Voice / TTS Tab */}
          {activeSubTab === 'voice' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Volume2 className="h-5 w-5" />
                    Ustawienia głosu
                  </CardTitle>
                  <CardDescription>
                    Konfiguracja TTS (synteza mowy) dla nawigacji i asystenta
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TTSSettingsPanel />
                </CardContent>
              </Card>
            </div>
          )}

          {/* External Registries Tab */}
          {activeSubTab === 'registries' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Rejestry zewnętrzne
                  </CardTitle>
                  <CardDescription>
                    Integracje z GUS REGON, Białą Listą VAT i KSeF
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RegistryIntegrationsPanel />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Accounting Module Tab */}
          {activeSubTab === 'accounting' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    Moduł księgowy
                  </CardTitle>
                  <CardDescription>
                    Ustawienia fakturowania, integracje GUS, biała lista VAT i KSeF
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AccountingModuleSettings />
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

          {/* Portals Tab */}
          {activeSubTab === 'portals' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LayoutGrid className="h-5 w-5" />
                    Zarządzanie portalami
                  </CardTitle>
                  <CardDescription>
                    Konfiguracja kafelków i kategorii na stronach portali (Motoryzacja, Nieruchomości, Usługi)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PortalCategoriesManager />
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
