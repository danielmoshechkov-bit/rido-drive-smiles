import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Sparkles, Upload, FileText, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CreateTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fleetId: string;
  onCreated: () => void;
  editTemplate?: { id: string; name: string; content: string; version: string } | null;
}

function extractFields(content: string): string[] {
  const matches = content.match(/\{\{([A-Z0-9_]+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}

export const CreateTemplateModal = ({ open, onOpenChange, fleetId, onCreated, editTemplate }: CreateTemplateModalProps) => {
  const [tab, setTab] = useState<'describe' | 'upload'>('describe');
  const [prompt, setPrompt] = useState('');
  const [generatedContent, setGeneratedContent] = useState(editTemplate?.content || '');
  const [corrections, setCorrections] = useState('');
  const [templateName, setTemplateName] = useState(editTemplate?.name || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const isEditing = !!editTemplate;

  const handleGenerate = async () => {
    if (!prompt.trim() && !corrections.trim()) {
      toast.error('Wpisz opis dokumentu');
      return;
    }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-document-ai', {
        body: {
          prompt: prompt.trim(),
          existingContent: generatedContent || undefined,
          corrections: corrections.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.content) {
        setGeneratedContent(data.content);
        setCorrections('');
        toast.success('Dokument wygenerowany');
      } else {
        throw new Error('Brak treści');
      }
    } catch (err: any) {
      toast.error('Nie udało się wygenerować dokumentu. Spróbuj ponownie.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Maksymalny rozmiar pliku to 10MB');
      return;
    }
    if (!file.name.match(/\.(pdf|docx)$/i)) {
      toast.error('Dozwolone formaty: PDF, DOCX');
      return;
    }
    setUploadedFile(file);
    setIsProcessingFile(true);
    try {
      // Read file as text (simplified - for real use you'd parse PDF/DOCX)
      const text = await file.text();
      const { data, error } = await supabase.functions.invoke('generate-document-ai', {
        body: {
          prompt: `Przeanalizuj ten dokument i stwórz z niego szablon z polami {{NAZWA_POLA}} do uzupełnienia. Zachowaj oryginalną strukturę. Dokument:\n\n${text.slice(0, 8000)}`,
        },
      });
      if (error) throw error;
      if (data?.content) {
        setGeneratedContent(data.content);
        setTemplateName(file.name.replace(/\.(pdf|docx)$/i, ''));
        toast.success(`Znaleziono ${extractFields(data.content).length} pól do uzupełnienia`);
      }
    } catch {
      toast.error('Nie udało się przetworzyć pliku');
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      toast.error('Podaj nazwę szablonu');
      return;
    }
    if (!generatedContent.trim()) {
      toast.error('Szablon nie ma treści');
      return;
    }
    setIsSaving(true);
    try {
      const fields = extractFields(generatedContent);
      const code = templateName.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_');

      if (isEditing && editTemplate) {
        // Increment version
        const parts = editTemplate.version.split('.');
        const newVersion = `${parts[0]}.${parseInt(parts[1] || '0') + 1}`;
        
        const { error } = await (supabase as any)
          .from('fleet_document_templates')
          .update({
            name: templateName,
            content: generatedContent,
            fields,
            version: newVersion,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editTemplate.id);
        if (error) throw error;
        toast.success(`Szablon zaktualizowany (v${newVersion})`);
      } else {
        const { error } = await (supabase as any)
          .from('fleet_document_templates')
          .insert({
            fleet_id: fleetId,
            name: templateName,
            code,
            content: generatedContent,
            fields,
            version: '1.0',
            is_builtin: false,
            status: 'active',
          });
        if (error) throw error;
        toast.success('Szablon zapisany');
      }
      onCreated();
      onOpenChange(false);
      resetState();
    } catch (err: any) {
      toast.error('Błąd zapisu szablonu');
    } finally {
      setIsSaving(false);
    }
  };

  const resetState = () => {
    setPrompt('');
    setGeneratedContent('');
    setCorrections('');
    setTemplateName('');
    setUploadedFile(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetState(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {isEditing ? 'Edytuj szablon' : 'Stwórz nowy szablon'}
          </DialogTitle>
        </DialogHeader>

        {!isEditing && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="describe" className="gap-2">
                <Sparkles className="h-4 w-4" /> Opisz dokument
              </TabsTrigger>
              <TabsTrigger value="upload" className="gap-2">
                <Upload className="h-4 w-4" /> Wgraj dokument
              </TabsTrigger>
            </TabsList>

            <TabsContent value="describe" className="space-y-4 mt-4">
              {!generatedContent ? (
                <>
                  <Textarea
                    placeholder="Opisz dokładnie jaki dokument chcesz stworzyć — jego cel, strony umowy, kluczowe warunki, pola do uzupełnienia..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={6}
                    className="resize-none"
                  />
                  <Button onClick={handleGenerate} disabled={isGenerating} className="w-full gap-2" style={{ backgroundColor: '#6C5CE7' }}>
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isGenerating ? 'Claude generuje dokument...' : 'Generuj szablon z AI'}
                  </Button>
                </>
              ) : (
                <GeneratedContentEditor
                  content={generatedContent}
                  onChange={setGeneratedContent}
                  corrections={corrections}
                  onCorrectionsChange={setCorrections}
                  onUpdate={handleGenerate}
                  isUpdating={isGenerating}
                  templateName={templateName}
                  onNameChange={setTemplateName}
                  onSave={handleSave}
                  isSaving={isSaving}
                />
              )}
            </TabsContent>

            <TabsContent value="upload" className="space-y-4 mt-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-3">Przeciągnij plik PDF lub DOCX tutaj</p>
                <label>
                  <input type="file" accept=".pdf,.docx" onChange={handleFileUpload} className="hidden" />
                  <Button variant="outline" asChild className="cursor-pointer">
                    <span>Wybierz plik</span>
                  </Button>
                </label>
                <p className="text-xs text-muted-foreground mt-2">Max 10MB, PDF lub DOCX</p>
              </div>
              {isProcessingFile && (
                <div className="flex items-center gap-2 justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm text-muted-foreground">Analizuję dokument...</span>
                </div>
              )}
              {generatedContent && !isProcessingFile && (
                <GeneratedContentEditor
                  content={generatedContent}
                  onChange={setGeneratedContent}
                  corrections={corrections}
                  onCorrectionsChange={setCorrections}
                  onUpdate={handleGenerate}
                  isUpdating={isGenerating}
                  templateName={templateName}
                  onNameChange={setTemplateName}
                  onSave={handleSave}
                  isSaving={isSaving}
                />
              )}
            </TabsContent>
          </Tabs>
        )}

        {isEditing && generatedContent && (
          <GeneratedContentEditor
            content={generatedContent}
            onChange={setGeneratedContent}
            corrections={corrections}
            onCorrectionsChange={setCorrections}
            onUpdate={handleGenerate}
            isUpdating={isGenerating}
            templateName={templateName}
            onNameChange={setTemplateName}
            onSave={handleSave}
            isSaving={isSaving}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

function GeneratedContentEditor({
  content, onChange, corrections, onCorrectionsChange,
  onUpdate, isUpdating, templateName, onNameChange, onSave, isSaving,
}: {
  content: string; onChange: (v: string) => void;
  corrections: string; onCorrectionsChange: (v: string) => void;
  onUpdate: () => void; isUpdating: boolean;
  templateName: string; onNameChange: (v: string) => void;
  onSave: () => void; isSaving: boolean;
}) {
  const fields = extractFields(content);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Opisz poprawki..."
          value={corrections}
          onChange={(e) => onCorrectionsChange(e.target.value)}
          className="flex-1"
        />
        <Button onClick={onUpdate} disabled={isUpdating} variant="outline" size="sm" className="gap-1 shrink-0">
          {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Zaktualizuj
        </Button>
      </div>

      <div className="relative">
        <Textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          rows={16}
          className="font-mono text-sm resize-none"
        />
      </div>

      {fields.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground">Pola ({fields.length}):</span>
          {fields.map(f => (
            <span key={f} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#6C5CE720', color: '#6C5CE7' }}>
              {`{{${f}}}`}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Label className="text-sm">Nazwa szablonu</Label>
          <Input
            placeholder="np. Umowa najmu pojazdu"
            value={templateName}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>
        <Button onClick={onSave} disabled={isSaving} className="gap-2 shrink-0" style={{ backgroundColor: '#6C5CE7' }}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Zapisz szablon
        </Button>
      </div>
    </div>
  );
}
