import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Plus, Puzzle, Save } from 'lucide-react';
import { useBillingFeatures, type BillingFeature } from '@/hooks/useBillingFeatures';

type Draft = Partial<BillingFeature>;

const EMPTY: Draft = { key: '', name: '', description: '', kind: 'boolean', unit: '', sort_order: 999 };

/**
 * Katalog funkcji billingowych — to, z czego składane są plany.
 *
 * Świadomie osobna zakładka od top-level „Funkcje" w panelu admina: tamta trzyma
 * feature flagi portalu (`feature_toggles`, włącz/wyłącz moduł dla wszystkich),
 * ta definiuje, co wchodzi w skład płatnego pakietu.
 */
export function BillingFeaturesPanel() {
  const { features, loading, create, update, setActive, usageInfo } = useBillingFeatures();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmOff, setConfirmOff] = useState<{ feature: BillingFeature; plans: string[] } | null>(null);

  const isNew = draft && !draft.id;
  const saving = create.isPending || update.isPending;

  const openNew = () => setDraft({ ...EMPTY });
  const openEdit = (f: BillingFeature) => setDraft({ ...f });

  const save = () => {
    if (!draft) return;
    if (draft.id) {
      update.mutate({ ...draft, id: draft.id }, { onSuccess: () => setDraft(null) });
    } else {
      create.mutate(draft, { onSuccess: () => setDraft(null) });
    }
  };

  /**
   * Wyłączenie funkcji odbiera dostęp klientom, których plan ją zawiera —
   * dlatego przed zmianą pytamy serwer, ilu planów to dotyczy, i pokazujemy
   * to w potwierdzeniu (admin-panel.md §3).
   */
  const askBeforeDisable = async (f: BillingFeature) => {
    if (!f.is_active) {
      setActive.mutate({ id: f.id, is_active: true });
      return;
    }
    try {
      const info = await usageInfo(f.id);
      const plans = (info?.plans ?? []).map((p: { name: string }) => p.name);
      if (plans.length === 0) {
        setActive.mutate({ id: f.id, is_active: false });
        return;
      }
      setConfirmOff({ feature: f, plans });
    } catch {
      setConfirmOff({ feature: f, plans: [] });
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Puzzle className="h-4 w-4" /> Funkcje billingowe
          </CardTitle>
          <CardDescription>
            Składniki planów. Nie mylić z feature flagami portalu — te włączają moduły dla wszystkich.
          </CardDescription>
        </div>
        <Button size="sm" onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Dodaj funkcję
        </Button>
      </CardHeader>

      <CardContent>
        {features.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Brak funkcji. Dodaj pierwszą, żeby móc składać z nich plany.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>Klucz</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead className="w-[110px]">Aktywna</TableHead>
                <TableHead className="w-[90px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {features.map((f) => (
                <TableRow key={f.id} className={f.is_active ? undefined : 'opacity-55'}>
                  <TableCell>
                    <div className="font-medium">{f.name}</div>
                    {f.description && (
                      <div className="text-xs text-muted-foreground">{f.description}</div>
                    )}
                  </TableCell>
                  <TableCell><code className="text-xs">{f.key}</code></TableCell>
                  <TableCell>
                    {f.kind === 'metered' ? (
                      <Badge variant="outline">licznik · {f.unit}</Badge>
                    ) : (
                      <Badge variant="secondary">wł/wył</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={f.is_active}
                      onCheckedChange={() => askBeforeDisable(f)}
                      disabled={setActive.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openEdit(f)}>Edytuj</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Dodawanie i edycja */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? 'Nowa funkcja' : 'Edycja funkcji'}</DialogTitle>
            <DialogDescription>
              {isNew
                ? 'Klucz trafia do kodu aplikacji i nie da się go później zmienić.'
                : 'Klucza nie można zmienić — jest używany w kodzie jako identyfikator uprawnienia.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Klucz</Label>
              <Input
                value={draft?.key ?? ''}
                disabled={!isNew}
                placeholder="np. tire_storage"
                onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
              />
              {isNew && (
                <p className="text-xs text-muted-foreground">
                  Małe litery, cyfry i podkreślenia, 3–49 znaków.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Nazwa</Label>
              <Input
                value={draft?.name ?? ''}
                placeholder="np. Przechowalnia opon"
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Typ</Label>
                <Select
                  value={draft?.kind ?? 'boolean'}
                  onValueChange={(v) => setDraft((d) => ({ ...d, kind: v as BillingFeature['kind'] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boolean">Włącz / wyłącz</SelectItem>
                    <SelectItem value="metered">Z licznikiem</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Jednostka</Label>
                <Input
                  value={draft?.unit ?? ''}
                  disabled={draft?.kind !== 'metered'}
                  placeholder={draft?.kind === 'metered' ? 'np. SMS, minuta' : '—'}
                  onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
                />
                {draft?.kind === 'metered' && (
                  <p className="text-xs text-muted-foreground">Wymagana dla funkcji z licznikiem.</p>
                )}
              </div>
            </div>
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

      {/* Potwierdzenie wyłączenia — z listą planów, które stracą funkcję */}
      <Dialog open={!!confirmOff} onOpenChange={(o) => !o && setConfirmOff(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Wyłączyć funkcję?</DialogTitle>
            <DialogDescription>
              „{confirmOff?.feature.name}" przestanie przysługiwać klientom
              {confirmOff?.plans.length
                ? ` w ${confirmOff.plans.length} ${confirmOff.plans.length === 1 ? 'planie' : 'planach'}.`
                : '.'}
            </DialogDescription>
          </DialogHeader>
          {!!confirmOff?.plans.length && (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {confirmOff.plans.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOff(null)}>Anuluj</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmOff) setActive.mutate({ id: confirmOff.feature.id, is_active: false });
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
