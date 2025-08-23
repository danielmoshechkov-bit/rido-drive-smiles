import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);

  const handleChatClick = () => {
    // Tu można dodać integrację z rzeczywistym chatem (Tidio, Crisp, itp.)
    window.open('https://wa.me/48519474583', '_blank');
  };

  return (
    <>
      {/* Chat Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className="w-14 h-14 rounded-full shadow-gold bg-accent hover:bg-accent-hover"
          size="icon"
        >
          {isOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <MessageCircle className="h-6 w-6" />
          )}
        </Button>
      </div>

      {/* Compact Chat Popup */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-40">
          <Card className="w-64 p-3 shadow-lg border border-border/50 bg-background/95 backdrop-blur-sm">
            <div className="space-y-3">
              <div className="text-center">
                <h3 className="font-medium text-sm text-foreground">
                  Kontakt
                </h3>
              </div>
              
              <div className="space-y-2">
                <Button 
                  onClick={handleChatClick}
                  size="sm"
                  className="w-full h-8 text-xs"
                >
                  📱 WhatsApp
                </Button>
                <Button 
                  onClick={() => window.location.href = 'tel:+48519474583'}
                  variant="outline" 
                  size="sm"
                  className="w-full h-8 text-xs"
                >
                  📞 Telefon
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

export default ChatWidget;