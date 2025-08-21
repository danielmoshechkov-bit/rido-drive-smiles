import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

const CallButton = () => {
  const handleCall = () => {
    window.location.href = 'tel:+48519474583';
  };

  return (
    <div className="fixed bottom-6 left-6 z-50">
      <Button
        onClick={handleCall}
        className="w-14 h-14 rounded-full shadow-gold bg-primary hover:bg-primary-hover text-primary-foreground"
        size="icon"
        title="Zadzwoń do nas"
      >
        <Phone className="h-6 w-6" />
      </Button>
    </div>
  );
};

export default CallButton;