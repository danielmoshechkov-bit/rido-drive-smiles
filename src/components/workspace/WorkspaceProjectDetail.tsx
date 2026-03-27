import { WorkspaceProject } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ListTodo, LayoutGrid, Calendar, MessageSquare, Sparkles, Users, FileText, Zap, BarChart3 } from "lucide-react";
import { WorkspaceTasksView } from "./WorkspaceTasksView";
import { WorkspaceKanbanView } from "./WorkspaceKanbanView";
import { WorkspaceCalendarView } from "./WorkspaceCalendarView";
import { WorkspaceChatView } from "./WorkspaceChatView";
import { WorkspaceAIPlannerView } from "./WorkspaceAIPlannerView";
import { WorkspaceMembersView } from "./WorkspaceMembersView";
import { WorkspaceDocsView } from "./WorkspaceDocsView";
import { WorkspaceAutomationsView } from "./WorkspaceAutomationsView";
import { WorkspaceWorkloadView } from "./WorkspaceWorkloadView";
import { WorkspaceNotificationCenter } from "./WorkspaceNotificationCenter";
import { WorkspaceGlobalSearch } from "./WorkspaceGlobalSearch";
import { cn } from "@/lib/utils";
import { TabsPill } from "@/components/ui/TabsPill";
import { TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Props {
  project: WorkspaceProject;
  workspace: any;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onBack: () => void;
}

const TABS = [
  { key: "tasks", label: "Lista", icon: ListTodo },
  { key: "kanban", label: "Kanban", icon: LayoutGrid },
  { key: "calendar", label: "Kalendarz", icon: Calendar },
  { key: "chat", label: "Komunikacja", icon: MessageSquare },
  { key: "docs", label: "Dokumenty", icon: FileText },
  { key: "automations", label: "Automatyzacje", icon: Zap },
  { key: "workload", label: "Obciążenie", icon: BarChart3 },
  { key: "ai", label: "AI Planner", icon: Sparkles },
  { key: "members", label: "Zespół", icon: Users },
];

export function WorkspaceProjectDetail({ project, workspace, activeTab, onTabChange, onBack }: Props) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
            <h2 className="text-lg font-bold truncate">{project.name}</h2>
          </div>
          {project.description && (
            <p className="text-xs text-muted-foreground truncate">{project.description}</p>
          )}
        </div>
        <WorkspaceGlobalSearch
          projectId={project.id}
          onNavigate={(type, id) => {
            if (type === 'task') onTabChange('tasks');
            else if (type === 'message' || type === 'channel') onTabChange('chat');
            else if (type === 'document') onTabChange('docs');
            else if (type === 'member') onTabChange('members');
          }}
        />
        <WorkspaceNotificationCenter
          onNavigate={(type, id) => {
            if (type === 'task') onTabChange('tasks');
            else if (type === 'chat') onTabChange('chat');
            else if (type === 'document') onTabChange('docs');
          }}
        />
      </div>

      {/* Tab Bar - TabsPill platform standard */}
      <TabsPill value={activeTab} onValueChange={onTabChange}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <TabsTrigger key={tab.key} value={tab.key}>
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </TabsTrigger>
          );
        })}

        {/* Content */}
        <TabsContent value="tasks"><WorkspaceTasksView project={project} workspace={workspace} /></TabsContent>
        <TabsContent value="kanban"><WorkspaceKanbanView project={project} workspace={workspace} /></TabsContent>
        <TabsContent value="calendar"><WorkspaceCalendarView project={project} workspace={workspace} /></TabsContent>
        <TabsContent value="chat"><WorkspaceChatView project={project} workspace={workspace} /></TabsContent>
        <TabsContent value="docs"><WorkspaceDocsView project={project} workspace={workspace} /></TabsContent>
        <TabsContent value="automations"><WorkspaceAutomationsView project={project} workspace={workspace} /></TabsContent>
        <TabsContent value="workload"><WorkspaceWorkloadView project={project} workspace={workspace} /></TabsContent>
        <TabsContent value="ai"><WorkspaceAIPlannerView project={project} workspace={workspace} /></TabsContent>
        <TabsContent value="members"><WorkspaceMembersView project={project} workspace={workspace} /></TabsContent>
      </TabsPill>
    </div>
  );
}
