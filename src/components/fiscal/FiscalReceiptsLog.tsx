/**
 * Log paragonów fiskalnych — lista z numerem z drukarki, kwotą, statusem i formą płatności.
 * Tabela jest niemodyfikowalna (RLS dopuszcza tylko SELECT/INSERT) — to widok czysto audytowy.
 */

import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Receipt } from 'lucide-react';
import { useFiscalReceipts } from '@/hooks/useFiscal';
import { formatPln, RECEIPT_STATUS_LABELS } from '@/lib/fiscal';

interface Props {
  providerId?: string;
  documentId?: string;
  limit?: number;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  printed: 'default',
  failed: 'destructive',
  printing: 'secondary',
  pending: 'outline',
  cancelled: 'outline',
};

export function FiscalReceiptsLog({ providerId, documentId, limit = 50 }: Props) {
  const { data: receipts = [], isLoading } = useFiscalReceipts(providerId, documentId, limit);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie paragonów…
      </div>
    );
  }

  if (!receipts.length) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
        Brak wydrukowanych paragonów.
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Nr paragonu</TableHead>
            <TableHead>Kwota</TableHead>
            <TableHead>Płatność</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Uwagi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {receipts.map((receipt) => {
            const when = receipt.printed_at || receipt.created_at;
            const payments = Array.isArray(receipt.payments) ? receipt.payments : [];
            return (
              <TableRow key={receipt.id}>
                <TableCell className="whitespace-nowrap">
                  {new Date(when).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}
                </TableCell>
                <TableCell className="whitespace-nowrap font-medium">
                  {receipt.printer_receipt_number ?? '—'}
                  {receipt.printer_mode === 'training' && (
                    <Badge variant="outline" className="ml-2 text-[10px]">szkoleniowy</Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatPln(receipt.total_grosze)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {payments.map((p) => p.name).join(', ') || '—'}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[receipt.status] ?? 'outline'}>
                    {RECEIPT_STATUS_LABELS[receipt.status] ?? receipt.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[280px]">
                  {receipt.error_message ? (
                    <span className="text-destructive">{receipt.error_message}</span>
                  ) : (
                    receipt.document_type
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
