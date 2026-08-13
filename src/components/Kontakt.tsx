import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Clock, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { LEGAL_ENTITY } from "@/config/legal";

const emptyForm = { name: '', phone: '', email: '', city: '', message: '' };

async function extractErrorBody(error: unknown): Promise<{ error?: string } | null> {
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      return await ctx.json();
    }
  } catch {
    /* ignore */
  }
  return null;
}

const Kontakt = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState(emptyForm);
  // Honeypot — pole niewidoczne dla ludzi; wypełnione = bot (edge function odrzuca)
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const response = await supabase.functions.invoke("contact-form", {
        body: { ...formData, website },
      });

      const errorMessage = response.error
        ? (await extractErrorBody(response.error))?.error
        : response.data?.success
          ? null
          : response.data?.error || "Nie udało się wysłać wiadomości.";

      if (response.error || errorMessage) {
        toast({
          variant: "destructive",
          title: "Nie udało się wysłać wiadomości",
          description: errorMessage || `Spróbuj ponownie lub napisz bezpośrednio na ${LEGAL_ENTITY.email}.`,
        });
        return;
      }

      toast({
        title: "Wiadomość wysłana!",
        description: "Skontaktujemy się z Tobą w ciągu 24 godzin roboczych.",
      });
      setFormData(emptyForm);
    } catch {
      toast({
        variant: "destructive",
        title: "Nie udało się wysłać wiadomości",
        description: `Spróbuj ponownie lub napisz bezpośrednio na ${LEGAL_ENTITY.email}.`,
      });
    } finally {
      setSending(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <section id="kontakt" className="py-16">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Skontaktuj się z nami
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
          {/* Contact Form */}
          <Card className="p-10 bg-white border-2 border-white/30 shadow-soft">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Imię i nazwisko *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="Jan Kowalski"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+48"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="jan@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Miasto</Label>
                  <Input
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="Warszawa"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Wiadomość *</Label>
                <Textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  placeholder="W czym możemy pomóc? Opisz swoją sprawę..."
                  rows={4}
                />
              </div>

              {/* Honeypot antyspamowy — ukryte przed ludźmi (także czytnikami ekranu) */}
              <div className="hidden" aria-hidden="true">
                <Label htmlFor="website">Strona WWW</Label>
                <Input
                  id="website"
                  name="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              <Button type="submit" variant="accent" size="lg" className="w-full" disabled={sending}>
                {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {sending ? "Wysyłanie..." : "Wyślij wiadomość"}
              </Button>
            </form>
          </Card>

          {/* Contact Info */}
          <div className="space-y-6">
            <Card className="p-8 bg-white border-2 border-white/30 shadow-soft">
              <h3 className="text-xl font-semibold text-foreground mb-4">
                Kontakt e-mail
              </h3>
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">E-mail</p>
                    <a
                      href={`mailto:${LEGAL_ENTITY.email}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {LEGAL_ENTITY.email}
                    </a>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center">
                    <Clock className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Czas odpowiedzi</p>
                    <p className="text-sm text-muted-foreground">do 24 godzin roboczych</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-8 bg-white border-2 border-white/30 shadow-soft">
              <h3 className="text-xl font-semibold text-foreground mb-4">
                Dane firmy
              </h3>
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">{LEGAL_ENTITY.name}</p>
                <p>ul. {LEGAL_ENTITY.street}, {LEGAL_ENTITY.postalCode} {LEGAL_ENTITY.city}</p>
                <p>NIP: {LEGAL_ENTITY.nip} · KRS: {LEGAL_ENTITY.krs}</p>
                <p>
                  Sprawy RODO:{" "}
                  <a href={`mailto:${LEGAL_ENTITY.emailRodo}`} className="text-primary hover:underline">
                    {LEGAL_ENTITY.emailRodo}
                  </a>
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Kontakt;
