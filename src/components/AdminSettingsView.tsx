import { useState } from 'react';
import { UniversalSubTabBar } from './UniversalSubTabBar';
import RidoSettings from './RidoSettings';
import { UserRolesManager } from './UserRolesManager';
import { SettlementPlansManagement } from './SettlementPlansManagement';
import { FleetAccountsManagement } from './FleetAccountsManagement';
import { SettlementVisibilitySettings } from './SettlementVisibilitySettings';
import { TabVisibilityManager } from './TabVisibilityManager';
import { EmailSettings } from './EmailSettings';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export function AdminSettingsView() {
  const [activeSubTab, setActiveSubTab] = useState("system");

  const subTabs = [
    { value: "system", label: "Ustawienia systemu", visible: true },
    { value: "user-roles", label: "Uprawnienia", visible: true },
    { value: "plans", label: "Plany", visible: true },
    { value: "fleet-accounts", label: "Konta flotowe", visible: true },
    { value: "visibility", label: "Widoczność", visible: true },
    { value: "tab-visibility", label: "Widoczność zakładek", visible: true },
    { value: "email", label: "Ustawienia poczty", visible: true }
  ];


  return (
    <div>
      <UniversalSubTabBar
        activeTab={activeSubTab}
        onTabChange={setActiveSubTab}
        tabs={subTabs}
      />

      {activeSubTab === "system" && <RidoSettings />}

      {activeSubTab === "user-roles" && <UserRolesManager />}
      {activeSubTab === "plans" && <SettlementPlansManagement />}
      {activeSubTab === "fleet-accounts" && <FleetAccountsManagement />}
      {activeSubTab === "visibility" && <SettlementVisibilitySettings />}
      {activeSubTab === "tab-visibility" && <TabVisibilityManager />}
      {activeSubTab === "email" && <EmailSettings />}
    </div>
  );
}
