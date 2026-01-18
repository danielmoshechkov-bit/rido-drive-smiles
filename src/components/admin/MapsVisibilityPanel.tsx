import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, Save } from 'lucide-react';

interface ModuleVisibility {
  id: string;
  module_key: string;
  module_name: string;
  is_active: boolean;
  visible_to_roles: string[];
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  fleet_settlement: 'Fleet Settlement',
  fleet_rental: 'Fleet Rental',
  driver: 'Kierowca',
  marketplace_user: 'Użytkownik Marketplace',
  real_estate_admin: 'Admin Nieruchomości',
  real_estate_agent: 'Agent Nieruchomości',
};

export const MapsVisibilityPanel = () => {
  const [config, setConfig] = useState<ModuleVisibility | null>(null);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch module visibility config
      const { data: moduleData, error: moduleError } = await supabase
        .from('module_visibility')
        .select('*')
        .eq('module_key', 'maps')
        .single();

      if (moduleError) {
        console.error('Error fetching module visibility:', moduleError);
      } else {
        const typedData = moduleData as ModuleVisibility;
        setConfig(typedData);
        setIsActive(typedData.is_active);
        setSelectedRoles(typedData.visible_to_roles || []);
      }

      // Fetch available roles from user_roles table
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .order('role');

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
      } else {
        // Get unique roles
        const uniqueRoles = [...new Set(rolesData?.map((r) => r.role) || [])];
        setAvailableRoles(uniqueRoles);
      }
    } catch (err) {
      console.error('Error in fetchData:', err);
      toast.error('Błąd podczas ładowania danych');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleToggle = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSave = async () => {
    if (!config?.id) {
      toast.error('Brak konfiguracji modułu');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('module_visibility')
        .update({
          is_active: isActive,
          visible_to_roles: selectedRoles,
        })
        .eq('id', config.id);

      if (error) {
        console.error('Error saving module visibility:', error);
        toast.error('Błąd podczas zapisywania ustawień');
      } else {
        toast.success('Ustawienia widoczności zapisane');
      }
    } catch (err) {
      console.error('Error in handleSave:', err);
      toast.error('Błąd podczas zapisywania');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isActive ? (
              <Eye className="h-5 w-5 text-green-500" />
            ) : (
              <EyeOff className="h-5 w-5 text-muted-foreground" />
            )}
            Status modułu
          </CardTitle>
          <CardDescription>
            Włącz lub wyłącz moduł Mapy dla wybranych użytkowników
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <Switch
              id="module-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="module-active" className="text-base">
              {isActive ? 'Moduł Mapy aktywny' : 'Moduł Mapy nieaktywny'}
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Widoczność dla ról</CardTitle>
          <CardDescription>
            Wybierz, które role użytkowników mogą widzieć moduł Mapy.
            Administratorzy zawsze mają dostęp do panelu Admin → Mapy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {availableRoles.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Brak zdefiniowanych ról w systemie
              </p>
            ) : (
              <div className="grid gap-3">
                {availableRoles.map((role) => (
                  <div key={role} className="flex items-center space-x-3">
                    <Checkbox
                      id={`role-${role}`}
                      checked={selectedRoles.includes(role)}
                      onCheckedChange={() => handleRoleToggle(role)}
                    />
                    <Label
                      htmlFor={`role-${role}`}
                      className="text-sm font-medium cursor-pointer"
                    >
                      {ROLE_LABELS[role] || role}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Zapisz ustawienia
        </Button>
      </div>
    </div>
  );
};
