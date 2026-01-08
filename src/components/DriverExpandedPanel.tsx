import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DriverDocumentStatuses } from "./DriverDocumentStatuses";
import { PlatformIdEditor } from "./PlatformIdEditor";
import { DriverRoleManager } from "./DriverRoleManager";
import { VehicleHistorySection } from "./VehicleHistorySection";
import { Driver } from "@/hooks/useDrivers";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Key, UserCircle } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface DriverExpandedPanelProps {
  driver: Driver;
  onUpdate: () => void;
  mode?: 'admin' | 'fleet';
}

export function DriverExpandedPanel({ driver, onUpdate, mode = 'admin' }: DriverExpandedPanelProps) {
  const platforms = ['uber', 'bolt', 'freenow', 'getrido'];
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [userAuthId, setUserAuthId] = useState<string | null>(null);
  const [hasAuthAccount, setHasAuthAccount] = useState(false);
  const [settlementPlanName, setSettlementPlanName] = useState<string | null>(null);
  const [fleetSettings, setFleetSettings] = useState<{ base_fee: number; vat_rate: number } | null>(null);

  useEffect(() => {
    checkAuthAccount();
    fetchSettlementData();
  }, [driver.id, driver.email, (driver as any).fleet_id]);

  const fetchSettlementData = async () => {
    try {
      // 1. Check if driver has assigned settlement plan
      const { data: appUser } = await supabase
        .from('driver_app_users')
        .select('settlement_plan_id')
        .eq('driver_id', driver.id)
        .maybeSingle();
      
      if (appUser?.settlement_plan_id) {
        // Fetch plan name
        const { data: plan } = await supabase
          .from('settlement_plans')
          .select('name')
          .eq('id', appUser.settlement_plan_id)
          .maybeSingle();
        
        if (plan?.name) {
          setSettlementPlanName(plan.name);
          setFleetSettings(null);
          return;
        }
      }
      
      // 2. If no plan - fetch fleet settings
      const fleetId = (driver as any).fleet_id;
      if (fleetId) {
        const { data: fleet } = await supabase
          .from('fleets')
          .select('base_fee, vat_rate')
          .eq('id', fleetId)
          .maybeSingle();
        
        if (fleet) {
          setFleetSettings({
            base_fee: fleet.base_fee ?? 50,
            vat_rate: fleet.vat_rate ?? 8
          });
          setSettlementPlanName(null);
        }
      }
    } catch (error) {
      console.error('Error fetching settlement data:', error);
    }
  };

  const checkAuthAccount = async () => {
    if (!driver.email) {
      setHasAuthAccount(false);
      setUserAuthId(null);
      return;
    }

    try {
      const { data: driverAppUser } = await supabase
        .from('driver_app_users')
        .select('user_id')
        .eq('driver_id', driver.id)
        .maybeSingle();

      if (driverAppUser?.user_id) {
        setUserAuthId(driverAppUser.user_id);
        setHasAuthAccount(true);
      } else {
        setHasAuthAccount(false);
        setUserAuthId(null);
      }
    } catch (error) {
      console.error('Error checking auth account:', error);
    }
  };
  
  const getPlatformId = (platform: string) => {
    if (platform === 'getrido') return driver.getrido_id || '';
    return driver.platform_ids?.find(p => p.platform === platform)?.platform_id || '';
  };

  const getSettlementDisplay = () => {
    // Priority: 1. Settlement plan name, 2. Fleet settings, 3. Fallback
    if (settlementPlanName) {
      return { label: settlementPlanName, color: 'bg-blue-500/10 text-blue-700 border-blue-500/20' };
    }
    if (fleetSettings) {
      return { 
        label: `${fleetSettings.base_fee}+${fleetSettings.vat_rate}%`, 
        color: 'bg-purple-500/10 text-purple-700 border-purple-500/20' 
      };
    }
    return { label: '50+8%', color: 'bg-gray-500/10 text-gray-700 border-gray-500/20' };
  };

  const handleCreateAuthAccount = async () => {
    if (!driver.email) {
      toast.error('Kierowca nie ma adresu email');
      return;
    }

    if (!tempPassword || tempPassword.length < 8) {
      toast.error('Hasło musi mieć minimum 8 znaków');
      return;
    }

    setCreatingAccount(true);
    try {
      // Call edge function to create/reset password
      const { data, error } = await supabase.functions.invoke('reset-driver-password', {
        body: { 
          email: driver.email,
          password: tempPassword,
          driver_id: driver.id
        }
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Błąd podczas tworzenia konta');
      }

      setShowSuccess(true);
      setTempPassword('');
      
      if (data.action === 'created') {
        toast.success(`✅ Konto utworzone dla ${driver.email}`);
      } else {
        toast.success(`✅ Hasło zmienione dla ${driver.email}`);
      }

      setTimeout(() => setShowSuccess(false), 5000);
      checkAuthAccount(); // Refresh auth account status
      onUpdate();
    } catch (error) {
      console.error('Error creating auth account:', error);
      toast.error(error instanceof Error ? error.message : 'Błąd podczas tworzenia konta');
    } finally {
      setCreatingAccount(false);
    }
  };

  const settlementDisplay = getSettlementDisplay();

  return (
    <Card className="mt-2 p-4 bg-muted/20 border-l-4 border-primary/20">
      {showSuccess && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="font-semibold text-green-800">
            ✅ Konto utworzone pomyślnie! Kierowca może się teraz zalogować.
          </p>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* Temporary Password Section - Only for admin */}
          {mode === 'admin' && (
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Hasło tymczasowe</h4>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Wpisz hasło (min. 8 znaków)"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={creatingAccount || !driver.email}
                  className="flex-1"
                />
                <Button
                  onClick={handleCreateAuthAccount}
                  disabled={creatingAccount || !driver.email || tempPassword.length < 8}
                  className="gap-2 whitespace-nowrap"
                >
                  <Key className="h-4 w-4" />
                  {creatingAccount ? 'Tworzenie...' : 'Utwórz konto'}
                </Button>
              </div>
              {!driver.email && (
                <p className="text-xs text-muted-foreground">
                  Dodaj email kierowcy aby utworzyć konto
                </p>
              )}
              {tempPassword && tempPassword.length < 8 && (
                <p className="text-xs text-destructive">
                  Hasło musi mieć minimum 8 znaków
                </p>
              )}
            </div>
          )}

      <div className="space-y-3">
        <h4 className="font-medium text-sm">ID Platform</h4>
        <div className="space-y-3">
          {mode === 'admin' ? (
            platforms.map(platform => (
              <PlatformIdEditor
                key={platform}
                driverId={driver.id}
                platform={platform}
                currentId={getPlatformId(platform)}
                onUpdate={onUpdate}
              />
            ))
          ) : (
            platforms.map(platform => (
              <div key={platform} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                <span className="text-sm font-medium uppercase w-20">{platform}:</span>
                <span className="text-sm">{getPlatformId(platform) || '—'}</span>
              </div>
            ))
          )}
        </div>
      </div>

          <div className="space-y-2">
            <h4 className="font-medium text-sm">Sposób rozliczenia</h4>
            <Badge className={settlementDisplay.color} variant="outline">
              {settlementDisplay.label}
            </Badge>
          </div>
        </div>

        <div className="space-y-4">
          {/* Status konta */}
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <UserCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              Status konta: {hasAuthAccount ? (
                <Badge className="bg-green-500/10 text-green-700 border-green-500/20">
                  🟢 Konto aktywne
                </Badge>
              ) : (
                <Badge className="bg-gray-500/10 text-gray-700 border-gray-500/20">
                  🔴 Brak konta
                </Badge>
              )}
            </span>
          </div>

          {/* Role management - tylko w trybie admin i gdy ma konto auth */}
          {mode === 'admin' && hasAuthAccount && userAuthId && (
            <DriverRoleManager
              driverId={driver.id}
              userAuthId={userAuthId}
              onUpdate={onUpdate}
            />
          )}

          {mode === 'admin' && !hasAuthAccount && driver.email && (
            <Card className="p-4 bg-muted/20 border-primary/20">
              <p className="text-sm text-muted-foreground">
                💡 Utwórz konto aby zarządzać rolami i dostępami
              </p>
            </Card>
          )}

          <DriverDocumentStatuses documentStatuses={driver.document_statuses || []} />
          
          {driver.vehicle_assignment?.status === 'active' && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Status wynajmu</h4>
              <Badge className="bg-orange-500/10 text-orange-700 border-orange-500/20">
                WYNAJMUJE
              </Badge>
              {driver.vehicle_assignment.assigned_at && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Od: </span>
                  <span className="font-medium">
                    {format(new Date(driver.vehicle_assignment.assigned_at), 'dd MMM yyyy', { locale: pl })}
                  </span>
                </p>
              )}
              {driver.vehicle_assignment.fleet_name && (
                <p className="text-sm text-muted-foreground">
                  Flota: {driver.vehicle_assignment.fleet_name}
                </p>
              )}
            </div>
          )}

          {/* Vehicle History Section */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Historia pojazdów</h4>
            <VehicleHistorySection driverId={driver.id} onUpdate={onUpdate} />
          </div>
        </div>
      </div>
    </Card>
  );
}