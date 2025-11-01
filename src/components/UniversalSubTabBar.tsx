import { Button } from "@/components/ui/button";

interface SubTab {
  value: string;
  label: string;
  visible?: boolean;
}

interface UniversalSubTabBarProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  tabs: SubTab[];
}

export const UniversalSubTabBar = ({ activeTab, onTabChange, tabs }: UniversalSubTabBarProps) => {
  const visibleTabs = tabs.filter(tab => tab.visible !== false);

  if (visibleTabs.length === 0) return null;

  return (
    <div className="flex justify-start ml-[20%] gap-2 border-b border-border pb-2 mb-4">
      {visibleTabs.map((tab) => (
        <Button
          key={tab.value}
          onClick={() => onTabChange(tab.value)}
          variant={activeTab === tab.value ? "default" : "ghost"}
          size="sm"
          className="transition-all"
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
};
