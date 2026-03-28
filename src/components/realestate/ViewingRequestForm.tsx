import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, Clock, Plus, Trash2, Send, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface ViewingRequestFormProps {
  listingIds?: string[];
  listingTitles?: string[];
  onSuccess?: () => void;
}

export function ViewingRequestForm({ listingIds = [], listingTitles = [], onSuccess }: ViewingRequestFormProps) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    client_name: '',
    client_email: '',
    client_phone: '',
    client_start_address: '',
    prefer_one_day: true,
    viewing_duration_minutes: 60,
  });
  const [dates, setDates] = useState<Array<{ date: Date | undefined; time_from: string; time_to: string }>>([
    { date: undefined, time_from: '10:00', time_to: '18:00' },
  ]);

  // Auto-fill user data
  useEffect(() => {
    const fillUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setForm(p => ({
          ...p,
          client_name: user.user_metadata?.full_name || p.client_name,
          client_email: user.email || p.client_email,
          client_phone: user.user_metadata?.phone || p.client_phone,
        }));
      }
    };
    fillUser();
  }, []);

  const addDate = () => {
    setDates(prev => [...prev, { date: undefined, time_from: '10:00', time_to: '18:00' }]);
  };

  const removeDate = (idx: number) => {
    setDates(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!form.client_name || !form.client_phone) {
      toast.error('Podaj imię i telefon');
      return;
    }
    if (dates.every(d => !d.date)) {
      toast.error('Wybierz przynajmniej jeden termin');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Musisz być zalogowany');
        setLoading(false);
        return;
      }

      const requestId = crypto.randomUUID();
      const formattedDates = dates
        .filter(d => d.date)
        .map(d => ({
          date: format(d.date!, 'yyyy-MM-dd'),
          time_from: d.time_from,
          time_to: d.time_to,
        }));
      
      const { error } = await supabase.from('viewing_requests' as any).insert({
        id: requestId,
        client_id: user.id,
        client_name: form.client_name,
        client_email: form.client_email,
        client_phone: form.client_phone,
        client_start_address: form.client_start_address,
        listing_ids: listingIds,
        preferred_dates: formattedDates,
        viewing_duration_minutes: form.viewing_duration_minutes,
        prefer_one_day: form.prefer_one_day,
        status: 'pending',
      } as any);

      if (error) throw error;

      // Auto-trigger agent contact flow
      try {
        await supabase.functions.invoke('schedule-viewings', {
          body: { action: 'process_new_request', request_id: requestId },
        });
      } catch (fnErr) {
        console.error('Edge function error:', fnErr);
      }

      toast.success('Zgłoszenie wysłane! Kontaktujemy się z agentami.');
      onSuccess?.();
    } catch (err: any) {
      console.error('Viewing request error:', err);
      toast.error('Błąd: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* Selected listings */}
      {listingTitles.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Wybrane nieruchomości:</Label>
          <div className="flex flex-wrap gap-1">
            {listingTitles.map((t, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Imię i nazwisko *</Label>
          <Input
            value={form.client_name}
            onChange={(e) => setForm(p => ({ ...p, client_name: e.target.value }))}
            placeholder="Jan Kowalski"
          />
        </div>
        <div className="space-y-2">
          <Label>Telefon *</Label>
          <Input
            value={form.client_phone}
            onChange={(e) => setForm(p => ({ ...p, client_phone: e.target.value }))}
            placeholder="+48 123 456 789"
          />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            value={form.client_email}
            onChange={(e) => setForm(p => ({ ...p, client_email: e.target.value }))}
            placeholder="jan@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label>Adres startowy (opcjonalnie)</Label>
          <Input
            value={form.client_start_address}
            onChange={(e) => setForm(p => ({ ...p, client_start_address: e.target.value }))}
            placeholder="Skąd wyjeżdżasz?"
          />
        </div>
      </div>

      {/* Preferred dates with Calendar */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-primary" />
          Preferowane terminy
        </Label>
        {dates.map((d, idx) => (
          <div key={idx} className="flex items-center gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[180px] justify-start text-left font-normal",
                    !d.date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {d.date ? format(d.date, 'dd.MM.yyyy', { locale: pl }) : 'Wybierz datę'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={d.date}
                  onSelect={(date) => {
                    const updated = [...dates];
                    updated[idx].date = date;
                    setDates(updated);
                  }}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Input
              type="time"
              value={d.time_from}
              onChange={(e) => {
                const updated = [...dates];
                updated[idx].time_from = e.target.value;
                setDates(updated);
              }}
              className="w-28"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="time"
              value={d.time_to}
              onChange={(e) => {
                const updated = [...dates];
                updated[idx].time_to = e.target.value;
                setDates(updated);
              }}
              className="w-28"
            />
            {dates.length > 1 && (
              <Button variant="ghost" size="icon" onClick={() => removeDate(idx)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addDate} className="gap-1">
          <Plus className="h-3 w-3" /> Dodaj termin
        </Button>
      </div>

      {/* Options */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={form.prefer_one_day}
            onCheckedChange={(v) => setForm(p => ({ ...p, prefer_one_day: v }))}
          />
          <Label className="text-sm">Preferuję wszystko w jednym dniu</Label>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm">Czas oglądania:</Label>
          <Input
            type="number"
            value={form.viewing_duration_minutes}
            onChange={(e) => setForm(p => ({ ...p, viewing_duration_minutes: parseInt(e.target.value) || 60 }))}
            className="w-20"
            min={15}
            max={180}
            step={15}
          />
          <span className="text-sm text-muted-foreground">min</span>
        </div>
      </div>

      <Button onClick={handleSubmit} disabled={loading} className="w-full gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Wyślij zgłoszenie
      </Button>
    </div>
  );
}
