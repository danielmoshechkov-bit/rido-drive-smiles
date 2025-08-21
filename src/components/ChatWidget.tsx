import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);

  const handleChatClick = () => {
    // Tu można dodać integrację z rzeczywistym chatem (Tidio, Crisp, itp.)
    window.open('https://wa.me/48123456789', '_blank');
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

      {/* Chat Popup */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-40">
          <Card className="w-80 p-4 shadow-gold border-accent/20">
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="font-semibold text-foreground mb-2">
                  Masz pytania? Skontaktuj się z nami!
                </h3>
                <p className="text-sm text-muted-foreground">
                  Odpowiadamy szybko na wszystkie pytania dotyczące Get RIDO
                </p>
              </div>
              
              <div className="space-y-2">
                <Button 
                  onClick={handleChatClick}
                  variant="accent" 
                  className="w-full"
                >
                  📱 WhatsApp
                </Button>
                <Button 
                  onClick={() => window.location.href = 'tel:+48123456789'}
                  variant="outline" 
                  className="w-full"
                >
                  📞 Zadzwoń
                </Button>
              </div>
              
              <div className="text-xs text-center text-muted-foreground">
                Dostępni: Pon-Ndz 8:00-20:00
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

export default ChatWidget;