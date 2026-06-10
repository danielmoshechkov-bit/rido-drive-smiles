import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, Users, Building2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Global handler mounted in App.tsx.
 * Detects `?invitation=<id>` in the URL after the user clicks the email link
 * and finishes Supabase auth confirmation. Accepts the invitation server-side,
 * then shows a welcome modal with instructions.
 */
export function WorkshopInvitationHandler() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const invitationId = params.get('invitation');

  const [processing, setProcessing] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [companyName, setCompanyName] = useState<string>('');

  useEffect(() => {
    if (!invitationId) return;
    let cancelled = false;

    (async () => {
      setProcessing(true);
      try {
        // Wait for auth session (the email-confirm flow may need a tick)
        let attempts = 0;
        let user = null;
        while (attempts < 10 && !user) {
          const { data: { user: u } } = await supabase.auth.getUser();
          user = u;
          if (!user) { await new Promise(r => setTimeout(r, 400)); attempts++; }
        }
        if (!user) {
          // Not logged in — redirect to auth, keep invitation id in URL
          navigate(`/auth?redirect=${encodeURIComponent(`/klient?invitation=${invitationId}`)}`);
          return;
        }

        const { data, error } = await supabase.functions.invoke('workshop-accept-employee-invitation', {
          body: { invitation_id: invitationId, accept: true },
        });
        if (cancelled) return;
        if (error) throw error;

        // Fetch company name for welcome modal
        try {
          const { data: inv } = await (supabase.from('workshop_employee_invitations') as any)
            .select('provider_id, service_providers(company_name)')
            .eq('id', invitationId).maybeSingle();
          const cn = (inv as any)?.service_providers?.company_name || 'warsztat';
          setCompanyName(cn);
        } catch { setCompanyName('warsztat'); }

        // Strip param + navigate to client portal
        const next = new URLSearchParams(params);
        next.delete('invitation');
        setParams(next, { replace: true });
        setWelcomeOpen(true);
        // Force a navigation to /klient so the modules tile updates
        setTimeout(() => navigate('/klient', { replace: false }), 100);
      } catch (e: any) {
        toast.error(`Nie udało się przyjąć zaproszenia: ${e.message || e}`);
      } finally {
        if (!cancelled) setProcessing(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitationId]);

  return (
    <>
      {processing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card border rounded-xl p-6 flex items-center gap-3 shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">Przyjmujemy zaproszenie…</span>
          </div>
        </div>
      )}

      <Dialog open={welcomeOpen} onOpenChange={setWelcomeOpen}>
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
                Zostałeś/aś dodany/a do zespołu <strong>{companyName}</strong>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <p className="font-medium">Jak zacząć:</p>
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                <li>Wejdź w <strong>Moje konto</strong> w prawym górnym rogu.</li>
                <li>Otwórz zakładkę <strong>„Wybierz moduł"</strong>.</li>
                <li>Kliknij kafelek <strong>„Pracownik Warsztatu"</strong> <Users className="inline h-3.5 w-3.5 -mt-0.5" />.</li>
              </ol>

              <div className="bg-muted/50 rounded-lg p-3 mt-3">
                <p className="font-medium mb-1 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" />
                  Moduł Pracownika Warsztatu
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  W module zobaczysz listę zleceń przydzielonych Tobie przez warsztat.
                  Otwierając zlecenie zobaczysz dane pojazdu, klienta i listę zadań do wykonania.
                  Wypełniasz protokół naprawczy (uwagi, użyte części, godziny pracy) i wysyłasz do akceptacji
                  — warsztat zatwierdza i automatycznie przenosi pozycje na kartę zlecenia.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setWelcomeOpen(false)} className="w-full">
              OK, rozumiem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
