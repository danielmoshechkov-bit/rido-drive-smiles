import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, ChevronDown } from "lucide-react";
import { useDropdownState } from "@/hooks/useGlobalDropdown";
import { supabase } from "@/integrations/supabase/client";

interface DriverFiltersProps {
  onFilterChange: (filters: {
    fleets: string[];
    statuses: string[];
    paymentMethods: string[];
    fleetCompanyId?: string;
  }) => void;
}

export const DriverFilters = ({ onFilterChange }: DriverFiltersProps) => {
  const { isOpen, toggle, close } = useDropdownState("driver-filters");
  
  // Close filter panel on mount to prevent it from being open by default
  useEffect(() => {
    close();
  }, []);
  const [selectedFleets, setSelectedFleets] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [selectedFleetCompanyId, setSelectedFleetCompanyId] = useState<string>('all');
  const [fleetCompanies, setFleetCompanies] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    const loadFleets = async () => {
      const { data } = await supabase.from('fleets').select('id, name').order('name');
      setFleetCompanies(data || []);
    };
    loadFleets();
  }, []);

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

  const emitFilters = (fleets: string[], statuses: string[], paymentMethods: string[], fleetCompanyId?: string) => {
    onFilterChange({ fleets, statuses, paymentMethods, fleetCompanyId: fleetCompanyId === 'all' ? undefined : fleetCompanyId });
  };

  const handleFleetChange = (fleetId: string, checked: boolean) => {
    const updated = checked 
      ? [...selectedFleets, fleetId]
      : selectedFleets.filter(id => id !== fleetId);
    setSelectedFleets(updated);
    emitFilters(updated, selectedStatuses, selectedPaymentMethods, selectedFleetCompanyId);
  };

  const handleStatusChange = (statusId: string, checked: boolean) => {
    const updated = checked 
      ? [...selectedStatuses, statusId]
      : selectedStatuses.filter(id => id !== statusId);
    setSelectedStatuses(updated);
    emitFilters(selectedFleets, updated, selectedPaymentMethods, selectedFleetCompanyId);
  };

  const handlePaymentMethodChange = (methodId: string, checked: boolean) => {
    const updated = checked 
      ? [...selectedPaymentMethods, methodId]
      : selectedPaymentMethods.filter(id => id !== methodId);
    setSelectedPaymentMethods(updated);
    emitFilters(selectedFleets, selectedStatuses, updated, selectedFleetCompanyId);
  };

  const handleFleetCompanyChange = (value: string) => {
    setSelectedFleetCompanyId(value);
    emitFilters(selectedFleets, selectedStatuses, selectedPaymentMethods, value);
  };

  const activeFiltersCount = selectedFleets.length + selectedStatuses.length + selectedPaymentMethods.length + (selectedFleetCompanyId !== 'all' ? 1 : 0);

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
            {/* Fleet company filter */}
            <div>
              <h4 className="font-medium mb-2">Firma (flota)</h4>
              <Select value={selectedFleetCompanyId} onValueChange={handleFleetCompanyChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Wszystkie floty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie floty</SelectItem>
                  {fleetCompanies.map((fleet) => (
                    <SelectItem key={fleet.id} value={fleet.id}>
                      {fleet.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <h4 className="font-medium mb-2">Platformy</h4>
              <div className="space-y-2">
                {fleetOptions.map((fleet) => (
                  <div key={fleet.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`fleet-${fleet.id}`}
                      checked={selectedFleets.includes(fleet.id)}
                      onCheckedChange={(checked) => handleFleetChange(fleet.id, checked as boolean)}
                      className="rounded-sm"
                    />
                    <label htmlFor={`fleet-${fleet.id}`} className="text-sm cursor-pointer">
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
                    <label htmlFor={`payment-${method.id}`} className="text-sm cursor-pointer">
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
                    <label htmlFor={`status-${status.id}`} className="text-sm cursor-pointer">
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