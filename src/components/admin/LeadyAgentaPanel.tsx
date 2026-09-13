import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PhoneOff, PhoneCall, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Kontakty ze strony `/ai-agent` — kto poprosił o numer demonstracyjny.
 *
 * To jest narzędzie sprzedażowe, nie raport: ma odpowiadać na pytanie „do kogo
 * jeszcze nie oddzwoniliśmy". Stąd sortowanie po dacie i jeden przycisk.
 *
 * ⚠️ ZGODA NA TELEFON JEST OSOBNA OD ZGODY NA DANE. Kto zostawił kontakt, ale
 * nie zaznaczył zgody telefonicznej, ma tu czerwone „nie dzwonić" — i to jest
 * WIĄŻĄCE. Oddzwonienie bez tej zgody jest naruszeniem, a nie drobiazgiem.
 */
interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  message: string | null;
  status: string | null;
  contacted_at: string | null;
  created_at: string;
}

const czytajZgody = (message: string | null) => {
  try {
    const m = JSON.parse(message ?? '{}');
    return {
      telefon: m?.zgoda_telefon?.udzielona === true,
      kiedy: m?.kiedy as string | undefined,
    };
  } catch {
    return { telefon: false, kiedy: undefined };
  }
};

export function LeadyAgentaPanel() {
  const qc = useQueryClient();
  const [zapisywany, setZapisywany] = useState<string | null>(null);

  const { data: leady = [], isLoading } = useQuery({
    queryKey: ['leady-agenta'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('marketing_leads')
        .select('id, name, phone, message, status, contacted_at, created_at')
        .eq('source_platform', 'demo-agenta')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const oznacz = async (lead: Lead) => {
    setZapisywany(lead.id);
    try {
      const { error } = await (supabase as any)
        .from('marketing_leads')
        .update({ contacted_at: new Date().toISOString(), status: 'contacted' })
        .eq('id', lead.id);
      if (error) { toast.error('Nie udało się zapisać'); return; }
      await qc.invalidateQueries({ queryKey: ['leady-agenta'] });
    } finally {
      setZapisywany(null);
    }
  };

  const doOddzwonienia = leady.filter((l) => !l.contacted_at && czytajZgody(l.message).telefon).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kontakty z demo asystentki</CardTitle>
        <CardDescription>
          Kto zostawił numer na stronie <code>/ai-agent</code>, żeby posłuchać demonstracji.
          {doOddzwonienia > 0 && <> Do oddzwonienia: <strong>{doOddzwonienia}</strong>.</>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : leady.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Jeszcze nikt nie zostawił kontaktu.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kiedy</TableHead>
                  <TableHead>Imię</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Zgoda na telefon</TableHead>
                  <TableHead>Oddzwoniliśmy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leady.map((l) => {
                  const zgody = czytajZgody(l.message);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(l.created_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}
                      </TableCell>
                      <TableCell className="font-medium">{l.name || '—'}</TableCell>
                      <TableCell className="tabular-nums">{zgody.telefon ? (l.phone || '—') : '—'}</TableCell>
                      <TableCell>
                        {zgody.telefon ? (
                          <Badge variant="outline" className="border-emerald-500 text-emerald-600 gap-1">
                            <PhoneCall className="h-3 w-3" /> można dzwonić
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-destructive text-destructive gap-1">
                            <PhoneOff className="h-3 w-3" /> NIE DZWONIĆ
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {l.contacted_at ? (
                          <span className="text-sm text-muted-foreground">
                            {new Date(l.contacted_at).toLocaleDateString('pl-PL')}
                          </span>
                        ) : zgody.telefon ? (
                          <Button size="sm" variant="outline" disabled={zapisywany === l.id} onClick={() => oznacz(l)}>
                            {zapisywany === l.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                            Oznacz
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
