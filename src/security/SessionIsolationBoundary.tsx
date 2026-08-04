import { Fragment, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  clearPrincipalScopedClientState,
  principalFingerprint,
  SECURITY_CONTEXT_CHANGE_EVENT,
} from "@/security/sessionIsolation";

const REVALIDATE_AUTH_EVENTS = new Set([
  "SIGNED_IN",
  "SIGNED_OUT",
  "TOKEN_REFRESHED",
  "USER_UPDATED",
  "PASSWORD_RECOVERY",
]);

export function SessionIsolationBoundary({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const principalRef = useRef<string | undefined>(undefined);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const [state, setState] = useState({ ready: false, epoch: 0 });

  useEffect(() => {
    mountedRef.current = true;

    const transition = (
      nextPrincipal: string,
      options: { force?: boolean; revalidate?: boolean } = {},
    ) => {
      const previous = principalRef.current;
      if (previous === undefined) {
        principalRef.current = nextPrincipal;
        setState((current) => ({ ...current, ready: true }));
        return;
      }
      if (!options.force && previous === nextPrincipal) {
        if (options.revalidate) {
          queueRef.current = queueRef.current.catch(() => undefined).then(async () => {
            try {
              await queryClient.cancelQueries();
              await queryClient.resetQueries();
            } catch {
              // RLS nadal jest warstwą rozstrzygającą. Błąd odświeżenia nie może
              // wywołać pętli remountu podczas reautoryzacji/resetu hasła.
            }
          });
        }
        return;
      }

      setState((current) => ({ ...current, ready: false }));
      queueRef.current = queueRef.current.catch(() => undefined).then(async () => {
        await clearPrincipalScopedClientState(queryClient, nextPrincipal);
        principalRef.current = nextPrincipal;
        if (mountedRef.current) {
          setState((current) => ({ ready: true, epoch: current.epoch + 1 }));
        }
      });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        transition(
          principalFingerprint(session),
          { revalidate: REVALIDATE_AUTH_EVENTS.has(event) },
        );
      },
    );

    void supabase.auth.getSession().then(({ data }) => {
      transition(principalFingerprint(data.session));
    }).catch(() => {
      transition("anonymous");
    });

    const handleContextChange = () => {
      transition(principalRef.current ?? "anonymous", { force: true });
    };
    window.addEventListener(SECURITY_CONTEXT_CHANGE_EVENT, handleContextChange);

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      window.removeEventListener(SECURITY_CONTEXT_CHANGE_EVENT, handleContextChange);
    };
  }, [queryClient]);

  if (!state.ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <span className="sr-only">Izolowanie danych sesji…</span>
      </div>
    );
  }

  return <Fragment key={state.epoch}>{children}</Fragment>;
}
