import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, Users, Building2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Global handler for `?invitation=<id>` from email links.
 * Token-based: works even when the user is NOT logged in. The acceptance
 * is performed server-side using the invitation UUID as token.
 */
export function WorkshopInvitationHandler() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const invitationId = params.get('invitation');

  const [processing, setProcessing] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [companyName, setCompanyName] = useState<string>('');
  const [invitedEmail, setInvitedEmail] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [emailMatchesUser, setEmailMatchesUser] = useState(false);

  const acceptInvitation = useCallback(async (invId: string) => {
    const { data, error } = await supabase.functions.invoke('workshop-accept-employee-invitation', {
      body: { invitation_id: invId, accept: true },
    });
    if (error) throw error;
    const res: any = data || {};
    if (res.error) throw new Error(res.error);
    return res;
  }, []);

  // Process ?invitation=<id>
  useEffect(() => {
    if (!invitationId) return;
    let cancelled = false;

    (async () => {
      setProcessing(true);
      try {
        const res = await acceptInvitation(invitationId);
        if (cancelled) return;

        setCompanyName(res.company_name || 'warsztat');
        setInvitedEmail(res.invited_email || '');

        // Check auth status to tailor welcome message
        const { data: { user } } = await supabase.auth.getUser();
        setIsLoggedIn(!!user);
        setEmailMatchesUser(
          !!user && (user.email || '').toLowerCase() === (res.invited_email || '').toLowerCase()
        );

        setWelcomeOpen(true);

        // Remove ?invitation= from URL
        const next = new URLSearchParams(params);
        next.delete('invitation');
        setParams(next, { replace: true });
      } catch (e: any) {
        toast.error(`Nie udało się przyjąć zaproszenia: ${e.message || e}`);
      } finally {
        if (!cancelled) setProcessing(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitationId]);

  // After login (or token refresh), link any accepted-but-unlinked invitations to the user
  useEffect(() => {
    let cancelled = false;
    const scan = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const email = (user.email || '').toLowerCase();
        const { data: invs } = await (supabase.from('workshop_employee_invitations') as any)
          .select('id, status, invited_email')
          .or(`invited_email.eq.${email},invited_user_id.eq.${user.id}`);
        if (!invs || cancelled) return;
        for (const inv of invs as any[]) {
          if (inv.status === 'pending') {
            try { await acceptInvitation(inv.id); } catch (e) { console.warn('auto-accept failed', e); }
          }
        }
      } catch (e) { console.warn('auto-link scan failed', e); }
    };
    scan();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') scan();
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [acceptInvitation]);

  const handleClose = async () => {
    setWelcomeOpen(false);
    if (!isLoggedIn) {
      navigate(`/auth?email=${encodeURIComponent(invitedEmail)}`);
    } else if (!emailMatchesUser) {
      // logged in as different user — sign out and go to login with email prefilled
      await supabase.auth.signOut();
      navigate(`/auth?email=${encodeURIComponent(invitedEmail)}`);
    } else {
      navigate('/klient');
    }
  };

  return (
    <>
      {processing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card border rounded-xl p-6 flex items-center gap-3 shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">Aktywujemy Twoje konto pracownika…</span>
          </div>
        </div>
      )}

      <Dialog open={welcomeOpen} onOpenChange={(o) => { if (!o) handleClose(); else setWelcomeOpen(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              Witaj w gronie pracowników!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <Building2 className="h-5 w-5 text-primary" />
              <div className="text-sm">
                Zostałeś/aś dodany/a do zespołu <strong>{companyName}</strong>.
                Twoje konto pracownika jest już <strong>aktywne</strong>.
              </div>
            </div>

            <div className="space-y-3 text-sm">
              {!isLoggedIn ? (
                <>
                  <p className="font-medium">Jak zacząć:</p>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li>Zaloguj się na swoje konto <strong>{invitedEmail}</strong>.</li>
                    <li>W prawym górnym rogu wejdź w <strong>Moje konto</strong>.</li>
                    <li>Otwórz <strong>„Wybierz moduł"</strong> i kliknij <strong>„Moja Praca"</strong> <Users className="inline h-3.5 w-3.5 -mt-0.5" />.</li>
                  </ol>
                </>
              ) : emailMatchesUser ? (
                <>
                  <p className="font-medium">Jak zacząć:</p>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li>Wejdź w <strong>Moje konto</strong> w prawym górnym rogu.</li>
                    <li>Otwórz <strong>„Wybierz moduł"</strong>.</li>
                    <li>Kliknij kafelek <strong>„Moja Praca"</strong> <Users className="inline h-3.5 w-3.5 -mt-0.5" />.</li>
                  </ol>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Jesteś zalogowany/a na inne konto. Aby korzystać z modułu Pracownika,
                  zaloguj się na <strong>{invitedEmail}</strong>.
                </p>
              )}

              <div className="bg-muted/50 rounded-lg p-3 mt-3">
                <p className="font-medium mb-1 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" />
                  Moduł Pracownika Warsztatu
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Zobaczysz listę zleceń przydzielonych Ci przez warsztat — dane pojazdu,
                  klienta i listę zadań. Wypełniasz protokół naprawczy i wysyłasz do akceptacji,
                  warsztat zatwierdza i automatycznie przenosi pozycje na kartę zlecenia.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleClose} className="w-full">
              {!isLoggedIn || !emailMatchesUser ? 'Przejdź do logowania' : 'OK, rozumiem'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
