import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  const [isOpen, setIsOpen] = useState(false);
  const visibleTabs = tabs.filter(tab => tab.visible !== false);
  const activeTabData = visibleTabs.find(t => t.value === activeTab);

  if (visibleTabs.length === 0) return null;

  return (
    <>
      {/* Desktop: full button row */}
      <div className="hidden md:flex justify-center gap-2 mb-4 flex-wrap">
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

      {/* Mobile: collapsible dropdown */}
      <div className="md:hidden mb-4 px-4">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="default" 
              size="sm" 
              className="w-full justify-between"
            >
              <span>{activeTabData?.label || 'Wybierz'}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1 bg-background border rounded-md p-1">
            {visibleTabs
              .filter(tab => tab.value !== activeTab)
              .map((tab) => (
                <Button
                  key={tab.value}
                  onClick={() => {
                    onTabChange(tab.value);
                    setIsOpen(false);
                  }}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                >
                  {tab.label}
                </Button>
              ))}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </>
  );
};
