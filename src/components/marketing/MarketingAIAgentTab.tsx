import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Bot, Send, Loader2, Plus, MessageSquare, BarChart3, StopCircle, Zap, FileText, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const QUICK_ACTIONS = [
  { icon: BarChart3, label: 'Analizuj kampanie', prompt: 'Przeanalizuj wszystkie aktywne kampanie i podaj rekomendacje optymalizacyjne.' },
  { icon: StopCircle, label: 'Do wyłączenia', prompt: 'Znajdź kampanie z niskim ROAS które powinny być wstrzymane i uzasadnij dlaczego.' },
  { icon: Zap, label: 'Zwiększ budżet', prompt: 'Które kampanie mają najlepsze wyniki i gdzie warto zwiększyć budżet? Podaj konkretne liczby.' },
  { icon: FileText, label: 'Raport tygodniowy', prompt: 'Wygeneruj tygodniowy raport wydatków, ROAS i rekomendacji w języku polskim.' },
];

const DEFAULT_SYSTEM_PROMPT = `Jesteś RidoMarketer — ekspertem AI od reklam cyfrowych dla platformy GetRido.
Zarządzasz kampaniami Meta Ads i Google Ads.

Twoje zadania:
1. Analizuj dane kampanii i identyfikuj problemy (niski ROAS, wysoki CPC, niska CTR)
2. Proponuj konkretne optymalizacje z uzasadnieniem i szacowanym efektem
3. Twórz briefy do reklam (teksty, nagłówki, CTA) optymalizowane pod konwersję
4. Wykrywaj anomalie budżetowe i alertuj
5. Generuj raporty w języku polskim, zrozumiałe dla właściciela firmy
6. Przy każdej decyzji o zatrzymaniu/zwiększeniu podaj % pewności i uzasadnienie

Zawsze odpowiadaj po polsku. Bądź precyzyjny i konkretny — podawaj liczby, nie ogólniki.`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function MarketingAIAgentTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('marketing-agent-chat', {
        body: {
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          systemPrompt,
        },
      });

      if (error) throw error;
      setMessages([...newMessages, { role: 'assistant', content: data?.result || data?.content || 'Brak odpowiedzi' }]);
    } catch (e) {
      toast.error('Błąd połączenia z AI Agent');
      setMessages([...newMessages, { role: 'assistant', content: '⚠️ Wystąpił błąd. Sprawdź klucz API w ustawieniach agencji.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" /> RidoMarketer — AI Agent
        </h2>
        <Button variant="outline" size="sm" onClick={() => setShowConfig(!showConfig)} className="gap-1.5">
          <Settings className="h-4 w-4" /> Konfiguracja
        </Button>
      </div>

      {showConfig && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Instrukcja systemowa agenta</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={8}
              className="text-xs font-mono"
            />
            <Button size="sm" className="mt-2" onClick={() => { toast.success('Prompt zapisany'); setShowConfig(false); }}>
              Zapisz konfigurację
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <div className="flex gap-2 flex-wrap">
        {QUICK_ACTIONS.map((action) => (
          <Button key={action.label} variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => sendMessage(action.prompt)}>
            <action.icon className="h-3.5 w-3.5" /> {action.label}
          </Button>
        ))}
      </div>

      {/* Chat area */}
      <Card className="overflow-hidden">
        <div ref={scrollRef} className="h-[400px] overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Bot className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-sm">Zadaj pytanie RidoMarketer lub użyj szybkich akcji</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-3 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            placeholder="Zadaj pytanie agentowi marketingu..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}