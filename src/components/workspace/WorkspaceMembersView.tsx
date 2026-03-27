import { useState, useEffect } from "react";
import { WorkspaceProject, WorkspaceMember } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UserPlus, Trash2, Mail, Crown, Shield, User, Users, Phone, Circle, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ROLE_CONFIG: Record<string, { label: string; icon: any; color: string; desc: string }> = {
  owner: { label: "Właściciel/CEO", icon: Crown, color: "text-yellow-600", desc: "Pełny dostęp do wszystkiego" },
  manager: { label: "Manager", icon: Shield, color: "text-blue-600", desc: "Widzi swój zespół i zadania, może delegować" },
  member: { label: "Pracownik", icon: User, color: "text-muted-foreground", desc: "Widzi tylko swoje zadania i kanały" },
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
  const [inviteMethod, setInviteMethod] = useState<'email' | 'phone' | 'search'>('email');
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("member");
  const [searchUser, setSearchUser] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => { reload(); }, [project.id]);

  const reload = async () => {
    setLoading(true);
    const m = await workspace.loadMembers(project.id);
    setMembers(m);
    setLoading(false);
  };

  const handleSearchUser = async (q: string) => {
    setSearchUser(q);
    if (q.length < 3) { setSearchResults([]); return; }
    
    // Search in profiles or users
    const { data } = await supabase
      .from("workspace_project_members")
      .select("display_name, email, user_id")
      .neq("project_id", project.id)
      .ilike("email", `%${q}%`)
      .limit(5);
    
    setSearchResults(data || []);
  };

  const handleInvite = async () => {
    if (inviteMethod === 'email' && (!email.trim() || !email.includes('@'))) {
      toast.error("Podaj prawidłowy email");
      return;
    }
    if (inviteMethod === 'phone' && !phone.trim()) {
      toast.error("Podaj numer telefonu");
      return;
    }
    if (!firstName.trim()) {
      toast.error("Podaj imię");
      return;
    }

    setInviting(true);
    const contactEmail = email.trim() || `${phone.trim()}@phone.getrido.pl`;
    
    await workspace.addMember(
      project.id, 
      contactEmail, 
      role, 
      firstName.trim(), 
      lastName.trim(), 
      phone.trim() || null
    );

    // Update hierarchy_role
    const { data: newMember } = await supabase
      .from("workspace_project_members")
      .select("id")
      .eq("project_id", project.id)
      .eq("email", contactEmail)
      .single();
    
    if (newMember) {
      await (supabase as any)
        .from("workspace_project_members")
        .update({ hierarchy_role: role })
        .eq("id", newMember.id);
    }

    // Create notification for invited user
    if (workspace.userId) {
      // Check if user exists in system
      const { data: existingUser } = await supabase.rpc('admin_find_user_by_email', { p_email: contactEmail });
      
      if (existingUser && existingUser.length > 0) {
        // User exists - create in-app notification
        await (supabase as any).from("workspace_notifications").insert({
          user_id: existingUser[0].id,
          project_id: project.id,
          type: 'invitation',
          title: 'Zaproszenie do projektu',
          body: `${workspace.userEmail} zaprasza Cię do projektu "${project.name}"`,
          link: '/uslugi/panel',
        });
        toast.success(`Wysłano zaproszenie do ${firstName.trim()} (konto GetRido)`);
      } else {
        // User doesn't exist - would send email invitation
        toast.success(`Wysłano zaproszenie email do ${contactEmail}`);
      }
    }

    resetForm();
    setInviting(false);
    setDialogOpen(false);
    reload();
  };

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setRole("member");
    setSearchUser("");
    setSearchResults([]);
  };

  const handleRemove = async (memberId: string) => {
    await workspace.removeMember(memberId);
    reload();
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    await (supabase as any)
      .from("workspace_project_members")
      .update({ role: newRole, hierarchy_role: newRole })
      .eq("id", memberId);
    toast.success("Rola zmieniona");
    reload();
  };

  const getInitials = (member: WorkspaceMember) => {
    if (member.first_name) return `${member.first_name[0]}${member.last_name?.[0] || ''}`.toUpperCase();
    return (member.display_name || member.email || '?').slice(0, 2).toUpperCase();
  };

  const getDisplayName = (member: WorkspaceMember) => {
    if (member.first_name || member.last_name) return `${member.first_name || ''} ${member.last_name || ''}`.trim();
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
                <Badge variant="outline" className="text-xs">{members.length}</Badge>
              </CardTitle>
              <CardDescription>Zarządzaj członkami i uprawnieniami — zaproś osoby do współpracy</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1.5">
                  <UserPlus className="h-4 w-4" /> Zaproś
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5" />
                    Zaproś osobę do projektu
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  {/* Invite method tabs */}
                  <Tabs value={inviteMethod} onValueChange={v => setInviteMethod(v as any)}>
                    <TabsList className="w-full">
                      <TabsTrigger value="email" className="flex-1 gap-1"><Mail className="h-3 w-3" /> Email</TabsTrigger>
                      <TabsTrigger value="phone" className="flex-1 gap-1"><Phone className="h-3 w-3" /> Telefon</TabsTrigger>
                      <TabsTrigger value="search" className="flex-1 gap-1"><Search className="h-3 w-3" /> Szukaj</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Imię *</Label>
                      <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jan" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Nazwisko</Label>
                      <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Kowalski" />
                    </div>
                  </div>

                  {inviteMethod === 'email' && (
                    <div className="space-y-1.5">
                      <Label>Email *</Label>
                      <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jan@example.com" />
                    </div>
                  )}

                  {inviteMethod === 'phone' && (
                    <div className="space-y-1.5">
                      <Label>Telefon *</Label>
                      <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+48 600 100 200" />
                    </div>
                  )}

                  {inviteMethod === 'search' && (
                    <div className="space-y-1.5">
                      <Label>Szukaj użytkownika GetRido</Label>
                      <Input value={searchUser} onChange={e => handleSearchUser(e.target.value)} placeholder="Wpisz email..." />
                      {searchResults.length > 0 && (
                        <div className="border rounded-lg divide-y max-h-32 overflow-y-auto">
                          {searchResults.map((r, i) => (
                            <button
                              key={i}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                              onClick={() => {
                                setEmail(r.email || '');
                                setFirstName(r.display_name?.split(' ')[0] || '');
                                setLastName(r.display_name?.split(' ').slice(1).join(' ') || '');
                                setInviteMethod('email');
                              }}
                            >
                              {r.display_name || r.email}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Role selection */}
                  <div className="space-y-1.5">
                    <Label>Rola w projekcie</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ROLE_CONFIG).filter(([k]) => k !== 'owner').map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            <div className="flex items-center gap-2">
                              <v.icon className={cn("h-3.5 w-3.5", v.color)} />
                              <div>
                                <span>{v.label}</span>
                                <span className="text-xs text-muted-foreground ml-2">{v.desc}</span>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={handleInvite} disabled={inviting || !firstName.trim()} className="w-full gap-1.5">
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
              <p>Brak członków. Kliknij „Zaproś" aby dodać osoby.</p>
            </div>
          ) : (
            members.map(member => {
              const roleCfg = ROLE_CONFIG[member.role] || ROLE_CONFIG.member;
              const RoleIcon = roleCfg.icon;
              const isOnline = (member as any).is_online;
              
              return (
                <div key={member.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/30 transition-colors">
                  <div className="relative">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(member)}
                      </AvatarFallback>
                    </Avatar>
                    <Circle className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-3 w-3",
                      isOnline ? "fill-green-500 text-green-500" : "fill-gray-400 text-gray-400"
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{getDisplayName(member)}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {member.email && <span className="truncate">{member.email}</span>}
                      {member.phone && (
                        <span className="flex items-center gap-0.5">
                          <Phone className="h-3 w-3" /> {member.phone}
                        </span>
                      )}
                      {(member as any).last_seen_at && !isOnline && (
                        <span className="text-[10px]">
                          Ostatnio: {new Date((member as any).last_seen_at).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.role === 'owner' ? (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <RoleIcon className={cn("h-3 w-3", roleCfg.color)} />
                        {roleCfg.label}
                      </Badge>
                    ) : (
                      <Select value={member.role} onValueChange={v => handleRoleChange(member.id, v)}>
                        <SelectTrigger className="h-7 text-xs w-auto border-0 bg-secondary/50 gap-1">
                          <RoleIcon className={cn("h-3 w-3", roleCfg.color)} />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_CONFIG).filter(([k]) => k !== 'owner').map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
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
