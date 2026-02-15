import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWorkshopClients } from '@/hooks/useWorkshop';
import { WorkshopAddClientDialog } from './WorkshopAddClientDialog';
import { Plus, Search, ArrowLeft, Loader2, Users, Building, User, Phone, Mail } from 'lucide-react';

interface Props {
  providerId: string;
  onBack: () => void;
}

export function WorkshopClientsList({ providerId, onBack }: Props) {
  const { data: clients = [], isLoading } = useWorkshopClients(providerId);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter((c: any) => {
      const name = c.client_type === 'company'
        ? (c.company_name || '')
        : `${c.first_name || ''} ${c.last_name || ''}`;
      return name.toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.nip || '').includes(q);
    });
  }, [clients, search]);

  const getClientName = (c: any) => {
    if (c.client_type === 'company') {
      return c.company_name || 'Brak danych';
    }
    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
    return name || 'Brak danych';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">Klienci</h2>
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
                  <TableHead>ZGODA MARKETINGOWA</TableHead>
                  <TableHead>DANE KLIENTA</TableHead>
                  <TableHead>E-MAIL</TableHead>
                  <TableHead>NUMER TELEFONU</TableHead>
                  <TableHead>GRUPA CENOWA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c: any) => (
                  <TableRow key={c.id} className="hover:bg-accent/50">
                    <TableCell>
                      <Badge variant={c.marketing_consent ? 'default' : 'secondary'} className="text-xs">
                        {c.marketing_consent ? 'Tak' : 'Nie'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {c.client_type === 'company' ? (
                          <Building className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <User className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{getClientName(c)}</span>
                        {c.nip && <span className="text-xs text-muted-foreground">NIP: {c.nip}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.email && (
                        <div className="flex items-center gap-1.5 text-sm">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          {c.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.phone && (
                        <div className="flex items-center gap-1.5 text-sm">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          {c.phone}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">Domyślna</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Brak klientów
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        Od 1 do {filtered.length} z {clients.length} wyników
      </div>

      <WorkshopAddClientDialog open={showAdd} onOpenChange={setShowAdd} providerId={providerId} />
    </div>
  );
}
