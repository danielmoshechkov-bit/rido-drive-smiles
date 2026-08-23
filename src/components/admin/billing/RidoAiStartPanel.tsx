import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useBillingPlans } from '@/hooks/useBillingPlans';

/**
 * Ile zapytan Rido AI warsztat dostaje JEDNORAZOWO przy pierwszym wejsciu w plan.
 * Nie jest to limit miesieczny — miesiecznego nie ma. Po wyczerpaniu puli
 * warsztat dokupuje pakiet.
 */
export function RidoAiStartPanel() {
  const { plans, loading, update } = useBillingPlans();
  const [wartosci, setWartosci] = useState<Record<string, string>>({});
  const [zapisywany, setZapisywany] = useState<string | null>(null);

  useEffect(() => {
    // Nie nadpisujemy tego, co administrator wlasnie wpisuje — uzupelniamy
    // wylacznie pola jeszcze nietkniete.
    setWartosci((biezace) => {
      const kolejne = { ...biezace };
      for (const plan of plans) {
        if (kolejne[plan.id] === undefined) {
          kolejne[plan.id] = String(plan.rido_ai_start_ile ?? 0);
        }
      }
      return kolejne;
    });
  }, [plans]);

  const zapisz = async (planId: string) => {
    const surowe = (wartosci[planId] ?? '').trim();
    const ile = Number(surowe);
    if (surowe === '' || !Number.isFinite(ile) || ile < 0 || !Number.isInteger(ile)) {
      toast.error('Podaj liczbe calkowita, zero lub wiecej');
      return;
    }
    setZapisywany(planId);
    try {
      // `update` samo zglasza wynik uzytkownikowi (sukces i blad) — nie
      // dokladamy drugiego komunikatu o tym samym.
      await update.mutateAsync({ id: planId, rido_ai_start_ile: ile } as never);
    } catch {
      // komunikat pokazal juz hook
    } finally {
      setZapisywany(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const widoczne = plans.filter((p) => p.is_active);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Pula startowa Rido AI
        </CardTitle>
        <CardDescription>
          Ile zapytan warsztat dostaje <strong>jednorazowo</strong> przy pierwszym wejsciu w dany
          plan. Nie odnawia sie co miesiac — po wyczerpaniu warsztat dokupuje pakiet.
          Zero oznacza, ze plan nie daje nic na start.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Kod</TableHead>
              <TableHead className="w-[160px]">Zapytan na start</TableHead>
              <TableHead className="w-[120px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {widoczne.map((plan) => {
              const zmienione = (wartosci[plan.id] ?? '') !== String(plan.rido_ai_start_ile ?? 0);
              return (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{plan.code}</Badge>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={wartosci[plan.id] ?? ''}
                      onChange={(e) =>
                        setWartosci((b) => ({ ...b, [plan.id]: e.target.value }))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={zmienione ? 'default' : 'outline'}
                      disabled={!zmienione || zapisywany === plan.id}
                      onClick={() => zapisz(plan.id)}
                    >
                      {zapisywany === plan.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <><Save className="h-4 w-4 mr-1" /> Zapisz</>}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
