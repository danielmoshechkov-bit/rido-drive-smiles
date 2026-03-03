import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWorkshopVehicles } from '@/hooks/useWorkshop';
import { WorkshopAddVehicleDialog } from './WorkshopAddVehicleDialog';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, Loader2, Car, User, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  providerId: string;
  onBack: () => void;
  onSelectVehicle?: (vehicle: any) => void;
}

export function WorkshopVehiclesList({ providerId, onBack, onSelectVehicle }: Props) {
  const { data: vehicles = [], isLoading, refetch } = useWorkshopVehicles(providerId);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return vehicles;
    const q = search.toLowerCase();
    return vehicles.filter((v: any) =>
      (v.brand || '').toLowerCase().includes(q) ||
      (v.model || '').toLowerCase().includes(q) ||
      (v.plate || '').toLowerCase().includes(q) ||
      (v.vin || '').toLowerCase().includes(q)
    );
  }, [vehicles, search]);

  const getOwnerName = (v: any) => {
    if (!v.owner) return '';
    if (v.owner.company_name) return v.owner.company_name;
    return `${v.owner.first_name || ''} ${v.owner.last_name || ''}`.trim();
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((v: any) => v.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Czy na pewno chcesz usunąć ${selected.size} pojazdów?`)) return;
    setDeleting(true);
    try {
      const { error } = await (supabase as any)
        .from('workshop_vehicles')
        .delete()
        .in('id', Array.from(selected));
      if (error) throw error;
      toast.success(`Usunięto ${selected.size} pojazdów`);
      setSelected(new Set());
      refetch();
    } catch {
      toast.error('Błąd usuwania');
    }
    setDeleting(false);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">Pojazdy</h2>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Utwórz
        </Button>
        {selected.size > 0 && (
          <Button variant="destructive" onClick={handleBulkDelete} disabled={deleting} className="gap-2">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Usuń ({selected.size})
          </Button>
        )}
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj" className="pl-9 w-[250px]" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Marka / Model</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Nr rejestracyjny</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">VIN</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Właściciel</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Rok prod.</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Pojemność</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Silnik</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Moc silnika</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v: any) => (
                  <TableRow
                    key={v.id}
                    className={`cursor-pointer transition-colors hover:bg-[hsl(45,100%,85%)] ${selected.has(v.id) ? 'bg-[hsl(45,100%,90%)]' : ''}`}
                    onClick={() => onSelectVehicle?.(v)}
                  >
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(v.id)}
                        onCheckedChange={() => toggleSelect(v.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{v.brand} {v.model}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{v.plate || ''}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{v.vin || ''}</TableCell>
                    <TableCell>
                      {getOwnerName(v) && (
                        <div className="flex items-center gap-1.5 text-sm">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          {getOwnerName(v)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{v.year || ''}</TableCell>
                    <TableCell className="text-sm">{v.engine_capacity_cm3 || ''}</TableCell>
                    <TableCell className="text-sm">{v.fuel_type || ''}</TableCell>
                    <TableCell className="text-sm">
                      {v.engine_power_kw ? `${v.engine_power_kw} kW` : ''}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Brak pojazdów
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        Od 1 do {filtered.length} z {vehicles.length} wyników
      </div>

      <WorkshopAddVehicleDialog open={showAdd} onOpenChange={setShowAdd} providerId={providerId} />
    </div>
  );
}
