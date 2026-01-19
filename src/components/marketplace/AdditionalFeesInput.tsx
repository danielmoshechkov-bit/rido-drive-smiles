import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

export interface AdditionalFee {
  description: string;
  amount: string;
}

interface AdditionalFeesInputProps {
  fees: AdditionalFee[];
  onChange: (fees: AdditionalFee[]) => void;
}

export function AdditionalFeesInput({ fees, onChange }: AdditionalFeesInputProps) {
  const addFee = () => {
    onChange([...fees, { description: "", amount: "" }]);
  };

  const removeFee = (index: number) => {
    onChange(fees.filter((_, i) => i !== index));
  };

  const updateFee = (index: number, field: keyof AdditionalFee, value: string) => {
    const newFees = [...fees];
    newFees[index] = { ...newFees[index], [field]: value };
    onChange(newFees);
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Dodatkowe opłaty</Label>
      
      {fees.map((fee, index) => (
        <div key={index} className="flex gap-2 items-start">
          <div className="flex-1">
            <Input
              placeholder="Opis opłaty (np. ubezpieczenie GAP)"
              value={fee.description}
              onChange={(e) => updateFee(index, "description", e.target.value)}
            />
          </div>
          <div className="w-32">
            <Input
              type="number"
              placeholder="Kwota PLN"
              value={fee.amount}
              onChange={(e) => updateFee(index, "amount", e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={() => removeFee(index)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={addFee}
      >
        <Plus className="h-4 w-4" />
        Dodaj opłatę
      </Button>
    </div>
  );
}
