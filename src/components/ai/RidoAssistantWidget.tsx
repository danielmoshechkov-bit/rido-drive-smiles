import { useState, useRef, useEffect, useCallback } from "react";
import { 
  MessageCircle, 
  X, 
  Send, 
  Loader2, 
  Bot, 
  User, 
  Sparkles,
  ChevronDown,
  Volume2,
  VolumeX
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { VoiceInput } from "./VoiceInput";
import { ConfirmationScreen } from "./ConfirmationScreen";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Import global type from VoiceInput
declare global {
  interface Window {
    __voiceInputStopRecording?: () => void;
  }
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  intent?: string;
  pending?: boolean;
}

interface IntentResponse {
  intent: string;
  confidence: number;
  draft?: Record<string, unknown>;
  missing_fields: string[];
  followup_questions: string[];
  tool_calls: Array<{ name: string; args: Record<string, unknown> }>;
  requires_confirmation: boolean;
  confirmation_summary?: {
    title: string;
    bullets: string[];
    editable_fields: string[];
  };
}

interface RidoAssistantWidgetProps {
  defaultOpen?: boolean;
}

export function RidoAssistantWidget({ defaultOpen = false }: RidoAssistantWidgetProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  // Temporarily disabled - show coming soon message
  const isTemporarilyDisabled = true;
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: isTemporarilyDisabled 
        ? "🚧 Rido AI jest tymczasowo niedostępny.\n\nPracujemy nad ulepszeniami i wkrótce wrócę z nowymi funkcjami!\n\nDziękuję za cierpliwość."
        : "Cześć! Jestem Rido AI 🚗 Mogę pomóc Ci z:\n\n• Wyszukiwaniem ofert (auta, usługi)\n• Wystawianiem faktur\n• Weryfikacją kontrahentów\n• I wieloma innymi zadaniami!\n\nPowiedz lub napisz czego szukasz.",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    intent: string;
    summary: { title: string; bullets: string[]; editable_fields: string[] };
    draft: Record<string, unknown>;
    toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  } | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Stop recording when widget closes
  useEffect(() => {
    if (!isOpen) {
      // @ts-ignore - access global function from VoiceInput
      if (typeof window !== 'undefined' && window.__voiceInputStopRecording) {
        window.__voiceInputStopRecording();
      }
    }
  }, [isOpen]);

  const addMessage = useCallback((role: Message["role"], content: string, intent?: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
      intent,
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage.id;
  }, []);

  const interpretCommand = async (text: string): Promise<IntentResponse | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/ai-assistant',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk',
            ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` }),
          },
          body: JSON.stringify({
            action: 'interpret',
            payload: {
              text,
              context: {
                currentPage: window.location.pathname,
              },
            },
          }),
        }
      );

      const result = await response.json();
      
      if (result.success) {
        return result as IntentResponse;
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Interpret error:', error);
      return null;
    }
  };

  const executeToolCalls = async (toolCalls: Array<{ name: string; args: Record<string, unknown> }>) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/ai-assistant',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk',
            ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` }),
          },
          body: JSON.stringify({
            action: 'execute',
            payload: {
              toolCalls,
              confirmed: true,
            },
          }),
        }
      );

      return await response.json();
    } catch (error) {
      console.error('Execute error:', error);
      return { success: false, error: String(error) };
    }
  };

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    setInputValue("");
    addMessage("user", text);
    setIsLoading(true);

    try {
      const result = await interpretCommand(text);

      if (!result) {
        addMessage("assistant", "Przepraszam, wystąpił błąd. Spróbuj ponownie.");
        return;
      }

      // Handle followup questions
      if (result.followup_questions.length > 0) {
        addMessage("assistant", result.followup_questions.join("\n\n"), result.intent);
        return;
      }

      // Handle confirmation required
      if (result.requires_confirmation && result.confirmation_summary) {
        setPendingConfirmation({
          intent: result.intent,
          summary: result.confirmation_summary,
          draft: result.draft || {},
          toolCalls: result.tool_calls,
        });
        addMessage(
          "assistant", 
          `Rozumiem, chcesz wykonać akcję: **${result.confirmation_summary.title}**. Proszę potwierdź szczegóły poniżej.`,
          result.intent
        );
        return;
      }

      // Execute directly (no confirmation needed)
      if (result.tool_calls.length > 0) {
        const execResult = await executeToolCalls(result.tool_calls);
        if (execResult.success) {
          addMessage("assistant", "✅ Gotowe! Akcja została wykonana pomyślnie.", result.intent);
        } else {
          addMessage("assistant", `❌ Błąd: ${execResult.error}`, result.intent);
        }
      } else {
        // Just a response without actions
        const intentLabels: Record<string, string> = {
          search_offers: "🔍 Wyszukuję oferty...",
          unknown: "Nie jestem pewien czego szukasz. Możesz sprecyzować?",
        };
        addMessage("assistant", intentLabels[result.intent] || "Przetwarzam...", result.intent);
      }

    } catch (error) {
      console.error('Send error:', error);
      addMessage("assistant", "Przepraszam, wystąpił błąd. Spróbuj ponownie później.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async (editedDraft: Record<string, unknown>) => {
    if (!pendingConfirmation) return;

    setIsExecuting(true);
    
    try {
      // Update tool call args with edited draft
      const updatedToolCalls = pendingConfirmation.toolCalls.map(call => ({
        ...call,
        args: { ...call.args, ...editedDraft },
      }));

      const result = await executeToolCalls(updatedToolCalls);

      if (result.success) {
        addMessage("assistant", "✅ Akcja została wykonana pomyślnie!");
        toast.success("Akcja wykonana");
      } else {
        addMessage("assistant", `❌ Błąd: ${result.error}`);
        toast.error("Błąd wykonania akcji");
      }
    } catch (error) {
      addMessage("assistant", "❌ Wystąpił nieoczekiwany błąd.");
      toast.error("Błąd");
    } finally {
      setIsExecuting(false);
      setPendingConfirmation(null);
    }
  };

  const handleCancelConfirmation = () => {
    setPendingConfirmation(null);
    addMessage("assistant", "Anulowano. W czym jeszcze mogę pomóc?");
  };

  const handleVoiceTranscription = (text: string) => {
    setInputValue(text);
    // Auto-send after short delay
    setTimeout(() => {
      if (text.trim()) {
        handleSend();
      }
    }, 500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group hover:scale-105"
        >
          <Bot className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 h-4 w-4 bg-green-500 rounded-full border-2 border-background animate-pulse" />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-6rem)] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary/10 to-primary/5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Rido AI</h3>
                <p className="text-xs text-muted-foreground">Asystent głosowy</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                title={voiceEnabled ? "Wyłącz odpowiedzi głosowe" : "Włącz odpowiedzi głosowe"}
              >
                {voiceEnabled ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsOpen(false)}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" && "flex-row-reverse"
                  )}
                >
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
                      message.role === "user" 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted"
                    )}
                  >
                    {message.role === "user" ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2 max-w-[80%]",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted rounded-tl-sm"
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    {message.intent && message.role === "assistant" && (
                      <Badge variant="outline" className="mt-2 text-xs">
                        {message.intent}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Confirmation screen */}
          {pendingConfirmation && (
            <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 z-10">
              <ConfirmationScreen
                intent={pendingConfirmation.intent}
                summary={pendingConfirmation.summary}
                draft={pendingConfirmation.draft}
                onConfirm={handleConfirm}
                onCancel={handleCancelConfirmation}
                isExecuting={isExecuting}
              />
            </div>
          )}

          {/* Input - disabled when temporarily unavailable */}
          <div className="p-4 border-t bg-background">
            {isTemporarilyDisabled ? (
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground">
                  AI - wkrótce dostępna
                </p>
              </div>
            ) : (
              <>
                <div className="flex gap-2 items-center">
                  <VoiceInput
                    onTranscription={handleVoiceTranscription}
                    disabled={isLoading}
                    size="md"
                  />
                  <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Napisz lub powiedz: 'Rido, ...'"
                    disabled={isLoading}
                    className="flex-1"
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Kliknij 🎤 aby mówić lub wpisz polecenie
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
