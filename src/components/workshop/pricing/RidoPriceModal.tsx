import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import { useGetRidoAI } from '@/hooks/useGetRidoAI';
import { supabase } from '@/integrations/supabase/client';

interface ServiceItem {
  name: string;
  currentPrice: number;
}

interface Suggestion {
  name: string;
  min: number;
  max: number;
  note: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: ServiceItem[];
  vehicle: { brand?: string; model?: string; year?: number; engine_capacity?: number; fuel_type?: string } | null;
  city?: string;
  voivodeship?: string;
  industry?: string;
  priceMode: 'net' | 'gross';
  onApplySuggestions: (prices: { index: number; price: number }[]) => void;
}

const VAT_RATE = 1.23;

const PL_PATTERNS = /(?:P\+L|P\/L|przód\s*\+\s*tył|lewy\s*\+\s*prawy|obie\s*strony|x2|2\s*strony|dwie\s*strony|L\+P)/i;

export function RidoPriceModal({
  open,
  onOpenChange,
  services,
  vehicle,
  city,
  voivodeship,
  industry = 'warsztat',
  priceMode: initialMode,
  onApplySuggestions,
}: Props) {
  const [mode, setMode] = useState<'net' | 'gross'>(initialMode);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [priceInputs, setPriceInputs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { execute } = useGetRidoAI();

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!open) return;
    setPriceInputs(services.map(service => service.currentPrice > 0 ? String(service.currentPrice) : ''));
  }, [open, services]);

  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    if (!open) {
      setHasFetched(false);
      return;
    }
    if (open && services.length > 0 && !hasFetched) {
      setHasFetched(true);
      fetchSuggestions();
    }
  }, [open, services]);

  // Re-fetch only when mode changes while open
  useEffect(() => {
    if (open && hasFetched && services.length > 0) {
      fetchSuggestions();
    }
  }, [mode]);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);

    try {
      // Prefer AI pricing first for live, vehicle-aware suggestions
      const aiWorked = await fetchAISuggestions();
      if (aiWorked) {
        return;
      }

      // Fallback to community DB
      const serviceNames = services.map(s => s.name.trim().toLowerCase().replace(/\s+/g, ' '));
      const { data: dbPrices } = await (supabase as any)
        .from('anonymous_service_prices')
        .select('service_name_normalized, price_net, price_gross')
        .in('service_name_normalized', serviceNames);

      const grouped = new Map<string, number[]>();
      if (dbPrices) {
        for (const p of dbPrices) {
          const arr = grouped.get(p.service_name_normalized) || [];
          arr.push(mode === 'gross' ? p.price_gross : p.price_net);
          grouped.set(p.service_name_normalized, arr);
        }
      }

      // Check if we have enough DB data (3+ prices per service)
      const allHaveData = serviceNames.every(n => (grouped.get(n)?.length || 0) >= 3);

      if (allHaveData) {
        const result: Suggestion[] = services.map((s, i) => {
          const prices = grouped.get(serviceNames[i]) || [];
          const sorted = prices.sort((a, b) => a - b);
          const hasPL = PL_PATTERNS.test(s.name);
          return {
            name: s.name,
            min: sorted[0] || 0,
            max: sorted[sorted.length - 1] || 0,
            note: hasPL ? `⚠️ P+L = 2 strony. Cena za jedną stronę: ${fmt(sorted[0] / 2)}–${fmt(sorted[sorted.length - 1] / 2)} zł` : null,
          };
        });
        setSuggestions(result);
      } else {
        setError('Sugestia chwilowo niedostępna. Spróbuj ponownie.');
      }
    } catch (e) {
      setError('Sugestia chwilowo niedostępna. Spróbuj ponownie.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAISuggestions = async () => {
    const vehicleDesc = vehicle
      ? `${vehicle.brand || ''} ${vehicle.model || ''} rok ${vehicle.year || ''} silnik ${vehicle.engine_capacity || ''}cc ${vehicle.fuel_type || ''}`.trim()
      : 'nieznany pojazd';

    const servicesList = services.map((s, index) => `${index + 1}. ${s.name} | aktualna cena: ${s.currentPrice || 0} zł (${mode})`).join('\n');

    const systemPrompt = `Jesteś ekspertem od wyceny usług motoryzacyjnych w Polsce.

Pojazd: ${vehicleDesc}
Usługi do wyceny (lista):
${servicesList}
Lokalizacja: ${city || 'nieznane'}, ${voivodeship || 'nieznane'}
Branża: ${industry}
Wyświetlaj ceny w: ${mode}

Dla każdej usługi z listy podaj realistyczny zakres cenowy OD-DO dla miasta użytkownika i typu pojazdu.
Uwzględnij markę, model, rok, silnik, lokalizację warsztatu oraz treść kosztorysu.
Jeśli aktualna cena jest zbyt niska lub zbyt wysoka, wskaż to krótko w note.
Jeśli usługa zawiera P+L, obie strony, x2 — uwzględnij to w cenie i dodaj uwagę.

Odpowiedz TYLKO w formacie JSON — tablica obiektów, kolejność taka sama jak lista wejściowa:
[
  { "name": "nazwa usługi", "min": liczba, "max": liczba, "currency": "PLN", "unit": "${mode}", "note": "uwaga jeśli P+L lub coś szczególnego, w przeciwnym razie null" }
]`;

    const result = await execute({
      feature: 'rido_price',
      taskType: 'pricing_suggestion',
      query: `Wycena usług: ${servicesList}`,
      systemPrompt,
      mode: 'pro',
      contextHints: {
        vehicle: vehicleDesc,
        city,
        voivodeship,
        industry,
        priceUnit: mode,
      },
    });

    if (!result || result.error) {
      return false;
    }

    try {
      let parsed: any[];
      const text = result.result || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON array found');
      }

      const mapped: Suggestion[] = services.map((s, i) => {
        const ai = parsed[i] || {};
        const hasPL = PL_PATTERNS.test(s.name);
        let note = ai.note || null;
        if (hasPL && !note) {
          note = `⚠️ P+L = 2 strony`;
        }
        return {
          name: s.name,
          min: ai.min || 0,
          max: ai.max || 0,
          note,
        };
      });
      setSuggestions(mapped);
      setError(null);
      return true;
    } catch {
      return false;
    }
  };

  const fmt = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const getSuggestedPrice = (index: number) => {
    const typed = Number((priceInputs[index] || '').replace(',', '.'));
    if (Number.isFinite(typed) && typed > 0) return typed;
    const suggestion = suggestions[index];
    if (!suggestion) return services[index]?.currentPrice || 0;
    return Math.round(((suggestion.min + suggestion.max) / 2) * 100) / 100;
  };

  const handlePriceChange = (index: number, value: string) => {
    setPriceInputs(prev => prev.map((item, idx) => idx === index ? value : item));
  };

  const handlePriceCommit = (index: number) => {
    const price = getSuggestedPrice(index);
    if (price > 0) {
      onApplySuggestions([{ index, price }]);
    }
  };

  const handleApplyAll = () => {
    const prices = services
      .map((_, index) => ({ index, price: getSuggestedPrice(index) }))
      .filter(item => item.price > 0);

    onApplySuggestions(prices);
    onOpenChange(false);
  };

  const vehicleLabel = vehicle
    ? `${vehicle.brand || ''} ${vehicle.model || ''} ${vehicle.engine_capacity ? vehicle.engine_capacity + 'cc' : ''}`.trim()
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Rido Wycena
            {vehicleLabel && <span className="text-muted-foreground font-normal">— {vehicleLabel}</span>}
            {city && <span className="text-muted-foreground font-normal">| {city}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Sprawdź zakres cen od AI, popraw <span className="font-medium text-foreground">Twoją cenę</span> i zatwierdź — zmiany od razu trafią do kosztorysu.
        </div>

        {/* Net/Gross toggle */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 w-fit">
          <Button
            variant={mode === 'net' ? 'default' : 'ghost'}
            size="sm"
            className="text-xs h-7"
            onClick={() => setMode('net')}
          >
            NETTO
          </Button>
          <Button
            variant={mode === 'gross' ? 'default' : 'ghost'}
            size="sm"
            className="text-xs h-7"
            onClick={() => setMode('gross')}
          >
            BRUTTO
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
            <span className="text-sm text-muted-foreground">Pobieranie sugestii cenowych...</span>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchSuggestions}>
              Spróbuj ponownie
            </Button>
          </div>
        ) : suggestions.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="p-2 text-left font-medium text-muted-foreground">USŁUGA</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-36">TWOJA CENA</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-28">OD</th>
                  <th className="p-2 text-right font-medium text-muted-foreground w-28">DO</th>
                  <th className="p-2 text-left font-medium text-muted-foreground min-w-[320px]">UWAGI RidoAI</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s, i) => (
                  <tr key={i} className="border-b align-top hover:bg-accent/20 transition-colors">
                    <td className="p-3 font-medium">
                      <div className="line-clamp-2">{s.name}</div>
                    </td>
                    <td className="p-3">
                      <Input
                        value={priceInputs[i] ?? ''}
                        onChange={(e) => handlePriceChange(i, e.target.value)}
                        onBlur={() => handlePriceCommit(i)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur();
                          }
                        }}
                        inputMode="decimal"
                        className="h-10 text-right tabular-nums"
                        placeholder={s.min && s.max ? fmt(Math.round((s.min + s.max) / 2)) : '0'}
                      />
                    </td>
                    <td className="p-2 text-right tabular-nums">{fmt(s.min)} zł</td>
                    <td className="p-2 text-right tabular-nums">{fmt(s.max)} zł</td>
                    <td className="p-3">
                      {s.note ? (
                        <p className="text-sm leading-6 text-foreground/80">{s.note}</p>
                      ) : (
                        <span className="text-sm text-muted-foreground">Brak dodatkowych uwag</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center py-8 text-muted-foreground text-sm">Brak danych do wyświetlenia</p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zamknij</Button>
          {suggestions.length > 0 && (
            <Button onClick={handleApplyAll} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Zastosuj ceny do kosztorysu
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
