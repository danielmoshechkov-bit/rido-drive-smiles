import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Calendar, Clock, MapPin, Plus, Trash2, Send, Loader2 } from 'lucide-react';

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
  const [dates, setDates] = useState<Array<{ date: string; time_from: string; time_to: string }>>([
    { date: '', time_from: '10:00', time_to: '18:00' },
  ]);

  const addDate = () => {
    setDates(prev => [...prev, { date: '', time_from: '10:00', time_to: '18:00' }]);
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
      
      const { error } = await supabase.from('viewing_requests' as any).insert({
        client_id: user?.id,
        client_name: form.client_name,
        client_email: form.client_email,
        client_phone: form.client_phone,
        client_start_address: form.client_start_address,
        listing_ids: listingIds,
        preferred_dates: dates.filter(d => d.date),
        viewing_duration_minutes: form.viewing_duration_minutes,
        prefer_one_day: form.prefer_one_day,
        status: 'pending',
      } as any);

      if (error) throw error;
      toast.success('Zgłoszenie wysłane! Skontaktujemy się z agentami.');
      onSuccess?.();
    } catch (err: any) {
      toast.error('Błąd: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Umów oglądanie
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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

        {/* Preferred dates */}
        <div className="space-y-2">
          <Label>Preferowane terminy</Label>
          {dates.map((d, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                type="date"
                value={d.date}
                onChange={(e) => {
                  const updated = [...dates];
                  updated[idx].date = e.target.value;
                  setDates(updated);
                }}
                className="flex-1"
              />
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
        <div className="flex items-center justify-between">
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
      </CardContent>
    </Card>
  );
}
