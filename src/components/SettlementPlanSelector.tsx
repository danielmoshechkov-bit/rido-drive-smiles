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
  const [lastChangeDate, setLastChangeDate] = useState<Date | null>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    const { data, error } = await supabase
      .from('settlement_plans')
      .select('*')
      .eq('is_active', true);

    if (!error && data) {
      setPlans(data);
    }
  };

  useEffect(() => {
    fetchLastChangeDate();
  }, [driverData.driver_id]);

  const fetchLastChangeDate = async () => {
    // W przyszłości można dodać tabelę do śledzenia zmian planu
    // Na razie symulujemy ostatnią zmianę
    setLastChangeDate(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)); // 15 dni temu
  };

  const canChangePlan = () => {
    if (!lastChangeDate) return true;
    const daysSinceChange = Math.floor((Date.now() - lastChangeDate.getTime()) / (24 * 60 * 60 * 1000));
    return daysSinceChange >= 30;
  };

  const daysUntilNextChange = () => {
    if (!lastChangeDate || canChangePlan()) return 0;
    const daysSinceChange = Math.floor((Date.now() - lastChangeDate.getTime()) / (24 * 60 * 60 * 1000));
    return 30 - daysSinceChange;
  };

  const handlePlanChange = async (item: {id: string; name: string} | null) => {
    if (!item) return;
    
    const newPlanId = item.id;
    
    // Jeśli nie ma wybranego planu, pozwól wybrać
    if (selectedPlanId && !canChangePlan()) {
      toast.error(`Możesz zmienić plan za ${daysUntilNextChange()} dni`);
      return;
    }

    try {
      const { error } = await supabase
        .from("driver_app_users")
        .update({ settlement_plan_id: newPlanId })
        .eq("driver_id", driverData.driver_id);

      if (error) throw error;

      setSelectedPlanId(newPlanId);
      onPlanChange(newPlanId);
      setLastChangeDate(new Date());
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
      />
      {selectedPlanId && !canChangePlan() && (
        <div className="mt-1 text-xs text-muted-foreground">
          Zmiana możliwa za {daysUntilNextChange()} dni
        </div>
      )}
    </div>
  );
};