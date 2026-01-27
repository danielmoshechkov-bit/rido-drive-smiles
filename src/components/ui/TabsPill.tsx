import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * TabsPill — unified navigation tabs component
 * Uses CSS variable --nav-bar-color for dynamic theming (set by useUISettings hook)
 * Default fallback: #6C3CF0 (RIDO purple)
 */
export function TabsPill(props: React.ComponentProps<typeof Tabs>) {
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
          {React.Children.map(props.children as React.ReactNode, (child) => {
            if (React.isValidElement(child) && (child.type as React.ComponentType)?.displayName === "TabsTrigger") {
              return React.cloneElement(child as React.ReactElement<{ className?: string }>, {
                className:
                  "px-5 h-10 flex items-center rounded-full text-sm whitespace-nowrap transition text-white " +
                  "data-[state=active]:bg-white data-[state=active]:text-[var(--nav-bar-color,#6C3CF0)] data-[state=active]:font-semibold " +
                  "hover:bg-white/20 focus-visible:outline-none",
              });
            }
            return null;
          })}
        </TabsList>
      </div>

      {/* Tab contents */}
      {React.Children.toArray(props.children).filter(
        (c) => React.isValidElement(c) && (c.type as React.ComponentType)?.displayName === "TabsContent"
      )}
    </Tabs>
  );
}
TabsPill.displayName = "TabsPill";

// For backward compatibility
export const TabsPillList = TabsList;
export const TabsPillTrigger = TabsTrigger;
export const TabsPillContent = TabsContent;