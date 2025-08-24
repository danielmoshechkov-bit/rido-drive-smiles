import { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const [selectedPlan, setSelectedPlan] = useState(currentPlan);
  const [isOpen, setIsOpen] = useState(false);
  const [lastChangeDate, setLastChangeDate] = useState<Date | null>(null);

  const plans = [
    { id: "39+8%", name: "39 zł + 8%", description: "39 zł opłaty stałej + 8% podatek od zarobków" },
    { id: "tylko 159", name: "Tylko 159 zł", description: "159 zł miesięcznie bez dodatkowych opłat" }
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

  const handlePlanChange = async (newPlan: string) => {
    if (!canChangePlan()) {
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
      setIsOpen(false);
      toast.success("Plan rozliczenia został zmieniony");
    } catch (error: any) {
      toast.error("Błąd przy zmianie planu: " + error.message);
    }
  };

  return (
    <Card className="rounded-lg">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium mb-1">Plan rozliczenia:</div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-md">
                {plans.find(p => p.id === selectedPlan)?.name || selectedPlan}
              </Badge>
              {!canChangePlan() && (
                <span className="text-xs text-muted-foreground">
                  Zmiana możliwa za {daysUntilNextChange()} dni
                </span>
              )}
            </div>
          </div>
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg"
                disabled={!canChangePlan()}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2 rounded-lg" align="end">
              {plans.map((plan) => (
                <Button
                  key={plan.id}
                  variant="ghost"
                  className="w-full justify-start p-3 h-auto rounded-md"
                  onClick={() => handlePlanChange(plan.id)}
                >
                  <div className="flex items-center gap-2 w-full">
                    <div className="flex-1 text-left">
                      <div className="font-medium">{plan.name}</div>
                      <div className="text-xs text-muted-foreground">{plan.description}</div>
                    </div>
                    {selectedPlan === plan.id && <Check className="h-4 w-4 text-primary" />}
                  </div>
                </Button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </CardContent>
    </Card>
  );
};