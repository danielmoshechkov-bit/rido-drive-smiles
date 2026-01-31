import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Building, Clock, MapPin, MessageSquare, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { AIAgentConfig, useUpdateAIAgentConfig, AIAgentService, AIAgentFAQ } from "@/hooks/useAIAgentConfig";

const configSchema = z.object({
  company_name: z.string().min(2, "Nazwa firmy jest wymagana"),
  company_description: z.string().optional(),
  service_area: z.string().optional(),
  max_calls_per_day: z.number().min(1).max(100),
  max_minutes_per_month: z.number().min(10).max(1000),
  max_retries_per_lead: z.number().min(1).max(10),
  is_active: z.boolean(),
});

type ConfigFormData = z.infer<typeof configSchema>;

interface AIAgentConfigPanelProps {
  config: AIAgentConfig;
}

export function AIAgentConfigPanel({ config }: AIAgentConfigPanelProps) {
  const updateConfig = useUpdateAIAgentConfig();
  const [services, setServices] = useState<AIAgentService[]>(config.services || []);
  const [faqs, setFaqs] = useState<AIAgentFAQ[]>(config.faq || []);
  const [newService, setNewService] = useState({ name: "", price: 0, duration_minutes: 30 });
  const [newFaq, setNewFaq] = useState({ question: "", answer: "" });

  const form = useForm<ConfigFormData>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      company_name: config.company_name,
      company_description: config.company_description || "",
      service_area: config.service_area || "",
      max_calls_per_day: config.max_calls_per_day,
      max_minutes_per_month: config.max_minutes_per_month,
      max_retries_per_lead: config.max_retries_per_lead,
      is_active: config.is_active,
    },
  });

  const onSubmit = async (data: ConfigFormData) => {
    await updateConfig.mutateAsync({
      id: config.id,
      ...data,
      services,
      faq: faqs,
    });
  };

  const addService = () => {
    if (newService.name) {
      setServices([...services, newService]);
      setNewService({ name: "", price: 0, duration_minutes: 30 });
    }
  };

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const addFaq = () => {
    if (newFaq.question && newFaq.answer) {
      setFaqs([...faqs, newFaq]);
      setNewFaq({ question: "", answer: "" });
    }
  };

  const removeFaq = (index: number) => {
    setFaqs(faqs.filter((_, i) => i !== index));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Company Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Dane firmy
            </CardTitle>
            <CardDescription>
              Informacje o Twojej firmie, które AI wykorzysta w rozmowach
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="company_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nazwa firmy *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Np. AutoSerwis Kowalski" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="company_description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Opis działalności</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="Krótki opis czym zajmuje się Twoja firma..."
                      rows={3}
                    />
                  </FormControl>
                  <FormDescription>
                    AI wykorzysta ten opis do przedstawienia się klientowi
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="service_area"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <MapPin className="h-4 w-4 inline mr-1" />
                    Obszar działania
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Np. Warszawa i okolice, cała Polska" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Services */}
        <Card>
          <CardHeader>
            <CardTitle>Lista usług</CardTitle>
            <CardDescription>
              Usługi które AI może oferować klientom z cenami
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {services.map((service, index) => (
              <div key={index} className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <div className="flex-1">
                  <p className="font-medium">{service.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {service.price} zł • {service.duration_minutes} min
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeService(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <Input
                placeholder="Nazwa usługi"
                value={newService.name}
                onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                className="sm:col-span-2"
              />
              <Input
                type="number"
                placeholder="Cena (zł)"
                value={newService.price || ""}
                onChange={(e) => setNewService({ ...newService, price: Number(e.target.value) })}
              />
              <Button type="button" onClick={addService} className="gap-2">
                <Plus className="h-4 w-4" />
                Dodaj
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              FAQ - Baza wiedzy
            </CardTitle>
            <CardDescription>
              Pytania i odpowiedzi, które AI wykorzysta w rozmowach
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="p-3 bg-muted/50 rounded-lg space-y-1">
                <div className="flex items-start justify-between">
                  <p className="font-medium">P: {faq.question}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFaq(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">O: {faq.answer}</p>
              </div>
            ))}

            <Separator />

            <div className="space-y-2">
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
              <Button type="button" onClick={addFaq} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Dodaj FAQ
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Limits */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Limity i kontrola kosztów
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="max_calls_per_day"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max połączeń / dzień</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="max_minutes_per_month"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max minut / miesiąc</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="max_retries_per_lead"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max prób / lead</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Activation */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Aktywacja agenta</h3>
                <p className="text-sm text-muted-foreground">
                  Włącz aby agent zaczął automatycznie dzwonić
                </p>
              </div>
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <Badge variant="outline" className="mt-2">
              API zostanie podłączone później
            </Badge>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end">
          <Button type="submit" disabled={updateConfig.isPending} className="gap-2">
            {updateConfig.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Zapisz konfigurację
          </Button>
        </div>
      </form>
    </Form>
  );
}
