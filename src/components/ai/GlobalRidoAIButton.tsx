import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { RidoAIChatPanel } from './RidoAIChatPanel';
import ridoMascot from '@/assets/rido-mascot.png';
import { supabase } from '@/integrations/supabase/client';
import { AuthModal } from '@/components/auth/AuthModal';

export function GlobalRidoAIButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [showAuth, setShowAuth] = useState(false);

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
          "fixed bottom-6 right-6 z-40 flex items-center gap-2.5 transition-all duration-300",
          "hover:scale-105 active:scale-95",
          isOpen && "hidden"
        )}
        aria-label="Zapytaj RidoAI"
      >
        <div className="bg-background border shadow-lg rounded-full px-4 py-2.5 text-sm font-medium text-foreground hidden sm:block">
          Zadaj pytanie RidoAI
        </div>
        <div className="relative w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center ring-2 ring-foreground/80 hover:ring-foreground transition-all">
          <img src={ridoMascot} alt="RidoAI" className="w-11 h-11 rounded-full object-cover" />
          <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background" />
        </div>
      </button>

      <RidoAIChatPanel open={isOpen} onClose={() => setIsOpen(false)} />

      {showAuth && (
        <AuthModal
          isOpen={showAuth}
          onClose={() => setShowAuth(false)}
          defaultTab="login"
          title="Zaloguj się, aby korzystać z RidoAI"
          subtitle="Asystent RidoAI jest dostępny tylko dla zarejestrowanych użytkowników portalu."
        />
      )}
    </>
  );
}
