import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { AdminPortalSwitcher } from '@/components/admin/AdminPortalSwitcher';
import { MapsVisibilityPanel } from '@/components/admin/MapsVisibilityPanel';
import { UniversalSubTabBar } from '@/components/UniversalSubTabBar';
import { Map, Settings, Eye, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const AdminMaps = () => {
  const navigate = useNavigate();
  const { isAdmin, loading } = useUserRole();
  const [activeSubTab, setActiveSubTab] = useState('config');

  const subTabs = [
    { label: 'Konfiguracja', value: 'config', visible: true },
    { label: 'Widoczność', value: 'visibility', visible: true },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    navigate('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <div
                className="font-bold text-xl cursor-pointer"
                onClick={() => navigate('/')}
              >
                GetRido
              </div>
              <AdminPortalSwitcher />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Map className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Moduł Mapy</h1>
          </div>
          <p className="text-muted-foreground">
            Zarządzanie modułem GetRido Maps i kontrola widoczności
          </p>
        </div>

        <UniversalSubTabBar
          tabs={subTabs}
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
        />

        <div className="mt-6">
          {activeSubTab === 'config' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Konfiguracja modułu
                </CardTitle>
                <CardDescription>
                  Ustawienia i konfiguracja modułu GetRido Maps
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Map className="h-16 w-16 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    Moduł w przygotowaniu
                  </h3>
                  <p className="text-muted-foreground max-w-md">
                    Konfiguracja mapy, warstw danych i integracji API będzie
                    dostępna w kolejnych etapach rozwoju.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {activeSubTab === 'visibility' && <MapsVisibilityPanel />}
        </div>
      </main>
    </div>
  );
};

export default AdminMaps;
