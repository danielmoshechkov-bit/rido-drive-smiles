import { useState, useEffect } from "react";
import { WorkspaceProject, WorkspaceMember } from "@/hooks/useWorkspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserPlus, Trash2, Mail, Crown, Shield, User, Users } from "lucide-react";
import { toast } from "sonner";

const ROLE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  owner: { label: "Właściciel", icon: Crown, color: "text-yellow-600" },
  admin: { label: "Admin", icon: Shield, color: "text-blue-600" },
  member: { label: "Członek", icon: User, color: "text-muted-foreground" },
  guest: { label: "Gość", icon: User, color: "text-muted-foreground" },
};

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

export function WorkspaceMembersView({ project, workspace }: Props) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  useEffect(() => { reload(); }, [project.id]);

  const reload = async () => {
    setLoading(true);
    const m = await workspace.loadMembers(project.id);
    setMembers(m);
    setLoading(false);
  };

  const handleInvite = async () => {
    if (!email.trim() || !email.includes('@')) {
      toast.error("Podaj prawidłowy email");
      return;
    }
    setInviting(true);
    await workspace.addMember(project.id, email.trim());
    setEmail("");
    setInviting(false);
    reload();
  };

  const handleRemove = async (memberId: string) => {
    await workspace.removeMember(memberId);
    reload();
  };

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split("@")[0].slice(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Zespół projektu
          </CardTitle>
          <CardDescription>Zarządzaj członkami projektu — zaproś osoby po adresie email</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Invite */}
          <div className="flex gap-2">
            <Input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email osoby do zaproszenia..."
              className="flex-1"
              onKeyDown={e => { if (e.key === 'Enter') handleInvite(); }}
            />
            <Button onClick={handleInvite} disabled={inviting || !email.trim()} className="gap-1.5 shrink-0">
              <UserPlus className="h-4 w-4" /> Zaproś
            </Button>
          </div>

          {/* Members list */}
          <div className="space-y-2">
            {loading ? (
              <div className="text-center py-4 text-muted-foreground">Ładowanie...</div>
            ) : members.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">Brak członków</div>
            ) : (
              members.map(member => {
                const roleCfg = ROLE_CONFIG[member.role] || ROLE_CONFIG.member;
                const RoleIcon = roleCfg.icon;
                return (
                  <div key={member.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(member.display_name || member.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {member.display_name || member.email || 'Nieznany'}
                      </p>
                      {member.email && member.display_name && (
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <RoleIcon className={`h-3 w-3 ${roleCfg.color}`} />
                        {roleCfg.label}
                      </Badge>
                      {member.status === 'invited' && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Mail className="h-3 w-3" /> Zaproszony
                        </Badge>
                      )}
                      {member.role !== 'owner' && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          onClick={() => handleRemove(member.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
