import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  Building2, 
  Phone, 
  Mail, 
  Clock, 
  Facebook, 
  Instagram, 
  MessageCircle,
  MapPin,
  Plus,
  X,
  Image,
  Wrench
} from 'lucide-react';
import type { WebsiteFormData } from './WebsiteBuilderWizard';

interface WebsiteFormStepProps {
  formData: WebsiteFormData;
  onFormDataChange: (data: WebsiteFormData) => void;
}

export function WebsiteFormStep({ formData, onFormDataChange }: WebsiteFormStepProps) {
  const [newWhyUsPoint, setNewWhyUsPoint] = useState('');
  const [newService, setNewService] = useState({
    name: '',
    priceFrom: 0,
    description: '',
    inclusions: [] as string[],
  });
  const [newInclusion, setNewInclusion] = useState('');

  const updateField = (field: keyof WebsiteFormData, value: any) => {
    onFormDataChange({ ...formData, [field]: value });
  };

  const addWhyUsPoint = () => {
    if (newWhyUsPoint.trim()) {
      updateField('whyUsPoints', [...formData.whyUsPoints, newWhyUsPoint.trim()]);
      setNewWhyUsPoint('');
    }
  };

  const removeWhyUsPoint = (index: number) => {
    updateField('whyUsPoints', formData.whyUsPoints.filter((_, i) => i !== index));
  };

  const addService = () => {
    if (newService.name.trim()) {
      updateField('services', [...formData.services, { ...newService }]);
      setNewService({ name: '', priceFrom: 0, description: '', inclusions: [] });
    }
  };

  const removeService = (index: number) => {
    updateField('services', formData.services.filter((_, i) => i !== index));
  };

  const addInclusion = () => {
    if (newInclusion.trim()) {
      setNewService({
        ...newService,
        inclusions: [...newService.inclusions, newInclusion.trim()]
      });
      setNewInclusion('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Company & Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Firma i kontakt
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Nazwa firmy *</Label>
            <Input
              id="companyName"
              value={formData.companyName}
              onChange={(e) => updateField('companyName', e.target.value)}
              placeholder="np. Auto Detailing Pro"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slogan">Slogan (opcjonalnie)</Label>
            <Input
              id="slogan"
              value={formData.slogan}
              onChange={(e) => updateField('slogan', e.target.value)}
              placeholder="np. Twoje auto zasługuje na perfekcję"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cityArea">Miasto / obszar działania</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="cityArea"
                className="pl-10"
                value={formData.cityArea}
                onChange={(e) => updateField('cityArea', e.target.value)}
                placeholder="np. Warszawa i okolice"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefon</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="phone"
                className="pl-10"
                value={formData.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="+48 123 456 789"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                className="pl-10"
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="kontakt@firma.pl"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="workingHours">Godziny pracy</Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="workingHours"
                className="pl-10"
                value={formData.workingHours}
                onChange={(e) => updateField('workingHours', e.target.value)}
                placeholder="Pon-Pt: 8:00-18:00"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Social Media */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Social Media</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="facebook">Facebook</Label>
            <div className="relative">
              <Facebook className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="facebook"
                className="pl-10"
                value={formData.socialFacebook}
                onChange={(e) => updateField('socialFacebook', e.target.value)}
                placeholder="https://facebook.com/..."
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="instagram">Instagram</Label>
            <div className="relative">
              <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="instagram"
                className="pl-10"
                value={formData.socialInstagram}
                onChange={(e) => updateField('socialInstagram', e.target.value)}
                placeholder="https://instagram.com/..."
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <div className="relative">
              <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="whatsapp"
                className="pl-10"
                value={formData.socialWhatsapp}
                onChange={(e) => updateField('socialWhatsapp', e.target.value)}
                placeholder="+48 123 456 789"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="googleMaps">Link do Google Maps</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="googleMaps"
                className="pl-10"
                value={formData.googleMapsLink}
                onChange={(e) => updateField('googleMapsLink', e.target.value)}
                placeholder="https://maps.google.com/..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Usługi *
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing services */}
          {formData.services.map((service, index) => (
            <div key={index} className="flex items-start gap-2 p-3 border rounded-lg bg-muted/50">
              <div className="flex-1">
                <div className="font-medium">{service.name}</div>
                <div className="text-sm text-muted-foreground">
                  od {service.priceFrom} zł
                </div>
                {service.description && (
                  <div className="text-sm mt-1">{service.description}</div>
                )}
                {service.inclusions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {service.inclusions.map((inc, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {inc}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeService(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {/* Add new service */}
          <div className="p-4 border-2 border-dashed rounded-lg space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <Input
                placeholder="Nazwa usługi *"
                value={newService.name}
                onChange={(e) => setNewService({ ...newService, name: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Cena od (zł)"
                value={newService.priceFrom || ''}
                onChange={(e) => setNewService({ ...newService, priceFrom: Number(e.target.value) })}
              />
            </div>
            <Textarea
              placeholder="Opis usługi"
              value={newService.description}
              onChange={(e) => setNewService({ ...newService, description: e.target.value })}
              rows={2}
            />
            <div className="flex gap-2">
              <Input
                placeholder="Co wchodzi w cenę"
                value={newInclusion}
                onChange={(e) => setNewInclusion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addInclusion())}
              />
              <Button variant="outline" size="icon" onClick={addInclusion}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {newService.inclusions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {newService.inclusions.map((inc, i) => (
                  <Badge key={i} variant="secondary">
                    {inc}
                    <button
                      className="ml-1"
                      onClick={() => setNewService({
                        ...newService,
                        inclusions: newService.inclusions.filter((_, idx) => idx !== i)
                      })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Button onClick={addService} disabled={!newService.name.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              Dodaj usługę
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">O firmie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="aboutShort">Krótki opis (2-3 zdania)</Label>
            <Textarea
              id="aboutShort"
              value={formData.aboutShort}
              onChange={(e) => updateField('aboutShort', e.target.value)}
              placeholder="Opowiedz krótko o swojej firmie..."
              rows={3}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Dlaczego my? (punkty)</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.whyUsPoints.map((point, index) => (
                <Badge key={index} variant="secondary" className="gap-1">
                  {point}
                  <button onClick={() => removeWhyUsPoint(index)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="np. 10 lat doświadczenia"
                value={newWhyUsPoint}
                onChange={(e) => setNewWhyUsPoint(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addWhyUsPoint())}
              />
              <Button variant="outline" size="icon" onClick={addWhyUsPoint}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Call to Action (CTA)</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={formData.ctaType}
            onValueChange={(value) => updateField('ctaType', value)}
            className="grid grid-cols-2 md:grid-cols-4 gap-3"
          >
            <Label
              htmlFor="cta-call"
              className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 [&:has(:checked)]:border-primary"
            >
              <RadioGroupItem value="call" id="cta-call" />
              <Phone className="h-4 w-4" />
              Zadzwoń
            </Label>
            <Label
              htmlFor="cta-form"
              className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 [&:has(:checked)]:border-primary"
            >
              <RadioGroupItem value="form" id="cta-form" />
              <Mail className="h-4 w-4" />
              Formularz
            </Label>
            <Label
              htmlFor="cta-whatsapp"
              className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 [&:has(:checked)]:border-primary"
            >
              <RadioGroupItem value="whatsapp" id="cta-whatsapp" />
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </Label>
            <Label
              htmlFor="cta-all"
              className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 [&:has(:checked)]:border-primary"
            >
              <RadioGroupItem value="all" id="cta-all" />
              Wszystkie
            </Label>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Image className="h-4 w-4" />
            Logo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={formData.hasLogo ? 'yes' : 'no'}
            onValueChange={(value) => updateField('hasLogo', value === 'yes')}
            className="flex gap-4"
          >
            <Label
              htmlFor="logo-yes"
              className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 [&:has(:checked)]:border-primary"
            >
              <RadioGroupItem value="yes" id="logo-yes" />
              Mam logo
            </Label>
            <Label
              htmlFor="logo-no"
              className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 [&:has(:checked)]:border-primary"
            >
              <RadioGroupItem value="no" id="logo-no" />
              Nie mam logo
            </Label>
          </RadioGroup>

          {formData.hasLogo ? (
            <div className="space-y-2">
              <Label htmlFor="logoUrl">Link do logo lub upload</Label>
              <Input
                id="logoUrl"
                value={formData.logoUrl}
                onChange={(e) => updateField('logoUrl', e.target.value)}
                placeholder="https://... lub przeciągnij plik"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="logoDescription">Opisz jak ma wyglądać logo</Label>
              <Textarea
                id="logoDescription"
                value={formData.logoDescription}
                onChange={(e) => updateField('logoDescription', e.target.value)}
                placeholder="np. Nowoczesne logo z ikoną samochodu, kolory: niebieski i srebrny..."
                rows={3}
              />
              <p className="text-sm text-muted-foreground">
                AI wygeneruje logo na podstawie opisu. Jeśli nie podasz opisu, strona będzie działać bez logo.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
