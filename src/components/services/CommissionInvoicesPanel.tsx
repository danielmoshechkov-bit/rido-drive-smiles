import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface CommissionInvoice {
  id: string;
  invoice_number: string | null;
  period_year: number;
  period_month: number;
  bookings_count: number;
  total_value: number;
  total_commission: number;
  status: string;
  pdf_url: string | null;
  paid_at: string | null;
  created_at: string;
}

interface Props { providerId: string }

export function CommissionInvoicesPanel({ providerId }: Props) {
  const [items, setItems] = useState<CommissionInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!providerId) return;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from('service_commission_invoices')
        .select('*')
        .eq('provider_id', providerId)
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false });
      setItems(data || []);
      setLoading(false);
    })();
  }, [providerId]);

  if (loading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;

  const monthName = (y: number, m: number) => format(new Date(y, m - 1, 1), 'LLLL yyyy', { locale: pl });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Faktury prowizyjne</CardTitle>
          <CardDescription>
            Faktury prowizyjne generowane automatycznie 1. dnia każdego miesiąca za zlecenia z portalu z poprzedniego miesiąca.
          </CardDescription>
        </CardHeader>
      </Card>

      {items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Brak faktur prowizyjnych. Pierwsza faktura zostanie wygenerowana 1. dnia kolejnego miesiąca.
        </CardContent></Card>
      ) : items.map(inv => (
        <Card key={inv.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold capitalize">{monthName(inv.period_year, inv.period_month)}</span>
                  {inv.invoice_number && <Badge variant="outline">{inv.invoice_number}</Badge>}
                  {inv.status === 'paid' ? (
                    <Badge className="bg-green-600">Opłacona</Badge>
                  ) : inv.status === 'sent' ? (
                    <Badge className="bg-blue-500">Do zapłaty</Badge>
                  ) : (
                    <Badge variant="secondary">Wystawiona</Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {inv.bookings_count} zleceń • Wartość: {Number(inv.total_value).toFixed(2)}{'\u00A0'}zł
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">{Number(inv.total_commission).toFixed(2)}{'\u00A0'}zł</div>
                <div className="text-xs text-muted-foreground">prowizja</div>
              </div>
              {inv.pdf_url && (
                <Button size="sm" variant="outline" asChild>
                  <a href={inv.pdf_url} target="_blank" rel="noreferrer"><Download className="h-4 w-4 mr-1" /> PDF</a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
