import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  X, 
  BookOpen, 
  MessageSquare, 
  DollarSign,
  Star,
  Save,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface KnowledgeBaseEditorProps {
  configId: string;
}

interface FAQ {
  question: string;
  answer: string;
}

interface Service {
  name: string;
  price: string;
  description: string;
}

interface PricingRule {
  condition: string;
  discount: string;
}

export function KnowledgeBaseEditor({ configId }: KnowledgeBaseEditorProps) {
  const [businessDescription, setBusinessDescription] = useState('');
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [pricingNotes, setPricingNotes] = useState('');
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [saving, setSaving] = useState(false);

  const [newFaq, setNewFaq] = useState<FAQ>({ question: '', answer: '' });
  const [newService, setNewService] = useState<Service>({ name: '', price: '', description: '' });
  const [newPricingRule, setNewPricingRule] = useState<PricingRule>({ condition: '', discount: '' });

  const addFaq = () => {
    if (newFaq.question && newFaq.answer) {
      setFaqs([...faqs, { ...newFaq }]);
      setNewFaq({ question: '', answer: '' });
    }
  };

  const removeFaq = (index: number) => {
    setFaqs(faqs.filter((_, i) => i !== index));
  };

  const addService = () => {
    if (newService.name) {
      setServices([...services, { ...newService }]);
      setNewService({ name: '', price: '', description: '' });
    }
  };

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const addPricingRule = () => {
    if (newPricingRule.condition && newPricingRule.discount) {
      setPricingRules([...pricingRules, { ...newPricingRule }]);
      setNewPricingRule({ condition: '', discount: '' });
    }
  };

  const removePricingRule = (index: number) => {
    setPricingRules(pricingRules.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Check if profile exists
      const { data: existing } = await supabase
        .from('ai_call_business_profiles')
        .select('id')
        .eq('config_id', configId)
        .single();

      const payload = {
        business_description: businessDescription,
        faq_json: faqs as any,
        services_json: services as any,
        pricing_notes: pricingNotes,
        rules_json: pricingRules as any,
      };

      if (existing) {
        await supabase
          .from('ai_call_business_profiles')
          .update(payload)
          .eq('config_id', configId);
      } else {
        await supabase
          .from('ai_call_business_profiles')
          .insert({
            config_id: configId,
            ...payload,
          });
      }
      toast.success('Baza wiedzy zapisana!');
    } catch (error: any) {
      toast.error('Błąd zapisu: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Business Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Opis działalności
          </CardTitle>
          <CardDescription>
            Opowiedz agentowi czym zajmuje się Twoja firma
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Jesteśmy firmą zajmującą się... Specjalizujemy się w..."
            value={businessDescription}
            onChange={(e) => setBusinessDescription(e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            FAQ - Najczęstsze pytania
          </CardTitle>
          <CardDescription>
            Dodaj pytania i odpowiedzi, które agent może wykorzystać
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="p-3 border rounded-lg bg-muted/50">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-sm">P: {faq.question}</p>
                  <p className="text-sm text-muted-foreground mt-1">O: {faq.answer}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeFaq(index)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          <div className="p-4 border-2 border-dashed rounded-lg space-y-3">
            <Input
              placeholder="Pytanie"
              value={newFaq.question}
              onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
            />
            <Textarea
              placeholder="Odpowiedź"
              value={newFaq.answer}
              onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
              rows={2}
            />
            <Button variant="outline" size="sm" onClick={addFaq}>
              <Plus className="h-4 w-4 mr-2" />
              Dodaj FAQ
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4" />
            Usługi i cennik
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {services.map((service, index) => (
            <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
              <div className="flex-1">
                <span className="font-medium">{service.name}</span>
                {service.price && (
                  <Badge variant="secondary" className="ml-2">{service.price}</Badge>
                )}
                {service.description && (
                  <p className="text-sm text-muted-foreground mt-1">{service.description}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeService(index)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="p-4 border-2 border-dashed rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Nazwa usługi"
                value={newService.name}
                onChange={(e) => setNewService({ ...newService, name: e.target.value })}
              />
              <Input
                placeholder="Cena (np. od 100 zł)"
                value={newService.price}
                onChange={(e) => setNewService({ ...newService, price: e.target.value })}
              />
            </div>
            <Input
              placeholder="Krótki opis (opcjonalnie)"
              value={newService.description}
              onChange={(e) => setNewService({ ...newService, description: e.target.value })}
            />
            <Button variant="outline" size="sm" onClick={addService}>
              <Plus className="h-4 w-4 mr-2" />
              Dodaj usługę
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Reguły rabatowe
          </CardTitle>
          <CardDescription>
            Zdefiniuj kiedy agent może oferować rabaty
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Ogólne notatki dotyczące cen i negocjacji..."
            value={pricingNotes}
            onChange={(e) => setPricingNotes(e.target.value)}
            rows={2}
          />

          {pricingRules.map((rule, index) => (
            <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
              <div className="flex-1">
                <span className="text-sm">Jeśli: <strong>{rule.condition}</strong></span>
                <Badge variant="outline" className="ml-2">Rabat: {rule.discount}</Badge>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removePricingRule(index)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="p-4 border-2 border-dashed rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Warunek (np. stały klient)"
                value={newPricingRule.condition}
                onChange={(e) => setNewPricingRule({ ...newPricingRule, condition: e.target.value })}
              />
              <Input
                placeholder="Rabat (np. 10%)"
                value={newPricingRule.discount}
                onChange={(e) => setNewPricingRule({ ...newPricingRule, discount: e.target.value })}
              />
            </div>
            <Button variant="outline" size="sm" onClick={addPricingRule}>
              <Plus className="h-4 w-4 mr-2" />
              Dodaj regułę
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Zapisuję...
          </>
        ) : (
          <>
            <Save className="h-4 w-4 mr-2" />
            Zapisz bazę wiedzy
          </>
        )}
      </Button>
    </div>
  );
}
