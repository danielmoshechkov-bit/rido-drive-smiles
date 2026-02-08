import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Send, CheckCircle } from "lucide-react";

interface ServicesComingSoonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServicesComingSoonModal({ open, onOpenChange }: ServicesComingSoonModalProps) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    serviceType: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.firstName || !formData.lastName || !formData.phone || !formData.email || !formData.serviceType) {
      toast.error('Wypełnij wszystkie wymagane pola');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('service_provider_requests')
        .insert({
          first_name: formData.firstName,
          last_name: formData.lastName,
          phone: formData.phone,
          email: formData.email,
          service_type: formData.serviceType,
          description: formData.description,
          status: 'pending'
        });

      if (error) throw error;

      setIsSubmitted(true);
      toast.success('Zgłoszenie wysłane! Skontaktujemy się wkrótce.');
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error('Wystąpił błąd. Spróbuj ponownie.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset form after closing
    setTimeout(() => {
      setIsSubmitted(false);
      setFormData({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        serviceType: '',
        description: ''
      });
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm sm:max-w-md p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-6 w-6 text-primary" />
            Usługi - Już wkrótce!
          </DialogTitle>
          <DialogDescription className="text-base">
            Sekcja usług będzie dostępna dla wszystkich już niedługo.
          </DialogDescription>
        </DialogHeader>

        {isSubmitted ? (
          <div className="py-8 text-center">
            <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Dziękujemy za zgłoszenie!</h3>
            <p className="text-muted-foreground mb-4">
              Nasz zespół skontaktuje się z Tobą w ciągu 24-48 godzin.
            </p>
            <Button onClick={handleClose}>
              Zamknij
            </Button>
          </div>
        ) : (
          <>
            <div className="bg-primary/5 rounded-lg p-3 mb-3">
              <p className="text-sm text-muted-foreground">
                Jeśli jesteś usługodawcą i chcesz dołączyć do naszej platformy, 
                wypełnij poniższy formularz. Skontaktujemy się z Tobą, aby omówić 
                szczegóły współpracy.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">Imię *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="Jan"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Nazwisko *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="Kowalski"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Numer telefonu *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+48 123 456 789"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Adres e-mail *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="jan@firma.pl"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="serviceType">Rodzaj usługi *</Label>
                <Input
                  id="serviceType"
                  value={formData.serviceType}
                  onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                  placeholder="np. Hydraulik, Elektryk, Detailing..."
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="description">Opis usługi</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Opisz krótko swoją działalność..."
                  rows={2}
                />
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  "Wysyłanie..."
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Wyślij zgłoszenie
                  </>
                )}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
