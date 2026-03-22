import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * TabsPill — unified navigation tabs component
 * Uses CSS variable --nav-bar-color for dynamic theming (set by useUISettings hook)
 * Default fallback: #6C3CF0 (RIDO purple)
 */
export function TabsPill(props: React.ComponentProps<typeof Tabs>) {
  // Helper to check if a child is a TabsTrigger
  const isTabsTrigger = (child: React.ReactNode): boolean => {
    if (!React.isValidElement(child)) return false;
    const type = child.type as any;
    // Check for various displayName patterns
    const displayName = type?.displayName || type?.name || '';
    return displayName.includes('Trigger');
  };

  // Flatten children (handles React.Fragment from conditional rendering)
  const flattenChildren = (children: React.ReactNode): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.type === React.Fragment) {
        result.push(...flattenChildren(child.props.children));
      } else if (child) {
        result.push(child);
      }
    });
    return result;
  };

  const flatChildren = flattenChildren(props.children);

  return (
    <Tabs {...props}>
      <div 
        className="rounded-[9999px] p-1 shadow-[0_8px_30px_rgba(108,60,240,0.18)]"
        style={{ backgroundColor: 'var(--nav-bar-color, #6C3CF0)' }}
      >
        <TabsList
          className="
            flex w-full items-center gap-1 overflow-x-auto scrollbar-hide
            rounded-[9999px] px-1
            min-h-[44px]
          "
          style={{ backgroundColor: 'var(--nav-bar-color, #6C3CF0)' }}
        >
          {flatChildren.map((child, idx) => {
            if (isTabsTrigger(child)) {
              return React.cloneElement(child as React.ReactElement<{ className?: string }>, {
                key: idx,
                className:
                  "px-5 h-10 flex items-center gap-2 rounded-full text-white text-sm whitespace-nowrap transition-colors " +
                  "data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-sm " +
                  "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none",
              });
            }
            // Render non-trigger, non-content elements (e.g. Popover "Więcej") inside the bar
            if (React.isValidElement(child)) {
              const type = child.type as any;
              const displayName = type?.displayName || type?.name || '';
              if (!displayName.includes('Content')) {
                return <React.Fragment key={idx}>{child}</React.Fragment>;
              }
            }
            return null;
          })}
        </TabsList>
      </div>

      {/* Tab contents */}
      {flatChildren.filter(
        (c) => React.isValidElement(c) && ((c.type as any)?.displayName?.includes('Content') || (c.type as any)?.name?.includes('Content'))
      )}
    </Tabs>
  );
}
TabsPill.displayName = "TabsPill";

// For backward compatibility
export const TabsPillList = TabsList;
export const TabsPillTrigger = TabsTrigger;
export const TabsPillContent = TabsContent;