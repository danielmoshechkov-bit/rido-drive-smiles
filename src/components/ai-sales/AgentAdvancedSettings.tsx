import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export interface AgentAdvanced {
  ideal_customer: string;
  service_guarantee: string;
  case_studies: string;
  objection_price: string;
  objection_think: string;
  objection_competitor: string;
  objection_time: string;
  objection_trust: string;
  objection_diy: string;
  custom_objections: { name: string; answer: string }[];
  tone: string;
}

export const EMPTY_ADVANCED: AgentAdvanced = {
  ideal_customer: "", service_guarantee: "", case_studies: "",
  objection_price: "", objection_think: "", objection_competitor: "",
  objection_time: "", objection_trust: "", objection_diy: "",
  custom_objections: [], tone: "semiformal",
};

const OBJECTIONS = [
  { key: "price", label: 'Za drogo / nie mam budżetu' },
  { key: "think", label: 'Muszę się zastanowić' },
  { key: "competitor", label: 'Znalazłem taniej u konkurencji' },
  { key: "time", label: 'Nie mam teraz czasu' },
  { key: "trust", label: 'Skąd wiem, że jesteście dobrzy?' },
  { key: "diy", label: 'Zrobię to sam' },
] as const;

const TONES = [
  { value: "formal", label: "🎩 Formalny (Pan/Pani)" },
  { value: "semiformal", label: "👔 Półformalny" },
  { value: "casual", label: "😊 Nieformalny (ty)" },
];

export function AgentAdvancedSettings({
  value,
  onChange,
}: {
  value: AgentAdvanced;
  onChange: (v: AgentAdvanced) => void;
}) {
  const set = (patch: Partial<AgentAdvanced>) => onChange({ ...value, ...patch });

  const updateCustom = (i: number, field: "name" | "answer", v: string) =>
    set({ custom_objections: value.custom_objections.map((o, idx) => (idx === i ? { ...o, [field]: v } : o)) });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h4 className="font-semibold text-sm border-b pb-1">Argumenty, których agent może użyć</h4>
        <div className="space-y-1">
          <Label>Kogo obsługujecie najlepiej</Label>
          <Textarea rows={2} value={value.ideal_customer} onChange={(e) => set({ ideal_customer: e.target.value })}
            placeholder="np. właściciele aut premium po gwarancji, flotowcy z okolicy" />
        </div>
        <div className="space-y-1">
          <Label>Gwarancja</Label>
          <Textarea rows={2} value={value.service_guarantee} onChange={(e) => set({ service_guarantee: e.target.value })}
            placeholder="np. 12 miesięcy gwarancji na robociznę" />
        </div>
        <div className="space-y-1">
          <Label>Przykłady realizacji</Label>
          <Textarea rows={3} value={value.case_studies} onChange={(e) => set({ case_studies: e.target.value })}
            placeholder="problem → co zrobiliście → efekt" />
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="font-semibold text-sm border-b pb-1">Trudne pytania — odpowiedz raz, agent zapamięta</h4>
        {OBJECTIONS.map((o) => (
          <div key={o.key} className="border-l-4 border-destructive/40 pl-3 space-y-1">
            <Label className="text-sm font-medium">„{o.label}"</Label>
            <Textarea
              rows={2}
              value={(value as any)[`objection_${o.key}`] || ""}
              onChange={(e) => set({ [`objection_${o.key}`]: e.target.value } as Partial<AgentAdvanced>)}
              placeholder="Jak Ty na to odpowiadasz?"
            />
          </div>
        ))}

        {value.custom_objections.map((o, i) => (
          <div key={i} className="border-l-4 border-primary/40 pl-3 space-y-1">
            <Input className="text-sm font-medium" value={o.name} onChange={(e) => updateCustom(i, "name", e.target.value)} placeholder="Pytanie klienta…" />
            <Textarea rows={2} value={o.answer} onChange={(e) => updateCustom(i, "answer", e.target.value)} placeholder="Twoja odpowiedź…" />
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => set({ custom_objections: [...value.custom_objections, { name: "", answer: "" }] })}>
          <Plus className="h-3 w-3 mr-1" /> Dodaj własne pytanie
        </Button>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-sm border-b pb-1">Ton rozmowy</h4>
        <div className="flex flex-col sm:flex-row gap-2">
          {TONES.map((t) => (
            <button
              key={t.value}
              onClick={() => set({ tone: t.value })}
              className={`flex-1 p-2 rounded-lg border-2 text-sm transition-colors ${value.tone === t.value ? "border-primary bg-primary/5" : "border-muted hover:border-primary/30"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
