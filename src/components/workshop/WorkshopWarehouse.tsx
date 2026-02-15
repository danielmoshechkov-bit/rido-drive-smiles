import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Plus, Search, FileText, Package, ClipboardList,
  Upload, Link2, Loader2, Trash2
} from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  providerId: string;
  onBack: () => void;
}

export function WorkshopWarehouse({ providerId, onBack }: Props) {
  const [activeTab, setActiveTab] = useState('dokumenty');
  const [search, setSearch] = useState('');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">Magazyn</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dokumenty" className="gap-1.5">
            <FileText className="h-4 w-4" /> Dokumenty
          </TabsTrigger>
          <TabsTrigger value="rezerwacje" className="gap-1.5">
            <ClipboardList className="h-4 w-4" /> Rezerwacje
          </TabsTrigger>
          <TabsTrigger value="inwentaryzacja" className="gap-1.5">
            <Package className="h-4 w-4" /> Inwentaryzacja
          </TabsTrigger>
          <TabsTrigger value="przyjecie" className="gap-1.5">
            <Upload className="h-4 w-4" /> Przyjęcie z pliku
          </TabsTrigger>
          <TabsTrigger value="integracje" className="gap-1.5">
            <Link2 className="h-4 w-4" /> Integracje z hurtowniami
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dokumenty">
          <WarehouseDocuments search={search} setSearch={setSearch} />
        </TabsContent>
        <TabsContent value="rezerwacje">
          <WarehouseReservations />
        </TabsContent>
        <TabsContent value="inwentaryzacja">
          <WarehouseInventoryCheck />
        </TabsContent>
        <TabsContent value="przyjecie">
          <WarehouseFileImport />
        </TabsContent>
        <TabsContent value="integracje">
          <WarehouseIntegrations />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WarehouseDocuments({ search, setSearch }: { search: string; setSearch: (v: string) => void }) {
  // Mock data - will be connected to DB
  const documents = [
    { id: '1', number: 'PZ 2/09/2025', ext_number: '', date: '2025-09-17', contractor: 'Brak danych', cost: 0, total_net: 33.33 },
    { id: '2', number: 'PZ 1/09/2025', ext_number: '', date: '2025-09-17', contractor: 'Brak danych', cost: 0, total_net: 18.71 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-2"><Plus className="h-4 w-4" /> Wystaw</Button>
        <Button variant="outline" className="gap-2 text-destructive"><Trash2 className="h-4 w-4" /> Usuń zaznaczone</Button>
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
                <TableHead>NUMER DOKUMENTU</TableHead>
                <TableHead>NUMER DOK. ZEWN.</TableHead>
                <TableHead>DATA WYSTAWIENIA</TableHead>
                <TableHead>KONTRAHENT</TableHead>
                <TableHead className="text-right">KOSZT</TableHead>
                <TableHead className="text-right">RAZEM NETTO</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map(doc => (
                <TableRow key={doc.id} className="cursor-pointer hover:bg-accent/50">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{doc.number}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{doc.ext_number || '—'}</TableCell>
                  <TableCell>{doc.date}</TableCell>
                  <TableCell className="text-muted-foreground italic">{doc.contractor}</TableCell>
                  <TableCell className="text-right">{doc.cost.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium">{doc.total_net.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Od 1 do {documents.length} z {documents.length} wyników</span>
      </div>
    </div>
  );
}

function WarehouseReservations() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button className="gap-2"><Plus className="h-4 w-4" /> Nowa rezerwacja</Button>
      </div>
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Brak rezerwacji części. Rezerwacje tworzone ze zleceń pojawią się tutaj.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function WarehouseInventoryCheck() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button className="gap-2"><Plus className="h-4 w-4" /> Rozpocznij inwentaryzację</Button>
      </div>
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Brak historii inwentaryzacji. Rozpocznij nową inwentaryzację aby porównać stany magazynowe.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function WarehouseFileImport() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-12 text-center">
          <Upload className="h-12 w-12 mx-auto mb-4 text-primary opacity-60" />
          <h3 className="font-semibold text-lg mb-2">Przyjęcie towaru z pliku</h3>
          <p className="text-muted-foreground mb-4">
            Wgraj plik CSV lub Excel z fakturą zakupową — system automatycznie rozpozna pozycje i doda je do magazynu.
          </p>
          <Button className="gap-2"><Upload className="h-4 w-4" /> Wybierz plik</Button>
          <p className="text-xs text-muted-foreground mt-4">
            Obsługiwane formaty: CSV, XLSX, PDF (OCR)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function WarehouseIntegrations() {
  const integrations = [
    { name: 'Inter Cars', status: 'inactive', logo: '🔧' },
    { name: 'Auto Partner', status: 'inactive', logo: '🔩' },
    { name: 'Hart', status: 'inactive', logo: '⚙️' },
    { name: 'Gordon', status: 'inactive', logo: '🛠️' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Połącz magazyn z hurtowniami aby automatycznie importować ceny, dostępność i składać zamówienia.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map(int => (
          <Card key={int.name}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{int.logo}</span>
                <div>
                  <p className="font-medium">{int.name}</p>
                  <Badge variant="outline" className="text-xs">Nieaktywna</Badge>
                </div>
              </div>
              <Button variant="outline" size="sm">Połącz</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
