/**
 * Iteracja 2 — panel filtrów zaawansowanych generowany ze słownika
 * `src/lib/listing-attributes.ts`.
 *
 * KONTRAKT:
 *  - UI generuje się z LISTING_ATTRIBUTES — nie hardcoduj checkboxów
 *  - stan filtrów żyje w URL (przez `useUrlFilters` w rodzicu, ten
 *    komponent jest tylko presentation-layerem: dostaje `value` i `onChange`)
 *  - kliknięcie „Wyczyść" resetuje wszystkie attributes; „Pokaż X ofert"
 *    zamyka sheet
 *
 * NIE robi zapytań do bazy — count przekazuje rodzic (jest po stronie
 * klienta w istniejącym flow RealEstateMarketplace, gdzie i tak
 * filtrujemy in-memory).
 */

import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SlidersHorizontal } from "lucide-react";
import {
  ATTRIBUTE_GROUPS,
  attributesForType,
  type AttributeDefinition,
  type PropertyTypeDb,
} from "@/lib/listing-attributes";

export type AttributeFilterValue = Record<string, boolean | string | string[]>;

/**
 * Zakresy liczbowe (iter. 2 review — "Zakresy: TAK, teraz").
 * Wszystko opcjonalne. `rent_min/max` i `deposit_min/max` renderują się
 * TYLKO gdy `transactionType === 'wynajem'` (albo wynajem-krotkoterminowy).
 */
export interface RangeFilterValue {
  floor_min?: number;
  floor_max?: number;
  build_year_min?: number;
  build_year_max?: number;
  rent_min?: number;
  rent_max?: number;
  deposit_min?: number;
  deposit_max?: number;
}

interface AdvancedFiltersSheetProps {
  propertyType: PropertyTypeDb | null;
  /** iter. 2: pola najmu widoczne tylko dla transakcji wynajem/krótkoterminowy */
  transactionType?: string | null;
  value: AttributeFilterValue;
  onChange: (next: AttributeFilterValue) => void;
  ranges?: RangeFilterValue;
  onRangesChange?: (next: RangeFilterValue) => void;
  /** liczba ofert pasujących do aktualnie ustawionych filtrów (client-side) */
  matchCount: number;
  triggerClassName?: string;
}

function isSelected(value: AttributeFilterValue, def: AttributeDefinition, opt?: string): boolean {
  const v = value[def.key];
  if (def.type === "bool") return v === true;
  if (def.type === "enum") return v === opt;
  if (def.type === "multi") return Array.isArray(v) && opt !== undefined && v.includes(opt);
  return false;
}

export function AdvancedFiltersSheet({
  propertyType,
  transactionType,
  value,
  onChange,
  ranges,
  onRangesChange,
  matchCount,
  triggerClassName,
}: AdvancedFiltersSheetProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AttributeFilterValue>(value);
  const [rangeDraft, setRangeDraft] = useState<RangeFilterValue>(ranges ?? {});

  // Kiedy otwieramy sheet — synchronizujemy draft z aktualnym URL-em
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraft(value);
      setRangeDraft(ranges ?? {});
    }
    setOpen(next);
  };

  const showRentFields = transactionType === "wynajem" || transactionType === "wynajem-krotkoterminowy";

  const setRange = (key: keyof RangeFilterValue, raw: string) => {
    const num = raw === "" ? undefined : Number(raw);
    setRangeDraft((r) => ({ ...r, [key]: Number.isFinite(num as number) ? (num as number) : undefined }));
  };


  const attrs = useMemo(() => attributesForType(propertyType), [propertyType]);
  const grouped = useMemo(() => {
    const g: Record<string, AttributeDefinition[]> = {};
    for (const a of attrs) {
      (g[a.group] ??= []).push(a);
    }
    return g;
  }, [attrs]);

  const activeCount = Object.entries(value).filter(([, v]) => {
    if (Array.isArray(v)) return v.length > 0;
    return v === true || (typeof v === "string" && v.length > 0);
  }).length;

  const toggleBool = (def: AttributeDefinition) => {
    setDraft((d) => {
      const n = { ...d };
      if (n[def.key]) delete n[def.key];
      else n[def.key] = true;
      return n;
    });
  };

  const setEnum = (def: AttributeDefinition, opt: string) => {
    setDraft((d) => {
      const n = { ...d };
      if (n[def.key] === opt) delete n[def.key];
      else n[def.key] = opt;
      return n;
    });
  };

  const toggleMulti = (def: AttributeDefinition, opt: string) => {
    setDraft((d) => {
      const current = Array.isArray(d[def.key]) ? (d[def.key] as string[]) : [];
      const next = current.includes(opt) ? current.filter((x) => x !== opt) : [...current, opt];
      const n = { ...d };
      if (next.length === 0) delete n[def.key];
      else n[def.key] = next;
      return n;
    });
  };

  const clearAll = () => {
    setDraft({});
    setRangeDraft({});
  };

  const apply = () => {
    onChange(draft);
    onRangesChange?.(rangeDraft);
    setOpen(false);
  };


  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" className={triggerClassName}>
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          Filtry zaawansowane
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filtry zaawansowane</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Zakresy — piętro, rok budowy, czynsz, kaucja (iter. 2) */}
          <div className="space-y-4 pb-4 border-b border-border">
            <div className="text-sm font-semibold text-slate-900">Zakresy</div>
            <RangeRow
              label="Piętro"
              minVal={rangeDraft.floor_min}
              maxVal={rangeDraft.floor_max}
              onMin={(v) => setRange("floor_min", v)}
              onMax={(v) => setRange("floor_max", v)}
              placeholderMin="0"
              placeholderMax="10"
            />
            <RangeRow
              label="Rok budowy"
              minVal={rangeDraft.build_year_min}
              maxVal={rangeDraft.build_year_max}
              onMin={(v) => setRange("build_year_min", v)}
              onMax={(v) => setRange("build_year_max", v)}
              placeholderMin="1900"
              placeholderMax={String(new Date().getFullYear())}
            />
            {showRentFields && (
              <>
                <RangeRow
                  label="Czynsz administracyjny (zł/mies.)"
                  minVal={rangeDraft.rent_min}
                  maxVal={rangeDraft.rent_max}
                  onMin={(v) => setRange("rent_min", v)}
                  onMax={(v) => setRange("rent_max", v)}
                  placeholderMin="0"
                  placeholderMax="2000"
                />
                <RangeRow
                  label="Kaucja (zł)"
                  minVal={rangeDraft.deposit_min}
                  maxVal={rangeDraft.deposit_max}
                  onMin={(v) => setRange("deposit_min", v)}
                  onMax={(v) => setRange("deposit_max", v)}
                  placeholderMin="0"
                  placeholderMax="10000"
                />
              </>
            )}
          </div>

          <Accordion type="multiple" defaultValue={Object.keys(grouped)}>

            {Object.entries(grouped).map(([groupKey, defs]) => (
              <AccordionItem key={groupKey} value={groupKey}>
                <AccordionTrigger className="text-sm font-semibold">
                  {ATTRIBUTE_GROUPS[groupKey as keyof typeof ATTRIBUTE_GROUPS]}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 py-1">
                    {defs.map((def) => {
                      if (def.type === "bool") {
                        return (
                          <label
                            key={def.key}
                            className="flex items-center gap-3 cursor-pointer text-sm"
                          >
                            <Checkbox
                              checked={isSelected(draft, def)}
                              onCheckedChange={() => toggleBool(def)}
                            />
                            <span>{def.labelPl}</span>
                          </label>
                        );
                      }
                      return (
                        <div key={def.key} className="space-y-2">
                          <div className="text-sm font-medium text-slate-800">{def.labelPl}</div>
                          <div className="flex flex-wrap gap-2">
                            {def.values?.map((opt) => {
                              const selected = isSelected(draft, def, opt.value);
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() =>
                                    def.type === "enum"
                                      ? setEnum(def, opt.value)
                                      : toggleMulti(def, opt.value)
                                  }
                                  className={
                                    "px-3 py-1.5 rounded-full border text-xs transition-colors " +
                                    (selected
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-background hover:bg-muted border-border")
                                  }
                                >
                                  {opt.labelPl}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <SheetFooter className="mt-6 flex-row gap-2 sm:justify-between">
          <Button variant="ghost" onClick={clearAll} className="flex-1">
            Wyczyść
          </Button>
          <Button onClick={apply} className="flex-1">
            Pokaż {matchCount} ofert
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Wiersz zakresu od–do (iter. 2). Puste = brak ograniczenia. */
function RangeRow({
  label,
  minVal,
  maxVal,
  onMin,
  onMax,
  placeholderMin,
  placeholderMax,
}: {
  label: string;
  minVal?: number;
  maxVal?: number;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  placeholderMin?: string;
  placeholderMax?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-700">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          value={minVal ?? ""}
          onChange={(e) => onMin(e.target.value)}
          placeholder={placeholderMin ? `od ${placeholderMin}` : "od"}
          className="h-9"
        />
        <span className="text-slate-400">–</span>
        <Input
          type="number"
          inputMode="numeric"
          value={maxVal ?? ""}
          onChange={(e) => onMax(e.target.value)}
          placeholder={placeholderMax ? `do ${placeholderMax}` : "do"}
          className="h-9"
        />
      </div>
    </div>
  );
}

