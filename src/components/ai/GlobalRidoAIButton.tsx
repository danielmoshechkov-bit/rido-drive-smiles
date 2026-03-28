import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { RidoAIChatPanel } from './RidoAIChatPanel';
import ridoMascot from '@/assets/rido-mascot.png';
import { supabase } from '@/integrations/supabase/client';
import { AuthModal } from '@/components/auth/AuthModal';

export function GlobalRidoAIButton() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  const isWorkshopPanel = location.pathname.startsWith('/uslugi/panel');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session?.user);
      if (session?.user && showAuth) {
        setShowAuth(false);
        setIsOpen(true);
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, [showAuth]);

  const handleClick = () => {
    if (!isLoggedIn) {
      setShowAuth(true);
    } else {
      setIsOpen(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={cn(
          "fixed right-6 bottom-6 z-40 flex items-center gap-2.5 transition-all duration-300",
          "hover:scale-105 active:scale-95",
          isOpen && "hidden"
        )}
        aria-label="Zapytaj RidoAI"
      >
        <div className={cn("bg-background border shadow-lg rounded-full px-4 py-2.5 text-sm font-medium text-foreground hidden sm:block", isWorkshopPanel && 'hidden')}>
          Zadaj pytanie RidoAI
        </div>
        <div className="relative w-14 h-14 rounded-full bg-background shadow-lg flex items-center justify-center ring-2 ring-foreground/80 hover:ring-foreground transition-all overflow-hidden">
          <img src={ridoMascot} alt="RidoAI" className="w-10 h-10 object-contain" />
        </div>
      </button>

      <RidoAIChatPanel open={isOpen} onClose={() => setIsOpen(false)} />

      <AuthModal
        open={showAuth}
        onOpenChange={setShowAuth}
        initialMode="login"
        customDescription="Asystent RidoAI jest dostępny tylko dla zarejestrowanych użytkowników portalu. Zaloguj się lub załóż konto."
        onSuccess={() => {
          setShowAuth(false);
          setIsOpen(true);
        }}
      />
    </>
  );
}
