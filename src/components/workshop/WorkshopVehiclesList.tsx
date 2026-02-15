import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWorkshopVehicles } from '@/hooks/useWorkshop';
import { WorkshopAddVehicleDialog } from './WorkshopAddVehicleDialog';
import { Plus, Search, Loader2, Car, User } from 'lucide-react';

interface Props {
  providerId: string;
  onBack: () => void;
}

export function WorkshopVehiclesList({ providerId, onBack }: Props) {
  const { data: vehicles = [], isLoading } = useWorkshopVehicles(providerId);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">Pojazdy</h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Utwórz
        </Button>
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
                  <TableHead>MARKA / MODEL</TableHead>
                  <TableHead>NR REJESTRACYJNY</TableHead>
                  <TableHead>VIN</TableHead>
                  <TableHead>WŁAŚCICIEL</TableHead>
                  <TableHead>ROK PROD.</TableHead>
                  <TableHead>POJEMNOŚĆ</TableHead>
                  <TableHead>SILNIK</TableHead>
                  <TableHead>MOC SILNIKA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v: any) => (
                  <TableRow key={v.id} className="hover:bg-accent/50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{v.brand} {v.model}</span>
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
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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
