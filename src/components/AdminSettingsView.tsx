import { useState } from 'react';
import { UniversalSubTabBar } from './UniversalSubTabBar';
import RidoSettings from './RidoSettings';
import { UserRolesManager } from './UserRolesManager';
import { SettlementPlansManagement } from './SettlementPlansManagement';
import { FleetAccountsManagement } from './FleetAccountsManagement';
import { SettlementVisibilitySettings } from './SettlementVisibilitySettings';
import { TabVisibilityManager } from './TabVisibilityManager';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export function AdminSettingsView() {
  const [activeSubTab, setActiveSubTab] = useState("system");
  const [cleaningAccounts, setCleaningAccounts] = useState(false);
  const [creatingAccounts, setCreatingAccounts] = useState(false);

  const subTabs = [
    { value: "system", label: "Ustawienia systemu", visible: true },
    { value: "user-roles", label: "Uprawnienia", visible: true },
    { value: "plans", label: "Plany", visible: true },
    { value: "fleet-accounts", label: "Konta flotowe", visible: true },
    { value: "visibility", label: "Widoczność", visible: true },
    { value: "tab-visibility", label: "Widoczność zakładek", visible: true }
  ];

  const handleCleanupFakeAccounts = async () => {
    setCleaningAccounts(true);
    try {
      const { data, error } = await supabase.functions.invoke('cleanup-fake-auth-accounts');
      
      if (error) throw error;
      
      toast({
        title: "Czyszczenie zakończone",
        description: `Usunięto ${data.results.deleted} kont z @rido.internal. Błędów: ${data.results.errors.length}`,
      });
    } catch (error) {
      console.error('Error cleaning up accounts:', error);
      toast({
        title: "Błąd",
        description: error instanceof Error ? error.message : "Nie udało się wyczyścić kont",
        variant: "destructive",
      });
    } finally {
      setCleaningAccounts(false);
    }
  };

  const handleCreateDriverAccounts = async () => {
    setCreatingAccounts(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-driver-accounts');
      
      if (error) throw error;
      
      toast({
        title: "Tworzenie kont zakończone",
        description: `Utworzono: ${data.results.created}, Istniało: ${data.results.already_exists}, Błędów: ${data.results.errors.length}`,
      });
    } catch (error) {
      console.error('Error creating accounts:', error);
      toast({
        title: "Błąd",
        description: error instanceof Error ? error.message : "Nie udało się utworzyć kont",
        variant: "destructive",
      });
    } finally {
      setCreatingAccounts(false);
    }
  };

  return (
    <div>
      <UniversalSubTabBar
        activeTab={activeSubTab}
        onTabChange={setActiveSubTab}
        tabs={subTabs}
      />

      {activeSubTab === "system" && (
        <div className="space-y-6">
          <RidoSettings />
          
          <Card>
            <CardHeader>
              <CardTitle>Zarządzanie kontami Auth</CardTitle>
              <p className="text-sm text-muted-foreground">
                Narzędzia do zarządzania kontami uwierzytelniania kierowców
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <h3 className="font-semibold">Wyczyść fałszywe konta @rido.internal</h3>
                <p className="text-sm text-muted-foreground">
                  Usuwa wszystkie konta z domeną @rido.internal, które nie mają odpowiadającego kierowcy w bazie danych.
                </p>
                <Button 
                  onClick={handleCleanupFakeAccounts}
                  disabled={cleaningAccounts}
                  variant="destructive"
                  className="w-full"
                >
                  {cleaningAccounts ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Czyszczenie...
                    </>
                  ) : (
                    "Wyczyść fałszywe konta"
                  )}
                </Button>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Utwórz brakujące konta kierowców</h3>
                <p className="text-sm text-muted-foreground">
                  Dla każdego kierowcy w bazie danych, który nie ma konta Auth, tworzy nowe konto z hasłem domyślnym.
                </p>
                <Button 
                  onClick={handleCreateDriverAccounts}
                  disabled={creatingAccounts}
                  className="w-full"
                >
                  {creatingAccounts ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Tworzenie kont...
                    </>
                  ) : (
                    "Utwórz brakujące konta"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeSubTab === "user-roles" && <UserRolesManager />}
      {activeSubTab === "plans" && <SettlementPlansManagement />}
      {activeSubTab === "fleet-accounts" && <FleetAccountsManagement />}
      {activeSubTab === "visibility" && <SettlementVisibilitySettings />}
      {activeSubTab === "tab-visibility" && <TabVisibilityManager />}
    </div>
  );
}
