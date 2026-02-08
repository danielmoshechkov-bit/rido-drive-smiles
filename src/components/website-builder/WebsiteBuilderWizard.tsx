import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, Globe, Loader2 } from 'lucide-react';
import { PackageSelection } from './PackageSelection';
import { WebsiteFormStep } from './WebsiteFormStep';
import { AIQuestionsStep } from './AIQuestionsStep';
import { PreviewStep } from './PreviewStep';
import { PublishStep } from './PublishStep';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type WebsitePackage = 'one_page' | 'multi_page';
export type WizardStep = 'package' | 'form' | 'ai_questions' | 'preview' | 'publish';

export interface WebsiteFormData {
  companyName: string;
  slogan: string;
  cityArea: string;
  phone: string;
  email: string;
  workingHours: string;
  socialFacebook: string;
  socialInstagram: string;
  socialWhatsapp: string;
  googleMapsLink: string;
  aboutShort: string;
  whyUsPoints: string[];
  ctaType: 'call' | 'form' | 'whatsapp' | 'all';
  hasLogo: boolean;
  logoUrl: string;
  logoDescription: string;
  services: Array<{
    name: string;
    priceFrom: number;
    description: string;
    inclusions: string[];
  }>;
  toneOfVoice: string;
  visualStyle: string;
  language: string;
}

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'package', label: 'Pakiet' },
  { key: 'form', label: 'Dane firmy' },
  { key: 'ai_questions', label: 'AI dopyta' },
  { key: 'preview', label: 'Podgląd' },
  { key: 'publish', label: 'Publikacja' },
];

const initialFormData: WebsiteFormData = {
  companyName: '',
  slogan: '',
  cityArea: '',
  phone: '',
  email: '',
  workingHours: '',
  socialFacebook: '',
  socialInstagram: '',
  socialWhatsapp: '',
  googleMapsLink: '',
  aboutShort: '',
  whyUsPoints: [],
  ctaType: 'call',
  hasLogo: false,
  logoUrl: '',
  logoDescription: '',
  services: [],
  toneOfVoice: '',
  visualStyle: '',
  language: 'pl',
};

export function WebsiteBuilderWizard() {
  const [currentStep, setCurrentStep] = useState<WizardStep>('package');
  const [selectedPackage, setSelectedPackage] = useState<WebsitePackage | null>(null);
  const [formData, setFormData] = useState<WebsiteFormData>(initialFormData);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState<string>('');
  const [seoAddon, setSeoAddon] = useState(false);
  const [domainSetupAddon, setDomainSetupAddon] = useState(false);

  const currentStepIndex = STEPS.findIndex(s => s.key === currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const canGoNext = () => {
    switch (currentStep) {
      case 'package':
        return selectedPackage !== null;
      case 'form':
        return formData.companyName && formData.services.length > 0;
      case 'ai_questions':
        return true;
      case 'preview':
        return generatedHtml !== '';
      default:
        return true;
    }
  };

  const handleNext = async () => {
    const stepIndex = STEPS.findIndex(s => s.key === currentStep);
    if (stepIndex < STEPS.length - 1) {
      // Save project when moving from package step
      if (currentStep === 'package' && !projectId) {
        await createProject();
      }
      // Save form data when moving from form step
      if (currentStep === 'form') {
        await saveFormData();
      }
      setCurrentStep(STEPS[stepIndex + 1].key);
    }
  };

  const handleBack = () => {
    const stepIndex = STEPS.findIndex(s => s.key === currentStep);
    if (stepIndex > 0) {
      setCurrentStep(STEPS[stepIndex - 1].key);
    }
  };

  const createProject = async () => {
    if (!selectedPackage) return;
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie zalogowano');

      const { data, error } = await supabase
        .from('website_projects')
        .insert({
          user_id: user.id,
          package_type: selectedPackage,
          seo_addon: seoAddon,
          domain_setup_addon: domainSetupAddon,
          corrections_limit: selectedPackage === 'one_page' ? 10 : 20,
          status: 'draft'
        })
        .select()
        .single();

      if (error) throw error;
      setProjectId(data.id);
      toast.success('Projekt utworzony');
    } catch (error: any) {
      toast.error('Błąd tworzenia projektu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const saveFormData = async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      // First, upsert form data
      const { data: existingForm } = await supabase
        .from('website_form_data')
        .select('id')
        .eq('project_id', projectId)
        .single();

      const formPayload = {
        project_id: projectId,
        company_name: formData.companyName,
        slogan: formData.slogan,
        city_area: formData.cityArea,
        phone: formData.phone,
        email: formData.email,
        working_hours: formData.workingHours,
        social_facebook: formData.socialFacebook,
        social_instagram: formData.socialInstagram,
        social_whatsapp: formData.socialWhatsapp,
        google_maps_link: formData.googleMapsLink,
        about_short: formData.aboutShort,
        why_us_points: formData.whyUsPoints,
        cta_type: formData.ctaType,
        has_logo: formData.hasLogo,
        logo_url: formData.logoUrl,
        logo_description: formData.logoDescription,
        tone_of_voice: formData.toneOfVoice,
        visual_style: formData.visualStyle,
        language: formData.language,
      };

      let formDataId: string;

      if (existingForm) {
        await supabase
          .from('website_form_data')
          .update(formPayload)
          .eq('id', existingForm.id);
        formDataId = existingForm.id;
      } else {
        const { data, error } = await supabase
          .from('website_form_data')
          .insert(formPayload)
          .select()
          .single();
        if (error) throw error;
        formDataId = data.id;
      }

      // Save services
      await supabase
        .from('website_services')
        .delete()
        .eq('form_data_id', formDataId);

      if (formData.services.length > 0) {
        await supabase
          .from('website_services')
          .insert(
            formData.services.map((s, index) => ({
              form_data_id: formDataId,
              name: s.name,
              price_from: s.priceFrom,
              description: s.description,
              inclusions: s.inclusions,
              sort_order: index,
            }))
          );
      }

      // Update project status
      await supabase
        .from('website_projects')
        .update({ status: 'form_completed' })
        .eq('id', projectId);

      toast.success('Dane zapisane');
    } catch (error: any) {
      toast.error('Błąd zapisu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'package':
        return (
          <PackageSelection
            selectedPackage={selectedPackage}
            onSelectPackage={setSelectedPackage}
            seoAddon={seoAddon}
            onSeoAddonChange={setSeoAddon}
            domainSetupAddon={domainSetupAddon}
            onDomainSetupChange={setDomainSetupAddon}
          />
        );
      case 'form':
        return (
          <WebsiteFormStep
            formData={formData}
            onFormDataChange={setFormData}
          />
        );
      case 'ai_questions':
        return (
          <AIQuestionsStep
            projectId={projectId}
            formData={formData}
            onFormDataChange={setFormData}
          />
        );
      case 'preview':
        return (
          <PreviewStep
            projectId={projectId}
            generatedHtml={generatedHtml}
            onGenerate={setGeneratedHtml}
          />
        );
      case 'publish':
        return (
          <PublishStep
            projectId={projectId}
            generatedHtml={generatedHtml}
          />
        );
    }
  };

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Globe className="h-6 w-6 text-primary" />
          <div>
            <CardTitle>Kreator Strony WWW</CardTitle>
            <CardDescription>
              Stwórz profesjonalną stronę dla swojej firmy
            </CardDescription>
          </div>
        </div>
        
        {/* Progress */}
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            {STEPS.map((step, index) => (
              <span 
                key={step.key}
                className={index <= currentStepIndex ? 'text-primary font-medium' : ''}
              >
                {step.label}
              </span>
            ))}
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          renderStep()
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStepIndex === 0 || loading}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Wstecz
          </Button>

          {currentStep !== 'publish' && (
            <Button
              onClick={handleNext}
              disabled={!canGoNext() || loading}
            >
              Dalej
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
