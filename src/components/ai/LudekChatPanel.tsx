import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, Search, AlertCircle, LogIn, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

// Owner emails with full AI access
const OWNER_EMAILS = ['daniel.moshechkov@gmail.com', 'anastasiia.shapovalova1991@gmail.com'];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  filters?: Record<string, unknown>;
  results?: unknown[];
  isLoading?: boolean;
  isError?: boolean;
  requiresLogin?: boolean;
}

interface LudekChatPanelProps {
  onClose: () => void;
  onSearchResults?: (results: unknown[]) => void;
}

const EXAMPLE_QUERIES = [
  "Szukam hybrydy od 2020 roku",
  "Toyota lub Honda w Warszawie",
  "Auto do 400 zł/tydzień",
  "Elektryczny SUV",
];

export function LudekChatPanel({ onClose, onSearchResults }: LudekChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [hasAIAccess, setHasAIAccess] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
      setHasAIAccess(user?.email ? OWNER_EMAILS.includes(user.email) : false);
    };
    checkUser();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getDeviceFingerprint = () => {
    const nav = navigator;
    return btoa(`${nav.userAgent}-${nav.language}-${screen.width}x${screen.height}`).substring(0, 32);
  };

  const handleSend = async (query?: string) => {
    const messageText = query || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
    };

    const loadingMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: 'Szukam...',
      isLoading: true,
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            query: messageText,
            userId,
            ipAddress: 'client',
            deviceFingerprint: getDeviceFingerprint(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const errorMessage: Message = {
          id: loadingMessage.id,
          role: 'assistant',
          content: data.error || 'Wystąpił błąd',
          isError: true,
          requiresLogin: data.requiresLogin,
        };

        setMessages(prev => prev.map(m => m.id === loadingMessage.id ? errorMessage : m));
        
        if (data.limitReached) {
          toast({
            title: "Limit zapytań",
            description: data.requiresLogin 
              ? "Zaloguj się, aby kontynuować korzystanie z AI" 
              : "Doładuj konto, aby kontynuować",
            variant: "destructive",
          });
        }
        return;
      }

      const resultCount = data.results?.length || 0;
      let responseContent = data.explanation || '';
      
      if (resultCount > 0) {
        responseContent += `\n\n✅ Znalazłem ${resultCount} ${resultCount === 1 ? 'ofertę' : resultCount < 5 ? 'oferty' : 'ofert'}!`;
      } else {
        responseContent += '\n\n❌ Nie znalazłem ofert pasujących do Twoich kryteriów. Spróbuj zmienić filtry.';
      }

      const assistantMessage: Message = {
        id: loadingMessage.id,
        role: 'assistant',
        content: responseContent,
        filters: data.filters,
        results: data.results,
      };

      setMessages(prev => prev.map(m => m.id === loadingMessage.id ? assistantMessage : m));

      if (onSearchResults && data.results) {
        onSearchResults(data.results);
      }

    } catch (error) {
      console.error('AI Search error:', error);
      const errorMessage: Message = {
        id: loadingMessage.id,
        role: 'assistant',
        content: 'Przepraszam, wystąpił błąd połączenia. Spróbuj ponownie.',
        isError: true,
      };
      setMessages(prev => prev.map(m => m.id === loadingMessage.id ? errorMessage : m));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="fixed bottom-24 right-6 w-[380px] max-h-[500px] z-50 shadow-2xl border-2 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <CardHeader className="pb-3 bg-primary/5 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Rido AI</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            ×
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Opisz czego szukasz, a znajdę najlepsze oferty
        </p>
      </CardHeader>

      <CardContent className="p-0 flex flex-col h-[400px]">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {!hasAIAccess ? (
            // Show locked state for non-owners
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Lock className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Wkrótce dostępne</h3>
              <p className="text-sm text-muted-foreground">
                Funkcja Rido AI jest w fazie testowej. 
                Wkrótce będzie dostępna dla wszystkich użytkowników.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-4">
              <div className="text-center text-muted-foreground text-sm py-4">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Napisz czego szukasz...</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Przykłady:</p>
                {EXAMPLE_QUERIES.map((example, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-left h-auto py-2 text-xs"
                    onClick={() => handleSend(example)}
                  >
                    "{example}"
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : message.isError
                        ? 'bg-destructive/10 border border-destructive/20'
                        : 'bg-muted'
                    }`}
                  >
                    {message.isLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Szukam...</span>
                      </div>
                    ) : message.isError ? (
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                          <span>{message.content}</span>
                        </div>
                        {message.requiresLogin && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="w-full mt-2"
                            onClick={() => navigate('/marketplace/auth')}
                          >
                            <LogIn className="h-4 w-4 mr-2" />
                            Zaloguj się
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    )}
                    
                    {message.results && message.results.length > 0 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full mt-2"
                        onClick={() => onSearchResults?.(message.results!)}
                      >
                        Zobacz wyniki ({message.results.length})
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-3 border-t bg-background">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => hasAIAccess && setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasAIAccess ? "Szukam hybrydy od 2020..." : "Wkrótce dostępne..."}
              disabled={isLoading || !hasAIAccess}
              className="flex-1 disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <Button 
              size="icon" 
              onClick={() => handleSend()} 
              disabled={!input.trim() || isLoading || !hasAIAccess}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          {!hasAIAccess ? (
            <p className="text-[10px] text-muted-foreground mt-1 text-center">
              Funkcja wkrótce dostępna
            </p>
          ) : !userId ? (
            <p className="text-[10px] text-muted-foreground mt-1 text-center">
              Niezalogowany • 3 zapytania dziennie
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
