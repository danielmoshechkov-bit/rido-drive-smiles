import { useState, useEffect, useCallback } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  UserPlus, Trash2, Mail, Crown, Shield, User, Users, Phone, Circle, Search,
  Link2, Copy, Check, Eye, Globe, Clock
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ROLE_CONFIG: Record<string, { label: string; icon: any; color: string; desc: string }> = {
  owner: { label: "Właściciel/CEO", icon: Crown, color: "text-yellow-600", desc: "Pełny dostęp do wszystkiego" },
  manager: { label: "Manager", icon: Shield, color: "text-blue-600", desc: "Zarządza zespołem i zadaniami" },
  member: { label: "Pracownik", icon: User, color: "text-muted-foreground", desc: "Widzi swoje zadania i kanały" },
  guest: { label: "Gość/Klient", icon: Eye, color: "text-green-600", desc: "Ograniczony widok, bez wewn. komunikacji" },
};

const LANGUAGES = [
  { code: 'pl', label: '🇵🇱 Polski' }, { code: 'en', label: '🇬🇧 English' },
  { code: 'de', label: '🇩🇪 Deutsch' }, { code: 'fr', label: '🇫🇷 Français' },
  { code: 'es', label: '🇪🇸 Español' }, { code: 'ru', label: '🇷🇺 Русский' },
  { code: 'uk', label: '🇺🇦 Українська' }, { code: 'cs', label: '🇨🇿 Čeština' },
];

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

export function WorkspaceMembersView({ project, workspace }: Props) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteMethod, setInviteMethod] = useState<'email' | 'phone' | 'link'>('email');
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => { reload(); }, [project.id]);

  // Update own last_seen_at periodically
  useEffect(() => {
    if (!workspace.userId) return;
    const updatePresence = async () => {
      await (supabase as any)
        .from("workspace_project_members")
        .update({ last_seen_at: new Date().toISOString(), is_online: true })
        .eq("project_id", project.id)
        .eq("user_id", workspace.userId);
    };
    updatePresence();
    const interval = setInterval(updatePresence, 30000); // every 30s

    // Set offline on unmount
    return () => {
      clearInterval(interval);
      (supabase as any)
        .from("workspace_project_members")
        .update({ is_online: false })
        .eq("project_id", project.id)
        .eq("user_id", workspace.userId)
        .then(() => {});
    };
  }, [project.id, workspace.userId]);

  const reload = async () => {
    setLoading(true);
    const m = await workspace.loadMembers(project.id);
    setMembers(m);
    setLoading(false);
  };

  const handleInvite = async () => {
    if (inviteMethod === 'email' && (!email.trim() || !email.includes('@'))) {
      toast.error("Podaj prawidłowy email"); return;
    }
    if (inviteMethod === 'phone' && !phone.trim()) {
      toast.error("Podaj numer telefonu"); return;
    }
    if (inviteMethod !== 'link' && !firstName.trim()) {
      toast.error("Podaj imię"); return;
    }

    setInviting(true);
    const contactEmail = email.trim() || `${phone.trim()}@phone.getrido.pl`;
    
    await workspace.addMember(project.id, contactEmail, role, firstName.trim(), lastName.trim(), phone.trim() || null);

    // Update hierarchy_role & invited_by
    const { data: newMember } = await supabase
      .from("workspace_project_members")
      .select("id")
      .eq("project_id", project.id)
      .eq("email", contactEmail)
      .single();
    
    if (newMember) {
      await (supabase as any)
        .from("workspace_project_members")
        .update({ hierarchy_role: role, invited_by: workspace.userEmail })
        .eq("id", newMember.id);
    }

    // Save invitation record
    await (supabase as any).from("workspace_project_invitations").insert({
      project_id: project.id,
      invited_by: workspace.userId,
      email: contactEmail,
      phone: phone.trim() || null,
      role,
    });

    // Notification
    if (workspace.userId) {
      const { data: existingUser } = await supabase.rpc('admin_find_user_by_email', { p_email: contactEmail });
      if (existingUser && existingUser.length > 0) {
        await (supabase as any).from("workspace_notifications").insert({
          user_id: existingUser[0].id,
          project_id: project.id,
          type: 'invitation',
          title: 'Zaproszenie do projektu',
          body: `${workspace.userEmail} zaprasza Cię do projektu "${project.name}"`,
          link: '/uslugi/panel',
        });
      }
    }

    toast.success(`Zaproszono ${firstName.trim() || contactEmail}`);
    resetForm();
    setInviting(false);
    setDialogOpen(false);
    reload();
  };

  const generateInviteLink = async () => {
    const { data, error } = await (supabase as any)
      .from("workspace_project_invitations")
      .insert({
        project_id: project.id,
        invited_by: workspace.userId,
        role,
      })
      .select("token")
      .single();
    
    if (data) {
      const link = `${window.location.origin}/workspace/join/${data.token}`;
      setInviteLink(link);
    }
  };

  const copyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      toast.success("Link skopiowany!");
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const resetForm = () => {
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setRole("member"); setInviteLink(null); setLinkCopied(false);
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

  const handleLanguageChange = async (memberId: string, lang: string) => {
    await (supabase as any)
      .from("workspace_project_members")
      .update({ preferred_language: lang })
      .eq("id", memberId);
    toast.success("Język zmieniony");
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

  const getOnlineStatus = (member: any) => {
    if (member.is_online) return { text: "Online", color: "fill-green-500 text-green-500" };
    if (member.last_seen_at) {
      const diff = Date.now() - new Date(member.last_seen_at).getTime();
      if (diff < 5 * 60 * 1000) return { text: "Niedawno", color: "fill-yellow-500 text-yellow-500" };
    }
    return { text: "Offline", color: "fill-gray-400 text-gray-400" };
  };

  const formatLastSeen = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "przed chwilą";
    if (mins < 60) return `${mins} min temu`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h temu`;
    return new Date(dateStr).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const onlineCount = members.filter((m: any) => m.is_online).length;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Stats bar */}
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{members.length}</span> członków
          </span>
          <span className="flex items-center gap-1.5">
            <Circle className="h-3 w-3 fill-green-500 text-green-500" />
            <span className="font-medium">{onlineCount}</span> online
          </span>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-5 w-5" /> Zespół projektu
                </CardTitle>
                <CardDescription className="text-xs">Zapraszaj, zarządzaj rolami i monitoruj aktywność</CardDescription>
              </div>
              <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button className="gap-1.5" size="sm">
                    <UserPlus className="h-4 w-4" /> Zaproś
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <UserPlus className="h-5 w-5" /> Zaproś osobę
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <Tabs value={inviteMethod} onValueChange={v => { setInviteMethod(v as any); setInviteLink(null); }}>
                      <TabsList className="w-full">
                        <TabsTrigger value="email" className="flex-1 gap-1"><Mail className="h-3 w-3" /> Email</TabsTrigger>
                        <TabsTrigger value="phone" className="flex-1 gap-1"><Phone className="h-3 w-3" /> Telefon</TabsTrigger>
                        <TabsTrigger value="link" className="flex-1 gap-1"><Link2 className="h-3 w-3" /> Link</TabsTrigger>
                      </TabsList>
                    </Tabs>

                    {/* Role */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Rola</Label>
                      <Select value={role} onValueChange={setRole}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_CONFIG).filter(([k]) => k !== 'owner').map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              <div className="flex items-center gap-2">
                                <v.icon className={cn("h-3.5 w-3.5", v.color)} />
                                <span>{v.label}</span>
                                <span className="text-[10px] text-muted-foreground">{v.desc}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {inviteMethod === 'link' ? (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">Wygeneruj link zapraszający — każdy z linkiem może dołączyć jako <strong>{ROLE_CONFIG[role]?.label}</strong>.</p>
                        {!inviteLink ? (
                          <Button onClick={generateInviteLink} className="w-full gap-1.5">
                            <Link2 className="h-4 w-4" /> Wygeneruj link
                          </Button>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Input value={inviteLink} readOnly className="text-xs h-9" />
                              <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={copyLink}>
                                {linkCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                              </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground">Link ważny 7 dni</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Imię *</Label>
                            <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jan" className="h-9" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Nazwisko</Label>
                            <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Kowalski" className="h-9" />
                          </div>
                        </div>

                        {inviteMethod === 'email' && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">Email *</Label>
                            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jan@example.com" className="h-9" />
                          </div>
                        )}

                        {inviteMethod === 'phone' && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">Telefon *</Label>
                            <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+48 600 100 200" className="h-9" />
                          </div>
                        )}

                        <Button onClick={handleInvite} disabled={inviting || !firstName.trim()} className="w-full gap-1.5">
                          <UserPlus className="h-4 w-4" />
                          {inviting ? "Zapraszanie..." : "Wyślij zaproszenie"}
                        </Button>
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {loading ? (
              <div className="text-center py-4 text-muted-foreground">Ładowanie...</div>
            ) : members.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Brak członków. Zaproś osoby do współpracy.</p>
              </div>
            ) : (
              members.map(member => {
                const roleCfg = ROLE_CONFIG[member.role] || ROLE_CONFIG.member;
                const RoleIcon = roleCfg.icon;
                const online = getOnlineStatus(member);
                const lang = LANGUAGES.find(l => l.code === (member as any).preferred_language) || LANGUAGES[0];

                return (
                  <div key={member.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/30 transition-colors">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="relative">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {getInitials(member)}
                            </AvatarFallback>
                          </Avatar>
                          <Circle className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3", online.color)} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{online.text}</p>
                        {(member as any).last_seen_at && !(member as any).is_online && (
                          <p className="text-[10px] text-muted-foreground">{formatLastSeen((member as any).last_seen_at)}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{getDisplayName(member)}</p>
                        <span className="text-[10px]">{lang.label.split(' ')[0]}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {member.email && !member.email.includes('@phone.') && (
                          <span className="truncate">{member.email}</span>
                        )}
                        {member.phone && (
                          <span className="flex items-center gap-0.5">
                            <Phone className="h-3 w-3" /> {member.phone}
                          </span>
                        )}
                        {(member as any).last_seen_at && !(member as any).is_online && (
                          <span className="flex items-center gap-0.5 text-[10px]">
                            <Clock className="h-3 w-3" /> {formatLastSeen((member as any).last_seen_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Language selector */}
                      <Select value={(member as any).preferred_language || 'pl'} onValueChange={v => handleLanguageChange(member.id, v)}>
                        <SelectTrigger className="h-7 w-16 text-[10px] border-0 bg-transparent px-1">
                          <Globe className="h-3 w-3" />
                        </SelectTrigger>
                        <SelectContent>
                          {LANGUAGES.map(l => (
                            <SelectItem key={l.code} value={l.code} className="text-xs">{l.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Role */}
                      {member.role === 'owner' ? (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <RoleIcon className={cn("h-3 w-3", roleCfg.color)} /> {roleCfg.label}
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
                        <Badge variant="outline" className="text-[10px] gap-0.5 border-amber-400 text-amber-600">
                          <Mail className="h-3 w-3" /> Zaproszony
                        </Badge>
                      )}

                      {member.role !== 'owner' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemove(member.id)}>
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
    </TooltipProvider>
  );
}
