import { useState, useEffect } from "react";
import { WorkspaceProject, WorkspaceTask, WorkspaceMember } from "@/hooks/useWorkspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, CheckCircle2, Clock, AlertTriangle, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

interface MemberWorkload {
  member: WorkspaceMember;
  tasks: WorkspaceTask[];
  todo: number;
  inProgress: number;
  done: number;
  blocked: number;
  totalTime: number;
  overdue: number;
}

export function WorkspaceWorkloadView({ project, workspace }: Props) {
  const [workloads, setWorkloads] = useState<MemberWorkload[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkload();
  }, [project.id]);

  const loadWorkload = async () => {
    setLoading(true);
    const [tasks, members] = await Promise.all([
      workspace.loadTasks(project.id),
      workspace.loadMembers(project.id),
    ]);

    const now = new Date();
    const memberWorkloads: MemberWorkload[] = members.map((m: WorkspaceMember) => {
      const name = getMemberName(m);
      const memberTasks = tasks.filter((t: WorkspaceTask) => t.assigned_name === name);
      return {
        member: m,
        tasks: memberTasks,
        todo: memberTasks.filter((t: WorkspaceTask) => t.status === 'todo').length,
        inProgress: memberTasks.filter((t: WorkspaceTask) => t.status === 'in_progress' || t.status === 'review').length,
        done: memberTasks.filter((t: WorkspaceTask) => t.status === 'done').length,
        blocked: memberTasks.filter((t: WorkspaceTask) => t.status === 'blocked').length,
        totalTime: memberTasks.reduce((s: number, t: any) => s + (t.time_logged_minutes || 0), 0),
        overdue: memberTasks.filter((t: WorkspaceTask) => t.due_date && new Date(t.due_date) < now && t.status !== 'done').length,
      };
    });

    // Add unassigned
    const unassigned = tasks.filter((t: WorkspaceTask) => !t.assigned_name);
    if (unassigned.length > 0) {
      memberWorkloads.push({
        member: { id: 'unassigned', display_name: 'Nieprzypisane', email: null, first_name: null, last_name: null, phone: null, role: '', status: '', project_id: project.id, user_id: null, created_at: '' },
        tasks: unassigned,
        todo: unassigned.filter((t: WorkspaceTask) => t.status === 'todo').length,
        inProgress: unassigned.filter((t: WorkspaceTask) => t.status === 'in_progress' || t.status === 'review').length,
        done: unassigned.filter((t: WorkspaceTask) => t.status === 'done').length,
        blocked: unassigned.filter((t: WorkspaceTask) => t.status === 'blocked').length,
        totalTime: 0,
        overdue: unassigned.filter((t: WorkspaceTask) => t.due_date && new Date(t.due_date) < now && t.status !== 'done').length,
      });
    }

    setWorkloads(memberWorkloads.sort((a, b) => b.inProgress - a.inProgress));
    setLoading(false);
  };

  const getMemberName = (m: WorkspaceMember) => {
    if (m.first_name) return `${m.first_name} ${m.last_name || ''}`.trim();
    return m.display_name || m.email || 'Użytkownik';
  };

  const getInitials = (name: string) => name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  const getLoadLevel = (w: MemberWorkload) => {
    const active = w.inProgress + w.todo;
    if (active === 0) return { label: "Wolny", color: "text-green-500", bg: "bg-green-100 dark:bg-green-900/30" };
    if (active <= 3) return { label: "Normalny", color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/30" };
    if (active <= 6) return { label: "Wysoki", color: "text-yellow-500", bg: "bg-yellow-100 dark:bg-yellow-900/30" };
    return { label: "Przeciążony", color: "text-red-500", bg: "bg-red-100 dark:bg-red-900/30" };
  };

  const formatMinutes = (min: number) => {
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const rem = min % 60;
    return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Ładowanie...</div>;
  }

  const totalTasks = workloads.reduce((s, w) => s + w.tasks.length, 0);
  const totalDone = workloads.reduce((s, w) => s + w.done, 0);
  const totalOverdue = workloads.reduce((s, w) => s + w.overdue, 0);
  const completionRate = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Łącznie zadań</p>
              <p className="text-lg font-bold">{totalTasks}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Ukończono</p>
              <p className="text-lg font-bold">{completionRate}%</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Czas pracy</p>
              <p className="text-lg font-bold">{formatMinutes(workloads.reduce((s, w) => s + w.totalTime, 0))}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <div>
              <p className="text-xs text-muted-foreground">Zaległe</p>
              <p className="text-lg font-bold text-red-500">{totalOverdue}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Member workload cards */}
      <div className="space-y-3">
        {workloads.map(w => {
          const name = getMemberName(w.member);
          const load = getLoadLevel(w);
          const total = w.tasks.length;
          const donePercent = total > 0 ? Math.round((w.done / total) * 100) : 0;

          return (
            <Card key={w.member.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {w.member.id === 'unassigned' ? '?' : getInitials(name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">{w.member.role || 'member'}</p>
                  </div>
                  <Badge className={cn("text-[10px]", load.bg, load.color)}>{load.label}</Badge>
                </div>

                <Progress value={donePercent} className="h-1.5 mb-3" />

                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">📋 {w.todo}</span>
                  <span className="text-blue-500">⏳ {w.inProgress}</span>
                  <span className="text-green-500">✅ {w.done}</span>
                  {w.blocked > 0 && <span className="text-red-500">🚫 {w.blocked}</span>}
                  {w.overdue > 0 && <span className="text-red-500 font-medium">⚠️ {w.overdue} zaległe</span>}
                  {w.totalTime > 0 && <span className="text-muted-foreground ml-auto">⏱ {formatMinutes(w.totalTime)}</span>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
