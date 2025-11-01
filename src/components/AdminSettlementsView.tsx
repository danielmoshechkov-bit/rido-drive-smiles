import { useState } from 'react';
import { UniversalSubTabBar } from './UniversalSubTabBar';
import { SettlementsManagement } from './SettlementsManagement';
import { FleetSettlementsView } from './FleetSettlementsView';
import { Card, CardContent } from './ui/card';

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

  // Admin view for company revenue - shows all fleets combined
  if (activeSubTab === "revenue" || activeSubTab === "drivers" || activeSubTab === "vehicles" || activeSubTab === "fuel") {
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
