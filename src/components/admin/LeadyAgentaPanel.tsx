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
  imie: string | null;
  telefon: string | null;
  zrodlo: string;
  zgoda_telefon: boolean;
  status: string;
  notatka: string | null;
  obsluzony_at: string | null;
  utworzony_at: string;
}



export function LeadyAgentaPanel() {
  const qc = useQueryClient();
  const [zapisywany, setZapisywany] = useState<string | null>(null);

  const { data: leady = [], isLoading } = useQuery({
    queryKey: ['leady-agenta'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('leady')
        .select('id, imie, telefon, zrodlo, zgoda_telefon, status, notatka, obsluzony_at, utworzony_at')
        .order('utworzony_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const oznacz = async (lead: Lead) => {
    setZapisywany(lead.id);
    try {
      const { error } = await (supabase as any)
        .from('leady')
        .update({ obsluzony_at: new Date().toISOString(), status: 'oddzwonilismy' })
        .eq('id', lead.id);
      if (error) { toast.error('Nie udało się zapisać'); return; }
      await qc.invalidateQueries({ queryKey: ['leady-agenta'] });
    } finally {
      setZapisywany(null);
    }
  };

  const doOddzwonienia = leady.filter((l) => !l.obsluzony_at && l.zgoda_telefon).length;

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
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(l.utworzony_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}
                      </TableCell>
                      <TableCell className="font-medium">{l.imie || '—'}</TableCell>
                      <TableCell className="tabular-nums">{l.zgoda_telefon ? (l.telefon || '—') : '—'}</TableCell>
                      <TableCell>
                        {l.zgoda_telefon ? (
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
                        {l.obsluzony_at ? (
                          <span className="text-sm text-muted-foreground">
                            {new Date(l.obsluzony_at).toLocaleDateString('pl-PL')}
                          </span>
                        ) : l.zgoda_telefon ? (
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
