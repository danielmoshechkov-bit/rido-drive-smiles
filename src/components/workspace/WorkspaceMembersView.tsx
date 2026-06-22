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
  Link2, Copy, Check, Eye, Globe, Clock, RefreshCw, Pencil
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
  // Edycja zaproszonego/członka
  const [editMember, setEditMember] = useState<WorkspaceMember | null>(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("member");

  const openEdit = (m: WorkspaceMember) => {
    setEditMember(m);
    setEditFirst(m.first_name || "");
    setEditLast(m.last_name || "");
    setEditPhone((m as any).phone || "");
    setEditRole(m.role || "member");
  };

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
    try {
      const contactEmail = (email.trim().toLowerCase()) || `${phone.trim()}@phone.getrido.pl`;
      const hasRealEmail = !!email.trim();

      // Czy zapraszany ma już konto? → od razu linkujemy member→user_id
      let existingUserId: string | null = null;
      if (hasRealEmail) {
        const { data: existingUser } = await supabase.rpc('admin_find_user_by_email', { p_email: contactEmail });
        existingUserId = existingUser && existingUser.length > 0 ? existingUser[0].id : null;
      }
      const isRegistered = !!existingUserId;

      // 1) member-row (status='invited') — JEDYNA żywa ścieżka (koniec workspace_project_invitations).
      //    Wszystkie pola (w tym hierarchy_role + invited_by) ustawiane w insercie; BEZ .select()
      //    (zwrot reprezentacji uruchamia politykę odwołującą się do auth.users).
      const ok = await workspace.addMember(
        project.id, contactEmail, role, firstName.trim(), lastName.trim(), phone.trim() || null,
        existingUserId, workspace.userEmail || null
      );
      if (!ok) { setInviting(false); return; } // addMember pokazał błąd

      // 2) Notyfikacja in-app dla zarejestrowanego zapraszanego (poprawne kolumny link_type/link_id)
      if (existingUserId) {
        const { error: notifErr } = await (supabase as any).from("workspace_notifications").insert({
          user_id: existingUserId,
          project_id: project.id,
          type: 'invitation',
          title: 'Zaproszenie do projektu',
          body: `${workspace.userEmail || 'Ktoś'} zaprasza Cię do projektu „${project.name}"`,
          link_type: 'invitation',
          link_id: project.id,
          sender_user_id: workspace.userId || null,
          sender_name: workspace.userEmail || null,
        });
        if (notifErr) console.error("notification insert:", notifErr);
      }

      // 3) Mail przez DZIAŁAJĄCĄ firmową wysyłkę (Resend, noreply@getrido.pl)
      let mailOk = true;
      if (hasRealEmail) {
        const { error: mailErr } = await supabase.functions.invoke('send-project-invitation', {
          body: {
            email: contactEmail,
            inviterName: workspace.userEmail || 'Użytkownik',
            projectName: project.name,
            isRegistered,
          },
        });
        if (mailErr) { mailOk = false; console.error("send-project-invitation:", mailErr); }
      }

      if (hasRealEmail && !mailOk) {
        toast.warning(`Zaproszono ${firstName.trim() || contactEmail}, ale MAIL NIE WYSZEDŁ — użyj „Wyślij ponownie".`);
      } else {
        toast.success(`Zaproszono ${firstName.trim() || contactEmail}${hasRealEmail ? ' — mail wysłany' : ''}`);
      }
      resetForm();
      setDialogOpen(false);
      reload();
    } catch (e: any) {
      console.error("handleInvite:", e);
      toast.error("Błąd zapraszania: " + (e?.message || e));
    } finally {
      setInviting(false);
    }
  };

  // Ponowna wysyłka maila zaproszenia dla istniejącego (invited) członka
  const handleResend = async (member: WorkspaceMember) => {
    if (!member.email || member.email.includes('@phone.')) {
      toast.error("Brak adresu email do ponownej wysyłki"); return;
    }
    const { data: existingUser } = await supabase.rpc('admin_find_user_by_email', { p_email: member.email });
    const isRegistered = !!(existingUser && existingUser.length > 0);
    const { error } = await supabase.functions.invoke('send-project-invitation', {
      body: { email: member.email, inviterName: workspace.userEmail || 'Użytkownik', projectName: project.name, isRegistered },
    });
    if (error) { console.error("resend:", error); toast.error("Błąd wysyłki: " + error.message); }
    else toast.success(`Zaproszenie wysłane ponownie do ${member.email}`);
  };

  // Zapis edycji danych zaproszonego/członka
  const handleSaveEdit = async () => {
    if (!editMember) return;
    const display = editFirst.trim() ? `${editFirst.trim()} ${editLast.trim()}`.trim() : (editMember.email || '');
    const { error } = await (supabase as any)
      .from("workspace_project_members")
      .update({
        first_name: editFirst.trim() || null,
        last_name: editLast.trim() || null,
        phone: editPhone.trim() || null,
        role: editRole,
        hierarchy_role: editRole,
        display_name: display,
      })
      .eq("id", editMember.id);
    if (error) { console.error("edit member:", error); toast.error("Błąd zapisu: " + error.message); return; }
    toast.success("Zaktualizowano dane");
    setEditMember(null);
    reload();
  };

  const generateInviteLink = async () => {
    // Token generowany po stronie klienta → insert BEZ .select() (zwrot reprezentacji
    // uruchamia politykę SELECT workspace_project_invitations, która odwołuje się do
    // auth.users → "permission denied for table users"). Insert sam nie dotyka users.
    const token = (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { error } = await (supabase as any)
      .from("workspace_project_invitations")
      .insert({
        project_id: project.id,
        invited_by: workspace.userId,
        role,
        token,
      });
    if (error) { console.error("generateInviteLink:", error); toast.error("Błąd generowania linku: " + error.message); return; }
    setInviteLink(`${window.location.origin}/workspace/join/${token}`);
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

                      {member.status === 'invited' && member.email && !member.email.includes('@phone.') && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => handleResend(member)}>
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Wyślij zaproszenie ponownie</TooltipContent>
                        </Tooltip>
                      )}

                      {member.role !== 'owner' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => openEdit(member)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edytuj dane</TooltipContent>
                        </Tooltip>
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

        {/* Edycja danych zaproszonego/członka */}
        <Dialog open={!!editMember} onOpenChange={(o) => { if (!o) setEditMember(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5" /> Edytuj dane</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Imię</Label>
                  <Input value={editFirst} onChange={e => setEditFirst(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nazwisko</Label>
                  <Input value={editLast} onChange={e => setEditLast(e.target.value)} className="h-9" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Telefon</Label>
                <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Rola</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_CONFIG).filter(([k]) => k !== 'owner').map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditMember(null)}>Anuluj</Button>
                <Button onClick={handleSaveEdit}>Zapisz</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
