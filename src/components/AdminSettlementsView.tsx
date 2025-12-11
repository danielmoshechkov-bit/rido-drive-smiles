import { useState } from 'react';
import { UniversalSubTabBar } from './UniversalSubTabBar';
import { SettlementsManagement } from './SettlementsManagement';
import { Card, CardContent } from './ui/card';
import { CompanyRevenueView } from './CompanyRevenueView';
import { DriverSettlementsView } from './DriverSettlementsView';
import { FuelCSVImportModal } from './FuelCSVImportModal';
import { AdminFuelView } from './AdminFuelView';

interface AdminSettlementsViewProps {
  cityId: string;
  cityName: string;
}

export function AdminSettlementsView({ cityId, cityName }: AdminSettlementsViewProps) {
  const [activeSubTab, setActiveSubTab] = useState("manage");

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

  // Fuel view
  if (activeSubTab === "fuel") {
    return (
      <div>
        <UniversalSubTabBar
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          tabs={subTabs}
        />
        <div className="flex justify-start mb-4">
          <FuelCSVImportModal onUploadComplete={() => {
            // Refresh the fuel view after upload
            window.location.reload();
          }} />
        </div>
        <AdminFuelView />
      </div>
    );
  }

  // Placeholder for vehicles tab
  if (activeSubTab === "vehicles") {
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
      <SettlementsManagement 
        cityId={cityId} 
        cityName={cityName}
      />
    </div>
  );
}
