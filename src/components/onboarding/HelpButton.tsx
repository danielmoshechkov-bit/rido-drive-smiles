import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { cn } from "@/lib/utils";

interface HelpButtonProps {
  className?: string;
  variant?: 'floating' | 'inline';
}

export function HelpButton({ className, variant = 'floating' }: HelpButtonProps) {
  const { openHelp } = useOnboarding();

  if (variant === 'inline') {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={openHelp}
        className={cn("gap-2", className)}
      >
        <HelpCircle className="h-4 w-4" />
        Pomoc
      </Button>
    );
  }

  return (
    <Button
      onClick={openHelp}
      className={cn(
        "fixed bottom-20 right-4 z-50 h-12 w-12 rounded-full shadow-lg",
        "bg-primary hover:bg-primary/90 text-primary-foreground",
        "flex items-center justify-center p-0",
        "transition-transform hover:scale-110",
        className
      )}
      aria-label="Otwórz pomoc"
    >
      <HelpCircle className="h-6 w-6" />
    </Button>
  );
}
