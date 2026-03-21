import { useState } from 'react';
import { cn } from '@/lib/utils';
import { RidoAIChatPanel } from './RidoAIChatPanel';
import ridoMascot from '@/assets/rido-mascot.png';

export function GlobalRidoAIButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating RidoAI button — always visible with label */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex items-center gap-2.5 transition-all duration-300",
          "hover:scale-105 active:scale-95",
          isOpen && "hidden"
        )}
        aria-label="Zapytaj RidoAI"
      >
        {/* Speech bubble — always visible */}
        <div className="bg-background border shadow-lg rounded-full px-4 py-2.5 text-sm font-medium text-foreground hidden sm:block">
          Zadaj pytanie RidoAI
        </div>

        {/* Mascot circle */}
        <div className="relative w-14 h-14 rounded-full bg-primary shadow-lg flex items-center justify-center ring-2 ring-primary/20 hover:ring-primary/40 transition-all">
          <img
            src={ridoMascot}
            alt="RidoAI"
            className="w-11 h-11 rounded-full object-cover"
          />
          {/* Online indicator */}
          <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background" />
        </div>
      </button>

      {/* Chat panel */}
      <RidoAIChatPanel open={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
