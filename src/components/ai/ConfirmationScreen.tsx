import { useState } from "react";
import { Check, X, AlertTriangle, Edit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ConfirmationSummary {
  title: string;
  bullets: string[];
  editable_fields: string[];
}

interface ConfirmationScreenProps {
  intent: string;
  summary: ConfirmationSummary;
  draft?: Record<string, unknown>;
  onConfirm: (editedDraft: Record<string, unknown>) => void;
  onCancel: () => void;
  isExecuting?: boolean;
}

const INTENT_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  create_invoice: { label: "Wystawienie faktury", icon: "📄", color: "bg-blue-100 text-blue-800" },
  add_contractor: { label: "Dodanie kontrahenta", icon: "👤", color: "bg-green-100 text-green-800" },
  verify_contractor: { label: "Weryfikacja kontrahenta", icon: "🔍", color: "bg-yellow-100 text-yellow-800" },
  send_invoice_email: { label: "Wysyłka faktury", icon: "📧", color: "bg-purple-100 text-purple-800" },
  submit_ksef: { label: "Wysyłka do KSeF", icon: "🏛️", color: "bg-indigo-100 text-indigo-800" },
  create_lead: { label: "Utworzenie zapytania", icon: "📝", color: "bg-orange-100 text-orange-800" },
};

export function ConfirmationScreen({
  intent,
  summary,
  draft = {},
  onConfirm,
  onCancel,
  isExecuting = false,
}: ConfirmationScreenProps) {
  const [editedDraft, setEditedDraft] = useState<Record<string, unknown>>(draft);
  const [editingField, setEditingField] = useState<string | null>(null);

  const intentInfo = INTENT_LABELS[intent] || { 
    label: intent, 
    icon: "⚙️", 
    color: "bg-gray-100 text-gray-800" 
  };

  const handleFieldChange = (field: string, value: string) => {
    setEditedDraft(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const getFieldValue = (field: string): string => {
    const keys = field.split('.');
    let value: unknown = editedDraft;
    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[key];
      } else {
        return '';
      }
    }
    return String(value || '');
  };

  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      'recipient_nip': 'NIP kontrahenta',
      'recipient_name': 'Nazwa kontrahenta',
      'gross_amount': 'Kwota brutto',
      'net_amount': 'Kwota netto',
      'description': 'Opis',
      'email': 'Email',
      'nip': 'NIP',
      'name': 'Nazwa',
      'address': 'Adres',
    };
    return labels[field] || field;
  };

  return (
    <Card className="w-full max-w-lg mx-auto border-2 border-primary/20 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{intentInfo.icon}</span>
          <div className="flex-1">
            <Badge className={cn("mb-1", intentInfo.color)}>
              {intentInfo.label}
            </Badge>
            <CardTitle className="text-lg">{summary.title}</CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Warning banner */}
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-amber-800">
            Ta akcja wymaga potwierdzenia. Sprawdź dane przed kontynuacją.
          </p>
        </div>

        {/* Summary bullets */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Podsumowanie:</p>
          <ul className="space-y-1">
            {summary.bullets.map((bullet, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <span className="text-primary mt-1">•</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Editable fields */}
        {summary.editable_fields.length > 0 && (
          <div className="space-y-3 pt-2 border-t">
            <p className="text-sm font-medium text-muted-foreground">
              Edytowalne pola (kliknij aby zmienić):
            </p>
            {summary.editable_fields.map((field) => (
              <div key={field} className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {getFieldLabel(field)}
                </Label>
                {editingField === field ? (
                  <div className="flex gap-2">
                    <Input
                      value={getFieldValue(field)}
                      onChange={(e) => handleFieldChange(field, e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingField(null)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-between p-2 bg-muted/50 rounded-md cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => setEditingField(field)}
                  >
                    <span className="text-sm font-medium">
                      {getFieldValue(field) || '(brak)'}
                    </span>
                    <Edit2 className="h-3 w-3 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 pt-4 border-t">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={isExecuting}
        >
          <X className="h-4 w-4 mr-2" />
          Anuluj
        </Button>
        <Button
          className="flex-1"
          onClick={() => onConfirm(editedDraft)}
          disabled={isExecuting}
        >
          {isExecuting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Wykonuję...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Potwierdź
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
