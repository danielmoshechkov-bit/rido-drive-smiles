import { WorkspaceProject } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ListTodo, LayoutGrid, Calendar, MessageSquare, Sparkles, Users, FileText } from "lucide-react";
import { WorkspaceTasksView } from "./WorkspaceTasksView";
import { WorkspaceKanbanView } from "./WorkspaceKanbanView";
import { WorkspaceCalendarView } from "./WorkspaceCalendarView";
import { WorkspaceChatView } from "./WorkspaceChatView";
import { WorkspaceAIPlannerView } from "./WorkspaceAIPlannerView";
import { WorkspaceMembersView } from "./WorkspaceMembersView";
import { WorkspaceDocsView } from "./WorkspaceDocsView";
import { cn } from "@/lib/utils";

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
      </div>

      {/* Tab Bar - pill style matching platform standard */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0",
              activeTab === tab.key
                ? "bg-[hsl(var(--nav-bar-color))] text-white"
                : "text-muted-foreground hover:bg-[#F5C842] hover:text-gray-900"
            )}
            onClick={() => onTabChange(tab.key)}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "tasks" && <WorkspaceTasksView project={project} workspace={workspace} />}
      {activeTab === "kanban" && <WorkspaceKanbanView project={project} workspace={workspace} />}
      {activeTab === "calendar" && <WorkspaceCalendarView project={project} workspace={workspace} />}
      {activeTab === "chat" && <WorkspaceChatView project={project} workspace={workspace} />}
      {activeTab === "ai" && <WorkspaceAIPlannerView project={project} workspace={workspace} />}
      {activeTab === "members" && <WorkspaceMembersView project={project} workspace={workspace} />}
    </div>
  );
}
