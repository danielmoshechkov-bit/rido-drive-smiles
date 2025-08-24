import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UniversalSelector } from "./UniversalSelector";

interface SettlementPlanSelectorProps {
  driverData: any;
  currentPlan: string;
  onPlanChange: (plan: string) => void;
}

export const SettlementPlanSelector = ({
  driverData,
  currentPlan,
  onPlanChange
}: SettlementPlanSelectorProps) => {
  const [selectedPlan, setSelectedPlan] = useState(currentPlan || "");
  const [lastChangeDate, setLastChangeDate] = useState<Date | null>(null);

  const plans = [
    { id: "tylko 159", name: "159 zł + 0% VAT", description: "159 zł tygodniowo bez dodatkowych opłat" },
    { id: "39+8%", name: "39+8% VAT", description: "39 zł + 8% VAT tygodniowo" }
  ];

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
    
    const newPlan = item.id;
    
    // Jeśli nie ma wybranego planu, pozwól wybrać
    if (selectedPlan && !canChangePlan()) {
      toast.error(`Możesz zmienić plan za ${daysUntilNextChange()} dni`);
      return;
    }

    try {
      const { error } = await supabase
        .from("driver_app_users")
        .update({ plan_type: newPlan })
        .eq("driver_id", driverData.driver_id);

      if (error) throw error;

      setSelectedPlan(newPlan);
      onPlanChange(newPlan);
      setLastChangeDate(new Date());
      toast.success("Plan rozliczenia został zmieniony");
    } catch (error: any) {
      toast.error("Błąd przy zmianie planu: " + error.message);
    }
  };

  const currentPlanName = plans.find(p => p.id === selectedPlan)?.name || "Wybierz plan";

  return (
    <div className="flex flex-col">
      <label className="text-xs text-muted-foreground mb-1">Plan rozliczenia</label>
      <UniversalSelector
        id="settlement-plan-selector"
        items={plans.map(plan => ({
          id: plan.id,
          name: plan.name
        }))}
        currentValue={selectedPlan}
        placeholder={currentPlanName}
        showSearch={false}
        showAdd={false}
        allowClear={false}
        onSelect={handlePlanChange}
        className="w-48"
      />
      {selectedPlan && !canChangePlan() && (
        <div className="mt-1 text-xs text-muted-foreground">
          Zmiana możliwa za {daysUntilNextChange()} dni
        </div>
      )}
    </div>
  );
};