import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Building2, Globe, FileText, Sparkles, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Service {
  name: string;
  price_from: number;
  price_to: number;
  currency: string;
  duration_minutes: number;
}

interface FAQItem {
  question: string;
  answer: string;
}

interface AIAgentBusinessProfileProps {
  configId: string;
}

export function AIAgentBusinessProfile({ configId }: AIAgentBusinessProfileProps) {
  const queryClient = useQueryClient();
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [description, setDescription] = useState("");
  const [pricingNotes, setPricingNotes] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  const [faq, setFaq] = useState<FAQItem[]>([]);
  const [rules, setRules] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch existing profile
  const { data: profile, isLoading } = useQuery({
    queryKey: ["ai-call-business-profile", configId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_call_business_profiles")
        .select("*")
        .eq("config_id", configId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (profile) {
      setWebsiteUrl(profile.website_url || "");
      setDescription(profile.business_description || "");
      setPricingNotes(profile.pricing_notes || "");
      setServices((profile.services_json as unknown as Service[]) || []);
      setFaq((profile.faq_json as unknown as FAQItem[]) || []);
      setRules((profile.rules_json as any)?.restrictions || "");
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async (generateScripts: boolean) => {
      const profileData = {
        config_id: configId,
        website_url: websiteUrl,
        business_description: description,
        pricing_notes: pricingNotes,
        services_json: services as unknown as any,
        faq_json: faq as unknown as any,
        rules_json: { restrictions: rules } as unknown as any,
      };

      const { data, error } = await supabase
        .from("ai_call_business_profiles")
        .upsert([profileData], { onConflict: "config_id" })
        .select()
        .single();

      if (error) throw error;

      if (generateScripts) {
        // Trigger script generation
        setIsGenerating(true);
        try {
          const { error: genError } = await supabase.functions.invoke("ai-generate-call-scripts", {
            body: { config_id: configId, profile: profileData },
          });
          if (genError) {
            console.error("Script generation error:", genError);
            toast.warning("Profil zapisany, ale generowanie skryptów nie powiodło się");
          } else {
            toast.success("Profil zapisany! Generuję 10 skryptów rozmów...");
          }
        } catch (err) {
          console.error("Script generation error:", err);
        } finally {
          setIsGenerating(false);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-call-business-profile", configId] });
      queryClient.invalidateQueries({ queryKey: ["ai-call-scripts", configId] });
    },
    onError: (error) => {
      toast.error("Błąd zapisu profilu: " + (error as Error).message);
    },
  });

  const addService = () => {
    setServices([...services, { name: "", price_from: 0, price_to: 0, currency: "PLN", duration_minutes: 60 }]);
  };

  const updateService = (index: number, field: keyof Service, value: string | number) => {
    const updated = [...services];
    updated[index] = { ...updated[index], [field]: value };
    setServices(updated);
  };

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const addFaq = () => {
    setFaq([...faq, { question: "", answer: "" }]);
  };

  const updateFaq = (index: number, field: keyof FAQItem, value: string) => {
    const updated = [...faq];
    updated[index] = { ...updated[index], [field]: value };
    setFaq(updated);
  };

  const removeFaq = (index: number) => {
    setFaq(faq.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Opisz swój biznes
          </CardTitle>
          <CardDescription>
            Te informacje będą używane przez AI do prowadzenia rozmów z klientami
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Website URL */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Link do strony WWW
            </Label>
            <Input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://mojafirma.pl"
            />
          </div>

          {/* Business Description */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Opis działalności
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opisz czym zajmuje się Twoja firma, jakie usługi oferujesz, co Cię wyróżnia..."
              className="min-h-[150px]"
            />
          </div>

          {/* Services */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Usługi i cennik</Label>
              <Button variant="outline" size="sm" onClick={addService}>
                <Plus className="h-4 w-4 mr-1" />
                Dodaj usługę
              </Button>
            </div>
            {services.length === 0 && (
              <p className="text-sm text-muted-foreground">Brak usług. Dodaj pierwszą usługę.</p>
            )}
            {services.map((service, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 bg-muted/50 rounded-lg">
                <div className="col-span-4">
                  <Label className="text-xs">Nazwa usługi</Label>
                  <Input
                    value={service.name}
                    onChange={(e) => updateService(index, "name", e.target.value)}
                    placeholder="np. Detailing zewnętrzny"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Cena od (PLN)</Label>
                  <Input
                    type="number"
                    value={service.price_from}
                    onChange={(e) => updateService(index, "price_from", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Cena do (PLN)</Label>
                  <Input
                    type="number"
                    value={service.price_to}
                    onChange={(e) => updateService(index, "price_to", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Czas (min)</Label>
                  <Input
                    type="number"
                    value={service.duration_minutes}
                    onChange={(e) => updateService(index, "duration_minutes", parseInt(e.target.value) || 60)}
                  />
                </div>
                <div className="col-span-2">
                  <Button variant="ghost" size="icon" onClick={() => removeService(index)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Pricing Notes */}
          <div className="space-y-2">
            <Label>Dodatkowe informacje o cenach</Label>
            <Textarea
              value={pricingNotes}
              onChange={(e) => setPricingNotes(e.target.value)}
              placeholder="np. Ceny mogą się różnić w zależności od rozmiaru pojazdu, stanu lakieru..."
              className="min-h-[80px]"
            />
          </div>

          {/* FAQ */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Najczęściej zadawane pytania (FAQ)</Label>
              <Button variant="outline" size="sm" onClick={addFaq}>
                <Plus className="h-4 w-4 mr-1" />
                Dodaj FAQ
              </Button>
            </div>
            {faq.map((item, index) => (
              <div key={index} className="space-y-2 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <Input
                      value={item.question}
                      onChange={(e) => updateFaq(index, "question", e.target.value)}
                      placeholder="Pytanie klienta..."
                    />
                    <Textarea
                      value={item.answer}
                      onChange={(e) => updateFaq(index, "answer", e.target.value)}
                      placeholder="Odpowiedź AI..."
                      className="min-h-[60px]"
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeFaq(index)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Rules */}
          <div className="space-y-2">
            <Label>Czego AI NIE może obiecywać</Label>
            <Textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder="np. Nie gwarantować dokładnych terminów, nie dawać rabatów powyżej 10%..."
              className="min-h-[80px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => saveMutation.mutate(false)}
          disabled={saveMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          Zapisz profil
        </Button>
        <Button
          onClick={() => saveMutation.mutate(true)}
          disabled={saveMutation.isPending || isGenerating}
          className="flex-1"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generuję skrypty...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Zapisz i wygeneruj skrypty rozmów
            </>
          )}
        </Button>
      </div>

      {profile?.last_script_generation_at && (
        <p className="text-sm text-muted-foreground text-center">
          Ostatnia generacja skryptów: {new Date(profile.last_script_generation_at).toLocaleString("pl-PL")}
        </p>
      )}
    </div>
  );
}
