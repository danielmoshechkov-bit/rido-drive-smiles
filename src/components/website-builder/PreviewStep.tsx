import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Monitor, 
  Smartphone, 
  Loader2, 
  Sparkles, 
  Edit3,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PreviewStepProps {
  projectId: string | null;
  generatedHtml: string;
  onGenerate: (html: string) => void;
}

export function PreviewStep({ projectId, generatedHtml, onGenerate }: PreviewStepProps) {
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [correctionsUsed, setCorrectionsUsed] = useState(0);
  const [correctionsLimit, setCorrectionsLimit] = useState(10);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!projectId) {
      toast.error('Brak projektu');
      return;
    }

    setLoading(true);
    try {
      // Fetch form data
      const { data: formData } = await supabase
        .from('website_form_data')
        .select('*')
        .eq('project_id', projectId)
        .single();

      const { data: services } = await supabase
        .from('website_services')
        .select('*')
        .eq('form_data_id', formData?.id)
        .order('sort_order');

      const { data: project } = await supabase
        .from('website_projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (!formData || !project) throw new Error('Brak danych');

      // Call edge function to generate website
      const { data, error } = await supabase.functions.invoke('website-generate', {
        body: {
          formData,
          services: services || [],
          packageType: project.package_type,
          seoAddon: project.seo_addon,
        },
      });

      if (error) throw error;

      // Save generated HTML
      await supabase
        .from('website_projects')
        .update({ 
          generated_html: data.html,
          generated_css: data.css,
          status: 'preview_ready'
        })
        .eq('id', projectId);

      onGenerate(data.html);
      setCorrectionsLimit(project.corrections_limit);
      toast.success('Strona wygenerowana!');
    } catch (error: any) {
      console.error('Generation error:', error);
      toast.error('Błąd generowania: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleElementClick = (event: React.MouseEvent<HTMLIFrameElement>) => {
    // This would need postMessage communication with iframe for real implementation
    toast.info('Kliknij element strony, aby dodać poprawkę');
  };

  if (!generatedHtml) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Gotowy do generowania</h3>
          <p className="text-muted-foreground text-center mb-6 max-w-md">
            AI utworzy stronę na podstawie Twoich danych. Proces może zająć do 30 sekund.
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <AlertCircle className="h-4 w-4" />
            <span>Koszt generowania: 5 zł</span>
          </div>
          <Button size="lg" onClick={handleGenerate} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generuję...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generuj podgląd
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'desktop' | 'mobile')}>
                <TabsList>
                  <TabsTrigger value="desktop">
                    <Monitor className="h-4 w-4 mr-1" />
                    Desktop
                  </TabsTrigger>
                  <TabsTrigger value="mobile">
                    <Smartphone className="h-4 w-4 mr-1" />
                    Mobile
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-2 text-sm">
                <Edit3 className="h-4 w-4 text-muted-foreground" />
                <span>Poprawki:</span>
                <Badge variant={correctionsUsed >= correctionsLimit ? 'destructive' : 'secondary'}>
                  {correctionsUsed} / {correctionsLimit}
                </Badge>
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={handleGenerate} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Regeneruj
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="overflow-hidden">
        <CardHeader className="py-2 px-4 bg-muted border-b">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="bg-background rounded px-3 py-1 text-xs text-muted-foreground">
                twoja-strona.pl
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div 
            className={`transition-all duration-300 mx-auto bg-white ${
              viewMode === 'mobile' ? 'max-w-[390px]' : 'w-full'
            }`}
          >
            <iframe
              srcDoc={generatedHtml}
              className="w-full h-[600px] border-0"
              title="Website Preview"
              onClick={handleElementClick}
            />
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Edit3 className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium">Jak dodać poprawkę?</p>
              <p className="text-sm text-muted-foreground">
                Kliknij element na stronie, który chcesz zmienić, a następnie opisz co ma być inaczej.
                AI zmieni tylko ten konkretny fragment.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
