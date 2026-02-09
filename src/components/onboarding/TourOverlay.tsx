import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { cn } from "@/lib/utils";

interface TooltipPosition {
  top: number;
  left: number;
  arrowPosition: 'top' | 'bottom' | 'left' | 'right';
}

export function TourOverlay() {
  const { 
    activeTour, 
    getCurrentTour, 
    getCurrentStep, 
    currentTourStep,
    nextStep, 
    prevStep, 
    endTour 
  } = useOnboarding();
  
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const tour = getCurrentTour();
  const step = getCurrentStep();

  const calculatePosition = useCallback(() => {
    if (!step) return;

    const target = document.querySelector(step.target);
    if (!target) {
      // Target not found, try to proceed or end tour
      console.warn(`Tour target not found: ${step.target}`);
      return;
    }

    const rect = target.getBoundingClientRect();
    setTargetRect(rect);

    const tooltipWidth = 320;
    const tooltipHeight = 160;
    const padding = 16;
    const arrowOffset = 12;

    let top = 0;
    let left = 0;
    let arrowPosition: TooltipPosition['arrowPosition'] = 'top';

    const placement = step.placement || 'bottom';

    switch (placement) {
      case 'bottom':
        top = rect.bottom + arrowOffset;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        arrowPosition = 'top';
        break;
      case 'top':
        top = rect.top - tooltipHeight - arrowOffset;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        arrowPosition = 'bottom';
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - arrowOffset;
        arrowPosition = 'right';
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + arrowOffset;
        arrowPosition = 'left';
        break;
    }

    // Ensure tooltip stays within viewport
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding));
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipHeight - padding));

    setPosition({ top, left, arrowPosition });
  }, [step]);

  useEffect(() => {
    if (!activeTour || !step) {
      setPosition(null);
      setTargetRect(null);
      return;
    }

    // Initial calculation
    calculatePosition();

    // Recalculate on scroll/resize
    const handleUpdate = () => calculatePosition();
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    // Scroll target into view
    const target = document.querySelector(step.target);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [activeTour, step, calculatePosition]);

  if (!activeTour || !tour || !step || !position) return null;

  const totalSteps = tour.steps.length;
  const isFirstStep = currentTourStep === 0;
  const isLastStep = currentTourStep === totalSteps - 1;

  return (
    <>
      {/* Backdrop with spotlight effect */}
      <div className="fixed inset-0 z-[100] pointer-events-none">
        {targetRect && (
          <svg className="w-full h-full">
            <defs>
              <mask id="spotlight-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <rect
                  x={targetRect.left - 4}
                  y={targetRect.top - 4}
                  width={targetRect.width + 8}
                  height={targetRect.height + 8}
                  rx="8"
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(0, 0, 0, 0.6)"
              mask="url(#spotlight-mask)"
            />
          </svg>
        )}
      </div>

      {/* Spotlight border */}
      {targetRect && (
        <div
          className="fixed z-[101] pointer-events-none rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className={cn(
          "fixed z-[102] w-80 bg-popover text-popover-foreground rounded-xl shadow-2xl border",
          "animate-in fade-in-0 zoom-in-95"
        )}
        style={{
          top: position.top,
          left: position.left,
        }}
      >
        {/* Arrow */}
        <div
          className={cn(
            "absolute w-3 h-3 bg-popover border rotate-45",
            position.arrowPosition === 'top' && "-top-1.5 left-1/2 -translate-x-1/2 border-l border-t",
            position.arrowPosition === 'bottom' && "-bottom-1.5 left-1/2 -translate-x-1/2 border-r border-b",
            position.arrowPosition === 'left' && "-left-1.5 top-1/2 -translate-y-1/2 border-l border-b",
            position.arrowPosition === 'right' && "-right-1.5 top-1/2 -translate-y-1/2 border-r border-t"
          )}
        />

        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b">
          <span className="text-xs text-muted-foreground">
            Krok {currentTourStep + 1} z {totalSteps}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={endTour}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-semibold mb-1">{step.title}</h3>
          <p className="text-sm text-muted-foreground">{step.content}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-3 border-t bg-muted/30 rounded-b-xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={prevStep}
            disabled={isFirstStep}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Wstecz
          </Button>
          
          {/* Progress dots */}
          <div className="flex gap-1">
            {tour.steps.map((_, index) => (
              <div
                key={index}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-colors",
                  index === currentTourStep ? "bg-primary" : "bg-muted-foreground/30"
                )}
              />
            ))}
          </div>

          <Button
            size="sm"
            onClick={nextStep}
            className="gap-1"
          >
            {isLastStep ? 'Zakończ' : 'Dalej'}
            {!isLastStep && <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </>
  );
}
