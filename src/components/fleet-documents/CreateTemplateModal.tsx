import { useState, useRef, DragEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Sparkles, Upload, FileText, Save, Paperclip, X } from 'lucide-react';
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
  const [exampleFiles, setExampleFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exampleInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!editTemplate;

  const handleGenerate = async () => {
    if (!prompt.trim() && !corrections.trim()) {
      toast.error('Wpisz opis dokumentu');
      return;
    }
    if (!templateName.trim() && !generatedContent) {
      toast.error('Podaj nazwę szablonu');
      return;
    }
    setIsGenerating(true);
    try {
      let userMessage = prompt.trim();
      
      // Add example files content
      if (exampleFiles.length > 0 && !generatedContent) {
        const fileTexts: string[] = [];
        for (const f of exampleFiles) {
          try {
            const text = await f.text();
            fileTexts.push(`--- Przykład: ${f.name} ---\n${text.slice(0, 4000)}\n---`);
          } catch { /* skip binary */ }
        }
        if (fileTexts.length > 0) {
          userMessage += `\n\nOto przykłady dokumentów na których się wzorujesz:\n${fileTexts.join('\n\n')}`;
        }
      }

      const { data, error } = await supabase.functions.invoke('generate-document-ai', {
        body: {
          prompt: userMessage,
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

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Maksymalny rozmiar pliku to 10MB');
      return;
    }
    if (!file.name.match(/\.(pdf|docx|doc)$/i)) {
      toast.error('Dozwolone formaty: PDF, DOCX');
      return;
    }
    setUploadedFile(file);
    setIsProcessingFile(true);
    try {
      const text = await file.text();
      const { data, error } = await supabase.functions.invoke('generate-document-ai', {
        body: {
          prompt: `Przeanalizuj ten dokument i stwórz z niego szablon z polami {{NAZWA_POLA}} do uzupełnienia. Zachowaj oryginalną strukturę. Dokument:\n\n${text.slice(0, 8000)}`,
        },
      });
      if (error) throw error;
      if (data?.content) {
        setGeneratedContent(data.content);
        if (!templateName) {
          setTemplateName(file.name.replace(/\.(pdf|docx|doc)$/i, ''));
        }
        toast.success(`Znaleziono ${extractFields(data.content).length} pól do uzupełnienia`);
      } else {
        throw new Error('Brak treści');
      }
    } catch {
      toast.error('Nie udało się przetworzyć pliku. Spróbuj ponownie.');
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleExampleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(f => f.size <= 10 * 1024 * 1024);
    if (valid.length < files.length) toast.error('Pominięto pliki > 10MB');
    setExampleFiles(prev => [...prev, ...valid]);
  };

  const removeExample = (index: number) => {
    setExampleFiles(prev => prev.filter((_, i) => i !== index));
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
    setExampleFiles([]);
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

        {/* Template name — always visible at top */}
        <div>
          <Label className="text-sm font-medium">Nazwa szablonu *</Label>
          <Input
            placeholder="np. Umowa najmu pojazdu, Protokół zdawczo-odbiorczy..."
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="mt-1"
          />
        </div>

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

                  {/* Example files */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Załącz przykłady (opcjonalnie)</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1 h-7 text-xs"
                        onClick={() => exampleInputRef.current?.click()}
                      >
                        <Paperclip className="h-3 w-3" /> Dodaj plik
                      </Button>
                      <input
                        ref={exampleInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png"
                        onChange={handleExampleFiles}
                        className="hidden"
                      />
                    </div>
                    {exampleFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {exampleFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted">
                            <Paperclip className="h-3 w-3 text-muted-foreground" />
                            <span className="max-w-[150px] truncate">{f.name}</span>
                            <button onClick={() => removeExample(i)} className="ml-1 hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Dodaj istniejące dokumenty jako przykłady — AI wykorzysta je jako wzór do wygenerowania szablonu
                    </p>
                  </div>

                  <Button onClick={handleGenerate} disabled={isGenerating || !templateName.trim()} className="w-full gap-2" style={{ backgroundColor: '#6C5CE7' }}>
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
                  onSave={handleSave}
                  isSaving={isSaving}
                />
              )}
            </TabsContent>

            <TabsContent value="upload" className="space-y-4 mt-4">
              {!generatedContent ? (
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                    isDragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isProcessingFile ? (
                    <div className="flex items-center gap-2 justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm text-muted-foreground">Analizuję dokument...</span>
                    </div>
                  ) : uploadedFile ? (
                    <div className="flex items-center gap-2 justify-center">
                      <FileText className="h-5 w-5 text-green-600" />
                      <span className="text-sm font-medium">{uploadedFile.name}</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mb-3">Przeciągnij plik PDF lub DOCX tutaj</p>
                      <Button variant="outline" type="button" className="cursor-pointer">
                        Wybierz plik
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">Max 10MB, PDF lub DOCX</p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </div>
              ) : (
                <GeneratedContentEditor
                  content={generatedContent}
                  onChange={setGeneratedContent}
                  corrections={corrections}
                  onCorrectionsChange={setCorrections}
                  onUpdate={handleGenerate}
                  isUpdating={isGenerating}
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
  onUpdate, isUpdating, onSave, isSaving,
}: {
  content: string; onChange: (v: string) => void;
  corrections: string; onCorrectionsChange: (v: string) => void;
  onUpdate: () => void; isUpdating: boolean;
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

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={isSaving} className="gap-2" style={{ backgroundColor: '#6C5CE7' }}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Zapisz szablon
        </Button>
      </div>
    </div>
  );
}
