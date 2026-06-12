import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  providerId: string;
}

export function RidoPriceSettingsTab({ providerId }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    ai_suggestions_enabled: true,
    share_anonymous_data: true,
    industry: 'warsztat',
    default_parts_margin: 30,
  });

  const { data: settings } = useQuery({
    queryKey: ['rido-price-settings', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('rido_price_settings')
        .select('*')
        .eq('provider_id', providerId)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        ai_suggestions_enabled: settings.ai_suggestions_enabled ?? true,
        share_anonymous_data: settings.share_anonymous_data ?? true,
        industry: settings.industry || 'warsztat',
        default_parts_margin: settings.default_parts_margin ?? 30,
      });
    }
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = { provider_id: providerId, ...form, updated_at: new Date().toISOString() };
      if (settings?.id) {
        await (supabase as any).from('rido_price_settings').update(payload).eq('id', settings.id);
      } else {
        await (supabase as any).from('rido_price_settings').insert(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rido-price-settings'] });
      toast.success(t('workshop.pricing.settings.savedToast'));
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-lg">{t('workshop.pricing.settings.title')}</h3>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label className="font-medium">{t('workshop.pricing.settings.enableAiLabel')}</Label>
          <p className="text-sm text-muted-foreground">{t('workshop.pricing.settings.enableAiDesc')}</p>
        </div>
        <Switch
          checked={form.ai_suggestions_enabled}
          onCheckedChange={v => setForm(p => ({ ...p, ai_suggestions_enabled: v }))}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label className="font-medium">{t('workshop.pricing.settings.shareDataLabel')}</Label>
          <p className="text-sm text-muted-foreground">
            {t('workshop.pricing.settings.shareDataDesc')}
          </p>
        </div>
        <Switch
          checked={form.share_anonymous_data}
          onCheckedChange={v => setForm(p => ({ ...p, share_anonymous_data: v }))}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('workshop.pricing.settings.industryLabel')}</Label>
        <Select value={form.industry} onValueChange={v => setForm(p => ({ ...p, industry: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="warsztat">{t('workshop.pricing.settings.industry.warsztat')}</SelectItem>
            <SelectItem value="myjnia">{t('workshop.pricing.settings.industry.myjnia')}</SelectItem>
            <SelectItem value="detailing">{t('workshop.pricing.settings.industry.detailing')}</SelectItem>
            <SelectItem value="folie_ppf">{t('workshop.pricing.settings.industry.folie_ppf')}</SelectItem>
            <SelectItem value="lakiernia">{t('workshop.pricing.settings.industry.lakiernia')}</SelectItem>
            <SelectItem value="inne">{t('workshop.pricing.settings.industry.inne')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{t('workshop.pricing.settings.partsMarginLabel')}</Label>
        <Input
          type="number"
          value={form.default_parts_margin}
          onChange={e => setForm(p => ({ ...p, default_parts_margin: Number(e.target.value) }))}
          className="w-32"
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => saveMut.mutate()} className="gap-2">
          <Save className="h-4 w-4" /> {t('workshop.pricing.settings.saveButton')}
        </Button>
      </div>
    </div>
  );
}
