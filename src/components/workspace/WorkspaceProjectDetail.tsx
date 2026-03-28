import { WorkspaceProject } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { UniversalSubTabBar } from "@/components/UniversalSubTabBar";
import { ArrowLeft, ListTodo, LayoutGrid, Calendar, MessageSquare, Sparkles, Users, FileText, Zap, BarChart3, Settings } from "lucide-react";
import { WorkspaceTasksView } from "./WorkspaceTasksView";
import { WorkspaceKanbanView } from "./WorkspaceKanbanView";
import { WorkspaceCalendarView } from "./WorkspaceCalendarView";
import { WorkspaceChatView } from "./WorkspaceChatView";
import { WorkspaceAIPlannerView } from "./WorkspaceAIPlannerView";
import { WorkspaceMembersView } from "./WorkspaceMembersView";
import { WorkspaceDocsView } from "./WorkspaceDocsView";
import { WorkspaceAutomationsView } from "./WorkspaceAutomationsView";
import { WorkspaceWorkloadView } from "./WorkspaceWorkloadView";
import { WorkspaceSettingsView } from "./WorkspaceSettingsView";
import { WorkspaceNotificationCenter } from "./WorkspaceNotificationCenter";
import { WorkspaceGlobalSearch } from "./WorkspaceGlobalSearch";
import { WorkspaceMobileNav } from "./WorkspaceMobileNav";
import { WorkspaceOnboardingTour } from "./WorkspaceOnboardingTour";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  project: WorkspaceProject;
  workspace: any;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onBack: () => void;
}

const TABS = [
  { key: "tasks", label: "Lista", icon: ListTodo },
  { key: "kanban", label: "Tablica", icon: LayoutGrid },
  { key: "calendar", label: "Kalendarz", icon: Calendar },
  { key: "chat", label: "Komunikacja", icon: MessageSquare },
  { key: "docs", label: "Dokumenty", icon: FileText },
  { key: "automations", label: "Automatyzacje", icon: Zap },
  { key: "workload", label: "Obciążenie", icon: BarChart3 },
  { key: "ai", label: "AI Planner", icon: Sparkles },
  { key: "members", label: "Zespół", icon: Users },
  { key: "settings", label: "Ustawienia", icon: Settings },
];

export function WorkspaceProjectDetail({ project, workspace, activeTab, onTabChange, onBack }: Props) {
  const isMobile = useIsMobile();

  return (
    <div className="space-y-4 pb-16 md:pb-0">
      {/* Onboarding Tour */}
      <WorkspaceOnboardingTour onNavigate={onTabChange} />

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

      {/* Sub-tab bar (UniversalSubTabBar style) */}
      {!isMobile && (
        <UniversalSubTabBar
          activeTab={activeTab}
          onTabChange={onTabChange}
          tabs={TABS.map(t => ({ value: t.key, label: t.label }))}
        />
      )}

      {/* Content */}
      {activeTab === "tasks" && <WorkspaceTasksView project={project} workspace={workspace} />}
      {activeTab === "kanban" && <WorkspaceKanbanView project={project} workspace={workspace} />}
      {activeTab === "calendar" && <WorkspaceCalendarView project={project} workspace={workspace} />}
      {activeTab === "chat" && <WorkspaceChatView project={project} workspace={workspace} />}
      {activeTab === "docs" && <WorkspaceDocsView project={project} workspace={workspace} />}
      {activeTab === "automations" && <WorkspaceAutomationsView project={project} workspace={workspace} />}
      {activeTab === "workload" && <WorkspaceWorkloadView project={project} workspace={workspace} />}
      {activeTab === "ai" && <WorkspaceAIPlannerView project={project} workspace={workspace} />}
      {activeTab === "members" && <WorkspaceMembersView project={project} workspace={workspace} />}
      {activeTab === "settings" && <WorkspaceSettingsView project={project} workspace={workspace} />}

      {/* Mobile Bottom Nav */}
      {isMobile && <WorkspaceMobileNav activeTab={activeTab} onTabChange={onTabChange} />}
    </div>
  );
}
