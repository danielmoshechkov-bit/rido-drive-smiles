import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useWorkshopClients, useWorkshopVehicles } from '@/hooks/useWorkshop';
import {
  Plus, Search, Trash2, Archive, X
} from 'lucide-react';

interface Props {
  providerId: string;
  onBack: () => void;
}

export function WorkshopTireStorage({ providerId, onBack }: Props) {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">Przechowalnia</h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Przechowaj
        </Button>
        <Button variant="outline" className="gap-2 text-destructive">
          <Trash2 className="h-4 w-4" /> Usuń zaznaczone
        </Button>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj" className="pl-9 w-[250px]" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>KOD</TableHead>
                <TableHead>NUMER DOKUMENTU</TableHead>
                <TableHead>RODZAJ</TableHead>
                <TableHead>KLIENT</TableHead>
                <TableHead>POJAZD</TableHead>
                <TableHead>LOKALIZACJA</TableHead>
                <TableHead>DATA PRZYJĘCIA</TableHead>
                <TableHead>DATA WYDANIA</TableHead>
                <TableHead>TERMIN PRZECHOW.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  <Archive className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Brak danych
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        Od 0 do 0 z 0 wyników
      </div>

      <TireStorageDialog open={showAdd} onOpenChange={setShowAdd} providerId={providerId} />
    </div>
  );
}

function TireStorageDialog({ open, onOpenChange, providerId }: { open: boolean; onOpenChange: (v: boolean) => void; providerId: string }) {
  const { data: clients = [] } = useWorkshopClients(providerId);
  const { data: vehicles = [] } = useWorkshopVehicles(providerId);

  const [items, setItems] = useState<any[]>([]);
  const [tasks] = useState([
    { name: 'Wyczyszczenie opon', price: 0, done: false },
    { name: 'Naprawa felg', price: 0, done: false },
    { name: 'Naprawa opon', price: 0, done: false },
    { name: 'Kontrola głębokości bieżnika', price: 0, done: false },
    { name: 'Wyważenie kół', price: 0, done: false },
    { name: 'Zabezpieczenie opon preparatem konserwującym', price: 0, done: false },
    { name: 'Naprawa drobnych uszkodzeń', price: 0, done: false },
    { name: 'Wymiana wentyli', price: 0, done: false },
  ]);

  const addItem = () => {
    setItems([...items, {
      manufacturer: '', rim: '', rim_manufacturer: '', profile: '',
      tread_depth: '', dot: '', season: 'letnie', qty: 4, notes: ''
    }]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nowe przechowanie</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Klient</Label>
            <Select>
              <SelectTrigger><SelectValue placeholder="Wyszukaj klienta..." /></SelectTrigger>
              <SelectContent>
                {clients.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.company_name || `${c.first_name} ${c.last_name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Data przyjęcia</Label>
            <Input type="date" defaultValue={new Date().toISOString().split('T')[0]} />
          </div>

          <div className="space-y-2">
            <Label>Pojazd</Label>
            <Select>
              <SelectTrigger><SelectValue placeholder="Wyszukaj pojazd..." /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.brand} {v.model} — {v.plate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Data wydania</Label>
            <Input type="date" />
          </div>

          <div className="space-y-2">
            <Label>Koszt przechowania</Label>
            <div className="flex items-center gap-2">
              <Input type="number" defaultValue="150" className="flex-1" />
              <span className="text-sm text-muted-foreground">PLN netto</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Termin wydania</Label>
            <div className="flex items-center gap-2">
              <Input type="date" className="flex-1" />
              <Button variant="outline" size="sm">📱 Przypomnienie SMS</Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pracownik</Label>
            <Select>
              <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Lokalizacja</Label>
            <Textarea placeholder="Nr regału, pozycja w magazynie..." rows={2} />
          </div>
        </div>

        {/* Tire items */}
        <div className="mt-6">
          <h3 className="font-semibold text-lg mb-3">Pozycje na dokumencie</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>LP.</TableHead>
                <TableHead>PRODUCENT OPON</TableHead>
                <TableHead>FELGA</TableHead>
                <TableHead>PRODUCENT FELG</TableHead>
                <TableHead>PROFIL</TableHead>
                <TableHead>GŁ. BIEŻN.</TableHead>
                <TableHead>DATA PROD.</TableHead>
                <TableHead>SEZON</TableHead>
                <TableHead>ILOŚĆ</TableHead>
                <TableHead>OPIS</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell><Input className="h-8 w-24" placeholder="Marka" /></TableCell>
                  <TableCell><Input className="h-8 w-20" placeholder="Typ" /></TableCell>
                  <TableCell><Input className="h-8 w-24" placeholder="Marka" /></TableCell>
                  <TableCell><Input className="h-8 w-20" placeholder="205/55R16" /></TableCell>
                  <TableCell><Input className="h-8 w-16" type="number" placeholder="mm" /></TableCell>
                  <TableCell><Input className="h-8 w-20" placeholder="DOT" /></TableCell>
                  <TableCell>
                    <Select defaultValue="letnie">
                      <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="letnie">Letnie</SelectItem>
                        <SelectItem value="zimowe">Zimowe</SelectItem>
                        <SelectItem value="całoroczne">Całoroczne</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input className="h-8 w-12" type="number" defaultValue="4" /></TableCell>
                  <TableCell><Input className="h-8 w-24" placeholder="Uwagi" /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-4 text-muted-foreground">Brak danych</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Button variant="outline" size="sm" className="mt-2 gap-1" onClick={addItem}>
            <Plus className="h-4 w-4" /> Dodaj pozycję
          </Button>
        </div>

        {/* Tasks */}
        <div className="mt-6">
          <h3 className="font-semibold text-lg mb-3">Lista zadań</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>LP.</TableHead>
                <TableHead>NAZWA</TableHead>
                <TableHead className="text-right">CENA</TableHead>
                <TableHead>ZAKOŃCZONO</TableHead>
                <TableHead>DATA ZAKOŃCZENIA</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task, idx) => (
                <TableRow key={idx}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>{task.name}</TableCell>
                  <TableCell className="text-right">{task.price.toFixed(2)}</TableCell>
                  <TableCell><Switch /></TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-between items-center mt-2">
            <Button variant="outline" size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> Dodaj pozycję
            </Button>
            <span className="text-sm font-medium">Razem: 0.00</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button>Zapisz</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
