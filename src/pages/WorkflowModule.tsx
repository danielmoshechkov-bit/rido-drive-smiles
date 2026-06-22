import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace, WorkspaceProject, GLOBAL_WORKFLOW_PROJECT } from "@/hooks/useWorkspace";
import { WorkspaceProjectsList } from "@/components/workspace/WorkspaceProjectsList";
import { WorkspaceProjectDetail } from "@/components/workspace/WorkspaceProjectDetail";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Briefcase, Globe, FolderKanban, MailQuestion } from "lucide-react";

/**
 * MODUŁ WORKFLOW — samodzielny (jak Flota/Warsztat), BEZ konta usługodawcy.
 * Naprawia wylogowanie po akceptacji: pracownik wchodzi tutaj, nie do panelu
 * usługodawcy. Reuse istniejących komponentów Workspace (zero duplikatów).
 *
 * Dwa poziomy:
 *  - GLOBALNY: ukryty „projekt globalny" (przestrzeń ponad projektami).
 *  - PROJEKTOWY: lista projektów + szczegóły (jak dziś).
 *
 * Gate: zalogowany + (≥1 projekt członkowski LUB oczekujące zaproszenie).
 * Brak → „Brak modułu Workflow" + „Poproś o dostęp" (NIE wylogowanie).
 */
export default function WorkflowModule() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const [view, setView] = useState<"list" | "global">("list");
  const [selected, setSelected] = useState<WorkspaceProject | null>(null);
  const [activeTab, setActiveTab] = useState("tasks");
  const [globalProject, setGlobalProject] = useState<WorkspaceProject | null>(null);
  const [pendingInvites, setPendingInvites] = useState(0);
  const [authChecked, setAuthChecked] = useState(false);

  // Auth guard
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth?redirect=/workflow"); return; }
      // policz oczekujące zaproszenia (po e-mailu)
      const email = session.user.email?.toLowerCase();
      if (email) {
        const { data } = await supabase
          .from("workspace_project_members")
          .select("id").eq("email", email).eq("status", "invited");
        setPendingInvites(data?.length || 0);
      }
      setAuthChecked(true);
    })();
  }, [navigate]);

  const realProjects = workspace.projects.filter(p => p.name !== GLOBAL_WORKFLOW_PROJECT);
  const hasAccess = realProjects.length > 0 || pendingInvites > 0;

  const openGlobal = async () => {
    let gp = workspace.projects.find(p => p.name === GLOBAL_WORKFLOW_PROJECT) || null;
    if (!gp) gp = await workspace.createProject(GLOBAL_WORKFLOW_PROJECT, "Globalna przestrzeń Workflow", "#6C4AE2");
    if (gp) { setGlobalProject(gp); setView("global"); setSelected(null); setActiveTab("tasks"); }
  };

  // --- Ładowanie / brak dostępu ---
  if (!authChecked || workspace.loading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <header className="bg-white/95 border-b px-4 py-3 flex items-center gap-3">
          <UniversalHomeButton />
          <span className="font-semibold flex items-center gap-2"><Briefcase className="h-5 w-5" /> Workflow</span>
        </header>
        <div className="max-w-md mx-auto mt-20 px-4">
          <Card>
            <CardContent className="p-8 text-center space-y-4">
              <MailQuestion className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <h2 className="text-lg font-semibold">Brak modułu Workflow</h2>
              <p className="text-sm text-muted-foreground">
                Nie masz jeszcze dostępu do żadnego projektu. Poproś administratora firmy o przydzielenie modułu Workflow,
                albo poczekaj na zaproszenie do projektu.
              </p>
              <Button variant="outline" onClick={() => navigate("/")}>Wróć na stronę główną</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // --- Widok z dostępem ---
  const headerBar = (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <UniversalHomeButton />
        <span className="font-semibold flex items-center gap-2 shrink-0"><Briefcase className="h-5 w-5" /> Workflow</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant={view === "global" && !selected ? "default" : "outline"} size="sm" className="gap-1.5" onClick={openGlobal}>
          <Globe className="h-4 w-4" /> Globalny
        </Button>
        <Button variant={view === "list" && !selected ? "default" : "outline"} size="sm" className="gap-1.5" onClick={() => { setView("list"); setSelected(null); }}>
          <FolderKanban className="h-4 w-4" /> Projekty
        </Button>
      </div>
    </header>
  );

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {headerBar}
      <main className="container mx-auto px-4 py-6">
        {selected ? (
          <WorkspaceProjectDetail
            project={selected}
            workspace={workspace}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onBack={() => setSelected(null)}
          />
        ) : view === "global" && globalProject ? (
          <WorkspaceProjectDetail
            // Nazwa-sentinel ukryta przed userem — pokazujemy przyjazny tytuł.
            project={{ ...globalProject, name: "Workflow (globalny)" }}
            workspace={workspace}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onBack={() => setView("list")}
          />
        ) : (
          <WorkspaceProjectsList
            projects={workspace.projects}
            onSelectProject={(p) => { setSelected(p); setActiveTab("tasks"); }}
            onCreateProject={workspace.createProject}
            onDeleteProject={workspace.deleteProject}
            onRefresh={workspace.loadProjects}
          />
        )}
      </main>
    </div>
  );
}
