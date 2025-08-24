import { useState, useEffect, useRef } from "react";
import { X, Send, FileText, Calendar, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ChatPanelProps {
  driverData: any;
  onClose: () => void;
}

export const ChatPanel = ({ driverData, onClose }: ChatPanelProps) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickActions = [
    { icon: FileText, label: "Rozliczenia", message: "Witam, mam pytanie dotyczące rozliczeń tygodniowych." },
    { icon: Calendar, label: "Umowy", message: "Witam, potrzebuję pomocy z dokumentami i umowami." },
    { icon: Car, label: "Flota/Auto", message: "Witam, mam pytanie dotyczące przypisanego pojazdu." }
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("driver_id", driverData.driver_id)
      .order("created_at", { ascending: true });

    if (data) {
      setMessages(data);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || isLoading) return;

    setIsLoading(true);

    const { error } = await supabase
      .from("messages")
      .insert([{
        driver_id: driverData.driver_id,
        content: newMessage.trim(),
        from_role: "driver"
      }]);

    if (error) {
      toast.error("Błąd wysyłania wiadomości");
    } else {
      setNewMessage("");
      loadMessages();
    }

    setIsLoading(false);
  };

  const handleQuickAction = (message: string) => {
    setNewMessage(message);
  };

  useEffect(() => {
    loadMessages();
  }, [driverData.driver_id]);

  return (
    <div className="fixed inset-0 z-50 md:relative md:inset-auto">
      {/* Mobile backdrop */}
      <div className="md:hidden fixed inset-0 bg-black/20" onClick={onClose} />
      
      {/* Panel */}
      <Card className="absolute bottom-0 right-0 md:bottom-4 md:right-4 w-full h-full md:w-96 md:h-[500px] flex flex-col bg-white/95 backdrop-blur-sm shadow-purple rounded-t-3xl md:rounded-2xl border-0">
        <CardHeader className="flex-shrink-0 pb-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-primary">
              Czat z administratorem
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-4 space-y-4 overflow-hidden">
          {/* Quick Actions - tylko gdy nie ma wiadomości */}
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                Wybierz temat lub napisz własną wiadomość:
              </p>
              <div className="grid gap-2">
                {quickActions.map((action, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="justify-start text-left h-auto p-3 hover:bg-primary/5"
                    onClick={() => handleQuickAction(action.message)}
                  >
                    <action.icon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">{action.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-primary/20">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.from_role === "driver" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    message.from_role === "driver"
                      ? "bg-primary text-white"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <p className="break-words">{message.content}</p>
                  <p className={`text-xs mt-1 opacity-70 ${
                    message.from_role === "driver" ? "text-white/70" : "text-muted-foreground"
                  }`}>
                    {new Date(message.created_at).toLocaleTimeString("pl-PL", {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 pt-2 border-t">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Napisz wiadomość..."
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
              disabled={isLoading}
              className="flex-1 rounded-full"
            />
            <Button
              onClick={sendMessage}
              disabled={isLoading || !newMessage.trim()}
              size="icon"
              className="rounded-full h-10 w-10"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};