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
import { SlidersHorizontal } from "lucide-react";
import {
  ATTRIBUTE_GROUPS,
  attributesForType,
  type AttributeDefinition,
  type PropertyTypeDb,
} from "@/lib/listing-attributes";

export type AttributeFilterValue = Record<string, boolean | string | string[]>;

interface AdvancedFiltersSheetProps {
  propertyType: PropertyTypeDb | null;
  value: AttributeFilterValue;
  onChange: (next: AttributeFilterValue) => void;
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
  value,
  onChange,
  matchCount,
  triggerClassName,
}: AdvancedFiltersSheetProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AttributeFilterValue>(value);

  // Kiedy otwieramy sheet — synchronizujemy draft z aktualnym URL-em
  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(value);
    setOpen(next);
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

  const clearAll = () => setDraft({});

  const apply = () => {
    onChange(draft);
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

        <div className="mt-6">
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
