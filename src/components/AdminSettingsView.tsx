import { useState } from 'react';
import { UniversalSubTabBar } from './UniversalSubTabBar';
import RidoSettings from './RidoSettings';
import { UserRolesManager } from './UserRolesManager';
import { SettlementPlansManagement } from './SettlementPlansManagement';
import { FleetAccountsManagement } from './FleetAccountsManagement';
import { SettlementVisibilitySettings } from './SettlementVisibilitySettings';
import { TabVisibilityManager } from './TabVisibilityManager';
import { EmailSettings } from './EmailSettings';
import { FeatureTogglesManagement } from './FeatureTogglesManagement';
import { AISettingsPanel } from './ai/AISettingsPanel';
import { PaidServicesPanel } from './admin/PaidServicesPanel';
import { UISettingsPanel } from './admin/UISettingsPanel';
import { AIVoiceAgentSettings } from './admin/AIVoiceAgentSettings';
import { AICallAdminPanel } from './admin/AICallAdminPanel';
import { AIHubPanel } from './admin/AIHubPanel';
import { RoadmapPanel } from './admin/RoadmapPanel';

export function AdminSettingsView() {
  const [activeSubTab, setActiveSubTab] = useState("system");

  const subTabs = [
    { value: "system", label: "Ustawienia systemu", visible: true },
    { value: "ui-settings", label: "Wygląd", visible: true },
    { value: "features", label: "Funkcje", visible: true },
    { value: "ai-hub", label: "AI Hub", visible: true },
    { value: "ai", label: "Ustawienia AI (legacy)", visible: true },
    { value: "ai-voice-agent", label: "AI Voice Agent", visible: true },
    { value: "ai-call-admin", label: "AI Call Admin", visible: true },
    { value: "paid-services", label: "Płatne usługi", visible: true },
    { value: "user-roles", label: "Uprawnienia", visible: true },
    { value: "plans", label: "Plany", visible: true },
    { value: "fleet-accounts", label: "Konta flotowe", visible: true },
    { value: "visibility", label: "Widoczność", visible: true },
    { value: "tab-visibility", label: "Widoczność zakładek", visible: true },
    { value: "email", label: "Ustawienia poczty", visible: true },
    { value: "roadmap", label: "Roadmap / Zadania", visible: true }
  ];


  return (
    <div>
      <UniversalSubTabBar
        activeTab={activeSubTab}
        onTabChange={setActiveSubTab}
        tabs={subTabs}
      />

      {activeSubTab === "system" && <RidoSettings />}
      {activeSubTab === "ui-settings" && <UISettingsPanel />}
      {activeSubTab === "features" && <FeatureTogglesManagement />}
      {activeSubTab === "ai-hub" && <AIHubPanel />}
      {activeSubTab === "ai" && <AISettingsPanel />}
      {activeSubTab === "ai-voice-agent" && <AIVoiceAgentSettings />}
      {activeSubTab === "ai-call-admin" && <AICallAdminPanel />}
      {activeSubTab === "paid-services" && <PaidServicesPanel />}
      {activeSubTab === "user-roles" && <UserRolesManager />}
      {activeSubTab === "plans" && <SettlementPlansManagement />}
      {activeSubTab === "fleet-accounts" && <FleetAccountsManagement />}
      {activeSubTab === "visibility" && <SettlementVisibilitySettings />}
      {activeSubTab === "tab-visibility" && <TabVisibilityManager />}
      {activeSubTab === "email" && <EmailSettings />}
      {activeSubTab === "roadmap" && <RoadmapPanel />}
    </div>
  );
}
