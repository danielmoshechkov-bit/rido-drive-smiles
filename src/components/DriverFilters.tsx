import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Filter, ChevronDown } from "lucide-react";
import { useDropdownState } from "@/hooks/useGlobalDropdown";

interface DriverFiltersProps {
  onFilterChange: (filters: {
    fleets: string[];
    statuses: string[];
    paymentMethods: string[];
  }) => void;
}

export const DriverFilters = ({ onFilterChange }: DriverFiltersProps) => {
  const { isOpen, toggle, close } = useDropdownState("driver-filters");
  const [selectedFleets, setSelectedFleets] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);

  const fleetOptions = [
    { id: 'uber', label: 'Uber' },
    { id: 'bolt', label: 'Bolt' },
    { id: 'freenow', label: 'FreeNow' },
    { id: 'brak', label: 'Flota brak' }
  ];

  const statusOptions = [
    { id: 'aktywni', label: 'Aktywni' },
    { id: 'nieaktywni', label: 'Nieaktywni' },
    { id: 'nowi', label: 'Nowi kierowcy' }
  ];

  const paymentMethodOptions = [
    { id: 'cash', label: 'Gotówka' },
    { id: 'transfer', label: 'Przelew' },
    { id: 'b2b', label: 'B2B (faktury)' }
  ];

  const handleFleetChange = (fleetId: string, checked: boolean) => {
    const updated = checked 
      ? [...selectedFleets, fleetId]
      : selectedFleets.filter(id => id !== fleetId);
    setSelectedFleets(updated);
    onFilterChange({ fleets: updated, statuses: selectedStatuses, paymentMethods: selectedPaymentMethods });
  };

  const handleStatusChange = (statusId: string, checked: boolean) => {
    const updated = checked 
      ? [...selectedStatuses, statusId]
      : selectedStatuses.filter(id => id !== statusId);
    setSelectedStatuses(updated);
    onFilterChange({ fleets: selectedFleets, statuses: updated, paymentMethods: selectedPaymentMethods });
  };

  const handlePaymentMethodChange = (methodId: string, checked: boolean) => {
    const updated = checked 
      ? [...selectedPaymentMethods, methodId]
      : selectedPaymentMethods.filter(id => id !== methodId);
    setSelectedPaymentMethods(updated);
    onFilterChange({ fleets: selectedFleets, statuses: selectedStatuses, paymentMethods: updated });
  };

  const activeFiltersCount = selectedFleets.length + selectedStatuses.length + selectedPaymentMethods.length;

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={toggle}
        className="gap-2 rounded-lg"
      >
        <Filter className="h-4 w-4" />
        Filtry
        {activeFiltersCount > 0 && (
          <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
            {activeFiltersCount}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <Card className="absolute top-full right-0 z-50 mt-2 w-80 shadow-lg border border-border/50 rounded-lg">
          <CardContent className="p-4 space-y-4">
            <div>
              <h4 className="font-medium mb-2">Floty</h4>
              <div className="space-y-2">
                {fleetOptions.map((fleet) => (
                  <div key={fleet.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`fleet-${fleet.id}`}
                      checked={selectedFleets.includes(fleet.id)}
                      onCheckedChange={(checked) => handleFleetChange(fleet.id, checked as boolean)}
                      className="rounded-sm"
                    />
                    <label
                      htmlFor={`fleet-${fleet.id}`}
                      className="text-sm cursor-pointer"
                    >
                      {fleet.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Metoda płatności</h4>
              <div className="space-y-2">
                {paymentMethodOptions.map((method) => (
                  <div key={method.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`payment-${method.id}`}
                      checked={selectedPaymentMethods.includes(method.id)}
                      onCheckedChange={(checked) => handlePaymentMethodChange(method.id, checked as boolean)}
                      className="rounded-sm"
                    />
                    <label
                      htmlFor={`payment-${method.id}`}
                      className="text-sm cursor-pointer"
                    >
                      {method.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Status</h4>
              <div className="space-y-2">
                {statusOptions.map((status) => (
                  <div key={status.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`status-${status.id}`}
                      checked={selectedStatuses.includes(status.id)}
                      onCheckedChange={(checked) => handleStatusChange(status.id, checked as boolean)}
                      className="rounded-sm"
                    />
                    <label
                      htmlFor={`status-${status.id}`}
                      className="text-sm cursor-pointer"
                    >
                      {status.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};