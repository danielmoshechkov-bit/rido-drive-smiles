import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWorkshopOrders } from '@/hooks/useWorkshop';
import { Plus, Search, Loader2, FileText, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  providerId: string;
  onBack: () => void;
}

export function WorkshopSales({ providerId, onBack }: Props) {
  const { data: orders = [], isLoading } = useWorkshopOrders(providerId, { completedOnly: true });
  const [search, setSearch] = useState('');

  // Generate virtual sales docs from completed orders
  const salesDocs = useMemo(() => {
    return orders
      .filter((o: any) => o.status_name === 'Zakończone' && o.total_gross > 0)
      .map((o: any, idx: number) => ({
        id: o.id,
        doc_number: `FS ${idx + 1}/${format(new Date(o.created_at), 'MM/yyyy')}`,
        client_name: o.client
          ? o.client.client_type === 'company'
            ? o.client.company_name
            : `${o.client.first_name || ''} ${o.client.last_name || ''}`.trim()
          : '',
        issue_date: o.completed_at || o.created_at,
        sale_date: o.completed_at || o.created_at,
        paid: o.total_gross || 0,
        to_pay: 0,
        total_gross: o.total_gross || 0,
        payment_method: 'Gotówka',
      }))
      .filter((d: any) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return d.doc_number.toLowerCase().includes(q) || d.client_name.toLowerCase().includes(q);
      });
  }, [orders, search]);

  const totalPaid = salesDocs.reduce((s, d) => s + d.paid, 0);
  const totalToPay = salesDocs.reduce((s, d) => s + d.to_pay, 0);
  const totalGross = salesDocs.reduce((s, d) => s + d.total_gross, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">Sprzedaż</h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Wystaw
        </Button>
        <Button variant="destructive" size="sm" className="gap-1" disabled>
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
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NUMER DOKUMENTU</TableHead>
                  <TableHead>KLIENT</TableHead>
                  <TableHead>DATA WYSTAWIENIA</TableHead>
                  <TableHead>DATA SPRZEDAŻY</TableHead>
                  <TableHead className="text-right">ZAPŁACONO</TableHead>
                  <TableHead className="text-right">DO ZAPŁATY</TableHead>
                  <TableHead className="text-right">RAZEM BRUTTO</TableHead>
                  <TableHead>METODA PŁA...</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesDocs.map((doc) => (
                  <TableRow key={doc.id} className="hover:bg-accent/50 cursor-pointer">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{doc.doc_number}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{doc.client_name}</TableCell>
                    <TableCell className="text-sm">{format(new Date(doc.issue_date), 'yyyy-MM-dd')}</TableCell>
                    <TableCell className="text-sm">{format(new Date(doc.sale_date), 'yyyy-MM-dd')}</TableCell>
                    <TableCell className="text-right font-medium">
                      {doc.paid.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${doc.to_pay > 0 ? 'text-destructive' : ''}`}>
                      {doc.to_pay.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {doc.total_gross.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-sm">{doc.payment_method}</TableCell>
                  </TableRow>
                ))}
                {salesDocs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Brak dokumentów sprzedaży
                    </TableCell>
                  </TableRow>
                )}
                {salesDocs.length > 0 && (
                  <TableRow className="font-semibold bg-muted/50">
                    <TableCell colSpan={4}>Suma</TableCell>
                    <TableCell className="text-right">
                      {totalPaid.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      {totalToPay.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      {totalGross.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        Od 1 do {salesDocs.length} z {salesDocs.length} wyników
      </div>
    </div>
  );
}
