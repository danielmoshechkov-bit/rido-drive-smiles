import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Invitation {
  id: string;
  project_id: string;
  project_name?: string;
  invited_by_name?: string;
  created_at: string;
}

interface Props {
  onAccepted: () => void;
}

export function WorkspaceInvitations({ onAccepted }: Props) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setLoading(false); return; }

    // Find pending member entries where email matches and status is 'invited'
    const { data: memberInvites } = await supabase
      .from("workspace_project_members")
      .select("id, project_id, created_at")
      .eq("email", user.email)
      .eq("status", "invited");

    if (!memberInvites || memberInvites.length === 0) {
      setInvitations([]);
      setLoading(false);
      return;
    }

    // Get project names
    const projectIds = memberInvites.map(i => i.project_id);
    const { data: projects } = await supabase
      .from("workspace_projects")
      .select("id, name")
      .in("id", projectIds);

    const projectMap = new Map((projects || []).map(p => [p.id, p.name]));

    setInvitations(memberInvites.map(inv => ({
      ...inv,
      project_name: projectMap.get(inv.project_id) || "Nieznany projekt",
    })));
    setLoading(false);
  };

  const handleAccept = async (inv: Invitation) => {
    setProcessing(inv.id);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setProcessing(null); return; }

    const { error } = await supabase
      .from("workspace_project_members")
      .update({ 
        status: "active", 
        user_id: user.id,
        display_name: user.email 
      })
      .eq("id", inv.id);

    if (error) {
      toast.error("Błąd akceptacji zaproszenia");
      console.error(error);
    } else {
      toast.success(`Dołączono do projektu "${inv.project_name}"`);
      setInvitations(prev => prev.filter(i => i.id !== inv.id));
      onAccepted();
    }
    setProcessing(null);
  };

  const handleDecline = async (inv: Invitation) => {
    setProcessing(inv.id);
    await supabase
      .from("workspace_project_members")
      .delete()
      .eq("id", inv.id);

    toast.success("Zaproszenie odrzucone");
    setInvitations(prev => prev.filter(i => i.id !== inv.id));
    setProcessing(null);
  };

  if (loading) return null;
  if (invitations.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
        <Mail className="h-4 w-4" />
        Zaproszenia do projektów
        <Badge variant="destructive" className="text-xs">{invitations.length}</Badge>
      </h3>
      {invitations.map(inv => (
        <Card key={inv.id} className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{inv.project_name}</p>
              <p className="text-xs text-muted-foreground">
                Zaproszono {new Date(inv.created_at).toLocaleDateString('pl-PL')}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => handleAccept(inv)}
                disabled={processing === inv.id}
                className="gap-1"
              >
                {processing === inv.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5" />
                )}
                Dołącz
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDecline(inv)}
                disabled={processing === inv.id}
                className="gap-1"
              >
                <XCircle className="h-3.5 w-3.5" />
                Odrzuć
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
