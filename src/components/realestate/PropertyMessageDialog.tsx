import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PropertyMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  listingTitle: string;
  agentId: string;
  agentEmail?: string;
  user: any;
}

export function PropertyMessageDialog({
  open,
  onOpenChange,
  listingId,
  listingTitle,
  agentId,
  agentEmail,
  user,
}: PropertyMessageDialogProps) {
  const [message, setMessage] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error("Wpisz treść wiadomości");
      return;
    }

    setSending(true);
    try {
      const { error } = await (supabase as any)
        .from("property_messages")
        .insert({
          listing_id: listingId,
          sender_user_id: user.id,
          recipient_agent_id: agentId,
          recipient_email: agentEmail || null,
          sender_name: senderName || user.email?.split("@")[0] || "Użytkownik",
          sender_email: user.email,
          sender_phone: senderPhone || null,
          message: message.trim(),
        });

      if (error) throw error;

      // Try to send email notification
      try {
        await supabase.functions.invoke("rido-mail", {
          body: {
            to: agentEmail,
            subject: `Nowa wiadomość z GetRido: ${listingTitle}`,
            html: `
              <h2>Nowa wiadomość dotycząca ogłoszenia</h2>
              <p><strong>Ogłoszenie:</strong> ${listingTitle}</p>
              <p><strong>Od:</strong> ${senderName || user.email}</p>
              ${senderPhone ? `<p><strong>Telefon:</strong> ${senderPhone}</p>` : ""}
              <p><strong>Wiadomość:</strong></p>
              <blockquote style="border-left:3px solid #7c3aed;padding-left:12px;margin:12px 0;color:#333">${message.trim()}</blockquote>
              <p style="margin-top:24px"><a href="https://getrido.pl/nieruchomosci/agent/panel?tab=messages" style="background:#7c3aed;color:white;padding:10px 20px;border-radius:8px;text-decoration:none">Odpowiedz w portalu</a></p>
            `,
          },
        });
      } catch {
        // Email notification is optional
      }

      toast.success("Wiadomość wysłana!");
      setMessage("");
      setSenderName("");
      setSenderPhone("");
      onOpenChange(false);
    } catch (err) {
      console.error("Error sending message:", err);
      toast.error("Nie udało się wysłać wiadomości");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Napisz wiadomość
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Ogłoszenie: <span className="font-medium text-foreground">{listingTitle}</span>
        </p>

        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="sender-name">Twoje imię</Label>
            <Input
              id="sender-name"
              placeholder="Jan Kowalski"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="sender-phone">Telefon (opcjonalnie)</Label>
            <Input
              id="sender-phone"
              placeholder="+48 123 456 789"
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="message">Wiadomość *</Label>
            <Textarea
              id="message"
              placeholder="Dzień dobry, jestem zainteresowany/a tą nieruchomością..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="w-full"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {sending ? "Wysyłanie..." : "Wyślij wiadomość"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
