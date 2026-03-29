import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Sparkles, Loader2, Copy, Image } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface AdVariant {
  headline: string;
  primary_text: string;
  description: string;
  cta: string;
  targeting_suggestions: string;
}

export function MarketingCreatorTab() {
  const [brief, setBrief] = useState({
    client: 'GetRido',
    platform: 'meta',
    goal: 'leads',
    product: '',
    audience: '',
    budget: '',
    tone: 'professional',
    usp: '',
    cta: 'Dowiedz się więcej',
  });
  const [variants, setVariants] = useState<AdVariant[]>([]);
  const [loading, setLoading] = useState(false);

  const generateAds = async () => {
    if (!brief.product.trim()) { toast.error('Opisz produkt/usługę'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-ad-creative', {
        body: { brief },
      });
      if (error) throw error;
      setVariants(data?.variants || []);
      if (!data?.variants?.length) toast.info('Nie wygenerowano wariantów — sprawdź klucz API');
    } catch {
      toast.error('Błąd generowania reklam');
    } finally {
      setLoading(false);
    }
  };

  const copyVariant = (v: AdVariant) => {
    navigator.clipboard.writeText(`${v.headline}\n\n${v.primary_text}\n\n${v.description}\n\nCTA: ${v.cta}`);
    toast.success('Skopiowano do schowka');
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" /> Kreator Reklam AI
      </h2>

      <Card>
        <CardHeader>
          <CardTitle>Brief reklamowy</CardTitle>
          <CardDescription>Wypełnij formularz — AI wygeneruje 3 warianty reklamy</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Platforma</Label>
              <Select value={brief.platform} onValueChange={v => setBrief(b => ({ ...b, platform: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta">Meta (Facebook / Instagram)</SelectItem>
                  <SelectItem value="google">Google Ads</SelectItem>
                  <SelectItem value="both">Oba</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cel kampanii</Label>
              <Select value={brief.goal} onValueChange={v => setBrief(b => ({ ...b, goal: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">Sprzedaż</SelectItem>
                  <SelectItem value="leads">Leady</SelectItem>
                  <SelectItem value="reach">Zasięg</SelectItem>
                  <SelectItem value="traffic">Ruch na stronie</SelectItem>
                  <SelectItem value="brand">Rozpoznawalność</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ton komunikacji</Label>
              <Select value={brief.tone} onValueChange={v => setBrief(b => ({ ...b, tone: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Profesjonalny</SelectItem>
                  <SelectItem value="friendly">Przyjazny</SelectItem>
                  <SelectItem value="urgent">Pilny</SelectItem>
                  <SelectItem value="exclusive">Ekskluzywny</SelectItem>
                  <SelectItem value="humorous">Humorystyczny</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Budżet dzienny (zł)</Label>
              <Input type="number" value={brief.budget} onChange={e => setBrief(b => ({ ...b, budget: e.target.value }))} placeholder="np. 100" />
            </div>
          </div>
          <div>
            <Label>Produkt / usługa *</Label>
            <Textarea value={brief.product} onChange={e => setBrief(b => ({ ...b, product: e.target.value }))} placeholder="Co reklamujesz?" rows={2} />
          </div>
          <div>
            <Label>Grupa docelowa</Label>
            <Textarea value={brief.audience} onChange={e => setBrief(b => ({ ...b, audience: e.target.value }))} placeholder="Opisz idealnego klienta" rows={2} />
          </div>
          <div>
            <Label>Główna korzyść (USP)</Label>
            <Input value={brief.usp} onChange={e => setBrief(b => ({ ...b, usp: e.target.value }))} placeholder="Co wyróżnia ofertę?" />
          </div>
          <Button onClick={generateAds} disabled={loading} className="gap-2 w-full md:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generuj reklamy AI
          </Button>
        </CardContent>
      </Card>

      {variants.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {variants.map((v, i) => (
            <Card key={i} className="border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-primary">Wariant {i + 1}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Nagłówek</Label>
                  <p className="font-semibold">{v.headline}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tekst główny</Label>
                  <p className="text-sm">{v.primary_text}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Opis</Label>
                  <p className="text-sm text-muted-foreground">{v.description}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">CTA</Label>
                  <p className="text-sm font-medium text-primary">{v.cta}</p>
                </div>
                {v.targeting_suggestions && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Sugestie targetowania</Label>
                    <p className="text-xs">{v.targeting_suggestions}</p>
                  </div>
                )}
                <Button variant="outline" size="sm" className="gap-1.5 w-full mt-2" onClick={() => copyVariant(v)}>
                  <Copy className="h-3.5 w-3.5" /> Kopiuj
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Image gen placeholder */}
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground">
          <Image className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Makieta graficzna — wkrótce</p>
          <p className="text-xs mt-1">Aby włączyć generowanie obrazów, dodaj klucz Gemini API w Ustawieniach Agencji</p>
        </CardContent>
      </Card>
    </div>
  );
}