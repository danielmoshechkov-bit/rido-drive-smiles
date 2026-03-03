import { useState, useEffect } from "react";
import { WorkspaceProject, WorkspaceMember } from "@/hooks/useWorkspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserPlus, Trash2, Mail, Crown, Shield, User, Users, Phone } from "lucide-react";
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

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
    if (!firstName.trim()) {
      toast.error("Podaj imię");
      return;
    }
    setInviting(true);
    const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
    await workspace.addMember(project.id, email.trim(), 'member', firstName.trim(), lastName.trim(), phone.trim() || null);
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setInviting(false);
    setDialogOpen(false);
    reload();
  };

  const handleRemove = async (memberId: string) => {
    await workspace.removeMember(memberId);
    reload();
  };

  const getInitials = (member: WorkspaceMember) => {
    if (member.first_name) {
      const f = member.first_name[0] || "";
      const l = member.last_name?.[0] || "";
      return (f + l).toUpperCase();
    }
    if (member.display_name) return member.display_name.split("@")[0].slice(0, 2).toUpperCase();
    return "?";
  };

  const getDisplayName = (member: WorkspaceMember) => {
    if (member.first_name || member.last_name) {
      return `${member.first_name || ''} ${member.last_name || ''}`.trim();
    }
    return member.display_name || member.email || 'Nieznany';
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Zespół projektu
              </CardTitle>
              <CardDescription>Zarządzaj członkami projektu — zaproś osoby do współpracy</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1.5">
                  <UserPlus className="h-4 w-4" /> Zaproś
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5" />
                    Zaproś osobę do projektu
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="inv-first">Imię *</Label>
                      <Input id="inv-first" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jan" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="inv-last">Nazwisko</Label>
                      <Input id="inv-last" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Kowalski" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-email">Email *</Label>
                    <Input id="inv-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jan@example.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-phone">Telefon</Label>
                    <Input id="inv-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+48 600 100 200" />
                  </div>
                  <Button onClick={handleInvite} disabled={inviting || !email.trim() || !firstName.trim()} className="w-full gap-1.5">
                    <UserPlus className="h-4 w-4" />
                    {inviting ? "Zapraszanie..." : "Wyślij zaproszenie"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="text-center py-4 text-muted-foreground">Ładowanie...</div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Brak członków</p>
              <p className="text-xs mt-1">Kliknij „Zaproś" aby dodać osoby do projektu</p>
            </div>
          ) : (
            members.map(member => {
              const roleCfg = ROLE_CONFIG[member.role] || ROLE_CONFIG.member;
              const RoleIcon = roleCfg.icon;
              return (
                <div key={member.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {getInitials(member)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{getDisplayName(member)}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {member.email && <span className="truncate">{member.email}</span>}
                      {member.phone && (
                        <span className="flex items-center gap-0.5">
                          <Phone className="h-3 w-3" /> {member.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <RoleIcon className={`h-3 w-3 ${roleCfg.color}`} />
                      {roleCfg.label}
                    </Badge>
                    {member.status === 'invited' && (
                      <Badge variant="outline" className="text-xs gap-1 border-amber-400 text-amber-600">
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
        </CardContent>
      </Card>
    </div>
  );
}
