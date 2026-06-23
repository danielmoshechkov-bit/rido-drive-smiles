import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail, LogIn, ArrowRight } from "lucide-react";

/**
 * Ramka „Zostałeś zaproszony do projektu X" — pokazywana na stronie głównej.
 * Link z maila prowadzi na `/?invite=1` (koniec 404 z /logowanie).
 *  - NIEZALOGOWANY: „Masz zaproszenie — zaloguj się / zarejestruj" → /auth.
 *  - ZALOGOWANY: lista zaproszeń z nazwami projektów (RPC get_my_invited_projects)
 *    + „Dołącz" → /workflow (tam akceptacja).
 * Mount globalny (App.tsx). Pokazuje się gdy ?invite=1 LUB są oczekujące zaproszenia.
 */
export function InviteWelcomeBanner() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [invites, setInvites] = useState<{ project_id: string; project_name: string }[]>([]);

  useEffect(() => {
    const inviteFlag = params.get("invite") === "1";
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // niezalogowany — pokaż ramkę tylko gdy przyszedł z linku zaproszenia
        if (inviteFlag) { setLoggedIn(false); setInvites([]); setOpen(true); }
        return;
      }
      setLoggedIn(true);
      const { data } = await (supabase as any).rpc("get_my_invited_projects");
      const rows = (data || []) as any[];
      if (rows.length > 0) {
        setInvites(rows.map((r) => ({ project_id: r.project_id, project_name: r.project_name || "Projekt" })));
        setOpen(true);
      } else if (inviteFlag) {
        // przyszedł z linku, ale claim jeszcze nie złapał / brak — łagodny komunikat
        setInvites([]); setOpen(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Zostałeś zaproszony
          </DialogTitle>
        </DialogHeader>

        {!loggedIn ? (
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Masz zaproszenie do projektu w GetRido. Zaloguj się lub zarejestruj, aby dołączyć.
            </p>
            <Button className="w-full gap-2" onClick={() => { setOpen(false); navigate("/auth?redirect=/workflow"); }}>
              <LogIn className="h-4 w-4" /> Zaloguj się / Zarejestruj
            </Button>
          </div>
        ) : invites.length > 0 ? (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              {invites.length === 1
                ? "Zostałeś zaproszony do projektu:"
                : `Masz ${invites.length} zaproszenia do projektów:`}
            </p>
            <div className="space-y-1.5">
              {invites.map((inv) => (
                <div key={inv.project_id} className="flex items-center gap-2 rounded-md border p-2.5 text-sm">
                  <Mail className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-medium">{inv.project_name}</span>
                </div>
              ))}
            </div>
            <Button className="w-full gap-2" onClick={() => { setOpen(false); navigate("/workflow"); }}>
              Przejdź i dołącz <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Nie znaleźliśmy aktywnych zaproszeń na tym koncie. Jeśli zaproszenie wysłano na inny adres,
              zaloguj się na właściwe konto.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>Zamknij</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
