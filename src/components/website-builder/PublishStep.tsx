import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { 
  Globe, 
  ExternalLink, 
  Check, 
  Copy, 
  Loader2,
  Server,
  Shield,
  Zap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PublishStepProps {
  projectId: string | null;
  generatedHtml: string;
}

export function PublishStep({ projectId, generatedHtml }: PublishStepProps) {
  const [domainOption, setDomainOption] = useState<'subdomain' | 'custom'>('subdomain');
  const [subdomain, setSubdomain] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');

  const handlePublish = async () => {
    if (!projectId || !generatedHtml) {
      toast.error('Brak danych do publikacji');
      return;
    }

    const domain = domainOption === 'subdomain' 
      ? `${subdomain}.getrido.pl`
      : customDomain;

    if (!domain) {
      toast.error('Podaj domenę');
      return;
    }

    setPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke('website-publish', {
        body: {
          projectId,
          domain,
          html: generatedHtml,
        },
      });

      if (error) throw error;

      await supabase
        .from('website_projects')
        .update({
          is_published: true,
          published_at: new Date().toISOString(),
          subdomain: domainOption === 'subdomain' ? subdomain : null,
          custom_domain: domainOption === 'custom' ? customDomain : null,
          status: 'published',
        })
        .eq('id', projectId);

      setPublished(true);
      setPublishedUrl(`https://${domain}`);
      toast.success('Strona opublikowana!');
    } catch (error: any) {
      toast.error('Błąd publikacji: ' + error.message);
    } finally {
      setPublishing(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(publishedUrl);
    toast.success('Link skopiowany!');
  };

  if (published) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
            <Check className="h-10 w-10 text-green-600" />
          </div>
          <h3 className="text-2xl font-semibold mb-2">Strona opublikowana!</h3>
          <p className="text-muted-foreground text-center mb-6">
            Twoja strona jest już dostępna online
          </p>
          
          <div className="flex items-center gap-2 p-3 bg-white rounded-lg border mb-6">
            <Globe className="h-5 w-5 text-primary" />
            <a 
              href={publishedUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              {publishedUrl}
            </a>
            <Button variant="ghost" size="icon" onClick={copyUrl}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <Button variant="outline" asChild>
            <a href={publishedUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Otwórz stronę
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Domain Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Wybierz domenę
          </CardTitle>
          <CardDescription>
            Gdzie ma być dostępna Twoja strona?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup 
            value={domainOption} 
            onValueChange={(v) => setDomainOption(v as 'subdomain' | 'custom')}
            className="space-y-3"
          >
            <div className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-muted/50 [&:has(:checked)]:border-primary">
              <RadioGroupItem value="subdomain" id="subdomain" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="subdomain" className="font-medium cursor-pointer">
                  Subdomena GetRido
                  <Badge variant="secondary" className="ml-2">Darmowa</Badge>
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Twoja strona będzie dostępna pod adresem twoja-firma.getrido.pl
                </p>
                {domainOption === 'subdomain' && (
                  <div className="flex items-center gap-2 mt-3">
                    <Input
                      placeholder="twoja-firma"
                      value={subdomain}
                      onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      className="max-w-[200px]"
                    />
                    <span className="text-muted-foreground">.getrido.pl</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-muted/50 [&:has(:checked)]:border-primary">
              <RadioGroupItem value="custom" id="custom" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="custom" className="font-medium cursor-pointer">
                  Własna domena
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Podłącz własną domenę (np. twoja-firma.pl)
                </p>
                {domainOption === 'custom' && (
                  <div className="mt-3 space-y-3">
                    <Input
                      placeholder="twoja-firma.pl"
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value.toLowerCase())}
                    />
                    <div className="p-3 bg-muted rounded-lg text-sm">
                      <p className="font-medium mb-2">Konfiguracja DNS:</p>
                      <p className="text-muted-foreground font-mono text-xs">
                        Typ: CNAME<br />
                        Nazwa: @<br />
                        Wartość: sites.getrido.pl
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Features */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Co zawiera hosting?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Szybkie ładowanie</p>
                <p className="text-xs text-muted-foreground">CDN globalny</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">SSL gratis</p>
                <p className="text-xs text-muted-foreground">Certyfikat HTTPS</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Server className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">99.9% uptime</p>
                <p className="text-xs text-muted-foreground">Niezawodność</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Publish Button */}
      <Button 
        size="lg" 
        className="w-full" 
        onClick={handlePublish}
        disabled={publishing || (!subdomain && !customDomain)}
      >
        {publishing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Publikuję...
          </>
        ) : (
          <>
            <Globe className="h-4 w-4 mr-2" />
            Opublikuj stronę
          </>
        )}
      </Button>
    </div>
  );
}
