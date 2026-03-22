import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, FolderOpen, Users, Trash2, UserPlus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  status: string;
  created_at: string | null;
  member_count?: number;
}

interface AIProjectsSectionProps {
  userId: string | null;
  onSelectProject: (projectId: string, projectName: string) => void;
  activeProjectId: string | null;
}

export function AIProjectsSection({ userId, onSelectProject, activeProjectId }: AIProjectsSectionProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    if (!userId) return;
    const { data } = await (supabase as any)
      .from('workspace_projects')
      .select('id, name, description, color, status, created_at')
      .order('updated_at', { ascending: false });
    if (data) setProjects(data);
  }, [userId]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const createProject = async () => {
    if (!newName.trim() || !userId) return;
    setCreating(true);
    try {
      const { data, error } = await (supabase as any)
        .from('workspace_projects')
        .insert({ name: newName.trim(), description: newDesc.trim() || null, owner_user_id: userId, status: 'active' })
        .select()
        .single();
      if (error) throw error;
      // Add self as member
      await (supabase as any).from('workspace_project_members').insert({
        project_id: data.id, user_id: userId, role: 'owner', status: 'active'
      });
      toast.success('Projekt utworzony!');
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
      loadProjects();
      onSelectProject(data.id, data.name);
    } catch (err: any) {
      toast.error('Błąd tworzenia projektu');
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Czy na pewno chcesz usunąć ten projekt? Tej operacji nie można cofnąć.')) return;
    await (supabase as any).from('workspace_projects').delete().eq('id', projectId);
    loadProjects();
    toast.success('Projekt usunięty');
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim() || !showInvite || !userId) return;
    setInviting(true);
    try {
      // Check if user exists
      const { data: existingUser } = await (supabase as any)
        .rpc('admin_find_user_by_email', { p_email: inviteEmail.trim().toLowerCase() });
      const isRegistered = existingUser && existingUser.length > 0;
      const existingUserId = isRegistered ? existingUser[0].id : null;

      // Add as project member
      await (supabase as any).from('workspace_project_members').insert({
        project_id: showInvite,
        user_id: existingUserId,
        email: inviteEmail.trim().toLowerCase(),
        first_name: inviteFirstName.trim() || null,
        last_name: inviteLastName.trim() || null,
        phone: invitePhone.trim() || null,
        role: 'member',
        status: 'invited'
      });

      // Get project name and inviter name
      const project = projects.find(p => p.id === showInvite);
      const { data: { user } } = await supabase.auth.getUser();
      const inviterName = user?.user_metadata?.first_name 
        ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
        : user?.email || 'Użytkownik';

      // Send invitation email
      await supabase.functions.invoke('send-project-invitation', {
        body: {
          email: inviteEmail.trim().toLowerCase(),
          inviterName,
          projectName: project?.name || 'Projekt',
          isRegistered
        }
      });

      toast.success(`Zaproszenie wysłane do ${inviteEmail}`);
      setInviteEmail('');
      setInviteFirstName('');
      setInviteLastName('');
      setInvitePhone('');
      setShowInvite(null);
    } catch (err: any) {
      console.error('Invite error:', err);
      toast.error('Błąd wysyłania zaproszenia');
    } finally {
      setInviting(false);
    }
  };

  const COLORS = ['#6C3CF0', '#F59E0B', '#22C55E', '#EF4444', '#3B82F6', '#EC4899'];

  return (
    <div className="flex flex-col overflow-hidden" style={{ maxWidth: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">Projekty</p>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="p-1 rounded-md hover:bg-muted transition-colors"
          title="Nowy projekt"
        >
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="px-3 pb-2 space-y-2">
          <input
            type="text"
            placeholder="Nazwa projektu"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createProject()}
            className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-background border border-border/50 outline-none focus:border-primary/50 text-foreground"
            autoFocus
          />
          <input
            type="text"
            placeholder="Opis (opcjonalnie)"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-background border border-border/50 outline-none focus:border-primary/50 text-foreground"
          />
          <div className="flex gap-1.5">
            <Button size="sm" onClick={createProject} disabled={!newName.trim() || creating} className="flex-1 h-7 text-xs rounded-lg gap-1">
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Utwórz
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)} className="h-7 text-xs rounded-lg">
              Anuluj
            </Button>
          </div>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="px-3 pb-2 space-y-2 bg-primary/5 rounded-lg mx-2 p-3">
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5 text-primary" />
            Zaproś do projektu
          </p>
          <input
            type="text"
            placeholder="Imię *"
            value={inviteFirstName}
            onChange={e => setInviteFirstName(e.target.value)}
            className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-background border border-border/50 outline-none focus:border-primary/50 text-foreground"
            autoFocus
          />
          <input
            type="text"
            placeholder="Nazwisko *"
            value={inviteLastName}
            onChange={e => setInviteLastName(e.target.value)}
            className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-background border border-border/50 outline-none focus:border-primary/50 text-foreground"
          />
          <input
            type="email"
            placeholder="Email *"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-background border border-border/50 outline-none focus:border-primary/50 text-foreground"
          />
          <input
            type="tel"
            placeholder="Telefon (opcjonalnie)"
            value={invitePhone}
            onChange={e => setInvitePhone(e.target.value)}
            className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-background border border-border/50 outline-none focus:border-primary/50 text-foreground"
          />
          <div className="flex gap-1.5">
            <Button size="sm" onClick={inviteMember} disabled={!inviteEmail.trim() || !inviteFirstName.trim() || !inviteLastName.trim() || inviting} className="flex-1 h-7 text-xs rounded-lg gap-1">
              {inviting ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
              Wyślij zaproszenie
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowInvite(null)} className="h-7 text-xs rounded-lg">
              Anuluj
            </Button>
          </div>
        </div>
      )}

      {/* Project list */}
      <div className="px-2 space-y-0.5 overflow-hidden max-h-[120px] overflow-y-auto">
        {projects.length === 0 && !showCreate && (
          <div className="text-center py-4 px-4">
            <FolderOpen className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground/50 font-medium">Brak projektów</p>
          </div>
        )}
        {projects.map(project => {
          const isActive = activeProjectId === project.id;
          const isHovered = hovered === project.id;
          const color = project.color || COLORS[projects.indexOf(project) % COLORS.length];
          return (
            <div
              key={project.id}
              onClick={() => onSelectProject(project.id, project.name)}
              onMouseEnter={() => setHovered(project.id)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all overflow-hidden',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs font-medium min-w-0 block" style={{ flex: '1 1 0%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.name}
              </span>
              {(isHovered || isActive) && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowInvite(project.id); }}
                    className="p-1 rounded-md hover:bg-primary/20 transition-colors"
                    title="Zaproś członka"
                  >
                    <UserPlus className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => deleteProject(project.id, e)}
                    className="p-1 rounded-md hover:bg-destructive/20 transition-colors"
                    title="Usuń projekt"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
