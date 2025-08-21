import { Button } from "@/components/ui/button";
import { MessageCircle, Phone } from "lucide-react";

const ContactButtons = () => {
  return (
    <>
      {/* Chat Button - Left Side */}
      <div className="fixed left-4 top-1/2 transform -translate-y-1/2 z-50">
        <Button
          size="lg"
          className="bg-accent hover:bg-accent-hover text-accent-foreground shadow-gold rounded-full p-4 h-14 w-14 flex items-center justify-center"
          title="Rozpocznij chat"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      </div>

      {/* Call Button - Right Side */}
      <div className="fixed right-4 top-1/2 transform -translate-y-1/2 z-50">
        <a href="tel:+48519474583">
          <Button
            size="lg"
            className="bg-primary hover:bg-primary-hover text-primary-foreground shadow-purple rounded-full p-4 h-14 w-14 flex items-center justify-center"
            title="Zadzwoń do nas"
          >
            <Phone className="h-6 w-6" />
          </Button>
        </a>
      </div>
    </>
  );
};

export default ContactButtons;