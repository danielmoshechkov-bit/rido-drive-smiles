import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, ChevronRight, ChevronLeft, Sparkles, ListTodo, MessageSquare, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const TOUR_STEPS = [
  {
    icon: Sparkles,
    title: "Witaj w Workspace! 🎉",
    description: "To Twoje centrum zarządzania projektami. Twórz zadania, komunikuj się z zespołem i automatyzuj procesy — wszystko w jednym miejscu.",
    highlight: "header",
  },
  {
    icon: ListTodo,
    title: "Zadania & Kanban",
    description: "Dodawaj zadania, przypisuj je do członków zespołu, śledź czas i postępy. Widok listy i tablicy Kanban do wyboru.",
    highlight: "tasks",
  },
  {
    icon: MessageSquare,
    title: "Komunikacja w czasie rzeczywistym",
    description: "Kanały tematyczne, wątki, reakcje emoji i wyszukiwanie. Wszystko czego potrzebujesz do sprawnej komunikacji.",
    highlight: "chat",
  },
  {
    icon: Users,
    title: "Zarządzanie zespołem",
    description: "Zapraszaj członków przez email lub link. Przydzielaj role: Owner, Manager, Member lub Guest. Śledź aktywność online.",
    highlight: "members",
  },
  {
    icon: Zap,
    title: "Automatyzacje & AI",
    description: "Automatyzuj powtarzalne procesy — np. auto-przypisanie zadań czy powiadomienia. AI Planner pomoże Ci zaplanować projekt.",
    highlight: "automations",
  },
];

const STORAGE_KEY = "workspace_onboarding_completed";

interface Props {
  onNavigate?: (tab: string) => void;
}

export function WorkspaceOnboardingTour({ onNavigate }: Props) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, "true");
  };

  const next = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  };

  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!visible) return null;

  const current = TOUR_STEPS[step];
  const Icon = current.icon;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" onClick={dismiss} />

      {/* Tour card */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-primary/20 animate-in fade-in zoom-in-95 duration-300">
          <CardContent className="p-6">
            {/* Close */}
            <button
              onClick={dismiss}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Step indicator */}
            <div className="flex gap-1.5 mb-5">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === step ? "bg-primary w-8" : i < step ? "bg-primary/40 w-4" : "bg-muted w-4"
                  )}
                />
              ))}
            </div>

            {/* Icon */}
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: 'var(--nav-bar-color, #6C3CF0)', color: 'white' }}
            >
              <Icon className="h-7 w-7" />
            </div>

            {/* Content */}
            <h3 className="text-xl font-bold mb-2">{current.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              {current.description}
            </p>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {step + 1} / {TOUR_STEPS.length}
              </div>
              <div className="flex gap-2">
                {step > 0 && (
                  <Button variant="ghost" size="sm" onClick={prev}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Wstecz
                  </Button>
                )}
                {step === 0 && (
                  <Button variant="ghost" size="sm" onClick={dismiss}>
                    Pomiń
                  </Button>
                )}
                <Button size="sm" onClick={next}>
                  {step < TOUR_STEPS.length - 1 ? (
                    <>
                      Dalej
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  ) : (
                    "Zaczynamy! 🚀"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
