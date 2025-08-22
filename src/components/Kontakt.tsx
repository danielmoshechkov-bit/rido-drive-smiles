import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Phone, MessageCircle, Mail } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const Kontakt = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    city: '',
    message: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Here would be actual form submission logic
    toast({
      title: "Formularz wysłany!",
      description: "Skontaktujemy się z Tobą w ciągu 24 godzin.",
    });
    
    // Reset form
    setFormData({
      name: '',
      phone: '',
      email: '',
      city: '',
      message: ''
    });
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
          <Card className="p-10 !bg-white border-2 border-white/30 shadow-soft">
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
                  <Label htmlFor="phone">Telefon *</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    placeholder="+48 519 474 583"
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
                <Label htmlFor="message">Wiadomość</Label>
                <Textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  placeholder="Chcę zostać kierowcą Get RIDO..."
                  rows={4}
                />
              </div>

              <Button type="submit" variant="accent" size="lg" className="w-full">
                Wyślij wiadomość
              </Button>
            </form>
          </Card>

          {/* Contact Info */}
          <div className="space-y-6">
            {/* Quick Contact */}
            <Card className="p-8 !bg-white border-2 border-white/30 shadow-soft">
              <h3 className="text-xl font-semibold text-foreground mb-4">
                Szybki kontakt
              </h3>
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Telefon</p>
                    <p className="text-sm text-muted-foreground">+48 519 474 583</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">WhatsApp</p>
                    <p className="text-sm text-muted-foreground">+48 519 474 583</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">E-mail</p>
                    <p className="text-sm text-muted-foreground">biuro@getrido.pl</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Live Chat */}
            <Card className="p-6 bg-gradient-hero text-primary-foreground shadow-purple">
              <h3 className="text-xl font-semibold mb-4">
                Live Chat
              </h3>
              <p className="mb-4 text-primary-foreground/90">
                Skorzystaj z czatu na żywo - odpowiadamy 24/7! FAQ-bot odpowiada natychmiast, a konsultant dołączy gdy potrzebujesz.
              </p>
              <Button variant="accent">
                Rozpocznij chat
              </Button>
            </Card>

          </div>
        </div>
      </div>
    </section>
  );
};

export default Kontakt;