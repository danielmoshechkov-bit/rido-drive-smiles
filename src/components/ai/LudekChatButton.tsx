import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LudekChatButtonProps {
  onClick: () => void;
  isOpen?: boolean;
  className?: string;
}

export function LudekChatButton({ onClick, isOpen = false, className }: LudekChatButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "fixed bottom-6 right-6 z-50 rounded-full w-14 h-14 p-0 shadow-lg transition-all duration-300",
        "bg-primary hover:bg-primary/90 hover:scale-110",
        isOpen && "rotate-180",
        className
      )}
      aria-label={isOpen ? "Zamknij Rido AI" : "Zapytaj Rido AI"}
    >
      {isOpen ? (
        <X className="h-6 w-6 text-primary-foreground" />
      ) : (
        <div className="relative">
          {/* Rido AI mascot placeholder - using chat icon for now */}
          <MessageCircle className="h-6 w-6 text-primary-foreground" />
          {isHovered && (
            <span className="absolute -top-12 -left-16 bg-background border rounded-lg px-3 py-1.5 text-sm whitespace-nowrap shadow-md animate-in fade-in slide-in-from-bottom-2">
              Zapytaj Rido AI! 🚗
            </span>
          )}
        </div>
      )}
    </Button>
  );
}
