import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TabItem {
  value: string;
  label: string;
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
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      
      {children}
    </Tabs>
  );
};