import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Shield } from 'lucide-react';

type RoleType = 'driver' | 'fleet_settlement' | 'fleet_rental' | 'admin';

interface TabConfig {
  id: string;
  label: string;
  children?: TabConfig[];
}

const TABS_CONFIG: TabConfig[] = [
  { id: 'weekly-report', label: 'Raport tygodniowy' },
  { id: 'settlements', label: 'Rozliczenia' },
  { id: 'drivers-list', label: 'Baza kierowców' },
  {
    id: 'fleet',
    label: 'Flota',
    children: [
      { id: 'fleet.vehicles', label: 'Auta' },
      { id: 'fleet.fleets', label: 'Floty (lista)' },
    ],
  },
  {
    id: 'documents',
    label: 'Dokumenty',
    children: [
      { id: 'documents.list', label: 'Lista dokumentów' },
    ],
  },
  { id: 'fleet-accounts', label: 'Konta flotowe' },
  { id: 'user-roles', label: 'Uprawnienia użytkowników' },
  { id: 'plans', label: 'Plany rozliczeniowe' },
  { id: 'tab-visibility', label: 'Widoczność (ten moduł)' },
  { id: 'data-import', label: 'Import danych' },
  { id: 'settings', label: 'Ustawienia systemowe' },
  { id: 'reports', label: 'Raporty' },
];

const ROLES: { value: RoleType; label: string }[] = [
  { value: 'driver', label: 'Kierowca' },
  { value: 'fleet_settlement', label: 'Flotowy - Rozliczenia' },
  { value: 'fleet_rental', label: 'Flotowy - Wynajem' },
  { value: 'admin', label: 'Administrator' },
];

export function TabVisibilityManager() {
  const [selectedRole, setSelectedRole] = useState<RoleType>('driver');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPermissions();
  }, [selectedRole]);

  const loadPermissions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tab_permissions')
        .select('tab_id, is_visible')
        .eq('role', selectedRole);

      if (error) throw error;

      const perms: Record<string, boolean> = {};
      data?.forEach(perm => {
        perms[perm.tab_id] = perm.is_visible;
      });
      setPermissions(perms);
    } catch (error) {
      console.error('Error loading permissions:', error);
      toast.error('Błąd wczytywania uprawnień');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (tabId: string, checked: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [tabId]: checked,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete all existing permissions for this role
      await supabase
        .from('tab_permissions')
        .delete()
        .eq('role', selectedRole);

      // Insert new permissions
      const permissionsToInsert = Object.entries(permissions).map(([tab_id, is_visible]) => ({
        role: selectedRole,
        tab_id,
        is_visible,
      }));

      const { error } = await supabase
        .from('tab_permissions')
        .insert(permissionsToInsert);

      if (error) throw error;

      toast.success('Ustawienia zapisane pomyślnie');
    } catch (error) {
      console.error('Error saving permissions:', error);
      toast.error('Błąd zapisu ustawień');
    } finally {
      setSaving(false);
    }
  };

  const renderTabCheckbox = (tab: TabConfig, level: number = 0) => {
    const isChecked = permissions[tab.id] ?? false;
    const indentClass = level > 0 ? 'ml-6' : '';

    return (
      <div key={tab.id} className={`space-y-2 ${indentClass}`}>
        <div className="flex items-center space-x-2">
          <Checkbox
            id={`tab-${tab.id}`}
            checked={isChecked}
            onCheckedChange={(checked) => handleToggle(tab.id, checked as boolean)}
          />
          <Label
            htmlFor={`tab-${tab.id}`}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            {tab.label}
          </Label>
        </div>
        {tab.children && isChecked && (
          <div className="space-y-2">
            {tab.children.map(child => renderTabCheckbox(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>Zarządzanie widocznością zakładek</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          Wybierz rolę i zaznacz zakładki, które mają być widoczne dla użytkowników z tą rolą
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Wybierz rolę:</Label>
          <div className="flex gap-2 flex-wrap">
            {ROLES.map(role => (
              <Button
                key={role.value}
                variant={selectedRole === role.value ? 'default' : 'outline'}
                onClick={() => setSelectedRole(role.value)}
              >
                {role.label}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="space-y-3 border rounded-lg p-4 max-h-96 overflow-y-auto">
              {TABS_CONFIG.map(tab => renderTabCheckbox(tab))}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Zapisywanie...
                  </>
                ) : (
                  'Zapisz ustawienia'
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
