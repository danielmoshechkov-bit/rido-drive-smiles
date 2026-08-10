import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Layers, Loader2, Plus, Save, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import {
  useBillingPlans, PRODUCT_LINE_LABEL, type BillingPlan, type ProductLine,
} from '@/hooks/useBillingPlans';
import { useBillingFeatures } from '@/hooks/useBillingFeatures';

type Draft = Partial<BillingPlan>;

const EMPTY: Draft = {
  code: '', name: '', description: '', price_net: 0, price_net_target: null, vat_rate: 23,
  product_line: 'other', billing_interval: 'month', trial_days: 0,
  is_custom: false, is_active: true, sort_order: 999,
};

/** Pusty ciąg z inputa to „brak wartości", nie zero — zero jest świadomym limitem. */
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));
const strOf = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

/** Podgląd brutto w formularzu — w bazie liczy to kolumna generowana. */
const gross = (net: number | null | undefined, vat: number | null | undefined) =>
  net == null ? null : Number((Number(net) * (1 + Number(vat ?? 23) / 100)).toFixed(2));

const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} zł`;

/**
 * Plany i macierz plan × funkcja — miejsce, w którym cennik przestaje być deployem.
 *
 * Macierz zapisuje się w całości (podmiana), nie różnicowo. Przy jednym
 * administratorze to prostsze i odporne na wyścigi; po stronie bazy pilnuje tego
 * RPC billing_set_plan_features, żeby DELETE i INSERT poszły w jednej transakcji.
 */
export function BillingPlansPanel() {
  const { plans, matrix, loading, create, update, setActive, setFeatures } = useBillingPlans();
  const { features, loading: featuresLoading } = useBillingFeatures();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [matrixPlan, setMatrixPlan] = useState<BillingPlan | null>(null);
  const [rows, setRows] = useState<Record<string, { enabled: boolean; limit: string; soft: string }>>({});
  const [confirmOff, setConfirmOff] = useState<BillingPlan | null>(null);

  const isNew = draft && !draft.id;
  const saving = create.isPending || update.isPending;

  const featureCount = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of matrix) if (r.is_enabled) acc[r.plan_id] = (acc[r.plan_id] ?? 0) + 1;
    return acc;
  }, [matrix]);

  const activeFeatures = useMemo(() => features.filter((f) => f.is_active), [features]);

  const openMatrix = (plan: BillingPlan) => {
    const current: Record<string, { enabled: boolean; limit: string; soft: string }> = {};
    for (const f of activeFeatures) {
      const row = matrix.find((m) => m.plan_id === plan.id && m.feature_id === f.id);
      current[f.id] = {
        enabled: !!row?.is_enabled,
        limit: strOf(row?.limit_value),
        soft: strOf(row?.soft_limit_value),
      };
    }
    setRows(current);
    setMatrixPlan(plan);
  };

  const saveMatrix = () => {
    if (!matrixPlan) return;
    // Wysyłamy wyłącznie włączone funkcje — wiersz w billing_plan_features
    // z is_enabled = false i tak nie daje uprawnienia, więc jego brak jest
    // czytelniejszy niż wyłączony wiersz.
    const payload = activeFeatures
      .filter((f) => rows[f.id]?.enabled)
      .map((f) => ({
        feature_id: f.id,
        is_enabled: true,
        limit_value: numOrNull(rows[f.id].limit),
        soft_limit_value: numOrNull(rows[f.id].soft),
      }));

    // Ten sam warunek pilnuje edge; łapiemy go tutaj, żeby nie kasować
    // wypełnionego formularza żądaniem, które i tak wróci błędem.
    const wrong = payload.find(
      (r) => r.limit_value != null && r.soft_limit_value != null && r.soft_limit_value > r.limit_value,
    );
    if (wrong) {
      const f = activeFeatures.find((x) => x.id === wrong.feature_id);
      toast.error(`„${f?.name ?? 'Funkcja'}": próg miękki jest wyższy od limitu twardego`);
      return;
    }
    setFeatures.mutate(
      { plan_id: matrixPlan.id, features: payload },
      { onSuccess: () => setMatrixPlan(null) },
    );
  };

  const save = () => {
    if (!draft) return;
    if (draft.id) update.mutate({ ...draft, id: draft.id }, { onSuccess: () => setDraft(null) });
    else create.mutate(draft, { onSuccess: () => setDraft(null) });
  };

  if (loading || featuresLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" /> Plany
          </CardTitle>
          <CardDescription>
            Cennik i zakres pakietów. Zmiana ceny nie dotyka istniejących subskrypcji —
            te trzymają cenę z chwili zakupu.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setDraft({ ...EMPTY })} className="gap-2">
          <Plus className="h-4 w-4" /> Dodaj plan
        </Button>
      </CardHeader>

      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Linia</TableHead>
              <TableHead className="text-right">Netto</TableHead>
              <TableHead className="text-right">Brutto</TableHead>
              <TableHead className="text-center">Trial</TableHead>
              <TableHead className="text-center">Funkcje</TableHead>
              <TableHead className="w-[100px] text-center">Aktywny</TableHead>
              <TableHead className="w-[170px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((p) => (
              <TableRow key={p.id} className={p.is_active ? undefined : 'opacity-55'}>
                <TableCell>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    <code>{p.code}</code>
                    {p.is_custom && <Badge variant="outline" className="ml-2">wycena indywidualna</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={p.product_line === 'other' ? 'outline' : 'secondary'}>
                    {PRODUCT_LINE_LABEL[p.product_line] ?? p.product_line}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {p.is_custom ? '—' : fmt(p.price_net)}
                  {/* Cena docelowa to obietnica wobec klienta — musi być widoczna
                      obok ceny promocyjnej, inaczej nikt jej nie pilnuje. */}
                  {!p.is_custom && p.price_net_target != null && (
                    <div className="text-xs text-muted-foreground">
                      po promocji {fmt(p.price_net_target)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {p.is_custom ? '—' : fmt(p.price_gross)}
                </TableCell>
                <TableCell className="text-center">
                  {p.trial_days > 0 ? `${p.trial_days} dni` : '—'}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{featureCount[p.id] ?? 0}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={p.is_active}
                    disabled={setActive.isPending}
                    onCheckedChange={(v) =>
                      v ? setActive.mutate({ id: p.id, is_active: true }) : setConfirmOff(p)
                    }
                  />
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="outline" size="sm" onClick={() => openMatrix(p)} className="gap-1">
                    <SlidersHorizontal className="h-3.5 w-3.5" /> Funkcje
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDraft({ ...p })}>Edytuj</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Dodawanie i edycja planu */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? 'Nowy plan' : 'Edycja planu'}</DialogTitle>
            <DialogDescription>
              {isNew
                ? 'Kod trafia do konfiguracji i integracji — po utworzeniu nie da się go zmienić.'
                : 'Kodu nie można zmienić. Zmiana ceny nie wpłynie na istniejące subskrypcje.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kod</Label>
                <Input
                  value={draft?.code ?? ''}
                  disabled={!isNew}
                  placeholder="np. warsztat_pro"
                  onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Nazwa</Label>
                <Input
                  value={draft?.name ?? ''}
                  placeholder="np. Pro"
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Linia produktowa</Label>
              <Select
                value={draft?.product_line ?? 'other'}
                disabled={!isNew}
                onValueChange={(v) => setDraft((d) => ({ ...d, product_line: v as ProductLine }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="warsztat">Warsztat</SelectItem>
                  <SelectItem value="agent">Agent AI</SelectItem>
                  <SelectItem value="other">Inne</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {isNew
                  ? 'Klient może mieć jedną aktywną subskrypcję w każdej linii — Warsztat i Agent kupuje się osobno.'
                  : 'Linii nie można zmienić: subskrypcje trzymają ją u siebie, więc przestawienie planu rozjechałoby limit jednej subskrypcji na linię.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Opis</Label>
              <Textarea
                rows={2}
                className="resize-none"
                value={draft?.description ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Switch
                checked={draft?.is_custom ?? false}
                onCheckedChange={(v) =>
                  setDraft((d) => ({
                    ...d, is_custom: v, price_net: v ? null : 0, price_net_target: null,
                  }))
                }
              />
              <div>
                <Label className="cursor-pointer">Cena indywidualna</Label>
                <p className="text-xs text-muted-foreground">
                  Plan bez ceny w cenniku — kwota ustalana per umowa.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cena netto</Label>
                <Input
                  type="number" min="0" step="0.01"
                  disabled={draft?.is_custom}
                  value={draft?.price_net ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, price_net: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">Kwota, którą klient płaci dziś.</p>
              </div>
              <div className="space-y-2">
                <Label>Cena docelowa</Label>
                <Input
                  type="number" min="0" step="0.01"
                  placeholder="bez zmiany"
                  disabled={draft?.is_custom}
                  value={draft?.price_net_target ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, price_net_target: numOrNull(e.target.value) }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Cennik po zakończeniu promocji. Puste = cena się nie zmienia.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>VAT %</Label>
                <Input
                  type="number" min="0" max="100" step="1"
                  value={draft?.vat_rate ?? 23}
                  onChange={(e) => setDraft((d) => ({ ...d, vat_rate: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Trial (dni)</Label>
                <Input
                  type="number" min="0" step="1"
                  value={draft?.trial_days ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, trial_days: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kolejność</Label>
                <Input
                  type="number" min="0" step="10"
                  value={draft?.sort_order ?? 999}
                  onChange={(e) => setDraft((d) => ({ ...d, sort_order: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">
                  Rosnąco — tak samo ustawią się karty w cenniku.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Interwał</Label>
                <Select
                  value={draft?.billing_interval ?? 'month'}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, billing_interval: v as BillingPlan['billing_interval'] }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Miesięcznie</SelectItem>
                    <SelectItem value="year">Rocznie</SelectItem>
                    <SelectItem value="one_time">Jednorazowo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!draft?.is_custom && (
              <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                Brutto policzy się samo: {fmt(gross(draft?.price_net, draft?.vat_rate))}
                {draft?.price_net_target != null && (
                  <> · po promocji {fmt(gross(draft.price_net_target, draft.vat_rate))}</>
                )}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Anuluj</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Macierz plan × funkcja */}
      <Dialog open={!!matrixPlan} onOpenChange={(o) => !o && setMatrixPlan(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Funkcje planu: {matrixPlan?.name}</DialogTitle>
            <DialogDescription>
              <strong>Limit</strong> blokuje po przekroczeniu. <strong>Próg</strong> tylko ostrzega
              (fair use) — funkcja działa dalej. Puste pole znaczy „bez limitu"; zero znaczy, że
              funkcja jest w planie, ale z zerowym przydziałem.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3 border-b px-2 pb-1 text-xs text-muted-foreground">
            <span className="w-4" />
            <span className="min-w-0 flex-1">Funkcja</span>
            <span className="w-24 text-center">Limit</span>
            <span className="w-24 text-center">Próg</span>
            <span className="w-16" />
          </div>

          <div className="space-y-1">
            {activeFeatures.map((f) => {
              const row = rows[f.id] ?? { enabled: false, limit: '', soft: '' };
              return (
                <div
                  key={f.id}
                  className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={row.enabled}
                    onCheckedChange={(v) =>
                      setRows((r) => ({ ...r, [f.id]: { ...row, enabled: v === true } }))
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{f.name}</div>
                    <code className="text-xs text-muted-foreground">{f.key}</code>
                  </div>
                  {f.kind === 'metered' ? (
                    <div className="flex items-center gap-3">
                      <Input
                        type="number" min="0" step="1"
                        className="w-24"
                        placeholder="bez limitu"
                        disabled={!row.enabled}
                        value={row.limit}
                        onChange={(e) =>
                          setRows((r) => ({ ...r, [f.id]: { ...row, limit: e.target.value } }))
                        }
                      />
                      <Input
                        type="number" min="0" step="1"
                        className="w-24"
                        placeholder="brak"
                        disabled={!row.enabled}
                        value={row.soft}
                        onChange={(e) =>
                          setRows((r) => ({ ...r, [f.id]: { ...row, soft: e.target.value } }))
                        }
                      />
                      <span className="w-16 truncate text-xs text-muted-foreground">{f.unit}</span>
                    </div>
                  ) : (
                    <span className="w-[232px] text-right text-xs text-muted-foreground">wł/wył</span>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMatrixPlan(null)}>Anuluj</Button>
            <Button onClick={saveMatrix} disabled={setFeatures.isPending} className="gap-2">
              {setFeatures.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Zapisz macierz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Potwierdzenie wyłączenia planu */}
      <Dialog open={!!confirmOff} onOpenChange={(o) => !o && setConfirmOff(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Wyłączyć plan?</DialogTitle>
            <DialogDescription>
              „{confirmOff?.name}" zniknie z cennika. Istniejące subskrypcje działają dalej —
              plan przestaje być tylko dostępny do kupienia.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOff(null)}>Anuluj</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmOff) setActive.mutate({ id: confirmOff.id, is_active: false });
                setConfirmOff(null);
              }}
            >
              Wyłącz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
