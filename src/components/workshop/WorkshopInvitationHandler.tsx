import { useEffect, useState, useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, Users, Building2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Obsługa `?invitation=<id>` z linku w mailu albo w SMS-ie.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DWIE DROGI DO TEGO SAMEGO — OBIE POTRZEBNE
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. ŻETON Z LINKU. Kliknięcie działa bez zalogowania, ale wtedy nie ma kogo
 *    przypiąć — zaproszenie zostaje otwarte (patrz funkcja brzegowa), a my
 *    ZAPAMIĘTUJEMY jego numer w przeglądarce. Po założeniu konta wołamy
 *    przyjęcie jeszcze raz, już z sesją: dowodem jest link, który przyszedł
 *    na numer albo na adres zaproszonego.
 * 2. DOPASOWANIE PO ZALOGOWANIU (`powiaz_pracownika_po_zalogowaniu`) — dla
 *    wszystkich, którzy zakładali konto gdzie indziej niż klikali link.
 *    Dopasowuje po POTWIERDZONYM adresie konta, nigdy po numerze wpisanym
 *    przy rejestracji: ten jest własnym oświadczeniem zakładającego.
 *
 * Do 15.09.2026 nie działała żadna: przyjęcie zamykało zaproszenie, zanim
 * powstało konto, a skan po zalogowaniu ponawiał wyłącznie te `pending`.
 * W bazie: dziesięć zaproszeń przyjętych, dwóch pracowników powiązanych.
 */

/** Numer zaproszenia przeczekuje w przeglądarce rejestrację. */
const KLUCZ_ZAPROSZENIA = 'getrido.zaproszenie.pracownik';
export function WorkshopInvitationHandler() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const invitationId = params.get('invitation');

  const [processing, setProcessing] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [companyName, setCompanyName] = useState<string>('');
  const [invitedEmail, setInvitedEmail] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [emailMatchesUser, setEmailMatchesUser] = useState(false);
  /** Zaproszenie przyjęte, ale nie ma jeszcze konta, do którego je przypiąć. */
  const [czekaNaKonto, setCzekaNaKonto] = useState(false);

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

        // Bez konta zaproszenie zostaje otwarte — a żeton czeka w przeglądarce
        // na powrót po rejestracji. Bez tego zapisu link zadziałałby raz
        // i nigdy więcej, bo drugi raz nikt go już nie otworzy.
        setCzekaNaKonto(!!res.czeka_na_konto);
        if (res.czeka_na_konto) {
          try { localStorage.setItem(KLUCZ_ZAPROSZENIA, invitationId); } catch { /* prywatne okno */ }
        } else {
          try { localStorage.removeItem(KLUCZ_ZAPROSZENIA); } catch { /* jw. */ }
        }

        setCompanyName(res.company_name || t('workshop.invitation.workshopFallback'));
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
        toast.error(t('workshop.invitation.acceptError', { error: e.message || e }));
      } finally {
        if (!cancelled) setProcessing(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitationId]);

  // Po zalogowaniu: dopasowanie po stronie bazy + dokończenie zaproszenia,
  // którego link kliknięto przed założeniem konta.
  useEffect(() => {
    let cancelled = false;

    const dopnij = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        // 1. Dopasowanie po potwierdzonej tożsamości konta. Funkcja nie
        //    przyjmuje parametrów — działa wyłącznie na `auth.uid()`, więc nie
        //    ma czego podstawić, żeby wejść do cudzego warsztatu.
        const { data: powiazane, error } = await (supabase as any)
          .rpc('powiaz_pracownika_po_zalogowaniu');
        if (error) {
          console.warn('powiaz_pracownika_po_zalogowaniu', error.message);
        } else if (Array.isArray(powiazane) && powiazane.length > 0) {
          toast.success(
            powiazane.length === 1
              ? `Dołączono do zespołu: ${powiazane[0].warsztat}`
              : `Dołączono do ${powiazane.length} zespołów`,
          );
        }

        // 2. Zaproszenie zapamiętane przed rejestracją — teraz jest kogo przypiąć.
        const zapamietane = localStorage.getItem(KLUCZ_ZAPROSZENIA);
        if (zapamietane) {
          try {
            const res = await acceptInvitation(zapamietane);
            if (res?.user_linked) localStorage.removeItem(KLUCZ_ZAPROSZENIA);
          } catch (e) {
            console.warn('dokończenie zaproszenia nie doszło', e);
          }
        }
      } catch (e) {
        console.warn('dopięcie po zalogowaniu nie doszło', e);
      }
    };

    dopnij();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') dopnij();
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
            <span className="text-sm">{t('workshop.invitation.activatingAccount')}</span>
          </div>
        </div>
      )}

      <Dialog open={welcomeOpen} onOpenChange={(o) => { if (!o) handleClose(); else setWelcomeOpen(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              {t('workshop.invitation.welcomeTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <Building2 className="h-5 w-5 text-primary" />
              <div className="text-sm">
                <Trans i18nKey="workshop.invitation.addedToTeam" values={{ company: companyName }} components={{ strong: <strong /> }} />
              </div>
            </div>

            <div className="space-y-3 text-sm">
              {!isLoggedIn ? (
                <>
                  {czekaNaKonto && (
                    // Hardkod po polsku świadomie: zdanie powstało 15.09.2026
                    // i ma trafić do ludzi od razu, a nie po siedmiu tłumaczeniach.
                    // Zaproszenie ZOSTAJE otwarte — link zadziała jeszcze raz.
                    <p className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      Zaproszenie czeka na Twoje konto. Załóż je albo zaloguj się
                      <strong> w tej samej przeglądarce</strong> — dokończymy dołączenie
                      do zespołu automatycznie. Link z wiadomości nadal działa.
                    </p>
                  )}
                  <p className="font-medium">{t('workshop.invitation.howToStart')}</p>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li><Trans i18nKey="workshop.invitation.stepLoginEmail" values={{ email: invitedEmail }} components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="workshop.invitation.stepMyAccount" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="workshop.invitation.stepSelectModule" components={{ strong: <strong /> }} /> <Users className="inline h-3.5 w-3.5 -mt-0.5" /></li>
                  </ol>
                </>
              ) : emailMatchesUser ? (
                <>
                  <p className="font-medium">{t('workshop.invitation.howToStart')}</p>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li><Trans i18nKey="workshop.invitation.stepMyAccountShort" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="workshop.invitation.stepOpenSelectModule" components={{ strong: <strong /> }} /></li>
                    <li><Trans i18nKey="workshop.invitation.stepClickMyWork" components={{ strong: <strong /> }} /> <Users className="inline h-3.5 w-3.5 -mt-0.5" /></li>
                  </ol>
                </>
              ) : (
                <p className="text-muted-foreground">
                  <Trans i18nKey="workshop.invitation.differentAccount" values={{ email: invitedEmail }} components={{ strong: <strong /> }} />
                </p>
              )}

              <div className="bg-muted/50 rounded-lg p-3 mt-3">
                <p className="font-medium mb-1 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" />
                  {t('workshop.invitation.moduleTitle')}
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {t('workshop.invitation.moduleDesc')}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleClose} className="w-full">
              {!isLoggedIn || !emailMatchesUser ? t('workshop.invitation.goToLogin') : t('workshop.invitation.okUnderstood')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
