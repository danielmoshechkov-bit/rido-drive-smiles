import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LucideIcon } from "lucide-react";

interface TabItem {
  value: string;
  label: string;
  icon?: LucideIcon;
}

interface UniversalTabBarProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  tabs: TabItem[];
  children: React.ReactNode;
}

export const UniversalTabBar = ({ activeTab, onTabChange, tabs, children }: UniversalTabBarProps) => {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-6">
      <TabsList className="bg-gradient-hero text-primary-foreground rounded-lg p-1 shadow-purple h-7 w-full">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="data-[state=active]:bg-white data-[state=active]:text-primary rounded-md transition-colors px-3 py-1 text-sm font-medium flex-1"
          >
            <div className="flex items-center gap-2 justify-center">
              {tab.icon && <tab.icon className="h-4 w-4" />}
              <span>{tab.label}</span>
            </div>
          </TabsTrigger>
        ))}
      </TabsList>
      
      {children}
    </Tabs>
  );
};