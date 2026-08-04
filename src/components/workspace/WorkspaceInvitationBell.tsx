import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Mail } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/**
 * Sygnał zaproszeń do projektów Workspace — renderowany INLINE w nagłówku
 * (obok „Dodaj ogłoszenie"), kompaktowa ikonka z licznikiem. NIE floating.
 * Po kliknięciu: lista zaproszeń z DATĄ I GODZINĄ otrzymania.
 *
 * Źródło: workspace_project_members (status='invited') po EMAILU usera —
 * działa też dla świeżo zarejestrowanych (claim email→user_id przy logowaniu).
 * Zwraca null gdy brak zaproszeń (nie zajmuje miejsca).
 */
export function WorkspaceInvitationBell() {
  const navigate = useNavigate();
  const [invites, setInvites] = useState<{ id: string; project_id: string; project_name: string; created_at: string }[]>([]);
  const [open, setOpen] = useState(false);

  const loadAndClaim = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setInvites([]); return; }
    const emailLc = user.email.toLowerCase();

    // RPC zwraca zaproszenia Z NAZWĄ projektu (omija RLS active-only → koniec
    // „Nieznany projekt"). Fallback: bezpośredni odczyt member-rows (bez nazwy).
    const { data: rpcRows, error: rpcErr } = await (supabase as any).rpc("get_my_invited_projects");
    if (!rpcErr && rpcRows) {
      setInvites((rpcRows as any[]).map((r) => ({
        id: r.member_id, project_id: r.project_id,
        project_name: r.project_name || "Projekt", created_at: r.created_at,
      })));
      return;
    }
    const { data: pend, error: pendErr } = await supabase
      .from("workspace_project_members")
      .select("id, project_id, created_at")
      .eq("email", emailLc).eq("status", "invited");
    if (pendErr) { console.error("load invites:", pendErr); setInvites([]); return; }
    setInvites((pend || []).map((p: any) => ({
      id: p.id, project_id: p.project_id, project_name: "Projekt", created_at: p.created_at,
    })));
  }, []);

  useEffect(() => {
    loadAndClaim();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { loadAndClaim(); });
    return () => { sub.subscription.unsubscribe(); };
  }, [loadAndClaim]);

  if (invites.length === 0) return null;

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-lg" aria-label="Zaproszenia do projektów">
          <Bell className="h-5 w-5" />
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {invites.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <p className="text-xs font-semibold px-2 py-1 text-muted-foreground">
          Zaproszenia do projektów ({invites.length})
        </p>
        {invites.map(inv => (
          <button
            key={inv.id}
            onClick={() => { setOpen(false); navigate('/workflow'); }}
            className="w-full flex items-start gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent text-left"
          >
            <Mail className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span className="flex-1">
              <span className="block">Zaproszenie do „{inv.project_name}"</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">{fmt(inv.created_at)}</span>
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
