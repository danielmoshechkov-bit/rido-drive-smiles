import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "./ChatPanel";

interface ChatFabProps {
  driverData: any;
}

export const ChatFab = ({ driverData }: ChatFabProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Action Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full shadow-purple bg-primary hover:bg-primary-hover transition-all duration-300 hover:scale-110"
        size="icon"
      >
        <MessageCircle className="h-6 w-6 text-white" />
      </Button>

      {/* Chat Panel */}
      {isOpen && (
        <ChatPanel 
          driverData={driverData} 
          onClose={() => setIsOpen(false)} 
        />
      )}
    </>
  );
};