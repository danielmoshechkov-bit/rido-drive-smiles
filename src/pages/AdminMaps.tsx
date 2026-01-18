import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { AdminPortalSwitcher } from '@/components/admin/AdminPortalSwitcher';
import { MapsVisibilityPanel } from '@/components/admin/MapsVisibilityPanel';
import { MapsConfigPanel } from '@/components/admin/MapsConfigPanel';
import { UniversalSubTabBar } from '@/components/UniversalSubTabBar';
import { Map, Loader2 } from 'lucide-react';

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
          {activeSubTab === 'config' && <MapsConfigPanel />}
          {activeSubTab === 'visibility' && <MapsVisibilityPanel />}
        </div>
      </main>
    </div>
  );
};

export default AdminMaps;
