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
    <div className="flex justify-start gap-3 border-b border-border pb-3 mb-6">
      {visibleTabs.map((tab) => (
        <Button
          key={tab.value}
          onClick={() => onTabChange(tab.value)}
          variant={activeTab === tab.value ? "default" : "outline"}
          size="default"
          className={
            activeTab === tab.value
              ? "px-6 py-2.5 rounded-full font-medium text-sm bg-primary text-white shadow-md transition-all"
              : "px-6 py-2.5 rounded-full font-medium text-sm border-2 border-primary text-primary bg-white hover:bg-primary/10 transition-all"
          }
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
};
