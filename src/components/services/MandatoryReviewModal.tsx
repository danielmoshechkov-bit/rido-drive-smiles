import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Star, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PendingReview {
  id: string;
  booking_id: string;
  provider_id: string;
  service_providers?: { company_name: string; short_name: string | null };
  service_bookings?: { booking_number: string; scheduled_date: string };
}

interface MandatoryReviewModalProps {
  open: boolean;
  onResolved?: () => void;
}

function StarRating({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div>
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-1 mt-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="transition-transform hover:scale-110"
          >
            <Star className={`h-7 w-7 ${n <= value ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function MandatoryReviewModal({ open, onResolved }: MandatoryReviewModalProps) {
  const [pending, setPending] = useState<PendingReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [ratingTime, setRatingTime] = useState(0);
  const [ratingQuality, setRatingQuality] = useState(0);
  const [ratingPrice, setRatingPrice] = useState(0);
  const [comment, setComment] = useState('');
  const [finalCost, setFinalCost] = useState('');

  useEffect(() => {
    if (open) loadPending();
  }, [open]);

  const loadPending = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('pending_service_reviews')
      .select(`
        id, booking_id, provider_id,
        service_providers(company_name, short_name),
        service_bookings(booking_number, scheduled_date)
      `)
      .eq('user_id', user.id)
      .is('resolved_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    setPending(data as any);
  };

  const handleSubmit = async () => {
    if (!pending) return;
    if (!ratingTime || !ratingQuality || !ratingPrice) {
      toast.error('Oceń wszystkie 3 kryteria');
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie zalogowano');

      const avg = Math.round((ratingTime + ratingQuality + ratingPrice) / 3);
      const { error: revErr } = await supabase.from('service_reviews').insert([{
        booking_id: pending.booking_id,
        provider_id: pending.provider_id,
        customer_user_id: user.id,
        rating: avg,
        rating_time: ratingTime,
        rating_quality: ratingQuality,
        rating_price: ratingPrice,
        comment: comment || null,
        final_cost_reported: finalCost ? parseFloat(finalCost) : null,
        is_visible: true,
      }]);
      if (revErr) throw revErr;

      const { error: pendErr } = await supabase
        .from('pending_service_reviews')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', pending.id);
      if (pendErr) throw pendErr;

      toast.success('Dziękujemy za ocenę!');
      setRatingTime(0); setRatingQuality(0); setRatingPrice(0);
      setComment(''); setFinalCost('');
      onResolved?.();
      loadPending();
    } catch (e: any) {
      toast.error(e.message || 'Błąd zapisu opinii');
    } finally {
      setLoading(false);
    }
  };

  if (!pending) return null;

  return (
    <Dialog open={open} onOpenChange={() => { /* cannot dismiss */ }}>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Oceń poprzednią usługę</DialogTitle>
          <DialogDescription>
            {pending.service_providers?.short_name || pending.service_providers?.company_name} – rezerwacja {pending.service_bookings?.booking_number}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Aby umówić kolejną wizytę, oceń tę usługę. Twoja opinia pomaga innym i utrzymuje wysoką jakość portalu.
          </p>
          <StarRating value={ratingTime} onChange={setRatingTime} label="Czas realizacji" />
          <StarRating value={ratingQuality} onChange={setRatingQuality} label="Jakość wykonania" />
          <StarRating value={ratingPrice} onChange={setRatingPrice} label="Cena" />
          <div>
            <Label className="text-sm">Komentarz (opcjonalnie)</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
          </div>
          <div>
            <Label className="text-sm">Finalna kwota usługi (opcjonalnie, w zł)</Label>
            <Input value={finalCost} onChange={(e) => setFinalCost(e.target.value)} type="number" placeholder="np. 450" />
            <p className="text-xs text-muted-foreground mt-1">Pomaga nam weryfikować rzetelność cen u usługodawcy.</p>
          </div>
          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Wyślij ocenę
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
