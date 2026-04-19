import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Phone, Car, CheckCircle2, AlertTriangle, Calendar, Clock, Loader2, Coins } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface PortalBooking {
  id: string;
  booking_number: string;
  customer_name: string;
  customer_phone: string;
  scheduled_date: string;
  scheduled_time: string;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_plate: string | null;
  customer_notes: string | null;
  status: string;
  completion_status: string;
  estimated_price: number | null;
  final_amount: number | null;
  parts_margin: number | null;
  labor_amount: number | null;
  commission_amount: number | null;
  provider_confirmed_at: string | null;
  completed_at: string | null;
  service_id: string;
}

interface PortalBookingsPanelProps {
  providerId: string;
}

export function PortalBookingsPanel({ providerId }: PortalBookingsPanelProps) {
  const [bookings, setBookings] = useState<PortalBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<PortalBooking | null>(null);
  const [partsMargin, setPartsMargin] = useState('');
  const [laborAmount, setLaborAmount] = useState('');
  const [finalAmount, setFinalAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('service_bookings')
      .select('*')
      .eq('provider_id', providerId)
      .eq('source', 'portal')
      .order('scheduled_date', { ascending: false })
      .limit(100);
    setBookings((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { if (providerId) load(); }, [providerId]);

  const confirmBooking = async (b: PortalBooking) => {
    const { error } = await supabase
      .from('service_bookings')
      .update({
        status: 'confirmed',
        provider_confirmed_at: new Date().toISOString(),
      })
      .eq('id', b.id);
    if (error) { toast.error('Błąd potwierdzenia'); return; }
    toast.success('Rezerwacja potwierdzona — klient otrzyma SMS');
    supabase.functions.invoke('booking-notify', { body: { booking_id: b.id, type: 'confirmed' } }).catch(() => {});
    load();
  };

  const openComplete = (b: PortalBooking) => {
    setCompleting(b);
    setPartsMargin(b.parts_margin?.toString() || '0');
    setLaborAmount(b.labor_amount?.toString() || '0');
    setFinalAmount(b.final_amount?.toString() || b.estimated_price?.toString() || '');
  };

  const submitComplete = async () => {
    if (!completing) return;
    const margin = parseFloat(partsMargin) || 0;
    const labor = parseFloat(laborAmount) || 0;
    const total = parseFloat(finalAmount) || 0;
    const commissionBase = margin + labor;

    setSubmitting(true);
    try {
      // Pobierz aktywną prowizję
      const { data: comm } = await supabase.rpc('get_active_commission', { p_provider_id: providerId });
      const commissionRate = comm?.[0]?.commission_value ?? 10;
      const commissionType = comm?.[0]?.commission_type ?? 'percent_margin';

      let commissionAmount = 0;
      if (commissionType === 'flat_per_booking') commissionAmount = commissionRate;
      else if (commissionType === 'percent_total') commissionAmount = (total * commissionRate) / 100;
      else commissionAmount = (commissionBase * commissionRate) / 100;

      const { error } = await supabase
        .from('service_bookings')
        .update({
          completion_status: 'completed',
          status: 'completed',
          completed_at: new Date().toISOString(),
          final_amount: total,
          parts_margin: margin,
          labor_amount: labor,
          commission_base: commissionBase,
          commission_amount: Math.round(commissionAmount * 100) / 100,
          commission_rate: commissionRate,
        })
        .eq('id', completing.id);
      if (error) throw error;
      toast.success('Zlecenie zamknięte. Klient dostanie prośbę o ocenę za 24h.');
      setCompleting(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Błąd zamknięcia zlecenia');
    } finally {
      setSubmitting(false);
    }
  };

  // Podsumowanie miesiąca
  const thisMonth = bookings.filter(b => {
    const d = new Date(b.scheduled_date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthCommission = thisMonth.reduce((s, b) => s + (b.commission_amount || 0), 0);
  const monthValue = thisMonth.reduce((s, b) => s + (b.final_amount || 0), 0);

  if (loading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-primary" /> Zlecenia z portalu</CardTitle>
          <CardDescription>Klienci, którzy umówili się przez GetRido. Od tych zleceń pobieramy prowizję.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-muted rounded">
              <div className="text-2xl font-bold">{thisMonth.length}</div>
              <div className="text-xs text-muted-foreground">Zleceń w tym mc</div>
            </div>
            <div className="p-3 bg-muted rounded">
              <div className="text-2xl font-bold">{monthValue.toFixed(0)} zł</div>
              <div className="text-xs text-muted-foreground">Wartość zleceń</div>
            </div>
            <div className="p-3 bg-primary/10 rounded">
              <div className="text-2xl font-bold text-primary">{monthCommission.toFixed(2)} zł</div>
              <div className="text-xs text-muted-foreground">Prowizja portalu</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {bookings.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Brak zleceń z portalu.</CardContent></Card>
      ) : bookings.map(b => (
        <Card key={b.id} className={b.status === 'pending' ? 'border-yellow-400 border-2' : ''}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold">{b.customer_name}</span>
                  <Badge variant="outline" className="text-xs">{b.booking_number}</Badge>
                  {b.status === 'pending' && (
                    <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Wymaga potwierdzenia</Badge>
                  )}
                  {b.status === 'confirmed' && b.completion_status !== 'completed' && (
                    <Badge className="bg-blue-500">Potwierdzone</Badge>
                  )}
                  {b.completion_status === 'completed' && (
                    <Badge className="bg-green-600">Zakończone</Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(b.scheduled_date), 'dd MMM yyyy', { locale: pl })}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{b.scheduled_time?.substring(0, 5)}</span>
                  <a href={`tel:${b.customer_phone}`} className="flex items-center gap-1 text-primary hover:underline"><Phone className="h-3 w-3" />{b.customer_phone}</a>
                </div>
                {(b.vehicle_brand || b.vehicle_plate) && (
                  <div className="text-sm mt-1 flex items-center gap-1">
                    <Car className="h-3 w-3 text-muted-foreground" />
                    <span>{[b.vehicle_brand, b.vehicle_model, b.vehicle_year, b.vehicle_plate].filter(Boolean).join(' • ')}</span>
                  </div>
                )}
                {b.customer_notes && <p className="text-sm bg-muted/50 p-2 rounded mt-2">{b.customer_notes}</p>}
                {b.commission_amount != null && b.commission_amount > 0 && (
                  <div className="text-sm mt-2 text-primary font-medium">
                    Wartość: {b.final_amount?.toFixed(2)} zł • Prowizja: {b.commission_amount.toFixed(2)} zł
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {b.status === 'pending' && (
                  <Button size="sm" onClick={() => confirmBooking(b)} className="gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Potwierdź
                  </Button>
                )}
                {b.status === 'confirmed' && b.completion_status !== 'completed' && (
                  <Button size="sm" variant="outline" onClick={() => openComplete(b)}>Zakończ + kwota</Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!completing} onOpenChange={(o) => !o && setCompleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zamknij zlecenie {completing?.booking_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Marża na częściach (zł)</Label>
              <Input value={partsMargin} onChange={(e) => setPartsMargin(e.target.value)} type="number" />
              <p className="text-xs text-muted-foreground mt-1">Cena sprzedaży części minus koszt zakupu.</p>
            </div>
            <div>
              <Label>Robocizna (zł)</Label>
              <Input value={laborAmount} onChange={(e) => setLaborAmount(e.target.value)} type="number" />
            </div>
            <div>
              <Label>Finalna kwota brutto klientowi (zł)</Label>
              <Input value={finalAmount} onChange={(e) => setFinalAmount(e.target.value)} type="number" />
            </div>
            <div className="bg-primary/5 p-3 rounded text-sm">
              Prowizja portalu zostanie naliczona od podstawy: <b>{((parseFloat(partsMargin) || 0) + (parseFloat(laborAmount) || 0)).toFixed(2)} zł</b>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleting(null)}>Anuluj</Button>
            <Button onClick={submitComplete} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Zamknij zlecenie
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
