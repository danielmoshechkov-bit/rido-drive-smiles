import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, ChevronLeft, ChevronRight, Check, Sparkles, Rocket } from 'lucide-react';

interface ServiceLite {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  image_url?: string | null;
}

interface Props {
  service: ServiceLite;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Variant = {
  headline?: string;
  primary_text?: string;
  description?: string;
  cta?: string;
  targeting_suggestions?: string;
};

const TONES = [
  { value: 'professional', label: 'Profesjonalny' },
  { value: 'friendly', label: 'Przyjazny' },
  { value: 'urgent', label: 'Pilny / Okazja' },
  { value: 'exclusive', label: 'Ekskluzywny' },
];

export function AdvertiseServiceWizard({ service, open, onOpenChange }: Props) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1
  const [platforms, setPlatforms] = useState<string[]>(['meta']);
  const [budget, setBudget] = useState<number>(50);
  const [duration, setDuration] = useState<string>('14');

  // Step 2
  const [useGetridoAccount, setUseGetridoAccount] = useState(true);
  const [metaToken, setMetaToken] = useState('');
  const [metaAdAccountId, setMetaAdAccountId] = useState('');
  const [metaPageId, setMetaPageId] = useState('');

  // Step 3
  const [imageSource, setImageSource] = useState<'service' | 'upload' | 'ai'>('service');
  const [extraInfo, setExtraInfo] = useState('');
  const [tone, setTone] = useState('professional');

  // Step 4
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<number>(0);
  const [complianceScore, setComplianceScore] = useState<number | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const togglePlatform = (p: string) => {
    setPlatforms((prev) => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const totalBudget = budget * (duration === 'unlimited' ? 30 : parseInt(duration));

  const generateAds = async () => {
    setLoading(true);
    setGenerationError(null);
    try {
      const platform = platforms.length === 2 ? 'both' : platforms[0];
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error('Sesja wygasła. Zaloguj się ponownie.');
      }

      const SUPABASE_URL = "https://wclrrytmrscqvsyxyvnn.supabase.co";
      const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk";

      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-ad-creative`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          brief: {
            client: service.name,
            platform,
            goal: 'leads',
            product: `${service.name}. ${service.description || ''}`,
            audience: '',
            budget: String(budget),
            tone,
            usp: extraInfo,
            cta: 'Dowiedz się więcej',
            service_id: service.id,
            image_url: service.image_url,
          },
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`Edge Function zwróciła błąd ${response.status}: ${errBody.slice(0, 200) || 'brak szczegółów'}`);
      }

      const data = await response.json();
      const v = data?.variants || [];
      setVariants(v);
      setSelectedVariant(0);
      setComplianceScore(data?.compliance_check?.score ?? null);
      if (!v.length) {
        const msg = data?.error || 'Nie udało się wygenerować wariantów reklamy.';
        setGenerationError(msg);
        toast.error(msg);
      } else {
        // moved from step 4 to variants display — stay at step 4 to show variants in same view
        setStep(5);
      }
    } catch (err: any) {
      console.error('generate-ad-creative error:', err);
      const msg = err?.message || 'Błąd generowania reklam';
      setGenerationError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const launch = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error('Musisz być zalogowany');

      const platform = platforms.length === 2 ? 'both' : platforms[0];
      const variant = variants[selectedVariant] || {};

      // Save to ad_orders
      const { error: orderErr } = await supabase.from('ad_orders').insert({
        service_id: service.id,
        provider_user_id: userId,
        budget_monthly: totalBudget,
        budget_currency: 'PLN',
        campaign_goal: 'leads',
        target_audience: extraInfo || null,
        campaign_name: `Reklama: ${service.name}`,
        status: 'pending_publish',
        meta_ad_account_id: useGetridoAccount ? null : metaAdAccountId,
        meta_page_id: useGetridoAccount ? null : metaPageId,
        meta_access_token: useGetridoAccount ? null : metaToken,
      });
      if (orderErr) throw orderErr;

      toast.success('Reklama została zlecona — uruchomimy ją wkrótce');
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Nie udało się uruchomić reklamy');
    } finally {
      setLoading(false);
    }
  };

  const canNext = (() => {
    if (step === 1) return platforms.length > 0 && budget >= 20;
    if (step === 2) return useGetridoAccount || (metaAdAccountId && metaPageId);
    if (step === 3) return true;
    return false;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Reklamuj: {service.name}
          </DialogTitle>
          <DialogDescription>
            Krok {step} z 5 — {step === 1 ? 'Platforma i budżet' : step === 2 ? 'Konto reklamowe' : step === 3 ? 'Materiały' : step === 4 ? 'Generowanie' : 'Potwierdzenie'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="flex gap-1 mb-2">
          {[1,2,3,4,5].map(s => (
            <div key={s} className={`h-1 flex-1 rounded ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {/* STEP 1 — Platform + budget */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Gdzie chcesz reklamować?</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={platforms.includes('meta')} onCheckedChange={() => togglePlatform('meta')} />
                  <span className="text-sm">Meta Ads (Facebook + Instagram)</span>
                </label>
                <label className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={platforms.includes('google')} onCheckedChange={() => togglePlatform('google')} />
                  <span className="text-sm">Google Ads (wyszukiwarka)</span>
                </label>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <Label>Budżet dzienny</Label>
                <span className="text-sm font-semibold text-primary">{budget} PLN</span>
              </div>
              <Slider min={20} max={500} step={10} value={[budget]} onValueChange={([v]) => setBudget(v)} />
              <p className="text-xs text-muted-foreground mt-1">Min 20 PLN — Max 500 PLN</p>
            </div>

            <div>
              <Label className="mb-2 block">Czas trwania</Label>
              <RadioGroup value={duration} onValueChange={setDuration} className="grid grid-cols-2 gap-2">
                {['7','14','30','unlimited'].map(d => (
                  <label key={d} className={`flex items-center gap-2 p-2 border rounded cursor-pointer ${duration===d ? 'border-primary bg-primary/5' : ''}`}>
                    <RadioGroupItem value={d} />
                    <span className="text-sm">{d === 'unlimited' ? 'Bezterminowo' : `${d} dni`}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="py-3">
                <p className="text-sm">
                  Łączny budżet: <span className="font-semibold">{totalBudget} PLN</span>
                  {duration !== 'unlimited' && ` (${budget} × ${duration} dni)`}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* STEP 2 — Account */}
        {step === 2 && (
          <div className="space-y-4">
            <Card className={`cursor-pointer ${useGetridoAccount ? 'border-primary bg-primary/5' : ''}`} onClick={() => setUseGetridoAccount(true)}>
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Checkbox checked={useGetridoAccount} />
                  <div>
                    <p className="font-medium">Konto GetRido Agency (zalecane)</p>
                    <p className="text-xs text-muted-foreground mt-1">Reklamy prowadzone przez GetRido. Prowizja 15% od budżetu.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={`cursor-pointer ${!useGetridoAccount ? 'border-primary bg-primary/5' : ''}`} onClick={() => setUseGetridoAccount(false)}>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Checkbox checked={!useGetridoAccount} />
                  <div>
                    <p className="font-medium">Moje konto Meta</p>
                    <p className="text-xs text-muted-foreground mt-1">Podłącz swoje konto reklamowe Meta.</p>
                  </div>
                </div>
                {!useGetridoAccount && (
                  <div className="space-y-2 pl-7">
                    <Input placeholder="Meta Ad Account ID (act_...)" value={metaAdAccountId} onChange={e => setMetaAdAccountId(e.target.value)} />
                    <Input placeholder="Meta Page ID" value={metaPageId} onChange={e => setMetaPageId(e.target.value)} />
                    <Input placeholder="Meta Access Token" type="password" value={metaToken} onChange={e => setMetaToken(e.target.value)} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* STEP 3 — Materials */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Grafika</Label>
              <RadioGroup value={imageSource} onValueChange={(v) => setImageSource(v as any)} className="space-y-2">
                <label className="flex items-center gap-2 p-3 border rounded cursor-pointer">
                  <RadioGroupItem value="service" /> <span className="text-sm">Użyj zdjęcia usługi</span>
                </label>
                <label className="flex items-center gap-2 p-3 border rounded cursor-pointer">
                  <RadioGroupItem value="ai" /> <span className="text-sm">Wygeneruj AI</span>
                </label>
              </RadioGroup>
            </div>
            <div>
              <Label>Co podkreślić w reklamie? (opcjonalne)</Label>
              <Textarea value={extraInfo} onChange={e => setExtraInfo(e.target.value)} rows={2} placeholder="Np. Promocja -20% do końca miesiąca" />
            </div>
            <div>
              <Label className="mb-2 block">Ton reklamy</Label>
              <RadioGroup value={tone} onValueChange={setTone} className="grid grid-cols-2 gap-2">
                {TONES.map(t => (
                  <label key={t.value} className={`flex items-center gap-2 p-2 border rounded cursor-pointer ${tone===t.value?'border-primary bg-primary/5':''}`}>
                    <RadioGroupItem value={t.value} />
                    <span className="text-sm">{t.label}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          </div>
        )}

        {/* STEP 4 — Generation in progress */}
        {step === 4 && (
          <div className="py-12 text-center space-y-3">
            {loading ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">Agent AI analizuje Twoją usługę…</p>
              </>
            ) : (
              <>
                <Sparkles className="h-10 w-10 mx-auto text-primary" />
                <p className="text-sm">Gotowy do generowania 3 wariantów reklamy</p>
                <Button onClick={generateAds} className="gap-2">
                  <Sparkles className="h-4 w-4" /> Generuj reklamy AI
                </Button>
              </>
            )}
          </div>
        )}

        {/* STEP 5 — Variants + Confirm */}
        {step === 5 && variants.length > 0 && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {variants.map((_, i) => (
                <Button key={i} size="sm" variant={selectedVariant===i?'default':'outline'} onClick={() => setSelectedVariant(i)}>
                  Wariant {String.fromCharCode(65+i)}
                </Button>
              ))}
              {complianceScore !== null && (
                <Badge variant="outline" className="ml-auto">
                  Compliance: {complianceScore}/100
                </Badge>
              )}
            </div>

            <Card>
              <CardContent className="py-4 space-y-2">
                <p className="font-semibold">{variants[selectedVariant]?.headline}</p>
                <p className="text-sm">{variants[selectedVariant]?.primary_text}</p>
                <p className="text-sm text-muted-foreground">{variants[selectedVariant]?.description}</p>
                <div className="pt-2">
                  <Badge>{variants[selectedVariant]?.cta || 'Dowiedz się więcej'}</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted/30">
              <CardContent className="py-3 text-xs space-y-1">
                <p>Platforma: {platforms.join(', ')}</p>
                <p>Budżet: {budget} PLN/dzień × {duration === 'unlimited' ? '∞' : duration + ' dni'} = <strong>{totalBudget} PLN</strong></p>
                <p>Konto: {useGetridoAccount ? 'GetRido Agency' : 'Twoje Meta'}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between gap-2 pt-4 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Anuluj
          </Button>
          <div className="flex gap-2">
            {step > 1 && step < 5 && (
              <Button variant="outline" onClick={() => setStep(step - 1)} disabled={loading} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Wstecz
              </Button>
            )}
            {step < 4 && (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext} className="gap-1">
                Dalej <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            {step === 5 && (
              <Button onClick={launch} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Uruchom reklamę
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
