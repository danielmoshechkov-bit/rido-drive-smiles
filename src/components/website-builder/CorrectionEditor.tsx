import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Edit3, 
  X, 
  Send, 
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CorrectionEditorProps {
  projectId: string;
  elementSelector: string;
  elementDescription: string;
  onClose: () => void;
  onApplied: (newHtml: string) => void;
  correctionsRemaining: number;
}

export function CorrectionEditor({
  projectId,
  elementSelector,
  elementDescription,
  onClose,
  onApplied,
  correctionsRemaining,
}: CorrectionEditorProps) {
  const [shortNote, setShortNote] = useState('');
  const [fullDescription, setFullDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleSubmit = async () => {
    if (!shortNote.trim()) {
      toast.error('Dodaj krótką notatkę');
      return;
    }

    if (correctionsRemaining <= 0) {
      toast.error('Wykorzystałeś limit poprawek. Kup pakiet dodatkowy.');
      return;
    }

    setLoading(true);
    try {
      // Create correction record
      const { data: correction, error: correctionError } = await supabase
        .from('website_corrections')
        .insert({
          project_id: projectId,
          element_selector: elementSelector,
          element_description: elementDescription,
          short_note: shortNote,
          full_description: fullDescription,
          status: 'processing',
        })
        .select()
        .single();

      if (correctionError) throw correctionError;

      // Call AI to apply correction
      const { data, error } = await supabase.functions.invoke('website-correction', {
        body: {
          projectId,
          correctionId: correction.id,
          elementSelector,
          shortNote,
          fullDescription,
        },
      });

      if (error) throw error;

      // Update correction status
      await supabase
        .from('website_corrections')
        .update({ 
          status: 'applied',
          ai_response: data.response,
          applied_at: new Date().toISOString(),
        })
        .eq('id', correction.id);

      // Get current corrections count and update
      const { data: project } = await supabase
        .from('website_projects')
        .select('corrections_used')
        .eq('id', projectId)
        .single();

      await supabase
        .from('website_projects')
        .update({ 
          corrections_used: (project?.corrections_used || 0) + 1,
          generated_html: data.newHtml,
        })
        .eq('id', projectId);

      setApplied(true);
      onApplied(data.newHtml);
      toast.success('Poprawka zastosowana!');
    } catch (error: any) {
      toast.error('Błąd: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (applied) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="flex items-center justify-center py-6">
          <div className="text-center">
            <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="font-medium">Poprawka zastosowana!</p>
            <Button variant="ghost" size="sm" onClick={onClose} className="mt-2">
              Zamknij
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Edit3 className="h-4 w-4" />
            Dodaj poprawkę
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selected element info */}
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm font-medium">Wybrany element:</p>
          <p className="text-sm text-muted-foreground">{elementDescription}</p>
        </div>

        {/* Corrections remaining */}
        <div className="flex items-center gap-2">
          {correctionsRemaining > 0 ? (
            <Badge variant="secondary">
              Pozostało poprawek: {correctionsRemaining}
            </Badge>
          ) : (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Brak pozostałych poprawek
            </Badge>
          )}
        </div>

        {/* Short note */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Krótka notatka *</label>
          <Textarea
            placeholder="np. Zmień kolor na niebieski"
            value={shortNote}
            onChange={(e) => setShortNote(e.target.value)}
            rows={2}
          />
        </div>

        {/* Full description */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Pełny opis (opcjonalnie)</label>
          <Textarea
            placeholder="Opisz dokładniej co chcesz zmienić..."
            value={fullDescription}
            onChange={(e) => setFullDescription(e.target.value)}
            rows={3}
          />
        </div>

        {/* Submit */}
        <Button 
          onClick={handleSubmit} 
          disabled={loading || !shortNote.trim() || correctionsRemaining <= 0}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Aplikuję...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Zastosuj poprawkę
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
