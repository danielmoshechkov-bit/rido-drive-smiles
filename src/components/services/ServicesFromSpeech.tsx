import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Sparkles, Loader2, Plus, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useProviderCategories } from '@/hooks/useProviderCategories';

interface Draft {
  name: string;
  category: string;
  price_from: string;
  price_to: string;
  duration_minutes: string;
  short_description: string;
  selected: boolean;
}

/**
 * „Opowiedz, czym się zajmujesz" — mówisz albo piszesz, AI rozpisuje usługi
 * w punktach z widełkami cen. Ceny, których nie podałeś, uzupełniasz jednym
 * kliknięciem, zanim trafią do cennika.
 */
export function ServicesFromSpeech({
  providerId,
  existingServiceNames,
}: {
  providerId: string | null;
  existingServiceNames: string[];
}) {
  const qc = useQueryClient();
  const { categories } = useProviderCategories(providerId);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef('');

  const speechSupported = typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  useEffect(() => {
    if (!speechSupported) return;
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'pl-PL';
    rec.onresult = (event: any) => {
      let finalText = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk + ' ';
        else interim += chunk;
      }
      if (finalText) baseTextRef.current = (baseTextRef.current + ' ' + finalText).trim();
      setText((baseTextRef.current + ' ' + interim).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    return () => { try { rec.stop(); } catch (_) { /* już zatrzymany */ } };
  }, [speechSupported]);

  const toggleMic = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    baseTextRef.current = text;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (_) {
      toast.error('Nie udało się uruchomić mikrofonu');
    }
  };

  const extract = async () => {
    if (text.trim().length < 10) { toast.error('Napisz lub powiedz coś więcej'); return; }
    if (listening) toggleMic();
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('provider-services-extract', {
        body: {
          text,
          categories: categories.map((c) => c.name),
          existing_services: existingServiceNames,
        },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || 'Nie udało się rozpisać usług');
      const list: Draft[] = (data.services || []).map((s: any) => ({
        name: s.name,
        category: s.category || '',
        price_from: s.price_from != null ? String(s.price_from) : '',
        price_to: s.price_to != null ? String(s.price_to) : '',
        duration_minutes: s.duration_minutes != null ? String(s.duration_minutes) : '',
        short_description: s.short_description || '',
        selected: true,
      }));
      setDrafts(list);
      setNote(data.note || '');
      if (!list.length) toast.info('Nie znalazłem konkretnych usług — opowiedz o nich trochę dokładniej');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExtracting(false);
    }
  };

  const setDraft = (i: number, patch: Partial<Draft>) =>
    setDrafts((d) => d.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const save = async () => {
    if (!providerId) return;
    const chosen = drafts.filter((d) => d.selected && d.name.trim());
    if (!chosen.length) { toast.error('Zaznacz przynajmniej jedną usługę'); return; }
    setSaving(true);
    try {
      // Kategorie, których jeszcze nie ma — zakładamy przed dodaniem usług.
      const known = new Set(categories.map((c) => c.name));
      const fresh = Array.from(new Set(chosen.map((d) => d.category.trim()).filter((c) => c && !known.has(c))));
      for (const name of fresh) {
        await (supabase as any).from('provider_service_categories')
          .insert({ provider_id: providerId, name, sort_order: 0 });
      }

      const rows = chosen.map((d) => ({
        provider_id: providerId,
        name: d.name.trim(),
        category: d.category.trim() || 'Inne',
        short_description: d.short_description || '',
        description: '',
        price_from: parseFloat(d.price_from) || 0,
        price_to: parseFloat(d.price_to) || 0,
        duration_minutes: d.duration_minutes ? parseInt(d.duration_minutes) : null,
        is_active: true,
        photos: [],
      }));
      const { error } = await (supabase as any).from('provider_services').insert(rows);
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ['provider-services', providerId] });
      qc.invalidateQueries({ queryKey: ['provider-service-categories', providerId] });
      qc.invalidateQueries({ queryKey: ['provider-offer', providerId] });
      toast.success(`Dodano ${rows.length} ${rows.length === 1 ? 'usługę' : 'usług'}`);
      setDrafts([]);
      setText('');
      baseTextRef.current = '';
      setNote('');
    } catch (e: any) {
      toast.error('Błąd zapisu: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const missingPrice = drafts.some((d) => d.selected && !d.price_from);

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="h-5 w-5 text-primary" /> Opowiedz, czym się zajmujesz
        </CardTitle>
        <CardDescription>
          Powiedz to na głos albo napisz zwykłym językiem — rozpiszę Twoje usługi w punktach. Ceny dopiszesz jednym kliknięciem.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Textarea
            rows={4}
            value={text}
            onChange={(e) => { setText(e.target.value); baseTextRef.current = e.target.value; }}
            placeholder="np. Robimy wymianę oleju, klocki i tarcze hamulcowe od stu do dwustu pięćdziesięciu, geometrię kół, a od niedawna też myjnię i ceramikę…"
            className="pr-14 bg-background"
          />
          {speechSupported && (
            <Button
              type="button"
              variant={listening ? 'destructive' : 'secondary'}
              size="icon"
              className="absolute right-2 top-2 h-9 w-9 rounded-full"
              onClick={toggleMic}
              title={listening ? 'Zatrzymaj nagrywanie' : 'Mów zamiast pisać'}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}
        </div>
        {listening && <p className="text-xs text-primary animate-pulse">Słucham… mów spokojnie, możesz wymieniać usługi po kolei.</p>}

        <Button onClick={extract} disabled={extracting} className="gap-2">
          {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Rozpisz moje usługi
        </Button>

        {note && <p className="text-xs text-muted-foreground">{note}</p>}

        {drafts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Znalezione usługi — sprawdź i popraw</p>
              {missingPrice && <Badge variant="outline" className="text-amber-700 border-amber-300">uzupełnij ceny</Badge>}
            </div>
            <div className="rounded-lg border divide-y bg-background">
              {drafts.map((d, i) => (
                <div key={i} className="p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <Checkbox checked={d.selected} onCheckedChange={(v) => setDraft(i, { selected: !!v })} className="mt-2.5" />
                    <Input className="flex-1" value={d.name} onChange={(e) => setDraft(i, { name: e.target.value })} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-6">
                    <Input
                      className="h-8 w-36"
                      list="provider-category-list"
                      value={d.category}
                      onChange={(e) => setDraft(i, { category: e.target.value })}
                      placeholder="Kategoria"
                    />
                    <Input
                      type="number" className="h-8 w-24" value={d.price_from}
                      onChange={(e) => setDraft(i, { price_from: e.target.value })}
                      placeholder="cena od"
                    />
                    <span className="text-muted-foreground text-sm">–</span>
                    <Input
                      type="number" className="h-8 w-24" value={d.price_to}
                      onChange={(e) => setDraft(i, { price_to: e.target.value })}
                      placeholder="do"
                    />
                    <Input
                      type="number" className="h-8 w-28" value={d.duration_minutes}
                      onChange={(e) => setDraft(i, { duration_minutes: e.target.value })}
                      placeholder="czas (min)"
                    />
                  </div>
                </div>
              ))}
            </div>
            <datalist id="provider-category-list">
              {categories.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>

            <div className="flex items-center gap-2">
              <Button onClick={save} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Dodaj do cennika
              </Button>
              <Button variant="ghost" onClick={() => setDrafts([])}>Odrzuć</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
