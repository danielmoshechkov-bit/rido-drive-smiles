import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Loader2, Hash } from 'lucide-react';

const DOC_TYPES = [
  { value: 'order', label: 'Zlecenie', defaultPrefix: 'ZL' },
  { value: 'invoice', label: 'Faktura', defaultPrefix: 'FV' },
  { value: 'estimate', label: 'Wycena', defaultPrefix: 'WYC' },
  { value: 'receipt', label: 'Paragon', defaultPrefix: 'PAR' },
];

const FORMATS = [
  { value: '{PREFIX}/{NR}/{ROK}', label: '{PREFIX}/{NR}/{ROK}' },
  { value: '{PREFIX}-{NR}-{ROK}', label: '{PREFIX}-{NR}-{ROK}' },
  { value: '{ROK}/{NR}', label: '{ROK}/{NR}' },
];

const RESET_OPTIONS = [
  { value: 'year', label: 'Co rok' },
  { value: 'month', label: 'Co miesiąc' },
  { value: 'never', label: 'Nigdy' },
];

interface NumberingConfig {
  id?: string;
  document_type: string;
  prefix: string;
  format: string;
  next_number: number;
  reset_period: string;
}

function generatePreview(config: NumberingConfig): string {
  const year = new Date().getFullYear();
  const nr = String(config.next_number).padStart(3, '0');
  return config.format
    .replace('{PREFIX}', config.prefix)
    .replace('{NR}', nr)
    .replace('{ROK}', String(year));
}

export const DocumentNumberingPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<NumberingConfig[]>([]);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await (supabase.from('document_numbering') as any)
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      const existing = data || [];
      const merged = DOC_TYPES.map(dt => {
        const found = existing.find((e: any) => e.document_type === dt.value);
        if (found) return found as NumberingConfig;
        return {
          document_type: dt.value,
          prefix: dt.defaultPrefix,
          format: '{PREFIX}/{NR}/{ROK}',
          next_number: 1,
          reset_period: 'year',
        } as NumberingConfig;
      });

      setConfigs(merged);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = (idx: number, field: keyof NumberingConfig, value: any) => {
    setConfigs(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Brak autoryzacji');

      for (const config of configs) {
        const payload = {
          user_id: user.id,
          document_type: config.document_type,
          prefix: config.prefix,
          format: config.format,
          next_number: config.next_number,
          reset_period: config.reset_period,
          updated_at: new Date().toISOString(),
        };

        if (config.id) {
          const { error } = await (supabase.from('document_numbering') as any)
            .update(payload).eq('id', config.id);
          if (error) throw error;
        } else {
          const { data, error } = await (supabase.from('document_numbering') as any)
            .upsert(payload, { onConflict: 'user_id,document_type' })
            .select('id')
            .single();
          if (error) throw error;
          config.id = data?.id;
        }
      }

      toast.success('Numeracja dokumentów zapisana');
      fetchConfigs();
    } catch (err: any) {
      toast.error(err.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Hash className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Numeracja dokumentów</h3>
      </div>

      {configs.map((config, idx) => {
        const docType = DOC_TYPES.find(d => d.value === config.document_type);
        const preview = generatePreview(config);

        return (
          <Card key={config.document_type}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{docType?.label || config.document_type}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Prefiks</Label>
                  <Input value={config.prefix} maxLength={10}
                    onChange={e => updateConfig(idx, 'prefix', e.target.value.toUpperCase())} />
                </div>
                <div className="space-y-2">
                  <Label>Format numeru</Label>
                  <Select value={config.format} onValueChange={v => updateConfig(idx, 'format', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FORMATS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Następny numer</Label>
                  <Input type="number" min={1} value={config.next_number}
                    onChange={e => updateConfig(idx, 'next_number', Math.max(1, Number(e.target.value)))} />
                </div>
                <div className="space-y-2">
                  <Label>Resetuj co</Label>
                  <Select value={config.reset_period} onValueChange={v => updateConfig(idx, 'reset_period', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RESET_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-3 p-2 bg-primary/5 rounded text-sm">
                <span className="text-muted-foreground">Podgląd: </span>
                <span className="font-mono font-semibold text-primary">{preview}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zapisywanie...</> : <><Save className="h-4 w-4 mr-2" />Zapisz numerację</>}
      </Button>
    </div>
  );
};
