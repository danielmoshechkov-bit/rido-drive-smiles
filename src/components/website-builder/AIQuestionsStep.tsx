import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Bot, Check, Loader2, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { WebsiteFormData } from './WebsiteBuilderWizard';

interface AIQuestionsStepProps {
  projectId: string | null;
  formData: WebsiteFormData;
  onFormDataChange: (data: WebsiteFormData) => void;
}

interface AIQuestion {
  id: string;
  question: string;
  options?: string[];
  answered: boolean;
  answer?: string;
}

export function AIQuestionsStep({ projectId, formData, onFormDataChange }: AIQuestionsStepProps) {
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<AIQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [allAnswered, setAllAnswered] = useState(false);

  useEffect(() => {
    generateQuestions();
  }, []);

  const generateQuestions = async () => {
    setLoading(true);
    
    // Analyze what's missing in formData and generate relevant questions
    const generatedQuestions: AIQuestion[] = [];
    
    if (!formData.toneOfVoice) {
      generatedQuestions.push({
        id: 'tone',
        question: 'Jaki ton komunikacji preferujesz na stronie?',
        options: ['Profesjonalny i formalny', 'Przyjazny i bezpośredni', 'Ekspertowy i techniczny', 'Nowoczesny i dynamiczny'],
        answered: false,
      });
    }

    if (!formData.visualStyle) {
      generatedQuestions.push({
        id: 'style',
        question: 'Jaki styl wizualny najbardziej pasuje do Twojej marki?',
        options: ['Minimalistyczny', 'Elegancki i luksusowy', 'Nowoczesny i kolorowy', 'Klasyczny i tradycyjny'],
        answered: false,
      });
    }

    if (formData.services.length === 0) {
      generatedQuestions.push({
        id: 'services_hint',
        question: 'Nie dodałeś jeszcze usług. Opisz w kilku słowach czym się zajmujesz.',
        answered: false,
      });
    }

    if (!formData.aboutShort && formData.whyUsPoints.length === 0) {
      generatedQuestions.push({
        id: 'about_hint',
        question: 'Co wyróżnia Twoją firmę na tle konkurencji?',
        answered: false,
      });
    }

    // If nothing is missing, add a confirmation question
    if (generatedQuestions.length === 0) {
      setAllAnswered(true);
    }

    setQuestions(generatedQuestions);
    setLoading(false);
  };

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
    setQuestions(prev => prev.map(q => 
      q.id === questionId ? { ...q, answered: true, answer } : q
    ));
  };

  const handleSubmitAnswers = async () => {
    setLoading(true);
    
    // Apply answers to formData
    const updatedFormData = { ...formData };
    
    if (answers.tone) {
      updatedFormData.toneOfVoice = answers.tone;
    }
    if (answers.style) {
      updatedFormData.visualStyle = answers.style;
    }
    if (answers.about_hint && !formData.aboutShort) {
      updatedFormData.aboutShort = answers.about_hint;
    }

    onFormDataChange(updatedFormData);

    // Save to database
    if (projectId) {
      const { data: formDataRecord } = await supabase
        .from('website_form_data')
        .select('id')
        .eq('project_id', projectId)
        .single();

      if (formDataRecord) {
        await supabase
          .from('website_form_data')
          .update({
            ai_questions: questions as any,
            ai_answers: answers as any,
            tone_of_voice: answers.tone || formData.toneOfVoice,
            visual_style: answers.style || formData.visualStyle,
          })
          .eq('id', formDataRecord.id);
      }

      await supabase
        .from('website_projects')
        .update({ status: 'ai_questions' })
        .eq('id', projectId);
    }

    setAllAnswered(true);
    setLoading(false);
    toast.success('Odpowiedzi zapisane! Możesz przejść do generowania podglądu.');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">AI analizuje Twoje dane...</p>
      </div>
    );
  }

  if (allAnswered) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Wszystko gotowe!</h3>
            <p className="text-muted-foreground">
              AI ma wszystkie potrzebne informacje. Możesz wygenerować podgląd strony.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">AI dopytuje</CardTitle>
              <CardDescription>
                Odpowiedz na kilka pytań, aby strona idealnie pasowała do Twojej firmy
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {questions.map((q) => (
        <Card key={q.id} className={q.answered ? 'border-green-200' : ''}>
          <CardHeader>
            <div className="flex items-start gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
              <CardTitle className="text-base font-medium">{q.question}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {q.options ? (
              <div className="flex flex-wrap gap-2">
                {q.options.map((option) => (
                  <Badge
                    key={option}
                    variant={answers[q.id] === option ? 'default' : 'outline'}
                    className="cursor-pointer py-2 px-4 text-sm"
                    onClick={() => handleAnswer(q.id, option)}
                  >
                    {answers[q.id] === option && <Check className="h-3 w-3 mr-1" />}
                    {option}
                  </Badge>
                ))}
              </div>
            ) : (
              <Textarea
                placeholder="Twoja odpowiedź..."
                value={answers[q.id] || ''}
                onChange={(e) => handleAnswer(q.id, e.target.value)}
                rows={3}
              />
            )}
          </CardContent>
        </Card>
      ))}

      {questions.length > 0 && (
        <Button 
          onClick={handleSubmitAnswers}
          disabled={questions.some(q => !q.answered)}
          className="w-full"
        >
          Zapisz odpowiedzi i kontynuuj
        </Button>
      )}
    </div>
  );
}
