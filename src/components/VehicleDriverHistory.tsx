import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

export function VehicleDriverHistory({ vehicleId }: { vehicleId: string }) {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const loadDrivers = async () => {
    const { data } = await supabase.from('drivers').select('*').order('first_name');
    setDrivers(data || []);
  };

  const loadAssignments = async () => {
    const { data } = await supabase
      .from('driver_vehicle_assignments')
      .select(`
        *,
        drivers(first_name, last_name, email, phone)
      `)
      .eq('vehicle_id', vehicleId)
      .order('assigned_at', { ascending: false });
    setAssignments(data || []);
  };

  useEffect(() => {
    loadDrivers();
    loadAssignments();
  }, [vehicleId]);

  const assignDriver = async () => {
    if (!selectedDriverId) return;
    
    // Zakończ poprzednie przypisania
    const { error: updateError } = await supabase
      .from('driver_vehicle_assignments')
      .update({ 
        status: 'inactive',
        unassigned_at: new Date().toISOString()
      })
      .eq('vehicle_id', vehicleId)
      .eq('status', 'active');

    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    // Utwórz nowe przypisanie
    const { error } = await supabase
      .from('driver_vehicle_assignments')
      .insert([{
        driver_id: selectedDriverId,
        vehicle_id: vehicleId,
        status: 'active',
        assigned_at: new Date().toISOString()
      }]);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Kierowca został przypisany do pojazdu');
    setSelectedDriverId('');
    setSearchQuery('');
    setShowDropdown(false);
    loadAssignments();
  };

  const deleteAssignment = async (assignmentId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten wpis z historii?')) return;
    
    const { error } = await supabase
      .from('driver_vehicle_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) {
      toast.error('Błąd usuwania: ' + error.message);
      return;
    }

    toast.success('Wpis został usunięty z historii');
    loadAssignments();
  };

  const filteredDrivers = drivers.filter(driver => 
    `${driver.first_name} ${driver.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    driver.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeAssignment = assignments.find(a => a.status === 'active');
  const inactiveAssignments = assignments.filter(a => a.status !== 'active');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Przypisany kierowca</CardTitle></CardHeader>
        <CardContent>
          {activeAssignment ? (
            <div className="border rounded-lg p-3 bg-green-50 relative">
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full w-6 h-6 p-0"
                onClick={async () => {
                  if (confirm('Czy na pewno chcesz usunąć przypisanie kierowcy?')) {
                    const { error } = await supabase
                      .from('driver_vehicle_assignments')
                      .update({ 
                        status: 'inactive',
                        unassigned_at: new Date().toISOString()
                      })
                      .eq('id', activeAssignment.id);

                    if (error) {
                      toast.error(error.message);
                      return;
                    }

                    toast.success('Kierowca został usunięty z pojazdu');
                    loadAssignments();
                  }
                }}
              >
                ✕
              </Button>
              
              <div className="font-medium">
                {activeAssignment.drivers.first_name} {activeAssignment.drivers.last_name}
              </div>
              <div className="text-sm text-muted-foreground">
                {activeAssignment.drivers.email} • {activeAssignment.drivers.phone}
              </div>
              <div className="text-xs text-muted-foreground">
                Przypisany: {new Date(activeAssignment.assigned_at).toLocaleString()}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Brak przypisanego kierowcy</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div className="relative">
              <Input
                placeholder="Szukaj kierowcy..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
              />
              {showDropdown && filteredDrivers.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {filteredDrivers.map(driver => (
                    <div
                      key={driver.id}
                      className="p-2 hover:bg-muted cursor-pointer text-sm"
                      onClick={() => {
                        setSelectedDriverId(driver.id);
                        setSearchQuery(`${driver.first_name} ${driver.last_name}`);
                        setShowDropdown(false);
                      }}
                    >
                      <div className="font-medium">{driver.first_name} {driver.last_name}</div>
                      <div className="text-muted-foreground">{driver.email}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={assignDriver} disabled={!selectedDriverId}>
              Przypisz kierowcę
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Historia przypisań</CardTitle>
            {inactiveAssignments.length > 0 && (
              <Collapsible open={historyExpanded} onOpenChange={setHistoryExpanded}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {historyExpanded ? (
                      <>
                        Ukryj <ChevronUp className="ml-2 h-4 w-4" />
                      </>
                    ) : (
                      <>
                        Pokaż wszystkie ({inactiveAssignments.length}) <ChevronDown className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-muted-foreground">Brak historii przypisań.</p>
          ) : (
            <div className="space-y-2">
              {/* Show most recent inactive assignment */}
              {!historyExpanded && inactiveAssignments.length > 0 && (
                <div key={inactiveAssignments[0].id} className="border rounded-lg p-3 relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-50 w-7 h-7 p-0"
                    onClick={() => deleteAssignment(inactiveAssignments[0].id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <div className="flex justify-between items-start pr-10">
                    <div>
                      <div className="font-medium">
                        {inactiveAssignments[0].drivers.first_name} {inactiveAssignments[0].drivers.last_name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {inactiveAssignments[0].drivers.email}
                      </div>
                    </div>
                    <Badge variant="secondary">Zakończone</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Od: {new Date(inactiveAssignments[0].assigned_at).toLocaleString()}
                    {inactiveAssignments[0].unassigned_at && 
                      ` • Do: ${new Date(inactiveAssignments[0].unassigned_at).toLocaleString()}`
                    }
                  </div>
                </div>
              )}
              
              {/* Show all inactive assignments when expanded */}
              {historyExpanded && (
                <Collapsible open={historyExpanded}>
                  <CollapsibleContent>
                    <div className="space-y-2">
                      {inactiveAssignments.map(assignment => (
                        <div key={assignment.id} className="border rounded-lg p-3 relative">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-50 w-7 h-7 p-0"
                            onClick={() => deleteAssignment(assignment.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <div className="flex justify-between items-start pr-10">
                            <div>
                              <div className="font-medium">
                                {assignment.drivers.first_name} {assignment.drivers.last_name}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {assignment.drivers.email}
                              </div>
                            </div>
                            <Badge variant="secondary">Zakończone</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            Od: {new Date(assignment.assigned_at).toLocaleString()}
                            {assignment.unassigned_at && 
                              ` • Do: ${new Date(assignment.unassigned_at).toLocaleString()}`
                            }
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
