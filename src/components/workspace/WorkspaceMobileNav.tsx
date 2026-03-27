import { ListTodo, LayoutGrid, MessageSquare, FileText, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, Zap, BarChart3, Sparkles, Users } from "lucide-react";
import { useState } from "react";

const PRIMARY_TABS = [
  { key: "tasks", label: "Lista", icon: ListTodo },
  { key: "kanban", label: "Kanban", icon: LayoutGrid },
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "docs", label: "Docs", icon: FileText },
];

const MORE_TABS = [
  { key: "calendar", label: "Kalendarz", icon: Calendar },
  { key: "automations", label: "Automatyzacje", icon: Zap },
  { key: "workload", label: "Obciążenie", icon: BarChart3 },
  { key: "ai", label: "AI Planner", icon: Sparkles },
  { key: "members", label: "Zespół", icon: Users },
];

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function WorkspaceMobileNav({ activeTab, onTabChange }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = MORE_TABS.some(t => t.key === activeTab);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-border bg-background/95 backdrop-blur-sm safe-area-pb">
      <nav className="flex items-center justify-around h-14 px-1">
        {PRIMARY_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-0 flex-1",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
              <span className={cn("text-[10px] truncate", isActive ? "font-semibold" : "font-medium")}>
                {tab.label}
              </span>
              {isActive && (
                <div className="absolute bottom-0 w-8 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}

        {/* More button */}
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-0 flex-1",
                isMoreActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MoreHorizontal className={cn("h-5 w-5", isMoreActive && "stroke-[2.5]")} />
              <span className={cn("text-[10px] truncate", isMoreActive ? "font-semibold" : "font-medium")}>
                Więcej
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-48 p-1.5 mb-1">
            {MORE_TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => { onTabChange(tab.key); setMoreOpen(false); }}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm transition-colors",
                    activeTab === tab.key
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </nav>
    </div>
  );
}
