import { useState } from "react";
import { WorkspaceProject } from "@/hooks/useWorkspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, FolderOpen, Archive, Trash2, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { WorkspaceInvitations } from "./WorkspaceInvitations";

const PROJECT_COLORS = [
  "#6C4AE2", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"
];

interface Props {
  projects: WorkspaceProject[];
  onSelectProject: (p: WorkspaceProject) => void;
  onCreateProject: (name: string, description?: string, color?: string) => Promise<WorkspaceProject | null>;
  onDeleteProject: (id: string) => void;
  onRefresh?: () => void;
}

export function WorkspaceProjectsList({ projects, onSelectProject, onCreateProject, onDeleteProject, onRefresh }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const p = await onCreateProject(name.trim(), desc.trim() || undefined, color);
    if (p) {
      setShowCreate(false);
      setName("");
      setDesc("");
      setColor(PROJECT_COLORS[0]);
      onSelectProject(p);
    }
  };

  const active = projects.filter(p => p.status === 'active');
  const archived = projects.filter(p => p.status === 'archived');

  return (
    <div className="space-y-6">
      {/* Pending invitations */}
      <WorkspaceInvitations onAccepted={() => onRefresh?.()} />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Workspace</h2>
          <p className="text-sm text-muted-foreground">Zarządzaj projektami, zadaniami i zespołem</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nowy projekt
        </Button>
      </div>

      {active.length === 0 && archived.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="font-semibold text-lg mb-1">Brak projektów</h3>
            <p className="text-sm text-muted-foreground mb-4">Stwórz pierwszy projekt, aby rozpocząć pracę z zespołem</p>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Stwórz projekt
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {active.map(project => (
            <Card
              key={project.id}
              className="cursor-pointer hover:shadow-md transition-shadow group relative"
              onClick={() => onSelectProject(project)}
            >
              <div className="h-2 rounded-t-lg" style={{ backgroundColor: project.color }} />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{project.name}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                      <DropdownMenuItem className="text-destructive" onClick={() => onDeleteProject(project.id)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Usuń
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {project.description && (
                  <CardDescription className="line-clamp-2">{project.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">
                  Utworzono {new Date(project.created_at).toLocaleDateString('pl-PL')}
                </p>
              </CardContent>
            </Card>
          ))}

          {archived.map(project => (
            <Card key={project.id} className="opacity-60 cursor-pointer" onClick={() => onSelectProject(project)}>
              <div className="h-2 rounded-t-lg bg-muted" />
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Archive className="h-4 w-4" /> {project.name}
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowy projekt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nazwa projektu *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="np. Remont biura, Kampania marketingowa" />
            </div>
            <div className="space-y-2">
              <Label>Opis</Label>
              <Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Krótki opis projektu..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Kolor</Label>
              <div className="flex gap-2">
                {PROJECT_COLORS.map(c => (
                  <button
                    key={c}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Anuluj</Button>
            <Button onClick={handleCreate} disabled={!name.trim()}>Stwórz projekt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
