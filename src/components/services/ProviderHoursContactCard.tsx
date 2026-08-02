import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Clock, Phone, Save, Loader2, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Kolejność jak w kalendarzu: poniedziałek → niedziela. day_of_week zgodny z Date.getDay().
const DAYS = [
  { dow: 1, label: 'Poniedziałek' },
  { dow: 2, label: 'Wtorek' },
  { dow: 3, label: 'Środa' },
  { dow: 4, label: 'Czwartek' },
  { dow: 5, label: 'Piątek' },
  { dow: 6, label: 'Sobota' },
  { dow: 0, label: 'Niedziela' },
];

interface DayHours { open: boolean; from: string; to: string }
interface Contact {
  company_phone: string; company_email: string; company_address: string;
  company_city: string; company_postal_code: string; company_website: string;
}

const EMPTY_CONTACT: Contact = {
  company_phone: '', company_email: '', company_address: '',
  company_city: '', company_postal_code: '', company_website: '',
};

const defaultDay = (): DayHours => ({ open: true, from: '09:00', to: '17:00' });
const hhmm = (t: string | null | undefined, fallback: string) => (t ? String(t).slice(0, 5) : fallback);

/**
 * Godziny pracy i dane kontaktowe w zakładce „Moje usługi".
 * To te same rekordy co w Ustawieniach — zapis idzie do service_working_hours
 * (źródło dla rezerwacji i agenta) oraz do workshop_settings, żeby kalendarz
 * warsztatu i portal usług nie rozjechały się między sobą.
 */
export function ProviderHoursContactCard({ providerId }: { providerId: string | null }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hours, setHours] = useState<Record<number, DayHours>>({});
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!providerId) return;
    (async () => {
      setLoading(true);
      const [{ data: provider }, { data: swh }] = await Promise.all([
        (supabase as any).from('service_providers')
          .select('company_phone, company_email, company_address, company_city, company_postal_code, company_website, user_id')
          .eq('id', providerId).maybeSingle(),
        (supabase as any).from('service_working_hours')
          .select('day_of_week, start_time, end_time, is_working')
          .eq('provider_id', providerId).is('employee_id', null),
      ]);

      if (provider) {
        setUserId(provider.user_id ?? null);
        setContact({
          company_phone: provider.company_phone || '',
          company_email: provider.company_email || '',
          company_address: provider.company_address || '',
          company_city: provider.company_city || '',
          company_postal_code: provider.company_postal_code || '',
          company_website: provider.company_website || '',
        });
      }

      const map: Record<number, DayHours> = {};
      for (const row of swh || []) {
        map[Number(row.day_of_week)] = {
          open: row.is_working !== false,
          from: hhmm(row.start_time, '09:00'),
          to: hhmm(row.end_time, '17:00'),
        };
      }

      // Brak godzin w portalu — spróbuj przenieść je z ustawień warsztatu.
      if (Object.keys(map).length === 0 && provider?.user_id) {
        const { data: ws } = await (supabase as any)
          .from('workshop_settings').select('working_hours').eq('user_id', provider.user_id).maybeSingle();
        if (Array.isArray(ws?.working_hours)) {
          ws.working_hours.forEach((d: any, idx: number) => {
            map[idx === 6 ? 0 : idx + 1] = {
              open: !!d?.open, from: d?.from || '09:00', to: d?.to || '17:00',
            };
          });
        }
      }

      for (const d of DAYS) if (!map[d.dow]) map[d.dow] = { ...defaultDay(), open: d.dow !== 0 };
      setHours(map);
      setLoading(false);
    })();
  }, [providerId]);

  const setDay = (dow: number, patch: Partial<DayHours>) =>
    setHours((h) => ({ ...h, [dow]: { ...h[dow], ...patch } }));

  const copyToAll = () => {
    const monday = hours[1];
    if (!monday) return;
    setHours((h) => {
      const next = { ...h };
      for (const d of DAYS) if (d.dow !== 0) next[d.dow] = { ...monday };
      return next;
    });
    toast.success('Skopiowano godziny z poniedziałku na dni robocze');
  };

  const save = async () => {
    if (!providerId) return;
    setSaving(true);
    try {
      const { error: cErr } = await (supabase as any)
        .from('service_providers').update(contact).eq('id', providerId);
      if (cErr) throw cErr;

      await (supabase as any).from('service_working_hours')
        .delete().eq('provider_id', providerId).is('employee_id', null);
      const rows = DAYS.map((d) => ({
        provider_id: providerId,
        day_of_week: d.dow,
        start_time: hours[d.dow].from + ':00',
        end_time: hours[d.dow].to + ':00',
        is_working: hours[d.dow].open,
      }));
      const { error: hErr } = await (supabase as any).from('service_working_hours').insert(rows);
      if (hErr) throw hErr;

      // Ustawienia warsztatu trzymają [Pon…Nd] — dopisujemy tylko, gdy taki wiersz istnieje.
      if (userId) {
        const { data: ws } = await (supabase as any)
          .from('workshop_settings').select('id').eq('user_id', userId).maybeSingle();
        if (ws?.id) {
          const arr = [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
            open: hours[dow].open, from: hours[dow].from, to: hours[dow].to,
          }));
          await (supabase as any).from('workshop_settings').update({ working_hours: arr }).eq('id', ws.id);
        }
      }

      qc.invalidateQueries({ queryKey: ['provider-offer', providerId] });
      toast.success('Zapisano godziny i dane kontaktowe');
    } catch (e: any) {
      toast.error('Błąd zapisu: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!providerId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-5 w-5 text-primary" /> Godziny pracy i kontakt
        </CardTitle>
        <CardDescription>
          To te same dane co w Ustawieniach — zmienisz tu, zmieni się i tam. Z nich korzystają rezerwacje, karta w portalu i agent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Godziny otwarcia</Label>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={copyToAll}>
                  <Copy className="h-3.5 w-3.5" /> Jak w poniedziałek
                </Button>
              </div>
              <div className="rounded-lg border divide-y">
                {DAYS.map((d) => (
                  <div key={d.dow} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-28 text-sm">{d.label}</span>
                    <Switch checked={hours[d.dow]?.open ?? false} onCheckedChange={(v) => setDay(d.dow, { open: v })} />
                    {hours[d.dow]?.open ? (
                      <div className="flex items-center gap-2">
                        <Input type="time" className="h-8 w-28" value={hours[d.dow].from} onChange={(e) => setDay(d.dow, { from: e.target.value })} />
                        <span className="text-muted-foreground">–</span>
                        <Input type="time" className="h-8 w-28" value={hours[d.dow].to} onChange={(e) => setDay(d.dow, { to: e.target.value })} />
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">nieczynne</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2"><Phone className="h-4 w-4 text-primary" /> Dane kontaktowe</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Telefon</Label>
                  <Input value={contact.company_phone} onChange={(e) => setContact((c) => ({ ...c, company_phone: e.target.value }))} placeholder="np. 796 386 382" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">E-mail</Label>
                  <Input value={contact.company_email} onChange={(e) => setContact((c) => ({ ...c, company_email: e.target.value }))} placeholder="np. kontakt@firma.pl" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ulica i numer</Label>
                  <Input value={contact.company_address} onChange={(e) => setContact((c) => ({ ...c, company_address: e.target.value }))} placeholder="np. ul. Borsucza 13" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Miasto</Label>
                  <Input value={contact.company_city} onChange={(e) => setContact((c) => ({ ...c, company_city: e.target.value }))} placeholder="np. Warszawa" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Kod pocztowy</Label>
                  <Input value={contact.company_postal_code} onChange={(e) => setContact((c) => ({ ...c, company_postal_code: e.target.value }))} placeholder="np. 02-213" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Strona www</Label>
                  <Input value={contact.company_website} onChange={(e) => setContact((c) => ({ ...c, company_website: e.target.value }))} placeholder="np. c78g.pl" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Telefon, e-mail i dokładny adres widzą na karcie tylko zalogowani klienci.
              </p>
            </div>

            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Zapisz
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
