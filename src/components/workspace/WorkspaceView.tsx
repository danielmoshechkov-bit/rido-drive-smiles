import { useState, useEffect } from "react";
import { useWorkspace, WorkspaceProject } from "@/hooks/useWorkspace";
import { WorkspaceProjectsList } from "./WorkspaceProjectsList";
import { WorkspaceProjectDetail } from "./WorkspaceProjectDetail";
import { Loader2 } from "lucide-react";

export function WorkspaceView() {
  const workspace = useWorkspace();
  const [selectedProject, setSelectedProject] = useState<WorkspaceProject | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<string>("tasks");

  if (workspace.loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (selectedProject) {
    return (
      <WorkspaceProjectDetail
        project={selectedProject}
        workspace={workspace}
        activeTab={activeSubTab}
        onTabChange={setActiveSubTab}
        onBack={() => setSelectedProject(null)}
      />
    );
  }

  return (
    <WorkspaceProjectsList
      projects={workspace.projects}
      onSelectProject={(p) => { setSelectedProject(p); setActiveSubTab("tasks"); }}
      onCreateProject={workspace.createProject}
      onDeleteProject={workspace.deleteProject}
      onRefresh={workspace.loadProjects}
    />
  );
}
