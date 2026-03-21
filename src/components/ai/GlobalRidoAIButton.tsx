import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RidoAIChatPanel } from './RidoAIChatPanel';

const AVATAR = '/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png';

export function GlobalRidoAIButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <>
      {/* Single floating RidoAI button */}
      <button
        onClick={() => setIsOpen(true)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex items-center gap-2 transition-all duration-300",
          "hover:scale-105 active:scale-95",
          isOpen && "hidden"
        )}
        aria-label="Zapytaj RidoAI"
      >
        {/* Speech bubble */}
        <div className={cn(
          "bg-background border shadow-lg rounded-full px-4 py-2.5 text-sm font-medium text-foreground transition-all duration-300",
          isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 pointer-events-none",
          "hidden sm:block"
        )}>
          Zadaj pytanie RidoAI
        </div>

        {/* Avatar circle */}
        <div className="relative w-14 h-14 rounded-full bg-primary shadow-lg flex items-center justify-center ring-2 ring-primary/20 hover:ring-primary/40 transition-all">
          <img
            src={AVATAR}
            alt="RidoAI"
            className="w-10 h-10 rounded-full object-cover"
          />
          {/* Online indicator */}
          <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
        </div>
      </button>

      {/* Chat panel */}
      <RidoAIChatPanel open={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
