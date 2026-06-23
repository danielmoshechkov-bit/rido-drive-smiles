import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace, WorkspaceProject, GLOBAL_WORKFLOW_PROJECT } from "@/hooks/useWorkspace";
import { WorkspaceProjectsList } from "@/components/workspace/WorkspaceProjectsList";
import { WorkspaceProjectDetail } from "@/components/workspace/WorkspaceProjectDetail";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TabsPill } from "@/components/ui/TabsPill";
import { TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Briefcase, Globe, FolderKanban, MailQuestion,
  LayoutDashboard, Wrench, Hammer, Calculator, Calendar as CalendarIcon, Users } from "lucide-react";

// Pasek modułów — TEN SAM co panel usługowy (TabsPill), Workspace aktywny.
// MVP: pozycje inne niż Workspace są „gated" (pełne uprawnienia/routing po parterze):
// 'account' → przełącznik modułów (/klient), reszta → komunikat „dostępne po przydzieleniu".
const MODULE_TABS = [
  { key: "dashboard", label: "Pulpit", icon: LayoutDashboard },
  { key: "services", label: "Moje usługi", icon: Wrench },
  { key: "workshop", label: "Warsztat & Auto", icon: Hammer },
  { key: "accounting", label: "Księgowość", icon: Calculator },
  { key: "calendar", label: "Kalendarz", icon: CalendarIcon },
  { key: "account", label: "Wybierz moduł", icon: Users },
  { key: "workspace", label: "Workspace", icon: Briefcase },
];

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

  // Kliknięcie pozycji paska (innej niż Workspace) — MVP gating.
  const handleModuleNav = (key: string) => {
    if (key === "workspace") return;
    if (key === "account") { navigate("/klient"); return; } // przełącznik modułów
    const label = MODULE_TABS.find(t => t.key === key)?.label || key;
    toast.info(`Moduł „${label}" — dostępny po przydzieleniu (wkrótce)`);
  };

  // Sub-pasek Globalny/Projekty (wewnątrz Workspace)
  const workspaceSubBar = (
    <div className="flex items-center gap-1.5 mb-4">
      <Button variant={view === "global" && !selected ? "default" : "outline"} size="sm" className="gap-1.5" onClick={openGlobal}>
        <Globe className="h-4 w-4" /> Globalny
      </Button>
      <Button variant={view === "list" && !selected ? "default" : "outline"} size="sm" className="gap-1.5" onClick={() => { setView("list"); setSelected(null); }}>
        <FolderKanban className="h-4 w-4" /> Projekty
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b shadow-sm flex-shrink-0">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <UniversalHomeButton />
          <span className="font-semibold flex items-center gap-2 shrink-0"><Briefcase className="h-5 w-5" /> Workflow</span>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        {/* Pasek modułów — ten sam TabsPill co panel; Workspace aktywny */}
        <TabsPill value="workspace" onValueChange={handleModuleNav} className="space-y-6">
          {MODULE_TABS.map(t => (
            <TabsTrigger key={t.key} value={t.key}>
              <t.icon className="h-4 w-4 mr-1.5" />{t.label}
            </TabsTrigger>
          ))}
          <TabsContent value="workspace" className="mt-6">
            {workspaceSubBar}
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
          </TabsContent>
        </TabsPill>
      </main>
    </div>
  );
}
