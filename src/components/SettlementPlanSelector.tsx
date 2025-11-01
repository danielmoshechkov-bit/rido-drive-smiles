import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UniversalSelector } from "./UniversalSelector";

interface SettlementPlanSelectorProps {
  driverData: any;
  currentPlanId: string | null;
  onPlanChange: (planId: string) => void;
}

export const SettlementPlanSelector = ({
  driverData,
  currentPlanId,
  onPlanChange
}: SettlementPlanSelectorProps) => {
  const [selectedPlanId, setSelectedPlanId] = useState(currentPlanId || "");
  const [plans, setPlans] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<'admin' | 'fleet_settlement' | 'fleet_rental' | 'driver' | null>(null);
  const [changePermission, setChangePermission] = useState<any>(null);

  useEffect(() => {
    loadPlans();
    fetchUserRole();
  }, []);

  useEffect(() => {
    if (driverData.driver_id) {
      fetchChangePermission();
    }
  }, [driverData.driver_id]);

  const loadPlans = async () => {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('settlement_plans')
      .select('*')
      .eq('is_active', true)
      .eq('is_visible', true)
      .or(`valid_from.is.null,valid_from.lte.${today}`)
      .or(`valid_to.is.null,valid_to.gte.${today}`);

    if (!error && data) {
      setPlans(data);
    }
  };

  const fetchUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    
    if (roles?.some(r => r.role === 'admin')) {
      setUserRole('admin');
    } else if (roles?.some(r => r.role === 'fleet_settlement')) {
      setUserRole('fleet_settlement');
    } else if (roles?.some(r => r.role === 'fleet_rental')) {
      setUserRole('fleet_rental');
    } else {
      setUserRole('driver');
    }
  };

  const fetchChangePermission = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data, error } = await supabase.rpc('can_change_settlement_plan', {
      _driver_id: driverData.driver_id,
      _user_id: user.id
    });
    
    if (!error && data) {
      setChangePermission(data);
    }
  };

  const handlePlanChange = async (item: {id: string; name: string} | null) => {
    if (!item) return;
    
    const newPlanId = item.id;
    const newPlanName = item.name;
    
    // Sprawdź uprawnienia
    if (!changePermission?.can_change) {
      toast.error(changePermission?.reason || 'Nie możesz zmienić planu');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Brak autoryzacji');
      
      // 1. Zapisz historię zmiany
      const { error: historyError } = await supabase
        .from('settlement_plan_changes')
        .insert({
          driver_id: driverData.driver_id,
          old_plan_id: selectedPlanId || null,
          new_plan_id: newPlanId,
          changed_by: user.id,
          changed_by_role: userRole
        });
      
      if (historyError) throw historyError;

      // 2. Zaktualizuj settlement_plan_id w driver_app_users
      const { error: appUserError } = await supabase
        .from("driver_app_users")
        .update({ settlement_plan_id: newPlanId })
        .eq("driver_id", driverData.driver_id);

      if (appUserError) throw appUserError;

      // 3. Zaktualizuj billing_method w drivers
      const { error: driverError } = await supabase
        .from("drivers")
        .update({ billing_method: newPlanName })
        .eq("id", driverData.driver_id);

      if (driverError) throw driverError;

      setSelectedPlanId(newPlanId);
      onPlanChange(newPlanId);
      
      // Odśwież uprawnienia
      await fetchChangePermission();
      
      toast.success("Plan rozliczenia został zmieniony");
    } catch (error: any) {
      toast.error("Błąd przy zmianie planu: " + error.message);
    }
  };

  const currentPlanName = plans.find(p => p.id === selectedPlanId)?.name || "Wybierz plan";

  return (
    <div className="flex flex-col">
      <label className="text-xs text-muted-foreground mb-1">Plan rozliczenia</label>
      <UniversalSelector
        id="settlement-plan-selector"
        items={plans.map(plan => ({
          id: plan.id,
          name: plan.name
        }))}
        currentValue={selectedPlanId}
        placeholder={currentPlanName}
        showSearch={false}
        showAdd={false}
        allowClear={false}
        onSelect={handlePlanChange}
        className="w-48"
        disabled={!changePermission?.can_change}
      />
      {changePermission && !changePermission.can_change && (
        <div className="mt-1 text-xs text-orange-600 font-medium">
          {changePermission.reason}
        </div>
      )}
      {changePermission && changePermission.is_admin && (
        <div className="mt-1 text-xs text-green-600 font-medium">
          Administrator - bez ograniczeń
        </div>
      )}
    </div>
  );
};