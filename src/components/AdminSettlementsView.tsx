import { useState } from 'react';
import { UniversalSubTabBar } from './UniversalSubTabBar';
import { SettlementsManagement } from './SettlementsManagement';
import { Card, CardContent } from './ui/card';
import { CompanyRevenueView } from './CompanyRevenueView';
import { DriverSettlementsView } from './DriverSettlementsView';
import { Button } from './ui/button';
import { Plus } from 'lucide-react';
import { CSVImportModal } from './CSVImportModal';

interface AdminSettlementsViewProps {
  cityId: string;
  cityName: string;
}

export function AdminSettlementsView({ cityId, cityName }: AdminSettlementsViewProps) {
  const [activeSubTab, setActiveSubTab] = useState("manage");
  const [showCSVImport, setShowCSVImport] = useState(false);

  const subTabs = [
    { value: "manage", label: "Rozlicz tydzień", visible: true },
    { value: "revenue", label: "Przychód firmy", visible: true },
    { value: "drivers", label: "Rozliczenia kierowców", visible: true },
    { value: "vehicles", label: "Przychody aut", visible: true },
    { value: "fuel", label: "Paliwo", visible: true }
  ];

  // Company revenue view
  if (activeSubTab === "revenue") {
    return (
      <div>
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
        <CompanyRevenueView />
      </div>
    );
  }

  // Driver settlements view
  if (activeSubTab === "drivers") {
    return (
      <div>
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
        <DriverSettlementsView />
      </div>
    );
  }

  // Placeholder for other tabs
  if (activeSubTab === "vehicles" || activeSubTab === "fuel") {
    return (
      <div>
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>Ta funkcjonalność będzie dostępna wkrótce.</p>
            <p className="text-sm mt-2">Dla szczegółowych danych użyj zakładki "Flota" i wybierz konkretną flotę.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Default: Rozlicz tydzień
  return (
    <div>
      <UniversalSubTabBar
        activeTab={activeSubTab}
        onTabChange={setActiveSubTab}
        tabs={subTabs}
      />
      <div className="mb-4">
        <Button onClick={() => setShowCSVImport(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Dodaj rozliczenie CSV
        </Button>
      </div>
      <SettlementsManagement 
        cityId={cityId} 
        cityName={cityName}
      />
      <CSVImportModal
        open={showCSVImport}
        onOpenChange={setShowCSVImport}
        cityId={cityId}
        onSuccess={() => {
          // Refresh settlements
          window.location.reload();
        }}
      />
    </div>
  );
}
