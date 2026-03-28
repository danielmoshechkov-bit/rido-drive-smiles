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
      {/* Desktop: pill-style row matching main nav */}
      <div className="hidden md:flex justify-center gap-1.5 mb-4 overflow-x-auto scrollbar-hide">
        {visibleTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onTabChange(tab.value)}
            className={`
              px-5 py-2 rounded-full text-[15px] font-semibold transition-all duration-200
              ${activeTab === tab.value
                ? 'text-white shadow-sm'
                : 'text-foreground hover:text-foreground'
              }
            `}
            style={activeTab === tab.value
              ? { backgroundColor: 'var(--nav-bar-color, #6C3CF0)', color: '#ffffff' }
              : undefined
            }
            onMouseEnter={(e) => {
              if (activeTab !== tab.value) {
                e.currentTarget.style.backgroundColor = '#F5C842';
                e.currentTarget.style.color = '#1a1a1a';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.value) {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.color = '';
              }
            }}
          >
            {tab.label}
          </button>
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
